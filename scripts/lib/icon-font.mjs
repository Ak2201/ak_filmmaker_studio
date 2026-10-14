/* ============================================================
   THE ICON FONT, SUBSET HERE — no Google Fonts host (14 Oct 2026)
   ------------------------------------------------------------
   The marks are Material Symbols Rounded LIGATURES (src/ui/icon.js):
   the span's text is the symbol's name and the font turns it into a
   glyph. Google's `icon_names=` API used to cut the 1.2MB face down to
   the ~60 symbols the app names. The owner's decision to self-host every
   face moved that job here.

   The face comes from @fontsource/material-symbols-rounded (weight 400,
   static — the axes are already pinned to FILL 0 / wght 400 / GRAD 0 /
   opsz 24, which is what base.css asks for). HarfBuzz does the cut:

   1. Each name is SHAPED with the full face. It must come back as ONE
      glyph, or it is not a symbol — and unlike the Google API, which
      answered a misspelt name by quietly serving the WHOLE face, that
      fails the build here, naming the word.
   2. The subset keeps those glyph ids plus the characters the names are
      spelt with, with NO_LAYOUT_CLOSURE. Without that flag the GSUB
      closure would re-add every ligature reachable from a-z and _ —
      i.e. all 3,000 symbols — because each one is spelt in letters we
      keep. With it, a ligature survives only if its output glyph is one
      we asked for.

   The input is WOFF 1.0 (HarfBuzz reads only raw sfnt) and the output
   is wrapped back into WOFF 1.0 — zlib per table, which Node has. A
   few lines each; no extra dependency.
   ============================================================ */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { inflateSync, deflateSync } from 'node:zlib';

const require = createRequire(import.meta.url);

const FACE = '@fontsource/material-symbols-rounded/files/material-symbols-rounded-latin-400-normal.woff';
const NO_LAYOUT_CLOSURE = 0x200;   /* hb_subset_flags_t, HarfBuzz >= 7.2 */
const SETS_GLYPH_INDEX = 0;        /* hb_subset_sets_t */

const align4 = (n) => (n + 3) & ~3;

/** WOFF 1.0 → raw sfnt. */
export function woffToSfnt(woff) {
  const dv = new DataView(woff.buffer, woff.byteOffset, woff.byteLength);
  if (dv.getUint32(0) !== 0x774f4646) throw new Error('icon-font: not a WOFF 1.0 file');
  const flavor = dv.getUint32(4);
  const n = dv.getUint16(12);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = dv.getUint32(o), off = dv.getUint32(o + 4), comp = dv.getUint32(o + 8),
          orig = dv.getUint32(o + 12), sum = dv.getUint32(o + 16);
    const raw = woff.subarray(off, off + comp);
    tables.push({ tag, sum, data: comp < orig ? inflateSync(raw) : raw });
  }
  return writeSfnt(flavor, tables);
}

function writeSfnt(flavor, tables) {
  const n = tables.length;
  let size = 12 + 16 * n;
  for (const t of tables) size += align4(t.data.length);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  let es = 0; while ((1 << (es + 1)) <= n) es++;
  dv.setUint32(0, flavor); dv.setUint16(4, n);
  dv.setUint16(6, (1 << es) * 16); dv.setUint16(8, es); dv.setUint16(10, n * 16 - (1 << es) * 16);
  let off = 12 + 16 * n;
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    dv.setUint32(r, t.tag); dv.setUint32(r + 4, t.sum); dv.setUint32(r + 8, off); dv.setUint32(r + 12, t.data.length);
    out.set(t.data, off);
    off += align4(t.data.length);
  });
  return out;
}

