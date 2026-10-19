/* ============================================================
   .DOCX → PLAIN TEXT
   ------------------------------------------------------------
   The Story stage takes a synopsis as .txt, .pdf, .docx or a paste
   (PRD FR-501). A synopsis is written in Word far more often than
   anywhere else, so .docx is the format that matters most.

   NO LIBRARY, for the reasons pdf-text.js gives at length: the CSP
   refuses blob: workers, a megabyte outside the service worker's
   precache is an import that fails on location, and this needs one
   thing from the file. A .docx is a ZIP; the text is in
   `word/document.xml`; ZIP entries are raw DEFLATE, which
   `DecompressionStream('deflate-raw')` inflates natively.

   WHAT IT READS: paragraphs, tabs, line breaks and the text runs
   inside them, including text in tables (each cell is paragraphs
   too). WHAT IT DOES NOT: headers, footers, footnotes, comments,
   tracked deletions (`w:delText` is skipped on purpose — deleted text
   is not the synopsis) and anything inside a text box drawn as a
   shape. Encrypted documents are not ZIPs at all and are refused by
   name rather than reported as corrupt.

   Regex rather than DOMParser for the XML, deliberately: it keeps
   this module runnable in Node, where `npm run test:pdf`'s siblings
   live, and WordprocessingML text is flat enough that the only
   structure needed is "where does a paragraph end".
   ============================================================ */

const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

