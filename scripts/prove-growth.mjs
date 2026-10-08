/* ============================================================
   PROOF: the growth line, the WhatsApp link, the tour's storage
   contract, and the public view link (design, flag OFF)
   ------------------------------------------------------------
   Builds its own dist (dist-growth/) with the three build settings the
   features read — the site gate OFF (so the app pages load signed out,
   as verify loads them), VITE_SUPPORT_WHATSAPP set, VITE_PUBLIC_VIEW=on
   — and serves it with Supabase replaced by scripts/fake-supabase.mjs,
   plus ONE extra RPC this script fakes itself: public_view_open(), the
   proposal in the report (it is in no schema section). The shared fake
   is not edited.

   Asserted:
     (a) WHATSAPP: the footer, Settings → Plan and invite.html carry a
         wa.me link with the cleaned digits
     (b) THE CALL SHEET: the footer's line is hidden on screen, hidden in
         print, and shown in print only while a call sheet prints
     (c) THE PITCH DECK: the PDF's last slide carries the line
     (d) A PAID MEMBER: Settings → Plan offers the switch; unticking it
         writes `branding: 'off'` into fms_studio_prefs_v1 (and nothing
         else), the line leaves the call sheet, and the member's ?ref=
         code from billing_status() is on it before that
     (e) A FREE MEMBER and a paid plan whose features untick
         remove_branding: no switch, and a stored 'off' is ignored
     (f) THE SCREENING ROOM closes with the line
     (g) THE TOUR: no storage write on load, the checklist is derived
         (seven items, the sample ticks six), only clicks write
         fms_tour_v1, Esc ends it and focus is inside each step
     (h) PUBLIC VIEW: a call sheet opens from #view=<token>; the token
         leaves the address bar; no phone or e-mail is drawn; nothing
         is written to storage; the line is shown, or not when the row
         says branding:false; an expired or revoked token, a malformed
         one (no request made) and a payload carrying a private key are
         all refused with a sentence
     (i) the snapshot model, in Node: phone, e-mail and private notes
         never survive snapshotCallSheet(), redaction of free text
     (j) FLAG OFF (when dist-verify/ exists — the open build verify
         uses): #view= is ignored and no public_view_open call is made

   Run:  node scripts/prove-growth.mjs     (SKIP_BUILD=1 to reuse dist-growth)
   ============================================================ */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor } from './fake-supabase.mjs';
import * as Model from '../src/lib/public-view-model.js';
const BRAND = JSON.parse(fs.readFileSync(new URL('../src/data/brand.json', import.meta.url), 'utf8'));
const MADE = 'Made with ' + BRAND.name + ' — ' + BRAND.host + BRAND.path;
const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = 'dist-growth';
const PORT = Number(process.env.PROVE_PORT) || 5887;
const BASE = `http://localhost:${PORT}/`;
const WA = '+91 98765-43210', WA_DIGITS = '919876543210';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* ---- (i) the model, in Node, before anything is built ------------- */
console.log('(i) the snapshot model');
{
  const sheet = { id: 'cs1', title: 'Day 1', date: '2026-11-02', generalCall: '06:30', location: 'College, Guindy',
    notes: 'Parking at gate 2. Call Ravi on 98400 12345 or ravi@unit.example if late.', sceneIds: ['s1'], calls: { a: '07:00', b: '' } };
  const contacts = [
    { id: 'a', name: 'Ravi K', role: 'DOP', department: 'Camera', phone: '98400 11111', email: 'ravi@unit.example', notes: 'PRIVATE NOTE' },
    { id: 'b', name: 'Meena', role: 'Lead', department: 'Cast', phone: '98400 22222', email: 'meena@unit.example' },
    { id: 'c', name: 'Not called', role: 'Gaffer', department: 'Camera', phone: '3' }
  ];
  const scenes = [{ id: 's1', number: '1', intExt: 'INT', location: 'Hall', dayNight: 'DAY', eighths: 12, synopsis: 'Prize day. Ring 9840033333.' }];
  const snap = Model.snapshotCallSheet(sheet, contacts, scenes, { project: 'Dragon' });
  const flat = JSON.stringify(snap);
  ok(!/98400|unit\.example|PRIVATE NOTE/.test(flat), 'no phone, e-mail or private note survives the snapshot');
  ok(!Model.hasPrivate(snap), 'and no private KEY');
  ok(snap.sheet.calls.length === 2 && snap.sheet.calls[1].time === '06:30', 'only the people called, with the general call filling a blank time');
  ok(/\[phone removed\]/.test(snap.sheet.notes) && /\[e-mail removed\]/.test(snap.sheet.notes), "the sheet's own notes keep their words, minus contact details");
  ok(Model.hasPrivate({ deck: { characters: [{ name: 'X', Email: 'x@y.z' }] } }), 'hasPrivate finds a private key at any depth, any case');
  ok(!Model.tokenShaped('short') && Model.tokenShaped('A'.repeat(43)), 'tokens must be 32+ url-safe characters');
  const pitch = Model.snapshotPitch({ title: 'Dragon', logline: 'L', characters: [{ name: 'R', role: 'Protagonist', line: '', phone: '1' }] });
  ok(pitch.kind === 'pitch' && !Model.hasPrivate(pitch), 'a pitch snapshot is scrubbed too');
}

