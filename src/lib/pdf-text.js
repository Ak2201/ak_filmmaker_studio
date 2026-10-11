/* ============================================================
   PDF → LAID-OUT TEXT
   ------------------------------------------------------------
   A screenplay circulates as a PDF. Not as Fountain, not as an
   .fdx — as the PDF somebody emailed the crew. script-import.js
   reads the other three and could not read the one that actually
   arrives, which made "import your script" a promise with a hole
   in it.

   WHY THERE IS NO PDF LIBRARY HERE. Three reasons, in order of
   how much they cost:

   1. THE CONTENT SECURITY POLICY. vercel.json ships
      `script-src 'self'` with no worker-src, so a worker falls
      back to 'self' and a blob: worker — which is how most
      bundled PDF engines start theirs — is refused by the
      browser. The failure arrives as a console error and an
      import that silently does nothing.
   2. THE OFFLINE PROMISE. This is a local-first app with a
      service worker precaching 68 entries. A megabyte of engine
      that is not in that manifest is an import that works at
      the desk and fails on location, which is where a call sheet
      gets read.
   3. THE SHAPE OF THE JOB. A general PDF engine rasterises,
      renders, handles forms, annotations, JavaScript actions and
      colour management. This needs one thing: where each run of
      text sits on the page. That is a small fraction of a PDF
      reader and it is the fraction with no security surface.

   `DecompressionStream('deflate')` is native in every engine this
   app targets, which is the piece that used to require a library.
   Everything else below is parsing.

   WHAT THIS IS NOT. It is not a PDF viewer and it will not open
   every PDF. It handles the uncompressed and Flate-compressed
   text of a text-based PDF, which is what every screenwriting
   application emits. It cannot read:

     · an ENCRYPTED PDF — refused by name, not mangled.
     · a SCANNED one — a photograph of a script has no text in it
       at all, and the honest answer is to say so rather than
       import forty blank pages.
     · a font with no /ToUnicode map and a non-standard encoding,
       where the bytes are glyph indices and nothing in the file
       says which glyph is which letter.

   Each of those is DETECTED AND REFUSED. That is the whole of the
   safety argument: a text extractor that half-works produces
   mojibake, and mojibake imported into a writing tool is worse
   than an import that declined. `extractLayoutText` returns
   `fatal` with a sentence a person can act on, and the caller
   shows it instead of a script.

   THE OUTPUT IS A SCREENPLAY TEXT FILE, deliberately. A PDF has
   no element types — there is no "this is dialogue" anywhere in
   the file. What it has is POSITIONS, and in a screenplay the
   position IS the type: a cue sits at 3.7in, a parenthetical at
   3.1in, dialogue at 2.5in, action at 1.5in. Those columns are
   exactly what parseText() in script-import.js already reads, and
   it already handles a file whose gutter is baked in — which is
   what a PDF's absolute coordinates give you. So this module
   reconstructs the page as indented text and hands it to the
   parser that has been reading indented text all along. No second
   classifier, and no second place for the two to disagree.
   ============================================================ */

/* Latin-1 maps every byte 0x00-0xFF to the code point of the same
   value, which is what makes it the right lens for PDF structure:
   the syntax is ASCII, the binary is preserved byte-for-byte, and
   a string index is a byte offset. UTF-8 would silently merge
   byte pairs and every offset after the first high byte would be
   wrong. */
const LATIN1 = new TextDecoder('latin1');

/* ------------------------------------------------------------
   INFLATE
   ------------------------------------------------------------ */
/* PDF's FlateDecode is zlib (RFC 1950) per the specification, but
   files in the wild carry raw deflate often enough that trying
   only one of them loses real documents.

   TRAILING BYTES ARE THE WHOLE PROBLEM HERE, and they are not an
   edge case — they are what every PDF contains. DecompressionStream
   throws "Trailing junk found after the end of the compressed
   stream" if so much as one byte follows the payload, and the
   specification says the EOL marker before `endstream` is NOT part
   of the stream data, so practically every writer emits one. A
   reader that does not trim it decodes nothing in any compressed
   PDF ever made — which is what this did until a test built one.

   scanObjects trims the single spec EOL. This trims anything else
   that is left, one byte at a time from the end, because a writer
   that pads with two newlines or a space is still emitting a file
   every other reader opens. Four attempts, not a loop over the
   whole buffer: past that it is not padding, it is a stream this
   module has misread, and grinding through a megabyte of retries
   to prove it is its own kind of bug. */
