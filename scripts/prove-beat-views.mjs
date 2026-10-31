/* ============================================================
   THE BEAT SHEET'S TWO VIEWS — Lanes (design B) and Spine (design C)
   ------------------------------------------------------------
   (owner, 31 Oct 2026) story.html's Beat Sheet draws one outline two
   ways, switched at runtime; the choice is `beatView` in the device
   prefs (fms_studio_prefs_v1) and nothing else. Against the Dragon
   sample (its Fun and Games beat holds many steps), in Chromium:

     both views render the same beats and the same step ids, the
     Unassigned bin included; the switch writes ONLY the pref and
     survives a reload; nothing is written while idle;
     Lanes: every lane the same height, a long beat scrolls inside its
     own lane; at 390px a lane is 85% wide, snaps, and Next beat moves;
     Spine: stations alternate either side of the spine on a desk and
     sit right of it on a phone; "+N more" opens and closes;
     editing and colouring a step in either view saves exactly what
     the old row saved (its text, its colour, its edit stamp);
     Alt+arrows move a step (the live region says where, the keyboard
     stays on the card); the arrow buttons move it; a pointer drag
     across lanes and on the spine lands where the buttons would, and
     Escape cancels with no write;
     a locked outline has no grip and no move buttons; under reduced
     motion the ghost is not tilted;
     every other Beat Sheet feature still renders; no sideways page
     scroll at 1440, 1100 and 390 in either view; text meets AA; no
     page errors.

       npm run build:open && npm run prove:beat-views
       (PROVE_DIST=dist-verify after build:verify, like the others)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5391;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let failed = 0, passed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}
const truthy = (label, got, detail) => check(label + (got ? '' : ' — ' + JSON.stringify(detail)), !!got, true);

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
const url = (p) => `http://localhost:${PORT}/${p}`;

/* Every localStorage write, by key, from the first script on. */
const COUNT_WRITES = () => {
  window.__writes = [];
  const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) { window.__writes.push(String(k)); return set.call(this, k, v); };
  Storage.prototype.removeItem = function (k) { window.__writes.push('-' + String(k)); return rem.call(this, k); };
};

async function newPage(opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', ...opts });
  await ctx.addInitScript(COUNT_WRITES);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  return { ctx, page };
}

const sampleReady = async (pg) => {
  for (let t = 0; t < 80; t++) {
    const ok = await pg.evaluate(() => {
      try {
        const s = JSON.parse(localStorage.getItem('fms_story_v1') || 'null');
        return !!(s && (s.outline || []).length > 20);
      } catch (e) { return false; }
    }).catch(() => false);
    if (ok) { await pg.waitForLoadState('networkidle').catch(() => {}); return; }
    await pg.waitForTimeout(250);
  }
  throw new Error('the sample project never reached storage');
};
const openSample = async (page) => {
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('[data-action="sample-project"]');
  await page.waitForTimeout(1200);
  await sampleReady(page);
};
const goOutline = async (page) => {
  await page.goto(url('story.html#path-outline'), { waitUntil: 'networkidle' });
  await page.waitForSelector('#path-outline li.st-card', { timeout: 20000 });
  await page.waitForTimeout(600);
};
const story = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1') || '{}'));
const prefs = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}'));
const writes = (page) => page.evaluate(() => { const w = window.__writes.slice(); window.__writes.length = 0; return w; });
const ids = (page) => page.$$eval('#path-outline [data-step-row]', (n) => n.map((x) => x.getAttribute('data-step-row')));
const beats = (page) => page.$$eval('#path-outline [data-beat-card]', (n) => n.map((x) => x.getAttribute('data-beat-card')));
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
const K = (b) => 'save_the_cat:' + b;
const openCard = async (page, id) => {
  if (!await page.$eval(`[data-step-row="${id}"]`, (c) => c.classList.contains("is-open"))) await page.click(`[data-st="step-open"][data-step="${id}"]`);
};
const stepsOf = (s, key) => s.outline.filter((x) => x.beat === key).map((x) => x.id);
const live = async (page) => { await page.waitForTimeout(150); return page.evaluate(() => (document.getElementById('stBeatLive') || {}).textContent || ''); };
const active = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.getAttribute('data-step-row') ? 'card:' + a.getAttribute('data-step-row') : a.tagName + (a.getAttribute('data-st') ? '[' + a.getAttribute('data-st') + ':' + a.getAttribute('data-step') + ']' : '')) : '';
});
/* Only `keys` of step `id` may differ between two stored stories. */
function onlyChanged(a, b, id, keys) {
  if (process.env.DEBUG_DIFF) {
    const A = a.outline.find((x) => x.id === id), B = b.outline.find((x) => x.id === id);
    console.log('   diff', JSON.stringify(A), JSON.stringify(B), Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])));
  }
  const strip = (s) => JSON.stringify((s.outline || []).map((x) => x.id === id ? Object.fromEntries(Object.entries(x).filter(([k]) => !keys.includes(k))) : x));
  const rest = (s) => JSON.stringify({ ...s, outline: null, updatedAt: null });   // saveStory stamps the time, as it always did
  return strip(a) === strip(b) && rest(a) === rest(b);
}

