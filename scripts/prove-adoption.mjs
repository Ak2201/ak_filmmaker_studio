/* ============================================================
   PROOF: the hub's adoption control, across the signed-in states
   `npm run verify` cannot reach.
   ------------------------------------------------------------
   The gate never signs in, so it exercises the DEVICE namespace only
   and cannot see this control at all. This script simulates identity
   at the single place store.js reads it — `fms_studio_account_v1`,
   raw — which is all store.js has to go on, and then asserts the four
   states that matter:

     (a) signed out, device projects present  → control ABSENT
     (b) signed in, nothing to adopt          → control ABSENT
     (c) signed in, device projects present   → control PRESENT,
                                                naming those projects
     (d) after adopting                       → the projects are in the
                                                account AND still there
                                                signed out, data intact,
                                                with NO manual reload
                                                between the click and
                                                the visible result

   Plus the overflow case the gate structurally cannot test: 390px
   entered at LOAD rather than by a resize afterwards.

   Run:  node prove-adoption.mjs        (needs a fresh `npm run build`)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
const PORT = Number(process.env.PROVE_PORT) || 5354;
const UID = '11111111-2222-3333-4444-555555555555';
const ACCOUNT_KEY = 'fms_studio_account_v1';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  results.push({ ok, label, got, want });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

/* What the page is showing, read the way a user sees it: the button
   either exists or it does not, and the names either name the right
   films or they do not. */
const probe = () => ({
  hostHidden: (() => { const h = document.getElementById('adoptNotice'); return !h || h.hidden; })(),
  button: (() => {
    const b = document.querySelector('[data-action="adopt-device-projects"]');
    return b ? b.textContent.trim() : null;
  })(),
  names: [...document.querySelectorAll('.adopt-name')].map((n) => n.textContent),
  title: (document.querySelector('.adopt-title') || {}).textContent || null,
  deck: (document.querySelector('.adopt-deck') || {}).textContent || null,
  fine: (document.querySelector('.adopt-fine') || {}).textContent || null,
  affects: (document.querySelector('.adopt-affects') || {}).textContent || null,
  cardTitles: [...document.querySelectorAll('#projectsGrid .pc-title')].map((n) => n.textContent),
  storeVisible: window.StudioStore.listProjects().map((p) => p.title),
  adoptable: window.StudioStore.listAdoptableProjects().map((p) => p.title)
});

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const load = () => page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

// ------------------------------------------------------------
// (a) SIGNED OUT, with device projects. The control must not exist.
// ------------------------------------------------------------
await load();
const a = await page.evaluate((accountKey) => {
  const S = window.StudioStore;
  localStorage.clear();
  S.rawRemove(accountKey);
  // Two device projects, each with a logline we can identify later.
  [['Desk Film', 'feature', 'DESK-LOGLINE'], ['Night Shoot', 'short', 'NIGHT-LOGLINE']]
    .forEach(([title, format, logline]) => {
      const p = S.createProject({ title, format });
      S.setCurrentProject(p.id);
      localStorage.setItem('fms_filmmaker_combined_v1',
        JSON.stringify({ lad_1_logline: logline }));
    });
  S.notify('projects:changed', { reason: 'test' });
  return { ns: S.currentNamespace(), ids: S.listProjects().map((p) => p.id) };
}, ACCOUNT_KEY);
const deviceIds = a.ids;
check('(a) namespace is the device when signed out', a.ns, '');
await load();                       // fresh load, signed out, 2 device projects
const pa = await page.evaluate(probe);
check('(a) signed out: adoptable list is empty (store)', pa.adoptable, []);
check('(a) signed out: no adopt button in the DOM', pa.button, null);
check('(a) signed out: notice host hidden', pa.hostHidden, true);
check('(a) signed out: both device projects on the grid', pa.cardTitles.sort(),
  ['Desk Film', 'Night Shoot']);

