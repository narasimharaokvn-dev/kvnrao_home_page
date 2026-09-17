export const MAGAZINES = {'1EEEXPORTED':'EE', '2AJEXPORTED':'AJ', '3SAEXPORTED':'SA', '5HEXPORTED':'HI'};

// Read JSON literals from the old exporter without executing uploaded JavaScript.
export function readAssignment(source, name) {
  const match = new RegExp(`\\b(?:let|const|var)\\s+${name}\\s*=\\s*`).exec(source);
  if (!match) throw new Error(`Cannot convert this HTML: missing ${name}. Choose an HTML file made by your old puzzle exporter.`);
  const start = match.index + match[0].length;
  const first = source[start];
  if (!['"','[','{'].includes(first)) throw new Error(`Cannot convert ${name}: a saved JSON value is required.`);
  let quoted = false, escaped = false, depth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') { quoted = false; if (first === '"') return JSON.parse(source.slice(start,i+1)); }
    } else if (ch === '"') quoted = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (!depth) return JSON.parse(source.slice(start,i+1));
    }
  }
  throw new Error(`Cannot convert this HTML: incomplete ${name}.`);
}

export function convertExport(content, name, folder) {
  const magazine = MAGAZINES[folder];
  const id = name.replace(/\.html$/, '').replace(/-/g, '');
  if (!magazine || !/^\d{6}$/.test(id)) throw new Error('For conversion, name your file YYMMDD.html or YY-MM-DD.html, for example 260920.html.');
  const image = readAssignment(content, 'puzzleImage');
  const rowLines = readAssignment(content, 'rowLines');
  const colLines = readAssignment(content, 'colLines');
  const numbers = readAssignment(content, 'numbers');
  const clues = readAssignment(content, 'clues');
  const imageMatch = typeof image === 'string' && /^data:image\/(png|gif|jpeg|jpg|webp);base64,([A-Za-z0-9+/\s]*={0,2})$/.exec(image);
  if (!imageMatch) throw new Error('Conversion needs an embedded PNG, GIF, JPEG or WebP puzzle image.');
  const imageBase64 = imageMatch[2].replace(/\s/g,'');
  let bytes;
  try { bytes = Uint8Array.from(atob(imageBase64), ch => ch.charCodeAt(0)); }
  catch { throw new Error('The embedded puzzle image is damaged. Export the HTML again.'); }
  const ext = imageMatch[1] === 'jpeg' ? 'jpg' : imageMatch[1];
  const magic = Array.from(bytes.slice(0,12));
  const validImage = ext === 'png' ? magic.slice(0,8).join(',') === '137,80,78,71,13,10,26,10'
    : ext === 'jpg' ? magic[0] === 255 && magic[1] === 216 && magic[2] === 255
    : ext === 'gif' ? String.fromCharCode(...magic.slice(0,6)).match(/^GIF8[79]a$/)
    : String.fromCharCode(...magic.slice(0,4)) === 'RIFF' && String.fromCharCode(...magic.slice(8,12)) === 'WEBP';
  if (!validImage) throw new Error('The embedded image does not match its file type. Export the HTML again.');
  for (const lines of [rowLines,colLines]) {
    if (!Array.isArray(lines) || lines.length < 2 || lines.length > 101 || lines.some((n,i)=> !Number.isFinite(n) || n < -0.02 || n > 1.02 || (i && n <= lines[i-1]))) {
      throw new Error('The saved grid lines are invalid. Correct the grid in your exporter first.');
    }
  }
  if (!numbers || Array.isArray(numbers) || typeof numbers !== 'object' || !Object.keys(numbers).length) throw new Error('The HTML has no saved clue numbers.');
  for (const [cell,number] of Object.entries(numbers)) {
    const location = /^(\d+)-(\d+)$/.exec(cell);
    if (!location || +location[1] >= rowLines.length-1 || +location[2] >= colLines.length-1 || !Number.isInteger(number) || number < 1) throw new Error('A saved clue number is outside the puzzle grid or invalid.');
  }
  const numbered = new Set(Object.values(numbers));
  function entries(direction) {
    const values = clues?.[direction];
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`Missing ${direction} clues.`);
    return Object.entries(values).map(([number,text]) => {
      if (!/^\d+$/.test(number) || !numbered.has(+number) || typeof text !== 'string' || !text.trim()) throw new Error(`An ${direction} clue is empty or has no matching grid number.`);
      return {number:+number,text};
    }).sort((a,b)=>a.number-b.number);
  }
  const clueData = {crossEntries:entries('across'), downEntries:entries('down')};
  if (!clueData.crossEntries.length && !clueData.downEntries.length) throw new Error('The HTML contains no clues.');
  return {id, magazine, imageFile:`${id}.${ext}`, imageBase64, imageBytes:bytes,
    grid:{rowLines,colLines,cellNumbers:numbers}, clues:clueData};
}

export function updateCatalog(converted, index, sources, latest) {
  const {id,magazine,imageFile,clues} = converted;
  if (!Array.isArray(index?.puzzles) || !Array.isArray(sources?.folders)) throw new Error('The app catalogue could not be read. Nothing has been published.');
  const folder = sources.folders.find(item=>item.id === magazine);
  if (!folder || folder.index !== `${magazine}/index.json` || folder.assetBase !== `${magazine}/`) throw new Error('This magazine is not configured for automatic conversion.');
  const previous = index.puzzles.find(item=>item.id === id);
  const entry = {...previous,id,title:previous?.title || `${magazine} Puzzle ${id}`,imageFile,gridFile:`${id}.json`,clueFile:`${id}C.json`,solutionFile:previous?.solutionFile ?? null,
    acrossCount:clues.crossEntries.length,downCount:clues.downEntries.length,complete:true};
  const puzzles = [...index.puzzles.filter(item=>item.id !== id),entry].sort((a,b)=>String(b.id).localeCompare(String(a.id),undefined,{numeric:true}));
  return {
    index:{...index,puzzles,latestCompleteId:latest || !index.latestCompleteId ? id : index.latestCompleteId},
    sources:latest ? {...sources,latestFolder:magazine,latestPuzzle:{folderId:magazine,puzzleId:id}} : sources
  };
}