async function contrastFails(page, root) {
  return page.evaluate(([sel, MIN]) => {
    const parse = (c) => {
      let m = c.match(/rgba?\(([^)]+)\)/);
      if (m) { const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] == null ? 1 : p[3] }; }
      m = c.match(/color\(srgb ([^)]+)\)/);
      if (m) { const p = m[1].split(/[ \/]+/).filter(Boolean).map(Number); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] == null ? 1 : p[3] }; }
      return null;
    };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.95) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
    const bad = [];
    const w = document.createTreeWalker(document.querySelector(sel), NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest('[hidden], .visually-hidden, .sym, [aria-hidden="true"]') || !el.getClientRects().length) continue;
      const fg = parse(getComputedStyle(el).color); if (!fg) continue;
      const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < MIN) bad.push(ratio.toFixed(2) + ' ' + n.textContent.trim().slice(0, 30));
    }
    return [...new Set(bad)];
  }, [root, 4.5]);
}

/* A pointer drag from a step's grip to a point, in steps, like a hand. */
async function drag(page, id, to, { cancel = false } = {}) {
  const g = await page.locator(`.st-grip[data-step="${id}"]`).boundingBox();
  const x0 = g.x + g.width / 2, y0 = g.y + g.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + 6, y0 + 6, { steps: 2 });
  const dest = typeof to === 'function' ? await to() : to;
  await page.mouse.move(dest.x, dest.y, { steps: 12 });
  await page.waitForTimeout(150);
  await page.mouse.move(dest.x, dest.y + 1);
  await page.waitForTimeout(100);
  if (cancel) { await page.keyboard.press('Escape'); await page.waitForTimeout(50); }
  await page.mouse.up();
  await page.waitForTimeout(500);
}
const below = async (page, sel) => {
  const el = page.locator(sel);
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height - 4 };
};

/* ================================================================ */
const { ctx, page } = await newPage();
await openSample(page);
await goOutline(page);
const S0 = await story(page);
const FUN = K('fun_and_games');
const funN = stepsOf(S0, FUN).length;
truthy('sample: Fun and Games holds more than three steps', funN > 3, funN);

