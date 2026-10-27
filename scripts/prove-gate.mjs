/* ============================================================
   PROOF: the invite gate, the invite-request queue, the one-device
   lock, the admin console and the screening room — every path that
   is not Supabase itself.
   ------------------------------------------------------------
   Schema sections 13 and 14 have not run against a database (they
   say so), so nothing here can be proved against the real project
   yet. What CAN be proved is everything on this side of the network:
   that the shipped client asks the right questions, reads the answers
   right, pauses sync rather than touching local work, prompts before
   a takeover, and now FAILS CLOSED when the functions do not exist.

   One seam is replaced: HTTP to the project's Supabase origin, served
   by an in-memory fake that implements sections 13 and 14 (codes,
   hashed tickets, membership, requests, the 90-second lock, screening
   passes). Everything above it — gate.js, cloud.js, gate-ui.js,
   invite-request.js, invite.js, settings.js, screening.js,
   watermark.js — is the real build in dist/.

   Asserted:
     (a) gate NOT deployed: a signed-in user is CLOSED, nothing is
         uploaded, the pill and invite.html say the gate is not
         switched on (this used to assert the opposite)
     (b) deployed, no membership: sync pauses, local work untouched,
         the code box appears with a route to the request; redeeming
         a code opens it
     (c) signed out: code -> ticket in sessionStorage (not local) ->
         back from Google -> the ticket is redeemed on the restored load
     (d) a second browser: the takeover prompt; Cancel pauses; Take over
         wins, and the first browser's next heartbeat loses the lock
     (e) an admin disables a member: their next heartbeat closes sync
     (f) the admin console lists codes and issues a screening pass
     (g) the screening room opens a pass read-only, under a canvas
         watermark baked into every block, and closes when the mark is
         removed more than three times
     (h) the screening room writes nothing to localStorage
     (i) THE LANDING: the first load after a sign-in that is closed is
         sent to invite.html, and only that one — the next page is not
     (j) THE REQUEST: the signed-in account asks; the row carries the
         attested e-mail and name; the gate's reason becomes 'pending'
         and the pill says so; the admin console lists it; APPROVE
         makes a member and the next load is open
     (k) DECLINE: the requester sees the decision and the note, and is
         not offered the form again inside the cooling-off week
     (l) THE SITE GATE: a signed-out visitor to any page is sent to
         start.html (the public landing page); so is a signed-in non-member; a member sees the
         page with the gate attribute cleared; the screening room and
         the legal pages are exempt
     (m) THE CONSOLE: admin.html shows the studio's numbers and the
         organisations for an admin, and "Administrators only" for a
         member; the gate's controls are on it
     (n) CODE-ONLY ENTRY AND THE LINK: a signed-out visitor with a valid
         code is in with no sign-in, the code is remembered for the
         browser and re-verified next session, the console offers the
         code as a link, opening the link enters, and a revoked code
         is forgotten and shuts the door
     (o) THE LANDING PAGE'S DOORWAY (§30 / plan part 6): the Continue
         with Google button navigates to the project's own
         /auth/v1/authorize carrying provider=google, the right
         redirect_to and the Drive scope; and start.html#code= holds
         the code for this browser, scrubs the fragment and says so
     (q) A LAPSED TRIAL (§33): one stable wall after expiry (navigations
         counted over ten seconds), a SIGN OUT on the wall itself at
         390px, which lands on start.html and stays out with no session
         and no gate pass; invite.html says the trial is over

     (r) THE PURCHASES SWITCH IS THE DOOR (owner, 12 Oct 2026): OFF, a
         signed-in non-member stays on the page while the CLOUD gate is
         still closed; ON, a fresh sign-in meets the offer page and
         start_trial() is NOT called until the button is pressed; a used
         trial gets plans and no button and no loop; a typed code neither
         enters the studio nor leaves a pass; a redeemed code starts the
         trial it carries

     (s) THE OFFLINE GRACE (owner, 19 Oct 2026): a server-confirmed
         admission is stamped; a cold start that cannot reach the server
         opens on a fresh stamp for the same account and not on a stale,
         future-dated or other account's one; a server "no" is never
         overridden; a sign-out clears the stamp

   Run:  npm run build && node scripts/prove-gate.mjs
   ============================================================ */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import fs from 'node:fs';
import { F, USERS, SB, REF, handle, sessionFor, freshDb, expireTrial } from './fake-supabase.mjs';
/* invite-code.js has NO imports, deliberately (that is the whole reason
   it was split out of gate.js), so Node can load the shipped source
   itself and this proof can check the link builders directly. */
import { inviteLink, startInviteLink, codeFromLocation } from '../src/lib/invite-code.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
/* This proof is about the GATED build — the one the hosts deploy. The
   open build (npm run build:open, for verify) would pass the sign-in
   scenarios and silently skip the site gate, so it is refused here the
   way verify refuses the gated one. */
/* PROVE_DIST serves a build other than dist/. Several worktrees and
   several sessions share this checkout and rebuild dist/ under each
   other — the same reason verify has VERIFY_DIST and VERIFY_PORT —
   and a proof reading a directory somebody else is mid-write of
   fails as "the gate is broken". Build your own and point here:
     npx vite build --outDir dist-gate && PROVE_DIST=dist-gate PROVE_PORT=5361 npm run prove:gate */
const OUT = process.env.PROVE_DIST || 'dist';
{
  const idx = path.join(ROOT, OUT, 'index.html');
  const stamp = fs.existsSync(idx) ? (fs.readFileSync(idx, 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1] : null;
  if (stamp !== 'invite') {
    console.error(`✗ ${OUT}/ was built with the site gate ${stamp === 'off' ? 'OFF' : 'unstamped'}; this proof needs the production build: npm run build`);
    process.exit(2);
  }
}
const PORT = Number(process.env.PROVE_PORT) || 5357;
const BASE = `http://localhost:${PORT}/`;

let pass = 0, fail = 0, skipped = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
/* A check whose SUBJECT is missing is reported as skipped, never as a
   pass — the hue-coding assertion in verify is the precedent. The thing
   that was missing has always failed an ok() of its own first, so the
   run is already red; this only stops the follow-on checks from
   printing ticks for work nobody did. */
const skip = (m) => { skipped++; console.log('  – skipped: ' + m); };

/* `landing: true` seeds the marker cloud.js writes when a sign-in
   begins, so a seeded session behaves as the FIRST load after it. */
async function newContext(browser, { tok = null, clock = false, landing = false } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  if (tok) {
    await ctx.addInitScript(([k, v, uid, land]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, v);
        localStorage.setItem('fms_studio_account_v1', uid);
        if (land) sessionStorage.setItem('fms_gate_landing', '1');
        sessionStorage.setItem('__seeded', '1');
      }
    }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id, landing]);
  }
  const page = await ctx.newPage();
  if (clock) await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/websocket|realtime|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const gateState = (page) => page.evaluate(() => window.StudioCloud && window.StudioCloud.getGateState && window.StudioCloud.getGateState().state);
const gateReason = (page) => page.evaluate(() => window.StudioCloud.getGateState().reason);
const syncDetail = (page) => page.evaluate(() => window.StudioCloud.getSyncStatus().detail);
const writes = () => F.db.calls.filter((c) => c.startsWith('write:')).length;
const waitGate = (page, want) => page.waitForFunction((w) => window.StudioCloud && window.StudioCloud.getGateState().state === w, want, { timeout: 8000 }).then(() => true, () => false);
/* A gated page sends a closed visitor to invite.html the moment the gate
   settles, so any evaluate() after the first poll that sees 'closed' can
   lose the race to the navigation. Instead the page reports its own
   closed state to Node from inside, through an exposed function, which
   survives the navigation. Arm BEFORE the goto; await after. */
/* The site gate redirects with location.replace(), which aborts whatever
   the previous page was still fetching; Playwright's waitForURL reports
   that as net::ERR_ABORTED although the redirect itself lands. Poll the
   URL instead, which cannot be aborted. */
async function urlBecomes(page, re, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (re.test(page.url())) break; await new Promise((r) => setTimeout(r, 50)); }
  if (!re.test(page.url())) return false;
  // Landed; now let the doorway finish loading so the next evaluate() has a DOM to look at.
  await page.waitForLoadState('load', { timeout: ms }).catch(() => {});
  return true;
}
async function armClosedSnap(page) {
  const snaps = [];
  await page.exposeFunction('__gateSnap', (o) => snaps.push(o));
  await page.addInitScript(() => {
    const t = setInterval(() => {
      const c = window.StudioCloud; if (!c || !c.getGateState) return;
      const g = c.getGateState(); if (g.state !== 'closed') return;
      clearInterval(t); window.__gateSnap({ reason: g.reason, detail: c.getSyncStatus().detail });
    }, 10);
  });
  return async () => { for (let i = 0; i < 400 && !snaps.length; i++) await new Promise((r) => setTimeout(r, 20)); return snaps[0] || null; };
}

/* ---- run ------------------------------------------------------ */
const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const allErrors = [];

