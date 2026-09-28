/* ============================================================
   MIGRATION VERIFIER
   ------------------------------------------------------------
   Answers the only question that matters about this refactor:
   did anything get lost on the way from four hand-written HTML
   files to a data-driven build?

   Serves dist/, loads every page in Chromium, and compares each
   one against its ORIGINAL in legacy/ on the things a user would
   notice:

     1. data-key parity — the storage contract. A missing key
        means somebody's saved work no longer has a field to
        load into. This must be exact.
     2. visible-text coverage — did any prose disappear?
     3. no console errors, no inline event handlers.
     4. no runaway writes (the save-loop regression test).
     5. no horizontal overflow at phone width.

   Run: npm run build && npm run verify
   ============================================================ */

import { chromium } from 'playwright';
import { parseHTML } from 'linkedom';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* --baseline recaptures the reference instead of asserting against it.
   Re-baselining is a deliberate act — a redesign that rewrites copy
   should require someone to type `npm run baseline` and say so in a
   commit, not quietly pass because the check drifted with it. */
const WRITE_BASELINE = process.argv.includes('--baseline');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'baseline.json');
const DIST = path.join(ROOT, 'dist');
const PORT = 5321;

const PAGES = [
  { page: 'index.html',   legacy: 'index.html',                        name: 'hub' },
  { page: 'feature.html', legacy: 'arunak-filmmaker-blueprint.html',   name: 'feature' },
  { page: 'short.html',   legacy: 'arunak-shortfilm-blueprint.html',   name: 'short' },
  { page: 'library.html', legacy: 'arunak-filmmaker-library.html',     name: 'library' },
  // No legacy counterpart — this page did not exist before v5. The
  // `legacy` field is vestigial now that nothing diffs against it.
  { page: 'breakdown.html', legacy: null, name: 'breakdown' }
];

/* Every skin the source tree defines. Read from disk rather than
   listed here, for the same reason the steps come from JSON: a
   hand-written list of what exists is wrong by the second change.
   `_contract.css` is documentation, not a skin — it sets nothing. */
const SKIN_FILES = fs
  .readdirSync(path.join(ROOT, 'src', 'styles', 'skins'))
  .filter((f) => f.endsWith('.css') && !f.startsWith('_'))
  .map((f) => f.replace(/\.css$/, ''))
  .sort();

/* ------------------------------------------------------------
   KNOWN DIVERGENCES
   ------------------------------------------------------------
   Words that appear in a legacy page and deliberately do not
   appear in its replacement. Every entry needs a reason, because
   an unexplained one is indistinguishable from a bug. Anything
   NOT on this list that goes missing fails the run.
   ------------------------------------------------------------ */
/* Words that are deliberately gone from a page since the baseline was
   captured, each with the reason.

   Emptied when the oracle was re-baselined. Every previous entry
   explained a divergence from the original legacy/ markup, and against
   a baseline taken from the app's own output there is no such
   divergence — the stale-allowance check flagged all of them the moment
   the baseline landed, which is the check working.

   It is not dead. Reword something on purpose and verify will fail with
   the missing word; add it here with a reason and the run goes green
   again. Two rules keep this list honest: an entry that stops firing
   fails the run, so it cannot rot into a permanent excuse; and if the
   list is growing, that is the signal to re-baseline deliberately with
   `npm run baseline` rather than to keep adding rows. */
const EXPECTED = {
  hub: {},
  breakdown: {},
  feature: {
    /* The blueprint stopped at the tech recce and was described as two
       volumes of twelve steps. It now runs four phases and thirty-two
       steps, through the shoot and out the other side, so the master
       cover no longer counts volumes. Two words, so two entries —
       re-baselining for this would have thrown away the check's grip
       on the other 2,000. */
    'volumes': 'the two volumes became four phases: Story, Pre-production, Production, Post-production',
    'twenty-four': 'twenty-four steps became thirty-two with Production and Post-production'
  },
  short: {},
  library: {}
};

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

