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
ok(/45,000/.test(await kpi()), '8a the header shows the priced estimate first');
await page.click('[data-action="reset"]');
await page.click('.dlg .modal-actions .k-btn--danger');
await page.waitForTimeout(250);
const afterReset = await page.evaluate(() => ({ kpi: document.getElementById('bdKpis').textContent, petty: (document.getElementById('bdPetty') || {}).textContent || '' }));
ok(!/45,000/.test(afterReset.kpi) && /Nothing priced yet/.test(afterReset.kpi), '8  Reset refreshes the header figures at once (and an empty budget claims nothing)', afterReset.kpi);

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

/* ---- QA round 3 (fix-money r3) ---- */
const r3 = await browser.newContext({ viewport: { width: 390, height: 844 } });
page = await film(r3, 'INT', { ci_currency: 'USD', ci_1_item: 'Other (custom)', ci_1_custom: 'Camera', ci_1_days: '1', ci_1_rate: '1200' });
await page.evaluate(() => localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [{ id: 's1', number: '1', heading: 'INT ROOM - DAY' }] })));
const toasts = () => page.evaluate(() => [...document.querySelectorAll('[role="alert"], .toast, .k-toast')].map((e) => e.textContent).join(' '));
await open(page, 'budget.html#export');
const exp = await page.evaluate(() => document.getElementById('export').textContent);
ok(/1 line in 1 account,/.test(exp) && !/1 accounts/.test(exp), '14 the export card says "1 account"', exp.slice(0, 200));
ok(!/GSTIN|TDS/.test(exp), '15 a dollar budget\'s export copy is not India-only', exp.slice(0, 300));
await open(page, 'budget.html#schedule');
const sched = await page.evaluate(() => document.getElementById('schedule').textContent);
ok(/The scene has no shoot day yet/.test(sched) && !/None of the 1 scene/.test(sched), '16 one scene with no day reads grammatically', sched.slice(0, 300));
await open(page, 'budget.html#expenses');
ok(!(await page.$('[name="gstin"]')), '15b a dollar budget has no GSTIN field');
for (const a of ['3.75', '0.40']) { await page.fill('[name="amount"]', a); await page.click('.cx-submit'); await page.waitForTimeout(150); }
const log = await page.evaluate(() => document.getElementById('expenses').textContent);
ok(/\$3\.75/.test(log) && /\$0\.40/.test(log) && /\$4\.15/.test(log), '17 dollar petty cash keeps its cents', log.slice(0, 400));
await page.selectOption('.cx-floats [name="to"]', { index: 0 }).catch(() => {});
await page.fill('.cx-floats [name="toName"]', 'Ravi');
await page.fill('.cx-floats [name="amount"]', 'abc');
await page.click('.cx-floats button[type="submit"]');
await page.waitForTimeout(300);
const ft = await toasts();
ok(/not an amount above zero/.test(ft) && !/needs a person and an amount/.test(ft), '18 a typed-but-unusable float amount says so', ft);
await page.fill('.cx-floats [name="amount"]', '100');
await page.click('.cx-floats button[type="submit"]');
await page.waitForTimeout(300);
await page.fill('[name="amount"] >> nth=0', '40');
await page.click('.cx-submit');
await page.waitForTimeout(300);
const strip = await page.evaluate(() => document.getElementById('expenses').textContent);
ok(/spent from floats/i.test(strip) && /paid by the office/i.test(strip) /* stat labels are sentence case since 28 Oct 2026 */, '19 the petty cash strip splits float spending from office-paid bills', strip.slice(0, 300));
const hdr = await page.evaluate(() => document.getElementById('bdKpis').textContent);
ok(!/Nothing to measure against/.test(hdr) || !/Spent beyond the budget/.test(hdr), '20 the header does not say both "nothing to measure" and "over budget"', hdr);
await r3.close();
const r3c = await browser.newContext({ viewport: { width: 390, height: 844 } });
page = await film(r3c, 'INT', { ci_currency: 'USD' });
await open(page, 'budget.html#expenses');
await page.fill('[name="amount"]', '4000');
await page.click('.cx-submit');
await page.waitForTimeout(300);
const hdr0 = await page.evaluate(() => document.getElementById('bdKpis').textContent);
ok(/No budget set/.test(hdr0) && !/Estimate \+ \d+% contingency/.test(hdr0) && /Spent with no budget set/.test(hdr0), '20b spend with no estimate reads "No budget set" throughout', hdr0);
await r3c.close();

