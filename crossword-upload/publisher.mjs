import {convertExport, updateCatalog} from './converter.mjs';
export const API = 'https://api.github.com/repos/narasimharaokvn-dev/KVN-Telugu-Crossword';
export const PUBLIC = 'https://crossword.kvnrao.com';
export const FOLDERS = ['1EEEXPORTED', '2AJEXPORTED', '3SAEXPORTED', '5HEXPORTED'];

export function validateFile(name, size, folder) {
  if (!FOLDERS.includes(folder)) throw new Error('Choose one of the listed puzzle folders.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\.html$/.test(name)) {
    throw new Error('Use an HTML filename such as 260913.html. Use only letters, numbers, hyphens and underscores, with a lowercase .html extension.');
  }
  if (!size || size > 10 * 1024 * 1024) throw new Error('Choose a non-empty HTML file no larger than 10 MB.');
}

export function latestHtml(path) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=./${path}"><title>Latest KVN Crossword</title></head><body><a href="./${path}">Open the latest puzzle</a></body></html>`;
}

export async function publishPuzzle({name, content, folder, token, replace = false, latest = true, convert = true}, fetcher = fetch) {
  validateFile(name, new TextEncoder().encode(content).length, folder);
  if (!token || /\s/.test(token)) throw new Error('Enter your GitHub upload key.');
  if (!/<(?:!doctype\s+html|html|head|body)[\s>]/i.test(content)) throw new Error('This file does not look like an HTML page.');
  const path = `${folder}/${name}`;
  const converted = convert ? convertExport(content, name, folder) : null;
  async function api(endpoint, method = 'GET', body, optional = false) {
    const response = await fetcher(`${API}${endpoint}`, {
      method,
      headers: {Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10', ...(body ? {'Content-Type': 'application/json'} : {})},
      ...(body ? {body: JSON.stringify(body)} : {}),
      credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(45000)
    });
    if (optional && response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 401) throw new Error('The owner key is invalid or expired. Enter a new key.');
      if (response.status === 403) throw new Error('GitHub refused the upload. Check that the key allows Contents: Read and write for KVN-Telugu-Crossword, or try again after any rate limit clears.');
      if (response.status === 409 || response.status === 422) throw new Error('The website changed during your upload, or a repository rule prevented it. Check publishing progress and try again. Existing files were not forced over.');
      throw new Error(`GitHub could not complete the upload (${response.status}). Check your access and try again.`);
    }
    return response.json();
  }
  const head = await api('/git/ref/heads/main');
  const base = await api(`/git/commits/${head.object.sha}`);
  const existing = await api(`/contents/${path}?ref=${head.object.sha}`, 'GET', undefined, true);
  if (existing && !replace) throw new Error('A file with this name already exists. Select “Replace existing HTML and converted puzzle data” if you want to update it.');
  // Prepare all conversions and catalogue changes before making any write request.
  const tree = [{path, mode: '100644', type: 'blob', content}];
  if (latest) tree.push({path: 'latest.html', mode: '100644', type: 'blob', content: latestHtml(path)});
  let imageArtifact;
  if (converted) {
    async function readJson(path) {
      const file = await api(`/contents/${path}?ref=${head.object.sha}`);
      if (file.encoding !== 'base64' || !file.content) throw new Error('The app catalogue is unavailable. Nothing has been published.');
      return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(atob(file.content.replace(/\s/g,'')), ch=>ch.charCodeAt(0))).replace(/^\uFEFF/,''));
    }
    const indexPath = `DYNAMIC/${converted.magazine}/index.json`;
    const index = await readJson(indexPath);
    const sources = await readJson('DYNAMIC/sources.json');
    const catalog = updateCatalog(converted,index,sources,latest);
    const directory = await api(`/contents/DYNAMIC/${converted.magazine}?ref=${head.object.sha}`);
    if (!Array.isArray(directory) || directory.length >= 1000) throw new Error('Could not check the app folder for existing puzzle files. Nothing has been published.');
    const names = new Set([converted.imageFile,`${converted.id}.json`,`${converted.id}C.json`]);
    if (!replace && (index.puzzles.some(item=>item.id === converted.id) || directory.some(item=>names.has(item.name)))) {
      throw new Error('This puzzle already exists in the newer app. Select “Replace existing HTML and converted puzzle data” only if you want to replace its saved corrections.');
    }
    function jsonEntry(path, value) { tree.push({path, mode:'100644',type:'blob',content:JSON.stringify(value,null,2)+'\n'}); }
    jsonEntry(`DYNAMIC/${converted.magazine}/${converted.id}.json`,converted.grid);
    jsonEntry(`DYNAMIC/${converted.magazine}/${converted.id}C.json`,converted.clues);
    jsonEntry(indexPath,catalog.index);
    if (latest) jsonEntry('DYNAMIC/sources.json',catalog.sources);
    const imagePath = `DYNAMIC/${converted.magazine}/${converted.imageFile}`;
    const imageBlob = await api('/git/blobs','POST',{content:converted.imageBase64,encoding:'base64'});
    tree.push({path:imagePath,mode:'100644',type:'blob',sha:imageBlob.sha});
    imageArtifact = {path:imagePath,bytes:converted.imageBytes};
  }
  // One non-force commit makes the HTML, image, grid, clues and catalogues visible together.
  const createdTree = await api('/git/trees', 'POST', {base_tree: base.tree.sha, tree});
  const commit = await api('/git/commits', 'POST', {message: `Publish crossword ${path}`, tree: createdTree.sha, parents: [head.object.sha]});
  try {
    await api('/git/refs/heads/main', 'PATCH', {sha: commit.sha, force: false});
  } catch (error) {
    // A lost response can occur after GitHub accepted the commit. Do not claim failure or retry the write.
    if (error instanceof TypeError || error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error('The connection ended while confirming the upload. It may have been saved. Check GitHub publishing progress and the puzzle link before trying again.');
    }
    throw error;
  }
  return {url: `${PUBLIC}/${path}`, content, commit: commit.sha,
    appUrl:converted ? `${PUBLIC}/?folder=${converted.magazine}&puzzle=${converted.id}` : null,
    artifacts:[...tree.filter(item=>typeof item.content === 'string').map(({path,content})=>({path,content})),...(imageArtifact?[imageArtifact]:[])]};
}

export async function isLive(result, fetcher = fetch) {
  const artifacts = result.artifacts || [{url:result.url,content:result.content}];
  const matches = await Promise.all(artifacts.map(async artifact => {
    const response = await fetcher(`${artifact.url || PUBLIC+'/'+artifact.path}?verify=${result.commit}`, {
      cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(15000)
    });
    if (!response.ok) return false;
    if (artifact.bytes) {
      const live = new Uint8Array(await response.arrayBuffer());
      return live.length === artifact.bytes.length && live.every((value,i)=>value === artifact.bytes[i]);
    }
    return (await response.text()) === artifact.content;
  }));
  return matches.every(Boolean);
}
