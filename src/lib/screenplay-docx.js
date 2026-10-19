/* ============================================================
   SCREENPLAY → WORD (.docx)
   ------------------------------------------------------------
   A Word file a producer, a script supervisor or a writing partner
   without the studio can open and edit, laid out the way the PDF is:
   12pt Courier New on US Letter, a 1.5in gutter and a 6in text block,
   every element at the indent src/lib/screenplay-export.js GEOMETRY
   gives it (characters at 10 an inch → twips, 144 each). Each element
   is a paragraph wearing a NAMED style — Scene Heading, Action,
   Character, Parenthetical, Dialogue, Transition, Shot — which are the
   names Final Draft and the Word screenplay templates use, so the file
   comes back through our own importer (script-import.js DOCX_TYPE)
   with every type intact, and a Word user can restyle it in one place.

   Capitals and brackets are printed as on the page (printedText), not
   left to a style's caps setting, so the text survives a copy-paste
   out of Word. Dual dialogue is written one speech after the other:
   Word has no side-by-side speeches short of a table, and a table is
   what breaks every re-import.

   Pure apart from the typesetter's tables: no DOM, no storage (test:docx).
     toDOCX(doc, meta) → Uint8Array
   ============================================================ */
import { GEOMETRY, printedText, titlePageOf } from './screenplay-export.js';
import { zipStore } from './zip-write.js';

const TWIPS_PER_CHAR = 144;          // 10 characters an inch
const LINE = 240;                    // 12pt, single spaced, in twips
const STYLE_OF = {
  scene: ['SceneHeading', 'Scene Heading'], action: ['Action', 'Action'], character: ['Character', 'Character'],
  paren: ['Parenthetical', 'Parenthetical'], dialogue: ['Dialogue', 'Dialogue'],
  transition: ['Transition', 'Transition'], shot: ['Shot', 'Shot']
};

/* Every text value — the elements, the title page, the core.xml title —
   goes through here. XML 1.0 forbids the C0 controls other than tab, LF
   and CR, U+FFFE/U+FFFF and an unpaired surrogate, and ONE of them makes
   the part not well-formed, which Word reports as a corrupt file and
   nothing else. A vertical tab or form feed arrives by paste or import
   and nothing on input strips it, so it comes off here — dropped, since
   XML 1.0 has no escape for them either. With the u flag the surrogate
   range matches only an UNPAIRED half; a pair is one astral character. */
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDFFF]/gu;
const esc = (s) => String(s ?? '').replace(XML_ILLEGAL, '')
  .replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

/* A run of text, with line breaks inside an element kept as <w:br/>. */
function runs(text) {
  return String(text).split('\n').map((line, i) =>
    (i ? '<w:r><w:br/></w:r>' : '') + '<w:r><w:t xml:space="preserve">' + esc(line) + '</w:t></w:r>').join('');
}
const para = (styleId, text, extra = '') =>
  '<w:p><w:pPr><w:pStyle w:val="' + styleId + '"/>' + extra + '</w:pPr>' + runs(text) + '</w:p>';

function styleXml(type) {
  const g = GEOMETRY[type];
  const [id, name] = STYLE_OF[type];
  const left = g.indent * TWIPS_PER_CHAR;
  const right = Math.max(0, (60 - g.indent - g.width) * TWIPS_PER_CHAR);
  const before = g.blankBefore * LINE;
  const next = { scene: 'Action', action: 'Action', character: 'Dialogue', paren: 'Dialogue', dialogue: 'Action', transition: 'SceneHeading', shot: 'Action' }[type];
  return '<w:style w:type="paragraph" w:customStyle="1" w:styleId="' + id + '">'
    + '<w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="' + next + '"/><w:qFormat/>'
    + '<w:pPr>' + (type === 'scene' || type === 'character' ? '<w:keepNext/>' : '')
    + '<w:spacing w:before="' + before + '" w:after="0" w:line="' + LINE + '" w:lineRule="exact"/>'
    + '<w:ind w:left="' + left + '" w:right="' + right + '"/>'
    + (g.align === 'right' ? '<w:jc w:val="right"/>' : '') + '</w:pPr>'
    + '</w:style>';
}

function stylesPart() {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr>'
    /* Courier New, not Courier Prime: it is on every machine Word runs
       on, and the two share the metrics the page count is built on. A
       face Word does not have is swapped for whatever it likes. */
    + '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New" w:eastAsia="Courier New"/>'
    + '<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US"/>'
    + '</w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="' + LINE + '" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
    + '<w:style w:type="paragraph" w:customStyle="1" w:styleId="TitlePage"><w:name w:val="Title Page"/><w:basedOn w:val="Normal"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>'
    + Object.keys(STYLE_OF).map(styleXml).join('')
    + '</w:styles>';
}

const SECTION = '<w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
  + '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/>'
  + '</w:sectPr>';

function titleParas(doc, meta) {
  const tp = titlePageOf(doc, meta);
  if (!tp) return [];
  const out = [];
  const blank = () => out.push('<w:p><w:pPr><w:pStyle w:val="TitlePage"/></w:pPr></w:p>');
  for (let i = 0; i < 18; i++) blank();
  out.push(para('TitlePage', tp.title.toUpperCase()));
  if (tp.credit) { blank(); out.push(para('TitlePage', tp.credit)); }
  if (tp.author) { blank(); out.push(para('TitlePage', tp.author)); }
  if (tp.source) { blank(); out.push(para('TitlePage', tp.source)); }
  for (let i = 0; i < 14; i++) blank();
  if (tp.contact) out.push(para('Normal', tp.contact));
  if (tp.draft || tp.date) out.push(para('Normal', [tp.draft, tp.date].filter(Boolean).join('\n'), '<w:jc w:val="right"/>'));
  // The script starts on the next page.
  out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  return out;
}

function documentPart(doc, meta) {
  const body = titleParas(doc, meta);
  for (const el of (doc && doc.elements) || []) {
    const text = printedText(el);
    if (!text) continue;
    const type = STYLE_OF[el.type] ? el.type : 'action';
    body.push(para(STYLE_OF[type][0], text));
  }
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<w:body>' + body.join('') + SECTION + '</w:body></w:document>';
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
  + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
  + '<Default Extension="xml" ContentType="application/xml"/>'
  + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
  + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
  + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
  + '</Types>';
const ROOT_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
  + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
  + '</Relationships>';
const DOC_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
  + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
  + '</Relationships>';
const core = (title) => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"'
  + ' xmlns:dc="http://purl.org/dc/elements/1.1/">'
  + '<dc:title>' + esc(title) + '</dc:title></cp:coreProperties>';

/** The script as a .docx file's bytes. */
export function toDOCX(doc, meta = {}) {
  return zipStore([
    ['[Content_Types].xml', CONTENT_TYPES],
    ['_rels/.rels', ROOT_RELS],
    ['docProps/core.xml', core(String(meta.title || 'Untitled'))],
    ['word/_rels/document.xml.rels', DOC_RELS],
    ['word/document.xml', documentPart(doc, meta)],
    ['word/styles.xml', stylesPart()]
  ]);
}

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default { toDOCX, DOCX_MIME };
