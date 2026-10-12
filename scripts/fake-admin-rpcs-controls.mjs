/* ============================================================
   THE CONTROLS TAB AND THE SITE BANNER, in a browser, against a fake
   ------------------------------------------------------------
   A self-checking harness for the Controls tab (src/pages/admin-tabs/
   controls.js), the banner (src/ui/site-banner.js) and the one-line
   plan-gate change. It wraps the shared fake Supabase
   (scripts/fake-supabase.mjs) with the §45 RPCs this lane owns:

     studio_role  admin_list_roles  admin_set_role
     admin_list_feature_overrides  admin_set_feature_override
     effective_features
     site_announcement_now  admin_set_announcement  admin_clear_announcement
     admin_export_user  admin_delete_user

   Usage (an OPEN build, because the pages load signed out otherwise):
     VITE_SITE_GATE=off npx vite build --outDir dist-w2d
     W2D_DIST=dist-w2d W2D_PORT=5335 SHOTS=/some/dir node scripts/fake-admin-rpcs-controls.mjs

   Screenshots (light and dark, 1280 and 390) go to $SHOTS when set.
   Exits 1 on any failed check. Not part of `npm run verify`.
   ============================================================ */
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = process.env.W2D_DIST || 'dist-w2d';
const PORT = Number(process.env.W2D_PORT) || 5335;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = process.env.SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* ---- the fake's state for the §45 half ------------------------- */
const W = {};
function resetW() {
  Object.assign(W, {
    role: 'owner',                    // what studio_role() answers for the signed-in admin
    announcement: null,
    overrides: [],
    effective: undefined,             // undefined -> effective_features() errors (§45 not run); object -> that map
    roleRows: [
      { user_id: USERS['tok-admin'].id, email: USERS['tok-admin'].email, role: 'owner', explicit: false, granted_by: null, at: null },
      { user_id: USERS['tok-amy'].id, email: USERS['tok-amy'].email, role: 'finance', explicit: true, granted_by: USERS['tok-admin'].id, at: new Date(Date.now() - 86400e3).toISOString() }
    ],
    calls: [], bannerFetches: 0, exported: [], deleted: []
  });
}
resetW();
const body = (route, status, data) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data) });
const err = (route, code, message, status = 400) => body(route, status, { code, message, details: null, hint: null });

async function wrapped(route) {
  const req = route.request();
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  const m = new URL(req.url()).pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (!m) return handle(route);
  const name = m[1];
  let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch (e) { /* */ }
  const owner = W.role === 'owner';
  const needOwner = () => (owner ? null : err(route, '42501', `Your role (${W.role}) cannot do this. It needs the owner role.`));
  switch (name) {
    case 'studio_role': W.calls.push(name); return body(route, 200, W.role);
    case 'admin_list_roles': W.calls.push(name); return needOwner() || body(route, 200, W.roleRows);
    case 'admin_set_role': {
      W.calls.push(name + ' ' + args.p_role);
      if (needOwner()) return needOwner();
      const i = W.roleRows.findIndex((r) => r.user_id === args.p_user);
      if (args.p_role == null) {
        const row = W.roleRows[i];
        if (row && row.role === 'owner' && W.roleRows.filter((r) => r.role === 'owner').length < 2) return err(route, '23514', 'There must always be at least one owner. Make somebody else an owner first.');
        if (i >= 0) W.roleRows.splice(i, 1);
      } else if (i >= 0) {
        if (W.roleRows[i].role === 'owner' && args.p_role !== 'owner' && W.roleRows.filter((r) => r.role === 'owner').length < 2) return err(route, '23514', 'There must always be at least one owner. Make somebody else an owner first.');
        Object.assign(W.roleRows[i], { role: args.p_role, explicit: true });
      } else {
        const u = Object.values(USERS).find((x) => x.id === args.p_user);
        W.roleRows.push({ user_id: args.p_user, email: u ? u.email : 'x@example.com', role: args.p_role, explicit: true, granted_by: USERS['tok-admin'].id, at: new Date().toISOString() });
      }
      return body(route, 200, { user_id: args.p_user, role: args.p_role });
    }
    case 'admin_list_feature_overrides': W.calls.push(name); return needOwner() || body(route, 200, { overrides: W.overrides, known_keys: ['ai_assist', 'export_pdf', 'script_import', 'sync'] });
    case 'admin_set_feature_override': {
      W.calls.push(`${name} ${args.p_key}:${args.p_scope}:${args.p_scope_id}:${args.p_enabled}`);
      if (needOwner()) return needOwner();
      W.overrides = W.overrides.filter((o) => !(o.key === args.p_key && o.scope === args.p_scope && o.scope_id === args.p_scope_id));
      if (args.p_enabled !== null) W.overrides.push({ key: args.p_key, scope: args.p_scope, scope_id: args.p_scope_id, enabled: args.p_enabled, set_by: USERS['tok-admin'].id, at: new Date().toISOString() });
      return body(route, 200, { key: args.p_key });
    }
    case 'effective_features': W.calls.push(name); return W.effective === undefined ? err(route, 'PGRST202', 'Could not find the function public.effective_features', 404) : body(route, 200, W.effective);
    case 'site_announcement_now': W.bannerFetches++; if (process.env.DBG) console.log('SAN', req.headers()['referer'], req.headers()['sec-fetch-mode'], (req.headers()['user-agent']||'').slice(0,5), req.headers()['x-client-info']); return body(route, 200, W.announcement);
    case 'admin_set_announcement':
      W.calls.push(name);
      if (needOwner()) return needOwner();
      W.announcement = { id: 'ann-' + Date.now(), text: args.p_text, level: args.p_level, starts_at: args.p_starts_at || new Date(Date.now() - 1000).toISOString(), ends_at: args.p_ends_at || null };
      return body(route, 200, W.announcement.id);
    case 'admin_clear_announcement': W.calls.push(name); if (needOwner()) return needOwner(); W.announcement = null; return body(route, 200, 1);
    case 'admin_export_user': W.calls.push(name); if (needOwner()) return needOwner(); W.exported.push(args.p_user); return body(route, 200, { user: { id: args.p_user }, note: 'Server-side data only.' });
    case 'admin_delete_user':
      W.calls.push(name);
      if (needOwner()) return needOwner();
      if (String(args.p_confirm_email).toLowerCase() !== USERS['tok-ben'].email) return err(route, '22023', 'The e-mail address typed does not match this account. Nothing was deleted.');
      W.deleted.push(args.p_user);
      return body(route, 200, { deleted: true, projects: 0, payments: 0, invoices_retained: 0 });
    default: return handle(route);
  }
}