/* ---- Lanes: the default ----------------------------------------- */
check('lanes: the default view, with no pref written', [await page.$eval('#path-outline .st-bl', (b) => b.dataset.view).catch(() => null), 'beatView' in await prefs(page)], ['lanes', false]);
await writes(page);
await page.waitForTimeout(3000);
check('idle: nothing written in three seconds', await writes(page), []);
const laneIds = await ids(page);
const laneBeats = await beats(page);
check('lanes: every step drawn once', [laneIds.length, new Set(laneIds).size], [S0.outline.length, S0.outline.length]);
check('lanes: one lane per beat, then Unassigned', [laneBeats.length, await page.$$eval('#path-outline .st-bl-lane', (n) => n.length), await page.$$eval('#path-outline .st-bl-lane:last-child.st-unplaced', (n) => n.length)], [15, 16, 1]);
const geo = await page.evaluate((FUN) => {
  const lanes = [...document.querySelectorAll('#path-outline .st-bl-lane')];
  const hs = lanes.map((l) => Math.round(l.getBoundingClientRect().height));
  const fun = document.querySelector(`#path-outline [data-beat-card="${FUN}"] [data-drop-beat]`);
  return { min: Math.min(...hs), max: Math.max(...hs), scrolls: fun.scrollHeight > fun.clientHeight + 4, overflowY: getComputedStyle(fun).overflowY, h: hs[0] };
}, FUN);
truthy('lanes: every lane the same height (±1px)', geo.max - geo.min <= 1, geo);
truthy('lanes: the long beat scrolls inside its own lane', geo.scrolls && geo.overflowY === 'auto', geo);
const docH0 = await page.evaluate(() => document.documentElement.scrollHeight);
{
  const add = page.locator(`[data-st="step-add"][data-beat="${FUN}"]`);
  await add.click();
  await page.waitForTimeout(500);
  const docH1 = await page.evaluate(() => document.documentElement.scrollHeight);
  truthy('lanes: a step more in the long beat does not grow the page', Math.abs(docH1 - docH0) <= 2, [docH0, docH1]);
  check('add: the new step\'s text has the keyboard and its card is open', await page.evaluate(() => [document.activeElement.classList.contains('st-ol-text'), !!document.activeElement.closest('li.st-card.is-open')]), [true, true]);
  const added = (await story(page)).outline.find((x) => !S0.outline.some((y) => y.id === x.id));
  await page.click(`[data-st="step-del"][data-step="${added.id}"]`);
  await page.waitForTimeout(400);
  check('add then remove: the outline is as it was', JSON.stringify((await story(page)).outline.map((x) => x.id)), JSON.stringify(S0.outline.map((x) => x.id)));
}
check('features: picker, lock, send, AI pills, More craft, Unassigned, view switch', await page.evaluate(() => [
  '#st-fw-pick', '#stLockRow', '#stHandoff', '#st-more-beats', '#st-more-setups', '#st-more-timeline', '#st-more-free', '.st-unplaced', '#stBeatView', '.ai-pill', '.nt-chip, [data-notes-pin], .nt-pin'
].map((q) => !!document.querySelector('#path-outline ' + q.split(', ').join(', #path-outline ')))), [true, true, true, true, true, true, true, true, true, true, true]);
check('lanes: no sideways page scroll at 1440', await overflow(page), false);
{ const bad = await contrastFails(page, '#path-outline'); truthy('lanes: text meets AA', !bad.length, bad.slice(0, 6)); }

