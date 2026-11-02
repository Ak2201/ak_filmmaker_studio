/* ============================================================
   PROOF: the Screenplay Writer's helpers (wave 2, L5)
   ------------------------------------------------------------
   Macros on Alt+Shift+digit (one undo step each), Check names (one
   undo step for Fix every instance), the Read aloud panel against a
   FAKE speechSynthesis (the lines it speaks, who speaks them, the line
   marked, pause and stop), and Dictation against a FAKE recogniser (off
   until the notice is accepted; "Preethi says hello" and a spoken "new
   line" become elements through the typed route).

       npm run build:open && npm run prove:helpers
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5372;
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
const ctx = await browser.newContext({ serviceWorkers: 'block', locale: 'en-IN', viewport: { width: 1280, height: 900 } });
/* Fakes: a synthesiser that records what it is asked to say and finishes each
   utterance after a tick, and a recogniser the proof drives by hand. */
await ctx.addInitScript(() => {
  window.__spoken = [];
  window.__paused = 0;
  const voices = [
    { voiceURI: 'v:priya', name: 'Priya', lang: 'en-IN' },
    { voiceURI: 'v:alex', name: 'Alex', lang: 'en-US' },
    { voiceURI: 'v:daniel', name: 'Daniel', lang: 'en-GB' },
    { voiceURI: 'v:karen', name: 'Karen', lang: 'en-AU' }
  ];
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.voice = null; this.rate = 1; };
  let timer = 0;
  window.__hold = false;
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    getVoices: () => voices,
    addEventListener() {},
    speak(u) {
      window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, marked: (document.querySelector('.sc-reading .wr-text') || {}).value || '' });
      if (window.__hold) return;
      timer = setTimeout(() => u.onend && u.onend({}), 20);
    },
    cancel() { clearTimeout(timer); },
    pause() { window.__paused++; window.__hold = true; },
    resume() { window.__hold = false; }
  } });
  window.__recs = [];
  /* Newer Chromium has the unprefixed one too, and the page prefers it. */
  window.SpeechRecognition = window.webkitSpeechRecognition = function () {
    window.__recs.push(this);
    this.start = () => { this.on = true; };
    this.stop = () => { this.on = false; };
  };
  window.__say = (rec, text) => rec.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message)); 
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload/.test(m.text())) errors.push('console: ' + m.text()); });

const url = (p) => `http://localhost:${PORT}/${p}`;
const doc = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const lines = async () => ((await doc()) || { elements: [] }).elements.map((e) => e.type + ':' + e.text);
const settle = (ms = 1200) => page.waitForTimeout(ms);
const prefs = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}'));

await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Proof Helpers', format: 'feature' });
  S.setCurrentProject(p.id);
  const els = [
    ['scene', 'INT. KITCHEN - DAY'], ['action', 'Preethi stirs the pot.'],
    ['character', 'PREETHI'], ['paren', '(whispering)'], ['dialogue', 'He is late again.'],
    ['character', 'RAVI'], ['dialogue', 'I know.'],
    ['character', 'PREETHI'], ['dialogue', 'Preethy, said nobody.'],
    ['character', 'PREETHI'], ['dialogue', 'Fine.'],
    ['character', 'PREETHI'], ['dialogue', 'Fine.'],
    ['character', 'PREETHI'], ['dialogue', 'Fine.'],
    ['action', 'Preethy sighs.'], ['action', '']
  ].map(([type, text], i) => ({ id: 'e' + i, type, text }));
  localStorage.setItem('fms_script_v1__' + p.id, JSON.stringify({ elements: els }));
});
await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
const focusLine = async (i) => { await page.click(`#wr-page [data-el="e${i}"] .wr-text`); };

/* ---- 1 macros -------------------------------------------------------- */
await focusLine(0);
await page.keyboard.press('End');
await page.keyboard.press('Alt+Shift+2');   // CONTINUOUS replaces the time of day
await settle();
ok((await lines())[0] === 'scene:INT. KITCHEN - CONTINUOUS', '1  Alt+Shift+2 puts CONTINUOUS on the heading', (await lines())[0]);
await page.keyboard.press('Control+z');
await settle(300);
ok((await lines())[0] === 'scene:INT. KITCHEN - DAY', '1  one Ctrl+Z undoes the macro', (await lines())[0]);

