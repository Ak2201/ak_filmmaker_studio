/* ============================================================
   PROOF: the invite gate, the one-device lock, the admin console
   and the screening room — every path that is not Supabase itself.
   ------------------------------------------------------------
   Schema section 13 has not run against a database (it says so), so
   nothing here can be proved against the real project yet. What CAN
   be proved is everything on this side of the network: that the
   shipped client asks the right questions, reads the answers right,
   pauses sync rather than touching local work, prompts before a
   takeover, and fails OPEN when the functions do not exist.

   One seam is replaced: HTTP to the project's Supabase origin, served
   by an in-memory fake that implements section 13's semantics (codes,
   hashed tickets, membership, the 90-second lock, screening passes).
   Everything above it — gate.js, cloud.js, gate-ui.js, settings.js,
   screening.js, watermark.js — is the real build in dist/.

   Asserted:
     (a) gate NOT deployed: a signed-in user syncs exactly as before
     (b) deployed, no membership: sync pauses, local work untouched,
         the invite box appears; redeeming a code opens it
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

   Run:  npm run build && node scripts/prove-gate.mjs
   ============================================================ */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const PORT = Number(process.env.PROVE_PORT) || 5357;
const BASE = `http://localhost:${PORT}/`;
const SB = 'https://conhlrulxfwkhsnymakz.supabase.co';
const REF = 'conhlrulxfwkhsnymakz';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* ---- the fake project ---------------------------------------- */
const USERS = {
  'tok-admin': { id: '00000000-0000-4000-8000-00000000000a', email: 'admin@example.com' },
  'tok-amy':   { id: '00000000-0000-4000-8000-0000000000a1', email: 'amy@example.com' },
  'tok-ben':   { id: '00000000-0000-4000-8000-0000000000b1', email: 'ben@example.com' }
};
const sha = (s) => createHash('sha256').update(s).digest('hex');
function freshDb() {
  const now = Date.now();
  return {
    deployed: true,
    codes: [
      { id: 'c1', code: 'AMYCODE23456', pass_type: 'standard', target_project_id: null, max_redemptions: 1, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Amy', created_at: new Date(now).toISOString() },
      { id: 'c2', code: 'BENCODE23456', pass_type: 'standard', target_project_id: null, max_redemptions: 1, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Ben', created_at: new Date(now).toISOString() },
      { id: 'c3', code: 'PASSCODE2345', pass_type: 'screening_pass', target_project_id: 'p1', max_redemptions: 50, redemptions_count: 0, expires_at: new Date(now + 2 * 3600e3).toISOString(), revoked_at: null, label: 'Investor', created_at: new Date(now).toISOString() }
    ],
    tickets: new Map(),
    members: new Map([[USERS['tok-admin'].id, { role: 'admin', disabled_at: null }]]),
    sessions: new Map(),
    redemptions: [],
    projects: [{ id: 'p1', title: 'Dragon', format: 'feature', owner_id: USERS['tok-admin'].id }],
    data: { p1: {
      story: { source: 'A student is turned down for a college seat. He becomes somebody else.', framework: 'three_act',
               marks: [{ id: 'm', start: 0, end: 43, text: 'A student is turned down for a college seat', tags: { three_act: 'inciting' } }], tension: {} },
      feature: { s2_log_final: 'A young man living on a forged degree is recognised.', s4_name: 'RAGAVAN', s4_want: 'Status.' },
      scenes: { scenes: [{ id: 's1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'College', synopsis: 'The rejection.', eighths: 8, elements: {} }] },
      contacts: { contacts: [{ name: 'SECRET PHONE 98400' }] }
    } },
    calls: []
  };
}
let db = freshDb();

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const pgErr = (route, code, message, status = 400) => json(route, status, { code, message, details: null, hint: null });

function rpc(name, args, user, route) {
  db.calls.push(name);
  if (!db.deployed) return pgErr(route, 'PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
  const isMember = (u) => { const m = u && db.members.get(u.id); return !!(m && !m.disabled_at); };
  const valid = (c) => c && !c.revoked_at && (!c.expires_at || Date.parse(c.expires_at) > Date.now()) && c.redemptions_count < c.max_redemptions;
  switch (name) {
    case 'studio_status': {
      const m = user && db.members.get(user.id);
      return json(route, 200, [{ registered: !!m, role: m ? m.role : '', disabled: !!(m && m.disabled_at) }]);
    }
    case 'verify_invite': {
      const c = db.codes.find((x) => x.code === args.p_code);
      if (!valid(c)) return pgErr(route, '22023', 'That code is not valid');
      if (c.pass_type !== 'standard') return pgErr(route, '22023', 'That is a screening pass — open it in the screening room');
      const raw = 'ticket-' + Math.random().toString(36).slice(2);
      db.tickets.set(sha(raw), { code_id: c.id, expires: Date.now() + 600e3, used: false });
      return json(route, 200, [{ ticket: raw, pass_type: 'standard', expires_at: new Date(Date.now() + 600e3).toISOString() }]);
    }
    case 'redeem_invite': {
      if (!user) return pgErr(route, '42501', 'Sign in with Google to redeem a code');
      if (isMember(user)) return json(route, 200, [{ role: db.members.get(user.id).role, invite_code_id: null }]);
      const t = db.tickets.get(sha(args.p_ticket || ''));
      if (!t || t.used || t.expires < Date.now()) return pgErr(route, '22023', 'That sign-in took too long or the code was already used — enter the code again');
      const c = db.codes.find((x) => x.id === t.code_id);
      if (!valid(c)) return pgErr(route, '22023', 'That code is not valid');
      c.redemptions_count++; t.used = true;
      db.members.set(user.id, { role: 'user', disabled_at: null });
      db.redemptions.push({ id: 'r' + db.redemptions.length, code_id: c.id, user_id: user.id, redeemed_at: new Date().toISOString() });
      return json(route, 200, [{ role: 'user', invite_code_id: c.id }]);
    }
    case 'session_acquire': case 'session_takeover': case 'session_ping': case 'session_release': {
      if (!user) return pgErr(route, '42501', 'Not signed in');
      if (name !== 'session_release' && !isMember(user)) return pgErr(route, 'P0401', 'This account has no active invite');
      const cur = db.sessions.get(user.id);
      const fresh = cur && Date.now() - cur.last < 90e3;
      if (name === 'session_release') { if (cur && cur.session_id === args.p_session) db.sessions.delete(user.id); return json(route, 200, [{ status: 'released' }]); }
      if (name === 'session_acquire' && fresh && cur.session_id !== args.p_session) return json(route, 200, [{ status: 'conflict', other_last_seen: new Date(cur.last).toISOString(), other_user_agent: cur.ua }]);
      if (name === 'session_ping' && fresh && cur.session_id !== args.p_session) return json(route, 200, [{ status: 'conflict' }]);
      db.sessions.set(user.id, { session_id: args.p_session, last: Date.now(), ua: args.p_user_agent || (cur && cur.ua) || '' });
      return json(route, 200, [{ status: 'ok', other_last_seen: null, other_user_agent: null }]);
    }
    case 'admin_list_members':
      if (!user || db.members.get(user.id)?.role !== 'admin') return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...db.members.entries()].map(([id, m]) => {
        const u = Object.values(USERS).find((x) => x.id === id); const s = db.sessions.get(id);
        return { user_id: id, email: u ? u.email : id, role: m.role, disabled_at: m.disabled_at, created_at: new Date().toISOString(),
                 last_heartbeat: s ? new Date(s.last).toISOString() : null, client_ip: '203.0.113.9', user_agent: s ? s.ua : null };
      }));
    case 'admin_create_invite': {
      if (!user || db.members.get(user.id)?.role !== 'admin') return pgErr(route, '42501', 'Administrators only');
      const c = { id: 'c' + (db.codes.length + 1), code: 'NEWCODE' + (db.codes.length + 10000), pass_type: args.p_pass_type,
        target_project_id: args.p_target_project, max_redemptions: args.p_max_redemptions, redemptions_count: 0,
        expires_at: args.p_expires_at, revoked_at: null, label: args.p_label, created_at: new Date().toISOString() };
      db.codes.unshift(c);
      return json(route, 200, c);
    }
    case 'admin_revoke_invite': { const c = db.codes.find((x) => x.id === args.p_id); if (c) c.revoked_at = new Date().toISOString(); return json(route, 200, null); }
    case 'admin_terminate_session': {
      db.sessions.delete(args.p_user);
      if (args.p_disable) { const m = db.members.get(args.p_user); if (m) m.disabled_at = new Date().toISOString(); }
      return json(route, 200, null);
    }
    case 'screening_open': {
      const c = db.codes.find((x) => x.code === args.p_code);
      if (!c || c.pass_type !== 'screening_pass' || !valid(c)) return pgErr(route, '22023', 'That screening pass is not valid');
      c.redemptions_count++;
      const aid = Math.random().toString(16).slice(2, 10).toUpperCase();
      db.redemptions.push({ id: 'r' + db.redemptions.length, code_id: c.id, viewer_email: args.p_viewer_email, access_id: aid, redeemed_at: new Date().toISOString() });
      const p = db.projects.find((x) => x.id === c.target_project_id);
      const d = db.data[p.id] || {};
      const scopes = {}; for (const k of ['story', 'feature', 'short', 'scenes']) if (d[k]) scopes[k] = d[k];
      return json(route, 200, [{ project_id: p.id, title: p.title, format: p.format, access_id: aid, expires_at: c.expires_at, scopes }]);
    }
    default:
      return json(route, 200, []);
  }
}

async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
  const user = USERS[auth] || null;
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (m) {
    let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch (e) {}
    return rpc(m[1], args, user, route);
  }
  if (url.pathname.startsWith('/rest/v1/invite_codes')) {
    if (!user || db.members.get(user.id)?.role !== 'admin') return json(route, 200, []);
    return json(route, 200, db.codes);
  }
  if (url.pathname.startsWith('/rest/v1/invite_redemptions')) return json(route, 200, user && db.members.get(user.id)?.role === 'admin' ? db.redemptions : []);
  if (url.pathname.startsWith('/rest/v1/projects')) {
    if (req.method() === 'GET') return json(route, 200, user ? db.projects.filter((p) => p.owner_id === user.id).map(({ id, title, format }) => ({ id, title, format })) : []);
    db.calls.push('write:projects'); return json(route, 201, []);
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    if (req.method() !== 'GET') db.calls.push('write:' + url.pathname.split('/')[3]);
    return json(route, req.method() === 'GET' ? 200 : 201, []);
  }
  if (url.pathname.startsWith('/auth/v1/user')) return user ? json(route, 200, { id: user.id, email: user.email, aud: 'authenticated' }) : json(route, 401, {});
  return json(route, 200, {});
}

function sessionFor(tok) {
  const u = USERS[tok];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return JSON.stringify({ access_token: tok, refresh_token: 'r-' + tok, token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
            app_metadata: { provider: 'google' }, user_metadata: {}, created_at: new Date().toISOString() } });
}

async function newContext(browser, { tok = null, clock = false } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  if (tok) {
    await ctx.addInitScript(([k, v, uid]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, v);
        localStorage.setItem('fms_studio_account_v1', uid);
        sessionStorage.setItem('__seeded', '1');
      }
    }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id]);
  }
  const page = await ctx.newPage();
  if (clock) await page.clock.install();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/websocket|realtime|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const gateState = (page) => page.evaluate(() => window.StudioCloud && window.StudioCloud.getGateState && window.StudioCloud.getGateState().state);
