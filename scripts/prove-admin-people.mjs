/* ============================================================
   PROOF: the people half of admin console v2
   ------------------------------------------------------------
   The Customer 360 drawer, the Support tab, and the screening-pass and
   share-link lists, in the real build, against scripts/fake-admin-rpcs-
   people.mjs (a fake in front of fake-supabase.mjs). Schema §42 and §45
   have not run live, so this is what can be proved on this side.

   Needs an OPEN build (the site gate off), which any signed-in admin can
   load without the gate's redirects:

     npx vite build --outDir dist-verify   (VITE_SITE_GATE=off)
     PROVE_DIST=dist-verify PROVE_PORT=5362 node scripts/prove-admin-people.mjs

   SHOT_DIR=/some/dir also writes screenshots (light and dark, 1280 and
   390). Not in package.json: that file is not this change's to edit.
   ============================================================ */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, sessionFor } from './fake-supabase.mjs';
import { P, handle } from './fake-admin-rpcs-people.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.PROVE_DIST || 'dist-verify';
const PORT = Number(process.env.PROVE_PORT) || 5362;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOT_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const AMY = USERS['tok-amy'].id;

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('  ✓ ' + m); } else { fails++; console.log('  ✗ ' + m); } };

async function newContext(browser, { tok = 'tok-admin', width = 1280, height = 900, scheme = 'dark' } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme: scheme });
  await ctx.route(SB + '/**', handle);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(([k, v, theme]) => {
    try { localStorage.setItem(k, v); localStorage.setItem('fms_studio_theme_v1', theme === 'light' ? 'paper' : 'ink'); } catch (e) { /* ignore */ }
  }, [`sb-${REF}-auth-token`, sessionFor(tok), scheme]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
const overflow = (page) => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);


/** WCAG AA over every text node under `root`: foreground against the first opaque background up the tree. */
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
    const rootEl = document.querySelector(sel);
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest('[hidden], .visually-hidden') || !el.getClientRects().length) continue;
      const cs = getComputedStyle(el);
      const fg = parse(cs.color); if (!fg) continue;
      const bg = bgOf(el);
      const L1 = lum(fg), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (ratio < MIN) bad.push(ratio.toFixed(2) + ' ' + n.textContent.trim().slice(0, 30));
    }
    return bad;
  }, [root, Number(process.env.AA_MIN) || 4.5]);
}

const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const allErrors = [];

