/* A test-only ZIP builder: [[name, text, method]] → Buffer, method 0
   (stored) or 8 (deflate). The CRC is left at zero, which
   src/lib/docx-text.js does not check; never use this to make a file a
   real program will open. Moved here from test-story.mjs so the
   screenplay import test can build .docx fixtures the same way. */
import { deflateRawSync } from 'node:zlib';

export function zip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text, method] of files) {
    const raw = enc.encode(text);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const n = enc.encode(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

/** The ArrayBuffer view a FileReader would hand back. */
export const arrayBufferOf = (buf) => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
