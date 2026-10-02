import zlib from 'node:zlib';

/* Screenplay geometry, 12pt Courier on US Letter: 7.2pt per
   character, 1.5in left margin. These are the columns the real
   format uses, which is the whole point of the test. */
export const COL = { action: 108, dialogue: 180, paren: 223, character: 266, transition: 396 };
const LEAD = 14.4;

export function screenplayOps(lines, opts = {}) {
  const { twoByte = false } = opts;
  /* A Type0 / Identity-H font takes TWO-byte codes, written as a
     hex string. Emitting one-byte literals under that font is a
     PDF no real writer produces — and the first version of this
     generator did exactly that, which made the extractor look
     wrong when it was right to refuse it. */
  const show = (text) => twoByte
    ? '<' + [...text].map(c => c.codePointAt(0).toString(16).padStart(4, '0')).join('') + '>'
    : '(' + text.replace(/([()\\])/g, '\\$1') + ')';
  let y = 720;
  let out = 'BT\n/F1 12 Tf\n';
  for (const [kind, text] of lines) {
    if (kind === 'blank') { y -= LEAD; continue; }
    const x = COL[kind] ?? COL.action;
    out += `1 0 0 1 ${x} ${y} Tm ${show(text)} Tj\n`;
    y -= LEAD;
  }
  return out + 'ET\n';
}

/** A minimal, valid, text-based PDF. */
export function buildPDF(contentStreams, opts = {}) {
  const { compress = false, objstm = false, encrypt = false, toUnicode = false, noText = false } = opts;
  const objs = new Map();
  const pageRefs = contentStreams.map((_, i) => 6 + i * 2);

  objs.set(1, `<< /Type /Catalog /Pages 2 0 R >>`);
  objs.set(2, `<< /Type /Pages /Kids [${pageRefs.map(r => `${r} 0 R`).join(' ')}] /Count ${pageRefs.length} >>`);
  const fontDict = toUnicode
    ? `<< /Type /Font /Subtype /Type0 /BaseFont /Courier /Encoding /Identity-H /ToUnicode 4 0 R >>`
    : `<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`;
  objs.set(3, fontDict);

  if (toUnicode) {
    // A 2-byte identity map for the ASCII range.
    let cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap\n'
      + '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n';
    const n = 95;
    cmap += `${n} beginbfchar\n`;
    for (let c = 32; c < 32 + n; c++) {
      cmap += `<${c.toString(16).padStart(4, '0')}> <${c.toString(16).padStart(4, '0')}>\n`;
    }
    cmap += 'endbfchar\nendcmap end end\n';
    objs.set(4, { dict: '<< /Length ' + cmap.length + ' >>', stream: Buffer.from(cmap, 'latin1') });
  }

  contentStreams.forEach((content, i) => {
    const ref = pageRefs[i];
    objs.set(ref, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] `
      + `/Resources << /Font << /F1 3 0 R >> >> /Contents ${ref + 1} 0 R >>`);
    let body = Buffer.from(noText ? '' : content, 'latin1');
    let dict = `<< /Length ${body.length} >>`;
    if (compress) { body = zlib.deflateSync(body); dict = `<< /Length ${body.length} /Filter /FlateDecode >>`; }
    objs.set(ref + 1, { dict, stream: body });
  });

  const parts = [Buffer.from('%PDF-1.5\n', 'latin1')];
  const packable = [];
  for (const [num, v] of objs) {
    // ObjStm can only hold non-stream objects.
    if (objstm && typeof v === 'string' && num !== 1) { packable.push([num, v]); continue; }
    if (typeof v === 'string') {
      parts.push(Buffer.from(`${num} 0 obj\n${v}\nendobj\n`, 'latin1'));
    } else {
      parts.push(Buffer.from(`${num} 0 obj\n${v.dict}\nstream\n`, 'latin1'), v.stream,
                 Buffer.from('\nendstream\nendobj\n', 'latin1'));
    }
  }
  if (packable.length) {
    let header = '', bodyText = '';
    for (const [num, v] of packable) { header += `${num} ${bodyText.length} `; bodyText += v + '\n'; }
    const payload = Buffer.from(header + bodyText, 'latin1');
    const z = zlib.deflateSync(payload);
    parts.push(Buffer.from(`99 0 obj\n<< /Type /ObjStm /N ${packable.length} /First ${header.length} `
      + `/Length ${z.length} /Filter /FlateDecode >>\nstream\n`, 'latin1'), z,
      Buffer.from('\nendstream\nendobj\n', 'latin1'));
  }
  parts.push(Buffer.from(
    `trailer\n<< /Root 1 0 R${encrypt ? ' /Encrypt 50 0 R' : ''} >>\n%%EOF\n`, 'latin1'));
  return Buffer.concat(parts);
}
