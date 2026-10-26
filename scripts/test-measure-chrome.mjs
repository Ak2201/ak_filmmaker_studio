/* ============================================================
   measureChrome() — what the pinned band publishes, across a rotation
   ------------------------------------------------------------
   src/ui/shell.js measureChrome() publishes --sh-chrome-h (where the
   tab strip and every other pinned row parks) and --sh-cover-h (what a
   fragment landing has to clear). It runs in the browser on resize and
   band-mutation frames, and the checks that load pages (verify,
   prove:scroll) load each one at ONE viewport, so a value that goes
   stale between two viewports is invisible to them.

   This lifts the function's own source out of shell.js and runs it,
   in Node, against a stub DOM of the elements it measures:

     · a fresh portrait load (the phone band pinned at top: 0) publishes
       the band's height;
     · LANDSCAPE → PORTRAIT: the band is not pinned in landscape (0 is
       published), then the phone band pins at top: 0. That band used to
       be filed as "a strip parked on 0" because its top equals the
       published value, so --sh-chrome-h stayed 0 until a reload and the
       tab strip pinned UNDER the 56px band;
     · portrait → landscape goes back to 0;
     · the old flip (a tab strip at top: 0 on a page whose band scrolls
       away counted as the band) stays fixed.

       node scripts/test-measure-chrome.mjs   (or: npm run test:measure-chrome)
   ============================================================ */
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../src/ui/shell.js', import.meta.url), 'utf8');
const start = src.indexOf('function measureChrome()');
const end = src.indexOf('\nlet lastCover', start);
if (start < 0 || end < 0) { console.log('test:measure-chrome — measureChrome() not found in shell.js'); process.exit(1); }
const body = src.slice(start, end);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* One page: the shell's bar and a tab strip pinned at var(--sh-chrome-h). */
function page() {
  const props = new Map();
  const de = { style: { setProperty: (k, v) => props.set(k, v) } };
  const vp = { w: 390, h: 844 };
  const bar = { cls: 'sh-bar', h: 56, pinned: true, top: 0 };
  const tabs = { cls: 'tabs', h: 44 };
  const cssVar = (k) => props.has(k) ? props.get(k) : (k === '--sh-chrome-h' ? '56px' : '');
  const style = (el) => {
    if (el === de) return { getPropertyValue: cssVar };
    if (el === bar) return { position: bar.pinned ? 'sticky' : 'relative', top: bar.top + 'px' };
    return { position: 'sticky', top: cssVar('--sh-chrome-h') || '0px' };
  };
  const node = (el) => ({
    _el: el,
    classList: { contains: (c) => c === el.cls },
    matches: (sel) => sel.split(',').some((s) => s.trim() === '.' + el.cls),
    querySelector: () => null,
    getBoundingClientRect: () => {
      const top = parseFloat(style(el).top) || 0;
      const left = el.left || 0, width = el.w || vp.w - left;
      return { top, height: el.h, left, right: left + width, width };
    }
  });
  const nodes = [node(bar), node(tabs)];
  const document = { documentElement: de, querySelectorAll: () => nodes };
  const window = { get innerWidth() { return vp.w; }, get innerHeight() { return vp.h; } };
  const getComputedStyle = (n) => style(n === de ? de : n._el);
  const run = new Function('window', 'document', 'getComputedStyle', 'relandFragment',
    'let lastBand = -1; let lastCover = -1;\n' + body + '\nreturn measureChrome;');
  const measure = run(window, document, getComputedStyle, () => {});
  const settle = () => { for (let i = 0; i < 4; i++) measure(); };
  return { vp, bar, tabs, props, settle, chrome: () => props.get('--sh-chrome-h'), cover: () => props.get('--sh-cover-h') };
}

/* ---- a fresh portrait load ---------------------------------- */
{
  const p = page();
  p.settle();
  eq(p.chrome(), '56px', 'portrait load: the pinned phone band is published');
  eq(p.cover(), '100px', 'portrait load: a fragment clears band + strip');
}

/* ---- landscape (band not pinned), then rotate to portrait ------ */
{
  const p = page();
  p.vp.w = 844; p.vp.h = 390; p.bar.pinned = false;
  p.settle();
  eq(p.chrome(), '0px', 'landscape: the band scrolls away, nothing to park under');
  eq(p.cover(), '44px', 'landscape: the strip alone covers the top');
  p.vp.w = 390; p.vp.h = 844; p.bar.pinned = true;      // html.mn-on pins .sh-bar at top: 0
  p.settle();
  eq(p.chrome(), '56px', 'after rotating to portrait the band is published, not left at 0');
  eq(p.cover(), '100px', '…and the strip parks under it');
  p.vp.w = 844; p.vp.h = 390; p.bar.pinned = false;
  p.settle();
  eq(p.chrome(), '0px', 'and rotating back to landscape returns to 0');
  eq(p.cover(), '44px', '…with the strip still counted for fragments');
}

/* ---- the old flip: a strip at top 0 is never the band ---------- */
{
  const p = page();
  p.bar.pinned = false;
  const seen = new Set();
  for (let i = 0; i < 6; i++) { p.settle(); seen.add(p.chrome()); }
  eq([...seen].join(','), '0px', 'a strip at top: 0 with no pinned band does not flip the published value');
}

/* ---- a strip narrower than half the viewport (1440, side gutter) --- */
{
  const p = page();
  p.vp.w = 1440; p.vp.h = 900; p.tabs.left = 88; p.tabs.w = 685;
  p.settle();
  eq(p.chrome(), '56px', 'desktop: the band is the band alone');
  eq(p.cover(), '100px', 'desktop: a 685px strip under the band is still cleared by a landing');
}

console.log(`test:measure-chrome — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