const r3b = await browser.newContext({ viewport: { width: 390, height: 844 } });
page = await film(r3b, null, { ci_1_item: 'Other (custom)', ci_1_custom: 'Camera', ci_1_days: '1', ci_1_rate: '1200' });
await open(page, 'budget.html');
ok(/₹ 1,200/.test(await kpi()) && !/₹ 1k/.test(await kpi()), '21 a small budget shows its exact figure in the header', await kpi());
await open(page, 'budget.html#actuals');
const rep = await page.evaluate(() => {
  const w = document.querySelector('#actuals .cx-scroll');
  const th = [...w.querySelectorAll('thead th')].find((t) => t.textContent === 'Estimate');
  return { tab: w.getAttribute('tabindex'), role: w.getAttribute('role'), left: th.getBoundingClientRect().left };
});
ok(rep.tab === '0' && rep.role === 'region' && rep.left < 340, '22 at 390px the cost report scrolls by keyboard and Estimate peeks into view', rep);
await r3b.close();

ok(errors.length === 0, '7  no page errors', errors);
/* ---- fix-money r4: names, clipping, rules, dashboard figure ---- */
const r4 = await browser.newContext({ viewport: { width: 390, height: 844 } });
page = await film(r4, null, {
  ci_1_item: 'Other (custom)', ci_1_custom: 'DOP', ci_1_days: '1', ci_1_rate: '1200',
  ci_2_item: 'Other (custom)', ci_2_custom: 'Food', ci_2_days: '2', ci_2_rate: '500'
});
await page.evaluate(() => localStorage.setItem('fms_costs_v1', JSON.stringify({ settings: {}, lines: { ci_2: { dept: 'food' } } })));
await open(page, 'budget.html#estimate');
const names = await page.evaluate(() => [...document.querySelectorAll('.calc-row input, .calc-row select')].map((e) => (e.labels[0] || {}).textContent));
ok(new Set(names).size === names.length, 'r4a every estimator field has a name unique to its row', names);
await open(page, 'budget.html#actuals');
const clip = await page.evaluate(() => [...document.querySelectorAll('[data-cx-field="line-dept"]')].map((s) => {
  const o = s.options[s.selectedIndex]; const c = document.createElement('canvas').getContext('2d');
  c.font = getComputedStyle(s).font; return { w: s.clientWidth, text: c.measureText(o.text).width };
}));
ok(clip.length > 0 && clip.every((c) => c.text + 32 <= c.w), 'r4b at 390px the department select shows its whole name', clip);
await open(page, 'budget.html#topsheet');
const rule = await page.evaluate(() => {
  const tr = document.querySelector('table.cx-top tbody tr.cx-sub:last-child, table.cx-top tbody tr:last-child');
  return tr && [...tr.children].map((c) => getComputedStyle(c).borderBottomWidth);
});
ok(rule && new Set(rule).size === 1, 'r4c a top-sheet row rule is the same under every cell', rule);
await open(page, 'dashboard.html');
const dstat = await page.evaluate(() => (document.querySelector('.db-stats') || {}).textContent || '');
ok(/₹ 2,200/.test(dstat), 'r4d the dashboard shows the exact small budget, not ₹ 2k', dstat.slice(0, 300));
await page.evaluate(() => localStorage.setItem('fms_library_calc_v1', JSON.stringify({ ci_currency: 'USD', ci_1_days: '1', ci_1_rate: '12' })));
await open(page, 'budget.html#actuals');
const usdTxt = await page.evaluate(() => document.getElementById('actuals').textContent);
ok(!/GST|batta/i.test(usdTxt.replace(/Tax in the bill/, '')), 'r4e a dollar cost report has no GST or batta wording', usdTxt.match(/.{20}(GST|batta).{10}/i));
await r4.close();

