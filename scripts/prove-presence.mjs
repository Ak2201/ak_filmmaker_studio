/* ============================================================
   PROOF: co-writing presence on the Screenplay Writer
   (src/ui/presence.js over src/lib/presence.js).
   ------------------------------------------------------------
   WHAT THIS CANNOT PROVE: that Supabase Realtime carries the channel,
   or that schema §48's policies admit the right people on the live
   project. The channel is FAKED here (window.StudioCloud.joinPresence
   is replaced as cloud.js assigns it); §48 is checked on PostgreSQL by
   test:schema. A live check needs two signed-in accounts.

   Asserted:
     1  signed out: nothing shows
     2  signed in: it joins this project's channel; alone, nothing shows;
        it says who you are
     3  a second person: initials in the bar, a named mark on their line
     4  they type: the warning; the mark follows their line
     5  this page sends which line and whether it types, throttled, and
        never the words
     6  they leave: strip, warning and marks go; nothing was stored
     7  more than three: +N; no horizontal overflow at 390; no page errors

       npm run build:open && npm run prove:presence
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5375;
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
/* The fake: wrap window.StudioCloud as cloud.js assigns it, so the page's
   presence code meets a signed-in session and a joinPresence() whose
   channel this proof drives (window.__pr.sync) and listens to
   (window.__pr.sent). Nothing reaches Supabase. */
