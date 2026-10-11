/* ============================================================
   PROOF: the Chrome extension, loaded unpacked into Chromium
   ------------------------------------------------------------
   Loads dist-extension/ as a real MV3 extension — its manifest, its
   service worker, its side-panel page, the app pages inside it — and
   replaces only the network to Supabase (the section-13 fake shared
   with prove-gate.mjs) and the two things a headless browser cannot
   do: a human at Google's consent screen (chrome.identity's
   launchWebAuthFlow returns a redirect URL), and the worker's own
   fetch (overridden in the worker, since page routes do not reach it).

   Asserted:
     (a) the worker registers, with a 30-second heartbeat alarm
     (b) the side panel opens on the gatekeeper (FR-101)
     (c) a clipping from the context menu lands in the open project's
         Idea Vault, with its URL, and the queue drains (FR-302)
     (d) code -> Google (chrome.identity) -> redeem -> lock -> the
         five-stage pipeline (FR-201, FR-203, FR-401)
     (e) FR-202: the Supabase session, the ticket and the lock handle
         are in chrome.storage.session — and in NEITHER localStorage
         NOR chrome.storage.local
     (f) the worker's heartbeat: ok keeps the session; an expired token
         is refreshed, not treated as revoked; section 13 missing is
         ignored; 'conflict' and P0401 clear chrome.storage.session and
         send the panel back to the gatekeeper (FR-204)
     (g) release frees the lock (FR-205)

   Run:  npm run build:extension && node scripts/prove-extension.mjs
   ============================================================ */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, jwtFor } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const EXT = path.join(ROOT, 'dist-extension');
if (!fs.existsSync(path.join(EXT, 'manifest.json'))) { console.error('run npm run build:extension first'); process.exit(2); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fms-ext-'));
const ctx = await chromium.launchPersistentContext(userDir, {
  headless: false,
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--headless=new', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});
await ctx.route(SB + '/**', handle);
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
const errors = [];
if (process.env.DEBUG_EXT) ctx.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 300)));