/* ---- region: an INT film hides India-only budget material, an IN film is unchanged ---- */
const rg = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const seen = (pg, sel) => pg.evaluate((q) => { const e = document.querySelector(q); return !!e && e.getClientRects().length > 0; }, sel);
for (const [reg, abroad] of [['INT', true], ['IN', false]]) {
  page = await film(rg, reg, { ci_currency: 'INR', ci_1_days: '1', ci_1_rate: '500' });
  await open(page, 'budget.html#expenses');
  const ex = await page.evaluate(() => ({
    cat: [...document.querySelectorAll('#expenses input[name="category"]')].map((i) => [i.value, i.closest('label').textContent.trim()]),
    meth: [...document.querySelectorAll('#expenses select[name="method"] option')].map((o) => [o.value, o.textContent]),
    gst: !!document.querySelector('#expenses [name="gstPct"]'), gstin: !!document.querySelector('#expenses [name="gstin"]')
  }));
  const catLabel = (ex.cat.find((c) => c[0] === 'batta') || [])[1];
  const upi = (ex.meth.find((c) => c[0] === 'upi') || [])[1];
  ok(catLabel === (abroad ? 'Per diem' : 'Batta') && upi === (abroad ? 'Bank/card' : 'UPI'), `r5 ${reg} film labels the stored ids batta / upi as ${abroad ? 'Per diem / Bank/card' : 'Batta / UPI'}`, { catLabel, upi });
  ok(ex.gst && ex.gstin, `r5 ${reg} film keeps the GST and GSTIN fields in the DOM (hidden, never removed)`, ex);
  await page.evaluate(() => document.querySelector('#expenses details.cx-more').open = true);
  ok((await seen(page, '#expenses [name="gstPct"]')) === !abroad && (await seen(page, '#expenses [name="gstin"]')) === !abroad, `r5 ${reg} film ${abroad ? 'hides' : 'shows'} GST and GSTIN`);
  await open(page, 'budget.html#wages');
  ok((await seen(page, '#wages .cx-expired')) === !abroad, `r5 ${reg} film ${abroad ? 'hides' : 'shows'} the FEFSI notice`);
  ok((await seen(page, '#wages .cx-wages tbody td.k-mono, #wages .cx-wages tbody tr td:nth-child(2)')) === !abroad, `r5 ${reg} film ${abroad ? 'hides' : 'shows'} the published FEFSI column`);
  await open(page, 'budget.html#actuals');
  const act = await page.evaluate(() => document.getElementById('actuals').textContent);
  ok(abroad ? !/GST|TDS|batta/i.test(act) : /GST/.test(act), `r5 ${reg} film's cost report ${abroad ? 'has no GST/TDS/batta wording' : 'still says GST'}`, act.match(/.{15}(GST|TDS|batta).{10}/i));
  await page.close();
}
await rg.close();