try {
  console.log('(a) gate not deployed → CLOSED');
  F.reset(); F.db.deployed = false;
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    /* Seed local work on the doorway, which the site gate exempts: a
       gated page redirects a closed visitor moments after load, and an
       evaluate() racing that navigation is a flaky harness, not a
       finding. */
    await page.goto(BASE + 'invite.html');
    await page.evaluate(() => localStorage.setItem('fms_story_v1', JSON.stringify({ v: 1, source: 'WRITTEN WITH NO GATE', framework: 'three_act', marks: [], tension: {} })));
    const snapA = await armClosedSnap(page);
    await page.goto(BASE + 'settings.html');
    const closed = await snapA();
    ok(!!closed, 'a signed-in user is CLOSED when the functions do not exist');
    ok(closed && closed.reason === 'notdeployed', "and the reason is 'notdeployed', not 'no invite'");
    ok(closed && /not open yet/i.test(closed.detail || ''), 'the sync status says invites are not open yet');
    await page.waitForTimeout(1200);
    ok(writes() === 0, 'nothing was uploaded');
    /* Under the site gate a closed visitor never sees the hub, so the
       pill's INVITE NEEDED state is unreachable on the website; what
       they get is the doorway, on every page they try. */
    await page.goto(BASE + 'index.html');
    ok(await urlBecomes(page, /invite\.html/), 'the hub sends a closed visitor to invite.html');
    await page.goto(BASE + 'invite.html');
    await page.waitForSelector('#request');
    ok(/not open yet/i.test(await page.textContent('#request')), 'invite.html says invites are not open yet');
    ok(!(await page.$('[data-ir-form]')), 'and offers no request form, because there is nobody to ask');
    ok((await page.evaluate(() => localStorage.getItem('fms_story_v1') || '')).includes('WRITTEN WITH NO GATE'), 'local work is untouched');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(b) deployed, signed in, no membership');
  F.reset();
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'invite.html');   // exempt from the site gate; see (a)
    await page.evaluate(() => {
      const s = { v: 1, source: 'LOCAL WORK THAT MUST SURVIVE', framework: 'three_act', marks: [], tension: {} };
      localStorage.setItem('fms_story_v1', JSON.stringify(s));
    });
    const snapB = await armClosedSnap(page);
    await page.goto(BASE + 'settings.html');
    const closedB = await snapB();
    ok(!!closedB, 'the gate CLOSES for a non-member');
    ok(closedB && closedB.reason === 'noinvite', "reason 'noinvite'");
    const writesBefore = writes();
    ok(closedB && /free trial or a plan/i.test(closedB.detail || '') && !/awaiting an invite/i.test(closedB.detail || ''), 'the sync status says why it is paused, and the way in — not an invite that is not coming: ' + (closedB && closedB.detail));
    ok(await urlBecomes(page, /invite\.html/), 'settings.html became invite.html — the site gate');
    /* THE DOOR LEADS WITH THE TRIAL NOW (owner, 12 Oct 2026), not with
       the request form. The form is off the public door: this waits for
       the trial button instead, and the two assertions after it are the
       whole change — the code box is still there, and the request form
       is NOT, for somebody who has not asked. */
    await page.waitForSelector('#trial [data-iv-action="start-trial"]', { timeout: 8000 });
    ok(!!(await page.$('#invite #gtCode')), 'and the code box is there');
    ok(!(await page.$('#request [data-ir-form]')), 'the request form is OFF the public door — a trial is the road in now');
    ok(!!(await page.$('#trial [data-iv-action="start-trial"]')), 'and the trial is offered, first');
    ok(writes() === writesBefore, 'nothing was uploaded while closed');
    await page.fill('#gtCode', 'amy code 2345 6');
    await page.click('#invite button[type="submit"]');
    ok(await waitGate(page, 'open'), 'redeeming the code OPENS the gate');
    ok(F.db.members.has(USERS['tok-amy'].id) && F.db.codes[0].redemptions_count === 1, 'the code was spent once, and Amy is a member');
    ok(F.db.calls.includes('session_acquire'), 'opening acquired the device lock');
    await page.goto(BASE + 'story.html');
    ok((await page.evaluate(() => localStorage.getItem('fms_story_v1') || '')).includes('LOCAL WORK THAT MUST SURVIVE'), 'local work is untouched throughout');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(i) the landing');
  {
    /* A MARK, NOT A TOTAL. (b) ends with Amy redeeming a code, and a
       redeemed code starts the trial it carries — so `calls` already
       holds a start_trial by now and asserting on the whole list would
       fail for somebody else's press. Count only what Cal's load adds. */
    const callMark = F.db.calls.length;
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-cal', landing: true });
    await page.goto(BASE + 'story.html');
    ok(await urlBecomes(page, /invite\.html/), 'the first load after a closed sign-in lands on invite.html');
    await page.waitForSelector('#trial [data-iv-action="start-trial"]', { timeout: 8000 });
    ok(!(await page.$('#request [data-ir-form]')), 'a fresh sign-in is offered the trial, not an application form');
    ok(!F.db.calls.slice(callMark).includes('start_trial'), 'and NOTHING started by itself — the trial waits for the press');
    /* The form still exists for anyone an administrator points at it. */
    await page.goto(BASE + 'invite.html#request');
    await page.waitForSelector('#request [data-ir-form]', { timeout: 8000 });
    const who = await page.textContent('#request .ir-who');
    ok(who.includes('cal@example.com') && who.includes('Cal Fernandes'), 'the form shows the attested Google account and name, read-only');
    ok(!(await page.evaluate(() => sessionStorage.getItem('fms_gate_landing'))), 'the landing marker was consumed');
    await page.goto(BASE + 'story.html');
    ok(await urlBecomes(page, /invite\.html/), 'the NEXT page is bounced too — the whole website is behind the gate now');
    ok((await page.evaluate(() => document.documentElement.dataset.sitegate || '')) === '', 'invite.html itself is exempt (no data-sitegate)');

    console.log('(j) the request, and the approval');
    await page.goto(BASE + 'invite.html#request');
    await page.waitForSelector('#request [data-ir-form]');
    await page.fill('#irNote', 'Cal here — DOP on Dragon, Amy sent me.');
    await page.click('#request [data-ir-form] button[type="submit"]');
    await page.waitForFunction(() => window.StudioCloud.getGateState().reason === 'pending', null, { timeout: 8000 })
      .then(() => ok(true, "after asking, the gate's reason is 'pending'"), () => ok(false, "after asking, the gate's reason is 'pending'"));
    const row = F.db.requests.get(USERS['tok-cal'].id);
    ok(!!row && row.status === 'pending' && row.email === 'cal@example.com' && row.display_name === 'Cal Fernandes', 'the row carries the e-mail and name from auth, not from the form');
    ok(!!row && row.note === 'Cal here — DOP on Dragon, Amy sent me.' && /Chrome|HeadlessChrome/.test(row.user_agent || ''), 'and the note and the browser that asked');
    await page.waitForSelector('#request .ir-state.is-pending');
    ok(/Requested/.test(await page.textContent('#request')), 'the page now says Requested instead of offering the form');
    ok(!!(await page.$('#invite #gtCode')), 'the code box stays available — a code from a friend still works while the request waits');
    await page.goto(BASE + 'index.html');
    ok(await urlBecomes(page, /invite\.html/), 'while pending, the hub still sends Cal to invite.html');
    ok(writes() === 0, 'still nothing uploaded');
    allErrors.push(...errors);

    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html#admin-console');   // inside the Requests tab (src/ui/tabs.js)
    await A.page.waitForSelector('#admin-console .gt-requests', { timeout: 10000 });
    const con = await A.page.textContent('#admin-console');
    ok(/Invite requests \(1 waiting\)/.test(con) && con.includes('cal@example.com') && con.includes('Amy sent me'), 'the console lists the request with who, the note and when');
    ok((await A.page.evaluate(() => window.StudioCloud.getGateState().status.pendingRequests)) === 1, "the admin's status counts 1 waiting (for the account menu)");
    await A.page.click('#admin-console [data-gate-action="approve"]');
    await A.page.waitForFunction(() => /\(0 waiting\)/.test(document.querySelector('#admin-console').textContent), null, { timeout: 8000 })
      .then(() => ok(true, 'APPROVE clears the queue'), () => ok(false, 'APPROVE clears the queue'));
    ok(F.db.members.has(USERS['tok-cal'].id) && F.db.requests.get(USERS['tok-cal'].id).status === 'approved', 'Cal is a member and the request reads approved');
    ok(!F.db.codes.some((c) => c.label === 'cal@example.com'), 'no code was minted — approval IS the membership');
    allErrors.push(...A.errors); await A.ctx.close();

    await page.goto(BASE + 'story.html');
    ok(await waitGate(page, 'open'), "Cal's next load is through the gate");
    await page.waitForFunction(() => !document.documentElement.dataset.sitegate, null, { timeout: 8000 }).then(() => ok(true, 'and the site gate lets story.html render'), () => ok(false, 'and the site gate lets story.html render'));
    ok(/story\.html/.test(page.url()) && (await page.evaluate(() => sessionStorage.getItem('fms_sitegate_pass'))) === '1', 'the pass is remembered in sessionStorage for this tab');
    await page.goto(BASE + 'invite.html');
    await page.waitForSelector('#through');
    ok(true, 'invite.html now says You’re in');
    await ctx.close();

    console.log('(k) a decline');
    const D = await newContext(browser, { tok: 'tok-dan' });
    await D.page.goto(BASE + 'invite.html#request');   // off the public door since 12 Oct 2026
    await D.page.waitForSelector('#request [data-ir-form]');
    await D.page.click('#request [data-ir-form] button[type="submit"]');
    await D.page.waitForSelector('#request .ir-state.is-pending', { timeout: 8000 });
    /* The admin's lock from (j) is still fresh and a new context is a
       new device, so without this the console sits under the takeover
       prompt — the lock doing its job. Release it, as (d) does. */
    F.db.sessions.delete(USERS['tok-admin'].id);
    const A2 = await newContext(browser, { tok: 'tok-admin' });
    A2.page.on('dialog', (d) => { throw new Error('native dialog: ' + d.message()); });
    await A2.page.goto(BASE + 'admin.html#admin-console');
    await A2.page.waitForSelector('#admin-console [data-gate-action="decline"]', { timeout: 10000 });
    await A2.page.click('#admin-console [data-gate-action="decline"]');
    /* the note is asked in the app's own dialog now (askText) */
    await A2.page.waitForSelector('.dlg input.dlg-field', { timeout: 8000 });
    await A2.page.fill('.dlg input.dlg-field', 'Not this season — ask Amy to vouch for you.');
    await A2.page.click('.dlg .mbtn.primary');
    await A2.page.waitForFunction(() => /\(0 waiting\)/.test(document.querySelector('#admin-console').textContent), null, { timeout: 8000 });
    ok(F.db.requests.get(USERS['tok-dan'].id).status === 'declined' && !F.db.members.has(USERS['tok-dan'].id), 'DECLINE records the decision and makes nobody a member');
    /* Two decided by now: Cal's approval from (j) and this decline. */
    const hist = await A2.page.textContent('#admin-console');
    ok(/Decided \(2\)/.test(hist) && /dan@example\.com — declined/.test(hist) && /cal@example\.com — approved/.test(hist), 'and both decisions are kept as history');
    await A2.ctx.close();
    await D.page.goto(BASE + 'invite.html');
    await D.page.waitForSelector('#request .ir-state.is-declined', { timeout: 8000 });
    const dtext = await D.page.textContent('#request');
    ok(/Declined/.test(dtext) && dtext.includes('ask Amy to vouch'), 'Dan sees the decision and the note');
    ok(!(await D.page.$('#request [data-ir-form]')) && /ask again from/i.test(dtext), 'and is not offered the form again inside the week');
    ok((await gateReason(D.page)) === 'declined' && /declined/i.test(await syncDetail(D.page)), "the gate's reason and the sync status both say declined");
    allErrors.push(...D.errors); await D.ctx.close();
  }

  console.log('(l) the site gate');
  F.db.sessions.clear();
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    for (const p of ['index.html', 'breakdown.html', 'settings.html']) {
      await page.goto(BASE + p);
      ok(await urlBecomes(page, /start\.html/), `signed out: ${p} -> start.html (the public landing page)`);
    }
    const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('main')).visibility);
    ok(hidden === 'visible', 'start.html renders (the public page a stranger lands on)');
    await page.goto(BASE + 'screening.html');
    await page.waitForTimeout(800);
    ok(/screening\.html/.test(page.url()) && (await page.evaluate(() => getComputedStyle(document.body).visibility)) === 'visible', 'screening.html is exempt');
    await page.goto(BASE + 'privacy.html');
    await page.waitForTimeout(500);
    ok(/privacy\.html/.test(page.url()), 'privacy.html is exempt');
    await ctx.close();

    const M = await newContext(browser, { tok: 'tok-cal' });   // a member since (j)
    await M.page.goto(BASE + 'breakdown.html');
    await M.page.waitForFunction(() => !document.documentElement.dataset.sitegate, null, { timeout: 8000 }).then(() => ok(true, 'a member sees breakdown.html, gate attribute cleared'), () => ok(false, 'a member sees breakdown.html, gate attribute cleared'));
    ok(/breakdown\.html/.test(M.page.url()), 'and stays on it');
    ok((await M.page.evaluate(() => getComputedStyle(document.querySelector('#app')).visibility)) === 'visible', 'the page is visible');
    allErrors.push(...M.errors); await M.ctx.close();
  }

  console.log('(m) the application console');
  F.db.sessions.clear();
  {
    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html');
    await A.page.waitForSelector('#overview .ad-stat', { timeout: 10000 }).catch(async () => {
      const diag = await A.page.evaluate(() => ({ url: location.href, sitegate: document.documentElement.dataset.sitegate || '', gate: window.StudioCloud && window.StudioCloud.getGateState(), booted: window.StudioCloud && window.StudioCloud.isBooted(), errs: [...document.querySelectorAll('.gt-error')].map((e) => e.textContent), main: (document.querySelector('#main') || {}).textContent?.replace(/\s+/g, ' ').slice(0, 300) })).catch((e) => String(e));
      console.log('  (m) diagnostics: ' + JSON.stringify(diag) + ' calls=' + F.db.calls.slice(-12).join(','));
    });
    const text = await A.page.textContent('#main');
    const d = { users: Object.keys(USERS).length, members: [...F.db.members.values()].filter((m) => !m.disabled_at).length };
    const flat = text.replace(/\s+/g, ' ');
    ok(new RegExp(`${d.users} signed in`).test(flat), `the meta line counts ${d.users} signed in (auth.users)`);
    ok(new RegExp(`${d.members}\\s*Members`).test(flat), `the Members tile counts ${d.members} members`);
    ok((await A.page.$$('#overview .ad-stats .ad-stat')).length === 10, 'Overview is ten tiles (six counts, four from the health report)');
    ok(/1 organisation\b/.test(flat) && text.includes('Dragon Pictures') && text.includes('1 of 5'), 'the organisation is counted, and listed with its owner, seats and films');
    ok(text.includes('cal@example.com') && text.includes('dan@example.com') && /not a member|declined/.test(text), 'everyone who signed in is listed, including non-members');
    ok(!!(await A.page.$('#admin-console')), "the gate's controls are on the same page");
    const tabs = await A.page.$$eval('.tabs [role="tab"]', (t) => t.map((b) => b.querySelector('.tabs-tab-l').textContent + (b.getAttribute('aria-selected') === 'true' ? '*' : '')));
    /* the row's label span: a row's textContent now also holds its icon's name and its count */
    ok(tabs.join(',') === 'Overview*,Launch & health,Audit log,People,Support,Access & sharing,Purchases,Growth,Testimonials,Usage,Sync & storage,Controls', 'the console is twelve tabs in four groups, Overview selected: ' + tabs.join(', '));
    ok(!!(await A.page.$('#purchases #billing')) && !!(await A.page.$('#purchases #promos')) && !!(await A.page.$('#people #giveAccess')) && !!(await A.page.$('#requests #admin-console')), 'each block sits in its tab (payments and promos under Purchases, Give access under People, the queue under Requests)');
    ok(await A.page.isHidden('#people') && await A.page.isVisible('#overview'), 'only the selected tab is on screen');
    await A.page.click('.tabs [data-tab="people"]');
    ok(await A.page.isVisible('#people') && await A.page.isHidden('#overview') && /#people$/.test(A.page.url()), 'clicking People shows it, hides Overview and writes the hash');
    await A.page.setViewportSize({ width: 390, height: 844 });
    ok(await A.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the console does not overflow at 390px');
    allErrors.push(...A.errors); await A.ctx.close();
    F.db.sessions.clear();
    const N = await newContext(browser, { tok: 'tok-amy' });   // a member, not an admin
    await N.page.goto(BASE + 'admin.html');
    await N.page.waitForSelector('#denied', { timeout: 10000 }).then(() => ok(true, 'a member who is not an admin gets "Administrators only"'), () => ok(false, 'a member who is not an admin gets "Administrators only"'));
    ok(!(await N.page.$('#overview')), 'and no numbers');
    allErrors.push(...N.errors); await N.ctx.close();
  }

  console.log('(m2) give access by e-mail, and the purchases switch (schema section 32)');
  F.db.sessions.clear();
  {
    const A = await newContext(browser, { tok: 'tok-admin' });
    const dlgButton = (primary) => A.page.click(primary ? '.dlg .mbtn.primary' : '.dlg .mbtn:not(.primary)');
    await A.page.goto(BASE + 'admin.html#give-access');   // inside the People tab
    await A.page.waitForSelector('#giveAccess form[data-acc-form="grant"]', { timeout: 10000 })
      .then(() => ok(true, 'the Give access tab draws the form'), () => ok(false, 'the Give access tab draws the form'));
    const planOpts = await A.page.$$eval('#accPlan option', (o) => o.map((x) => x.value));
    ok(planOpts.join() === ',starter,indie,pro', 'the plan list is the plans table (paid tiers) plus "no plan": ' + planOpts.join());
    ok((await A.page.$$eval('#accRole option', (o) => o.map((x) => x.textContent))).join() === 'Member,Admin', 'the role is Member or Admin');
    ok((await A.page.$$eval('#accLength option', (o) => o.map((x) => x.textContent))).join() === 'Until I remove it,For a number of days', 'the length: until removed (first, the default) or N days');

    // An EXISTING account: Cal. As an admin, on Pro, until removed — applied now.
    const cal = USERS['tok-cal'];
    const calWas = F.db.members.get(cal.id) ? { ...F.db.members.get(cal.id) } : null;
    await A.page.fill('#accEmail', cal.email);
    await A.page.selectOption('#accRole', 'admin');
    await A.page.selectOption('#accPlan', 'pro');
    await A.page.click('#giveAccess button[type="submit"]');
    await A.page.waitForSelector(`#giveAccess tr[data-grant="${cal.email}"]`, { timeout: 8000 }).catch(() => {});
    const row = await A.page.textContent(`#giveAccess tr[data-grant="${cal.email}"]`).catch(() => '');
    ok(/Admin/.test(row) && /Pro/.test(row) && /Until removed/.test(row) && /Yes/.test(row), 'the grant is listed: Admin · Pro · Until removed · applied: ' + row.replace(/\s+/g, ' ').trim());
    ok(F.db.members.get(cal.id)?.role === 'admin' && !F.db.members.get(cal.id)?.disabled_at, 'and applied at once: Cal is an admin member');
    const calAcc = () => F.db.accounts.find((a) => a.owner_id === cal.id);
    ok(calAcc() && calAcc().plan === 'pro', 'with Pro on Cal’s organisation');

    // An address with no account yet, for 30 days: it waits for the first sign-in.
    await A.page.fill('#accEmail', 'new.person@example.com');
    await A.page.selectOption('#accRole', 'member');
    await A.page.selectOption('#accPlan', 'starter');
    await A.page.selectOption('#accLength', 'days');
    await A.page.fill('#accDays', '30');
    await A.page.click('#giveAccess button[type="submit"]');
    await A.page.waitForSelector('#giveAccess tr[data-grant="new.person@example.com"]', { timeout: 8000 }).catch(() => {});
    const row2 = await A.page.textContent('#giveAccess tr[data-grant="new.person@example.com"]').catch(() => '');
    ok(/Member/.test(row2) && /Basic/.test(row2) && /At first sign-in/.test(row2) && !/Until removed/.test(row2), 'a grant for an address with no account waits, with an end date: ' + row2.replace(/\s+/g, ' ').trim());
    const g2 = F.db.emailGrants.get('new.person@example.com');
    ok(!!g2 && Math.abs(Date.parse(g2.until) - (Date.now() + 30 * 86400e3)) < 120e3, 'the length went to the server as 30 days');

    // A bad address is refused before it is sent.
    const before = F.db.calls.filter((c) => c === 'admin_grant_email').length;
    await A.page.fill('#accEmail', 'not-an-address');
    await A.page.evaluate(() => document.querySelector('#giveAccess form').requestSubmit());
    await A.page.waitForTimeout(300);
    ok(F.db.calls.filter((c) => c === 'admin_grant_email').length === before, 'a malformed address is refused in the browser, nothing sent');

    // Revoke goes through dialog.js. Cancel first: nothing changes.
    await A.page.click(`#giveAccess button[data-acc-action="revoke"][data-email="${cal.email}"]`);
    await A.page.waitForSelector('.dlg', { timeout: 5000 }).catch(() => {});
    ok(/Revoke access for cal@example\.com\?/.test(await A.page.textContent('.dlg').catch(() => '')), 'REVOKE asks first, in the app’s own dialog');
    await dlgButton(false);
    await A.page.waitForTimeout(300);
    ok(F.db.emailGrants.has(cal.email) && F.db.members.get(cal.id)?.role === 'admin', 'Cancel revokes nothing');
    await A.page.click(`#giveAccess button[data-acc-action="revoke"][data-email="${cal.email}"]`);
    await A.page.waitForSelector('.dlg', { timeout: 5000 }).catch(() => {});
    await dlgButton(true);
    await A.page.waitForFunction((e) => !document.querySelector(`#giveAccess tr[data-grant="${e}"]`), cal.email, { timeout: 8000 }).catch(() => {});
    ok(!(await A.page.$(`#giveAccess tr[data-grant="${cal.email}"]`)) && !F.db.emailGrants.has(cal.email), 'Revoke removes the grant from the list and the server');
    ok(F.db.members.get(cal.id)?.role === (calWas ? calWas.role : 'user'), 'and the admin role it gave is taken back');
    ok(calAcc() && calAcc().plan !== 'pro', 'and the plan it gave');

    // A grant with NO plan, while purchases are required (the fake's
    // default, §33): Ben is let in, unwalled and uncapped, and told who
    // gave him access. Ben is undone afterwards — (c) needs him a stranger.
    const ben = USERS['tok-ben'];
    await A.page.fill('#accEmail', ben.email);
    await A.page.selectOption('#accRole', 'member');
    await A.page.selectOption('#accPlan', '');
    await A.page.selectOption('#accLength', 'forever');
    await A.page.click('#giveAccess button[type="submit"]');
    await A.page.waitForSelector(`#giveAccess tr[data-grant="${ben.email}"]`, { timeout: 8000 }).catch(() => {});
    ok(F.db.emailGrants.get(ben.email)?.applied_user === ben.id && !F.db.emailGrants.get(ben.email)?.plan, 'a plan-less grant for Ben is applied at once');
    {
      const B = await newContext(browser, { tok: 'tok-ben' });
      await B.page.goto(BASE + 'invite.html');
      await B.page.waitForFunction(() => /Access given by the studio/.test(document.body.textContent), null, { timeout: 10000 }).catch(() => {});
      ok(/Access given by the studio/.test(await B.page.textContent('body').catch(() => '')), 'invite.html: "You’re in" — access given by the studio');
      await B.page.goto(BASE + 'index.html');
      await B.page.waitForTimeout(2500);
      ok(!(await B.page.$('.pg-wall')) && !(await B.page.evaluate(() => { const b = document.querySelector('#studioRail .sh-rail-trial'); return !!b && !b.hidden; })) && !(await B.page.$('.sh-trial-chip')), 'the hub: no wall and no trial clock for a plan-less grant');
      allErrors.push(...B.errors); await B.ctx.close();
    }
    F.db.emailGrants.delete(ben.email); F.db.members.delete(ben.id); F.db.sessions.clear();

    // The switch, on the Purchases tab. The fake starts ON (see fake-supabase.mjs).
    await A.page.goto(BASE + 'admin.html#purchases');
    await A.page.waitForSelector('#accPurchasesOn', { timeout: 10000 })
      .then(() => ok(true, 'the Purchases tab carries the "Purchases required" switch'), () => ok(false, 'the Purchases tab carries the "Purchases required" switch'));
    ok(await A.page.isChecked('#accPurchasesOn'), 'reading the server’s position (on)');
    await A.page.click('#accPurchasesOn');
    await A.page.waitForSelector('.dlg', { timeout: 5000 }).catch(() => {});
    const dtext = await A.page.textContent('.dlg').catch(() => '');
    ok(/On: everyone who has not bought a plan is blocked until they buy, including people using the studio now\./.test(dtext)
       && /Off: the studio is free; nothing is walled or capped\./.test(dtext), 'the confirm says what EACH position means');
    await dlgButton(false);
    await A.page.waitForTimeout(300);
    ok(F.db.settings.purchase_required === true && await A.page.isChecked('#accPurchasesOn'), 'Cancel: nothing saved, the box springs back');
    await A.page.click('#accPurchasesOn');
    await A.page.waitForSelector('.dlg', { timeout: 5000 }).catch(() => {});
    await dlgButton(true);
    await A.page.waitForFunction(() => /^Off:/.test((document.querySelector('[data-acc-state]') || {}).textContent || ''), null, { timeout: 8000 }).catch(() => {});
    ok(F.db.settings.purchase_required === false, 'Confirm: purchase_required is saved false through admin_set_billing_settings');
    ok(!(await A.page.isChecked('#accPurchasesOn')) && (await A.page.getAttribute('[data-acc-state]', 'data-acc-state')) === 'off', 'and the block now reads Off');
    F.db.settings.purchase_required = true;   // the later sections assume the fake's default
    F.db.emailGrants.clear();
    allErrors.push(...A.errors); await A.ctx.close();

    const N = await newContext(browser, { tok: 'tok-amy' });   // not an admin: the RPCs refuse
    await N.page.goto(BASE + 'admin.html');
    await N.page.waitForSelector('#denied', { timeout: 10000 }).catch(() => {});
    ok(!(await N.page.$('#giveAccess')) && !(await N.page.$('#accPurchasesOn')), 'a non-admin sees neither block');
    allErrors.push(...N.errors); await N.ctx.close();
  }

  console.log('(n) code-only entry, the link, revocation');
  F.db.sessions.clear();
  {
    // The link. A fresh browser, nothing seeded.
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE + 'invite.html#code=LINK-CODE-2345');
    /* AN INVITE LINK HOLDS, IT DOES NOT ENTER (owner, 12 Oct 2026), and
       it does not submit on arrival either: sending somebody to Google
       the instant they open a link, before they have read what this is,
       is a hijack rather than one motion. The press is theirs. */
    await page.waitForSelector('#through', { timeout: 10000 });
    ok(/invite\.html/.test(page.url()), 'opening an invite link stays on the doorway: ' + page.url());
    ok(!/code=/.test(page.url()), 'the code is gone from the address bar');
    ok(/spend your code/i.test(await page.textContent('#through')), 'which says the code is held and offers Google');
    ok(!!(await page.evaluate(() => JSON.parse(localStorage.getItem('fms_invite_code_v1') || 'null'))), 'the code is held in this browser');
    ok(await page.evaluate(() => sessionStorage.getItem('fms_sitegate_pass')) == null, 'with no site-gate pass: holding is not being through');
    await page.goto(BASE + 'breakdown.html');
    ok(await urlBecomes(page, /start\.html/, 12000), 'and the app is still shut to it: ' + page.url());
    ok(F.db.codes.find((c) => c.code === 'LINKCODE2345').redemptions_count === 0, 'nothing is spent by entering');
    const stored = await page.evaluate(() => localStorage.getItem('fms_invite_code_v1'));
    /* A malformed percent-escape in the fragment threw URIError at
       module load and left the doorway an empty page. */
    ok(codeFromLocation({ hash: '#code=AB%ZZ' }) === '', 'codeFromLocation() reads a bad percent-escape as no code, not a throw');
    const errsAt = errs.length;
    await page.goto(BASE + 'invite.html#code=AB%ZZ');
    await page.waitForSelector('main', { timeout: 10000 }).catch(() => {});
    ok(!!(await page.$('main')) && errs.slice(errsAt).every((m) => !/URI malformed/i.test(m)), 'invite.html#code=AB%ZZ still renders the doorway: ' + errs.slice(errsAt).join(' | '));
    await ctx.close();
    /* REVOKED: the door is shut to it and the browser forgets it. This
       is the half of the old assertion that still bites — a revoked code
       must not survive in a browser waiting to be spent on a sign-in. */
    F.db.codes.find((c) => c.code === 'LINKCODE2345').revoked_at = new Date().toISOString();
    const ctx3 = await browser.newContext({ serviceWorkers: 'block' });
    await ctx3.route(SB + '/**', handle);
    await ctx3.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    /* Once per context — an init script re-running on every navigation
       would put the code back after the app forgot it, and the
       assertion below is exactly that the app forgot it. */
    await ctx3.addInitScript((v) => { if (!sessionStorage.getItem('__code')) { localStorage.setItem('fms_invite_code_v1', v); sessionStorage.setItem('__code', '1'); } }, stored);
    const p3 = await ctx3.newPage();
    const before = F.db.calls.length;
    /* A GATED page, not invite.html: the doorway is exempt, so the site
       gate does not arm there and nothing would re-verify anything. */
    await p3.goto(BASE + 'story.html');
    ok(await urlBecomes(p3, /start\.html/, 12000), 'a revoked code opens no door (a stranger lands on start.html)');
    ok(F.db.calls.slice(before).includes('verify_invite'), 'because a held code is re-verified with the server each browser session');
    ok(!(await p3.evaluate(() => localStorage.getItem('fms_invite_code_v1'))), 'and a revoked one is forgotten');
    F.db.codes.find((c) => c.code === 'LINKCODE2345').revoked_at = null;
    await ctx3.close();
    // Signing in later redeems the remembered code by itself.
    const ctx4 = await newContext(browser, { tok: 'tok-dan' });   // Dan: declined in (k), no membership
    await ctx4.page.evaluate(() => {}).catch(() => {});
    await ctx4.ctx.addInitScript((v) => { localStorage.setItem('fms_invite_code_v1', v); }, stored);
    const p4 = await ctx4.ctx.newPage();
    await p4.goto(BASE + 'story.html');
    ok(await waitGate(p4, 'open'), 'a code-only browser that signs in has the code redeemed for the account');
    ok(F.db.members.has(USERS['tok-dan'].id) && F.db.codes.find((c) => c.code === 'LINKCODE2345').redemptions_count === 1, 'Dan is a member and the code is spent once');
    allErrors.push(...errs); await ctx4.ctx.close();
  }

  console.log('(n2) the demo link: in on a code, the Dragon sample, no sign-in');
  F.db.sessions.clear();
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE + 'invite.html#code=LINK-CODE-2345&demo=1');
    await page.waitForURL(/dashboard/, { timeout: 25000 }).then(() => ok(true, 'a demo link lets a signed-out visitor in and lands on the dashboard'), () => ok(false, 'a demo link lets a signed-out visitor in and lands on the dashboard (at ' + page.url() + ')'));
    ok(!/code=|demo=/.test(page.url()), 'the code and the demo flag are gone from the address bar');
    const projects = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('fms_studio_projects_v1') || '[]').length; } catch (e) { return -1; } });
    ok(projects === 1, 'an empty device is given exactly one project, the Dragon sample (found ' + projects + ')');
    ok(!!(await page.evaluate(() => localStorage.getItem('fms_invite_code_v1'))), 'the code is remembered in this browser, with no sign-in');
    ok(!(await page.evaluate(() => sessionStorage.getItem('fms_demo_land'))), 'and the one-shot landing flag is spent');
    // A device that already has a film is never given the sample: straight to the dashboard.
    await page.goto(BASE + 'invite.html#code=LINK-CODE-2345&demo=1');
    await page.waitForURL(/dashboard/, { timeout: 15000 }).catch(() => {});
    const again = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('fms_studio_projects_v1') || '[]').length; } catch (e) { return -1; } });
    ok(again === 1, 'a second visit does not add a second sample (' + again + ')');
    allErrors.push(...errs); await ctx.close();
  }

  console.log('(c) signed out: code, Google, redeemed on return');
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/accounts\.google\.com|fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    await page.goto(BASE + 'settings.html');
    await urlBecomes(page, /start\.html/);   // a stranger lands on the public page, then goes on to the doorway
    await page.goto(BASE + 'invite.html');
    await page.waitForSelector('#invite #gtCode');
    await page.fill('#gtCode', 'BENCODE23456');
    await page.click('#invite button[type="submit"]');
    /* CODE THEN GOOGLE, ONE MOTION (owner, 12 Oct 2026). This used to
       assert that a valid code entered the studio with no sign-in. It
       does not any more: a code is worth a seven-day trial, a trial is
       counted against a PERSON, so the code is HELD and the submit goes
       to Google to find one. */
    await page.waitForURL(/accounts\.google\.com|auth\/v1\/authorize/, { timeout: 8000 })
      .then(() => ok(true, 'a typed code goes to Google — it is no longer a key on its own'),
            () => ok(false, 'a typed code goes to Google — it is no longer a key on its own (at ' + page.url() + ')'));
    ok(!/index\.html|dashboard\.html/.test(page.url()), 'and does NOT enter the studio: ' + page.url());
    await page.goto(BASE + 'invite.html');
    const t = await page.evaluate(() => [sessionStorage.getItem('fms_preauth_ticket'), localStorage.getItem('fms_preauth_ticket'), JSON.parse(localStorage.getItem('fms_invite_code_v1') || 'null'), sessionStorage.getItem('fms_sitegate_pass')]);
    ok(!!t[0] && !t[1], 'the pre-auth ticket waits in sessionStorage, never localStorage');
    ok(t[2] && t[2].code === 'BENCODE23456', 'the code is remembered for this browser');
    ok(t[3] == null, 'and no site-gate pass was left behind: holding a code is not being through');
    ok(F.db.codes.find((c) => c.code === 'BENCODE23456').redemptions_count === 0, 'entering spent nothing');
    // "Back from Google": a stored session, then a load that starts signed in.
    await page.evaluate(([k, v, uid]) => { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); }, [`sb-${REF}-auth-token`, sessionFor('tok-ben'), USERS['tok-ben'].id]);
    // store.js may schedule its own reload into the account's namespace;
    // either reload is the "load that starts signed in".
    await page.reload().catch(() => {});
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(500);
    ok(await waitGate(page, 'open'), 'the restored load redeemed the ticket and opened the gate');
    ok(F.db.codes.find((c) => c.code === 'BENCODE23456').redemptions_count === 1 && F.db.members.has(USERS['tok-ben'].id), 'Ben is a member and the code is spent once');
    await page.waitForTimeout(1200);
    ok(F.db.calls.includes('start_trial'), 'and the redemption started the trial the code carries');
    ok(!(await page.evaluate(() => sessionStorage.getItem('fms_preauth_ticket'))), 'the ticket is gone once spent');
    await ctx.close();
  }

  console.log('(d) two browsers, one account');
  F.db.sessions.clear();   // (b) closed its browser without signing out; let that lock lapse
  {
    const A = await newContext(browser, { tok: 'tok-amy', clock: true });
    await A.page.goto(BASE + 'story.html');
    ok(await waitGate(A.page, 'open'), 'browser A holds the session');
    const B = await newContext(browser, { tok: 'tok-amy' });
    await B.page.goto(BASE + 'story.html');
    await B.page.waitForSelector('.gt-overlay', { timeout: 8000 });
    ok(/active in another browser window or on another device/i.test(await B.page.textContent('.gt-overlay')), 'browser B is asked before anything is taken over');
    await B.page.click('[data-gt="cancel"]');
    ok(await waitGate(B.page, 'lost'), 'Cancel pauses sync in B and takes nothing from A');
    await B.page.reload();
    await B.page.waitForSelector('.gt-overlay');
    await B.page.click('[data-gt="take"]');
    ok(await waitGate(B.page, 'open'), 'Take over wins the session in B');
    await A.page.clock.fastForward(31000);
    ok(await waitGate(A.page, 'lost'), "A's next heartbeat finds the lock gone and pauses sync");
    ok(/active on another device/i.test(await A.page.evaluate(() => document.body.innerText)), 'A is told why, with a way to take it back');
    allErrors.push(...A.errors, ...B.errors);

    console.log('(e) an admin disables a member');
    F.db.members.get(USERS['tok-amy'].id).disabled_at = new Date().toISOString();
    F.db.sessions.delete(USERS['tok-amy'].id);
    await B.page.evaluate(() => {}); // B keeps beating on the real 30s timer; force one through the clock-less page
    await B.page.waitForFunction(() => /invite\.html/.test(location.pathname) || window.StudioCloud.getGateState().state === 'closed', null, { timeout: 40000 }).then(() => ok(true, "a revoked member's heartbeat closes the gate"), () => ok(false, "a revoked member's heartbeat closes the gate"));
    ok(await urlBecomes(B.page, /invite\.html/), 'and the site gate walks them out to invite.html');
    await A.ctx.close(); await B.ctx.close();
  }

  console.log('(f) the admin console');
  F.db.sessions.clear();
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-admin' });
    await page.goto(BASE + 'admin.html#admin-console');
    await page.waitForSelector('#admin-console .gt-table', { timeout: 10000 });
    ok((await page.textContent('#admin-console')).includes('AMYC-ODE2-3456'), 'codes are listed in their spoken form');
    ok(/Invite requests \(0 waiting\)/.test(await page.textContent('#admin-console')), 'the request queue is drawn even when empty — an absent section reads the same as a passing one');
    ok((await page.$$('#admin-console [data-gate-action="copy-link"]')).length >= 1, 'every active standard code offers COPY LINK');
    await page.selectOption('#gtType', 'standard');
    await page.fill('#gtLabel', 'Link test');
    await page.click('#admin-console form[data-gate-form="create"] button[type="submit"]');
    await page.waitForSelector('.gt-link', { timeout: 8000 });
    const link = await page.textContent('.gt-link');
    /* CHANGED, and it tests a product decision that changed rather
       than a bug: this used to assert invite.html#code=. The console
       hands out the LANDING page's form now, because a code buys a
       seven-day trial rather than permanent free entry (§30) and a
       trial is counted against an account on the server — so the code
       has to meet a sign-in to be worth its week, and the sign-in
       lives on start.html. The old form is not dead; see below. */
    ok(new RegExp('^' + BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'start\\.html#code=[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$').test(link), 'a new code is shown as a LANDING link, code in the fragment: ' + link);
    // The demo link (admin console, Access): one standard code labelled Demo, copied as invite.html#code=..&demo=1.
    await page.fill('#gtDemoUses', '25');
    await page.click('#admin-console [data-gate-action="create-demo"]');
    await page.waitForSelector('.gt-demo .gt-link', { timeout: 8000 });
    const demoLink = await page.textContent('.gt-demo .gt-link');
    ok(/invite\.html#code=[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}&demo=1$/.test(demoLink) && demoLink.startsWith(BASE), 'Create demo link shows invite.html#code=…&demo=1: ' + demoLink);
    ok(F.db.codes.some((c) => c.label === 'Demo' && c.pass_type === 'standard' && c.max_redemptions === 25), 'it issued a standard code labelled Demo with the uses asked for');
    /* And the old shape still builds, because every link already sent
       to somebody points at invite.html and a code is a thing people
       paste into a group chat months later. Read from the module
       itself: (n) above proves such a link still opens the door. */
    ok(inviteLink('linkcode2345', 'https://example.test/') === 'https://example.test/invite.html#code=LINK-CODE-2345',
      'inviteLink() still produces the invite.html form for links already sent: ' + inviteLink('linkcode2345', 'https://example.test/'));
    ok(startInviteLink('linkcode2345', 'https://example.test/') === 'https://example.test/start.html#code=LINK-CODE-2345',
      'startInviteLink() is the new one, same code, same fragment');
    await page.selectOption('#gtType', 'screening_pass');
    await page.selectOption('#gtDur', '2');
    await page.selectOption('#gtProj', 'p1');
    await page.fill('#gtLabel', 'Festival programmer');
    await page.click('#admin-console form[data-gate-form="create"] button[type="submit"]');
    /* A .gt-made already exists from the link test above, so wait for
       the state, not the element. */
    for (let i = 0; i < 40 && F.db.codes[0].pass_type !== 'screening_pass'; i++) await page.waitForTimeout(200);
    await page.waitForSelector('.gt-made', { timeout: 8000 });
    const made = F.db.codes[0];
    ok(made.pass_type === 'screening_pass' && made.target_project_id === 'p1' && made.expires_at, 'a screening pass is issued for one project, with an expiry');
    await page.setViewportSize({ width: 390, height: 844 });
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'the console does not overflow at 390px');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(g) the screening room');
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    /* EVERY WRITE, FROM DOCUMENT START, WITH ITS KEY. The counter used
       to be installed after goto(), and that lost a race once in three
       runs: the supabase chunk is a lazy import that does not hold up
       the load event, and auth-js probes localStorage as it evaluates
       (`lswt-<random>`, set and removed at once — supportsLocalStorage()
       in its locks module). Measured 8ms AHEAD of the patch on a quiet
       machine, so on a loaded one it landed behind it and counted as
       the room writing. Logging from the start, with keys, means a
       failure here NAMES the key instead of reporting a bare count. */
    await ctx.addInitScript(() => {
      window.__writes = [];
      const o = Storage.prototype.setItem;
      Storage.prototype.setItem = function (...a) {
        window.__writes.push({ store: this === sessionStorage ? 'session' : 'local', key: String(a[0]) });
        return o.apply(this, a);
      };
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + 'screening.html?pass=PASSCODE2345');
    ok(!(await page.evaluate(() => location.search)), 'the pass is stripped from the address bar');
    /* Settle before measuring: the lazy chunks have arrived and run
       once the network has been quiet, which is the state a visitor's
       page is in when they type the code. */
    await page.waitForLoadState('networkidle');
    const snapshot = () => page.evaluate(() => JSON.stringify([Object.entries(localStorage).sort(), Object.entries(sessionStorage).sort()]));
    const before = await snapshot();
    const n0 = await page.evaluate(() => window.__writes.length);
    /* QA r2, 26 Oct 2026: a refused pass rebuilt the form and left
       focus on <body>; it returns to the code, marked invalid. */
    await page.fill('#scCode', 'ZZZZ-ZZZZ-ZZZZ');
    await page.press('#scCode', 'Enter');
    await page.waitForSelector('.sc-error', { timeout: 8000 });
    {
      const f = await page.evaluate(() => ({ id: document.activeElement && document.activeElement.id,
        inv: document.getElementById('scCode').getAttribute('aria-invalid'), by: document.getElementById('scCode').getAttribute('aria-describedby') }));
      ok(f.id === 'scCode' && f.inv === 'true' && f.by === 'scError', 'a refused pass hands focus back to the code, marked invalid (' + JSON.stringify(f) + ')');
    }
    await page.fill('#scCode', 'PASSCODE2345');
    await page.fill('#scEmail', 'programmer@festival.example');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.sc-room', { timeout: 8000 });
    ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('.sc-head h1')), 'an opened room takes focus to its title, not <body>');
    {
      const t = await page.textContent('.sc-room');
      ok(!/(?:^|\D)1\s*(scenes|locations|shoot days)/i.test(t.replace(/\s+/g, ' ')), 'the deck says "1 scene", never "1 scenes"');
    }
    const nRoom = await page.evaluate(() => window.__writes.length);
    const text = await page.textContent('.sc-room');
    ok(text.includes('Dragon') && text.includes('Inciting Incident') && text.includes('RAGAVAN'), 'beat sheet, character map and title are shown');
    ok(!text.includes('SECRET PHONE'), 'contacts never reach a pass holder');
    ok(await page.evaluate(() => !!document.querySelector('canvas[data-wm]') && [...document.querySelectorAll('.sc-block')].every((b) => b.style.backgroundImage.includes('data:image/png'))),
      'a canvas watermark is up and baked into every block');
    /* QA, 26 Oct 2026: the block copy of the stamp was anchored to each
       block and the canvas to the viewport, so inside every card the two
       sat offset and overlapped; and the deck's beats and key scenes had
       no screen layout ("Inciting IncidentA student…", "1. 1"). */
    ok(await page.evaluate(() => [...document.querySelectorAll('.sc-block')].every((b) => getComputedStyle(b).backgroundAttachment === 'fixed')),
      'the block watermark is anchored to the viewport, as the canvas is: one stamp, not two offset');
    {
      const deck = await page.evaluate(() => {
        const li = document.querySelector('.sc-deck .pd-beats li');
        const strong = li && li.querySelector('strong'), span = li && li.querySelector('span');
        const sc = document.querySelector('.sc-deck ol.pd-scenes');
        return {
          beat: !!li && getComputedStyle(li).display === 'grid' && !!strong && !!span && span.getBoundingClientRect().top >= strong.getBoundingClientRect().bottom - 1,
          scenes: sc ? getComputedStyle(sc).listStyleType : 'absent'
        };
      });
      ok(deck.beat, 'the pitch deck sets each beat label above its text');
      ok(deck.scenes === 'none' || deck.scenes === 'absent', 'key scenes carry one number, not the list marker beside it (' + deck.scenes + ')');
    }
    ok(F.db.redemptions.some((r) => r.viewer_email === 'programmer@festival.example' && r.access_id), 'the open is logged with the typed e-mail and an access id');
    /* The watchdog answers a MutationObserver and a once-a-second tick,
       so each wait here is for ITS reaction — the canvas back in the
       document, the canvas visible again — never for a fixed number of
       milliseconds that a slow run can outlast. */
    await page.evaluate(() => document.querySelector('canvas[data-wm]').remove());
    ok(await page.waitForSelector('canvas[data-wm]', { state: 'attached', timeout: 3000 }).then(() => true, () => false), 'a removed watermark is put back');
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => { const c = document.querySelector('canvas[data-wm]'); if (c) c.style.display = 'none'; });
      // the mark is restyled (one strike), or the fourth strike has closed the room
      await page.waitForFunction(() => { const c = document.querySelector('canvas[data-wm]'); return !!document.querySelector('.sc-enter') || (c && c.style.display !== 'none'); }, null, { timeout: 3000 }).catch(() => {});
    }
    await page.waitForSelector('.sc-enter', { timeout: 5000 }).then(() => ok(true, 'repeated tampering takes the content off the page'), () => ok(false, 'repeated tampering takes the content off the page'));
    /* Two halves, because they fail differently. The ROOM — from the
       moment it is up to the moment it is closed — must not touch
       storage at all. The OPEN (submit → room) may carry a lazy chunk's
       set-and-remove probe if the race above is lost even after
       networkidle; what it must not do is leave anything behind, so the
       opening is judged on what PERSISTED: the storage contents after
       the close are the contents before the submit, byte for byte. */
    const writes = await page.evaluate(() => window.__writes);
    const inRoom = writes.slice(nRoom);
    const onOpen = writes.slice(n0, nRoom);
    const describe = (list) => list.map((w) => w.store + ':' + w.key).join(', ');
    ok(inRoom.length === 0, 'the screening room wrote nothing to localStorage' + (inRoom.length ? ' — wrote ' + describe(inRoom) : ''));
    ok((await snapshot()) === before, 'opening and closing the pass left storage exactly as it was'
      + (onOpen.length ? ' (transient while opening: ' + describe(onOpen) + ')' : ''));
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(o) the landing page: the Google button and a code in the URL');
  F.reset(); F.db.sessions.clear();
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE + 'start.html');
    await page.waitForLoadState('load');

    /* ---- THE AUTHORIZE URL, AND WHY THIS ASSERTION EXISTS ----------
       start.html carries the sign-in now, and src/lib/start-auth.js
       builds Supabase's authorize URL BY HAND rather than calling
       auth-js: cloud.js lives in the shared `studio` CORE chunk, so
       even a click-time import would fetch about a megabyte on the one
       click that has to be instant, and prove:growth asserts no
       Supabase chunk is fetched on this page at all.

       The cost of that is that the URL's SHAPE is now pinned in our
       own source. If Supabase ever changes /auth/v1/authorize, the
       app's own sign-in keeps working — it goes through the SDK — and
       only the landing page breaks, silently, for everyone arriving
       for the first time. Nothing else in this repository would point
       at it. THIS IS THE ONLY CHECK THAT CATCHES THAT DRIFT. Do not
       delete it, and do not relax it to "something was requested". */
    const btn = await page.$('[data-start-auth="google"]:visible');
    ok(!!btn, 'start.html carries a Continue with Google control ([data-start-auth="google"])');
    if (!btn) {
      skip('the authorize URL: origin and path, provider, redirect_to, scopes (no button to click)');
    } else {
      const nav = page.waitForRequest((q) => /\/auth\/v1\/authorize/.test(q.url()), { timeout: 8000 }).catch(() => null);
      await btn.click();
      const req = await nav;
      const u = req ? new URL(req.url()) : null;
      ok(!!u && u.origin + u.pathname === SB + '/auth/v1/authorize', 'the button navigates to <project>/auth/v1/authorize: ' + (u ? u.origin + u.pathname : 'no request was made'));
      ok(!!u && u.searchParams.get('provider') === 'google', 'carrying provider=google');
      /* THE HUB AS A DIRECTORY, AND NEVER WITH `.html` ON IT.
         Never back here: the flow is implicit, the tokens come home
         in the fragment, and only auth-js's detectSessionInUrl can
         store them. But WHICH spelling of the hub is the half that
         shipped broken: `redirect_to=.../index.html` is a 308 on a
         cleanUrls host, so the one navigation that carries a session
         was the one navigation production answered with a redirect,
         and the live site returned people to the landing page signed
         out. Anchored on the ABSENCE of `.html` as well as on the
         value, so a target that merely changes path still fails. */
      const rt = u ? u.searchParams.get('redirect_to') : null;
      ok(rt === BASE, 'redirect_to is the hub as a directory, where auth-js can store the tokens: ' + (rt || '-'));
      ok(!!rt && !/\.html(\?|#|$)/.test(rt), 'and carries no .html, which a cleanUrls host serves with a 308: ' + (rt || '-'));
      /* One consent covers Drive: ask for less here and drive-sync.js
         finds no provider_token later and the user meets a second
         consent screen for a permission they believe they gave. */
      ok(!!u && /drive\.file/.test(u.searchParams.get('scopes') || ''), 'and asks for the Drive scope in the same consent: ' + (u ? u.searchParams.get('scopes') : '—'));
    }

    /* ---- A CODE IN THE LANDING URL --------------------------------
       The console hands out start.html#code= now (block (f)), so this
       is the path a real invite takes. The fragment is never sent to a
       server, which is why the code travels in one — and it is
       scrubbed from the address bar so it cannot be shoulder-read or
       pasted onward by accident. cloud.js's runGate() redeems what is
       held here the first time this browser signs in. */
    const p2 = await ctx.newPage();
    const perrs = []; p2.on('pageerror', (e) => perrs.push(e.message));
    await p2.goto(BASE + 'start.html#code=LINK-CODE-2345');
    const held = await p2.waitForFunction(() => localStorage.getItem('fms_invite_code_v1'), null, { timeout: 8000 })
      .then((h) => h.jsonValue(), () => null);
    ok(!!held, 'start.html#code= holds the code in fms_invite_code_v1');
    ok(!!held && JSON.parse(held).code === 'LINKCODE2345', 'normalised, the dashes dropped: ' + String(held).slice(0, 80));
    ok(!/code=/.test(p2.url()), 'and the fragment is stripped from the address bar: ' + p2.url());
    /* THE CONTRACT FOR THE FEEDBACK. A visitor who followed an invite link
       must be told it took, or the only feedback for a correct code is that
       nothing visible happened. The banner that said so is gone with the
       rebuilt home page; the
       sign-up modal opens and says it, exactly as it does on a product page.
       What is asserted is unchanged: the code is held, the fragment is
       stripped, and the visitor is told. */
    const told = await p2.evaluate(() => {
      const m = document.getElementById('mkSignup');
      const el = document.getElementById('mkMsg');
      if (!m || !el) return null;
      const r = m.getBoundingClientRect();
      return { text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120), shown: !m.hidden && r.height > 0 };
    });
    ok(!!told && told.shown && /Invite code saved/.test(told.text), 'the visitor is told the code took (sign-up modal, #mkMsg): ' + JSON.stringify(told));

    /* ---- THE MARKETING PAGES ARE PUBLIC, AND A CODE WORKS FROM THEM --
       product-*.html sit outside the gate (EXEMPT in sitegate.js) and
       carry src/pages/marketing.js, which holds an invite code in the
       fragment exactly as start.js does and says so in the sign-up modal.
       The code is cleared first so this cannot pass on the start page's
       write above. */
    await p2.evaluate(() => localStorage.removeItem('fms_invite_code_v1'));
    const p6 = await ctx.newPage();
    const merrs = []; p6.on('pageerror', (e) => merrs.push(e.message));
    await p6.goto(BASE + 'product-writing.html#code=LINK-CODE-2345');
    const mheld = await p6.waitForFunction(() => localStorage.getItem('fms_invite_code_v1'), null, { timeout: 8000 })
      .then((h) => h.jsonValue(), () => null);
    ok(/product-writing\.html/.test(p6.url()), 'a signed-out visitor stays on product-writing.html (exempt from the gate): ' + p6.url());
    ok(!!mheld && JSON.parse(mheld).code === 'LINKCODE2345', 'product-writing.html#code= holds the code in fms_invite_code_v1');
    ok(!/code=/.test(p6.url()), 'and strips the fragment from the address bar: ' + p6.url());
    const modalOpen = await p6.evaluate(() => { const m = document.getElementById('mkSignup'); return !!m && !m.hidden; });
    ok(modalOpen, 'the sign-up modal opens to say the code was saved');
    ok(/Invite code saved/.test(await p6.evaluate(() => (document.getElementById('mkMsg') || {}).textContent || '')), 'and says so');
    await p6.keyboard.press('Escape');
    ok(await p6.evaluate(() => document.getElementById('mkSignup').hidden), 'Escape closes the modal');
    await p6.goto(BASE + 'product-schedule.html');
    await p6.waitForTimeout(400);
    ok(/product-schedule\.html/.test(p6.url()), 'product-schedule.html is exempt too');
    allErrors.push(...errs, ...perrs, ...merrs); await ctx.close();
  }

  console.log('(p) optimistic admission: a passed tab paints at once');
  F.reset(); F.db.sessions.clear();
  {
    /* The Supabase origin answers SLOWLY here (1.2s a call), which is what
       a real network does and what makes "waited for cloud:booted"
       measurable. A recorder in the page notes, against navigation start,
       when the veil lifted and when main first had content. */
    const DELAY = 1200;
    const slowCtx = async (tok, seedPass) => {
      const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
      await ctx.route(SB + '/**', async (r) => { await new Promise((x) => setTimeout(x, DELAY)); return handle(r); });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
      await ctx.addInitScript(([k, v, uid, pass]) => {
        if (k && !sessionStorage.getItem('__seeded')) {
          localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid);
          sessionStorage.setItem('__seeded', '1');
        }
        if (pass && !sessionStorage.getItem('__passSeeded')) { sessionStorage.setItem('fms_sitegate_pass', '1'); sessionStorage.setItem('__passSeeded', '1'); }
        window.__t = { veil: null, content: null, boot: null };
        /* A tab that has NOT passed must be seen veiled before the veil can
           count as lifted: store.js's top-level await splits module
           evaluation, so cloud.js (window.StudioCloud) can run a frame
           before sitegate.js marks the page pending, and a tick in that
           gap used to record a false "lifted at 0ms". Only a tab that had
           already passed may lift without ever showing pending (optimistic
           admission). */
        window.__t.passedAtStart = !!sessionStorage.getItem('fms_sitegate_pass');
        const tick = () => {
          const de = document.documentElement; if (!de) return requestAnimationFrame(tick);
          const t = performance.now();
          if (window.__t.veil == null && de.dataset.sitegate !== 'pending' && (window.__t.seen || (window.__t.passedAtStart && window.StudioCloud))) window.__t.veil = t;
          if (de.dataset.sitegate === 'pending') window.__t.seen = true;
          /* index.html ships a static public summary (main.hub-static) for
             crawlers; it is not the app's content, so it is skipped. */
          const m = document.querySelector('main:not(.hub-static)');
          { const mm = m; if (window.StudioCloud && !/start|invite/.test(location.pathname) && de.dataset.sitegate == null && mm && (mm.textContent || '').trim().length > 20) { try { sessionStorage.setItem('__leak', '1'); } catch (e) { /* ignore */ } } }
          if (window.__t.content == null && de.dataset.sitegate == null && m && (m.textContent || '').trim().length > 20) window.__t.content = t;
          if (window.__t.boot == null && window.StudioCloud && window.StudioCloud.isBooted && window.StudioCloud.isBooted()) window.__t.boot = t;
          if (window.__t.content == null || window.__t.veil == null) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, [tok ? `sb-${REF}-auth-token` : null, tok ? sessionFor(tok) : null, tok ? USERS[tok].id : null, seedPass]);
      const page = await ctx.newPage();
      return { ctx, page };
    };
    const times = (page) => page.evaluate(() => ({ ...window.__t, now: performance.now(), sg: document.documentElement.dataset.sitegate || '' }));

    // 1. a member whose tab has not passed yet: the first page waits for the gate (veil up, > the network delay)
    const M = await slowCtx('tok-admin', false);
    await M.page.goto(BASE + 'index.html');
    await M.page.waitForTimeout(300);
    ok((await times(M.page)).sg === 'pending', 'a tab that has not passed yet is still veiled while the gate is unanswered');
    await M.page.waitForFunction(() => !document.documentElement.dataset.sitegate, null, { timeout: 15000 });
    const t0 = await times(M.page);
    ok(t0.veil > DELAY * 0.8, `first page: the veil lifts only after the gate answers (${Math.round(t0.veil)}ms)`);
    console.log(`    timing index.html (first, not passed): veil ${Math.round(t0.veil)}ms, content ${Math.round(t0.content || -1)}ms`);
    // 2. later pages in the same, now passed, tab
    for (const p of ['admin.html', 'purchase.html', 'story.html']) {
      await M.page.goto(BASE + p);
      await M.page.waitForFunction(() => window.__t && window.__t.content != null, null, { timeout: 15000 }).catch(() => {});
      const t = await times(M.page);
      console.log(`    timing ${p} (passed tab): veil ${Math.round(t.veil)}ms, content ${Math.round(t.content || -1)}ms, booted ${t.boot == null ? 'not yet' : Math.round(t.boot) + 'ms'}`);
      ok(t.veil != null && t.veil < 1000, `${p} in a passed tab: veil lifted in ${Math.round(t.veil)}ms, under 1000ms (the network answers in ${DELAY}ms)`);
      ok(t.boot == null || t.veil < t.boot, `${p}: and before cloud:booted (did not wait for it)`);
      ok(M.page.url().endsWith('/' + p), `${p}: and stays on it`);
    }
    await M.ctx.close();

    // 3. a fresh tab (nothing passed): veiled, and a stranger is still redirected
    const S = await slowCtx(null, false);
    await S.page.goto(BASE + 'breakdown.html');
    await S.page.waitForTimeout(200);
    ok(await urlBecomes(S.page, /start\.html/, 15000), 'a stranger (nothing passed, no session) is still sent to start.html');
    ok(await S.page.evaluate(() => sessionStorage.getItem('__leak')) == null, 'and never saw the page content first');
    await S.ctx.close();

    // 4. a pass flag alone is not enough: no stored session and no code means no optimism
    const P = await slowCtx(null, true);
    await P.page.goto(BASE + 'breakdown.html');
    await P.page.waitForTimeout(200);
    ok(await urlBecomes(P.page, /start\.html/, 15000), 'a pass flag with no stored session and no code is still sent away');
    ok(await P.page.evaluate(() => sessionStorage.getItem('__leak')) == null, 'and never saw the page content first (no optimism on a flag alone)');
    await P.ctx.close();

    // 5. a background deny after optimistic admission still redirects
    F.db.sessions.clear();
    const D = await slowCtx('tok-dan', true);   // dan is not a member; the tab claims a pass
    await D.page.goto(BASE + 'breakdown.html');
    await D.page.waitForTimeout(250);
    const td = await times(D.page);
    ok(td.sg === '' && /breakdown\.html/.test(D.page.url()), 'a passed tab with a stored session is admitted before the verdict');
    ok(await urlBecomes(D.page, /invite\.html|start\.html/, 15000), 'and the verdict, a deny, still redirects it: ' + D.page.url());
    ok(await D.page.evaluate(() => sessionStorage.getItem('fms_sitegate_pass')) == null, 'and the pass is cleared');
    await D.ctx.close();
  }

  console.log('(q) a lapsed trial: one stable wall, and a way out that stays out (schema section 33)');
  {
    /* THE PRODUCTION BUILD (dist/), the gate ON, purchases required: Amy
       is a member whose trial has run out. Before §33 the wall hid the
       band and the phone bar (the only route to sign-out), offered only
       SEE PLANS, and every road back — invite.html's "You're in", the
       landing page's sign-in — led to the same wall. */
    F.reset();
    const amyId = USERS['tok-amy'].id;
    F.db.members.set(amyId, { role: 'user', disabled_at: null });
    expireTrial(amyId);
    const navs = (page) => { const n = []; page.on('framenavigated', (f) => { if (f === page.mainFrame()) n.push(f.url().replace(BASE, '/')); }); return n; };

    const A = await newContext(browser, { tok: 'tok-amy' });
    await A.page.setViewportSize({ width: 390, height: 844 });
    const n1 = navs(A.page);
    await A.page.goto(BASE + 'dashboard.html');
    await A.page.waitForTimeout(10000);
    ok(n1.length <= 1 && !!(await A.page.$('.pg-wall')), 'a fresh load after expiry: ' + n1.length + ' navigation in ten seconds and a wall that stays (no loop)');
    const out = await A.page.$('.pg-wall [data-auth-action="signout"]');
    ok(!!out && await out.isVisible(), 'at 390px, with the phone bar hidden under the wall, the wall itself offers SIGN OUT');
    if (out) {
      await out.click();
      ok(await urlBecomes(A.page, /start\.html/, 15000), 'SIGN OUT lands on start.html');
      ok(!(await A.page.evaluate((k) => localStorage.getItem(k), `sb-${REF}-auth-token`)), 'and the stored session is gone');
      await A.page.goto(BASE + 'dashboard.html');
      ok(await urlBecomes(A.page, /start\.html/, 15000), 'it stays out: the app sends the signed-out visitor back to start.html');
      ok(await A.page.evaluate(() => sessionStorage.getItem('fms_sitegate_pass')) == null, 'with no site-gate pass left behind to admit it optimistically');
    } else {
      skip('signing out from the wall (no button)');
    }
    allErrors.push(...A.errors); await A.ctx.close();

    F.db.sessions.clear();
    const I = await newContext(browser, { tok: 'tok-amy' });
    await I.page.goto(BASE + 'invite.html');
    await I.page.waitForFunction(() => /free trial is over/i.test(document.body.textContent), null, { timeout: 12000 }).catch(() => {});
    const t = await I.page.textContent('main').catch(() => '');
    ok(/free trial is over/i.test(t) && !/GO TO THE STUDIO/.test(t), 'invite.html says the trial is over and does not send a lapsed member to the studio (the wall)');
    allErrors.push(...I.errors); await I.ctx.close();
  }

  console.log('(r) the purchases switch IS the door, and the trial waits for a press (owner, 12 Oct 2026)');
  {
    /* 1. PURCHASES OFF -> THE WEBSITE IS OPEN to anybody signed in.
       Dan is not a member and never will be in this block; with nothing
       for sale there is nothing to be a member OF. Membership still
       decides whether his work SYNCS, which is cloud.js's business and
       is deliberately untouched. */
    F.reset();
    F.db.settings.purchase_required = false;
    const O = await newContext(browser, { tok: 'tok-dan' });
    await O.page.goto(BASE + 'breakdown.html');
    await O.page.waitForTimeout(2500);
    ok(/breakdown\.html/.test(O.page.url()), 'purchases OFF: a signed-in non-member stays on the page — the website is open: ' + O.page.url());
    ok((await O.page.evaluate(() => document.documentElement.dataset.sitegate || '')) === '', 'and the veil is lifted, not merely un-redirected');
    ok((await O.page.evaluate(() => window.StudioCloud.getGateState().state)) === 'closed', 'while the CLOUD gate is still closed — the site opened, sync did not');
    ok(!F.db.calls.includes('start_trial'), 'and no trial was spent to do it');
    allErrors.push(...O.errors); await O.ctx.close();

    /* 2. PURCHASES ON -> the offer page, and nothing starts by itself. */
    F.reset();
    F.db.settings.purchase_required = true;
    const N = await newContext(browser, { tok: 'tok-dan' });
    await N.page.goto(BASE + 'index.html');
    ok(await urlBecomes(N.page, /invite\.html/), 'purchases ON: a fresh sign-in is sent to the offer page');
    await N.page.waitForSelector('#trial [data-iv-action="start-trial"]', { timeout: 12000 });
    const label = await N.page.textContent('#trial [data-iv-action="start-trial"]');
    ok(/START MY/i.test(label || ''), 'the trial is offered by name: ' + JSON.stringify(label));
    ok(!F.db.calls.includes('start_trial'), 'and it has NOT started: nothing is spent until the press');
    /* THE REGRESSION THIS BLOCK EXISTS FOR. invite.js offered a trial
       only when billing_status() said entitled was false; with the
       switch OFF entitled is true for everybody, so the button was
       never drawn and the whole feature was unreachable in production
       while every proof here passed. Assert the button, not the flag. */
    await N.page.click('#trial [data-iv-action="start-trial"]');
    ok(await urlBecomes(N.page, /index\.html|dashboard\.html|\/$/, 15000), 'pressing it opens the studio: ' + N.page.url());
    ok(F.db.calls.includes('start_trial'), 'start_trial was called — by the press, and only by the press');
    ok(F.db.members.has(USERS['tok-dan'].id), 'and the membership row the site gate reads now exists');
    allErrors.push(...N.errors); await N.ctx.close();

    /* 3. A TRIAL ALREADY USED -> plans, no trial button, and no loop. */
    F.reset();
    F.db.settings.purchase_required = true;
    const danId = USERS['tok-dan'].id;
    F.db.members.set(danId, { role: 'user', disabled_at: null });
    expireTrial(danId);
    const U = await newContext(browser, { tok: 'tok-dan' });
    const seen = [];
    U.page.on('framenavigated', (f) => { if (f === U.page.mainFrame()) seen.push(f.url().replace(BASE, '/')); });
    await U.page.goto(BASE + 'invite.html');
    await U.page.waitForFunction(() => /free trial is over/i.test(document.body.textContent), null, { timeout: 12000 }).catch(() => {});
    ok(!(await U.page.$('#trial [data-iv-action="start-trial"]')), 'a used trial is NOT offered again');
    ok(/free trial is over/i.test(await U.page.textContent('main').catch(() => '')), 'the page says so plainly');
    await U.page.waitForTimeout(6000);
    ok(seen.length <= 1, 'and it is one page, not a loop: ' + seen.length + ' navigation');
    allErrors.push(...U.errors); await U.ctx.close();

    /* 4. A CODE IS NO LONGER A KEY ON ITS OWN. Signed out, the box holds
       the code and goes to Google; it must not enter the studio, and it
       must not leave a site-gate pass behind. */
    F.reset();
    const C = await newContext(browser);
    await C.page.goto(BASE + 'invite.html');
    await C.page.waitForSelector('#invite #gtCode', { timeout: 12000 });
    await C.page.fill('#gtCode', 'amy code 2345 6');
    await C.page.click('#invite button[type="submit"]');
    await C.page.waitForTimeout(2500);
    ok(!/index\.html|dashboard\.html/.test(C.page.url()), 'a typed code does not enter the studio on its own: ' + C.page.url());
    /* BACK TO OUR OWN ORIGIN BEFORE READING STORAGE. The submit has
       navigated to Google, and localStorage is per origin — read it
       there and every key is null, which reads as "the code was not
       held" and is really "you are looking at the wrong origin". */
    await C.page.goto(BASE + 'invite.html');
    ok(await C.page.evaluate(() => sessionStorage.getItem('fms_sitegate_pass')) == null, 'and leaves no site-gate pass behind');
    ok(!!(await C.page.evaluate((k) => localStorage.getItem(k), 'fms_invite_code_v1')), 'the code is HELD in this browser, to be spent on the account that signs in');
    allErrors.push(...C.errors); await C.ctx.close();

    /* 5. AND A REDEEMED CODE STARTS ITS TRIAL. redeem_invite() writes the
       membership but never trial_started_at, so without startCodeTrial()
       a code holder was a member who was not entitled — walled, on their
       first page, by the thing the code was supposed to open. */
    F.reset();
    F.db.settings.purchase_required = true;
    const K = await newContext(browser, { tok: 'tok-amy' });
    await K.page.goto(BASE + 'invite.html');
    await K.page.waitForSelector('#invite #gtCode', { timeout: 12000 });
    await K.page.fill('#gtCode', 'amy code 2345 6');
    await K.page.click('#invite button[type="submit"]');
    const opened = await waitGate(K.page, 'open');
    ok(opened, 'a signed-in redemption opens the gate' + (opened ? '' : ' — box said: ' + JSON.stringify(await K.page.textContent('#invite').catch(() => '')) ));
    await K.page.waitForTimeout(1500);
    ok(F.db.calls.includes('start_trial'), 'and the code starts the trial it carries — the submission was the press (calls: ' + F.db.calls.slice(-6).join(',') + ')');
    allErrors.push(...K.errors); await K.ctx.close();
  }

  /* (s) THE OFFLINE GRACE (owner, 19 Oct 2026). A server-confirmed
     admission stamps fms_sitegate_verified_v1; a NEW tab that cannot reach
     the server (the status and switch calls aborted, as with no signal)
     is let in on a fresh stamp for the same account, and turned away on
     a stale one, another account's, or a server that answers "no". */
  {
    console.log('(s) the offline grace');
    F.reset();
    F.db.settings.purchase_required = true;
    const S = await newContext(browser, { tok: 'tok-admin' });
    await S.page.goto(BASE + 'index.html');
    ok(await waitGate(S.page, 'open'), '(s) a member is let in online');
    await S.page.waitForTimeout(500);
    const st = await S.page.evaluate(() => JSON.parse(localStorage.getItem('fms_sitegate_verified_v1') || 'null'));
    ok(!!st && st.uid === USERS['tok-admin'].id && Math.abs(Date.now() - st.at) < 60000, '(s) and that admission is stamped for that account: ' + JSON.stringify(st));
    /* Only the offline tab may be open: a tab that is online re-checks
       when another tab writes the session, and stamps afresh, which is
       right for it and would overwrite the stamp under test. */
    const ctx = S.ctx;
    await S.page.close();
    const offlineTab = async (stamp) => {
      const p = await ctx.newPage();
      await p.route(/\/rest\/v1\/rpc\/(studio_status|purchases_required)/, (r) => r.abort('internetdisconnected'));
      if (stamp) await p.addInitScript((v) => localStorage.setItem('fms_sitegate_verified_v1', JSON.stringify(v)), stamp);
      await p.goto(BASE + 'dashboard.html').catch(() => {});
      await p.waitForTimeout(4000);
      const u = p.url();
      await p.close(); return u;
    };
    const uid = USERS['tok-admin'].id;
    const fresh = await offlineTab(null);
    ok(/dashboard\.html/.test(fresh), '(s) a cold start with no signal opens on a fresh stamp: ' + fresh);
    const stale = await offlineTab({ at: Date.now() - 15 * 86400000, uid });
    ok(/invite\.html/.test(stale), '(s) a stamp older than 14 days does not: ' + stale);
    const future = await offlineTab({ at: Date.now() + 86400000, uid });
    ok(/invite\.html/.test(future), '(s) a stamp dated in the future is not believed: ' + future);
    const other = await offlineTab({ at: Date.now() - 3600000, uid: USERS['tok-amy'].id });
    ok(/invite\.html/.test(other), "(s) another account's stamp does not admit this one: " + other);
    allErrors.push(...S.errors); await ctx.close();

    /* A "no" from the server is never overridden by a stamp. */
    F.reset();
    F.db.settings.purchase_required = true;
    const N = await newContext(browser, { tok: 'tok-amy' });
    await N.page.addInitScript((v) => localStorage.setItem('fms_sitegate_verified_v1', JSON.stringify(v)), { at: Date.now(), uid: USERS['tok-amy'].id });
    await N.page.goto(BASE + 'dashboard.html').catch(() => {});
    ok(await urlBecomes(N.page, /invite\.html/), '(s) a non-member with a fresh stamp is still sent to the door when the server answers: ' + N.page.url());
    allErrors.push(...N.errors); await N.ctx.close();

    /* Signed out for real (no session on the device): the stamp goes. */
    const O = await newContext(browser);
    await O.page.addInitScript((v) => { if (!sessionStorage.getItem('__st')) { localStorage.setItem('fms_sitegate_verified_v1', JSON.stringify(v)); sessionStorage.setItem('__st', '1'); } }, { at: Date.now(), uid: USERS['tok-amy'].id });
    await O.page.goto(BASE + 'dashboard.html').catch(() => {});
    ok(await urlBecomes(O.page, /start\.html/), '(s) signed out goes to the landing page: ' + O.page.url());
    ok(await O.page.evaluate(() => localStorage.getItem('fms_sitegate_verified_v1')) == null, '(s) and the stamp is cleared with the sign-out');
    allErrors.push(...O.errors); await O.ctx.close();
  }

  /* (t) A REFUSED CHANGE IS NOT "OFFLINE" (owner, 20 Oct 2026). The pill
     read "4 changes waiting (offline)" on a connected machine, for ever:
     idleSync() called any queue offline and the flush retried a refusal
     every 30 seconds without saying why. */
  {
    console.log('(t) a refused change is named, backed off, and clears');
    F.reset();
    const T = await newContext(browser, { tok: 'tok-admin' });
    await T.page.goto(BASE + 'index.html');
    ok(await waitGate(T.page, 'open'), '(t) a member is in');
    const qread = () => T.page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_cloud_queue_v1') || '[]'));
    const status = () => T.page.evaluate(() => window.StudioCloud.getSyncStatus());
    const pill = () => T.page.evaluate(() => { const p = document.querySelector('.sh-sync, [data-sync-pill]'); return p ? (p.textContent || '').trim() + ' | ' + (p.getAttribute('aria-label') || '') : ''; });
    const save = (v) => T.page.evaluate((val) => {
      const S = window.StudioStore;
      if (!S.currentProjectId()) { const p = S.createProject({ title: 'Queue Film', format: 'feature' }); S.setCurrentProject(p.id); }
      localStorage.setItem('fms_scenes_v1', JSON.stringify([{ id: 's1', heading: 'INT. ROOM - DAY', note: val }]));
    }, v);
    F.db.refuseData = 'P0402';
    await save('one');
    await T.page.waitForFunction(() => JSON.parse(localStorage.getItem('fms_studio_cloud_queue_v1') || '[]').some((o) => o.code), null, { timeout: 8000 }).catch(() => {});
    let q = await qread(), st = await status();
    ok(q.length > 0 && q.every((o) => o.code === 'P0402' && o.nextAt > Date.now()), '(t) the refused change is queued WITH its code and a back-off: ' + JSON.stringify(q.map((o) => [o.scope, o.code, o.tries])));
    ok(st.state === 'error' && /plan/i.test(st.detail) && !/offline/i.test(st.detail), '(t) the status names the plan limit, not "offline": ' + st.state + ' / ' + st.detail);
    ok(!/offline/i.test(await pill()), '(t) the band pill does not say offline: ' + await pill());
    const before = F.db.calls.filter((c) => c.startsWith('write:project_data')).length;
    await T.page.evaluate(() => window.StudioCloud.flushQueue());
    await T.page.waitForTimeout(600);
    ok(F.db.calls.filter((c) => c.startsWith('write:project_data')).length === before, '(t) a flush inside the back-off does not ask again');
    /* The cause goes away and the back-off runs out: it clears by itself. */
    F.db.refuseData = null;
    await T.page.evaluate(() => {
      const q = JSON.parse(localStorage.getItem('fms_studio_cloud_queue_v1') || '[]').map((o) => Object.assign(o, { nextAt: 0 }));
      localStorage.setItem('fms_studio_cloud_queue_v1', JSON.stringify(q));
      return window.StudioCloud.flushQueue();
    });
    await T.page.waitForTimeout(600);
    q = await qread(); st = await status();
    ok(q.length === 0 && st.state === 'synced', '(t) once accepted, the queue empties and the pill reads Synced: ' + q.length + ' / ' + st.state + ' / ' + st.detail);
    /* Really offline: THEN it says so, and it flushes on the way back. */
    /* setOffline flips navigator.onLine, but the fake's route handler would
       still answer; drop its traffic too, as a dead network would. */
    const dead = (r) => r.abort('internetdisconnected');
    await T.ctx.route(SB + '/**', dead);
    await T.ctx.setOffline(true);
    await save('two');
    await T.page.waitForTimeout(2500);
    q = await qread(); st = await status();
    ok(q.length > 0 && q.every((o) => !o.code) && st.state === 'offline', '(t) offline, the change waits without a refusal code and the state is offline: ' + st.state + ' / ' + st.detail);
    await T.ctx.unroute(SB + '/**', dead);
    await T.ctx.setOffline(false);
    await T.page.waitForFunction(() => window.StudioCloud.getSyncStatus().pending === 0, null, { timeout: 8000 }).catch(() => {});
    st = await status();
    ok(st.pending === 0 && st.state === 'synced', '(t) back online, it flushes and reads Synced: ' + st.pending + ' / ' + st.state);
    allErrors.push(...T.errors); await T.ctx.close();
  }

  console.log('(pass) the launch pass at the door (schema §61)');
  {
    /* While the pass is on sale the door leads with it, not with a free
       trial; an invite CODE still opens the studio on its own trial. */
    F.reset();
    Object.assign(F.db.settings, { pass_enabled: true, pass_paise: 4900, pass_days: 7, pass_plan: 'pro', pass_ends_at: new Date(Date.now() + 86400e3).toISOString(), pass_cap: null });
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-ben' });
    await page.goto(BASE + 'invite.html');
    await page.waitForSelector('#pass [data-iv-action="buy-pass"]', { timeout: 10000 }).then(() => ok(true, 'the door leads with the pass for a signed-in stranger'), () => ok(false, 'the door leads with the pass for a signed-in stranger'));
    ok(!(await page.$('#trial')), 'and offers no free trial');
    ok(/Try the whole studio for ₹49/.test(await page.textContent('main').catch(() => '')), 'the deck and the section name the server\'s price');
    ok(!(await page.$('#pass [data-pass-left]:not([hidden])')), 'with no cap, no "left" line');
    const order = await page.evaluate(() => [...document.querySelectorAll('main section[id]')].map((s) => s.id).join(','));
    ok(/^pass,buy,invite/.test(order), 'the order is pass, plans, code: ' + order);
    await page.fill('#gtCode', 'BEN CODE 2345 6');
    await page.click('#invite button[type="submit"]');
    ok(await waitGate(page, 'open'), 'an invite code still opens the gate while the pass is on sale');
    ok(F.db.members.has(USERS['tok-ben'].id) && !F.db.payments.some((p) => p.user_id === USERS['tok-ben'].id), 'Ben is a member on the code, having paid nothing');
    allErrors.push(...errors); await ctx.close();
  }
} catch (e) {
  fail++; console.log('  ✗ run aborted: ' + e.message);
}

const real = allErrors.filter((e) => !/net::|ERR_|CERT|fetch/i.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.kill();
console.log(`${fail ? '✗' : '✓'} gate proof: ${pass} passed, ${fail} failed${skipped ? `, ${skipped} skipped` : ''}`);
process.exit(fail ? 1 : 0);
