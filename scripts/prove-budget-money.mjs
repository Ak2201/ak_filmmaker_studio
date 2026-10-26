/* ============================================================
   PROOF: the budget's money copy and layout (QA round 1, "Budget &
   money"). Each assertion failed before its fix.
   ------------------------------------------------------------
     1  a row's 'days × rate' line keeps a fractional day (2.5 d, not 3)
     2  the wage table's inputs are named by their column headers, never
        by a field key ('callHours for …')
     3  one spelling of the allowance on the page: 'batta', never 'bata'
     4  a dollar budget's Petty cash intro does not say 'Every rupee';
        a rupee budget's still does
     5  at 390px the top sheet's Estimate column is inside its scroller
        (row headers wrap; the kit's nowrap pushed every figure off)
     6  the dashboard calls the live estimate 'Budget estimate', not
        'Locked budget' (nothing is locked)
     7  no page errors

       npm run build:open && npm run prove:budget-money
       (PROVE_DIST=dist-verify after build:verify)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5378;
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
const errors = [];
const url = (p) => `http://localhost:${PORT}/${p}`;

async function film(ctx, region, calc) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(([region, calc]) => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject(Object.assign({ title: 'Money Proof', format: 'feature' }, region ? { region } : {}));
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_library_calc_v1', JSON.stringify(calc));
  }, [region, calc]);
  return page;
}
async function open(page, p) {
  await page.goto(url(p), { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

/* ---- a rupee film at 390 ---- */
const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
let page = await film(phone, null, { ci_1_item: 'Other (custom)', ci_1_custom: 'Camera package', ci_1_days: '2.5', ci_1_rate: '25000' });

await open(page, 'budget.html#estimate');
const row = await page.evaluate(() => {
  const r = document.querySelector('#ci_1_days').closest('.calc-row');
  return { sub: r.querySelector('.total-cell').textContent, eq: r.querySelector('[data-role="calc-eq"]').textContent };
});
ok(row.sub === '₹ 62,500' && row.eq === '2.5 d × ₹ 25,000', '1  2.5 days × ₹ 25,000 reads 2.5 d beside ₹ 62,500', row);

await open(page, 'budget.html#wages');
const wages = await page.evaluate(() => ({
  labels: [...document.querySelectorAll('#wages input[data-k]')].slice(0, 3).map((i) => i.getAttribute('aria-label')),
  heads: [...document.querySelectorAll('#wages thead th')].map((t) => t.textContent)
}));
ok(wages.labels.length === 3 && wages.labels.every((l, i) => l.startsWith(wages.heads[i + 2] + ' for ')),
  '2  each wage input is named by its column header', wages);

