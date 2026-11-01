/* ============================================================
   BLOCKING — PNG and PDF (src/ui/blocking/export.js)
   ------------------------------------------------------------
   PNG: the map as drawn by draw.js, at the WHOLE floor (never the
   zoomed view somebody happened to be looking at), with its handles and
   hit areas taken off. An <svg> painted into an <img> sees no page
   stylesheet, so each element's computed paint is copied onto its clone
   first — the tokens resolve to colours here, at export time, and the
   picture looks like the screen. Canvas at 2x for a sharp print; a
   blob: URL, which the CSP's img-src already allows.

   PDF: the one path every PDF in the studio takes, PDF.exportPDF(), with
   a print node built for the job (the map, its key, the crew note) and
   thrown away after. On paper the map is drawn in the --print-* family
   (visualize.css, `body.pdf-blocking`), never the dark screen palette.

   Both read; neither writes a byte of storage.
   ============================================================ */
import PDF from '../../lib/pdf.js';
import { h } from '../../lib/dom.js';
import { BLOCK_W, BLOCK_H } from '../../lib/shots.js';

const PAINT = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity',
  'stroke-linecap', 'stroke-linejoin', 'opacity', 'font-size', 'font-family', 'font-weight',
  'paint-order', 'text-anchor', 'display', 'visibility'];
const EDIT_ONLY = '.vz-mk-hit, .vz-sp-hit, .vz-mk-handle, .vz-rot-handle, .vz-rot-arm, .vz-axis-handle, .vz-guide, .vz-marquee, .vz-sel-box';

/** A free-standing copy of a map: whole floor, no editor furniture, the
    computed paint written onto every element. */
export function standalone(svgEl, scale = 20) {
  const clone = svgEl.cloneNode(true);
  const src = [svgEl, ...svgEl.querySelectorAll('*')];
  const dst = [clone, ...clone.querySelectorAll('*')];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const style = PAINT.map((p) => {
      const v = cs.getPropertyValue(p);
      return v ? `${p}:${v}` : '';
    }).filter(Boolean).join(';');
    if (style) dst[i].setAttribute('style', style);
    dst[i].removeAttribute('tabindex');
    dst[i].removeAttribute('class');
  });
  // Remove the editing furniture by position in the ORIGINAL (classes are gone on the clone).
  const drop = new Set([...svgEl.querySelectorAll(EDIT_ONLY)].map((n) => src.indexOf(n)));
  dst.forEach((n, i) => { if (drop.has(i)) n.remove(); });
  clone.setAttribute('viewBox', `0 0 ${BLOCK_W} ${BLOCK_H}`);
  clone.setAttribute('width', String(BLOCK_W * scale));
  clone.setAttribute('height', String(BLOCK_H * scale));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return clone;
}

const fileName = (s) => String(s || 'blocking').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'blocking';

/** Save the map as a PNG. Resolves true when the file was handed over. */
export function exportPNG(svgEl, { name = '', scene = '' } = {}) {
  return new Promise((resolve) => {
    const W = 2000, H = 1400, band = 96;
    const clone = standalone(svgEl, W / BLOCK_W);
    const xml = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([xml], { type: 'image/svg+xml' }));
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H + band;
      const ctx = canvas.getContext('2d');
      const root = getComputedStyle(svgEl.closest('.vz-blk') || document.documentElement);
      const tok = (n) => root.getPropertyValue(n).trim();
      ctx.fillStyle = tok('--surface-card') || tok('--surface-canvas');
      ctx.fillRect(0, 0, W, band);
      ctx.fillStyle = tok('--ink');
      ctx.font = `600 40px ${tok('--f-display') || 'sans-serif'}`;
      ctx.fillText(name || 'Setup', 36, 58);
      if (scene) {
        ctx.fillStyle = tok('--ink-muted');
        ctx.font = `28px ${tok('--f-mono') || 'monospace'}`;
        ctx.textAlign = 'right';
        ctx.fillText(scene, W - 36, 58);
      }
      ctx.drawImage(img, 0, band, W, H);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) { resolve(false); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName((scene ? scene + ' — ' : '') + (name || 'Setup')) + '.png';
        a.hidden = true;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        resolve(true);
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(false); };
    img.src = url;
  });
}

/** Print one setup through the studio's PDF path. `map` is a fresh
    read-only drawing of the block (draw.js), `key` its key. */
export function exportBlockPDF({ map, key, name = '', note = '', scene = '' }) {
  const main = document.getElementById('main');
  if (!main) return false;
  let node = null;
  return PDF.exportPDF({
    scope: 'blocking',
    setup: 'landscape',
    label: 'Blocking',
    title: PDF.projectTitle() + ' — Blocking — ' + (name || 'Setup'),
    subtitle: scene,
    classes: ['pdf-blocking'],
    before: () => {
      node = h('section.vz-blk-print', {}, [
        h('h2.vz-blk-print-h', { text: name || 'Setup' }),
        scene ? h('p.vz-blk-print-scene', { text: scene }) : null,
        h('figure.vz-blk-print-map', {}, [map]),
        key || null,
        note ? h('p.vz-blk-print-note', { text: note }) : null
      ]);
      main.append(node);
    },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}
