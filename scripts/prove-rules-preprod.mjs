/* ============================================================
   PROOF: the no-AI pre-production buttons (docs/RULES-BREAKDOWN.md,
   lane A) on the Dragon sample, in a real Chromium, signed out, with
   NO key anywhere.
   ------------------------------------------------------------
     stripboard.html   "Plan days"      -> shoot-order-rules
     plan.html         "Check recce"    -> recce-notes-rules
     budget.html       "Draft lines"    -> budget-estimate-rules
     contacts.html     "Write notes"    -> callsheet-notes-rules

   For each: the button is a kit button, the AI pill beside it reads
   "Enhance with AI"; a press opens the Desk with no key step and a tick
   list already built; nothing is written before Accept; Accept all
   writes; Undo puts the page back; and not one request leaves for an AI
   host (every non-local request is recorded, then aborted).

       npm run build:open && npm run prove:rules-preprod
       (PROVE_DIST=dist-verify, PW_CHROMIUM=/path/to/chromium)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5392;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
if (!fs.existsSync(path.join(DIST, 'stripboard.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/stripboard.html — run `npm run build:open` first');
  process.exit(2);
}
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('✗ this proof needs the OPEN build (npm run build:open)'); process.exit(2); }
}
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const BASE = 'http://localhost:' + PORT;

let failed = 0;
function ok(cond, label, extra) {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond && extra !== undefined) console.log('        ' + JSON.stringify(extra).slice(0, 500));
}

const AI_HOSTS = /anthropic\.com|googleapis\.com|openai\.com|generativelanguage/i;
const outside = [];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.route('**/*', (route) => {
  const u = route.request().url();
  if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue();
  outside.push(u);
  return route.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const read = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), key);
const settle = (ms = 500) => page.waitForTimeout(ms);
const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await settle(700); };
const edit = (key, src) => page.evaluate(([k, s]) => {
  const blob = JSON.parse(localStorage.getItem(k) || '{}');
  // eslint-disable-next-line no-new-func
  new Function('blob', s)(blob);
  localStorage.setItem(k, JSON.stringify(blob));
}, [key, src]);

/** Press a rules button: the Desk opens on a built list, with no key step. */
async function press(selector, what) {
  await page.click(selector);
  await page.waitForSelector('aside.ai-desk label.ai-desk-item', { timeout: 15000 }).catch(() => {});
  const open = await page.locator('aside.ai-desk').first().isVisible().catch(() => false);
  ok(open, what + ': the button opens the Desk');
  ok(await page.locator('aside.ai-desk a[href="settings.html#ai"]').count() === 0, what + ': no key step');
  ok(await page.locator('aside.ai-desk .ai-key-input').count() === 0, what + ': no key form');
  const items = await page.$$eval('aside.ai-desk label.ai-desk-item', (l) => l.map((x) => x.textContent));
  ok(items.length > 0, what + ': the tick list is already built (' + items.length + ' items)', items);
  return items;
}
async function undo(what) {
  const u = page.locator('.toast-action', { hasText: /Undo/ }).last();
  const has = await u.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  ok(has, what + ': an Undo toast is offered');
  if (has) await u.click();
  await settle(600);
}
const accept = async () => { await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]'); await settle(900); };
const pillLabel = (sel) => page.locator(sel).first().innerText().catch(() => '');

/* ---- the Dragon sample, no key ---------------------------------- */
await go('/index.html');
await page.evaluate(() => localStorage.clear());
await go('/index.html');
await page.click('[data-action="sample-project"][data-sample="dragon"]');
await page.waitForLoadState('networkidle');
await settle(800);
const keyKeys = await page.evaluate(() => Object.keys(localStorage).filter((k) => /ai_key|apikey|gemini/i.test(k)));
ok(keyKeys.length === 0, 'no AI key is stored anywhere', keyKeys);
const all0 = (await read('fms_scenes_v1')).scenes;
ok(all0.length > 10, 'the Dragon sample is open (' + all0.length + ' scenes)');

