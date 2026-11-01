/* ============================================================
   PROOF: the four pre-production AI tasks (docs/AI-EVERYWHERE.md 1-4)
   — shoot-order, recce-notes, budget-estimate, callsheet-notes — in a
   real Chromium against the shared Supabase fake (aiScenario()) and a
   FAKED Anthropic (this file answers; no key, no network).

     (a) LOCKED — signed out: each pill is on its page, greyed and
         aria-disabled; a click asks the Pro question and the Desk
         never opens
     (b) PRO + KEY, per task: the pill opens the Desk; the input shows
         what would be sent (and holds nothing private); nothing is sent
         before Run and nothing is written before Accept; three idle
         seconds write nothing; the reply is checked against what was
         sent; Accept writes exactly what the spec allows and leaves a
         typed value alone; Undo restores only what was written
     (c) callsheet-notes refuses a sheet whose notes are already typed

   Run:  VITE_SITE_GATE=off npx vite build --outDir dist-p3-0
         PROVE_DIST=dist-p3-0 PROVE_PORT=6011 node scripts/prove-ai-preprod.mjs
         (PW_CHROMIUM=/path/to/chromium for a sandboxed browser)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5392;
const BASE = 'http://localhost:' + PORT;
if (!fs.existsSync(path.join(DIST, 'stripboard.html'))) { console.error('no stripboard.html in ' + DIST + ': build first'); process.exit(2); }
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('this proof needs the OPEN build (VITE_SITE_GATE=off)'); process.exit(2); }
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond || detail === undefined ? '' : '\n        ' + JSON.stringify(detail)));
  return !!cond;
}
const KEY = 'sk-ant-PROVEPROVEPROVEPROVE12';

/* ---- the seeded film ------------------------------------------- */
const PRIVATE = ['9876501234', 'Apollo Hospital 044 2222 3333', '12 Secret Street', 'owner@example.com'];
const SCENES = [
  { id: 's1', number: '1', intExt: 'INT', location: 'House', dayNight: 'DAY', eighths: 8, shootDay: 1, shotState: 'shot', synopsis: 'Anbu counts coins.', elements: { cast: ['Anbu'] } },
  { id: 's2', number: '2', intExt: 'EXT', location: 'Street', dayNight: 'NIGHT', eighths: 4, shootDay: 1, synopsis: 'A chase.', elements: { cast: ['Anbu', 'Meena'] } },
  { id: 's3', number: '3', intExt: 'INT', location: 'House', dayNight: 'NIGHT', eighths: 8, synopsis: 'Meena waits for Anbu.', elements: { cast: ['Meena'], extras: ['Crowd'], vehicles: ['Auto'] } },
  { id: 's4', number: '4', intExt: 'EXT', location: 'Street', dayNight: 'DAY', eighths: 6, synopsis: 'The bus stand.', elements: { cast: ['Anbu'] } },
  { id: 's5', number: '5', intExt: 'INT', location: 'House', dayNight: 'DAY', eighths: 8, shootDay: 2, synopsis: 'Breakfast.', elements: { cast: ['Anbu', 'Meena'] } }
];
const LOCATIONS = { days: {}, order: { 2: ['s5'] }, media: [], recces: {
  house: { power: 'TYPED power note', address: PRIVATE[2], contact: PRIVATE[0], hospital: PRIVATE[1] },
  street: {}
} };
const CALC = { ci_1_item: 'DOP', ci_1_custom: '', ci_1_days: '6', ci_1_rate: '40000' };
const SHEET = { id: 'cs1', title: 'Day 2', date: '2026-11-03', generalCall: '06:00', wrap: '19:00', location: 'House', notes: '', sceneIds: ['s3', 's5'], calls: {} };
const CONTACTS = { contacts: [{ id: 'c1', name: 'Ravi Kumar', department: 'Camera', role: 'DOP', phone: PRIVATE[0], email: PRIVATE[3] }], callSheets: [SHEET] };
const SCRIPT = { elements: [{ id: 'e1', type: 'scene', text: 'INT. HOUSE - DAY' }, { id: 'e2', type: 'character', text: 'ANBU' }, { id: 'e3', type: 'dialogue', text: 'Hello.' }], revisions: [], documents: [] };