const waitGate = (page, want) => page.waitForFunction((w) => window.StudioCloud && window.StudioCloud.getGateState().state === w, want, { timeout: 8000 }).then(() => true, () => false);

/* ---- run ------------------------------------------------------ */
const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const allErrors = [];

try {
  console.log('(a) gate not deployed');
  db = freshDb(); db.deployed = false;
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'settings.html');
    ok(await waitGate(page, 'open'), 'a signed-in user is OPEN when the functions do not exist');
    ok(!(await page.$('#invite')), 'no invite box is shown');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(b) deployed, signed in, no membership');
  db = freshDb();
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-amy' });
    await page.goto(BASE + 'story.html');
    await page.evaluate(() => {
      const s = { v: 1, source: 'LOCAL WORK THAT MUST SURVIVE', framework: 'three_act', marks: [], tension: {} };
      localStorage.setItem('fms_story_v1', JSON.stringify(s));
    });
    await page.goto(BASE + 'settings.html');
    ok(await waitGate(page, 'closed'), 'the gate CLOSES for a non-member');
    const writesBefore = db.calls.filter((c) => c.startsWith('write:')).length;
    ok((await page.evaluate(() => window.StudioCloud.getSyncStatus().detail)).includes('invite code'), 'the sync status says why it is paused');
    await page.waitForSelector('#invite #gtCode');
    ok(true, 'the invite box appears on settings');
    ok(db.calls.filter((c) => c.startsWith('write:')).length === writesBefore, 'nothing was uploaded while closed');
    await page.fill('#gtCode', 'amy code 2345 6');
    await page.click('#invite button[type="submit"]');
    ok(await waitGate(page, 'open'), 'redeeming the code OPENS the gate');
    ok(db.members.has(USERS['tok-amy'].id) && db.codes[0].redemptions_count === 1, 'the code was spent once, and Amy is a member');
    ok(db.calls.includes('session_acquire'), 'opening acquired the device lock');
    await page.goto(BASE + 'story.html');
    ok((await page.evaluate(() => localStorage.getItem('fms_story_v1') || '')).includes('LOCAL WORK THAT MUST SURVIVE'), 'local work is untouched throughout');
    allErrors.push(...errors); await ctx.close();
  }

  console.log('(c) signed out: code, Google, redeemed on return');
  {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.route(SB + '/**', handle);
    await ctx.route(/accounts\.google\.com|fonts\./, (r) => r.fulfill({ status: 200, body: '' }));
    const page = await ctx.newPage();
    await page.goto(BASE + 'settings.html');
    await page.waitForSelector('#invite #gtCode');
    // Intercept the redirect to Google: record it, stay on the page.
    await page.route(SB + '/auth/v1/authorize**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>google</p>' }));
    await page.fill('#gtCode', 'BENCODE23456');
    await page.click('#invite button[type="submit"]');
    await page.waitForURL(/authorize/, { timeout: 8000 }).catch(() => {});
    await page.goto(BASE + 'settings.html');
    const t = await page.evaluate(() => [sessionStorage.getItem('fms_preauth_ticket'), localStorage.getItem('fms_preauth_ticket')]);
    ok(!!t[0] && !t[1], 'the pre-auth ticket waits in sessionStorage, never localStorage');
    ok(db.codes[1].redemptions_count === 0, 'verifying spent nothing');
    // "Back from Google": a stored session, then a load that starts signed in.
    await page.evaluate(([k, v, uid]) => { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); }, [`sb-${REF}-auth-token`, sessionFor('tok-ben'), USERS['tok-ben'].id]);
    // store.js may schedule its own reload into the account's namespace;
    // either reload is the "load that starts signed in".
    await page.reload().catch(() => {});
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(500);
    ok(await waitGate(page, 'open'), 'the restored load redeemed the ticket and opened the gate');
    ok(db.codes[1].redemptions_count === 1 && db.members.has(USERS['tok-ben'].id), 'Ben is a member and the code is spent');
    ok(!(await page.evaluate(() => sessionStorage.getItem('fms_preauth_ticket'))), 'the ticket is gone once spent');
    await ctx.close();
  }

  console.log('(d) two browsers, one account');
  db.sessions.clear();   // (b) closed its browser without signing out; let that lock lapse
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
    db.members.get(USERS['tok-amy'].id).disabled_at = new Date().toISOString();
    db.sessions.delete(USERS['tok-amy'].id);
    await B.page.evaluate(() => {}); // B keeps beating on the real 30s timer; force one through the clock-less page
    await B.page.waitForFunction(() => window.StudioCloud.getGateState().state === 'closed', null, { timeout: 40000 }).then(() => ok(true, "a revoked member's heartbeat closes the gate"), () => ok(false, "a revoked member's heartbeat closes the gate"));
    await A.ctx.close(); await B.ctx.close();
  }

  console.log('(f) the admin console');
  {
    const { ctx, page, errors } = await newContext(browser, { tok: 'tok-admin' });
    await page.goto(BASE + 'settings.html');
    await page.waitForSelector('#admin-console .gt-table', { timeout: 10000 });
    ok((await page.textContent('#admin-console')).includes('AMYC-ODE2-3456'), 'codes are listed in their spoken form');
    await page.selectOption('#gtType', 'screening_pass');
    await page.selectOption('#gtDur', '2');
    await page.selectOption('#gtProj', 'p1');
    await page.fill('#gtLabel', 'Festival programmer');
    await page.click('#admin-console form[data-gate-form="create"] button[type="submit"]');
    await page.waitForSelector('.gt-made', { timeout: 8000 });
    const made = db.codes[0];
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
    ok(db.redemptions.some((r) => r.viewer_email === 'programmer@festival.example' && r.access_id), 'the open is logged with the typed e-mail and an access id');
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