/* ================= Plan days ================= */
console.log('stripboard.html: Plan days');
{
  // nothing scheduled and nothing shot: a full plan to review
  await edit('fms_scenes_v1', 'blob.scenes.forEach((s) => { s.shootDay = 0; s.shotState = ""; });');
  await edit('fms_locations_v1', 'blob.order = {};');
  await go('/stripboard.html');
  ok(/Plan days/.test(await pillLabel('[data-action="sb-plan-days"]')), 'the button reads "Plan days"');
  ok(await page.locator('[data-action="sb-plan-days"].k-btn').count() === 1, 'it is a kit button');
  ok(/Enhance with AI/.test(await pillLabel('.sb-acts .ai-pill')), 'the AI pill beside it reads "Enhance with AI"');
  const before = JSON.stringify((await read('fms_scenes_v1')).scenes.map((s) => [s.id, s.shootDay || 0]));
  const ordersBefore = JSON.stringify((await read('fms_locations_v1') || {}).order || {});
  const items = await press('[data-action="sb-plan-days"]', 'plan days');
  ok(/^Day 1: Sc /.test(items[0].trim()), 'the first item is Day 1', items[0]);
  ok(JSON.stringify((await read('fms_scenes_v1')).scenes.map((s) => [s.id, s.shootDay || 0])) === before, 'nothing is written before Accept');
  await accept();
  const after = (await read('fms_scenes_v1')).scenes;
  ok(after.every((s) => Number(s.shootDay) > 0), 'Accept all puts every scene on a day');
  ok(after.every((s) => !('ai' in s) && !('aiFill' in s)), 'no scene carries an ai / aiFill stamp');
  await undo('plan days');
  ok(JSON.stringify((await read('fms_scenes_v1')).scenes.map((s) => [s.id, s.shootDay || 0])) === before, 'Undo puts every scene back on its old day');
  ok(JSON.stringify((await read('fms_locations_v1') || {}).order || {}) === ordersBefore, 'Undo puts the day orders back');
}

/* ================= Check recce ================= */
console.log('plan.html: Check recce');
{
  await edit('fms_locations_v1', 'blob.recces = {};');
  await go('/plan.html#locations');
  ok(/Check recce/.test(await pillLabel('[data-action="recce-rules"]')), 'the button reads "Check recce"');
  ok(/Enhance with AI/.test(await pillLabel('#locations .ai-pill')), 'the AI pill beside it reads "Enhance with AI"');
  const before = JSON.stringify((await read('fms_locations_v1') || {}).recces || {});
  const items = await press('#locations [data-action="recce-rules"]', 'check recce');
  ok(items.every((t) => /To check: /.test(t)), 'every line starts "To check:"', items.slice(0, 3));
  ok(JSON.stringify((await read('fms_locations_v1') || {}).recces || {}) === before, 'nothing is written before Accept');
  await accept();
  const recces = Object.values((await read('fms_locations_v1')).recces || {});
  ok(recces.length > 0 && recces.some((r) => /^To check: /.test(r.bestTime || '')), 'Accept all fills recce fields with "To check:" lines');
  ok(!JSON.stringify(recces).includes('aiFill') && !JSON.stringify(recces).includes('"ai"'), 'no recce card carries an ai / aiFill stamp');
  ok(recces.every((r) => !r.address && !r.contact && !r.cost && !r.hospital && !r.police), 'address, contact, cost, hospital and police are untouched');
  await undo('check recce');
  ok(JSON.stringify((await read('fms_locations_v1') || {}).recces || {}) === before, 'Undo leaves the recce cards as they were');
}