/* ---- the fake model: which task is asking is the system prompt --- */
const requests = [];
const factsOf = (user) => { const m = /\(JSON\):\n(\{.*\})/.exec(user); return m ? JSON.parse(m[1]) : {}; };
function answer(system, user) {
  if (/first assistant director/.test(system)) {
    return { days: [
      { day: 2, sceneIds: ['s5', 's3'], why: 'Both at the house.' },
      { day: 3, sceneIds: ['s4', 'ghost'], why: 'The street.' },
      { day: 1, sceneIds: ['s3'], why: 'a day that has begun shooting' }
    ], note: 'Night scene last.' };
  }
  if (/location manager/.test(system)) {
    return { places: [
      { name: 'house', ideas: 'Listen for the road and the neighbours.', checklist: ['Best time: before the school run?', 'Power: where is the mains point?', 'Parking: can the van reach the gate?', 'Toilets: any on site?', 'Cost: 5000'] },
      { name: 'Nowhere', ideas: 'x', checklist: [] }
    ] };
  }
  if (/line producer/.test(system)) {
    return { lines: [
      { item: 'Gaffer', days: 6, rate: 900000, reason: 'One gaffer for the shoot.' },
      { item: 'DOP', days: 6, rate: 40000, reason: 'already there' },
      { item: 'Clapper loader', days: 6, rate: 2500, reason: 'Camera department.' }
    ], note: 'No post-production.' };
  }
  if (/call sheet/.test(system)) {
    return { notes: 'Water and snacks on set.\nPark behind the house.', unitMessage: '*Day 2*\nGeneral call: 06:00. Park behind the house.' };
  }
  return {};
}
async function aiRoute(r) {
  const req = r.request();
  const body = JSON.parse(req.postData() || '{}');
  const user = body.messages ? body.messages[0].content : '';
  const system = typeof body.system === 'string' ? body.system : JSON.stringify(body.system || '');
  requests.push({ url: req.url(), user, system, key: req.headers()['x-api-key'] || '' });
  return r.fulfill({ status: 200, contentType: 'text/event-stream', body: anthropicSSE(answer(system, user)) });
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
async function context({ tok = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(SB) && !/^https:\/\/api\.anthropic\.com\//.test(u.href)
    && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), (r) => r.abort());
  await ctx.route(SB + '/**', handle);
  await ctx.route(/^https:\/\/api\.anthropic\.com\//, aiRoute);
  await ctx.addInitScript(([k, v, uid]) => {
    window.__writes = [];
    const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (a, b) { if (this === localStorage) window.__writes.push({ k: String(a), t: performance.now() }); return set.call(this, a, b); };
    Storage.prototype.removeItem = function (a) { if (this === localStorage) window.__writes.push({ k: String(a), t: performance.now(), rm: true }); return rem.call(this, a); };
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, tok ? [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => { errors.push('native dialog: ' + d.type() + ' ' + d.message()); d.dismiss().catch(() => {}); });
  return { ctx, page, errors };
}

async function seed(page, { key = false, calc = CALC, sheet = SHEET } = {}) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ scenes, locs, calc, contacts, script, key, KEY }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Preprod Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    localStorage.setItem('fms_locations_v1', JSON.stringify(locs));
    localStorage.setItem('fms_library_calc_v1', JSON.stringify(calc));
    localStorage.setItem('fms_contacts_v1', JSON.stringify(contacts));
    localStorage.setItem('fms_script_v1', JSON.stringify(script));
    if (key) { S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', KEY); }
  }, { scenes: SCENES, locs: LOCATIONS, calc, contacts: { ...CONTACTS, callSheets: [sheet] }, script: SCRIPT, key, KEY });
}
const read = (page, key) => page.evaluate((k) => { const x = Object.keys(localStorage).find((n) => n === k || n.startsWith(k + '__')); return x ? JSON.parse(localStorage.getItem(x)) : null; }, key);
const scenesNow = async (page) => (await read(page, 'fms_scenes_v1')).scenes;
const dayOfNow = async (page, id) => (await scenesNow(page)).find((s) => s.id === id).shootDay || 0;
const planKnown = async (page) => { for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100); await page.waitForTimeout(900); };
const deskOpen = (page) => page.evaluate(() => { const d = document.querySelector('aside.ai-desk'); return !!d && !d.hidden && d.getBoundingClientRect().width > 0; });
const deskInput = (page) => page.locator('aside.ai-desk .ai-desk-input').inputValue().catch(() => '');
const deskText = (page) => page.evaluate(() => (document.querySelector('aside.ai-desk') || {}).textContent || '');

