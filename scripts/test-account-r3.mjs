/* Account & business, round 3: the pure parts. Runs in Node, no browser.
   - commitMain's focus spot (a redraw that replaces a button keeps focus)
   - errorSentence for supabase-js's dropped-connection words
   - the health model against a reply with missing slots
   - the cloud-delete report when the read itself failed */
import { register } from 'node:module';
import { parseHTML } from 'linkedom';
/* settings-model reaches store.js, which pulls a stylesheet and Vite-style JSON: stub .css, read .json. */
register('data:text/javascript,' + encodeURIComponent(
  "export async function load(u,c,n){ if(u.endsWith('.css')) return {format:'module',source:'export default {}',shortCircuit:true}; if(u.endsWith('.json')){ const t=(await import('node:fs/promises')).readFile(new URL(u)); return {format:'module',source:'export default '+(await t),shortCircuit:true}; } return n(u,c); }"));
const { document, window } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
globalThis.document = document; globalThis.window = window; globalThis.location = { pathname: '/', href: 'http://x/', search: '', hash: '', origin: 'http://x' }; window.location = globalThis.location;
class Storage { constructor() { this.m = new Map(); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } key(i) { return [...this.m.keys()][i] ?? null; } get length() { return this.m.size; } clear() { this.m.clear(); } }
globalThis.Storage = Storage; globalThis.localStorage = new Storage(); globalThis.sessionStorage = new Storage();
const { errorSentence } = await import('../src/lib/gate.js');
const { launchSteps, slotMsg } = await import('../src/lib/admin-health-model.js');
const { cloudDeleteReport } = await import('../src/lib/settings-model.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

/* focus spot, against a linkedom page */
const { focusSpot, restoreFocusSpot, focusKey } = await import('../src/lib/dom.js');
/* linkedom has no focus model: a minimal one. */
let cur = document.body;
Object.defineProperty(document, 'activeElement', { get: () => cur, configurable: true });
window.HTMLElement.prototype.focus = function () { cur = this; };
const app = document.getElementById('app');
const draw = (on, busy) => {
  app.innerHTML = '<main>' + ['A', 'B', 'C'].map((v) =>
    `<button role="radio" data-choice="${v}" aria-checked="${v === on}">${v} ${busy ? '…' : ''}</button>`).join('')
    + '<button data-act="x">Go</button><button data-act="x">Go</button></main>';
};
draw('A');
const second = app.querySelectorAll('[data-act="x"]')[1];
second.focus();
const spot = focusSpot(app, second);
ok(spot && spot.at === 1, 'the second of two identical buttons is remembered as the second');
draw('A', true);
ok(restoreFocusSpot(app, spot) && document.activeElement === app.querySelectorAll('[data-act="x"]')[1], 'focus returns to the same button after a redraw');
const radioB = app.querySelector('[data-choice="B"]');
radioB.focus();
const rs = focusSpot(app, radioB);
draw('B');
restoreFocusSpot(app, rs);
ok(document.activeElement && document.activeElement.dataset.choice === 'B', 'a radio keeps focus when its checked state and text change');
ok(focusKey(app.querySelector('[data-choice="A"]')) !== focusKey(app.querySelector('[data-choice="B"]')), 'different options have different keys');

/* the words of a dropped connection */
const net = 'The studio could not reach its server. Check the connection and try again.';
ok(errorSentence(new Error('Failed to send a request to the Edge Function'), 'x') === net, 'FunctionsFetchError reads as the plain sentence');
ok(errorSentence(new Error('TypeError: Failed to fetch'), 'x') === net, 'a raw fetch failure reads as the plain sentence');
ok(errorSentence(new Error('Edge Function returned a non-2xx status code'), 'fb') === 'fb', 'non-2xx still gives the fallback');

/* a health reply with no payments / refunds / wall slot */
let steps = null, threw = null;
try { steps = launchSteps({ checks: [] }, { phase: 'idle', res: {} }, 'LIVE'); } catch (e) { threw = e; }
ok(!threw, 'launchSteps does not throw on a missing slot: ' + (threw && threw.message));
ok(steps && steps.filter((s) => s.state === 'skip').length >= 3, 'the missing slots read as unknown');
ok(/Unknown/.test(slotMsg(undefined)), 'slotMsg tolerates nothing');

/* cloud-delete report */
const r = cloudDeleteReport({ ok: false, deleted: 0, failed: [], readError: 'statement timeout' });
ok(/Could not read/.test(r.title) && /statement timeout/.test(r.body) && /Nothing was deleted/.test(r.body) && !/failed/.test(r.body), 'a failed read says so, with its reason');
ok(/No cloud projects/.test(cloudDeleteReport({ ok: true, deleted: 0, failed: [] }).title), 'zero projects is not "Deleted 0"');
ok(/1 failed/.test(cloudDeleteReport({ ok: false, deleted: 1, failed: [{ id: 'a', error: 'e' }] }).body), 'a real failure is still counted');

/* the console's Refresh button names a glyph the icon subset must carry */
const { readFileSync } = await import('node:fs');
ok(JSON.parse(readFileSync(new URL('../src/data/section-icons.json', import.meta.url))).icons.includes('refresh'), 'section-icons.json lists "refresh"');

console.log(fail ? `\n✗ ${fail} failed` : `✓ all ${pass} account-r3 checks pass`);
process.exit(fail ? 1 : 0);