async function inflate(bytes) {
  for (const format of ['deflate', 'deflate-raw']) {
    for (let trim = 0; trim < 4; trim++) {
      const slice = trim ? bytes.subarray(0, bytes.length - trim) : bytes;
      if (!slice.length) break;
      try {
        const stream = new Response(
          new Blob([slice]).stream().pipeThrough(new DecompressionStream(format))
        );
        return new Uint8Array(await stream.arrayBuffer());
      } catch (e) { /* trim one more, then try the other framing */ }
    }
  }
  return null;
}

/* ------------------------------------------------------------
   OBJECTS
   ------------------------------------------------------------
   Scanned, not indexed through the cross-reference table.

   The xref is the "correct" way in and it is the brittle one: a
   PDF that has been appended to, linearised, or repaired has an
   xref that disagrees with the file, and every reader in the
   world already carries a rebuild-by-scanning path for exactly
   that case. Since this module reads whole documents rather than
   seeking into them, the rebuild path is the only path, and one
   code path that always runs beats two where the rare one rots.
   ------------------------------------------------------------ */
const OBJ_RE = /(\d+)\s+(\d+)\s+obj\b/g;

function scanObjects(bytes, src) {
  const objects = new Map();
  OBJ_RE.lastIndex = 0;
  let m;
  while ((m = OBJ_RE.exec(src))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    /* The object ends at `endobj` — but a stream's bytes can
       contain anything, including that word. So a stream is
       measured first and the search for `endobj` starts after it. */
    const streamAt = src.indexOf('stream', bodyStart);
    let end = src.indexOf('endobj', bodyStart);
    let stream = null;
    if (streamAt >= 0 && (end < 0 || streamAt < end)) {
      // Past `stream` comes CRLF, LF or CR, then the bytes.
      let p = streamAt + 6;
      if (src[p] === '\r') p++;
      if (src[p] === '\n') p++;
      let endStream = src.indexOf('endstream', p);
      if (endStream >= 0) {
        /* The specification is explicit that the EOL before
           `endstream` is a delimiter and not part of the data, so
           it comes off here rather than being left for the filter
           to choke on. */
        let dataEnd = endStream;
        if (src[dataEnd - 1] === '\n') dataEnd--;
        if (src[dataEnd - 1] === '\r') dataEnd--;
        stream = bytes.subarray(p, Math.max(p, dataEnd));
        end = src.indexOf('endobj', endStream);
      }
    }
    if (end < 0) end = src.length;
    objects.set(num, { num, dict: src.slice(bodyStart, streamAt >= 0 && streamAt < end ? streamAt : end), stream });
  }
  return objects;
}

/* ------------------------------------------------------------
   DICTIONARY READING
   ------------------------------------------------------------
   Enough of the syntax to find the keys this module needs, and no
   more. A full object parser would be a lot of code to answer
   questions nobody here asks.
   ------------------------------------------------------------ */
function dictGet(dict, key) {
  const i = dict.indexOf('/' + key);
  if (i < 0) return null;
  let p = i + key.length + 1;
  while (p < dict.length && /\s/.test(dict[p])) p++;
  return dict.slice(p, p + 400);
}

function dictNumber(dict, key) {
  const v = dictGet(dict, key);
  if (!v) return null;
  const m = /^-?\d+(\.\d+)?/.exec(v.trim());
  return m ? Number(m[0]) : null;
}

/** `/Key 12 0 R` → 12. */
function dictRef(dict, key) {
  const v = dictGet(dict, key);
  if (!v) return null;
  const m = /^\s*(\d+)\s+\d+\s+R/.exec(v);
  return m ? Number(m[1]) : null;
}

/** Every `N 0 R` inside the value of a key, in order. */
function dictRefs(dict, key) {
  const v = dictGet(dict, key);
  if (!v) return [];
  const out = [];
  const re = /(\d+)\s+\d+\s+R/g;
  let m;
  // Stop at the end of the array so a following key's refs are not swept in.
  const close = v.indexOf(']');
  const scope = close >= 0 ? v.slice(0, close) : v;
  while ((m = re.exec(scope))) out.push(Number(m[1]));
  return out;
}

