/* ============================================================
   PROOF: the story lane's no-AI twins (docs/RULES-BREAKDOWN.md Lane C)
   in a real Chromium, SIGNED OUT, with NO key and no Pro plan: the
   AI pill beside each button is locked, the rules button is not.

     (a) screenplay.html  "Clean up (no AI)": select a pasted lump, the
         Desk opens with NO key step and a list at once, Accept all cuts
         it into typed lines (no ai / aiFill), the words are the same,
         Undo puts the lump back exactly
     (b) story.html       "Check without AI": the logline checklist opens
         with no key step; Accept keeps one sticky note (from 'rules'),
         Undo removes it
     (c) visualize.html   "Shots without AI" opens the local `shot-basic`
         task: a list of proposed shots, nothing written before Accept
     (d) write.html       "Measure voice" opens `voice-check-rules`
     (e) breakdown.html   leads with "Auto-Tag (no AI)"; the AI task reads
         "Enhance tags with AI"
     and ZERO requests reach an AI host; three idle seconds with a Desk
     open write nothing.

   Run:  VITE_SITE_GATE=off npx vite build --outDir dist-verify
         PROVE_DIST=dist-verify PROVE_PORT=5906 node scripts/prove-rules-story.mjs
         (PW_CHROMIUM=/path/to/chromium for a sandboxed browser)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5906;
const BASE = 'http://localhost:' + PORT;
if (!fs.existsSync(path.join(DIST, 'screenplay.html'))) { console.error('no screenplay.html in ' + DIST + ': build first'); process.exit(2); }
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('this proof needs the OPEN build (VITE_SITE_GATE=off)'); process.exit(2); }
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond || detail === undefined ? '' : '\n        ' + JSON.stringify(detail).slice(0, 600)));
  return !!cond;
}

const LUMP = 'INT. WORKSHOP - NIGHT\nRain on the tin roof. A lamp flickers.\nVELU\n(whispering)\nThey left the door open.\nKAVI\nThen we are not alone.\nCUT TO:\nEXT. LANE - DAWN\nTHE VAN IS GONE AND THE GATE SWINGS.';
const LOGLINE = 'A disgraced detective must find her missing son before the storm floods the island, but the only witness is the man who ruined her.';

const aiHosts = [];
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
await ctx.route((u) => !u.href.startsWith(BASE), (r) => {
  if (/anthropic|googleapis\.com|generativelanguage|openai/i.test(r.request().url())) aiHosts.push(r.request().url());
  return r.abort();
});
await ctx.addInitScript(() => {
  window.__writes = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (a, b) { if (this === localStorage) window.__writes.push({ k: String(a), t: performance.now() }); return set.call(this, a, b); };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload|ERR_FAILED/i.test(m.text())) errors.push(m.text()); });
page.on('dialog', (d) => {
  if (d.type() === 'beforeunload') { d.accept().catch(() => {}); return; }   // the writer's own leave prompt, not a dialog the app opened
  errors.push('native dialog: ' + d.type() + ' ' + d.message()); d.dismiss().catch(() => {});
});

const url = (p) => BASE + '/' + p;
const settle = (ms = 500) => page.waitForTimeout(ms);
const deskOpen = () => page.evaluate(() => { const d = document.querySelector('aside.ai-desk'); return !!d && !d.hidden && d.getBoundingClientRect().width > 0; });
const deskText = () => page.evaluate(() => (document.querySelector('aside.ai-desk') || {}).textContent || '');
const items = () => page.locator('aside.ai-desk .ai-desk-item').count();
async function waitDesk() {
  await page.waitForFunction(() => { const d = document.querySelector('aside.ai-desk'); return d && !d.hidden && d.getBoundingClientRect().width > 0; }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForSelector('aside.ai-desk .ai-desk-item, aside.ai-desk .ai-error, aside.ai-desk .ai-desk-answer', { timeout: 8000 }).catch(() => {});
  await settle(300);
}
async function closeDesk() { await page.click('aside.ai-desk [data-action="ai-desk-close"]').catch(() => {}); await settle(300); }
async function undo() {
  /* scoped to the Desk's own toast: an Accept can start the scene sync, which raises toasts of its own */
  const u = page.locator('.toast', { hasText: /applied|kept as/ }).locator('.toast-action', { hasText: /Undo/ }).last();
  const has = await u.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  ok(has, 'an Undo toast is offered');
  if (has) await u.click();
  await settle(500);
}
const noKeyStep = async (label) => {
  const t = await deskText();
  ok(!(await page.locator('aside.ai-desk a[href="settings.html#ai"]').count()) && !/add your key|api key/i.test(t), label + ': the Desk shows no key step', t.slice(0, 160));
  ok(!/Pro/.test(await page.locator('aside.ai-desk .ai-desk-title, aside.ai-desk h2').allTextContents().then((a) => a.join(' '))), label + ': and no Pro offer');
};
const scriptDoc = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_script_v1') || '{"elements":[]}'));

