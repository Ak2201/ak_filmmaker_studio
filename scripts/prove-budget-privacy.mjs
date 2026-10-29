/* ============================================================
   PROOF: "Keep the budget private" on budget.html (schema §55;
   src/ui/budget-privacy-ui.js over src/lib/budget-privacy.js).
   ------------------------------------------------------------
   WHAT THIS CANNOT PROVE: that the live database refuses a viewer
   the two budget scopes. That is RLS, proved on PostgreSQL by
   test:schema (§55, 37 checks); the sync engine's half (no push, no
   queue, the local copy untouched, PGRST202 = not private) is
   test:cloud. Here window.StudioCloud is wrapped as cloud.js assigns
   it, so the page meets a signed-in session and a budgetPrivacy()
   answering what the case asks for (?bp=…).

   Asserted:
     1  signed out: no switch, no private state, the budget as before
     2  §55 not run (unknown): no switch, no private state, no errors
     3  the owner: the switch, labelled, unchecked, with its sentence;
        turning it on calls set_budget_private(pid, true), says so, and
        stays on; a refused toggle says so and puts the box back
     4  a view collaborator on a private film: "The owner keeps this
        budget private." on the estimate and every cost tab, no ₹ strip,
        the head's CSV / new-line actions hidden, and the local estimate
        and costs on the device byte-identical afterwards
     5  an editor on a private film: the budget as normal, no switch
     6  no horizontal overflow at 390px; no page errors

       npm run build:open && npm run prove:budget-privacy
       (PROVE_DIST=dist-verify after build:verify)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5377;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let failed = 0;
function ok(cond, label, extra) {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond && extra !== undefined) console.log('        ' + JSON.stringify(extra));
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  const STATES = {
    owner:  { known: true, private: false, visible: true, canChange: true, missing: false },
    viewer: { known: true, private: true, visible: false, canChange: false, missing: false },
    editor: { known: true, private: true, visible: true, canChange: false, missing: false },
    absent: { known: false, private: false, visible: true, canChange: false, missing: true }
  };
  window.__bp = { set: [] };
  let real;
  Object.defineProperty(window, 'StudioCloud', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      const q = new URLSearchParams(location.search);
      const kind = q.get('bp');
      if (!kind) return;
      let state = Object.assign({}, STATES[kind.replace(/-fail$/, '')]);
      v.isBooted = () => true;
      v.getSession = () => ({ access_token: 'x', user: { id: 'me-1', email: 'pia@example.com' } });
      v.budgetPrivacy = async () => state;
      v.setBudgetPrivate = async (pid, on) => {
        window.__bp.set.push([pid, on]);
        await new Promise((r) => setTimeout(r, 50));
        if (/-fail$/.test(kind)) return { ok: false, state, error: '42501' };
        state = Object.assign({}, state, { private: !!on });
        return { ok: true, state, error: null };
      };
    }
  });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload|websocket|realtime/i.test(m.text())) errors.push('console: ' + m.text()); });
const url = (p) => `http://localhost:${PORT}/${p}`;

await page.goto(url('index.html'), { waitUntil: 'networkidle' });
const pid = await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Proof Budget', format: 'feature' });
  S.setCurrentProject(p.id);
  localStorage.setItem('fms_library_calc_v1', JSON.stringify({ calc_item_1: 'Camera package', calc_days_1: '3', calc_rate_1: '25000' }));
  localStorage.setItem('fms_costs_v1', JSON.stringify({ expenses: [{ id: 'x1', date: '2026-10-20', amount: 1500, category: 'food', method: 'cash' }] }));
  return p.id;
});
const local = () => page.evaluate((id) => [localStorage.getItem('fms_library_calc_v1'), window.StudioStore.rawGet('fms_costs_v1__' + id)], pid);
const before = await local();

async function open(q) {
  await page.goto(url('budget.html' + q), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}
const look = () => page.evaluate(() => ({
  sw: !!document.getElementById('budPrivacy'),
  locked: !!document.getElementById('budLockedEst'),
  gridHidden: !!(document.querySelector('#estimate .bud-est-grid') || {}).hidden,
  kpisHidden: !!(document.getElementById('bdKpis') || {}).hidden,
  kpiCards: document.querySelectorAll('#bdKpis .bd-kpi').length
}));

/* 1 signed out */
await open('');
let s = await look();
ok(!s.sw && !s.locked && !s.gridHidden && s.kpiCards > 0, '1  signed out: no switch, no private state, the budget as before', s);

/* 2 §55 not run */
await open('?bp=absent');
s = await look();
ok(!s.sw && !s.locked && !s.gridHidden && s.kpiCards > 0, '2  §55 absent: no switch, no private state', s);