await focusLine(4);
await page.keyboard.press('Alt+Shift+1');   // (beat) as a new parenthetical after the speech
await settle();
let L = await lines();
ok(L[5] === 'paren:(beat)', '1  Alt+Shift+1 inserts (beat) as a parenthetical after the line', L.slice(3, 7));
await page.keyboard.press('Control+z');
await settle(300);
L = await lines();
ok(L.length === 17 && L[5] === 'character:RAVI', '1  one Ctrl+Z removes the new element', L.length);
ok(await page.$eval('#wr-page [data-el="e0"] .wr-text', (t) => t.spellcheck === false), '1  a heading is not spell-checked');
ok(await page.$eval('#wr-page [data-el="e1"] .wr-text', (t) => t.spellcheck === true), '1  action keeps spell-check');

/* a macro edited in Settings is live without a reload */
await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}');
  p.macros = [{ slot: 1, label: 'Sigh', text: 'She sighs.', where: 'new', type: 'action' }];
  localStorage.setItem('fms_studio_prefs_v1', JSON.stringify(p));
});
await focusLine(1);
await page.keyboard.press('Alt+Shift+1');
await settle();
L = await lines();
ok(L[2] === 'action:She sighs.', '1  an edited macro runs at the next press', L.slice(1, 4));
await page.keyboard.press('Control+z');
await settle(300);
await page.keyboard.press('Alt+Shift+4');   // no longer in the list: nothing happens
await settle(300);
ok((await lines()).length === 17, '1  a slot the list no longer has does nothing');

/* ---- 2 Check names ---------------------------------------------------- */
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}'); delete p.macros; localStorage.setItem('fms_studio_prefs_v1', JSON.stringify(p)); });
const opener = await page.$('[data-action="sc-names"]');
ok(!!opener, '2  Check names is in the Tools menu');
await page.evaluate(() => document.querySelector('[data-action="sc-names"]').click());
await page.waitForSelector('.sc-names-row', { timeout: 5000 }).catch(() => {});
const rowTxt = await page.$eval('.sc-names-row', (r) => r.textContent).catch(() => '');
ok(/preethy/i.test(rowTxt) && /Preethi/.test(rowTxt), '2  the sheet suggests preethy to Preethi', rowTxt);
await page.click('[data-nc-fix="preethy"]');
await settle(500);
L = await lines();
ok(L[8] === 'dialogue:Preethi, said nobody.' && L[15] === 'action:Preethi sighs.', '2  Fix every instance corrects every line', [L[8], L[15]]);
await page.evaluate(() => { const b = document.querySelector('.mn-sheet-close, [data-mn-close], [aria-label="Close"]'); if (b) b.click(); });
await page.keyboard.press('Escape');
await settle(300);
await focusLine(2);
await page.keyboard.press('Control+z');
await settle(400);
L = await lines();
ok(L[8] === 'dialogue:Preethy, said nobody.' && L[15] === 'action:Preethy sighs.', '2  one Ctrl+Z undoes the whole fix', [L[8], L[15]]);