/* ---- edit and colour a step in Lanes: the same save as before ---- */
const editId = stepsOf(S0, K('catalyst'))[0];
{
  const before = await story(page);
  await page.click(`#stStep_${editId}`);
  check('lanes: the caret in a card opens it', await page.$eval(`[data-step-row="${editId}"]`, (c) => [c.classList.contains('is-open'), c.querySelector('.st-card-open').getAttribute('aria-expanded')]), [true, 'true']);
  await page.fill(`#stStep_${editId}`, 'Lanes edit: the letter arrives.');
  await page.waitForTimeout(900);
  await page.click(`[data-st="step-color"][data-step="${editId}"][data-color="green"]`);
  await page.waitForTimeout(400);
  const after = await story(page);
  const st = after.outline.find((x) => x.id === editId);
  check('lanes: text and colour saved on the step', [st.text, st.color], ['Lanes edit: the letter arrives.', 'green']);
  truthy('lanes: nothing else in the story changed', onlyChanged(before, after, editId, ['text', 'color', 'u', 'synced']), null);
  check('lanes: the card wears the colour strip', await page.$eval(`[data-step-row="${editId}"]`, (c) => [c.classList.contains('bc-green'), getComputedStyle(c, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)']), [true, true]);
  await page.keyboard.press('Escape');
  check('Escape closes the card and the keyboard stays on it', [await page.$eval(`[data-step-row="${editId}"]`, (c) => c.classList.contains('is-open')), await active(page)], [false, 'card:' + editId]);
}

/* ---- the keyboard: Alt+arrows, and the buttons ------------------ */
{
  const cat = K('catalyst'), deb = K('debate');
  const debN = stepsOf(await story(page), deb).length;
  await page.focus(`[data-step-row="${editId}"]`);
  await page.keyboard.press('Alt+ArrowRight');
  await page.waitForTimeout(400);
  let s = await story(page);
  check('Alt+Right: to the next beat, at its end', [s.outline.find((x) => x.id === editId).beat, stepsOf(s, deb).indexOf(editId)], [deb, debN]);
  truthy('Alt+Right: the live region says where it went', /moved to Debate, position \d+ of \d+/.test(await live(page)), await live(page));
  check('Alt+Right: the keyboard is on the moved card', await active(page), 'card:' + editId);
  await page.keyboard.press('Alt+ArrowUp');
  await page.waitForTimeout(400);
  s = await story(page);
  check('Alt+Up: one place up inside the beat', stepsOf(s, deb).indexOf(editId), debN - 1);
  check('Alt+Up: still on the card', await active(page), 'card:' + editId);
  await page.keyboard.press('Enter');
  check('Enter opens the card into its text', await active(page), 'TEXTAREA');
  await page.click(`[data-st="step-down"][data-step="${editId}"]`);
  await page.waitForTimeout(400);
  s = await story(page);
  check('the Down button: back to the end', stepsOf(s, deb).indexOf(editId), debN);
  await page.click(`[data-st="step-prev-beat"][data-step="${editId}"]`);
  await page.waitForTimeout(400);
  s = await story(page);
  check('the Move left button: back under Catalyst, at its end', [s.outline.find((x) => x.id === editId).beat, stepsOf(s, cat).at(-1)], [cat, editId]);
  check('the Move left button keeps the keyboard on its twin', await active(page), `BUTTON[step-prev-beat:${editId}]`);
  truthy('the live region names Catalyst', /moved to Catalyst/.test(await live(page)), await live(page));
  /* arrows without Alt move the focus, never the step */
  const s1 = JSON.stringify((await story(page)).outline);
  await page.focus(`[data-step-row="${editId}"]`);
  await page.keyboard.press('ArrowRight');
  const onRight = await active(page);
  truthy('ArrowRight: the keyboard goes to the next lane', onRight.startsWith('card:') && stepsOf(await story(page), deb).includes(onRight.slice(5)), onRight);
  await page.keyboard.press('ArrowLeft');
  check('ArrowLeft: and back', await active(page), stepsOf(await story(page), cat).includes(editId) ? 'card:' + stepsOf(await story(page), cat)[0] : '');
  check('plain arrows wrote nothing', JSON.stringify((await story(page)).outline), s1);
}

/* ---- a pointer drag across lanes, and Escape ------------------- */
{
  const mid = K('midpoint');
  const dragId = stepsOf(await story(page), K('break_into_two')).at(-1);
  const midN = stepsOf(await story(page), mid).length;
  await page.locator(`.st-grip[data-step="${dragId}"]`).scrollIntoViewIfNeeded();
  const s0 = JSON.stringify(await story(page));
  await writes(page);
  await drag(page, dragId, () => below(page, `[data-beat-card="${mid}"] [data-drop-beat]`), { cancel: true });
  check('drag + Escape: nothing written, the card is back', [JSON.stringify(await story(page)) === s0, (await writes(page)).filter((k) => /story/.test(k)).length, await page.$$eval(`[data-step-row="${dragId}"]`, (n) => n.length), await page.$$eval('.st-dnd-ghost, .st-dnd-ph', (n) => n.length)], [true, 0, 1, 0]);
  await page.locator(`.st-grip[data-step="${dragId}"]`).scrollIntoViewIfNeeded();
  await drag(page, dragId, () => below(page, `[data-beat-card="${mid}"] [data-drop-beat]`));
  let s = await story(page);
  check('drag across lanes: the step lands at the end of Midpoint', [s.outline.find((x) => x.id === dragId).beat, stepsOf(s, mid).indexOf(dragId)], [mid, midN]);
  truthy('drag: the live region says where it went', /moved to Midpoint/.test(await live(page)), await live(page));
  check('drag: no ghost or placeholder left, the card is not open', await page.evaluate((id) => [document.querySelectorAll('.st-dnd-ghost, .st-dnd-ph').length, document.querySelector(`[data-step-row="${id}"]`).classList.contains('is-open')], dragId), [0, false]);
  /* …and the button route gives the same story: put it back by the buttons, drag again, compare */
  const viaDrag = JSON.stringify(s.outline.map((x) => [x.id, x.beat]));
  await page.selectOption(`select[data-st-field="step-beat"][data-step="${dragId}"]`, K('break_into_two')).catch(async () => {
    await openCard(page, dragId);
    await page.selectOption(`select[data-st-field="step-beat"][data-step="${dragId}"]`, K('break_into_two'));
  });
  await page.waitForTimeout(400);
  s = await story(page);
  /* the select appends at the end of Break into Two; then a drag to the top of its list */
  await page.locator(`.st-grip[data-step="${dragId}"]`).scrollIntoViewIfNeeded();
  await drag(page, dragId, async () => {
    const first = page.locator(`[data-beat-card="${K('break_into_two')}"] [data-drop-beat] > li.st-card:not(.is-dragging)`).first();
    const b = await first.boundingBox();
    return { x: b.x + b.width / 2, y: b.y + 4 };
  });
  check('drag inside a lane: to the top of its beat', stepsOf(await story(page), K('break_into_two'))[0], dragId);
  await openCard(page, dragId);
  for (let i = 0; i < 7; i++) {
    const w = (await story(page)).outline.find((x) => x.id === dragId).beat;
    if (w === mid) break;
    await page.click(`[data-st="step-next-beat"][data-step="${dragId}"]`);
    await page.waitForTimeout(300);
  }
  check('the buttons: the same story as the drag', JSON.stringify((await story(page)).outline.map((x) => [x.id, x.beat])), viaDrag);
}

/* ---- switch to the Spine ---------------------------------------- */
{
  const sBefore = await page.evaluate(() => localStorage.getItem('fms_story_v1'));
  const pBefore = await prefs(page);
  await writes(page);
  await page.click('#stBeatView [data-value="spine"]');
  await page.waitForTimeout(500);
  const w = await writes(page);
  const pAfter = await prefs(page);
  check('switch: the one write is the device prefs', [...new Set(w)], ['fms_studio_prefs_v1']);
  check('switch: only `beatView` changed in it', JSON.stringify({ ...pAfter, beatView: undefined }), JSON.stringify({ ...pBefore, beatView: undefined }));
  check('switch: beatView is spine, the story untouched', [pAfter.beatView, await page.evaluate(() => localStorage.getItem('fms_story_v1')) === sBefore], ['spine', true]);
  check('switch: the keyboard is on the pressed half', await page.evaluate(() => [document.activeElement.getAttribute('data-value'), document.activeElement.getAttribute('aria-pressed')]), ['spine', 'true']);
  check('spine: drawn', await page.$eval('#path-outline .st-sp', (b) => b.dataset.view).catch(() => null), 'spine');
  const spIds = await ids(page);
  check('spine: the same step ids as the lanes', [...spIds].sort(), [...laneIds].sort());
  check('spine: the same beats, in order', await beats(page), laneBeats);
  check('spine: the Unassigned station is last', await page.$$eval('#path-outline .st-sp-spine > li:last-child.st-unplaced', (n) => n.length), 1);
  await writes(page);
  await page.waitForTimeout(3000);
  check('spine idle: nothing written', await writes(page), []);
}
{
  const g = await page.evaluate(() => {
    const sp = document.querySelector('.st-sp-spine').getBoundingClientRect();
    const mid = sp.left + sp.width / 2;
    const st = [...document.querySelectorAll('.st-sp-station:not(.st-unplaced)')];
    return {
      sides: st.map((x) => x.dataset.side).join(''),
      placed: st.every((x) => { const r = x.getBoundingClientRect(); return x.dataset.side === 'l' ? r.right < mid : r.left > mid; }),
      acts: [...document.querySelectorAll('.st-sp-act')].map((a) => a.textContent)
    };
  });
  check('spine: stations alternate left and right of the spine', [g.sides.slice(0, 6), g.placed], ['lrlrlr', true]);
  check('spine: act breaks are labelled stops', g.acts, ['Act 1', 'Act 2', 'Act 3']);
  const fun = `[data-beat-card="${FUN}"]`;
  const n = stepsOf(await story(page), FUN).length;
  check('spine: a long beat shows three cards and "+N more"', await page.evaluate((f) => {
    const st = document.querySelector(f);
    return [[...st.querySelectorAll('li.st-card')].filter((c) => !c.hidden).length, st.querySelector('.st-sp-more').textContent, st.querySelector('.st-sp-more').getAttribute('aria-expanded')];
  }, fun), [3, '+' + (n - 3) + ' more', 'false']);
  await page.click(`${fun} .st-sp-more`);
  check('spine: "+N more" shows every card', await page.evaluate((f) => {
    const st = document.querySelector(f);
    return [[...st.querySelectorAll('li.st-card')].filter((c) => !c.hidden && c.getClientRects().length).length, st.querySelector('.st-sp-more').textContent, document.activeElement === st.querySelector('.st-sp-more')];
  }, fun), [n, 'Show fewer', true]);
  await page.click(`${fun} .st-sp-more`);
  check('spine: "Show fewer" folds it back', await page.$$eval(`${fun} li.st-card`, (c) => c.filter((x) => !x.hidden).length), 3);
  check('spine: no sideways page scroll at 1440', await overflow(page), false);
  { const bad = await contrastFails(page, '#path-outline'); truthy('spine: text meets AA', !bad.length, bad.slice(0, 6)); }
}

/* ---- edit, colour and move in the Spine ------------------------- */
{
  const id = stepsOf(await story(page), K('debate'))[0];
  const before = await story(page);
  await page.click(`#stStep_${id}`);
  await page.fill(`#stStep_${id}`, 'Spine edit: he weighs it up.');
  await page.waitForTimeout(900);
  await page.click(`[data-st="step-color"][data-step="${id}"][data-color="blue"]`);
  await page.waitForTimeout(400);
  const after = await story(page);
  const st = after.outline.find((x) => x.id === id);
  check('spine: text and colour saved on the step', [st.text, st.color], ['Spine edit: he weighs it up.', 'blue']);
  truthy('spine: nothing else in the story changed', onlyChanged(before, after, id, ['text', 'color', 'u', 'synced']), null);
  await page.click(`[data-st="step-color"][data-step="${id}"][data-color="blue"]`);
  await page.waitForTimeout(300);
  check('spine: pressing the lit colour clears it', (await story(page)).outline.find((x) => x.id === id).color || '', '');
  await page.focus(`[data-step-row="${id}"]`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Alt+ArrowLeft');
  await page.waitForTimeout(400);
  check('spine Alt+Left: to the previous beat', (await story(page)).outline.find((x) => x.id === id).beat, K('catalyst'));
  check('spine Alt+Left: the keyboard is on the moved card', await active(page), 'card:' + id);
  await page.keyboard.press('Alt+ArrowRight');
  await page.waitForTimeout(400);
  check('spine Alt+Right: and back', (await story(page)).outline.find((x) => x.id === id).beat, K('debate'));
  /* a drag on the spine: into the station after it */
  const target = K('break_into_two');
  const n = stepsOf(await story(page), target).length;
  await page.locator(`.st-grip[data-step="${id}"]`).scrollIntoViewIfNeeded();
  await drag(page, id, () => below(page, `[data-beat-card="${target}"] [data-drop-beat]`));
  let s = await story(page);
  check('spine drag: lands at the end of Break into Two', [s.outline.find((x) => x.id === id).beat, stepsOf(s, target).indexOf(id)], [target, n]);
  /* the Up button, and Previous beat, from the card */
  await openCard(page, id);
  await page.click(`[data-st="step-up"][data-step="${id}"]`);
  await page.waitForTimeout(300);
  check('spine Up button: one place up', stepsOf(await story(page), target).indexOf(id), n - 1);
  await page.click(`[data-st="step-prev-beat"][data-step="${id}"]`);
  await page.waitForTimeout(300);
  check('spine Previous beat button: back under Debate', (await story(page)).outline.find((x) => x.id === id).beat, K('debate'));
}

/* ---- the pref survives a reload --------------------------------- */
await goOutline(page);
check('reload: still the spine', await page.$eval('#path-outline .st-sp', (b) => b.dataset.view).catch(() => null), 'spine');

/* ---- locked: no grips, no move buttons -------------------------- */
await page.click('[data-st="lock"]');
await page.waitForTimeout(400);
check('locked spine: no grip, no move button, no open toggle; text read-only', await page.evaluate(() => [
  document.querySelectorAll('#path-outline .st-grip, #path-outline [data-st="step-up"], #path-outline [data-st="step-next-beat"], #path-outline [data-st="step-open"]').length,
  [...document.querySelectorAll('#path-outline .st-ol-text')].every((t) => t.readOnly)]), [0, true]);
await page.click('#stBeatView [data-value="lanes"]');
await page.waitForTimeout(400);
check('locked lanes: the same', await page.evaluate(() => document.querySelectorAll('#path-outline .st-grip, #path-outline [data-st="step-prev-beat"], #path-outline [data-st="step-down"]').length), 0);
{
  const s0 = JSON.stringify(await story(page));
  const c = await page.$(`#path-outline li.st-card`);
  await c.focus();
  await page.keyboard.press('Alt+ArrowRight');
  await page.waitForTimeout(300);
  check('locked: Alt+Right moves nothing', JSON.stringify(await story(page)) === s0, true);
}
await page.click('#stLockRow [data-st="unlock"]');
await page.waitForTimeout(400);

/* ---- widths: 1100 and 390, both views ---------------------------- */
for (const [w, hgt] of [[1100, 900], [390, 844]]) {
  await page.setViewportSize({ width: w, height: hgt });
  for (const v of ['lanes', 'spine']) {
    const pressed = await page.$eval(`#stBeatView [data-value="${v}"]`, (b) => b.getAttribute('aria-pressed'));
    if (pressed !== 'true') { await page.click(`#stBeatView [data-value="${v}"]`); await page.waitForTimeout(400); }
    await page.waitForTimeout(300);
    check(`${w}px ${v}: no sideways page scroll`, await overflow(page), false);
    if (w === 390 && v === 'lanes') {
      const g = await page.evaluate(() => {
        const sc = document.querySelector('.st-bl-scroll');
        const lane = document.querySelector('.st-bl-lane');
        return { ratio: lane.getBoundingClientRect().width / sc.clientWidth, snap: getComputedStyle(sc).scrollSnapType, nav: getComputedStyle(document.querySelector('.st-bl-nav')).display, pos: document.querySelector('.st-bl-pos').textContent };
      });
      truthy('390 lanes: a lane is 85% of the scroller and snaps one at a time', Math.abs(g.ratio - 0.85) < 0.03 && /x mandatory/.test(g.snap) && g.nav === 'flex', g);
      check('390 lanes: the indicator starts at beat 1', g.pos, 'Beat 1 of 15');
      await page.click('[data-st="lane-next"]');
      await page.waitForTimeout(900);
      check('390 lanes: Next beat moves one lane', await page.$eval('.st-bl-pos', (p) => p.textContent), 'Beat 2 of 15');
      const tgt = await page.evaluate(() => [...document.querySelectorAll('.st-grip, .st-card-open, [data-st="lane-next"]')].filter((b) => b.getClientRects().length).every((b) => b.getBoundingClientRect().height >= 24));
      check('390 lanes: the grips and buttons are real targets', tgt, true);
      const bad = await contrastFails(page, '#path-outline'); truthy('390 lanes: text meets AA', !bad.length, bad.slice(0, 6));
    }
    if (w === 390 && v === 'spine') {
      const g = await page.evaluate(() => {
        const sp = document.querySelector('.st-sp-spine').getBoundingClientRect();
        const st = [...document.querySelectorAll('.st-sp-station')];
        return { right: st.every((x) => x.getBoundingClientRect().left >= sp.left + 40), line: parseFloat(getComputedStyle(document.querySelector('.st-sp-spine'), '::before').left) };
      });
      truthy('390 spine: the spine is at the left edge, every station right of it', g.right && g.line < 24, g);
      const bad = await contrastFails(page, '#path-outline'); truthy('390 spine: text meets AA', !bad.length, bad.slice(0, 6));
    }
    if (w === 1100) {
      const bad = await contrastFails(page, '#path-outline'); truthy(`1100 ${v}: text meets AA`, !bad.length, bad.slice(0, 6));
    }
  }
}
await ctx.close();

/* ---- reduced motion: no tilt on the ghost ------------------------ */
{
  const { ctx: c2, page: p2 } = await newPage({ reducedMotion: 'reduce' });
  await openSample(p2);
  await goOutline(p2);
  check('reduced motion: --motion is 0', await p2.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--motion').trim()), '0');
  const id = stepsOf(await story(p2), K('setup'))[0];
  const s0 = JSON.stringify(await story(p2));
  const g = await p2.locator(`.st-grip[data-step="${id}"]`).boundingBox();
  await p2.mouse.move(g.x + 5, g.y + 5);
  await p2.mouse.down();
  await p2.mouse.move(g.x + 40, g.y + 60, { steps: 6 });
  await p2.waitForTimeout(150);
  const t = await p2.$eval('.st-dnd-ghost', (x) => getComputedStyle(x).transform).catch(() => 'no ghost');
  truthy('reduced motion: the ghost is not tilted', t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)', t);
  await p2.keyboard.press('Escape');
  await p2.mouse.up();
  await p2.waitForTimeout(300);
  check('reduced motion: Escape wrote nothing', JSON.stringify(await story(p2)) === s0, true);
  await c2.close();
}

check('no page errors', errors, []);
await browser.close();
server.close();
console.log(`\n${failed ? '✗' : '✓'} prove:beat-views — ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