const bata = await page.evaluate(() => {
  const out = [];
  for (const id of ['wages', 'expenses', 'topsheet', 'actuals']) {
    const sec = document.getElementById(id);
    if (sec) out.push(sec.textContent + ' ' + [...sec.querySelectorAll('[placeholder],[aria-label]')].map((e) => (e.getAttribute('placeholder') || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' '));
  }
  const t = out.join(' ');
  return { bata: (t.match(/\bbata\b/gi) || []).length, batta: (t.match(/\bbatta\b/gi) || []).length };
});
ok(bata.bata === 0 && bata.batta > 0, '3  the allowance is spelled one way (batta)', bata);

await open(page, 'budget.html#expenses');
const inrIntro = await page.evaluate(() => document.getElementById('expenses').textContent);
ok(/Every rupee that leaves a pocket/.test(inrIntro), '4a a rupee budget\'s Petty cash still says "Every rupee"');

await open(page, 'budget.html#topsheet');
const ts = await page.evaluate(() => {
  const t = document.querySelector('table.cx-top');
  const wrap = t && t.closest('.k-table-wrap, .cx-scroll');
  return t && wrap && { client: wrap.clientWidth, scroll: wrap.scrollWidth, ws: getComputedStyle(t.querySelector('tbody th[scope="row"]')).whiteSpace };
});
ok(ts && ts.scroll <= ts.client + 1 && ts.ws === 'normal', '5  at 390px the top sheet fits its scroller (row headers wrap)', ts);

await open(page, 'budget.html#wages');
const wcol = await page.evaluate(() => { const th = document.querySelector('.cx-wages tbody th'); return th && th.getBoundingClientRect().width; });
ok(wcol && wcol < 200, '13 at 390px the wage table\'s Craft column leaves room for the other columns', wcol);

await open(page, 'dashboard.html');
const stat = await page.evaluate(() => (document.querySelector('.db-stats') || {}).textContent || '');
ok(/Budget estimate/i.test(stat) && !/Locked budget/i.test(stat), '6  the dashboard calls the live estimate "Budget estimate"', stat.slice(0, 300));
await phone.close();

/* ---- QA round 2 ---- */
const r2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
page = await film(r2, null, { ci_1_item: 'Other (custom)', ci_1_custom: 'Camera', ci_1_days: '10', ci_1_rate: '4500' });
await open(page, 'budget.html#estimate');
const kpi = () => page.evaluate(() => (document.getElementById('bdKpis') || {}).textContent || '');
ok(/45k/.test(await kpi()), '8a the header shows the priced estimate first');
await page.click('[data-action="reset"]');
await page.click('.dlg .modal-actions .k-btn--danger');
await page.waitForTimeout(250);
const afterReset = await page.evaluate(() => ({ kpi: document.getElementById('bdKpis').textContent, petty: (document.getElementById('bdPetty') || {}).textContent || '' }));
ok(!/45k/.test(afterReset.kpi) && /Nothing priced yet/.test(afterReset.kpi), '8  Reset refreshes the header figures at once (and an empty budget claims nothing)', afterReset.kpi);

// 9  a negative figure is flagged and counts as nothing
await page.fill('#calcRows [data-key$="_days"]', '2');
await page.fill('#calcRows [data-key$="_rate"]', '-5000');
await page.waitForTimeout(500);
const negs = await page.evaluate(() => ({ inv: document.querySelector('#calcRows [data-key$="_rate"]').getAttribute('aria-invalid'), total: document.getElementById('calcTotal').textContent, kpi: document.getElementById('bdKpis').textContent }));
ok(negs.inv === 'true' && !/-/.test(negs.total) && !/-5000|Over budget/.test(negs.kpi), '9  a negative rate is flagged and counted as nothing', negs);

// 10 deleting an expense keeps keyboard focus on the list
await open(page, 'budget.html#expenses');
for (const a of ['500', '700']) { await page.fill('[name="amount"]', a); await page.click('.cx-submit'); await page.waitForTimeout(150); }
await page.focus('[data-cx="del-expense"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
const foc = await page.evaluate(() => document.activeElement && document.activeElement.tagName);
ok(foc !== 'BODY', '10 deleting an expense does not drop focus to the page', foc);

// 11 a typed but unusable amount is not told to "type the amount first"
await page.fill('[name="amount"]', '-500');
await page.click('.cx-submit');
await page.waitForTimeout(300);
const toastTxt = await page.evaluate(() => [...document.querySelectorAll('[role="alert"], .toast, .k-toast')].map((e) => e.textContent).join(' '));
ok(/not an amount above zero/.test(toastTxt) && !/Type the amount first/.test(toastTxt), '11 an unusable amount says so', toastTxt);

// 12 the budget's icon is not a rupee sign
const rupeeIcon = await page.evaluate(() => [...document.querySelectorAll('[data-module-id="budget"] .sym, a[href^="budget"] .sym')].filter((e) => /currency_rupee/.test(e.textContent)).length);
ok(rupeeIcon === 0, '12 no rupee glyph on the budget\'s rail entry', rupeeIcon);
await r2.close();

/* ---- a dollar film ---- */
const desk = await browser.newContext({ viewport: { width: 1280, height: 900 } });
page = await film(desk, 'INT', { ci_currency: 'USD', ci_1_item: 'Other (custom)', ci_1_custom: 'Camera', ci_1_days: '2', ci_1_rate: '1500' });
await open(page, 'budget.html#expenses');
const usdIntro = await page.evaluate(() => document.getElementById('expenses').textContent);
ok(!/Every rupee/.test(usdIntro) && /Every dollar that leaves a pocket/.test(usdIntro), '4b a dollar budget\'s Petty cash does not say "Every rupee"');
await desk.close();

ok(errors.length === 0, '7  no page errors', errors);
await browser.close();
server.close();
console.log(failed ? `✗ prove:budget-money — ${failed} failed` : '✓ prove:budget-money — all passed');
process.exit(failed ? 1 : 0);