/* ---- the build -------------------------------------------------- */
if (!process.env.SKIP_BUILD) {
  console.log('building ' + OUT + ' (gate off, WhatsApp set, public view on)…');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT, '--emptyOutDir'], {
    cwd: ROOT, stdio: 'ignore', env: { ...process.env, VITE_SITE_GATE: 'off', VITE_SUPPORT_WHATSAPP: WA, VITE_PUBLIC_VIEW: 'on', VITE_DISABLE_SW: '1' }
  });
  if (r.status !== 0) { console.error('✗ build failed'); process.exit(2); }
}

/* ---- the fake's one extra RPC ----------------------------------- */
const VIEWS = new Map();
const tok = (c) => c.repeat(43).slice(0, 43);
function seedViews() {
  VIEWS.clear();
  const sheet = Model.snapshotCallSheet(
    { title: 'Day 3 — College', date: '2026-11-04', generalCall: '06:00', location: 'Guindy', notes: 'Bring the rain machine.', sceneIds: ['s1'], calls: { a: '06:30' } },
    [{ id: 'a', name: 'Ravi K', role: 'DOP', department: 'Camera', phone: '98400 11111', email: 'ravi@unit.example' }],
    [{ id: 's1', number: '12', intExt: 'EXT', location: 'Quad', dayNight: 'DAY', eighths: 10, synopsis: 'The walk-out.' }], { project: 'Dragon' });
  VIEWS.set(tok('a'), { kind: 'callsheet', title: sheet.title, payload: sheet, expires_at: new Date(Date.now() + 864e5).toISOString(), branding: true, ref: 'DRAGON7', revoked: false });
  VIEWS.set(tok('b'), { kind: 'callsheet', title: sheet.title, payload: sheet, expires_at: new Date(Date.now() + 864e5).toISOString(), branding: false, ref: '', revoked: false });
  VIEWS.set(tok('c'), { kind: 'callsheet', title: 'Old', payload: sheet, expires_at: new Date(Date.now() - 1000).toISOString(), branding: true, revoked: false });
  VIEWS.set(tok('d'), { kind: 'callsheet', title: 'Revoked', payload: sheet, expires_at: null, branding: true, revoked: true });
  // a row that should never exist (the proposal's CHECK refuses it); the client must refuse it too
  VIEWS.set(tok('e'), { kind: 'callsheet', title: 'Leaky', payload: { ...sheet, sheet: { ...sheet.sheet, calls: [{ name: 'X', phone: '98400 99999' }] } }, expires_at: null, branding: true, revoked: false });
  VIEWS.set(tok('p'), { kind: 'pitch', title: 'Dragon', payload: Model.snapshotPitch({ title: 'Dragon', genre: 'Drama', logline: 'A young man living on a forged degree is recognised.', synopsis: '', beats: [], characters: [{ name: 'RAGAVAN', role: 'Protagonist', line: 'Wants: status.' }], keyScenes: [], numbers: [['36', 'scenes']], framework: 'Three-act', theme: '', world: '' }), expires_at: null, branding: true, revoked: false });
}
let viewCalls = 0;
const LEADS = [], EVENTS = [];   // §29, faked here: add_lead / bump_event
const json200 = (r, status = 204, body = '') => r.fulfill({ status, contentType: 'application/json', body });
let refFor = {};   // user id -> referral code billing_status() reports
async function route(r) {
  const url = new URL(r.request().url());
  if (url.pathname === '/rest/v1/rpc/public_view_open') {
    viewCalls++;
    let args = {}; try { args = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    const v = VIEWS.get(args.p_token);
    const dead = !v || v.revoked || (v.expires_at && Date.parse(v.expires_at) <= Date.now());
    if (dead) return r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: '22023', message: 'That link has expired or is not valid', details: null, hint: null }) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ kind: v.kind, title: v.title, payload: v.payload, expires_at: v.expires_at, branding: v.branding, ref: v.ref || null }]) });
  }
  if (url.pathname === '/rest/v1/rpc/add_lead') {
    const a = JSON.parse(r.request().postData() || '{}');
    if (/reject/.test(a.p_email || '')) return json200(r, 429, JSON.stringify({ code: 'P0429', message: 'Too many sign-ups just now. Try again later.' }));
    LEADS.push({ ...a, auth: r.request().headers()['authorization'] });
    return json200(r);
  }
  if (url.pathname === '/rest/v1/rpc/bump_event') {
    EVENTS.push(JSON.parse(r.request().postData() || '{}').p_name);
    return json200(r);
  }
  if (url.pathname === '/rest/v1/rpc/billing_status') {
    // the shared fake's answer, plus the referral code billing is being taught
    const auth = (r.request().headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
    const u = Object.entries(USERS).find(([k]) => k === auth);
    const resp = await new Promise((resolve) => handle({ request: () => r.request(), fulfill: (o) => resolve(o) }));
    if (u && refFor[u[1].id] && resp && resp.status === 200) {
      const body = JSON.parse(resp.body); body.referral_code = refFor[u[1].id];
      return r.fulfill({ ...resp, body: JSON.stringify(body) });
    }
    return r.fulfill(resp);
  }
  return handle(r);
}