function hasName(dict, key, name) {
  const v = dictGet(dict, key);
  return !!v && new RegExp('^\\s*/' + name + '\\b').test(v);
}

/* Decode a stream the way its /Filter says to. Only the two that
   matter for text: none, and Flate. An LZW or JBIG2 content
   stream is not something a screenwriting application emits, and
   guessing at one would produce noise rather than an error. */
async function streamBytes(obj) {
  if (!obj || !obj.stream) return null;
  const filter = dictGet(obj.dict, 'Filter') || '';
  if (/FlateDecode/.test(filter)) {
    const out = await inflate(obj.stream);
    if (!out) return null;
    /* A Flate stream may be predicted (PNG row filters). Content
       streams essentially never are — it is a cross-reference and
       image convention — so this is detected and declined rather
       than silently producing shifted bytes. */
    const parms = dictGet(obj.dict, 'DecodeParms') || '';
    if (/\/Predictor\s*(1[0-9]|[2-9])/.test(parms)) return null;
    return out;
  }
  if (/\/(LZW|RunLength|CCITT|DCT|JPX|JBIG2)Decode/.test(filter)) return null;
  return obj.stream;
}

/* ------------------------------------------------------------
   OBJECT STREAMS (PDF 1.5+)
   ------------------------------------------------------------
   Everything that is not a stream can be packed into one, and
   macOS Quartz — which is what a PDF printed from anything on a
   Mac goes through — does exactly that. A reader that skips
   ObjStm sees a file with no page tree and no fonts in it, which
   presents as "this PDF has no text".
   ------------------------------------------------------------ */
async function expandObjectStreams(objects) {
  for (const obj of [...objects.values()]) {
    if (!hasName(obj.dict, 'Type', 'ObjStm')) continue;
    const data = await streamBytes(obj);
    if (!data) continue;
    const text = LATIN1.decode(data);
    const n = dictNumber(obj.dict, 'N') || 0;
    const first = dictNumber(obj.dict, 'First') || 0;
    const header = text.slice(0, first).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const num = header[i * 2];
      const off = header[i * 2 + 1];
      if (!Number.isFinite(num) || !Number.isFinite(off)) continue;
      const nextOff = i + 1 < n ? header[i * 2 + 3] : text.length - first;
      // A packed object never overrides a real one: an incremental
      // update's later definition is the live one.
      if (objects.has(num)) continue;
      objects.set(num, { num, dict: text.slice(first + off, first + nextOff), stream: null });
    }
  }
}

/* ------------------------------------------------------------
   THE PAGE TREE
   ------------------------------------------------------------
   Order matters more here than anywhere else in the file: pages
   out of order is a script out of order, which is the kind of
   damage that looks like the writer's fault.
   ------------------------------------------------------------ */
function pagesInOrder(objects) {
  let root = null;
  for (const obj of objects.values()) {
    if (hasName(obj.dict, 'Type', 'Catalog')) { root = dictRef(obj.dict, 'Pages'); break; }
  }
  const out = [];
  const seen = new Set();
  const walk = (num, depth) => {
    if (num == null || seen.has(num) || depth > 50) return;
    seen.add(num);
    const node = objects.get(num);
    if (!node) return;
    if (hasName(node.dict, 'Type', 'Page')) { out.push(node); return; }
    for (const kid of dictRefs(node.dict, 'Kids')) walk(kid, depth + 1);
  };
  walk(root, 0);
  if (out.length) return out;
  /* No catalog, or a tree that led nowhere. Object number order is
     the fallback because writers emit pages sequentially; it is a
     guess, and the caller says so in a warning. */
  return [...objects.values()]
    .filter((o) => hasName(o.dict, 'Type', 'Page'))
    .sort((a, b) => a.num - b.num);
}

/* Inherited attributes: /Resources may live on an ancestor rather
   than on the page, which is legal and common. */
function inherited(objects, page, key, depth = 0) {
  if (!page || depth > 50) return null;
  const own = dictGet(page.dict, key);
  if (own) return { dict: page.dict, value: own, ref: dictRef(page.dict, key) };
  const parent = dictRef(page.dict, 'Parent');
  return parent != null ? inherited(objects, objects.get(parent), key, depth + 1) : null;
}

