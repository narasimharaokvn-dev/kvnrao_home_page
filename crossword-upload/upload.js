import {validateFile, publishPuzzle, isLive} from './publisher.mjs?v=20260917';

const $ = id => document.getElementById(id);
let published;
let generation = 0;

function showStatus(message, error = false) {
  $('status').textContent = message;
  $('status').className = error ? 'error' : '';
}

function resetResult() {
  generation++;
  published = undefined;
  $('result').hidden = true;
  $('copy').disabled = true;
  $('copy-html').disabled = true;
  $('open').removeAttribute('href');
  $('open-html').removeAttribute('href');
  $('copy-status').textContent = '';
  showStatus('');
}

$('puzzle').addEventListener('change', () => {
  resetResult();
  const file = $('puzzle').files[0];
  $('selection').textContent = file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : 'No file selected.';
});
$('folder').addEventListener('change', resetResult);

async function checkPublished(attempts) {
  const current = published;
  const run = generation;
  if (!current) return;
  $('check').disabled = true;
  for (let i = 0; i < attempts; i++) {
    let ready = false;
    try { ready = await isLive(current); } catch { /* A publishing delay or network error is not a confirmed publication. */ }
    if (run !== generation) return;
    if (ready) {
      $('result-title').textContent = 'Your puzzle is ready to share';
      $('publish-status').textContent = current.appUrl ? 'Both versions are live. Copy the app link for the newer version, or the HTML link for the original.' : 'The uploaded HTML is live. Copy this link and send it to your team.';
      showStatus('Published successfully. Your sharing links are ready.');
      $('copy').disabled = false;
      $('copy-html').disabled = false;
      $('open').href = current.appUrl || current.url;
      $('open-html').href = current.url;
      $('check').disabled = false;
      return;
    }
    if (i + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 5000));
  }
  if (run !== generation) return;
  $('publish-status').textContent = 'Saved to GitHub, but the live file is not confirmed yet. Publishing can take a few minutes. Use “Check again” or view publishing progress below.';
  $('check').disabled = false;
}

$('upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  resetResult();
  $('controls').disabled = true;
  $('upload').textContent = 'Uploading…';
  let token = $('access-key').value.trim();
  $('access-key').value = '';
  try {
    const file = $('puzzle').files[0];
    if (!file) throw new Error('Choose your HTML puzzle first.');
    validateFile(file.name, file.size, $('folder').value);
    let content;
    try { content = new TextDecoder('utf-8', {fatal: true}).decode(await file.arrayBuffer()); }
    catch { throw new Error('Save your HTML file with UTF-8 encoding so Telugu letters display correctly.'); }
    // Parsing inside an inert template does not run scripts or request images from the selected file.
    const template = document.createElement('template');
    template.innerHTML = content;
    const localAssets = [...template.content.querySelectorAll('[src],link[href]')].some(element => {
      const value = element.getAttribute('src') ?? element.getAttribute('href') ?? '';
      return value && !/^(https?:|data:|\/\/|#)/i.test(value);
    });
    if (localAssets) throw new Error('This HTML refers to separate local files. Export a self-contained HTML with embedded images before uploading.');
    showStatus($('convert').checked ? 'Converting and saving both versions together…' : 'Saving your HTML puzzle…');
    published = await publishPuzzle({name: file.name, content, folder: $('folder').value, token, replace: $('replace').checked, latest: $('latest').checked,convert:$('convert').checked});
    showStatus('Upload saved. Checking publication…');
    $('share-link').value = published.appUrl || published.url;
    $('share-label').textContent = published.appUrl ? 'Latest app — this Sunday’s puzzle' : 'Original HTML puzzle';
    $('copy').textContent = published.appUrl ? 'Copy app link' : 'Copy HTML link';
    $('html-link').value = published.url;
    $('html-result').hidden = !published.appUrl;
    $('result-title').textContent = 'Uploaded — publishing now';
    $('publish-status').textContent = 'Checking that your puzzle is available to your team…';
    $('result').hidden = false;
    void checkPublished(24);
  } catch (error) {
    showStatus(error instanceof TypeError ? 'Could not connect to GitHub. Check your internet connection and try again.' : error.message, true);
  } finally {
    token = '';
    $('controls').disabled = false;
    $('upload').textContent = 'Upload & get links';
  }
});

$('check').addEventListener('click', () => { void checkPublished(1); });
async function copyLink(id) {
  try {
    await navigator.clipboard.writeText($(id).value);
    $('copy-status').textContent = 'Link copied. Paste it into your message to the team.';
  } catch {
    $(id).focus();
    $(id).select();
    $('copy-status').textContent = 'Select and copy the link above.';
  }
}
$('copy').addEventListener('click', () => copyLink('share-link'));
$('copy-html').addEventListener('click', () => copyLink('html-link'));