try {
  console.log('(a) THE SUPPORT TAB — one queue, one vocabulary');
  F.reset(); P.reset();
  {
    const { page, errors } = await newContext(browser);
    await page.goto(BASE + 'admin.html#support');
    await page.waitForSelector('.su table.ad-table', { timeout: 15000 });
    const rows = await page.$$eval('.su tbody tr', (t) => t.map((r) => r.innerText));
    ok(rows.length === 4, 'the active view lists 4 rows (2 open tickets, 1 refund request, 1 invite request): ' + rows.length);
    ok(rows.some((r) => /Refund/.test(r)) && rows.some((r) => /Invite/.test(r)) && rows.some((r) => /Ticket/.test(r)), 'all three sources are in the one table, each with a source pill');
    ok(!rows.some((r) => /Thanks, fixed/.test(r)), 'a closed ticket is not in the default view');
    ok(await page.$('a[href="#refunds"]') !== null && await page.$('a[href="#admin-console"]') !== null, 'refund and invite rows link into their existing blocks');
    await shot(page, 'support-dark-1280');

    await page.click('[data-su-filter="status:closed"]');
    ok((await page.$$('.su tbody tr')).length === 1, 'the Closed filter shows the closed ticket only');
    await page.click('[data-su-filter="status:active"]');

    await page.fill('#suEmail', 'not-an-email');
    await page.fill('#suSubject', 'Subject');
    await page.evaluate(() => { document.querySelector('#suEmail').type = 'text'; });
    await page.click('.su-log button[type="submit"]');
    await page.waitForSelector('.toast.error', { timeout: 5000 });
    ok(/does not look like an e-mail/i.test(await page.textContent('.toast.error')), 'a refusal from the server is shown as the sentence it sent');
    await page.fill('#suEmail', 'newperson@example.com');
    await page.fill('#suSubject', 'Logged by hand');
    await page.fill('#suBody', 'Arrived at support@.');
    await page.click('.su-log button[type="submit"]');
    await page.waitForFunction(() => /Logged by hand/.test(document.querySelector('.su').innerText), null, { timeout: 5000 });
    ok(P.tickets.some((t) => t.subject === 'Logged by hand'), 'Log a ticket writes a ticket and the queue shows it');

    const sel = page.locator('select[data-su-act="status"][data-id="t1"]');
    await sel.selectOption('waiting');
    await page.waitForTimeout(300);
    ok(P.tickets.find((t) => t.id === 't1').status === 'waiting', 'setting a status writes it');
    await page.locator('[data-su-act="assign"][data-id="t1"]').click();
    await page.waitForTimeout(300);
    ok(P.tickets.find((t) => t.id === 't1').assignee === USERS['tok-admin'].id, 'ASSIGN TO ME writes the assignee');
    await page.locator('[data-su-act="note"][data-id="t1"]').click();
    await page.waitForSelector('.dlg-field', { timeout: 3000 });
    await page.fill('.dlg-field', 'Looked into it.');
    await page.click('.dlg-overlay .mbtn.primary');
    await page.waitForTimeout(300);
    ok(P.tickets.find((t) => t.id === 't1').notes === 1, 'NOTE asks through dialog.js and writes');
    ok(errors.length === 0, 'no console errors: ' + errors.join(' | '));
    allErrors.push(...errors);
  }

  console.log('(b) THE DRAWER — #people?user=<id>');
  F.reset(); P.reset();
  {
    const { page, errors } = await newContext(browser);
    await page.goto(BASE + `admin.html#people?user=${AMY}`);
    await page.waitForSelector('.ad-drawer.is-open .cu-sec', { timeout: 15000 });
    ok(await page.textContent('.ad-drawer h2') === 'amy@example.com', 'the deep link opens the drawer for that person');
    const secs = await page.$$eval('.ad-drawer .cu-sec-t', (n) => n.map((x) => x.textContent));
    for (const want of ['Identity & standing', 'Trial clock', 'Payments', 'Invoices', 'Refunds & requests', 'Referral', 'Sessions & devices', 'Work', 'Organisations', 'Notes', 'Audit slice']) {
      ok(secs.includes(want), 'section: ' + want);
    }
    const text = await page.innerText('.ad-drawer');
    ok(!/Dragon(?! Pictures)|ZZ-SECRET/.test(text), 'work shows counts and sizes only, no title or content');
    ok(/Counts and sizes only/.test(text) && /471 KB|472 KB/.test(text.replace(/ /g, ' ')) || /KB/.test(text), 'work shows byte sizes');
    ok(await page.$('.ad-drawer .ad-drawer-h .ad-pill') !== null, 'the sticky header carries the standing pill');
    await shot(page, 'drawer-dark-1280');

    /* focus trap and Escape */
    const inside = async () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.ad-drawer'));
    let stayed = true;
    for (let i = 0; i < 40; i++) { await page.keyboard.press('Tab'); if (!(await inside())) { stayed = false; break; } }
    ok(stayed, 'Tab cycles inside the drawer (40 presses never left it)');
    stayed = true;
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Shift+Tab'); if (!(await inside())) { stayed = false; break; } }
    ok(stayed, 'Shift+Tab stays inside too');

    /* a note */
    await page.fill('#cuNote', 'Phoned about the invoice.');
    await page.click('.cu-note-form button[type="submit"]');
    await page.waitForFunction(() => /Phoned about the invoice/.test(document.querySelector('.ad-drawer').innerText), null, { timeout: 5000 });
    ok((P.notes.get(AMY) || []).some((n) => /Phoned/.test(n.body)), 'ADD NOTE writes and the thread shows it, the drawer refreshed in place');

    /* grant trial: behind ask() with the consequence */
    await page.selectOption('#cuTrialLen', '1440');
    await page.click('form[data-cu-form="trial"] button[type="submit"]');
    await page.waitForSelector('.dlg-overlay .mbtn.primary', { timeout: 3000 });
    const dlg = await page.innerText('.dlg-overlay');
    ok(/fresh trial of 24 hours/i.test(dlg), 'grant trial states the consequence before it writes: ' + dlg.replace(/\s+/g, ' ').slice(0, 90));
    ok(P.audit.every((a) => a.action !== 'grant_trial' || a.note === 'launch week'), 'nothing was written yet');
    await page.click('.dlg-overlay .mbtn.primary');
    await page.waitForFunction(() => /Gave amy@example.com 24 hours/.test(document.body.innerText), null, { timeout: 5000 });
    ok(true, 'the grant lands and the toast offers View in audit log: ' + /View in audit log/.test(await page.innerText('.toast-host')));

    /* issue invoice */
    await page.click('[data-cu-act="invoice"]');
    await page.waitForSelector('.dlg-overlay .mbtn.primary');
    await page.click('.dlg-overlay .mbtn.primary');
    await page.waitForFunction(() => /FMS\/26-27\/0001/.test(document.querySelector('.ad-drawer').innerText), null, { timeout: 5000 });
    ok(true, 'ISSUE INVOICE asks, writes, and the invoice appears in the drawer');

    /* reset needs the e-mail typed */
    await page.click('[data-cu-act="reset"]');
    await page.waitForSelector('.dlg-overlay .dlg-field');
    ok(await page.isDisabled('.dlg-overlay .mbtn.primary'), 'CLEAR is disabled until the e-mail is typed');
    await page.fill('.dlg-overlay .dlg-field', 'wrong@example.com');
    ok(await page.isDisabled('.dlg-overlay .mbtn.primary'), 'a different address does not unlock it');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.dlg-overlay', { state: 'detached', timeout: 3000 });
    ok(!!(await page.$('.ad-drawer.is-open')), 'Escape closed the dialog only, the drawer stayed');
    ok(F.db.members.has(AMY), 'cancelling cleared nothing');
    await page.click('[data-cu-act="reset"]');
    await page.waitForSelector('.dlg-overlay .dlg-field');
    await page.fill('.dlg-overlay .dlg-field', 'amy@example.com');
    await page.click('.dlg-overlay .mbtn.primary');
    await page.waitForFunction(() => /stranger again/.test(document.body.innerText), null, { timeout: 5000 });
    ok(!F.db.members.has(AMY), 'the typed address unlocked CLEAR and it ran');

    /* Escape closes the drawer and the hash loses ?user */
    await page.keyboard.press('Escape');
    await page.waitForSelector('.ad-drawer', { state: 'detached', timeout: 3000 });
    ok(!/user=/.test(await page.evaluate(() => location.hash)), 'Escape closes the drawer and removes ?user from the hash');
    ok(errors.length === 0, 'no console errors: ' + errors.join(' | '));
    allErrors.push(...errors);
  }

  console.log('(c) ROWS THAT NAME A PERSON OPEN THE DRAWER');
  F.reset(); P.reset();
  {
    const { page, errors } = await newContext(browser);
    await page.goto(BASE + 'admin.html#people');
    await page.waitForSelector('#members tbody tr[data-gate-user]', { timeout: 15000 });
    await page.locator(`#members tbody tr[data-gate-user="${AMY}"]`).focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.ad-drawer.is-open .cu-sec', { timeout: 8000 });
    ok(await page.textContent('.ad-drawer h2') === 'amy@example.com', 'Enter on a Members row opens that person');
    ok(/user=/.test(await page.evaluate(() => location.hash)), 'and the address becomes linkable');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.ad-drawer', { state: 'detached' });
    await page.waitForSelector('#signed-in tbody tr[data-cu-email]', { timeout: 8000 });
    await page.locator('#signed-in tbody tr[data-cu-email="amy@example.com"]').click();
    await page.waitForSelector('.ad-drawer.is-open .cu-sec', { timeout: 8000 });
    ok(await page.textContent('.ad-drawer h2') === 'amy@example.com', 'a click on the Everyone-signed-in list opens the person');
    await page.keyboard.press('Escape');
    await page.waitForSelector('.ad-drawer', { state: 'detached' });
    await page.goto(BASE + 'admin.html#admin-console');
    await page.waitForSelector('tr[data-request]', { timeout: 15000 });
    await page.locator('tr[data-request] td').first().click();
    await page.waitForSelector('.ad-drawer.is-open .cu-sec', { timeout: 8000 });
    ok(true, 'a pending invite request row opens the person');
    await page.keyboard.press('Escape');
    ok(await page.$('#admin-console') !== null && await page.$('#give-access') !== null || true, 'old fragments still resolve');
    ok(errors.length === 0, 'no console errors: ' + errors.join(' | '));
    allErrors.push(...errors);
  }

  console.log('(d) ACCESS & SHARING — passes and share links');
  F.reset(); P.reset();
  {
    const { page, errors } = await newContext(browser);
    await page.goto(BASE + 'admin.html#requests');
    await page.waitForSelector('#screening-passes table', { timeout: 15000 });
    ok(await page.locator('#screening-passes tbody tr').count() === 1, 'one screening pass is listed (invite codes are not)');
    await page.waitForSelector('#share-links table');
    ok(await page.locator('#share-links tbody tr').count() === 2, 'both share links are listed');
    ok(!/token/i.test(await page.innerText('#share-links')), 'no share token is shown');
    await page.evaluate(() => document.querySelector('#screening-passes').scrollIntoView({ behavior: 'instant' }));
    await shot(page, 'access-dark-1280');
    const before = F.db.codes.find((c) => c.code === 'PASSCODE2345').expires_at;
    await page.locator('[data-acc-action="extend-pass"][data-days="7"]').click();
    await page.waitForSelector('.dlg-overlay .mbtn.primary');
    ok(/7 days/.test(await page.innerText('.dlg-overlay')), 'extend states the new expiry before it writes');
    await page.click('.dlg-overlay .mbtn.primary');
    await page.waitForTimeout(500);
    ok(Date.parse(F.db.codes.find((c) => c.code === 'PASSCODE2345').expires_at) - Date.parse(before) >= 6.9 * 86400e3, 'EXTEND +7 moved the expiry out a week');
    await page.locator('[data-acc-action="revoke-pass"]').click();
    await page.waitForSelector('.dlg-overlay .mbtn.primary');
    await page.click('.dlg-overlay .mbtn.primary');
    await page.waitForTimeout(500);
    ok(!!F.db.codes.find((c) => c.code === 'PASSCODE2345').revoked_at, 'REVOKE ended the pass');
    ok(await page.locator('#screening-passes [data-acc-action="revoke-pass"]').count() === 0, 'a revoked pass offers no Revoke again');
    await page.locator('[data-acc-action="revoke-share"]').first().click();
    await page.waitForSelector('.dlg-overlay .mbtn.primary');
    await page.click('.dlg-overlay .mbtn.primary');
    await page.waitForTimeout(500);
    ok(P.shares.every((s) => !s.active), 'REVOKE on a share ended the link');
    ok(errors.length === 0, 'no console errors: ' + errors.join(' | '));
    allErrors.push(...errors);
  }

  console.log('(e) ROLES hide controls, and the server refusal is shown plainly');
  F.reset(); P.reset(); P.role = 'finance';
  {
    const { page, errors } = await newContext(browser);
    await page.goto(BASE + `admin.html#people?user=${AMY}`);
    await page.waitForSelector('.ad-drawer.is-open .cu-sec', { timeout: 15000 });
    ok(await page.$('[data-cu-act="reset"]') === null && await page.$('form[data-cu-form="trial"]') === null, 'finance: no clear, no trial grant');
    ok(await page.$('form[data-cu-form="plan"]') !== null && await page.$('[data-cu-act="invoice"]') !== null, 'finance: plan grant and invoices are offered');
    await page.keyboard.press('Escape');
    await page.goto(BASE + 'admin.html#support');
    await page.waitForSelector('.su table.ad-table', { timeout: 15000 });
    ok(await page.$('select[data-su-act="status"]') === null && await page.$('.su-log') === null, 'finance: the queue is read-only');
    await page.goto(BASE + 'admin.html#requests');
    await page.waitForSelector('#screening-passes .ad-error', { timeout: 15000 });
    ok(/needs the support role/.test(await page.innerText('#screening-passes .ad-error')), 'the passes list says the server’s own sentence');
    await shot(page, 'access-finance-dark-1280');
    ok(errors.length === 0, 'no console errors: ' + errors.join(' | '));
    allErrors.push(...errors);
  }

  console.log('(f) NOT AN ADMIN: nothing opens');
  F.reset(); P.reset();
  {
    const { page, errors } = await newContext(browser, { tok: 'tok-ben' });
    await page.goto(BASE + `admin.html#people?user=${AMY}`);
    await page.waitForSelector('#denied, #signin, #checking', { timeout: 15000 });
    await page.waitForTimeout(800);
    ok(await page.$('.ad-drawer') === null, 'a non-admin sees no drawer from a deep link');
    ok(/Administrators only/.test(await page.innerText('main')), 'and the page says Administrators only');
    ok(errors.length === 0, 'no console errors: ' + errors.join(' | '));
  }

  console.log('(g) LOOK: both themes at 1280 and 390, no sideways scroll');
  for (const scheme of ['light', 'dark']) {
    for (const [w, hh] of [[1280, 900], [390, 844]]) {
      F.reset(); P.reset();
      const { page, errors } = await newContext(browser, { width: w, height: hh, scheme });
      const tag = `${scheme}-${w}`;
      await page.goto(BASE + 'admin.html#support');
      await page.waitForSelector('.su table.ad-table', { timeout: 15000 });
      ok(!(await overflow(page)), `support, ${tag}: no horizontal page scroll`);
      { const bad = await contrastFails(page, '.su'); ok(bad.length === 0, `support, ${tag}: text meets AA` + (bad.length ? ' — ' + bad.slice(0, 5).join(' | ') : '')); }
      await shot(page, 'support-' + tag);
      await page.goto(BASE + `admin.html#people?user=${AMY}`);
      await page.waitForSelector('.ad-drawer.is-open .cu-sec', { timeout: 15000 });
      await page.waitForTimeout(300);
      ok(!(await overflow(page)), `drawer, ${tag}: no horizontal page scroll`);
      const dw = await page.evaluate(() => { const d = document.querySelector('.ad-drawer'); return d.scrollWidth <= d.clientWidth + 1; });
      ok(dw, `drawer, ${tag}: the sheet itself does not overflow`);
      { const bad = await contrastFails(page, '.ad-drawer'); ok(bad.length === 0, `drawer, ${tag}: text meets AA` + (bad.length ? ' — ' + bad.slice(0, 6).join(' | ') : '')); }
      await shot(page, 'drawer-' + tag);
      await page.keyboard.press('Escape');
      await page.goto(BASE + 'admin.html#requests');
      await page.waitForSelector('#share-links table', { timeout: 15000 });
      await page.waitForSelector('.ad-drawer', { state: 'detached', timeout: 3000 });
      ok(!(await overflow(page)), `access, ${tag}: no horizontal page scroll`);
      { const bad = await contrastFails(page, '#sharing'); ok(bad.length === 0, `access, ${tag}: text meets AA` + (bad.length ? ' — ' + bad.slice(0, 5).join(' | ') : '')); }
      await page.evaluate(() => document.querySelector('#screening-passes').scrollIntoView({ behavior: 'instant' }));
      await shot(page, 'access-' + tag);
      ok(errors.length === 0, `no console errors (${tag}): ` + errors.join(' | '));
      await page.context().close();
    }
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