try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const X = (p) => `chrome-extension://${id}/${p}`;

  console.log('(a) the worker');
  ok(/extension\/background\.js$/.test(sw.url()), 'the background worker is registered');
  await sw.evaluate(() => self.__fms.setup());
  const alarm = await sw.evaluate(() => new Promise((r) => chrome.alarms.get('fms-heartbeat', r)));
  ok(alarm && alarm.periodInMinutes === 0.5, 'a 30-second heartbeat alarm exists');

  console.log('(b) the side panel');
  const panel = await ctx.newPage();
  panel.on('pageerror', (e) => errors.push(e.message));
  await panel.goto(X('extension/panel.html'));
  await panel.waitForSelector('#pnCode', { timeout: 10000 });
  ok((await panel.textContent('.pn-title')).includes('Enter Invite / Screening Pass Code'), 'it opens on the gatekeeper, in the PRD’s words');

  console.log('(c) the clipper');
  await sw.evaluate(() => self.__fms.queueClip({ selectionText: 'Chennai engineering student exposed for forged degree' }, { url: 'https://news.example/forged', title: 'News' }));
  const q1 = await sw.evaluate(() => chrome.storage.local.get('fms_clip_queue').then((r) => (r.fms_clip_queue || []).length));
  ok(q1 === 1, 'the clipping is queued in chrome.storage.local');
  const story = await ctx.newPage();
  story.on('pageerror', (e) => errors.push(e.message));
  await story.goto(X('story.html'));
  // The vault is a tab under the editor: the arrival toast is the way there.
  await story.click('.toast-action', { timeout: 10000 });
  await story.waitForSelector('.st-clip-text', { timeout: 10000 });
  ok((await story.textContent('.st-clip-text')).includes('forged degree'), 'it arrives in the Idea Vault');
  ok((await story.textContent('.st-clip-src')).includes('news.example'), 'with the page it came from');
  const q2 = await sw.evaluate(() => chrome.storage.local.get('fms_clip_queue').then((r) => (r.fms_clip_queue || []).length));
  ok(q2 === 0, 'and the queue drains');
  await story.close();

  console.log('(d) code, Google, redeem, lock, pipeline');
  F.reset();
  /* The extension is a paid-tier limit (schema section 16,
     limits.extension: false on Free), and the panel says so instead of
     drawing the pipeline. This run proves the pipeline, so Amy owns a
     Starter organisation; the no-plan panel is the plan's own proof.
     Without this the run had been failing here since the plan gate
     reached the panel. */
  F.db.accounts.push({ id: 'acc-amy', name: 'Amy Films', owner_id: USERS['tok-amy'].id, plan: 'starter', seat_limit: 1, created_at: new Date().toISOString() });
  await panel.fill('#pnCode', 'AMYCODE23456');
  await panel.click('button[type="submit"]');
  await panel.waitForSelector('[data-pn="google"]', { timeout: 8000 });
  ok((await panel.textContent('.pn-title')).includes('Sign in with Google'), 'a valid code moves to step 2');
  const t0 = await panel.evaluate(() => chrome.storage.session.get('fms_preauth_ticket'));
  ok(!!(t0.fms_preauth_ticket && t0.fms_preauth_ticket.ticket), 'the ticket waits in chrome.storage.session');
  ok(F.db.codes[0].redemptions_count === 0, 'nothing is spent before Google answers');
  // Google's consent screen, as chrome.identity would return it.
  await panel.evaluate((jwt) => {
    chrome.identity.launchWebAuthFlow = async () =>
      chrome.identity.getRedirectURL() + '#access_token=' + jwt + '&refresh_token=r-amy&expires_in=3600&expires_at=' +
      (Math.floor(Date.now() / 1000) + 3600) + '&token_type=bearer';
  }, jwtFor('tok-amy'));
  await panel.click('[data-pn="google"]');
  await panel.waitForSelector('.pn-stages', { timeout: 15000 }).catch(() => {});
  if (process.env.DEBUG_EXT) console.log('DEBUG panel:', await panel.textContent('#main'), await panel.evaluate(() => chrome.storage.session.get(null)), F.db.calls);
  const stages = await panel.$$eval('.pn-stage-btn strong', (e) => e.map((x) => x.textContent));
  /* The Blueprints shelf is gone (10 Oct 2026): its questions live in each stage's Guide. */
  ok(stages.join('|') === 'Story|Screenplay|Pre-Production|Production|Post-Production|Library', 'the pipeline shows the five stages, then the Library shelf: ' + stages.join(', '));
  ok(F.db.members.has(USERS['tok-amy'].id) && F.db.codes[0].redemptions_count === 1, 'the code was redeemed exactly once');
  ok(F.db.sessions.has(USERS['tok-amy'].id), 'the device lock was acquired');
  await panel.click('[data-stage="story"]');
  ok((await panel.$$eval('.pn-mode strong', (e) => e.map((x) => x.textContent))).join() === 'Sample,New,Import', 'Story offers Sample, New, Import');
  /* KNOWN-ISSUES #2 (fixed): the shelves' modules are in the panel too. */
  await panel.click('[data-stage="library"]');
  ok((await panel.$$eval('.pn-mod a', (e) => e.map((x) => x.textContent))).join() === 'Case Studies,Dissection,Craft Glossary', 'the Library shelf lists Case Studies, Dissection, Craft Glossary');
  await panel.setViewportSize({ width: 360, height: 800 });
  ok(await panel.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the panel fits a 360px side panel');
  if (process.env.SHOT_DIR) await panel.screenshot({ path: path.join(process.env.SHOT_DIR, 'panel.png'), fullPage: true });

  console.log('(e) FR-202: where the credentials are');
  const where = await panel.evaluate(async (ref) => {
    const sess = await chrome.storage.session.get(null);
    const local = await chrome.storage.local.get(null);
    const ls = Object.keys(localStorage);
    return {
      inSession: Object.keys(sess),
      lsAuth: ls.filter((k) => k.startsWith('sb-') || k.includes('auth-token') || k.includes('preauth') || k === 'fms_session_id'),
      lsValues: ls.map((k) => localStorage.getItem(k) || '').some((v) => v.includes('eyJ') || v.includes('r-amy')),
      localKeys: Object.keys(local),
      localValues: /eyJ|r-amy/.test(JSON.stringify(local))
    };
  }, REF);
  ok(where.inSession.includes(`sb-${REF}-auth-token`) && where.inSession.includes('fms_session_id'), 'the session and the lock handle are in chrome.storage.session');
  ok(where.lsAuth.length === 0 && !where.lsValues, 'no token, ticket or session id in localStorage');
  ok(!where.localValues && !where.localKeys.some((k) => /auth|token|session/i.test(k)), 'none in chrome.storage.local either');

  console.log('(f) the worker’s heartbeat');
  // The worker's fetch, scripted per case. Page routes do not reach it.
  await sw.evaluate((jwt) => { self.__jwt = jwt; }, jwtFor('tok-amy'));
  const beat = (mode) => sw.evaluate(async (mode) => {
    self.__calls = [];
    self.__realFetch = self.__realFetch || self.fetch.bind(self);
    self.fetch = async (url, opts) => {
      // The worker's own files (ext-config.json) are not Supabase.
      if (String(url).startsWith('chrome-extension://')) return self.__realFetch(url, opts);
      self.__calls.push(String(url).split('/').slice(-1)[0]);
      const J = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
      if (String(url).includes('/auth/v1/token')) return J(200, { access_token: self.__jwt, refresh_token: 'r2', expires_in: 3600, token_type: 'bearer', user: { id: 'u' } });
      if (mode === 'ok') return J(200, [{ status: 'ok' }]);
      if (mode === 'missing') return J(404, { code: 'PGRST202', message: 'Could not find the function' });
      if (mode === 'conflict') return J(200, [{ status: 'conflict' }]);
      if (mode === 'revoked') return J(400, { code: 'P0401', message: 'This account has no active invite' });
      return J(500, {});
    };
    const result = await self.__fms.heartbeat();
    const left = Object.keys(await chrome.storage.session.get(null));
    return { result, calls: self.__calls, left };
  }, mode);

  let r = await beat('ok');
  ok(r.result === 'ok' && r.left.length > 0, 'ok: the session is kept');
  r = await beat('missing');
  ok(r.result === 'notdeployed' && r.left.length > 0, 'section 13 missing: ignored, the session is kept');
  // An access token past its expiry, with no page to refresh it.
  await sw.evaluate(async (ref) => {
    const k = `sb-${ref}-auth-token`;
    const s = JSON.parse((await chrome.storage.session.get(k))[k]);
    s.expires_at = Math.floor(Date.now() / 1000) - 10;
    await chrome.storage.session.set({ [k]: JSON.stringify(s) });
  }, REF);
  r = await beat('ok');
  const refreshed = await sw.evaluate(async (ref) => JSON.parse((await chrome.storage.session.get(`sb-${ref}-auth-token`))[`sb-${ref}-auth-token`]).refresh_token, REF);
  ok(r.result === 'ok' && r.calls[0].startsWith('token') && refreshed === 'r2', 'an expired token is refreshed and written back, not treated as revoked');

  r = await beat('conflict');
  ok(r.result === 'conflict' && r.left.length === 0, "'conflict' (409) clears chrome.storage.session");
  await panel.waitForSelector('#pnCode', { timeout: 8000 }).then(() => ok(true, 'and the panel returns to the gatekeeper'), () => ok(false, 'and the panel returns to the gatekeeper'));
  ok(/another device/i.test(await panel.textContent('#main')), 'saying why');
  const localWork = await panel.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('fms_idea_vault_v1')));
  ok(localWork, 'the user’s own work (the Idea Vault) is untouched');

  // Sign back in for the revoked case.
  await sw.evaluate(async ([ref, s]) => { await chrome.storage.session.set({ [`sb-${ref}-auth-token`]: s, fms_session_id: 'sid-2' }); },
    [REF, JSON.stringify({ access_token: 'tok-amy', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: USERS['tok-amy'].id } })]);
  r = await beat('revoked');
  ok(r.result === 'revoked' && r.left.length === 0, 'P0401 (401) clears chrome.storage.session');

  // The revoked case's local sign-out runs asynchronously in the pages;
  // let it finish before seeding storage again.
  await panel.waitForTimeout(800);
  console.log('(g) release');
  await sw.evaluate(async ([ref, s]) => { await chrome.storage.session.set({ [`sb-${ref}-auth-token`]: s, fms_session_id: 'sid-3' }); },
    [REF, JSON.stringify({ access_token: 'tok-amy', refresh_token: 'r', expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: 'bearer', user: { id: USERS['tok-amy'].id } })]);
  const rel = await sw.evaluate(async () => { self.__calls = []; await self.__fms.release(); return self.__calls; });
  ok(rel.includes('session_release'), 'release() calls session_release with the held handle');
} catch (e) {
  fail++; console.log('  ✗ run aborted: ' + e.message);
}

const real = errors.filter((e) => !/net::|ERR_|CERT|fetch|websocket/i.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await ctx.close();
fs.rmSync(userDir, { recursive: true, force: true });
console.log(`${fail ? '✗' : '✓'} extension proof: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
