import test from 'node:test';
import assert from 'node:assert/strict';
import {convertExport, readAssignment, updateCatalog} from '../crossword-upload/converter.mjs';
import {publishPuzzle,isLive} from '../crossword-upload/publisher.mjs';

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP0cAAAAASUVORK5CYII=';
const saved = {puzzleImage:`data:image/png;base64,${png}`,rowLines:[0,0.5,1],colLines:[0,0.5,1],numbers:{'0-0':1,'0-1':2},clues:{across:{1:'తెలుగు "పదం" [అ] {ఆ}'},down:{2:'జవాబు'}}};
function html(values=saved) { return '<!doctype html><html><script>'+Object.entries(values).map(([key,value])=>`let ${key} = ${JSON.stringify(value)};`).join('\n')+'</script></html>'; }
const input = {name:'26-09-20.html',folder:'1EEEXPORTED',content:html(),token:'test-key',convert:true};
const old = {id:'260913',title:'Earlier puzzle',complete:true};
const sources = {latestFolder:'SA',folders:[{id:'EE',index:'EE/index.json',assetBase:'EE/',solutionBase:'PUZZLE/'},{id:'SA',index:'SA/index.json',assetBase:'SA/'}]};
const initialIndex = {latestCompleteId:'260913',puzzles:[old],extraSetting:true};

function mockRepository({index=initialIndex,files=[],failImage=false}={}) {
  const calls=[];
  function jsonFile(value) { return Response.json({encoding:'base64',content:Buffer.from(JSON.stringify(value)).toString('base64')}); }
  async function fetcher(url, options) {
    const body=options.body?JSON.parse(options.body):undefined;
    calls.push({url,method:options.method,body});
    if(url.includes('/git/ref/heads/')) return Response.json({object:{sha:'head'}});
    if(url.endsWith('/git/commits/head')) return Response.json({tree:{sha:'base'}});
    if(url.includes('/contents/1EEEXPORTED/')) return Response.json({}, {status:404});
    if(url.includes('/contents/DYNAMIC/EE/index.json')) return jsonFile(index);
    if(url.includes('/contents/DYNAMIC/sources.json')) return jsonFile(sources);
    if(url.includes('/contents/DYNAMIC/EE?')) return Response.json(files.map(name=>({name})));
    if(url.endsWith('/git/blobs')) return Response.json({sha:'image-sha'}, {status:failImage?403:201});
    if(url.endsWith('/git/trees')) return Response.json({sha:'tree'});
    if(url.endsWith('/git/commits')) return Response.json({sha:'commit'});
    if(url.includes('/git/refs/heads/')) return Response.json({});
    throw new Error('Unexpected URL '+url);
  }
  return {calls,fetcher};
}

