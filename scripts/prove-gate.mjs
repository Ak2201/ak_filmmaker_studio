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
         invite.html; so is a signed-in non-member; a member sees the
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

   Run:  npm run build && node scripts/prove-gate.mjs
   ============================================================ */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';
import fs from 'node:fs';
import { F, USERS, SB, REF, handle, sessionFor, freshDb } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
/* This proof is about the GATED build — the one the hosts deploy. The
   open build (npm run build:open, for verify) would pass the sign-in
   scenarios and silently skip the site gate, so it is refused here the
   way verify refuses the gated one. */
{
  const idx = path.join(ROOT, 'dist', 'index.html');
  const stamp = fs.existsSync(idx) ? (fs.readFileSync(idx, 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1] : null;
  if (stamp !== 'invite') {
    console.error(`✗ dist/ was built with the site gate ${stamp === 'off' ? 'OFF' : 'unstamped'}; this proof needs the production build: npm run build`);
    process.exit(2);
  }
}
const PORT = Number(process.env.PROVE_PORT) || 5357;
const BASE = `http://localhost:${PORT}/`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

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

/* ---- run ------------------------------------------------------ */
const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
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
    await page.goto(BASE + 'settings.html');
    await page.waitForURL(/invite\.html/, { timeout: 8000 }).catch(() => {});   // let the site gate's redirect land before asserting
    ok(await waitGate(page, 'closed'), 'a signed-in user is CLOSED when the functions do not exist');
    ok((await gateReason(page)) === 'notdeployed', "and the reason is 'notdeployed', not 'no invite'");
    ok(/not switched on/i.test(await syncDetail(page)), 'the sync status says the gate is not switched on');
    await page.waitForTimeout(1200);
    ok(writes() === 0, 'nothing was uploaded');
    /* Under the site gate a closed visitor never sees the hub, so the
       pill's INVITE NEEDED state is unreachable on the website; what
       they get is the doorway, on every page they try. */
    await page.goto(BASE + 'index.html');
    await page.waitForURL(/invite\.html/, { timeout: 8000 }).then(() => ok(true, 'the hub sends a closed visitor to invite.html'), () => ok(false, 'the hub sends a closed visitor to invite.html'));
    await page.goto(BASE + 'invite.html');
    await page.waitForSelector('#request');
    ok(/not switched on/i.test(await page.textContent('#request')), 'invite.html says the gate is not switched on');
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
    await page.goto(BASE + 'settings.html');
    await page.waitForURL(/invite\.html/, { timeout: 8000 }).catch(() => {});   // same: assert on the page that stays
    ok(await waitGate(page, 'closed'), 'the gate CLOSES for a non-member');
    ok((await gateReason(page)) === 'noinvite', "reason 'noinvite'");
    const writesBefore = writes();
    ok(/awaiting an invite/i.test(await syncDetail(page)), 'the sync status says why it is paused');
    await page.waitForSelector('#invite #gtCode');
    ok(/invite\.html/.test(page.url()), 'settings.html became invite.html — the site gate — and the code box is there');
    ok(!!(await page.$('#request [data-ir-form]')), 'with the request form beside it');
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
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-cal', landing: true });
    await page.goto(BASE + 'story.html');
    await page.waitForURL(/invite\.html/, { timeout: 8000 }).then(() => ok(true, 'the first load after a closed sign-in lands on invite.html'), () => ok(false, 'the first load after a closed sign-in lands on invite.html'));
    await page.waitForSelector('#request [data-ir-form]', { timeout: 8000 });
    const who = await page.textContent('#request .ir-who');
    ok(who.includes('cal@example.com') && who.includes('Cal Fernandes'), 'the form shows the attested Google account and name, read-only');
    ok(!(await page.evaluate(() => sessionStorage.getItem('fms_gate_landing'))), 'the landing marker was consumed');
    await page.goto(BASE + 'story.html');
    await page.waitForURL(/invite\.html/, { timeout: 8000 }).then(() => ok(true, 'the NEXT page is bounced too — the whole website is behind the gate now'), () => ok(false, 'the NEXT page is bounced too — the whole website is behind the gate now'));
    ok((await page.evaluate(() => document.documentElement.dataset.sitegate || '')) === '', 'invite.html itself is exempt (no data-sitegate)');

    console.log('(j) the request, and the approval');
    await page.goto(BASE + 'invite.html');
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
    await page.waitForURL(/invite\.html/, { timeout: 8000 }).then(() => ok(true, 'while pending, the hub still sends Cal to invite.html'), () => ok(false, 'while pending, the hub still sends Cal to invite.html'));
    ok(writes() === 0, 'still nothing uploaded');
    allErrors.push(...errors);

    const A = await newContext(browser, { tok: 'tok-admin' });
    await A.page.goto(BASE + 'admin.html');
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
    await D.page.goto(BASE + 'invite.html');
    await D.page.waitForSelector('#request [data-ir-form]');
    await D.page.click('#request [data-ir-form] button[type="submit"]');
    await D.page.waitForSelector('#request .ir-state.is-pending', { timeout: 8000 });
    /* The admin's lock from (j) is still fresh and a new context is a
       new device, so without this the console sits under the takeover
       prompt — the lock doing its job. Release it, as (d) does. */
    F.db.sessions.delete(USERS['tok-admin'].id);
    const A2 = await newContext(browser, { tok: 'tok-admin' });
    A2.page.on('dialog', (d) => d.accept('Not this season — ask Amy to vouch for you.'));
    await A2.page.goto(BASE + 'admin.html');
    await A2.page.waitForSelector('#admin-console [data-gate-action="decline"]', { timeout: 10000 });
    await A2.page.click('#admin-console [data-gate-action="decline"]');
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
      await page.waitForURL(/invite\.html/, { timeout: 8000 }).then(() => ok(true, `signed out: ${p} → invite.html`), () => ok(false, `signed out: ${p} → invite.html`));
    }
    const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('main')).visibility);
    ok(hidden === 'visible', 'invite.html renders (it is the one page a stranger may see)');
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
    ok(new RegExp(`${d.users}\\s*Signed in, ever`).test(text.replace(/\s+/g, ' ')), `"Signed in, ever" counts ${d.users} (auth.users)`);
    ok(new RegExp(`${d.members}\\s*Through the gate`).test(text.replace(/\s+/g, ' ')), `"Through the gate" counts ${d.members} members`);
    ok(/1\s*Organisations/.test(text.replace(/\s+/g, ' ')) && text.includes('Dragon Pictures') && text.includes('1 of 5'), 'the organisation is listed with its owner, seats and films');
    ok(text.includes('cal@example.com') && text.includes('dan@example.com') && /not a member|declined/.test(text), 'everyone who signed in is listed, including non-members');
    ok(!!(await A.page.$('#admin-console')), "the gate's controls are on the same page");
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
    await page.waitForURL(/index\.html|\/$/, { timeout: 10000 }).then(() => ok(true, 'opening an invite link enters the studio, no typing, no sign-in'), () => ok(false, 'opening an invite link enters the studio, no typing, no sign-in'));
    ok(!/code=/.test(page.url()), 'the code is gone from the address bar');
    await page.waitForFunction(() => !document.documentElement.dataset.sitegate, null, { timeout: 8000 });
    await page.goto(BASE + 'breakdown.html');
    await page.waitForFunction(() => !document.documentElement.dataset.sitegate, null, { timeout: 8000 }).then(() => ok(true, 'other pages open for the code-only visitor'), () => ok(false, 'other pages open for the code-only visitor'));
    ok(F.db.codes.find((c) => c.code === 'LINKCODE2345').redemptions_count === 0, 'nothing is spent by entering');
    await page.goto(BASE + 'invite.html');
    await page.waitForSelector('#through', { timeout: 8000 });
    ok(/with a code/i.test(await page.textContent('#through')), 'invite.html says they are in with a code and offers sign-in');
    // A NEW browser session with the same remembered code: re-verified, still valid.
    const stored = await page.evaluate(() => localStorage.getItem('fms_invite_code_v1'));
    await ctx.close();
    const ctx2 = await browser.newContext({ serviceWorkers: 'block' });
    await ctx2.route(SB + '/**', handle);
    await ctx2.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    await ctx2.addInitScript((v) => { if (!sessionStorage.getItem('__code')) { localStorage.setItem('fms_invite_code_v1', v); sessionStorage.setItem('__code', '1'); } }, stored);
    const p2 = await ctx2.newPage();
    const before = F.db.calls.length;
    await p2.goto(BASE + 'story.html');
    await p2.waitForFunction(() => !document.documentElement.dataset.sitegate, null, { timeout: 8000 }).then(() => ok(true, 'a new session with the remembered code is in'), () => ok(false, 'a new session with the remembered code is in'));
    ok(F.db.calls.slice(before).includes('verify_invite'), 'after re-verifying the code with the server');
    await ctx2.close();
    // Revoked: forgotten, and the door shuts.
    F.db.codes.find((c) => c.code === 'LINKCODE2345').revoked_at = new Date().toISOString();
    const ctx3 = await browser.newContext({ serviceWorkers: 'block' });
    await ctx3.route(SB + '/**', handle);
    await ctx3.route(/fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    /* Once per context — an init script re-running on every navigation
       would put the code back after the app forgot it, and the
       assertion below is exactly that the app forgot it. */
    await ctx3.addInitScript((v) => { if (!sessionStorage.getItem('__code')) { localStorage.setItem('fms_invite_code_v1', v); sessionStorage.setItem('__code', '1'); } }, stored);
    const p3 = await ctx3.newPage();
    await p3.goto(BASE + 'story.html');
    await p3.waitForURL(/invite\.html/, { timeout: 10000 }).then(() => ok(true, 'a revoked code no longer opens the door'), () => ok(false, 'a revoked code no longer opens the door'));
    ok(!(await p3.evaluate(() => localStorage.getItem('fms_invite_code_v1'))), 'and the browser forgets it');
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

  console.log('(c) signed out: code, Google, redeemed on return');
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/accounts\.google\.com|fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    await page.goto(BASE + 'settings.html');
    await page.waitForSelector('#invite #gtCode');
    await page.fill('#gtCode', 'BENCODE23456');
    await page.click('#invite button[type="submit"]');
    await page.waitForURL(/index\.html|\/$/, { timeout: 8000 }).then(() => ok(true, 'a valid code enters the studio with NO sign-in'), () => ok(false, 'a valid code enters the studio with NO sign-in'));
    await page.waitForFunction(() => !document.documentElement.dataset.sitegate, null, { timeout: 8000 }).then(() => ok(true, 'and the hub renders for the code-only visitor'), () => ok(false, 'and the hub renders for the code-only visitor'));
    const t = await page.evaluate(() => [sessionStorage.getItem('fms_preauth_ticket'), localStorage.getItem('fms_preauth_ticket'), JSON.parse(localStorage.getItem('fms_invite_code_v1') || 'null')]);
    ok(!!t[0] && !t[1], 'the pre-auth ticket waits in sessionStorage, never localStorage');
    ok(t[2] && t[2].code === 'BENCODE23456', 'the code is remembered for this browser');
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
    ok(/active in another Chrome window/i.test(await B.page.textContent('.gt-overlay')), 'browser B is asked before anything is taken over');
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
    await B.page.waitForURL(/invite\.html/, { timeout: 8000 }).then(() => ok(true, 'and the site gate walks them out to invite.html'), () => ok(false, 'and the site gate walks them out to invite.html'));
    await A.ctx.close(); await B.ctx.close();
  }

  console.log('(f) the admin console');
  F.db.sessions.clear();
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-admin' });
    await page.goto(BASE + 'admin.html');
    await page.waitForSelector('#admin-console .gt-table', { timeout: 10000 });
    ok((await page.textContent('#admin-console')).includes('AMYC-ODE2-3456'), 'codes are listed in their spoken form');
    ok(/Invite requests \(0 waiting\)/.test(await page.textContent('#admin-console')), 'the request queue is drawn even when empty — an absent section reads the same as a passing one');
    ok((await page.$$('#admin-console [data-gate-action="copy-link"]')).length >= 1, 'every active standard code offers COPY LINK');
    await page.selectOption('#gtType', 'standard');
    await page.fill('#gtLabel', 'Link test');
    await page.click('#admin-console form[data-gate-form="create"] button[type="submit"]');
    await page.waitForSelector('.gt-link', { timeout: 8000 });
    const link = await page.textContent('.gt-link');
    ok(new RegExp('^' + BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + 'invite\\.html#code=[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$').test(link), 'a new code is shown as an invite link, code in the fragment: ' + link);
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
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + 'screening.html?pass=PASSCODE2345');
    ok(!(await page.evaluate(() => location.search)), 'the pass is stripped from the address bar');
    await page.evaluate(() => { window.__writes = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (...a) { window.__writes++; return o.apply(this, a); }; });
    await page.fill('#scEmail', 'programmer@festival.example');
    await page.click('button[type="submit"]');
    await page.waitForSelector('.sc-room', { timeout: 8000 });
    const text = await page.textContent('.sc-room');
    ok(text.includes('Dragon') && text.includes('Inciting Incident') && text.includes('RAGAVAN'), 'beat sheet, character map and title are shown');
    ok(!text.includes('SECRET PHONE'), 'contacts never reach a pass holder');
    ok(await page.evaluate(() => !!document.querySelector('canvas[data-wm]') && [...document.querySelectorAll('.sc-block')].every((b) => b.style.backgroundImage.includes('data:image/png'))),
      'a canvas watermark is up and baked into every block');
    ok(F.db.redemptions.some((r) => r.viewer_email === 'programmer@festival.example' && r.access_id), 'the open is logged with the typed e-mail and an access id');
    await page.evaluate(() => document.querySelector('canvas[data-wm]').remove());
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => !!document.querySelector('canvas[data-wm]')), 'a removed watermark is put back');
    for (let i = 0; i < 4; i++) { await page.evaluate(() => { const c = document.querySelector('canvas[data-wm]'); if (c) c.style.display = 'none'; }); await page.waitForTimeout(250); }
    await page.waitForSelector('.sc-enter', { timeout: 5000 }).then(() => ok(true, 'repeated tampering takes the content off the page'), () => ok(false, 'repeated tampering takes the content off the page'));
    ok((await page.evaluate(() => window.__writes)) === 0, 'the screening room wrote nothing to localStorage');
    allErrors.push(...errors); await ctx.close();
  }
} catch (e) {
  fail++; console.log('  ✗ run aborted: ' + e.message);
}

const real = allErrors.filter((e) => !/net::|ERR_|CERT|fetch/i.test(e));
ok(real.length === 0, 'no page errors' + (real.length ? ': ' + real.slice(0, 3).join(' | ') : ''));
await browser.close(); srv.kill();
console.log(`${fail ? '✗' : '✓'} gate proof: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