/* ------------------------------------------------------------
   FONTS — bytes to letters
   ------------------------------------------------------------
   A PDF string holds CHARACTER CODES, not Unicode. What a code
   means is the font's business, and there are two cases:

     · a /ToUnicode CMap, which states it outright. Every
       screenwriting application embeds one, because without it
       the PDF cannot be searched or copied out of.
     · a simple font with a standard encoding, where the code is
       its Latin-1 value and nothing needs translating.

   A font with neither is a subset whose codes are glyph indices
   in an embedded font program. Those are unreadable without
   parsing the font itself, and this module reports them rather
   than emitting the glyph numbers as if they were letters.
   ------------------------------------------------------------ */
function parseToUnicode(text) {
  const map = new Map();
  let twoByte = false;

  const ranges = /begincodespacerange([\s\S]*?)endcodespacerange/g;
  let m;
  while ((m = ranges.exec(text))) {
    // <0000> <ffff> is two bytes per code; <00> <ff> is one.
    const hex = m[1].match(/<([0-9a-fA-F]+)>/g) || [];
    for (const h of hex) if (h.length - 2 >= 4) twoByte = true;
  }

  const chars = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = chars.exec(text))) {
    const pairs = m[1].match(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g) || [];
    for (const pair of pairs) {
      const p = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/.exec(pair);
      if (!p) continue;
      if (p[1].length >= 4) twoByte = true;
      map.set(parseInt(p[1], 16), hexToString(p[2]));
    }
  }

  const bfr = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = bfr.exec(text))) {
    const body = m[1];
    /* Two shapes: <lo> <hi> <dst> walks the destination up with
       the code, and <lo> <hi> [<a> <b> …] names each one. */
    const simple = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g;
    let r;
    while ((r = simple.exec(body))) {
      const lo = parseInt(r[1], 16), hi = parseInt(r[2], 16);
      if (r[1].length >= 4) twoByte = true;
      const base = parseInt(r[3], 16);
      if (!Number.isFinite(base) || hi - lo > 65535) continue;
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCodePoint(base + (c - lo)));
    }
    const listed = /<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g;
    while ((r = listed.exec(body))) {
      const lo = parseInt(r[1], 16);
      if (r[1].length >= 4) twoByte = true;
      const items = r[3].match(/<([0-9a-fA-F]*)>/g) || [];
      items.forEach((it, i) => map.set(lo + i, hexToString(it.slice(1, -1))));
    }
  }
  return { map, twoByte };
}

function hexToString(hex) {
  let out = '';
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const code = parseInt(hex.slice(i, i + 4), 16);
    if (Number.isFinite(code)) out += String.fromCodePoint(code);
  }
  return out;
}

async function buildFontMap(objects, page) {
  const fonts = new Map();
  const res = inherited(objects, page, 'Resources');
  if (!res) return fonts;
  const resDict = res.ref != null ? (objects.get(res.ref) || {}).dict || '' : res.value;
  const fontEntry = dictGet(resDict, 'Font');
  if (!fontEntry) return fonts;
  const fontDict = (() => {
    const ref = dictRef(resDict, 'Font');
    if (ref != null) return (objects.get(ref) || {}).dict || '';
    return fontEntry;
  })();
  const re = /\/([A-Za-z0-9#+._-]+)\s+(\d+)\s+\d+\s+R/g;
  let m;
  while ((m = re.exec(fontDict))) {
    const name = m[1];
    const obj = objects.get(Number(m[2]));
    if (!obj) continue;
    const toUniRef = dictRef(obj.dict, 'ToUnicode');
    let decoder = null;
    if (toUniRef != null) {
      const data = await streamBytes(objects.get(toUniRef));
      if (data) decoder = parseToUnicode(LATIN1.decode(data));
    }
    const type0 = hasName(obj.dict, 'Subtype', 'Type0');
    const symbolic = !decoder && !/\/(WinAnsi|MacRoman|Standard)Encoding/.test(obj.dict)
      && /\/FontFile\d?\b/.test(obj.dict);
    fonts.set(name, {
      decoder,
      twoByte: (decoder && decoder.twoByte) || type0,
      /* A subset font with no ToUnicode and no named encoding is
         the unreadable case. Flagged rather than guessed at. */
      opaque: symbolic
    });
  }
  return fonts;
}

/* ------------------------------------------------------------
   CONTENT STREAMS
   ------------------------------------------------------------
   The text operators, a text matrix, and a CTM stack. Everything
   else — colour, paths, images, clipping — is skipped, because
   none of it moves a letter.
   ------------------------------------------------------------ */
function mul(a, b) {
  // 2x3 affine, PDF order: a applied then b.
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
    a[4] * b[0] + a[5] * b[2] + b[4],
    a[4] * b[1] + a[5] * b[3] + b[5]
  ];
}

/** A PDF literal string, with the escapes the specification lists. */
function readLiteral(src, start) {
  let depth = 1;
  let out = [];
  let i = start;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      const simple = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
      if (n in simple) { out.push(simple[n]); i += 2; continue; }
      const oct = /^[0-7]{1,3}/.exec(src.slice(i + 1, i + 4));
      if (oct) { out.push(String.fromCharCode(parseInt(oct[0], 8))); i += 1 + oct[0].length; continue; }
      if (n === '\n') { i += 2; continue; }            // line continuation
      i += 2; continue;
    }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (!depth) { i++; break; } }
    out.push(c);
    i++;
  }
  return { raw: out.join(''), next: i };
}