// ------------------------------------------------------------
// (b) SIGNED IN with nothing to adopt. Still must not exist.
//     Device projects removed first, so the ONLY difference from (c)
//     is whether there is anything to bring in.
// ------------------------------------------------------------
await page.evaluate(({ accountKey, uid }) => {
  const S = window.StudioStore;
  S.listProjects().forEach((p) => S.purgeProjectEverywhere(p.id));
  S.rawSet(accountKey, uid);
}, { accountKey: ACCOUNT_KEY, uid: UID });
await load();
const pb = await page.evaluate(probe);
check('(b) signed in, empty device: namespace is the account',
  await page.evaluate(() => window.StudioStore.currentNamespace()), UID);
check('(b) signed in, nothing to adopt: adoptable empty', pb.adoptable, []);
check('(b) signed in, nothing to adopt: no adopt button', pb.button, null);
check('(b) signed in, nothing to adopt: notice host hidden', pb.hostHidden, true);

// ------------------------------------------------------------
// (c) SIGNED IN with device projects. Present, and naming them.
//     The projects are re-created while SIGNED OUT, because
//     createProject() stamps whatever namespace the document loaded
//     in — which is the whole point of the device/account split.
// ------------------------------------------------------------
await page.evaluate((accountKey) => window.StudioStore.rawRemove(accountKey), ACCOUNT_KEY);
await load();
const seeded = await page.evaluate(() => {
  const S = window.StudioStore;
  const made = [];
  [['Desk Film', 'feature', 'DESK-LOGLINE'], ['Night Shoot', 'short', 'NIGHT-LOGLINE']]
    .forEach(([title, format, logline]) => {
      const p = S.createProject({ title, format });
      S.setCurrentProject(p.id);
      localStorage.setItem('fms_filmmaker_combined_v1', JSON.stringify({ lad_1_logline: logline }));
      made.push({ id: p.id, title, logline });
    });
  return made;
});
// An account project too, so (c) proves the panel is about the DEVICE
// ones specifically and not simply "every project in the list".
await page.evaluate(({ accountKey, uid }) => {
  window.StudioStore.rawSet(accountKey, uid);
}, { accountKey: ACCOUNT_KEY, uid: UID });
await load();
await page.evaluate(() => {
  const S = window.StudioStore;
  const p = S.createProject({ title: 'Already Mine', format: 'feature' });
  S.setCurrentProject(p.id);
});
await load();
const pc = await page.evaluate(probe);
check('(c) signed in: store offers exactly the device-only projects',
  pc.adoptable.slice().sort(), ['Desk Film', 'Night Shoot']);
check('(c) signed in: notice host visible', pc.hostHidden, false);
check('(c) signed in: adopt button present', pc.button, 'ADD ALL 2 TO THIS ACCOUNT');
check('(c) signed in: names the right projects, by name', pc.names.slice().sort(),
  ['Desk Film', 'Night Shoot']);
check('(c) the account project is NOT named in the panel',
  pc.names.includes('Already Mine'), false);
check('(c) the grid shows only the account project before adopting',
  pc.cardTitles, ['Already Mine']);
// The copy is the requirement, so assert the words rather than eyeball them.
const copy = [pc.title, pc.deck, pc.affects, pc.fine, pc.button].join(' ');
check('(c) copy never says "upload"', /upload/i.test(copy), false);
check('(c) copy never says "move"', /\bmove[sd]?\b|moving/i.test(copy), false);
check('(c) copy says the projects stay on this device',
  /stays? on this device/i.test(copy), true);
check('(c) copy says one copy listed in both places',
  /One copy of the work, listed in both places/i.test(copy), true);
console.log('\n--- the copy, as rendered ---');
console.log('eyebrow : ON THIS DEVICE ONLY');
['title', 'deck', 'affects', 'fine'].forEach((k) => console.log(k.padEnd(8) + ': ' + pc[k]));
console.log('button  : ' + pc.button);
console.log('-----------------------------\n');