/* 3 the owner */
await open('?bp=owner');
s = await look();
ok(s.sw && !s.locked, '3  the owner sees the switch', s);
const sw = await page.evaluate(() => {
  const box = document.querySelector('#budPrivacy input[type="checkbox"]');
  const lab = box && box.closest('label');
  return box && { checked: box.checked, role: box.getAttribute('role'), label: lab ? lab.textContent.trim() : '',
    hint: (document.getElementById(box.getAttribute('aria-describedby')) || {}).textContent || '',
    afterWho: !!document.querySelector('.bud-who + #budPrivacy') };
});
ok(sw && !sw.checked && sw.role === 'switch' && sw.label === 'Keep the budget private' && sw.afterWho, '3  labelled "Keep the budget private", a switch, off, under the who-sees-it line', sw);
ok(sw && /Only you and people with an edit link can see or change the budget\. People who already opened it may still have a copy on their device\./.test(sw.hint), '3  with its sentence, tied by aria-describedby', sw && sw.hint);
await page.click('.bud-who button');
await page.waitForSelector('[data-explainer]');
ok(await page.$eval('[data-explainer]', (n) => /unless you keep the budget private/.test(n.textContent)), '3  the who-sees-it pop-up mentions keeping it private');
await page.keyboard.press('Escape');
await page.waitForSelector('[data-explainer]', { state: 'detached' });
await page.click('#budPrivacy label');
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({ set: window.__bp.set, checked: (document.querySelector('#budPrivacy input') || {}).checked,
  toast: [...document.querySelectorAll('.toast, .k-toast, [role="status"], [role="alert"]')].map((t) => t.textContent).join(' | ') }));
ok(after.set.length === 1 && after.set[0][0] === pid && after.set[0][1] === true, '3  turning it on calls set_budget_private(pid, true)', after.set);
ok(after.checked === true, '3  and it stays on, as the server read back', after);
ok(/budget is private/i.test(after.toast), '3  a toast says the budget is private', after.toast);
/* The keyboard path: the switch is patched in place, so the box a
   keyboard user pressed is still the focused, attached element. */
await page.evaluate(() => { const b = document.querySelector('#budPrivacy input'); window.__bpBox = b; b.focus(); });
await page.keyboard.press('Space');
await page.waitForTimeout(400);
const kb = await page.evaluate(() => ({ same: document.querySelector('#budPrivacy input') === window.__bpBox,
  focused: document.activeElement === window.__bpBox, checked: window.__bpBox.checked, disabled: window.__bpBox.disabled }));
ok(kb.same && kb.focused && kb.checked === false && !kb.disabled, '3  toggled from the keyboard, the same box keeps focus (patched in place)', kb);
await open('?bp=owner-fail');
await page.click('#budPrivacy label');
await page.waitForTimeout(400);
const failAfter = await page.evaluate(() => ({ checked: (document.querySelector('#budPrivacy input') || {}).checked,
  disabled: (document.querySelector('#budPrivacy input') || {}).disabled,
  toast: [...document.querySelectorAll('.toast, .k-toast, [role="status"], [role="alert"]')].map((t) => t.textContent).join(' | ') }));
ok(failAfter.checked === false && !failAfter.disabled, '3  a refused toggle puts the box back', failAfter);
ok(/Nothing changed/.test(failAfter.toast), '3  and says nothing changed', failAfter.toast);

/* 4 a viewer on a private film */
await open('?bp=viewer');
s = await look();
ok(!s.sw && s.locked && s.gridHidden, '4  viewer: the estimate is replaced by the private state', s);
ok(s.kpisHidden && s.kpiCards === 0, '4  no figures in the strip', s);
const est = await page.$eval('#budLockedEst', (n) => n.textContent);
ok(/The owner keeps this budget private\./.test(est), '4  it says "The owner keeps this budget private."', est);
const tabs = await page.evaluate(() => ['expenses', 'actuals', 'crew', 'topsheet', 'export'].map((id) => {
  const sec = document.getElementById(id);
  return [id, !!(sec && sec.querySelector('.bud-locked')) && sec.children.length === 1];
}));
ok(tabs.every(([, v]) => v), '4  every cost tab shows only the private state', tabs);
await page.goto(url('budget.html?bp=viewer#actuals'), { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
ok(await page.$eval('#actuals', (n) => !n.hidden && /The owner keeps this budget private\./.test(n.textContent)), '4  the cost report tab, opened by hash, says so');
const heads = await page.evaluate(() => [...document.querySelectorAll('.bd-head [data-cx="csv-budget"], .bd-head [data-action="add-row"]')].map((b) => b.hidden));
ok(heads.length >= 2 && heads.every(Boolean), '4  the head\'s Export CSV and New cost line are hidden', heads);
const kept = await local();
ok(JSON.stringify(kept) === JSON.stringify(before), '4  the estimate and costs on this device are byte-identical', { before, kept });

/* 5 an editor */
await open('?bp=editor');
s = await look();
ok(!s.sw && !s.locked && !s.gridHidden && s.kpiCards > 0, '5  an editor on a private film: the budget as normal, no switch', s);

/* 6 phone width */
await page.setViewportSize({ width: 390, height: 844 });
for (const q of ['?bp=owner', '?bp=viewer']) {
  await open(q);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(over <= 0, '6  no horizontal overflow at 390px (' + q + ')', over);
}
ok(errors.length === 0, '6  no page errors', errors);

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