test('extracts Unicode clues, quoted braces, exact grid and raster bytes without execution',()=>{
  const c=convertExport(input.content+'<script>throw new Error("must not run")</script>',input.name,input.folder);
  assert.equal(c.id,'260920');
  assert.deepEqual(c.grid,{rowLines:saved.rowLines,colLines:saved.colLines,cellNumbers:saved.numbers});
  assert.equal(c.clues.crossEntries[0].text,saved.clues.across[1]);
  assert.deepEqual(Buffer.from(c.imageBytes),Buffer.from(png,'base64'));
  assert.deepEqual(readAssignment('const rowLines = [0, 1];','rowLines'),[0,1]);
});
test('rejects executable assignments, broken grid, bad image and unmapped clues',()=>{
  assert.throws(()=>readAssignment('let clues = (() => {})();','clues'),/saved JSON/);
  assert.throws(()=>convertExport(html({...saved,rowLines:[0,0]}),input.name,input.folder),/grid lines/);
  assert.throws(()=>convertExport(html({...saved,puzzleImage:'data:image/png;base64,YWJj'}),input.name,input.folder),/file type/);
  assert.throws(()=>convertExport(html({...saved,clues:{across:{9:'unknown'},down:{}}}),input.name,input.folder),/matching grid/);
  assert.throws(()=>convertExport('<html></html>',input.name,input.folder),/missing puzzleImage/);
});
test('preserves existing metadata, other puzzles and latest choice when not requested',()=>{
  const c=convertExport(input.content,input.name,input.folder);
  const previous={id:'260920',title:'Corrected title',solutionFile:'solution.png',custom:true};
  const result=updateCatalog(c,{...initialIndex,puzzles:[previous,old]},sources,false);
  assert.equal(result.index.puzzles.length,2);
  assert.equal(result.index.puzzles[0].solutionFile,'solution.png');
  assert.equal(result.index.puzzles[0].title,'Corrected title');
  assert.equal(result.index.puzzles[0].custom,true);
  assert.equal(result.index.latestCompleteId,'260913');
  assert.equal(result.index.extraSetting,true);
  assert.deepEqual(result.sources,sources);
});
test('one commit publishes both versions, all data and the explicit latest selection',async()=>{
  const {calls,fetcher}=mockRepository();
  const result=await publishPuzzle(input,fetcher);
  const tree=calls.find(call=>call.url.endsWith('/git/trees')).body;
  assert.equal(tree.base_tree,'base');
  assert.equal(tree.tree.length,7);
  const paths=tree.tree.map(item=>item.path);
  for(const path of ['1EEEXPORTED/26-09-20.html','latest.html','DYNAMIC/EE/260920.json','DYNAMIC/EE/260920C.json','DYNAMIC/EE/260920.png','DYNAMIC/EE/index.json','DYNAMIC/sources.json']) assert(paths.includes(path));
  const catalog=JSON.parse(tree.tree.find(item=>item.path==='DYNAMIC/EE/index.json').content);
  assert.equal(catalog.latestCompleteId,'260920');
  assert(catalog.puzzles.some(item=>item.id==='260913'));
  assert.deepEqual(JSON.parse(tree.tree.find(item=>item.path==='DYNAMIC/sources.json').content).latestPuzzle,{folderId:'EE',puzzleId:'260920'});
  assert.deepEqual(calls.find(call=>call.url.endsWith('/git/blobs')).body,{content:png,encoding:'base64'});
  assert.deepEqual(calls.at(-1).body,{sha:'commit',force:false});
  assert.equal(result.appUrl,'https://crossword.kvnrao.com/?folder=EE&puzzle=260920');
  assert.equal(result.url,'https://crossword.kvnrao.com/1EEEXPORTED/26-09-20.html');
  assert.equal(result.artifacts.length,7);
});
test('protects existing converted corrections and orphan assets even without an HTML collision',async()=>{
  for(const options of [{index:{...initialIndex,puzzles:[old,{id:'260920'}]}},{files:['260920C.json']}]) {
    const {calls,fetcher}=mockRepository(options);
    await assert.rejects(publishPuzzle(input,fetcher),/saved corrections/);
    assert(calls.every(call=>call.method==='GET'));
  }
});
test('conversion or image failure cannot publish a partial HTML-only update',async()=>{
  const first=mockRepository();
  await assert.rejects(publishPuzzle({...input,content:'<html></html>'},first.fetcher),/missing/);
  assert.equal(first.calls.length,0);
  const second=mockRepository({failImage:true});
  await assert.rejects(publishPuzzle(input,second.fetcher),/refused/);
  assert(!second.calls.some(call=>call.method==='PATCH' || call.url.endsWith('/git/trees')));
});
test('both links remain unconfirmed until HTML, grid, clues, image and indexes match live',async()=>{
  const {fetcher}=mockRepository();
  const result=await publishPuzzle(input,fetcher);
  const live=async url=>{
    const artifact=result.artifacts.find(item=>url.includes('/'+item.path+'?'));
    return new Response(artifact.bytes || artifact.content);
  };
  assert.equal(await isLive(result,live),true);
  assert.equal(await isLive(result,async url=>url.includes('260920.png')?new Response('wrong image'):live(url)),false);
  assert.equal(await isLive(result,async url=>url.includes('index.json')?new Response('old catalogue'):live(url)),false);
});