/* ================= Draft lines ================= */
console.log('budget.html: Draft lines');
{
  await page.evaluate(() => localStorage.removeItem('fms_library_calc_v1'));
  await edit('fms_scenes_v1', 'blob.scenes.forEach((s, i) => { s.shootDay = 1 + (i % 6); });');
  await go('/budget.html');
  ok(/Draft lines/.test(await pillLabel('[data-action="draft-lines"]')), 'the button reads "Draft lines"');
  ok(/Enhance with AI/.test(await pillLabel('#estimate .ai-pill')), 'the AI pill beside it reads "Enhance with AI"');
  const rows = async () => {
    const d = (await read('fms_library_calc_v1')) || {};
    return JSON.stringify(Object.keys(d).filter((k) => /^ci_\d+_(item|custom|days|rate)$/.test(k)).sort().map((k) => [k, d[k]]));
  };
  const before = await rows();
  const items = await press('[data-action="draft-lines"]', 'draft lines');
  ok(items.some((t) => /Sound recordist/.test(t)) && items.some((t) => /Unit shoot days/.test(t)), 'the template and the unit-days lines are proposed', items.slice(0, 4));
  ok(items.some((t) => /Rate card: ₹ [\d,]+ to ₹ [\d,]+ a day/.test(t)), 'a band is shown on a line that has one');
  ok(await rows() === before, 'nothing is written before Accept');
  await accept();
  const d = (await read('fms_library_calc_v1')) || {};
  const rates = Object.keys(d).filter((k) => /_rate$/.test(k)).map((k) => d[k]).filter(Boolean);
  ok(Object.keys(d).some((k) => /_days$/.test(k)) && rates.length === 0, 'rows were added with days and a blank rate');
  ok(!Object.keys(d).some((k) => /_ai$/.test(k)), 'no ai key on any row');
  await undo('draft lines');
  ok(await rows() === before, 'Undo takes the new rows out');
  // the midpoint is its own, explicit press
  const mid = await press('[data-action="draft-lines-mid"]', 'draft lines with midpoints');
  ok(mid.some((t) => /rate card midpoint, an estimate — not a quote/.test(t)), 'the midpoint is labelled an estimate, not a quote');
  await page.click('aside.ai-desk [data-action="ai-desk-skip"]');
  await settle(300);
  ok(await rows() === before, 'Skip writes nothing');
}

/* ================= Write notes ================= */
console.log('contacts.html: Write notes');
{
  await edit('fms_contacts_v1', '(blob.callSheets || []).forEach((s) => { s.notes = ""; });');
  await go('/contacts.html#call-sheets');
  const sheets = ((await read('fms_contacts_v1')) || {}).callSheets || [];
  ok(sheets.length > 0, 'the sample has call sheets (' + sheets.length + ')');
  ok(/Write notes/.test(await pillLabel('[data-action="sheet-notes-rules"]')), 'the button reads "Write notes"');
  ok(/Enhance with AI/.test(await pillLabel('.ct-ai-row .ai-pill')), 'the AI pill beside it reads "Enhance with AI"');
  const target = await page.locator('[data-action="sheet-notes-rules"]').first().getAttribute('data-sheet-id');
  const notesOf = async () => ((await read('fms_contacts_v1')).callSheets.find((s) => s.id === target) || {}).notes;
  const before = JSON.stringify((await read('fms_contacts_v1')).callSheets);
  const items = await press('[data-action="sheet-notes-rules"]', 'write notes');
  ok(items.length >= 1, 'one item per fact on the sheet');
  ok(JSON.stringify((await read('fms_contacts_v1')).callSheets) === before, 'nothing is written before Accept');
  await accept();
  const wrote = await notesOf();
  ok(wrote && wrote.length > 0 && wrote.length <= 800, 'Accept all fills the notes box (' + (wrote || '').length + ' characters)');
  ok(items.every((t) => wrote.includes(t.trim())), 'the notes are the ticked lines');
  ok(await page.locator('.ct-sheet-notes').first().inputValue() === wrote, 'the notes box on the page shows them');
  ok(!JSON.stringify((await read('fms_contacts_v1')).callSheets).includes('aiFill'), 'no call sheet carries an aiFill stamp');
  await undo('write notes');
  /* The page's own sync (syncDoc, the same one the AI row's `after` calls) saves the sheet's
     derived `wrap` once the box redraws; that is the page's write, not the task's, so the
     comparison leaves it out and holds every other field to its old value. */
  const strip = (rows) => JSON.stringify(rows.map((r) => { const c = { ...r }; delete c.wrap; return c; }));
  ok(strip((await read('fms_contacts_v1')).callSheets) === strip(JSON.parse(before)), 'Undo leaves the call sheets as they were (the page\'s own derived wrap aside)');
}

/* ---- no AI host, no errors --------------------------------------- */
ok(outside.filter((u) => AI_HOSTS.test(u)).length === 0, 'not one request went to an AI host', outside.filter((u) => AI_HOSTS.test(u)));
ok(errors.length === 0, 'no page errors', errors);

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nrules-preprod proof: all passed');
process.exit(failed ? 1 : 0);