// ------------------------------------------------------------
// (d) ADOPT. No reload between the click and the result.
// ------------------------------------------------------------
await page.click('[data-action="adopt-device-projects"]');
await page.waitForTimeout(250);          // no reload, no navigation
const pd = await page.evaluate(probe);
check('(d) after the click, same document: control is gone', pd.button, null);
check('(d) after the click, same document: host hidden again', pd.hostHidden, true);
check('(d) after the click, same document: grid re-rendered with all three',
  pd.cardTitles.slice().sort(), ['Already Mine', 'Desk Film', 'Night Shoot']);
check('(d) nothing left to adopt', pd.adoptable, []);
check('(d) no reload happened (the document was never re-navigated)',
  await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);

// …and the same single copy is still the device's, signed out.
const signedOut = await (async () => {
  await page.evaluate((accountKey) => window.StudioStore.rawRemove(accountKey), ACCOUNT_KEY);
  await load();
  return page.evaluate((ids) => {
    const S = window.StudioStore;
    return {
      ns: S.currentNamespace(),
      visible: S.listProjects().map((p) => p.title).sort(),
      cards: [...document.querySelectorAll('#projectsGrid .pc-title')].map((n) => n.textContent).sort(),
      loglines: ids.map((x) => {
        const raw = S.rawGet('fms_filmmaker_combined_v1__' + x.id);
        return raw ? JSON.parse(raw).lad_1_logline : null;
      }),
      // ONE copy, two namespaces: one list entry each, ns holding both.
      entries: S.listAllProjects()
        .filter((p) => ids.some((x) => x.id === p.id))
        .map((p) => ({ title: p.title, ns: p.ns })),
      button: !!document.querySelector('[data-action="adopt-device-projects"]')
    };
  }, seeded);
})();
check('(d) signed out again: namespace is the device', signedOut.ns, '');
check('(d) signed out: the adopted projects are STILL here',
  signedOut.visible, ['Desk Film', 'Night Shoot']);
check('(d) signed out: and still on the grid', signedOut.cards, ['Desk Film', 'Night Shoot']);
check('(d) signed out: their data is intact', signedOut.loglines, ['DESK-LOGLINE', 'NIGHT-LOGLINE']);
check('(d) ONE list entry each, carrying BOTH namespaces', signedOut.entries, [
  { title: 'Desk Film',   ns: ['', UID] },
  { title: 'Night Shoot', ns: ['', UID] }
]);
check('(d) signed out: the control is absent again', signedOut.button, false);
check('(d) the account still sees them', await (async () => {
  await page.evaluate(({ accountKey, uid }) =>
    window.StudioStore.rawSet(accountKey, uid), { accountKey: ACCOUNT_KEY, uid: UID });
  await load();
  return page.evaluate(() => window.StudioStore.listProjects().map((p) => p.title).sort());
})(), ['Already Mine', 'Desk Film', 'Night Shoot']);

// ------------------------------------------------------------
// 390px ENTERED AT LOAD — the gate resizes afterwards, so anything
// gated on matchMedia has already decided by then. This context is
// 390 wide before the first byte.
// ------------------------------------------------------------
const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
const sp = await small.newPage();
sp.on('pageerror', (e) => errors.push('390px: ' + e.message));
await sp.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await sp.evaluate(({ accountKey, uid }) => {
  const S = window.StudioStore;
  localStorage.clear();
  S.rawRemove(accountKey);
  ['A very long project title that should still wrap rather than push sideways', 'Night Shoot']
    .forEach((t) => S.createProject({ title: t, format: 'feature' }));
  S.rawSet(accountKey, uid);
}, { accountKey: ACCOUNT_KEY, uid: UID });
await sp.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
const smallProbe = await sp.evaluate(() => ({
  button: !!document.querySelector('[data-action="adopt-device-projects"]'),
  names: [...document.querySelectorAll('.adopt-name')].length,
  docOverflow: document.documentElement.scrollWidth - window.innerWidth,
  widest: [...document.querySelectorAll('#adoptNotice *')]
    .reduce((m, el) => Math.max(m, Math.ceil(el.getBoundingClientRect().right)), 0)
}));
check('390px at load: the control is present', smallProbe.button, true);
check('390px at load: both names rendered', smallProbe.names, 2);
check('390px at load: no horizontal page overflow', smallProbe.docOverflow <= 0, true);
check('390px at load: nothing in the panel reaches past the viewport',
  smallProbe.widest <= 390, true);

