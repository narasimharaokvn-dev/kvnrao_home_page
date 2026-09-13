import test from 'node:test';
import assert from 'node:assert/strict';
import {publishPuzzle, validateFile, isLive, PUBLIC} from '../crossword-upload/publisher.mjs';
const input = {name:'260913.html',content:'<!doctype html><html><body>తెలుగు పదకేళి</body></html>',folder:'1EEEXPORTED',token:'test-key',latest:true};
function mockApi({exists=false,conflict=false,auth=false,uncertain=false}={}) {
  const calls=[];
  const fetcher=async (url, options) => {
    calls.push({url,...options,body:options.body && JSON.parse(options.body)});
    if(auth) return Response.json({}, {status:401});
    if(url.includes('/git/ref/heads/')) return Response.json({object:{sha:'head'}});
    if(url.endsWith('/git/commits/head')) return Response.json({tree:{sha:'base-tree'}});
    if(url.includes('/contents/')) return Response.json(exists ? {sha:'existing'} : {}, {status:exists?200:404});
    if(url.endsWith('/git/trees')) return Response.json({sha:'new-tree'});
    if(url.endsWith('/git/commits')) return Response.json({sha:'new-commit'});
    if(url.includes('/git/refs/heads/')) {
      if(uncertain) throw new TypeError('Network lost');
      return Response.json({}, {status:conflict?422:200});
    }
    throw new Error(`Unexpected URL ${url}`);
  };
  return {calls,fetcher};
}
test('publishes Telugu HTML and latest together with a non-force update',async()=>{
  const {calls,fetcher}=mockApi();
  const result=await publishPuzzle(input,fetcher);
  const tree=calls.find(x=>x.url.endsWith('/git/trees')).body;
  assert.equal(tree.base_tree,'base-tree');
  assert.equal(tree.tree[0].content,input.content);
  assert.equal(tree.tree[1].path,'latest.html');
  assert.match(tree.tree[1].content,/1EEEXPORTED\/260913.html/);
  assert.deepEqual(calls.at(-1).body,{sha:'new-commit',force:false});
  assert.equal(result.url,`${PUBLIC}/1EEEXPORTED/260913.html`);
  assert(calls.every(x=>x.credentials==='omit' && x.headers.Authorization==='Bearer test-key'));
});
test('existing files need explicit replace before writes',async()=>{
  const {calls,fetcher}=mockApi({exists:true});
  await assert.rejects(publishPuzzle(input,fetcher),/already exists/);
  assert(calls.every(x=>x.method==='GET'));
});
test('replacement can preserve current latest',async()=>{
  const {calls,fetcher}=mockApi({exists:true});
  await publishPuzzle({...input,replace:true,latest:false},fetcher);
  assert.equal(calls.find(x=>x.url.endsWith('/git/trees')).body.tree.length,1);
});
test('reject invalid names, folders, empty and oversized files',()=>{
  for(const name of ['../index.html','x.HTML','x.html/evil','x<script>.html','latest.js']) assert.throws(()=>validateFile(name,20,'1EEEXPORTED'));
  assert.throws(()=>validateFile('260913.html',20,'../'));
  assert.throws(()=>validateFile('260913.html',0,'1EEEXPORTED'));
  assert.throws(()=>validateFile('260913.html',11*1024*1024,'1EEEXPORTED'));
  validateFile('26-09-13.html',20,'1EEEXPORTED');
});
test('invalid authentication never writes',async()=>{
  const {calls,fetcher}=mockApi({auth:true});
  await assert.rejects(publishPuzzle(input,fetcher),/invalid or expired/);
  assert.equal(calls.length,1);
});
test('concurrent changes reject without force or retry',async()=>{
  const {calls,fetcher}=mockApi({conflict:true});
  await assert.rejects(publishPuzzle(input,fetcher),/changed during/);
  assert.equal(calls.filter(x=>x.method==='PATCH').length,1);
  assert.equal(calls.at(-1).body.force,false);
});
test('lost response reports uncertain publication without retry',async()=>{
  const {calls,fetcher}=mockApi({uncertain:true});
  await assert.rejects(publishPuzzle(input,fetcher),/may have been saved/);
  assert.equal(calls.filter(x=>x.method==='PATCH').length,1);
});
test('live verification rejects stale contents and sends no key',async()=>{
  const result={url:`${PUBLIC}/1EEEXPORTED/260913.html`,commit:'new-commit',content:input.content};
  assert.equal(await isLive(result,async()=>new Response('old puzzle')),false);
  assert.equal(await isLive(result,async()=>new Response('missing',{status:404})),false);
  assert.equal(await isLive(result,async(url,options)=>{
    assert.equal(options.credentials,'omit');
    assert.equal(options.headers,undefined);
    assert.match(url,/verify=new-commit/);
    return new Response(input.content);
  }),true);
});