/** raw sfnt → WOFF 1.0. */
export function sfntToWoff(sfnt) {
  const dv = new DataView(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const flavor = dv.getUint32(0);
  const n = dv.getUint16(4);
  const tables = [];
  let sfntSize = 12 + 16 * n;
  for (let i = 0; i < n; i++) {
    const r = 12 + i * 16;
    const tag = dv.getUint32(r), sum = dv.getUint32(r + 4), off = dv.getUint32(r + 8), len = dv.getUint32(r + 12);
    const orig = sfnt.subarray(off, off + len);
    const z = deflateSync(orig, { level: 9 });
    tables.push({ tag, sum, orig: len, data: z.length < len ? z : orig });
    sfntSize += align4(len);
  }
  tables.sort((a, b) => a.tag - b.tag);
  let size = 44 + 20 * n;
  for (const t of tables) size += align4(t.data.length);
  const out = new Uint8Array(size);
  const o = new DataView(out.buffer);
  o.setUint32(0, 0x774f4646); o.setUint32(4, flavor); o.setUint32(8, size);
  o.setUint16(12, n); o.setUint32(16, sfntSize); o.setUint16(20, 1);
  let off = 44 + 20 * n;
  tables.forEach((t, i) => {
    const r = 44 + i * 20;
    o.setUint32(r, t.tag); o.setUint32(r + 4, off); o.setUint32(r + 8, t.data.length);
    o.setUint32(r + 12, t.orig); o.setUint32(r + 16, t.sum);
    out.set(t.data, off);
    off += align4(t.data.length);
  });
  return out;
}

/** The glyph id each ligature name shapes to; throws on a name that is not a symbol. */
async function glyphIds(sfnt, names) {
  const hb = await import('harfbuzzjs');
  const face = new hb.Face(new hb.Blob(sfnt));
  const font = new hb.Font(face);
  const bad = [];
  const ids = new Map();
  for (const name of names) {
    const buf = new hb.Buffer();
    buf.addText(name);
    buf.guessSegmentProperties();
    hb.shape(font, buf);
    const infos = buf.getGlyphInfos();
    if (infos.length !== 1 || !infos[0].codepoint) bad.push(name);
    else ids.set(name, infos[0].codepoint);
  }
  if (bad.length) {
    throw new Error('icon-font: not a Material Symbols Rounded name (it does not shape to one glyph): ' + bad.join(', ')
      + ' — check the spelling in src/data/navigation.json / src/data/section-icons.json');
  }
  return ids;
}

/** Subset a raw sfnt to the given glyph ids and code points. */
async function subset(sfnt, gids, codepoints) {
  const wasm = readFileSync(require.resolve('harfbuzzjs/dist/harfbuzz-subset.wasm'));
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const x = instance.exports;
  const heap = () => new Uint8Array(x.memory.buffer);
  const ptr = x.malloc(sfnt.byteLength);
  heap().set(sfnt, ptr);
  const blob = x.hb_blob_create(ptr, sfnt.byteLength, 2 /* writable */, 0, 0);
  const face = x.hb_face_create(blob, 0);
  x.hb_blob_destroy(blob);
  const input = x.hb_subset_input_create_or_fail();
  const uni = x.hb_subset_input_unicode_set(input);
  for (const c of codepoints) x.hb_set_add(uni, c);
  const gs = x.hb_subset_input_set(input, SETS_GLYPH_INDEX);
  for (const g of gids) x.hb_set_add(gs, g);
  x.hb_subset_input_set_flags(input, x.hb_subset_input_get_flags(input) | NO_LAYOUT_CLOSURE);
  const sub = x.hb_subset_or_fail(face, input);
  x.hb_subset_input_destroy(input);
  if (!sub) { x.hb_face_destroy(face); x.free(ptr); throw new Error('icon-font: hb_subset_or_fail failed'); }
  const outBlob = x.hb_face_reference_blob(sub);
  const len = x.hb_blob_get_length(outBlob);
  const data = x.hb_blob_get_data(outBlob, 0);
  const out = heap().slice(data, data + len);
  x.hb_blob_destroy(outBlob);
  x.hb_face_destroy(sub);
  x.hb_face_destroy(face);
  x.free(ptr);
  return out;
}

/**
 * buildIconFont(names) → { woff: Uint8Array, names, glyphs }
 * Every name must be a real ligature in the face, or this throws.
 */
export async function buildIconFont(names) {
  const list = [...new Set(names)].sort();
  const sfnt = woffToSfnt(new Uint8Array(readFileSync(require.resolve(FACE))));
  const ids = await glyphIds(sfnt, list);
  const chars = new Set();
  for (const n of list) for (const ch of n) chars.add(ch.codePointAt(0));
  const cut = await subset(sfnt, [0, ...ids.values()], chars);
  /* Proof, not hope: shape every name again with the CUT face. */
  await glyphIds(cut, list);
  return { woff: sfntToWoff(cut), names: list, glyphs: ids.size };
}