function decodeCodes(raw, font) {
  if (!font) return raw;
  const step = font.twoByte ? 2 : 1;
  let out = '';
  for (let i = 0; i < raw.length; i += step) {
    const code = step === 2
      ? (raw.charCodeAt(i) << 8) | (raw.charCodeAt(i + 1) || 0)
      : raw.charCodeAt(i);
    if (font.decoder && font.decoder.map.has(code)) { out += font.decoder.map.get(code); continue; }
    // No map: the code is its Latin-1 character, which is right for
    // every simple font with a standard encoding.
    out += step === 2 ? '�' : String.fromCharCode(code);
  }
  return out;
}

/**
 * Every run of text on one page, with where it sits.
 * @returns {{ items: Array<{x:number,y:number,str:string,size:number}>, opaque:boolean }}
 */
function runPage(content, fonts) {
  const items = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let tm = [1, 0, 0, 1, 0, 0];
  let tlm = tm;
  let leading = 0;
  let font = null;
  let size = 12;
  let hscale = 1;
  let opaque = false;

  const show = (raw) => {
    const str = decodeCodes(raw, font);
    if (!str) return;
    if (font && font.opaque) opaque = true;
    const m = mul(tm, ctm);
    items.push({ x: m[4], y: m[5], str, size: Math.abs(size * (m[3] || 1)) || size });
    /* Advance the matrix by the run's width. Courier is the only
       face a screenplay uses and every Courier glyph advances
       0.6em, which is also why the columns below are stable. A
       proportional font would need the /Widths array; the error
       there is horizontal position WITHIN a run, not between
       runs, and the line assembly below only uses the start. */
    const w = str.length * 0.6 * size * hscale;
    tm = mul([1, 0, 0, 1, w, 0], tm);
  };

  const ops = [];
  let i = 0;
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

  while (i < content.length) {
    const c = content[i];
    if (c === '(') {
      const lit = readLiteral(content, i + 1);
      ops.push({ s: lit.raw });
      i = lit.next;
      continue;
    }
    if (c === '<' && content[i + 1] !== '<') {
      const end = content.indexOf('>', i);
      if (end < 0) break;
      const hex = content.slice(i + 1, end).replace(/\s+/g, '');
      let s = '';
      for (let h = 0; h < hex.length; h += 2) s += String.fromCharCode(parseInt(hex.slice(h, h + 2).padEnd(2, '0'), 16));
      ops.push({ s });
      i = end + 1;
      continue;
    }
    if (c === '<' || c === '[' || c === ']' || c === '>') {
      ops.push({ t: c });
      i += c === '<' || c === '>' ? 2 : 1;
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    const token = /^[^\s()<>\[\]{}/%]+|^\/[^\s()<>\[\]{}/%]*/.exec(content.slice(i));
    if (!token) { i++; continue; }
    const t = token[0];
    i += t.length;

    switch (t) {
      case 'q':  stack.push(ctm); break;
      case 'Q':  ctm = stack.pop() || [1, 0, 0, 1, 0, 0]; break;
      case 'cm': ctm = mul(ops.slice(-6).map((o) => num(o.t)), ctm); break;
      case 'BT': tm = tlm = [1, 0, 0, 1, 0, 0]; break;
      case 'ET': break;
      case 'Tf': {
        const name = (ops[ops.length - 2] || {}).t || '';
        font = fonts.get(String(name).replace(/^\//, '')) || null;
        size = num((ops[ops.length - 1] || {}).t);
        break;
      }
      case 'Tz': hscale = num((ops[ops.length - 1] || {}).t) / 100 || 1; break;
      case 'TL': leading = num((ops[ops.length - 1] || {}).t); break;
      case 'Td': {
        const [tx, ty] = ops.slice(-2).map((o) => num(o.t));
        tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; break;
      }
      case 'TD': {
        const [tx, ty] = ops.slice(-2).map((o) => num(o.t));
        leading = -ty;
        tlm = mul([1, 0, 0, 1, tx, ty], tlm); tm = tlm; break;
      }
      case 'Tm': { tlm = ops.slice(-6).map((o) => num(o.t)); tm = tlm; break; }
      case 'T*': tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm; break;
      case 'Tj': show((ops[ops.length - 1] || {}).s || ''); break;
      case "'":  tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm;
                 show((ops[ops.length - 1] || {}).s || ''); break;
      case '"':  tlm = mul([1, 0, 0, 1, 0, -leading], tlm); tm = tlm;
                 show((ops[ops.length - 1] || {}).s || ''); break;
      case 'TJ': {
        /* The array alternates strings and kern adjustments. The
           adjustment is in thousandths of text space and moves
           LEFT when positive, which is how a justified line is
           tightened — and how a word space is sometimes written,
           so it has to be applied or words run together. */
        let open = -1;
        for (let k = ops.length - 1; k >= 0; k--) if (ops[k].t === '[') { open = k; break; }
        if (open < 0) break;
        for (const o of ops.slice(open + 1)) {
          if (o.s != null) { show(o.s); continue; }
          const adj = num(o.t);
          if (adj) tm = mul([1, 0, 0, 1, -adj / 1000 * size * hscale, 0], tm);
        }
        break;
      }
      default: ops.push({ t: t }); continue;
    }
    ops.length = 0;
  }
  return { items, opaque };
}

/* ------------------------------------------------------------
   PAGE → LINES → COLUMNS
   ------------------------------------------------------------ */
/** One page of items becomes text lines with an indent in characters. */
function layoutPage(items) {
  if (!items.length) return [];
  /* Group by baseline. A tolerance rather than equality: a run
     typeset with a different font size on the same line (a bold
     word, a superscript) lands a fraction of a point off. */
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  let open = null;
  for (const it of sorted) {
    if (!open || Math.abs(open.y - it.y) > 3) {
      open = { y: it.y, parts: [] };
      lines.push(open);
    }
    open.parts.push(it);
  }

  /* The character cell. Courier advances 0.6em, so a 12pt
     screenplay is 7.2pt per column — but a PDF scaled to A4, or
     typeset at 11pt, is not, and a hard-coded 7.2 would read
     every column wrong on those. The dominant font size on the
     page decides it. */
  const sizes = new Map();
  for (const it of items) {
    const s = Math.round(it.size * 2) / 2;
    sizes.set(s, (sizes.get(s) || 0) + it.str.length);
  }
  let size = 12, best = 0;
  for (const [s, n] of sizes) if (n > best && s > 1) { best = n; size = s; }
  const cell = size * 0.6;

  /* Vertical gaps are paragraph breaks. The typical line height is the
     smallest gap that is a real line step on this page (a page of
     single-spaced paragraphs separated by blank lines has no gap
     smaller than the paragraph break itself, so it is capped at 1.25x
     the font size); a gap over 1.5x that is a blank line. Without this
     two action paragraphs came back as one. */
  let step = Infinity;
  for (let k = 1; k < lines.length; k++) {
    const gap = lines[k - 1].y - lines[k].y;
    if (gap > size * 0.5 && gap < step) step = gap;
  }
  step = Math.min(step, size * 1.25);

  const out = [];
  lines.forEach((line, k) => {
    const parts = line.parts.slice().sort((a, b) => a.x - b.x);
    let text = '';
    let col = 0;
    const first = Math.round(parts[0].x / cell);
    for (const p of parts) {
      const at = Math.round(p.x / cell) - first;
      /* A gap between two runs on one line is real spacing — it is
         how "INT. KITCHEN - DAY" and a right-aligned scene number
         end up on the same line. Padded out so the columns survive
         into the text the parser reads. */
      if (at > col) { text += ' '.repeat(at - col); col = at; }
      text += p.str;
      col += p.str.length;
    }
    text = text.replace(/\s+$/, '');
    if (!text.trim()) return;
    if (out.length && k > 0 && lines[k - 1].y - line.y > step * 1.5) out.push({ indent: 0, text: '' });
    out.push({ indent: first, text });
  });
  return out;
}

/* ------------------------------------------------------------
   THE ENTRY POINT
   ------------------------------------------------------------ */
/**
 * @param {ArrayBuffer} buffer a PDF, read locally. Nothing is uploaded.
 * @returns {Promise<{text:string, pages:number, warnings:string[], fatal:string|null}>}
 */
export async function extractLayoutText(buffer) {
  const warnings = [];
  const bytes = new Uint8Array(buffer);
  const src = LATIN1.decode(bytes);

  if (!/^%PDF-/.test(src.slice(0, 1024))) {
    return fail('That file is not a PDF — it has no PDF header.');
  }
  /* Encryption is refused by name. Every string in an encrypted
     PDF is ciphertext, and "decoding" it produces exactly the
     mojibake this module exists to avoid importing. */
  if (/\/Encrypt\b/.test(src)) {
    return fail('That PDF is password-protected or encrypted, so its text cannot be read. '
      + 'Open it in a PDF reader, print or export it again without protection, and import that.');
  }

  const objects = scanObjects(bytes, src);
  if (!objects.size) return fail('That PDF could not be read — no objects were found in it.');
  await expandObjectStreams(objects);

  const pages = pagesInOrder(objects);
  if (!pages.length) return fail('That PDF has no pages this reader could find.');

  const out = [];
  let opaqueFonts = false;
  let undecoded = 0;
  let total = 0;

  for (const page of pages) {
    const fonts = await buildFontMap(objects, page);
    const refs = dictRefs(page.dict, 'Contents');
    const single = dictRef(page.dict, 'Contents');
    const list = refs.length ? refs : (single != null ? [single] : []);
    let content = '';
    for (const ref of list) {
      const data = await streamBytes(objects.get(ref));
      if (data) content += LATIN1.decode(data) + '\n';
    }
    if (!content) { out.push(''); continue; }
    const { items, opaque } = runPage(content, fonts);
    if (opaque) opaqueFonts = true;
    for (const it of items) {
      total += it.str.length;
      for (const ch of it.str) if (ch === '�') undecoded++;
    }
    const lines = layoutPage(items);
    out.push(lines.map((l) => (l.text ? ' '.repeat(Math.max(0, l.indent)) + l.text : '')).join('\n'));
  }

  if (!total) {
    return fail('There is no text in that PDF — it looks like a scan or an image of a script. '
      + 'A PDF exported from a screenwriting application has selectable text; '
      + 'if you can select words in a PDF reader, this can read them too.');
  }
  if (opaqueFonts || undecoded / total > 0.1) {
    return fail('That PDF’s fonts do not say which letters their codes stand for, '
      + 'so the text would come out as nonsense. Export it again with "embed fonts" or '
      + '"searchable text" turned on, or save it as Fountain, .fdx or .txt and import that.');
  }
  if (undecoded) {
    warnings.push(undecoded + ' character(s) in that PDF could not be decoded and came through as �.');
  }

  /* Form feeds between pages, because that is what parseText reads
     as a page break — and it is what lets it find the title page. */
  const text = out.join('\n\f\n');
  warnings.push(pages.length + ' page(s) were read from the PDF. '
    + 'A PDF has no element types in it, so every line was classified by the column it sits in — '
    + 'check the cues and the dialogue in the preview before you accept it.');

  return { text, pages: pages.length, warnings, fatal: null };

  function fail(message) {
    return { text: '', pages: 0, warnings, fatal: message };
  }
}

export default { extractLayoutText };