async function openDesk(page, selector, taskId) {
  const p = page.locator(selector).first();
  await p.waitFor({ state: 'attached', timeout: 15000 });
  await p.scrollIntoViewIfNeeded().catch(() => {});
  await p.click();
  const item = page.locator(`[data-action="ai-pill-task"][data-task="${taskId}"]`).first();
  try { await item.waitFor({ state: 'visible', timeout: 1200 }); await item.click(); } catch (e) { /* a one-task pill opened the Desk itself */ }
  await page.waitForFunction(() => { const d = document.querySelector('aside.ai-desk'); return d && !d.hidden && d.getBoundingClientRect().width > 0; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(500);
}
async function run(page) {
  await page.click('aside.ai-desk [data-action="ai-desk-run"]');
  await page.waitForSelector('aside.ai-desk .ai-desk-answer, aside.ai-desk .ai-error', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}
const untick = (page, id) => page.locator(`aside.ai-desk input[data-tick="item"][data-id="${id}"]`).uncheck();
async function undo(page) {
  const u = page.locator('.toast-action', { hasText: /Undo/ }).last();
  const has = await u.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  ok(has, 'an Undo toast is offered');
  if (has) await u.click();
  await page.waitForTimeout(500);
}
async function idleWrites(page, label) {
  await page.waitForTimeout(400);
  const n = await page.evaluate(() => window.__writes.length);
  await page.waitForTimeout(3000);
  const w = await page.evaluate((n) => window.__writes.slice(n).map((x) => x.k), n);
  ok(w.length === 0, label + ': three idle seconds with the Desk open write nothing', w);
}

const PAGES = [
  ['shoot-order', '/stripboard.html', '.sb-acts .ai-pill'],
  ['recce-notes', '/plan.html#locations', '#locations .pl-ai-row .ai-pill'],
  ['budget-estimate', '/budget.html', '#estimate .ai-pill'],
  ['callsheet-notes', '/contacts.html#call-sheets', '.ct-ai-row .ai-pill']
];

/* =================================================================
   (a) LOCKED
   ================================================================= */
console.log('(a) locked: signed out');
{
  F.reset();
  const { ctx, page, errors } = await context({ tok: null });
  try {
    await seed(page, { key: true });
    for (const [id, url, sel] of PAGES) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const p = page.locator(sel).first();
      const there = await p.waitFor({ state: 'attached', timeout: 15000 }).then(() => true, () => false);
      ok(there, id + ': the pill is on ' + url);
      if (!there) continue;
      const st = await p.evaluate((el) => ({ state: el.dataset.aiState, aria: el.getAttribute('aria-disabled'), disabled: el.disabled, text: el.textContent }));
      ok(st.state === 'locked' && st.aria === 'true' && !st.disabled && /Pro/.test(st.text), id + ': locked, aria-disabled, says Pro', st);
      await p.scrollIntoViewIfNeeded().catch(() => {});
      await p.click({ force: true });
      const shown = await page.locator('.dlg').waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      ok(shown && /AI tools come with Pro/.test(await page.locator('.dlg').textContent()), id + ': a click asks the Pro question');
      ok(!(await deskOpen(page)), id + ': the Desk did not open');
      await page.locator('.dlg button', { hasText: 'Not now' }).click().catch(() => {});
      await page.waitForTimeout(300);
    }
    ok(requests.length === 0, 'nothing was sent while locked', requests.length);
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'locked scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

/* =================================================================
   (b) PRO + KEY
   ================================================================= */
async function pro(label, fn, opts = {}) {
  console.log(label);
  F.reset();
  requests.length = 0;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try { await seed(page, { key: true, ...opts }); await fn(page); ok(errors.length === 0, 'no page errors', errors); }
  catch (e) { ok(false, 'scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { await ctx.close(); }
}
const noPrivate = (what) => ok(requests.every((r) => PRIVATE.every((x) => !r.user.includes(x))), what + ': nothing private left the browser', requests.map((r) => r.user.slice(0, 80)));
const header = () => ok(requests.length > 0 && requests.every((r) => r.key === KEY && !r.url.includes(KEY)), 'the key went in a header, never in the URL');

await pro('(b1) shoot-order', async (page) => {
  await page.goto(BASE + '/stripboard.html', { waitUntil: 'networkidle' });
  await planKnown(page);
  const before = await read(page, 'fms_scenes_v1');
  const orderBefore = JSON.stringify((await read(page, 'fms_locations_v1')).order);
  await openDesk(page, '.sb-acts .ai-pill', 'shoot-order');
  ok(await deskOpen(page), 'the pill opens the Desk');
  const input = await deskInput(page);
  const f = factsOf(input);
  ok(JSON.stringify((f.scenes || []).map((s) => s.id)) === '["s3","s4","s5"]', 'the input shows only scenes that may move (not the shot s1, not s2 on a day that has begun shooting)', (f.scenes || []).map((s) => s.id));
  ok(!input.includes('Meena waits') && !input.includes('Anbu counts'), 'no synopsis is shown or sent');
  ok(requests.length === 0, 'nothing was sent before Run', requests.length);
  await run(page);
  header();
  ok(requests.length === 1 && requests[0].user.trim() === input.trim(), 'what was sent is what the Desk showed');
  const items = await page.$$eval('aside.ai-desk label.ai-desk-item', (l) => l.map((x) => ({ id: x.querySelector('input').dataset.id, t: x.textContent })));
  ok(items.map((i) => i.id).join() === 'd2,d3' && /Day 2: Sc 5, 3/.test(items[0].t) && /Day 3: Sc 4/.test(items[1].t), 'a day per item; the unknown id, the locked day are dropped', items);
  ok(JSON.stringify(await read(page, 'fms_scenes_v1')) === JSON.stringify(before) && JSON.stringify((await read(page, 'fms_locations_v1')).order) === orderBefore, 'nothing written before Accept');
  await idleWrites(page, 'shoot-order');
  await untick(page, 'd3');
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1200);
  ok(await dayOfNow(page, 's3') === 2 && await dayOfNow(page, 's5') === 2, 'the ticked day is placed (s3 and s5 on day 2)');
  ok(await dayOfNow(page, 's4') === 0, 'the unticked day is not');
  ok(await dayOfNow(page, 's1') === 1 && await dayOfNow(page, 's2') === 1 && (await scenesNow(page)).find((s) => s.id === 's1').shotState === 'shot', 'the day that has begun shooting is untouched, the shot scene stays shot');
  ok(JSON.stringify((await read(page, 'fms_locations_v1')).order['2']) === '["s5","s3"]', 'the day order is the proposal');
  await undo(page);
  ok(await dayOfNow(page, 's3') === 0 && await dayOfNow(page, 's5') === 2, 'Undo puts s3 back and leaves s5 where it was');
  ok(JSON.stringify((await read(page, 'fms_locations_v1')).order['2']) === '["s5"]', 'and the day order as it was');
  noPrivate('shoot-order');
});

await pro('(b2) recce-notes', async (page) => {
  await page.goto(BASE + '/plan.html#locations', { waitUntil: 'networkidle' });
  await planKnown(page);
  const before = JSON.stringify(await read(page, 'fms_locations_v1'));
  await openDesk(page, '#locations .pl-ai-row .ai-pill', 'recce-notes');
  ok(await deskOpen(page), 'the pill opens the Desk');
  const input = await deskInput(page);
  ok(PRIVATE.every((x) => !input.includes(x)) && !/"address"|"contact"|"hospital"|"lat"|"cost"/.test(input), 'the input shows no address, contact, hospital, pin or cost');
  const f = factsOf(input);
  const house = (f.places || []).find((p) => p.name === 'House');
  ok(house && !house.empty.includes('power') && house.empty.includes('notes'), 'the typed power field is not offered for filling', house && house.empty);
  ok(requests.length === 0, 'nothing was sent before Run');
  await run(page);
  header();
  const items = await page.$$eval('aside.ai-desk label.ai-desk-item', (l) => l.map((x) => ({ id: x.querySelector('input').dataset.id, t: x.textContent })));
  ok(items.length === 1 && /House/.test(items[0].t) && /To check:/.test(items[0].t) && !/Cost|5000/.test(items[0].t), 'one place (the unknown name dropped); written as things to check; no cost line', items);
  ok(JSON.stringify(await read(page, 'fms_locations_v1')) === before, 'nothing written before Accept');
  await idleWrites(page, 'recce-notes');
  /* the writer fills one field between Run and Accept */
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((n) => n.startsWith('fms_locations_v1'));
    const b = JSON.parse(localStorage.getItem(k)); b.recces.house.bestTime = 'TYPED later'; localStorage.setItem(k, JSON.stringify(b));
  });
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await page.waitForTimeout(1200);
  let r = (await read(page, 'fms_locations_v1')).recces.house;
  ok(/^To check:/.test(r.notes) && /^To check:/.test(r.parking) && /^To check:/.test(r.toilets), 'blank notes, parking and toilets are filled', r);
  ok(r.bestTime === 'TYPED later' && r.power === 'TYPED power note', 'a field typed meanwhile and a field typed before are left alone', r);
  ok(r.address === PRIVATE[2] && r.contact === PRIVATE[0] && r.hospital === PRIVATE[1] && !r.cost && !r.lat && (r.permission || 'unknown') === 'unknown', 'address, contact, hospital, cost, pin, permission untouched', r);
  ok(!((await read(page, 'fms_locations_v1')).recces.street || {}).notes, 'a place the model did not answer for (Street) is left blank');
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find((n) => n.startsWith('fms_locations_v1'));
    const b = JSON.parse(localStorage.getItem(k)); b.recces.house.parking = 'I rewrote parking'; localStorage.setItem(k, JSON.stringify(b));
  });
  await undo(page);
  r = (await read(page, 'fms_locations_v1')).recces.house;
  ok(!r.notes && !r.toilets, 'Undo blanks the fields still as written', r);
  ok(r.parking === 'I rewrote parking' && r.bestTime === 'TYPED later' && r.power === 'TYPED power note', 'and leaves the edited and the typed ones', r);
  noPrivate('recce-notes');
});

await pro('(b3) budget-estimate', async (page) => {
  await page.goto(BASE + '/budget.html', { waitUntil: 'networkidle' });
  await planKnown(page);
  const before = await read(page, 'fms_library_calc_v1');
  await openDesk(page, '#estimate .ai-pill', 'budget-estimate');
  ok(await deskOpen(page), 'the pill opens the Desk');
  const input = await deskInput(page);
  const f = factsOf(input);
  ok(JSON.stringify(f.alreadyOnTheSheet) === '["DOP"]' && !input.includes('40000'), 'existing line names are shown, amounts are not', f.alreadyOnTheSheet);
  ok(f.currency === 'INR' && f.castCount === 2 && f.extrasTags === 1 && f.vehicleTags === 1 && f.speakingParts === 1, 'cast, speaking parts, extras, vehicles and currency are counted', f);
  ok(requests.length === 0, 'nothing was sent before Run');
  await run(page);
  header();
  const items = await page.$$eval('aside.ai-desk label.ai-desk-item', (l) => l.map((x) => ({ id: x.querySelector('input').dataset.id, t: x.textContent })));
  ok(items.length === 2 && /Gaffer, 6 days/.test(items[0].t) && /Clapper loader, 6 days/.test(items[1].t), 'the line already on the sheet is left out', items);
  ok(/Outside the rate card/.test(items[0].t), 'a rate outside the card band is flagged, not dropped', items[0].t);
  ok(JSON.stringify(await read(page, 'fms_library_calc_v1')) === JSON.stringify(before), 'nothing written before Accept');
  await idleWrites(page, 'budget-estimate');
  await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
  await page.waitForTimeout(1200);
  const now = await read(page, 'fms_library_calc_v1');
  ok(now.ci_2_item === 'Gaffer' && now.ci_2_days === '6' && now.ci_2_rate === '900000' && now.ci_3_custom === 'Clapper loader' && now.ci_3_item === '', 'new rows ci_2 and ci_3 are written (preset in _item, custom in _custom)', now);
  ok(Object.keys(before).every((k) => now[k] === before[k]), 'the existing row is not edited');
  const shown = await page.evaluate(() => ({ g: (document.querySelector('[data-key="ci_2_rate"]') || {}).value, c: (document.querySelector('[data-key="ci_3_custom"]') || {}).value }));
  ok(shown.g === '900000' && shown.c === 'Clapper loader', 'the estimator shows the new rows', shown);
  await undo(page);
  const gone = await read(page, 'fms_library_calc_v1');
  ok(!Object.keys(gone).some((k) => /^ci_[23]_/.test(k)) && gone.ci_1_item === 'DOP' && gone.ci_1_rate === '40000', 'Undo removes exactly the new rows', gone);
  noPrivate('budget-estimate');
});

await pro('(b4) callsheet-notes', async (page) => {
  await page.goto(BASE + '/contacts.html#call-sheets', { waitUntil: 'networkidle' });
  await planKnown(page);
  const before = JSON.stringify(await read(page, 'fms_contacts_v1'));
  await openDesk(page, '.ct-ai-row .ai-pill', 'callsheet-notes');
  ok(await deskOpen(page), 'the pill opens the Desk');
  const input = await deskInput(page);
  ok(PRIVATE.every((x) => !input.includes(x)) && !/Ravi|maps\.google|hospital/i.test(input), 'the input shows no crew name, phone, e-mail, map link or hospital');
  ok(/General call: 06:00/.test(input) && /"generalCall":"06:00"/.test(input), 'it shows the day facts and the unit-message example');
  ok(requests.length === 0, 'nothing was sent before Run');
  await run(page);
  header();
  const text = await deskText(page);
  ok(/Water and snacks on set/.test(text) && /Unit message to copy/.test(text), 'the draft and the unit message are shown');
  ok(JSON.stringify(await read(page, 'fms_contacts_v1')) === before, 'nothing written before Accept');
  await idleWrites(page, 'callsheet-notes');
  await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
  await page.waitForTimeout(1200);
  let sheet = (await read(page, 'fms_contacts_v1')).callSheets[0];
  ok(sheet.notes === 'Water and snacks on set.\nPark behind the house.', 'the sheet\'s notes are filled', sheet.notes);
  ok(JSON.stringify(sheet.sceneIds) === JSON.stringify(SHEET.sceneIds) && sheet.location === 'House' && sheet.generalCall === '06:00', 'nothing else on the sheet changed');
  ok(!JSON.stringify(await read(page, 'fms_contacts_v1')).includes('*Day 2*'), 'the unit message is not stored');
  const boxVal = await page.locator('.ct-sheet-notes').first().inputValue();
  ok(boxVal === sheet.notes, 'the notes box on the page shows the draft', boxVal);
  ok(await page.locator('.toast-action', { hasText: /Copy it/ }).count() > 0, 'a Copy affordance for the unit message is offered');
  await undo(page);
  sheet = (await read(page, 'fms_contacts_v1')).callSheets[0];
  ok(sheet.notes === '', 'Undo restores empty notes', sheet.notes);
  noPrivate('callsheet-notes');
});

await pro('(c) callsheet-notes refuses typed notes', async (page) => {
  await page.goto(BASE + '/contacts.html#call-sheets', { waitUntil: 'networkidle' });
  await planKnown(page);
  await openDesk(page, '.ct-ai-row .ai-pill', 'callsheet-notes');
  await run(page);
  ok(/Notes are already written/.test(await deskText(page)), 'the task refuses in its own sentence');
  ok(requests.length === 0, 'and sends nothing');
}, { sheet: { ...SHEET, notes: 'Typed by the writer.' } });

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
