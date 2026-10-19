/* ============================================================
   ZIP, WRITTEN — the smallest archive Word will open
   ------------------------------------------------------------
   The reader's other half (src/lib/docx-text.js reads one). NO
   LIBRARY for the reasons that file gives: a .docx is a handful of
   short XML parts, and storing them uncompressed (method 0) is a
   valid ZIP every word processor opens. What Word does check is the
   CRC-32 of every part, so that is computed properly here — a zero
   CRC is fine for our own reader and a "this file is corrupt" in
   Word.

   Pure: no DOM, no storage, so it runs in Node (test:docx).
     zipStore([[name, string | Uint8Array], …]) → Uint8Array
   ============================================================ */

let TABLE = null;
function crcTable() {
  if (TABLE) return TABLE;
  TABLE = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    TABLE[n] = c >>> 0;
  }
  return TABLE;
}

/** CRC-32 (the ZIP / PNG one) of a byte array. */
export function crc32(bytes) {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* A fixed timestamp (1 Jan 2026, 00:00) so the same script always
   writes the same bytes, which is what lets a test compare two exports. */
const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** Files → a stored (uncompressed) ZIP. */
export function zipStore(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const push = (arr) => { chunks.push(arr); offset += arr.length; };
  for (const [name, content] of files) {
    const nameBytes = enc.encode(String(name));
    const data = content instanceof Uint8Array ? content : enc.encode(String(content ?? ''));
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);            // version needed
    local.setUint16(6, 0x0800, true);        // flags: names are UTF-8
    local.setUint16(8, 0, true);             // method: stored
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    const at = offset;
    push(new Uint8Array(local.buffer)); push(nameBytes); push(data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);               // made by
    cd.setUint16(6, 20, true);               // version needed
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, DOS_TIME, true);
    cd.setUint16(14, DOS_DATE, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, at, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
  }
  const cdStart = offset;
  for (const c of central) push(c);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, offset - cdStart, true);
  end.setUint32(16, cdStart, true);
  push(new Uint8Array(end.buffer));
  const out = new Uint8Array(offset);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

export default { crc32, zipStore };