async function context(browser, { user = null, width = 1280 } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 } });
  await ctx.route(SB + '/**', route);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(([k, v, uid]) => {
    window.__writes = [];
    const o = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...a) { window.__writes.push({ store: this === sessionStorage ? 'session' : 'local', key: String(a[0]), at: performance.now() }); return o.apply(this, a); };
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, user ? [`sb-${REF}-auth-token`, sessionFor(user), USERS[user].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}
const localWrites = (page, since = 0) => page.evaluate((s) => window.__writes.filter((w) => w.store === 'local' && w.at >= s).map((w) => w.key), since);
const now = (page) => page.evaluate(() => performance.now());

/* The call sheet's line, as print would render it, captured inside a
   stubbed print() so the page's own staging (pdf.js) has run. */
async function printedSheetLine(page) {
  await page.emulateMedia({ media: 'print' });
  const got = await page.evaluate(() => new Promise((resolve) => {
    window.print = () => {
      const el = document.querySelector('.site-foot-made');
      resolve(el && getComputedStyle(el).display !== 'none' ? el.textContent : '');
    };
    const b = document.querySelector('[data-action="sheet-pdf"]');
    if (!b) return resolve(null);
    b.click();
    setTimeout(() => resolve('TIMEOUT'), 3000);
  }));
  await page.emulateMedia({ media: 'screen' });
  return got;
}

const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const allErrors = [];

try {
  F.reset(); seedViews();

  console.log('(a) WhatsApp');
  {
    const { ctx, page, errors } = await context(browser);
    await page.goto(BASE + 'index.html'); await page.waitForTimeout(800);
    const href = await page.getAttribute('footer.site-foot a.wa-link', 'href').catch(() => null);
    ok(href && href.startsWith('https://wa.me/' + WA_DIGITS + '?text='), 'the footer links to wa.me with the cleaned digits');
    await page.goto(BASE + 'settings.html#plan'); await page.waitForTimeout(800);
    ok(await page.$('#plan .plan-extras a.wa-link') !== null, 'Settings → Plan carries the help line');
    await page.goto(BASE + 'invite.html'); await page.waitForTimeout(800);
    ok(await page.$('a.wa-link[href^="https://wa.me/"]') !== null, 'invite.html carries it');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(b) (c) the call sheet and the deck, signed out');
  {
    const { ctx, page, errors } = await context(browser);
    await page.goto(BASE + 'index.html?sample=1'); await page.waitForTimeout(2500);
    await page.goto(BASE + 'contacts.html#call-sheets'); await page.waitForTimeout(1200);
    ok(await page.evaluate(() => { const el = document.querySelector('.site-foot-made'); return !!el && getComputedStyle(el).display === 'none'; }), 'the line is in the footer and hidden on screen');
    await page.emulateMedia({ media: 'print' });
    ok(await page.evaluate(() => getComputedStyle(document.querySelector('.site-foot-made')).display === 'none'), 'hidden in an ordinary print of the page');
    await page.emulateMedia({ media: 'screen' });
    const line = await printedSheetLine(page);
    ok(line === MADE, 'shown, without a ref, while a call sheet prints: ' + JSON.stringify(line));
    await page.goto(BASE + 'story.html#pitch'); await page.waitForTimeout(1500);
    const deck = await page.evaluate(() => new Promise((resolve) => {
      window.print = () => { const d = document.getElementById('pitchDeck'); const last = d && d.lastElementChild; resolve(last ? (last.querySelector('.made-with') || {}).textContent || '' : null); };
      const b = document.querySelector('[data-st="pitch"]'); if (!b) return resolve('NO BUTTON'); b.click();
      setTimeout(() => resolve('TIMEOUT'), 3000);
    }));
    ok(deck === MADE, 'the pitch deck PDF ends with the line: ' + JSON.stringify(deck));
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(d) a paid member (Indie)');
  {
    refFor = { [USERS['tok-admin'].id]: 'DRAGON7' };
    const { ctx, page, errors } = await context(browser, { user: 'tok-admin' });
    await page.goto(BASE + 'index.html?sample=1'); await page.waitForTimeout(2500);
    await page.goto(BASE + 'contacts.html#call-sheets'); await page.waitForTimeout(2500);
    const line = await printedSheetLine(page);
    ok(line === MADE + '?ref=DRAGON7', 'the line carries the member\'s ?ref= code: ' + JSON.stringify(line));
    await page.goto(BASE + 'settings.html#plan');
    const found = await page.waitForSelector('#brandingToggle', { timeout: 8000 }).then(() => true, () => false);
    await page.waitForLoadState('networkidle'); await page.waitForTimeout(800);   // settings redraws as billing answers
    const box = page.locator('#brandingToggle');
    ok(found && await box.isChecked(), 'Settings → Plan offers the switch, on');
    const t0 = await now(page);
    if (found) await box.click();
    await page.waitForTimeout(300);
    const w = await localWrites(page, t0);
    ok(w.length === 1 && w[0] === 'fms_studio_prefs_v1', 'unticking writes fms_studio_prefs_v1 and nothing else: ' + JSON.stringify(w));
    ok(await page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}').branding === 'off'), "the prefs blob says branding: 'off'");
    await page.goto(BASE + 'contacts.html#call-sheets'); await page.waitForTimeout(2500);
    ok((await printedSheetLine(page)) === '', 'the line is gone from the printed call sheet');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(e) a free member, and a paid plan that unticks remove_branding');
  {
    const { ctx, page, errors } = await context(browser, { user: 'tok-amy' });
    F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
    await page.goto(BASE + 'settings.html#plan'); await page.waitForTimeout(2500);
    await page.evaluate(() => localStorage.setItem('fms_studio_prefs_v1', JSON.stringify({ branding: 'off' })));
    await page.reload(); await page.waitForTimeout(2500);
    ok(await page.$('#brandingToggle') === null, 'Free: no switch');
    await page.goto(BASE + 'index.html?sample=1'); await page.waitForTimeout(2500);
    await page.goto(BASE + 'contacts.html#call-sheets'); await page.waitForTimeout(2500);
    ok(new RegExp('^' + reEsc('Made with ' + BRAND.name)).test(await printedSheetLine(page) || ''), "Free: a stored 'off' is ignored, the line prints");
    allErrors.push(...errors); await ctx.close();

    F.db.plans.find((p) => p.id === 'indie').features = { remove_branding: false };
    const b = await context(browser, { user: 'tok-admin' });
    await b.page.goto(BASE + 'settings.html#plan'); await b.page.waitForTimeout(2500);
    ok(await b.page.$('#plan') !== null && await b.page.$('#brandingToggle') === null, 'Indie with remove_branding unticked: no switch');
    allErrors.push(...b.errors); await b.ctx.close();
    F.db.plans.find((p) => p.id === 'indie').features = {};
  }

  console.log('(f) the screening room');
  {
    const { ctx, page, errors } = await context(browser);
    await page.goto(BASE + 'screening.html?pass=PASSCODE2345');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.sc-room', { timeout: 8000 });
    ok(new RegExp(reEsc(MADE) + '$').test(await page.evaluate(() => (document.querySelector('.sc-room > .made-with') || {}).textContent || '')), 'the room closes with the line');
    const n = await page.evaluate(() => [...document.querySelectorAll('.made-with')].filter((e) => e.getClientRects().length).map((e) => e.className + '@' + (e.parentElement && e.parentElement.className)));
    ok(n.length === 1, 'once (the on-screen deck does not repeat it)' + (n.length === 1 ? '' : ': ' + JSON.stringify(n)));
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(g) the tour');
  {
    const { ctx, page, errors } = await context(browser, { width: 390 });
    await page.goto(BASE + 'index.html'); await page.waitForTimeout(1500);
    let t0 = await now(page);
    await page.waitForTimeout(4000);
    ok((await localWrites(page, t0)).length === 0 && (await localWrites(page)).every((k) => k !== 'fms_tour_v1'), 'the hub with its checklist writes nothing on load or idle');
    ok(await page.evaluate(() => document.querySelectorAll('#firstweek .tw-item').length === 7 && !document.querySelector('#firstweek .tw-item.is-done')), 'seven items, none ticked on an empty desk');
    t0 = await now(page);
    await page.click('[data-tour-act="start"]'); await page.waitForTimeout(600);
    ok(JSON.stringify(await localWrites(page, t0)) === '["fms_tour_v1"]', 'starting writes fms_tour_v1 once, and only that');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('tour-pop') && document.activeElement.getAttribute('role') === 'dialog'), 'focus is in the step, a labelled dialog');
    await page.click('[data-tour-act="sample"]'); await page.waitForTimeout(3000);
    ok(await page.evaluate(() => document.querySelectorAll('#firstweek .tw-item.is-done').length === 6), 'with the sample open, six of seven tick — derived, not stored');
    ok(await page.evaluate(() => !Object.keys(localStorage).some((k) => /tour|week|check/i.test(k) && k !== 'fms_tour_v1')), 'no other key for the tour or the list');
    await page.click('.tour-pop [data-tour-act="next"]'); await page.waitForLoadState('load'); await page.waitForTimeout(1500);
    ok(/story\.html/.test(page.url()) && await page.$('.tour-pop') !== null, 'Next goes to Story, and the step is up there');
    t0 = await now(page);
    await page.waitForTimeout(4000);
    ok((await localWrites(page, t0)).length === 0, 'a page mid-tour writes nothing while idle');
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
    ok(await page.$('.tour-pop') === null && await page.evaluate(() => JSON.parse(localStorage.getItem('fms_tour_v1')).dismissed === true), 'Esc ends the tour and records it');
    await page.goto(BASE + 'write.html'); await page.waitForTimeout(1000);
    ok(await page.evaluate(() => ![...document.querySelectorAll('script[src], link[rel="modulepreload"]')].some((s) => /tour-/.test(s.src || s.href)) && !document.querySelector('.tour-pop, .tour-chip')), 'an ended tour loads nothing off the hub');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(h) public view links (flag on in this build)');
  {
    /* What screening.html writes on its own, with no view: the shared
       core's boot (the prefix and schema markers, the theme and skin
       chrome.js settles, supabase-js's lswt- probe). A view may add
       nothing to that, and nothing at all once it is drawn. */
    const plain = await context(browser, { width: 390 });
    await plain.page.goto(BASE + 'screening.html'); await plain.page.waitForLoadState('networkidle'); await plain.page.waitForTimeout(800);
    const bootKeys = new Set((await localWrites(plain.page)).map((k) => k.replace(/^lswt-.*/, 'lswt-')));
    await plain.ctx.close();
    const { ctx, page, errors } = await context(browser, { width: 390 });
    viewCalls = 0;
    await page.goto(BASE + 'screening.html#view=' + tok('a'));
    await page.waitForSelector('.pv-room', { timeout: 8000 }).catch(() => {});
    const text = await page.evaluate(() => (document.querySelector('.pv-room') || {}).innerText || '');
    ok(/Day 3 — College/.test(text) && /Ravi K/.test(text) && /DOP/.test(text) && /The walk-out/.test(text), 'the call sheet is drawn: title, the call, the scene');
    ok(!/98400|unit\.example/.test(await page.content()), 'no phone number or e-mail anywhere in the page');
    ok(!(await page.evaluate(() => location.hash)), 'the token is stripped from the address bar');
    ok(new RegExp(reEsc(BRAND.host + BRAND.path + '?ref=DRAGON7') + '$').test(await page.evaluate(() => (document.querySelector('.pv-room > .made-with') || {}).textContent || '')), "the line carries the sender's ref");
    await page.waitForLoadState('networkidle');
    const tv = await now(page);
    await page.waitForTimeout(1500);
    /* lswt-<random> is auth-js probing that storage works (set and removed
       at once, as prove-gate notes); judged by what PERSISTS instead. */
    const extra = (await localWrites(page)).filter((k) => !/^lswt-/.test(k) && !bootKeys.has(k));
    ok(extra.length === 0, 'the view writes no key the plain page does not' + (extra.length ? ': ' + JSON.stringify(extra) : ''));
    ok(await page.evaluate(() => !Object.keys(localStorage).some((k) => /^lswt-|^sb-/.test(k))), 'and leaves no Supabase key behind (no session kept)');
    ok((await localWrites(page, tv)).length === 0, 'and nothing at all once it is drawn');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no horizontal overflow at 390px');
    const open = (t) => page.goto('about:blank').then(() => page.goto(BASE + 'screening.html#view=' + t));
    await open(tok('b')); await page.waitForSelector('.pv-room', { timeout: 8000 }).catch(() => {});
    ok(await page.$('.pv-room') !== null && await page.$('.pv-room .made-with') === null, 'branding:false on the row: no line');
    await open(tok('p')); await page.waitForSelector('.pv-room', { timeout: 8000 }).catch(() => {});
    ok(/RAGAVAN/.test(await page.evaluate(() => document.body.innerText)), 'a pitch deck link draws the deck');
    for (const [t, label] of [[tok('c'), 'an expired link'], [tok('d'), 'a revoked link']]) {
      await open(t); await page.waitForSelector('.sc-error', { timeout: 8000 }).catch(() => {});
      ok(/expired or been switched off/.test(await page.evaluate(() => (document.querySelector('.sc-error') || {}).textContent || '')), label + ' is refused with a sentence');
    }
    await open(tok('e')); await page.waitForSelector('.sc-error', { timeout: 8000 }).catch(() => {});
    ok(await page.$('.pv-room') === null && !/98400/.test(await page.content()), 'a payload carrying a private key is refused, not drawn');
    const before = viewCalls;
    await open('short'); await page.waitForTimeout(1200);
    ok(viewCalls === before && /not complete/.test(await page.evaluate(() => (document.querySelector('.sc-error') || {}).textContent || '')), 'a malformed token makes no request');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(k) the start page: launch offers and the funnel');
  {
    const { ctx, page, errors } = await context(browser, { width: 390 });
    const sdk = []; page.on('request', (q) => { if (/supabase-[\w-]+\.js/.test(q.url())) sdk.push(q.url()); });
    LEADS.length = 0; EVENTS.length = 0;
    await page.goto(BASE + 'start.html'); await page.waitForLoadState('networkidle');
    ok(EVENTS.filter((e) => e === 'landing_view').length === 1, 'landing_view is counted once on load');
    await page.goto(BASE + 'start.html'); await page.waitForLoadState('networkidle');
    ok(EVENTS.filter((e) => e === 'landing_view').length === 1, 'and not again on a reload in the same session');
    await page.evaluate(() => document.getElementById('pricing').scrollIntoView()); await page.waitForTimeout(600);
    ok(EVENTS.filter((e) => e === 'pricing_view').length === 1, 'pricing_view is counted when #pricing scrolls into view');
    ok(sdk.length === 0, 'no Supabase SDK chunk is fetched on the start page');
    ok(await page.evaluate(() => !Object.keys(localStorage).some((k) => /analytics|funnel|lead/.test(k))), 'no new localStorage key');
    await page.fill('#leadEmail', 'not-an-email'); await page.click('#leadForm button[type=submit]');
    ok(LEADS.length === 0 && /valid e-mail/.test(await page.textContent('#leadMsg')), 'a malformed address is refused before any request');
    await page.fill('#leadEmail', 'fan@example.test'); await page.click('#leadForm button[type=submit]');
    ok(LEADS.length === 0 && /tick the box/.test(await page.textContent('#leadMsg')), 'no consent tick, no request');
    await page.check('#leadConsent'); await page.click('#leadForm button[type=submit]');
    await page.waitForFunction(() => /on the list/.test(document.getElementById('leadMsg').textContent), null, { timeout: 4000 }).catch(() => {});
    ok(LEADS.length === 1 && LEADS[0].p_email === 'fan@example.test' && LEADS[0].p_source === 'start', 'a ticked, valid form sends add_lead(email, consent, source)');
    ok(LEADS[0] && /agree/.test(LEADS[0].p_consent) && /Privacy Policy/.test(LEADS[0].p_consent), 'with the consent sentence the visitor saw');
    ok(/on the list/.test(await page.textContent('#leadMsg')), 'and says thank you');
    await page.fill('#leadEmail', 'reject@example.test'); await page.check('#leadConsent'); await page.click('#leadForm button[type=submit]');
    await page.waitForFunction(() => /Too many/.test(document.getElementById('leadMsg').textContent), null, { timeout: 4000 }).catch(() => {});
    ok(/Too many/.test(await page.textContent('#leadMsg')), 'a throttled answer is shown as a sentence');
    allErrors.push(...errors); await ctx.close();
    // opt-out and Do Not Track
    const o = await context(browser, { width: 390 });
    EVENTS.length = 0;
    await o.page.goto(BASE + 'start.html'); await o.page.click('#noCount');
    await o.page.evaluate(() => sessionStorage.removeItem('fms_funnel_pricing_view'));
    await o.page.evaluate(() => document.getElementById('pricing').scrollIntoView()); await o.page.waitForTimeout(600);
    ok(EVENTS.filter((e) => e === 'pricing_view').length === 0, '"Don\'t count this visit" stops further counts');
    await o.ctx.close();
    const d = await browser.newContext({ serviceWorkers: 'block' });
    await d.route(SB + '/**', route); await d.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
    const dp = await d.newPage(); EVENTS.length = 0;
    await dp.goto(BASE + 'start.html'); await dp.waitForLoadState('networkidle'); await dp.waitForTimeout(500);
    ok(EVENTS.length === 0, 'Global Privacy Control: nothing is counted');
    await d.close();
  }
} finally {
  await browser.close();
  srv.kill();
}

console.log('(j) flag off');
if (fs.existsSync(path.join(ROOT, 'dist-verify', 'screening.html'))) {
  const p2 = PORT + 1;
  const s2 = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', 'dist-verify', '--port', String(p2), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 2500));
  const b2 = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  try {
    const ctx = await b2.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', route);
    const page = await ctx.newPage();
    viewCalls = 0;
    await page.goto(`http://localhost:${p2}/screening.html#view=` + tok('a')); await page.waitForTimeout(1500);
    ok(viewCalls === 0 && await page.$('#scCode') !== null && await page.$('.pv-room') === null, 'the default build ignores #view= and shows the screening pass form');
    await ctx.close();
  } finally { await b2.close(); s2.kill(); }
} else {
  console.log('  – skipped: no dist-verify/ (run the open build first to include this check)');
}

const real = allErrors.filter((e) => !/websocket|realtime/i.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
console.log(`\ngrowth: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