/* ---- helpers ---------------------------------------------- */
const strip = (html) => String(html).replace(/<[^>]+>/g, ' ');
const words = (s) => strip(s).replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];

/* The reference the live pages are diffed against.

   This used to be legacy/ — the four hand-written pages the app was
   migrated from. That oracle did its job: it proved the migration lost
   no data-key and no prose. But it pins the app to 2023 markup, so any
   deliberate redesign has to be bought with EXPECTED entries until the
   allowlist is the document and the check is noise.

   scripts/baseline.json replaces it. The first baseline was captured
   from a build that still passed 100% against legacy/, so the original
   guarantee is inherited rather than discarded — the file records which
   commit it came from. legacy/ stays: `npm run extract` reads it, and
   it remains the historical record. It is no longer the oracle. */
function baselineFacts(name) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(
      '\nNo scripts/baseline.json. Capture one with:\n' +
      '  npm run build && npm run baseline\n' +
      'Only do that when the current output is known good — it becomes the reference.\n'
    );
    process.exit(2);
  }
  const all = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const page = all.pages[name];
  if (!page) {
    console.error(`\nbaseline.json has no entry for "${name}". Re-run npm run baseline.\n`);
    process.exit(2);
  }
  return { keys: new Set(page.keys), text: page.words };
}


/* ---- run --------------------------------------------------- */
// Playwright resolves its own downloaded browser. PW_CHROMIUM overrides
// that for environments that ship Chromium at a fixed path instead.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
const report = [];
const captured = {};
let failures = 0;