/* ---- the Dragon sample, signed out, no key ---------------------- */
await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.click('[data-action="sample-project"][data-sample="dragon"]');
await page.waitForLoadState('networkidle');
await settle(800);
await page.evaluate(({ lump, logline }) => {
  const d = JSON.parse(localStorage.getItem('fms_script_v1'));
  d.elements.push({ id: 'rs-lump', type: 'action', text: lump });
  localStorage.setItem('fms_script_v1', JSON.stringify(d));
  const s = JSON.parse(localStorage.getItem('fms_story_v1') || '{}');
  s.logline = logline;
  localStorage.setItem('fms_story_v1', JSON.stringify(s));
}, { lump: LUMP, logline: LOGLINE });

/* ---- (a) screenplay: Clean up (no AI) --------------------------- */
console.log('(a) screenplay.html: Clean up (no AI)');
await page.goto(url('screenplay.html?stay=1'), { waitUntil: 'networkidle' });
await settle(900);
const cleanBtn = page.locator('[data-action="sc-cleanup-rules"]').first();
ok(await cleanBtn.waitFor({ state: 'attached', timeout: 15000 }).then(() => true, () => false), 'the button is on the page');
const pill = page.locator('.sc-tools-l .ai-pill').first();
const pillState = await pill.evaluate((el) => ({ state: el.dataset.aiState, text: el.textContent })).catch(() => ({}));
ok(pillState.state === 'locked' && /Pro/.test(pillState.text || ''), 'the AI pill beside it is locked (no plan)', pillState);
ok(await cleanBtn.isEnabled() && !(await cleanBtn.getAttribute('aria-disabled')), 'the rules button is not');
const before = await scriptDoc();
const ta = page.locator('[data-el="rs-lump"] .wr-text').first();
await ta.scrollIntoViewIfNeeded().catch(() => {});
await ta.click();
await page.keyboard.press('Control+A');
await settle(200);
await cleanBtn.click();
await waitDesk();
ok(await deskOpen(), 'the Desk opens');
await noKeyStep('cleanup');
const n = await items();
ok(n >= 9, 'the list is built at once (' + n + ' lines)', await deskText());
ok(/formatting, not editing/.test(await deskText()), 'the note says it is formatting, not editing');
ok(JSON.stringify((await scriptDoc()).elements) === JSON.stringify(before.elements), 'nothing is written before Accept');
{
  const w0 = await page.evaluate(() => window.__writes.length);
  await settle(3000);
  const w = await page.evaluate((k) => window.__writes.slice(k).map((x) => x.k), w0);
  ok(w.length === 0, 'three idle seconds with the Desk open write nothing', w);
}
await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
await settle(1200);
const after = await scriptDoc();
const wordsOf = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}'\s-]/gu, ' ').split(/\s+/).filter(Boolean).join(' ');
const at = after.elements.findIndex((e) => e.id !== 'rs-lump' && !before.elements.some((b) => b.id === e.id));
const fresh = after.elements.slice(at);
ok(!after.elements.some((e) => e.id === 'rs-lump') && fresh.length >= 9, 'the lump is replaced by ' + fresh.length + ' lines', fresh.map((e) => e.type));
ok(fresh.map((e) => e.type).join() === 'scene,action,character,paren,dialogue,character,dialogue,transition,scene,action', 'typed: heading, action, cue, parenthetical, dialogue, cue, dialogue, transition, heading, action', fresh.map((e) => e.type));
ok(fresh.find((e) => /^THE VAN/.test(e.text)).type === 'action', 'an ALL-CAPS action line is still action');
ok(wordsOf(fresh.map((e) => e.text).join(' ')) === wordsOf(LUMP), 'every word is the writer’s, in order');
ok(after.elements.every((e) => !('ai' in e) && !('aiFill' in e)), 'no ai / aiFill on any element');
ok(JSON.stringify(after.elements.slice(0, at)) === JSON.stringify(before.elements.slice(0, at)), 'the lines above are untouched');
await undo();
const back = await scriptDoc();
const brief = (els) => els.map((e) => [e.id, e.type, e.text]);
ok(JSON.stringify(brief(back.elements)) === JSON.stringify(brief(before.elements)), 'Undo puts the lump back exactly (ids, types, words)',
  { was: brief(before.elements).slice(-2), now: brief(back.elements).slice(-3), n: [before.elements.length, back.elements.length] });