// ------------------------------------------------------------
// WCAG AA ON THE PANEL, 4 themes x 5 skins.
//
// The gate walks every text node for contrast, but it never signs in,
// so this panel is one of the surfaces its walk structurally cannot
// reach — the element is empty and hidden in the device namespace.
// Same compositing and same 4.5:1 floor, applied to the one surface
// the gate is blind to. The maths is lifted from the gate rather than
// reinvented: a second contrast implementation would disagree with the
// first the day one of them was touched.
// ------------------------------------------------------------
const aaCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const aaPage = await aaCtx.newPage();
aaPage.on('pageerror', (e) => errors.push('aa: ' + e.message));
await aaPage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });
await aaPage.evaluate(({ accountKey, uid }) => {
  const S = window.StudioStore;
  localStorage.clear();
  S.rawRemove(accountKey);
  ['Desk Film', 'Night Shoot'].forEach((t) => S.createProject({ title: t, format: 'feature' }));
  S.rawSet(accountKey, uid);
}, { accountKey: ACCOUNT_KEY, uid: UID });
await aaPage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

const aa = await aaPage.evaluate(() => {
  const api = window.StudioUI, skinApi = window.StudioSkin;
  if (!api || !skinApi) return { unavailable: true };
  const host = document.getElementById('adoptNotice');
  if (!host || host.hidden) return { missing: true };

  const parse = (c) => {
    const m = String(c).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((n) => parseFloat(n));
    return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const groundOf = (el) => {
    const layers = [];
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const p = parse(getComputedStyle(n).backgroundColor);
      if (!p || p.a === 0) continue;
      layers.push(p);
      if (p.a >= 1) break;
    }
    const base = parse(getComputedStyle(document.body).backgroundColor);
    if (!layers.length || layers[layers.length - 1].a < 1) {
      layers.push(base && base.a >= 1 ? base : { c: [255, 255, 255], a: 1 });
    }
    let out = layers[layers.length - 1].c;
    for (let i = layers.length - 2; i >= 0; i--) {
      const { c, a } = layers[i];
      out = out.map((v, k) => c[k] * a + v * (1 - a));
    }
    return out;
  };

  // Freeze transitions: a property mid-transition computes to its
  // in-flight value, so a loop that switches 20 times and reads
  // instantly measures its own switching. (Same trap as the gate's.)
  const freeze = document.createElement('style');
  freeze.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
  document.head.appendChild(freeze);

  const worst = [];
  let total = 0;
  for (const t of api.themeOrder()) {
    for (const sk of skinApi.listSkins()) {
      api.applyTheme(t);
      skinApi.applySkin(sk.id);
      void document.documentElement.offsetHeight;
      const w = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = w.nextNode())) {
        if (!node.textContent.trim()) continue;
        const el = node.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        const fg = parse(cs.color);
        if (!fg || fg.a === 0) continue;
        const r = ratio(fg.c, groundOf(el));
        total++;
        if (r < 4.5) {
          worst.push({
            theme: t, skin: sk.id,
            cls: (el.className || '').toString().split(/\s+/)[0] || el.tagName.toLowerCase(),
            text: node.textContent.trim().slice(0, 34),
            ratio: Math.round(r * 100) / 100
          });
        }
      }
    }
  }
  return {
    total, fails: worst.slice(0, 10), failCount: worst.length,
    themes: api.themeOrder().length, skins: skinApi.listSkins().length
  };
});
check('AA pass measured 4 themes', aa.themes, 4);
check('AA pass measured 5 skins', aa.skins, 5);
check('AA pass actually measured text (not an empty walk)', aa.total > 100, true);
check('every text node in the panel clears 4.5:1, all 20 combinations', aa.fails, []);
console.log(`        (${aa.total} measurements across ${aa.themes} themes x ${aa.skins} skins)`);

check('no page errors anywhere in this run', errors, []);

await browser.close();
server.close();
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('adoption control proved in all four states');