for (const spec of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The sandbox cannot reach fonts.googleapis.com; that is the
    // environment, not the app.
    if (/fonts\.g(oogleapis|static)\.com|ERR_TUNNEL|Failed to load resource/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });

  await page.goto(`http://localhost:${PORT}/${spec.page}`, { waitUntil: 'networkidle' });
  // The hub needs a project before the blueprints will scope storage.
  await page.evaluate(() => {
    if (window.StudioStore && !StudioStore.currentProject()) {
      StudioStore.createProject({ title: 'Verification', format: 'feature' });
    }
  });
  await page.waitForTimeout(600);

  const live = await page.evaluate(() => ({
    keys: [...document.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key')),
    // innerHTML, not innerText — the legacy side is read the same way.
    // innerText drops anything currently display:none (the resume card
    // before there is anything to resume, the projects toolbar with no
    // projects) and the text of unselected <option>s, which made a
    // faithful port look like it had lost a twentieth of its copy.
    text: (() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
      return clone.innerHTML;
    })(),
    inlineHandlers: document.querySelectorAll(
      '[onclick],[onchange],[oninput],[onsubmit],[onkeydown],[ondblclick],[onfocus],[onblur]'
    ).length,
    steps: document.querySelectorAll('.step').length,
    hasMain: !!document.querySelector('main#main')
  }));

  // --- idle-write probe (the save-loop regression) ---
  await page.evaluate(() => {
    window.__w = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__w++; return orig.call(this, k, v); };
  });
  await page.waitForTimeout(4000);
  const idleWrites = await page.evaluate(() => window.__w);

  // --- phone width ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

  // --- themes must actually swap ---
  // The stylesheets key off :root[data-theme]; chrome.js once set only
  // body.dark/.sepia, which no rule matches — so all three themes
  // rendered identically, the picker was a no-op and sepia was
  // unreachable. Nothing above would notice: the text, the keys and the
  // handlers are all still correct on a page with the wrong palette.
  const themes = await page.evaluate(() => {
    const api = window.StudioUI;
    if (!api || !api.applyTheme) return { unavailable: true };
    const bg = () => getComputedStyle(document.body).backgroundColor;
    const before = document.documentElement.getAttribute('data-theme');
    /* Read the list from the app rather than repeating it here. When a
       fourth theme was added, a hardcoded ['paper','sepia','ink'] would
       have gone on passing while saying nothing about it — the check
       would have quietly stopped covering the newest palette, which is
       the one most likely to be wrong. */
    const names = api.themeOrder ? api.themeOrder() : ['paper', 'sepia', 'ink'];
    const out = {};
    names.forEach((t) => { api.applyTheme(t); out[t] = bg(); });
    if (before) document.documentElement.setAttribute('data-theme', before);
    return { out, names };
  });
  const themeCount = themes.unavailable ? null : themes.names.length;
  const themeSwatches = themes.unavailable
    ? null
    : new Set(Object.values(themes.out)).size;

  /* --- skins must actually swap, and all of them must have loaded ---

     Same failure mode as the theme, one level up. A skin is a file of
     --sk-* variables and the language reads them; if the glob stops
     picking a file up, or a skin's variables are all overridden, or
     someone hard-codes a shape back into modules.css, then the picker
     still lists the skin and choosing it still sets the attribute and
     the page still renders correctly — just identically. Nothing else
     in this run would notice.

     Two assertions, because they catch different things. The
     FINGERPRINT catches a skin that no longer changes anything. The
     COUNT catches a skin file that never reached the browser at all,
     which the fingerprint cannot see: a skin that does not exist
     produces no duplicate. */
  const skins = await page.evaluate(() => {
    const api = window.StudioSkin;
    if (!api) return { unavailable: true };
    const before = document.documentElement.getAttribute('data-skin');
    const probe = () => {
      const de = getComputedStyle(document.documentElement);
      // Read the contract, not one element: a skin is allowed to leave
      // any given object untouched, but not to leave all of them.
      return [
        'title-size', 'title-style', 'radius', 'card-pad', 'deco-rule-w',
        'deco-rule-c', 'deck-size', 'h2-size', 'stepnum-size', 'cover-min'
      ].map((k) => de.getPropertyValue('--sk-' + k).trim()).join('|');
    };
    const out = {}, wide = [];
    api.listSkins().forEach((sk) => {
      api.applySkin(sk.id);
      out[sk.id] = probe();
      // The viewport is already 390px here. A skin is free to be
      // roomier or larger-typed than the default; it is not free to
      // push the page sideways on a phone, and only the default one
      // is measured by the check above.
      const de = document.documentElement;
      const over = Math.max(0, de.scrollWidth - de.clientWidth);
      if (over > 0) wide.push(sk.id + ' +' + over + 'px');
    });
    api.applySkin(before || 'studio');
    return { out, ids: Object.keys(out), wide };
  });
  /* The breakdown's chips and element cards only exist once a scene
     does, so on an empty studio the hue assertions below would report
     "nothing to check" forever — a check that never runs is a check
     that does not exist. Seed two scenes with elements in different
     categories and reload.

     AFTER the text and key capture above, deliberately: the baseline
     for this page was captured in its empty state, and seeding before
     the capture would delete the teaching empty state's prose from the
     page and fail the coverage check for the right words and the
     wrong reason. */
  if (spec.name === 'breakdown') {
    await page.evaluate(() => {
      const scene = (n, location, elements) => ({
        id: 'verify-' + n, number: String(n), intExt: 'INT', dayNight: 'DAY',
        location, synopsis: '', eighths: 8, pageNumber: '', elements
      });
      // Through the proxy on purpose: this is the project-scoped key,
      // and writing it raw would put the scenes where nothing reads them.
      localStorage.setItem('arunak_scenes_v1', JSON.stringify({
        scenes: [
          scene(1, 'Police Station', { cast: ['Prakash'], props: ['Iron sickle'] }),
          scene(2, 'Forest Road', { cast: ['Kumaresan'], wardrobe: ['Khaki uniform'] })
        ]
      }));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
  }

  /* --- text must stay legible on the surface it sits on ---

     Twice now a surface has been restyled without its text. Moving
     .tip-box from an ink ground to paper left `color: var(--panel-ink)`
     behind, which is near-white on near-white; giving Console a light
     slab left the resume card's --panel-gilt heading on it, same
     result. Both render perfectly happily and both are invisible.

     Nothing else here can see that. The keys are right, the words are
     right — `innerHTML` still contains them, so the coverage check is
     satisfied by text no human can read.

     So: for every theme crossed with every skin, walk the text inside
     the surfaces a skin controls and compute the WCAG contrast against
     the nearest opaque ancestor background. The floor is 3.0 rather
     than 4.5 on purpose — this is looking for text that has vanished,
     not auditing the muted greys, and a stricter bar here would cry
     wolf about --ink-faint until someone turned the check off. */
  const contrast = await page.evaluate(() => {
    const api = window.StudioUI, skinApi = window.StudioSkin;
    if (!api || !skinApi) return { unavailable: true };

    const parse = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((n) => parseFloat(n));
      return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const rgb = (c) => { const p = parse(c); return p && p.a > 0 ? p.c : null; };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    /* Composite the stack, do not stop at the first non-transparent
       layer. A 7%-alpha wash over a near-black card is, to the eye,
       near-black — treating it as its own opaque colour reported a
       perfectly legible chip as 1:1 and sent me looking for a bug that
       was in this function. Layers accumulate until one is opaque. */
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
      // Back to front: the deepest opaque layer first, then blend up.
      let out = layers[layers.length - 1].c;
      for (let i = layers.length - 2; i >= 0; i--) {
        const { c, a } = layers[i];
        out = out.map((v, k) => c[k] * a + v * (1 - a));
      }
      return out;
    };

    const SURFACES = '.formula-box, .formula, .resume-card, .data-card, .tip-box,'
      + ' .why-box, .por-thozil, .why-this, .step-check, .lx-phase, .door,'
      + ' .bd-example, .toc-item, .film-card, .ex-card';

    /* Freeze transitions for the duration of the probe.

       Three findings survived every real fix and would not reproduce
       by hand: two door buttons and a backup chip, always reporting
       the PREVIOUS combination's colour. They are the only elements in
       SURFACES with `transition: background`/`color`, and a property
       mid-transition computes to its in-flight value — at t≈0, the old
       one. The check was measuring its own switching, not the design.

       A real user never sees this: they change theme once and the
       transition lands. Only a loop that switches sixteen times and
       reads instantly can catch a colour in the air. */
    const freeze = document.createElement('style');
    freeze.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(freeze);

    const beforeTheme = api.currentTheme();
    const beforeSkin = skinApi.currentSkin();
    const worst = [];

    for (const t of api.themeOrder()) {
      for (const sk of skinApi.listSkins()) {
        api.applyTheme(t);
        skinApi.applySkin(sk.id);
        /* Force a style recalc between the attribute change and the
           reads. Sixteen theme/skin switches in a tight loop, each
           followed by hundreds of getComputedStyle calls, and some of
           those reads came back with the PREVIOUS combination's custom
           properties — reporting a door button as :root blue while the
           root element already resolved the ink palette. */
        void document.documentElement.offsetHeight;
        document.querySelectorAll(SURFACES).forEach((surface) => {
          surface.querySelectorAll('*').forEach((el) => {
            if (el.children.length) return;
            if (!el.textContent.trim()) return;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') return;
            const fg = rgb(cs.color);
            if (!fg) return;
            const r = ratio(fg, groundOf(el));
            if (r < 3.0) {
              /* fg and bg are in the finding on purpose. Without them
                 every investigation starts by guessing which element
                 out of nine matching the selector was the bad one, and
                 three of mine guessed wrong. */
              const g = groundOf(el);
              worst.push({
                where: (surface.className || '').toString().split(' ')[0]
                     + ' ' + (el.className || el.tagName).toString().split(' ')[0],
                text: el.textContent.trim().slice(0, 24),
                fg: `rgb(${fg.map(Math.round).join(',')})`,
                bg: `rgb(${g.map(Math.round).join(',')})`,
                theme: t, skin: sk.id, ratio: Math.round(r * 100) / 100
              });
            }
          });
        });
      }
    }
    api.applyTheme(beforeTheme);
    skinApi.applySkin(beforeSkin);
    freeze.remove();
    // One row per distinct place, not one per theme-skin pair.
    const seen = new Map();
    for (const w of worst) if (!seen.has(w.where) || seen.get(w.where).ratio > w.ratio) seen.set(w.where, w);
    return { fails: [...seen.values()].sort((a, b) => a.ratio - b.ratio).slice(0, 10) };
  });
  const lowContrast = contrast.unavailable ? [] : contrast.fails;

  /* --- colour that means something must still mean it ---

     modules.css has one rule with teeth: a coloured rule survives only
     where its hue varies to say WHICH. Folding the rest into a plain
     hairline card is most of this redesign — and the first pass folded
     in two that were carrying data. The hub's three blueprint doors
     came out with a 1px rule and the feature door's hue repainted to
     the generic hairline, so three blueprints read as two.

     Nothing else here could see it. The keys, the words, the handlers
     and the overflow are all identical on a page whose colour coding
     has quietly collapsed — which is the same reason the theme check
     exists. So: every hue group must still render more than one
     colour, at a width you can actually see. */
  const hueGroups = await page.evaluate(() => {
    /* `variant` names the class that says "this one is a different
       KIND". Where it exists, the check asks whether the design still
       SHOWS that difference — a question with an answer. Asking
       instead "do these differ?" of any group at all would flag sets
       that are legitimately uniform, and the short page has one: its
       example pairs carry no .alt, so one hue there is correct.

       The breakdown's two groups deliberately have NO variant, and
       that is a correction rather than an omission. Gating them on
       `.bd-chip.hue-library` made the check blind to precisely the bug
       it was written for: when breakdown.js wrote the wrong class
       name, the variant stopped existing, the group was skipped, and
       the run went green with every chip rendering grey. A gate that
       disappears along with the thing it guards is not a gate. These
       two are seeded above, so two elements in different categories
       are always present and distinct colours can simply be required. */
    const GROUPS = [
      { sel: '.door', variant: '.door.shorts', side: 'Top', what: 'hub blueprint doors' },
      { sel: '.start-card', variant: '.start-card.f', side: 'Left', what: 'hub start cards' },
      { sel: '.fest-card', variant: '.fest-card.t2', side: 'Left', what: 'festival tiers' },
      { sel: '.example', variant: '.example.alt', side: 'Left', what: 'worked examples' },
      { sel: '.bd-chip', side: 'Left', what: 'breakdown element chips' },
      { sel: '.bd-el', side: 'Left', what: 'breakdown element index' }
    ];
    return GROUPS.map((g) => {
      const els = [...document.querySelectorAll(g.sel)];
      /* Reported as skipped rather than dropped. A group that never
         appears on any page looks exactly like a group that passes if
         you only print the ones that ran — and the breakdown's chips
         only exist once the page has scenes, so on an empty studio
         these two assertions do not fire at all. Say so. */
      if (els.length < 2 || (g.variant && !document.querySelector(g.variant))) {
        return { what: g.what, skipped: els.length < 2 ? 'fewer than two present' : 'no variant present' };
      }
      const seen = new Set(), widths = new Set();
      els.forEach((el) => {
        const cs = getComputedStyle(el);
        seen.add(cs['border' + g.side + 'Color']);
        widths.add(parseFloat(cs['border' + g.side + 'Width']) || 0);
      });
      return { what: g.what, colours: seen.size, minWidth: Math.min(...widths) };
    });
  });
  const hueBroken = hueGroups.filter((g) => !g.skipped && (g.colours < 2 || g.minWidth < 3));

  const skinCount = skins.unavailable ? null : skins.ids.length;
  const skinFingerprints = skins.unavailable ? null : new Set(Object.values(skins.out)).size;

  // --- overflow with every phase menu OPEN ---
  // The plain overflow check above measures a page with all menus shut,
  // and missed a 260px dropdown anchored to the rightmost phase pushing
  // 96px of horizontal overflow at 375px. Open them all and measure
  // again; a dropdown that escapes the viewport is a layout bug whether
  // or not the page is scrolled sideways by default.
  const overflowOpen = await page.evaluate(() => {
    const SEL = '.sh-phase-menu, .tb-menu-panel';
    if (!document.querySelector(SEL)) return { checked: false, overflow: 0, escaped: 0 };
    document.querySelectorAll(SEL).forEach((m) => { m.hidden = false; });
    const de = document.documentElement;
    const escaped = [...document.querySelectorAll(SEL)]
      .filter((m) => {
        const r = m.getBoundingClientRect();
        return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
      }).length;
    const overflow = Math.max(0, de.scrollWidth - de.clientWidth);
    document.querySelectorAll(SEL).forEach((m) => { m.hidden = true; });
    return { checked: true, overflow, escaped };
  });

  const liveKeys = new Set(live.keys);
  const liveWords = new Set(words(live.text));

  // Capturing a baseline records what the build produces; there is
  // nothing to compare it against yet, so skip the assertions.
  if (WRITE_BASELINE) {
    captured[spec.name] = { keys: [...liveKeys].sort(), words: [...liveWords].sort() };
    await ctx.close();
    continue;
  }

  const old = baselineFacts(spec.name);
  const missingKeys = [...old.keys].filter((k) => !liveKeys.has(k));
  const allowed = EXPECTED[spec.name] || {};
  /* The hub greets you by time of day, so exactly one of these words is
     on the page at any moment and the other three are not. A baseline
     captured at 3pm therefore fails every run after 5pm.

     This is an EXCLUSION, not an EXPECTED entry, and the difference
     matters: an allowance that stops firing is reported as stale, and
     this one genuinely fires only some of the time. The oracle cannot
     contain a clock — so the clock comes out of both sides. */
  const CLOCK = new Set(['morning', 'afternoon', 'evening', 'late']);
  const gone = [...new Set(old.text)]
    .filter((w) => !CLOCK.has(w))
    .filter((w) => !liveWords.has(w));
  const missingWords = gone.filter((w) => !(w in allowed));       // unexplained
  const explained = gone.filter((w) => w in allowed);             // deliberate
  const total = [...new Set(old.text)].filter((w) => !CLOCK.has(w)).length;
  const coverage = ((total - gone.length) / total) * 100;
  // Coverage counting deliberate rewording as intact — this is the
  // number that must be 100%.
  const accountedCoverage = ((total - missingWords.length) / total) * 100;
  // An allowlist entry that no longer fires is stale; say so rather
  // than letting the list rot into a set of permanent excuses.
  const staleAllowances = Object.keys(allowed).filter((w) => !gone.includes(w));

  const row = {
    page: spec.name,
    legacyKeys: old.keys.size,
    liveKeys: liveKeys.size,
    missingKeys: missingKeys.length,
    missingKeySample: missingKeys.slice(0, 8),
    textCoverage: +coverage.toFixed(2),
    accountedCoverage: +accountedCoverage.toFixed(2),
    explainedDivergences: explained.length,
    staleAllowances,
    missingWordSample: missingWords.slice(0, 200),
    steps: live.steps,
    hasMain: live.hasMain,
    inlineHandlers: live.inlineHandlers,
    idleWrites,
    hOverflowAt390: overflow,
    hOverflowMenusOpen: overflowOpen.overflow,
    menusEscapingViewport: overflowOpen.escaped,
    themes: themeCount,
    distinctThemes: themeSwatches,
    skins: skinCount,
    distinctSkins: skinFingerprints,
    skinsOverflowing: skins.unavailable ? null : skins.wide,
    hueGroups,
    lowContrast,
    errors
  };
  report.push(row);

  const bad = [];
  if (missingKeys.length) bad.push(`${missingKeys.length} data-keys missing`);
  if (missingWords.length) {
    bad.push(`${missingWords.length} unexplained missing words (${missingWords.slice(0, 6).join(', ')})`);
  }
  if (staleAllowances.length) {
    bad.push(`stale allowlist entries: ${staleAllowances.join(', ')}`);
  }
  if (live.inlineHandlers) bad.push(`${live.inlineHandlers} inline handlers`);
  if (idleWrites > 0) bad.push(`${idleWrites} idle writes`);
  if (overflow > 0) bad.push(`${overflow}px horizontal overflow at 390px`);
  if (overflowOpen.checked && overflowOpen.overflow > 0) {
    bad.push(`${overflowOpen.overflow}px horizontal overflow at 390px with the dropdowns open`);
  }
  if (overflowOpen.checked && overflowOpen.escaped > 0) {
    bad.push(`${overflowOpen.escaped} dropdown(s) escape the viewport at 390px`);
  }
  if (themeSwatches !== null && themeSwatches !== themeCount) {
    bad.push(
      `themes do not swap (${themeSwatches} distinct background(s) across ` +
      `${themeCount}: ${themes.names.join('/')})`
    );
  }
  if (skinCount !== null && skinCount !== SKIN_FILES.length) {
    bad.push(
      `${SKIN_FILES.length} skin file(s) on disk but ${skinCount} reached the page ` +
      `(disk: ${SKIN_FILES.join(', ')}; page: ${skins.ids.join(', ')})`
    );
  }
  if (skinFingerprints !== null && skinFingerprints !== skinCount) {
    bad.push(
      `skins do not swap (${skinFingerprints} distinct look(s) across ${skinCount} skins)`
    );
  }
  for (const c of lowContrast) {
    bad.push(
      `text invisible on its surface: ${c.where} at ${c.ratio}:1 ` +
      `(${c.theme} + ${c.skin})`
    );
  }
  for (const g of hueBroken) {
    bad.push(
      `${g.what}: colour no longer distinguishes them ` +
      `(${g.colours} distinct hue(s), thinnest rule ${g.minWidth}px)`
    );
  }
  if (!skins.unavailable && skins.wide.length) {
    bad.push(`horizontal overflow at 390px under skin(s): ${skins.wide.join(', ')}`);
  }
  if (errors.length) bad.push(`${errors.length} console/page errors`);
  if (!live.hasMain) bad.push('no <main id="main">');
  if (bad.length) { failures++; row.FAIL = bad; }

  await ctx.close();
}