/** List ZIP entries from the central directory. */
function entries(bytes) {
  // End of central directory: signature 0x06054b50, within the last
  // 64KB + 22 bytes (the comment may be up to 65535 bytes).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(bytes, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = u16(bytes, eocd + 10);
  let p = u32(bytes, eocd + 16);
  const out = [];
  const dec = new TextDecoder();
  for (let i = 0; i < count && p + 46 <= bytes.length; i++) {
    if (u32(bytes, p) !== 0x02014b50) break;
    const method = u16(bytes, p + 10);
    const csize = u32(bytes, p + 20);
    const nlen = u16(bytes, p + 28), xlen = u16(bytes, p + 30), clen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
    out.push({ name, method, csize, local });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(bytes, e) {
  // Local header: the name/extra lengths here can differ from the
  // central directory's, so the data offset is computed from THIS one.
  if (u32(bytes, e.local) !== 0x04034b50) return null;
  const nlen = u16(bytes, e.local + 26), xlen = u16(bytes, e.local + 28);
  const start = e.local + 30 + nlen + xlen;
  const data = bytes.subarray(start, start + e.csize);
  if (e.method === 0) return data;
  if (e.method === 8) return inflateRaw(data);
  return null;
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decodeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return ENT[e.toLowerCase()] || _;
});

/** WordprocessingML → text, one line per paragraph. Exported for tests. */
export function documentXmlToText(xml) {
  const body = (xml.match(/<w:body[\s\S]*<\/w:body>/) || [xml])[0];
  // An empty paragraph is written self-closing, <w:p/>, and has no
  // </w:p> to split on — expand it first or it merges into the next.
  const paras = body.replace(/<w:p(\s[^>]*)?\/>/g, '<w:p></w:p>').split(/<\/w:p>/);
  const lines = [];
  for (const p of paras) {
    let line = '';
    // Walk the tokens we care about in document order. A break may
    // carry attributes (<w:br w:type="page"/>); a tab may not, because
    // an attributed <w:tab …/> is a tab STOP in <w:pPr>, not a tab.
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\s*\/>/g;
    let m;
    while ((m = re.exec(p))) {
      if (m[1] !== undefined) line += decodeXml(m[1]);
      else if (m[0].startsWith('<w:tab')) line += '\t';
      else line += '\n';
    }
    if (/<w:p[\s>]/.test(p) || line) lines.push(line);
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ---- PARAGRAPHS, with what a screenplay needs from each ----------
   The screenplay importer (src/lib/script-import.js) needs more than
   the text: a Word screenplay says what each line IS through its
   paragraph style ("Scene Heading", "Character" — Final Draft's own
   .docx export and every Word screenplay template name them so), and
   one typed by hand says it through the indent. So for each paragraph:
     text      as documentXmlToText reads it (tabs, breaks)
     style     the style's NAME from word/styles.xml, else its id, else ''
     indL      the left indent in twips (1440 = one inch), 0 when unset
     jc        the alignment: '', 'left', 'center', 'right', 'both'…
     pageBreak a page break before or inside it
   Regex, like the rest of this file, so it runs in Node. */
const attr = (tag, name) => {
  const m = new RegExp('\\bw:' + name + '="([^"]*)"').exec(tag || '');
  return m ? decodeXml(m[1]) : '';
};

/** word/styles.xml → { styleId: display name }. */
export function styleNames(xml) {
  const out = {};
  const re = /<w:style\b([^>]*)>([\s\S]*?)<\/w:style>/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const id = attr(m[1], 'styleId');
    const name = attr((/<w:name\b[^>]*\/?>/.exec(m[2]) || [''])[0], 'val');
    if (id) out[id] = name || id;
  }
  return out;
}

/** WordprocessingML → [{ text, style, indL, jc, pageBreak }]. Exported for tests. */
export function documentXmlToParagraphs(xml, names = {}) {
  const body = (String(xml || '').match(/<w:body[\s\S]*<\/w:body>/) || [String(xml || '')])[0];
  const paras = body.replace(/<w:p(\s[^>]*)?\/>/g, '<w:p></w:p>').split(/<\/w:p>/);
  const out = [];
  for (const p of paras) {
    if (!/<w:p[\s>]/.test(p)) continue;
    const pPr = (/<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(p) || ['', ''])[1];
    const styleId = attr((/<w:pStyle\b[^>]*\/?>/.exec(pPr) || [''])[0], 'val');
    const ind = (/<w:ind\b[^>]*\/?>/.exec(pPr) || [''])[0];
    const indL = parseInt(attr(ind, 'left') || attr(ind, 'start') || '0', 10) || 0;
    const jc = attr((/<w:jc\b[^>]*\/?>/.exec(pPr) || [''])[0], 'val');
    const pageBreak = /<w:pageBreakBefore(?:\s[^>]*)?\/>/.test(pPr) && !/w:val="(?:0|false)"/.test((/<w:pageBreakBefore[^>]*>/.exec(pPr) || [''])[0])
      || /<w:br\b[^>]*w:type="page"/.test(p);
    let text = '';
    const runs = p.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '');
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br(?:\s[^>]*)?\/>|<w:cr\s*\/>/g;
    let m;
    while ((m = re.exec(runs))) {
      if (m[1] !== undefined) text += decodeXml(m[1]);
      else if (m[0].startsWith('<w:tab')) text += '\t';
      else if (!/w:type="page"/.test(m[0])) text += '\n';
    }
    out.push({ text, style: names[styleId] || styleId || '', indL, jc, pageBreak });
  }
  return out;
}

/* Open the ZIP and hand back the named parts, or a refusal sentence. */
async function openDocx(buffer, want) {
  const bytes = new Uint8Array(buffer);
  if (u32(bytes, 0) === 0xe011cfd0) {
    return { fatal: 'This .docx is password-protected (or is an old binary .doc). Remove the password, or save it as .docx or .txt, and import that.' };
  }
  if (u32(bytes, 0) !== 0x04034b50) {
    return { fatal: 'That file is not a .docx — it does not have the structure Word writes. Try saving it again as .docx, or as plain text.' };
  }
  const list = entries(bytes) || [];
  const doc = list.find((e) => e.name === 'word/document.xml');
  if (!doc) return { fatal: 'No document body was found inside that .docx. Open it in Word or Google Docs and save it again.' };
  const parts = {};
  for (const name of want) {
    const e = list.find((x) => x.name === name);
    if (!e) continue;
    let raw;
    try { raw = await readEntry(bytes, e); } catch (err) { raw = null; }
    if (!raw && name === 'word/document.xml') {
      return { fatal: 'The text inside that .docx could not be decompressed. Save it again as .docx or .txt and import that.' };
    }
    if (raw) parts[name] = new TextDecoder().decode(raw);
  }
  return { parts };
}

/** Read a .docx ArrayBuffer. Returns { text } or { fatal: sentence }. */
export async function extractDocxText(buffer) {
  const r = await openDocx(buffer, ['word/document.xml']);
  if (r.fatal) return r;
  const text = documentXmlToText(r.parts['word/document.xml']);
  if (!text.trim()) return { fatal: 'That .docx has no text in its body — if the synopsis is in a text box or an image, copy it out and paste it instead.' };
  return { text };
}

/** Read a .docx ArrayBuffer as paragraphs. Returns { paras } or { fatal }. */
export async function extractDocxParagraphs(buffer) {
  const r = await openDocx(buffer, ['word/document.xml', 'word/styles.xml']);
  if (r.fatal) return r;
  const paras = documentXmlToParagraphs(r.parts['word/document.xml'], styleNames(r.parts['word/styles.xml']));
  if (!paras.some((p) => p.text.trim())) {
    return { fatal: 'That .docx has no text in its body — if the script is in a text box or an image, copy it out and paste it instead.' };
  }
  return { paras };
}

export default { extractDocxText, documentXmlToText, extractDocxParagraphs, documentXmlToParagraphs, styleNames };