await ctx.addInitScript(() => {
  window.__writes = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__writes.push(k); return set.call(this, k, v); };
  window.__pr = { sent: [], joined: [], left: 0, sync: null };
  let real;
  Object.defineProperty(window, 'StudioCloud', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = v;
      const q = new URLSearchParams(location.search);
      if (q.has('coedit')) v.coEditingEnabled = async () => true;
      if (!q.has('presence')) return;
      v.isBooted = () => true;
      v.getSession = () => ({ access_token: 'x', user: { id: 'me-1', email: 'pia@example.com', user_metadata: { full_name: 'Pia Owner' } } });
      v.joinPresence = async (pid, onSync) => {
        window.__pr.joined.push(pid);
        window.__pr.sync = (state) => onSync(state, 'me-1');
        return { track: (m) => window.__pr.sent.push({ ...m, t: Date.now() }), leave: () => { window.__pr.left++; } };
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
  const p = S.createProject({ title: 'Proof Presence', format: 'feature' });
  S.setCurrentProject(p.id);
  localStorage.setItem('fms_script_v1', JSON.stringify({ elements: [
    { id: 'e1', type: 'scene', text: 'INT. FLAT - NIGHT' }, { id: 'e2', type: 'action', text: 'Ravi paces.' },
    { id: 'e3', type: 'character', text: 'RAVI' }, { id: 'e4', type: 'dialogue', text: 'Not tonight.' }] }));
  return p.id;
});

/* 1 alone, or signed out: nothing shows */
await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
ok(await page.$eval('#scPeers', (n) => n.hidden), '1  signed out: the presence strip is hidden');
ok(await page.$eval('#scPeerWarn', (n) => n.hidden), '1  and there is no warning');

await page.goto(url('screenplay.html?presence=1'), { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__pr && window.__pr.sync, null, { timeout: 5000 });
ok((await page.evaluate(() => window.__pr.joined)).join() === pid, '2  signed in: it joins this project\'s channel');
ok(await page.$eval('#scPeers', (n) => n.hidden), '2  alone in the script: still nothing shows');
const first = await page.evaluate(() => window.__pr.sent[0] || null);
ok(first && first.name === 'Pia Owner' && first.editing === false, '2  it says who you are, not typing', first);

/* 3 someone else arrives */
await page.evaluate(() => window.__pr.sync({
  'me-1': [{ name: 'Pia Owner', elId: '', editing: false, at: 0 }],
  'cal-2': [{ name: 'Cal Collab', elId: 'e3', editing: false, at: 0 }]
}));
await page.waitForTimeout(100);
const strip = await page.$eval('#scPeers', (n) => ({ hidden: n.hidden, text: n.textContent, label: n.getAttribute('aria-label') }));
ok(!strip.hidden && strip.text === 'CC' && /Cal Collab/.test(strip.label), '3  a second person shows as initials, named for a screen reader', strip);
const mark = await page.$eval('[data-el="e3"]', (r) => ({ cls: r.classList.contains('sc-peer-row'), who: r.dataset.peer }));
ok(mark.cls && mark.who === 'Cal Collab', '3  the line they are on is marked with their name', mark);
ok(await page.$eval('#scPeerWarn', (n) => n.hidden), '3  not typing: no warning');

/* 4 they type */
await page.evaluate(() => window.__pr.sync({
  'me-1': [{ name: 'Pia Owner', elId: '', editing: false, at: 0 }],
  'cal-2': [{ name: 'Cal Collab', elId: 'e4', editing: true, at: 12345 }]
}));
await page.waitForTimeout(100);
const warn = await page.$eval('#scPeerWarn', (n) => ({ hidden: n.hidden, text: n.textContent }));
ok(!warn.hidden && /^Cal Collab is writing in this script now/.test(warn.text), '4  their typing raises the warning', warn);
if (process.env.PROVE_SHOTS) await page.screenshot({ path: process.env.PROVE_SHOTS + '/presence-1280.png' });
ok(await page.$eval('[data-el="e4"]', (r) => r.classList.contains('sc-peer-row')) && !(await page.$eval('[data-el="e3"]', (r) => r.classList.contains('sc-peer-row'))),
  '4  the mark follows them to their new line');

/* 5 what this page sends, throttled */
const before = await page.evaluate(() => window.__pr.sent.length);
await page.focus('[data-el="e2"] .wr-text');
await page.keyboard.press('End');
await page.keyboard.type(' He stops.', { delay: 30 });
await page.waitForTimeout(2600);
const sent = await page.evaluate((n) => window.__pr.sent.slice(n), before);
ok(sent.length >= 1 && sent.length <= 3, '5  a burst of typing is at most a few messages, not one per key', sent.length);
const last = sent[sent.length - 1] || {};
ok(last.elId === 'e2' && last.editing === true, '5  and says which line, and typing', last);
ok(!sent.some((m) => 'text' in m || JSON.stringify(m).includes('He stops')), '5  the words themselves are never sent');

/* 5b carets, at the character */
await page.evaluate(() => window.__pr.sync({
  'me-1': [{ name: 'Pia Owner', elId: 'e2', editing: false, at: 0 }],
  'cal-2': [{ name: 'Cal Collab', elId: 'e2', pos: 0, editing: false, at: 0 }]
}));
await page.waitForTimeout(150);
const c0 = await page.$eval('[data-el="e2"] .sc-peer-caret', (c) => ({ left: c.offsetLeft, name: c.textContent })).catch(() => null);
await page.evaluate(() => window.__pr.sync({
  'me-1': [{ name: 'Pia Owner', elId: 'e2', editing: false, at: 0 }],
  'cal-2': [{ name: 'Cal Collab', elId: 'e2', pos: 4, editing: false, at: 0 }]
}));
await page.waitForTimeout(150);
const c4 = await page.$eval('[data-el="e2"] .sc-peer-caret', (c) => c.offsetLeft).catch(() => null);
const charW = await page.$eval('[data-el="e2"] .wr-text', (t) => { const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(t).font; return c.measureText('Ravi').width; });
ok(c0 && c0.name === 'Cal', '5b the other writer\'s caret is drawn in their line, named', c0);
ok(c0 && c4 != null && Math.abs((c4 - c0.left) - charW) <= 3, '5b and moves to the character: four characters on is four characters\' width', { c0: c0 && c0.left, c4, charW });
const sentPos = await page.evaluate(() => window.__pr.sent.filter((m) => m.pos != null).length);
ok(sentPos >= 1, '5b this page sends its own caret offset', sentPos);
if (process.env.PROVE_SHOTS) await page.screenshot({ path: process.env.PROVE_SHOTS + '/caret-1280.png', clip: { x: 260, y: 380, width: 820, height: 260 } });
await page.evaluate(() => { const t = document.querySelector('[data-el="e1"] .wr-text'); t.focus(); t.value = t.value + ' '; t.dispatchEvent(new Event('input', { bubbles: true })); });
await page.waitForTimeout(400);
ok(await page.$$eval('[data-el="e2"] .sc-peer-caret', (c) => c.length) === 1, '5b a page redraw keeps the caret (exactly one)');

/* 6 they leave */
await page.evaluate(() => window.__pr.sync({ 'me-1': [{ name: 'Pia Owner', elId: 'e2', editing: true, at: 1 }] }));
await page.waitForTimeout(100);
ok(await page.$eval('#scPeers', (n) => n.hidden) && await page.$eval('#scPeerWarn', (n) => n.hidden), '6  when they leave, the strip and the warning go');
ok(await page.$$eval('.sc-peer-row', (r) => r.length) === 0, '6  and the marks are cleared');
const presenceWrites = await page.evaluate(() => window.__writes.filter((k) => /presence|peer/i.test(k)).length);
ok(presenceWrites === 0, '6  presence wrote nothing to storage');

/* 8 co-editing ON: an arrival is merged into the open script, line by line */
await page.goto(url('screenplay.html?coedit=1'), { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const arrive = (fn) => page.evaluate((src) => {
  const S = window.StudioStore;
  const pid = S.currentProjectId();
  const k = 'fms_script_v1__' + pid;
  const b = JSON.parse(S.rawGet(k));
  (new Function('b', src))(b);
  S.rawSet(k, JSON.stringify(b));
  S.notify('cloud:synced', { projectId: pid, scope: 'script' });
}, fn);
const stored = async () => (await page.evaluate(() => {
  const S = window.StudioStore;
  return JSON.parse(S.rawGet('fms_script_v1__' + S.currentProjectId()));
})).elements.map((e) => e.text);
// The writer is mid-edit on line 2 (unsaved) when the other writer's copy arrives with line 4 changed.
await page.focus('[data-el="e2"] .wr-text');
await page.keyboard.press('End');
await page.keyboard.type(' He stops at the window.');
await arrive("b.elements = b.elements.map((e) => e.id === 'e4' ? { ...e, text: 'Not tonight, Meera.', u: Date.now() } : e);");
await page.waitForTimeout(900);
let lines = await stored();
ok(lines.some((t) => /He stops at the window\.$/.test(t)) && lines.includes('Not tonight, Meera.'), '8  co-editing: the unsaved edit here AND the arrival\'s edit both survive', lines);
const caretOk = await page.evaluate(() => { const a = document.activeElement; return !!a && a.matches('.wr-text') && a.closest('[data-el]').dataset.el === 'e2' && a.selectionStart === a.value.length; });
ok(caretOk, '8  and the caret stays where the writer was typing');
// The other writer cuts line 3 (the cue); nothing here touched it since.
await page.waitForTimeout(1200);
await arrive("b.elements = b.elements.filter((e) => e.id !== 'e3');");
await page.waitForTimeout(900);
lines = await stored();
ok(!lines.includes('RAVI') && lines.includes('Not tonight, Meera.'), '8  a line the other writer cut is gone, the rest kept', lines);
ok(!(await page.isVisible('.toast:has-text("Use theirs")')), '8  no "Use theirs" draft offer: nothing needed keeping');

/* 7 phone width */
const phone = await ctx.newPage();
phone.on('pageerror', (e) => errors.push(e.message));
await phone.setViewportSize({ width: 390, height: 860 });
await phone.goto(url('screenplay.html?presence=1'), { waitUntil: 'networkidle' });
await phone.waitForFunction(() => window.__pr && window.__pr.sync, null, { timeout: 5000 });
await phone.evaluate(() => window.__pr.sync({
  'me-1': [{ name: 'Pia Owner', at: 0 }],
  'cal-2': [{ name: 'Cal Collab', elId: 'e1', editing: true, at: 5 }], 'ann-3': [{ name: 'Ann', elId: 'e2', at: 0 }],
  'bo-4': [{ name: 'Bo', at: 0 }], 'di-5': [{ name: 'Di', at: 0 }]
}));
await phone.waitForTimeout(200);
ok((await phone.$eval('#scPeers', (n) => n.textContent)).endsWith('+1'), '7  more than three people: three faces and +1');
const over = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 0, '7  no horizontal overflow at 390 with people and the warning', over);
ok(errors.length === 0, '7  no page errors', errors.slice(0, 5));

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nprove:presence: all passed');
console.log('(Realtime was FAKED: this proves the page, not that Supabase answers. Schema §48 is checked by test:schema.)');
process.exit(failed ? 1 : 0);