if (WRITE_BASELINE) {
  const sha = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    } catch (e) { return 'unknown'; }
  })();
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    _about:
      'Reference for npm run verify. Regenerate ONLY with `npm run build && npm run baseline`, ' +
      'and only when the current output is known good — it becomes the thing every later run is judged against.',
    capturedAt: new Date().toISOString(),
    capturedFrom: sha,
    provenance:
      'Captured from the build at the commit above. The FIRST baseline (16bf3b4) came from a build that ' +
      'still passed 100% against the original legacy/ pages, so the migration guarantee entered the chain ' +
      'there; every later capture inherits whatever the build was at that moment, which is why re-baselining ' +
      'is a deliberate act and belongs in a commit message.',
    pages: captured
  }, null, 2) + '\n');
  await browser.close();
  server.close();
  const n = Object.keys(captured).length;
  const keys = Object.values(captured).reduce((a, p) => a + p.keys.length, 0);
  console.log(`\n✓ baseline written — ${n} pages, ${keys} data-keys, from ${sha}`);
  console.log('  scripts/baseline.json');
  process.exit(0);
}

/* ---- backup round trip --------------------------------------
   Export is the ONLY backup a local-first app has, so it gets its own
   assertion rather than riding on the per-page diff.

   v1 read the per-project keys straight off localStorage, where the
   storage proxy resolved them to whichever project was open — so a file
   labelled "full studio backup" held exactly one film, and the other
   projects were gone the moment the browser was. Nothing in the page
   diff could see it: the hub's markup is identical either way.

   Two projects out, two projects back, with their contents matched. */
const rtCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const rtPage = await rtCtx.newPage();
const rtErrors = [];
rtPage.on('pageerror', (e) => rtErrors.push(e.message));
await rtPage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

const exported = await rtPage.evaluate(async () => {
  const S = window.StudioStore;
  if (!S) return { unavailable: true };
  S.listProjects().forEach((p) => S.deleteProject(p.id));
  const a = S.createProject({ title: 'RT Alpha', format: 'feature' });
  S.setCurrentProject(a.id);
  localStorage.setItem('arunak_filmmaker_combined_v1', JSON.stringify({ lad_1_logline: 'ALPHA-CONTENT' }));
  const b = S.createProject({ title: 'RT Beta', format: 'short' });
  S.setCurrentProject(b.id);
  localStorage.setItem('arunak_filmmaker_combined_v1', JSON.stringify({ lad_1_logline: 'BETA-CONTENT' }));

  // Capture the blob instead of letting the browser download it.
  let blob = null;
  const origCreate = URL.createObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = function (b2) { blob = b2; return 'blob:verify-stub'; };
  HTMLAnchorElement.prototype.click = function () {};
  document.querySelector('[data-action="export-all"]').click();
  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;
  return { text: blob ? await blob.text() : null };
});

let backup = { checked: false };
if (!exported.unavailable && exported.text) {
  const parsed = JSON.parse(exported.text);
  const loglines = Object.values(parsed.data || {})
    .map((d) => d.feature_blueprint && d.feature_blueprint.lad_1_logline)
    .filter(Boolean).sort();

  // Wipe, then re-import the captured file through the real input path.
  await rtPage.evaluate((text) => {
    const S = window.StudioStore;
    S.listProjects().forEach((p) => S.deleteProject(p.id));
    window.confirm = () => true;
    window.alert = () => {};
    const input = document.getElementById('importAllFile');
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'backup.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, exported.text);

  // importV2 finishes with location.reload()
  await rtPage.waitForLoadState('networkidle').catch(() => {});
  await rtPage.waitForTimeout(1200);

  const restored = await rtPage.evaluate(() => {
    const S = window.StudioStore;
    return S.listProjects().map((p) => ({
      title: p.title,
      logline: (() => {
        const raw = S.rawGet('arunak_filmmaker_combined_v1__' + p.id);
        try { return JSON.parse(raw || '{}').lad_1_logline || null; } catch (e) { return null; }
      })()
    })).sort((x, y) => (x.title > y.title ? 1 : -1));
  });

  backup = {
    checked: true,
    exportVersion: parsed._version,
    projectsInFile: (parsed.projects || []).length,
    loglinesInFile: loglines,
    projectsRestored: restored.length,
    restored,
    pageErrors: rtErrors
  };

  const bad = [];
  if (parsed._version < 2) bad.push(`export is v${parsed._version}, expected v2+`);
  if ((parsed.projects || []).length !== 2) {
    bad.push(`export listed ${(parsed.projects || []).length} project(s), expected 2`);
  }
  if (loglines.join('|') !== 'ALPHA-CONTENT|BETA-CONTENT') {
    bad.push(`export carried [${loglines.join(', ')}], expected both projects' content`);
  }
  if (restored.length !== 2) bad.push(`restored ${restored.length} project(s), expected 2`);
  const restoredLoglines = restored.map((r) => r.logline).sort().join('|');
  if (restoredLoglines !== 'ALPHA-CONTENT|BETA-CONTENT') {
    bad.push(`restored content [${restoredLoglines}], expected both projects' content`);
  }
  if (bad.length) { failures++; backup.FAIL = bad; }
} else {
  backup.FAIL = ['could not capture an export blob'];
  failures++;
}
report.push({ page: 'backup round trip', ...backup });

await rtCtx.close();
await browser.close();
server.close();

console.log(JSON.stringify(report, null, 2));
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all pages pass');
process.exit(failures ? 1 : 0);