ok(JSON.stringify(back.elements) === JSON.stringify(before.elements) || back.elements.every((e, i) => JSON.stringify({ ...e, u: 0 }) === JSON.stringify({ ...before.elements[i], u: 0 })), 'and no other field of any line changed (a co-editing stamp aside)');

/* ---- (b) story: Check without AI -------------------------------- */
console.log('(b) story.html: Check without AI');
await page.goto(url('story.html#path-idea'), { waitUntil: 'load' });
await page.waitForLoadState('networkidle').catch(() => {});
await settle(900);
const lw = page.locator('[data-action="lw-check-rules"]').first();
ok(await lw.waitFor({ state: 'attached', timeout: 15000 }).then(() => true, () => false), 'the button is in the logline workshop');
const lpill = await page.locator('.st-lw .ai-pill').first().evaluate((el) => ({ state: el.dataset.aiState, text: el.textContent })).catch(() => ({}));
ok(lpill.state === 'locked' && /Enhance/.test(lpill.text || ''), 'the AI pill beside it is "Enhance …" and locked', lpill);
await lw.scrollIntoViewIfNeeded().catch(() => {});
await lw.click();
await waitDesk();
ok(await deskOpen(), 'the Desk opens');
await noKeyStep('logline');
const rows = await page.locator('aside.ai-desk .ai-desk-item').allTextContents();
ok(rows.length === 9, 'the checklist has nine points', rows);
ok(rows.some((r) => /Protagonist/.test(r) && /detective/.test(r)) && rows.some((r) => /Goal/.test(r) && /must find/.test(r)), 'it quotes the writer’s own words', rows);
ok(/not a score/.test(await deskText()), 'it says it is a checklist, not a score');
const vault0 = await page.evaluate(() => (JSON.parse(localStorage.getItem('fms_idea_vault_v1') || '[]')).length);
await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
await settle(900);
const notes = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_idea_vault_v1') || '[]').filter((x) => x.from === 'rules'));
ok(notes.length === 1 && notes[0].kind === 'note' && !('ai' in notes[0]) && !('aiFill' in notes[0]), 'Accept keeps one sticky note from "rules", not AI-stamped', notes);
await undo();
ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('fms_idea_vault_v1') || '[]')).length) === vault0, 'Undo removes it');
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1')).logline) === LOGLINE, 'the logline itself was never touched');

