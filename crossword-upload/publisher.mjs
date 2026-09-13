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

export async function publishPuzzle({name, content, folder, token, replace = false, latest = true}, fetcher = fetch) {
  validateFile(name, new TextEncoder().encode(content).length, folder);
  if (!token || /\s/.test(token)) throw new Error('Enter your GitHub upload key.');
  if (!/<(?:!doctype\s+html|html|head|body)[\s>]/i.test(content)) throw new Error('This file does not look like an HTML page.');
  const path = `${folder}/${name}`;
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
  if (existing && !replace) throw new Error('A file with this name already exists. Select “Replace an existing file with the same name” if you want to update it.');
  // Publish the puzzle and latest redirect together, retaining every other file.
  const tree = [{path, mode: '100644', type: 'blob', content}];
  if (latest) tree.push({path: 'latest.html', mode: '100644', type: 'blob', content: latestHtml(path)});
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
  return {url: `${PUBLIC}/${path}`, content, commit: commit.sha};
}

export async function isLive(result, fetcher = fetch) {
  const response = await fetcher(`${result.url}?verify=${result.commit}`, {
    cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000)
  });
  return response.ok && (await response.text()) === result.content;
}