/* ---- 3 Read aloud ------------------------------------------------------ */
await page.evaluate(() => document.querySelector('[data-action="sc-read"]').click());
await page.waitForSelector('#scRead:not([hidden])', { timeout: 5000 });
await focusLine(0);
await page.click('[data-action="ra-play"]');
await page.waitForFunction(() => window.__spoken.length >= 6, null, { timeout: 8000 });
const spoken = await page.evaluate(() => window.__spoken);
ok(spoken[0].text === 'INT. KITCHEN - DAY' && spoken[0].voice === 'Priya', '3  the narrator reads the heading', spoken[0]);
const byText = Object.fromEntries(spoken.map((s) => [s.text, s]));
ok(byText['He is late again.'] && byText['I know.'] && byText['He is late again.'].voice !== byText['I know.'].voice, '3  two characters get two voices', [byText['He is late again.'], byText['I know.']]);
ok(byText['He is late again.'].voice !== 'Priya', '3  a character is not the narrator', byText['He is late again.']);
ok(spoken.some((s) => s.text === 'whispering'), '3  a parenthetical is read');
ok(spoken.every((s) => s.text !== 'PREETHI'), '3  cues are not read');
ok(spoken.find((s) => s.text === 'Preethi stirs the pot.').marked === 'Preethi stirs the pot.', '3  the line being read is marked on the page', spoken[1]);
await page.waitForFunction(() => !document.querySelector('.sc-reading'), null, { timeout: 8000 });
ok(await page.$eval('.sc-ra-status', (n) => n.textContent) === 'Finished.', '3  it finishes by itself and clears the mark');
ok(!('readAloud' in (await prefs())), '3  reading wrote nothing to storage');
await page.check('#scRaSkip');
await page.selectOption('#scRaRate', '1.2');
const pf = (await prefs()).readAloud;
ok(pf && pf.skipParens === true && pf.rate === 1.2, '3  options are kept in fms_studio_prefs_v1', pf);
await page.evaluate(() => { window.__spoken.length = 0; });
await focusLine(4);
await page.click('[data-action="ra-play"]');
await page.waitForFunction(() => window.__spoken.length >= 1, null, { timeout: 5000 });
ok((await page.evaluate(() => window.__spoken))[0].text === 'He is late again.', '3  Play from here starts at the caret line');
await page.waitForFunction(() => !document.querySelector('.sc-reading'), null, { timeout: 8000 });
await page.evaluate(() => { window.__spoken.length = 0; });
await focusLine(1);
await page.click('[data-action="ra-scene"]');
await page.waitForFunction(() => window.__spoken.length >= 2, null, { timeout: 5000 });
ok(!(await page.evaluate(() => window.__spoken)).some((s) => s.text === 'whispering'), '3  Skip parentheticals is honoured');
await page.waitForFunction(() => !document.querySelector('.sc-reading'), null, { timeout: 8000 });
await page.evaluate(() => { window.__hold = true; window.__spoken.length = 0; });
await focusLine(0);
await page.click('[data-action="ra-play"]');
await page.waitForFunction(() => window.__spoken.length === 1, null, { timeout: 5000 });
await page.click('[data-action="ra-pause"]');
ok(await page.evaluate(() => window.__paused) >= 1, '3  Pause pauses the synthesiser');
await page.click('[data-action="ra-stop"]');
await settle(200);
ok(!(await page.$('.sc-reading')), '3  Stop clears the marked line');
await page.click('[data-action="ra-close"]');

/* ---- 4 Dictation -------------------------------------------------------- */
await page.evaluate(() => { window.__hold = false; });
ok(!!(await page.$('[data-action="sc-dictate"]')), '4  Dictation is offered where the browser has a recogniser');
ok(!('dictation' in (await prefs())), '4  it is off until switched on');
await focusLine(16);
await page.evaluate(() => document.querySelector('[data-action="sc-dictate"]').click());
await page.waitForSelector('button:has-text("Turn on dictation")', { timeout: 5000 });
ok(/Google/.test(await page.evaluate(() => document.body.innerText)), '4  the first start asks, and says the audio goes to Google');
ok(await page.evaluate(() => window.__recs.length) === 0, '4  nothing listens before the answer');
await page.click('button:has-text("Turn on dictation")');
await page.waitForFunction(() => window.__recs.length === 1, null, { timeout: 5000 });
const dp = (await prefs()).dictation;
ok(dp && dp.on === true && dp.noticed === true, '4  the choice is kept', dp);
await page.evaluate(() => window.__say(window.__recs[0], 'Preethi says hello'));
await settle(600);
L = await lines();
ok(L.slice(-4, -1).join('|') === 'action:Preethy sighs.|character:PREETHI|dialogue:Hello' && L[L.length - 1] === 'action:', '4  "Preethi says hello" becomes a cue and a speech at the pause', L.slice(-4));
await page.evaluate(() => window.__say(window.__recs[0], 'you are late'));
await page.evaluate(() => window.__say(window.__recs[0], 'new line'));
await settle(600);
L = await lines();
ok(L[L.length - 2] === 'action:you are late' && L[L.length - 1] === 'action:', '4  a pause in plain prose keeps the line; "new line" ends it', L.slice(-3));
ok(await page.evaluate(() => window.__recs[0].on) === true, '4  the dictation follows the caret to the new line');
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');
await settle(300);

ok(errors.length === 0, 'no page errors', errors);
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