/* ---- (c) visualize: Shots without AI ---------------------------- */
console.log('(c) visualize.html: Shots without AI');
await page.goto(url('visualize.html#draft'), { waitUntil: 'networkidle' });
await settle(900);
await page.click('[data-action="vz-ai-all"]').catch(() => {});
await settle(300);
const sb = page.locator('[data-action="vz-shots-basic"]').first();
ok(await sb.waitFor({ state: 'attached', timeout: 15000 }).then(() => true, () => false), 'the button is beside the draft pill');
const spill = await page.locator('.vz-ai-acts .ai-pill').first().evaluate((el) => ({ state: el.dataset.aiState, text: el.textContent })).catch(() => ({}));
ok(/Enhance .* with AI/.test(spill.text || '') && spill.state === 'locked', 'the AI pill beside it reads "Enhance … with AI" and is locked', spill);
const shots0 = await page.evaluate(() => (JSON.parse(localStorage.getItem('fms_shots_v1') || '{"shots":[]}').shots || []).length);
await sb.click();
await waitDesk();
ok(await deskOpen(), 'the Desk opens');
ok(/Shots from the script/.test(await deskText()), 'it is the local task `shot-basic`', (await deskText()).slice(0, 120));
await noKeyStep('shots');
ok((await items()) > 0, 'a list of proposed shots (' + (await items()) + ')');
ok(await page.evaluate(() => (JSON.parse(localStorage.getItem('fms_shots_v1') || '{"shots":[]}').shots || []).length) === shots0, 'no shot is written before Accept');
await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
await settle(900);
const shotsNow = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_shots_v1') || '{"shots":[]}').shots || []);
ok(shotsNow.length > shots0 && shotsNow.every((s) => !s.ai && !s.aiFill), 'Accept writes the shots, none stamped AI', shotsNow.length - shots0);
ok(!/drafted by AI/.test(await page.locator('.vz-ai').first().textContent()), 'the status does not say AI');
await undo();

/* ---- (d) write: Measure voice ------------------------------- */
console.log('(d) write.html#coverage: Measure voice');
await page.goto(url('write.html?stay=1#coverage'), { waitUntil: 'networkidle' });
const pick = page.locator('select[data-action="cv-voice-pick"]');
if (await pick.waitFor({ state: 'visible', timeout: 15000 }).then(() => true, () => false)) {
  const best = await pick.evaluate((sel) => {
    let top = null, n = -1;
    for (const o of sel.options) { const m = /— (\d+) line/.exec(o.textContent); if (m && Number(m[1]) > n) { n = Number(m[1]); top = o.value; } }
    return top;
  });
  ok(!!best, 'a speaking character to pick');
  if (best) await pick.selectOption(best);
  await settle(500);
  const vb = page.locator('[data-action="cv-voice-rules"]').first();
  ok(await vb.isEnabled(), 'Measure voice is enabled once a character is picked');
  await vb.click();
  await waitDesk();
  ok(await deskOpen(), 'the Desk opens');
  await noKeyStep('voice');
  const vt = await deskText();
  ok(/Measured|too few lines to measure/.test(vt), 'it measures, or says there are too few lines', vt.slice(0, 200));
  await closeDesk();
} else {
  ok(false, 'the voice panel never appeared (cv-voice-pick)');
}

/* ---- (e) breakdown: leads with Auto-Tag ------------------------- */
console.log('(e) breakdown.html: Auto-Tag leads');
await page.goto(url('breakdown.html'), { waitUntil: 'networkidle' });
await settle(900);
const lead = page.locator('.bd-autotag-lead').first();
if (await lead.waitFor({ state: 'attached', timeout: 15000 }).then(() => true, () => false)) {
  const order = await page.evaluate(() => {
    const kids = [...document.querySelectorAll('.k-page-actions > *')];
    return { lead: kids.findIndex((e) => e.classList.contains('bd-autotag-lead')), pill: kids.findIndex((e) => e.classList.contains('ai-pill')) };
  });
  ok(order.lead === 0 && order.pill > order.lead, 'Auto-Tag (no AI) comes before the AI pill', order);
  await lead.click();
  await settle(600);
  ok(/suggest/.test(await page.evaluate(() => location.hash)) && await page.locator('#suggest').isVisible(), 'it opens the Auto-Tag tab');
  const labels = await page.evaluate(() => { const p = document.querySelector('.k-page-actions .ai-pill'); return p ? p.textContent : ''; });
  ok(/AI/.test(labels), 'the AI pill stays beside it', labels);
} else {
  ok(false, 'the Auto-Tag lead button never appeared');
}
await page.click('.k-page-actions .ai-pill').catch(() => {});
await settle(300);
const menuItems = await page.locator('[data-action="ai-pill-task"]').allTextContents().catch(() => []);
ok(menuItems.length === 0 || menuItems.some((t) => /Enhance tags with AI/.test(t)), 'the tags task is "Enhance tags with AI" (menu opens only on a plan)', menuItems);

ok(aiHosts.length === 0, 'ZERO requests reached an AI host', aiHosts);
ok(errors.length === 0, 'no page errors', errors);

await browser.close();
server.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