async function newPage(browser, { tok = 'tok-admin', width = 1280, height = 900, scheme = 'dark', theme = null } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, colorScheme: scheme, acceptDownloads: true });
  await ctx.route(SB + '/**', wrapped);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  if (tok) {
    await ctx.addInitScript(([k, v, uid, th]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, v);
        localStorage.setItem('fms_studio_account_v1', uid);
        if (th) localStorage.setItem('fms_studio_theme_v1', th);
        sessionStorage.setItem('__seeded', '1');
      }
    }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id, theme]);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/websocket|realtime|Failed to load resource|\b4\d\d\b/i.test(m.text())) errors.push(m.text()); });
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); };
const dlg = (page, name) => page.locator('.dlg-overlay').getByRole('button', { name, exact: true }).click();
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

try {
  F.reset(); resetW();

  console.log('(a) no banner: the bar is absent from the DOM, one RPC at most');
  {
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(BASE + 'admin.html#overview'); await settle(page, 2500);
    ok(await page.locator('.sb-bar').count() === 0, 'no .sb-bar in the DOM when no announcement is set');
    ok(W.bannerFetches === 1, `site_announcement_now was called once (${W.bannerFetches})`);
    await page.goto(BASE + 'admin.html#overview'); await settle(page, 2000);
    ok(W.bannerFetches === 1, `a second page in the same session reuses the cache: still ${W.bannerFetches} request`);
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close();
  }

  console.log('(b) Controls: roles, overrides, banner, data tools');
  {
    resetW(); F.reset();
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(BASE + 'admin.html#controls'); await settle(page, 2500);
    const tab = page.locator('#controls');
    ok(await tab.locator('.ctl-card').count() === 4, 'four cards: Roles, Feature overrides, Announcement banner, Data tools');
    ok(await tab.locator('table.ad-table').first().locator('tbody tr').count() === 2, 'the roles table lists both administrators');
    await shot(page, 'controls-dark-1280-top');

    // roles: set a role behind a dialog
    await tab.locator('#ctl-role-who').fill('ben@example.com');
    await tab.locator('select').first().selectOption('support');
    await tab.getByRole('button', { name: 'SET ROLE' }).click();
    ok(await page.locator('.dlg-overlay.show').waitFor({ timeout: 3000 }).then(() => true, () => false), 'setting a role asks first');
    await dlg(page, 'Set role'); await settle(page, 800);
    ok(W.calls.includes('admin_set_role support'), 'admin_set_role called with support');
    ok(await tab.locator('tbody tr', { hasText: 'ben@example.com' }).count() === 1, 'the new support admin is listed');

    // the last owner refusal is shown as a sentence
    await tab.getByRole('button', { name: 'Remove the role of admin@example.com' }).click();
    await dlg(page, 'Remove role'); await settle(page, 800);
    ok(/at least one owner/i.test(await page.locator('.dlg-overlay').first().innerText().catch(() => '')), 'removing the last owner shows the server\'s sentence');
    await dlg(page, 'OK'); await settle(page, 400);

    // overrides
    await tab.locator('form').nth(1).locator('select').nth(2).selectOption('false').catch(() => {});
    await tab.getByRole('button', { name: 'SAVE OVERRIDE' }).click();
    await dlg(page, 'Save override'); await settle(page, 800);
    ok(W.calls.some((c) => /^admin_set_feature_override ai_assist:global::false$/.test(c)), 'a global kill switch saved: ' + W.calls.filter((c) => /override/.test(c)).join(', '));
    ok(await tab.locator('.ad-pill', { hasText: 'switched OFF' }).count() === 1, 'the override is listed with its effect');
    await tab.getByRole('button', { name: /clear/i }).first().click();
    await dlg(page, 'Clear'); await settle(page, 800);
    ok(W.overrides.length === 0, 'clearing deletes the override');

    // banner: preview, set, live, clear
    await tab.locator('#ctl-ann-text').fill('Planned maintenance tonight at 11pm.');
    ok(await tab.locator('.ctl-preview .sb-bar').count() === 1 && /Planned maintenance/.test(await tab.locator('.ctl-preview').innerText()), 'the preview shows the message as it will render');
    await shot(page, 'controls-dark-1280-banner');
    await tab.getByRole('button', { name: 'SET BANNER' }).click();
    await dlg(page, 'Set banner'); await settle(page, 1200);
    ok(W.announcement && W.announcement.text.startsWith('Planned'), 'admin_set_announcement stored it');
    ok(await page.locator('body > .sb-bar').count() === 1, 'the live bar is now above the page');
    ok(await page.locator('body > .sb-bar[role="status"]').count() === 1, 'and it is role=status');
    await shot(page, 'controls-dark-1280-live');

    // data tools
    await tab.locator('#ctl-data-who').fill('ben@example.com');
    const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await tab.getByRole('button', { name: 'EXPORT AS JSON' }).click();
    const d = await dl;
    ok(!!d && /studio-export-ben-example-com/.test(d.suggestedFilename()), 'export downloads a JSON file named for the person: ' + (d && d.suggestedFilename()));
    await tab.getByRole('button', { name: /ERASE THIS PERSON/ }).click(); await settle(page, 400);
    const confirmBtn = page.locator('.dlg-overlay').getByRole('button', { name: 'Erase this person', exact: true });
    ok(await confirmBtn.isDisabled(), 'erase is disabled until the e-mail is typed');
    await page.locator('.dlg-field').fill('ben@example.com');
    await confirmBtn.click(); await settle(page, 800);
    ok(W.deleted.length === 1, 'admin_delete_user called once');
    await dlg(page, 'OK').catch(() => {});
    ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors[0] : ''));
    await ctx.close();
  }

  console.log('(c) the banner on every page, dismissal, expiry');
  {
    resetW(); F.reset();
    W.announcement = { id: 'ann-1', text: 'Heads-up text', level: 'warn', starts_at: new Date(Date.now() - 1000).toISOString(), ends_at: null };
    const { ctx, page, errors } = await newPage(browser);
    await page.goto(BASE + 'settings.html'); await settle(page, 2500);
    ok(await page.locator('.sb-bar').count() === 1, 'the bar draws on another page');
    ok((await page.locator('.sb-text').innerText()) === 'Heads-up text', 'its text is the announcement, verbatim');
    await shot(page, 'banner-dark-1280');
    const wrote = await page.evaluate(() => Object.keys(localStorage).filter((k) => /banner/i.test(k)));
    ok(wrote.length === 0, 'nothing banner-related in localStorage');
    await page.locator('.sb-x').click();
    ok(await page.locator('.sb-bar').count() === 0, 'dismissing removes it');
    await page.goto(BASE + 'admin.html#overview'); await settle(page, 2000);
    ok(await page.locator('.sb-bar').count() === 0, 'and it stays dismissed on the next page');
    await ctx.close();
    // a fresh session sees it again; an expired one does not
    const again = await newPage(browser);
    W.announcement = { ...W.announcement, ends_at: new Date(Date.now() - 5000).toISOString() };
    await again.page.goto(BASE + 'settings.html'); await settle(again.page, 2500);
    ok(await again.page.locator('.sb-bar').count() === 0, 'a banner whose end has passed is not drawn');
    await again.ctx.close();
  }

  console.log('(d) phone and light, with screenshots');
  for (const [scheme, theme] of [['light', 'paper'], ['dark', 'ink']]) {
    resetW(); F.reset();
    W.announcement = { id: 'ann-2', text: 'Scheduled maintenance tonight from 11pm to midnight IST. Saving may be slow.', level: 'info', starts_at: new Date(Date.now() - 1000).toISOString(), ends_at: null };
    const { ctx, page, errors } = await newPage(browser, { width: 390, height: 844, scheme, theme });
    await page.goto(BASE + 'admin.html#controls'); await settle(page, 2800);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `${scheme} 390px: no horizontal page overflow (${over}px)`);
    await shot(page, `controls-${scheme}-390-top`);
    await page.evaluate(() => document.querySelector('.ctl-card:nth-of-type(3)')?.scrollIntoView());
    await shot(page, `controls-${scheme}-390-banner`);
    ok(errors.length === 0, `${scheme}: no console errors` + (errors.length ? ': ' + errors[0] : ''));
    // the live bar on a phone, and its contrast (AA 4.5:1) for both kinds
    for (const level of ['info', 'warn']) {
      W.announcement = { ...W.announcement, level };
      await page.evaluate(() => sessionStorage.clear());
      await page.goto(BASE + 'settings.html'); await settle(page, 2500);
      if (level === 'info') await shot(page, `banner-${scheme}-390`);
      const ratios = await page.evaluate(() => {
        const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
        const bg = getComputedStyle(document.querySelector('.sb-bar')).backgroundColor;
        const rat = (el) => { const a = lum(getComputedStyle(el).color), b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
        return ['.sb-text', '.sb-kind', '.sb-x'].map((q) => rat(document.querySelector(q)));
      });
      ok(ratios.every((r) => r >= 4.5), `${scheme} ${level} banner text meets 4.5:1 (${ratios.map((r) => r.toFixed(1)).join(', ')})`);
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(ov <= 0, `${scheme} ${level} banner at 390px: no overflow`);
    }
    await ctx.close();
  }
  {
    resetW(); F.reset();
    W.announcement = { id: 'ann-3', text: 'Scheduled maintenance tonight from 11pm to midnight IST.', level: 'warn', starts_at: new Date(Date.now() - 1000).toISOString(), ends_at: null };
    const { ctx, page } = await newPage(browser, { scheme: 'light', theme: 'paper' });
    await page.goto(BASE + 'admin.html#controls'); await settle(page, 2800);
    await shot(page, 'controls-light-1280-top');
    await page.evaluate(() => document.querySelector('.ctl-card:nth-of-type(3)')?.scrollIntoView());
    await shot(page, 'controls-light-1280-banner');
    await ctx.close();
  }

  console.log('(e) non-owner roles, plan-gate fail-open');
  {
    resetW(); F.reset(); W.role = 'finance';
    const { ctx, page } = await newPage(browser);
    await page.goto(BASE + 'admin.html#controls'); await settle(page, 2500);
    ok(await page.locator('#controls .ctl-card').count() === 0 && /for owners/i.test(await page.locator('#controls').innerText()), 'a finance admin sees a sentence, not four forms');
    ok(!W.calls.includes('admin_list_roles'), 'and no owner-only RPC was even called');
    await ctx.close();
  }
  {
    resetW(); F.reset();
    const { ctx, page } = await newPage(browser);
    await page.goto(BASE + 'index.html'); await settle(page, 2500);
    const base = await page.evaluate(() => window.StudioCloud && 1);
    ok(W.calls.includes('effective_features'), 'plan-gate asks effective_features');
    ok(base === 1, 'effective_features failing (404) leaves the page working: fail OPEN');
    await ctx.close();
  }
  {
    resetW(); F.reset(); W.effective = { ai_assist: false };
    const { ctx, page } = await newPage(browser);
    await page.goto(BASE + 'index.html'); await settle(page, 2500);
    ok(W.calls.includes('effective_features'), 'plan-gate called effective_features with an override map available');
    await ctx.close();
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(`\n${fail ? '✗' : '✓'} controls harness: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