/* ---- leftovers (27 Oct 2026) ---- */
{
  const lo = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await film(lo, null, {
    ci_1_item: 'Other (custom)', ci_1_custom: 'Camera package with a very long descriptive name for the whole shoot', ci_1_days: '2', ci_1_rate: '25000',
    ci_2_item: 'Other (custom)', ci_2_custom: 'Stunt coordinator', ci_2_days: '1', ci_2_rate: '9000'
  });
  await page.evaluate(() => {
    const sc = (n, d, loc) => ({ id: 'l' + n, number: String(n), intExt: 'INT', dayNight: 'DAY', location: loc, synopsis: 'x', eighths: 8, shootDay: d, elements: {} });
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [sc(1, 1, 'A VERY LONG LOCATION NAME FOR THE FIRST SCENE'), sc(2, 1, 'SECOND'), sc(3, 2, 'THIRD ONE')] }));
  });
  await open(page, 'budget.html#schedule');
  await page.evaluate(() => document.querySelectorAll('#schedule details.cx-scales').forEach((d) => { d.open = true; }));
  const fit = await page.evaluate(() => {
    const de = document.documentElement;
    const tbl = (sel) => { const t = document.querySelector(sel); if (!t) return null; const w = t.closest('.cx-scroll, .k-table-wrap'); return { own: !!w, tw: Math.round(t.getBoundingClientRect().width), box: w ? Math.round(w.clientWidth) : null }; };
    return { page: de.scrollWidth - de.clientWidth, scales: tbl('#schedule .cx-scales table'), cut: tbl('#schedule .cx-cut table') };
  });
  ok(fit.scales && fit.cut && fit.page <= 0, '23 at 390px the schedule tables do not widen the page', fit);
  ok(fit.scales && fit.cut && (fit.scales.tw <= fit.scales.box || fit.scales.own) && (fit.cut.tw <= fit.cut.box || fit.cut.own), '23 each table fits or scrolls in its own box', fit);

  // float and payment deletes: no dialog, an Undo that restores the same row
  await open(page, 'budget.html#expenses');
  await page.fill('.cx-floats [name="toName"]', 'Ravi');
  await page.fill('.cx-floats [name="amount"]', '100');
  await page.click('.cx-floats button[type="submit"]');
  await page.waitForTimeout(300);
  const ids = () => page.evaluate(() => (JSON.parse(localStorage.getItem('fms_costs_v1') || '{}').floats || []).map((f) => f.id));
  const before = await ids();
  await page.evaluate(() => document.querySelectorAll('#expenses details').forEach((d) => { d.open = true; }));
  await page.click('[data-cx="del-float"]');
  await page.waitForTimeout(300);
  const dlg = await page.evaluate(() => [...document.querySelectorAll('dialog[open], .modal-overlay, [role="dialog"], [role="alertdialog"]')].filter((e) => e.getClientRects().length).map((e) => e.className));
  ok(dlg.length === 0 && (await ids()).length === 0, '24 deleting a float asks nothing and removes it', { dlg, ids: await ids() });
  await page.click('.toast button:has-text("UNDO"), .k-toast button:has-text("UNDO"), [role="status"] button:has-text("UNDO")');
  await page.waitForTimeout(300);
  const after = await ids();
  ok(before.length === 1 && JSON.stringify(after) === JSON.stringify(before), '24 Undo brings back the same float row (same id)', { before, after });
  await lo.close();
}

/* ---- the estimator on paper ---- */
{
  const pr = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  page = await film(pr, null, { ci_1_item: 'Other (custom)', ci_1_custom: 'Camera', ci_1_days: '2', ci_1_rate: '25000' });
  await open(page, 'budget.html#estimate');
  await page.emulateMedia({ media: 'print' });
  const pv = await page.evaluate(() => {
    const shown = (q) => [...document.querySelectorAll(q)].map((e) => getComputedStyle(e).display !== 'none');
    return { blank: shown('.bud-est .calc-row[data-blank]'), actions: shown('.bud-est .calc-actions'), head: shown('.bud-est .calc-row.head'), filled: shown('.bud-est .calc-row:not([data-blank]):not(.head)') };
  });
  ok(pv.blank.length > 0 && pv.blank.every((v) => !v), '25 print: unpriced spare rows are hidden', pv);
  ok(pv.actions.every((v) => !v), '25 print: the add/clear buttons are hidden', pv);
  ok(pv.head.length > 0 && pv.head.every((v) => v), '25 print: the column captions print', pv);
  ok(pv.filled.length > 0 && pv.filled.every((v) => v), '25 print: a priced row prints', pv);
  await page.emulateMedia({ media: 'screen' });
  await pr.close();
}

await browser.close();
server.close();
console.log(failed ? `✗ prove:budget-money — ${failed} failed` : '✓ prove:budget-money — all passed');
process.exit(failed ? 1 : 0);
