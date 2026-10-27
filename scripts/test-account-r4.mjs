/* Account & business, round 4: the pure parts. Runs in Node, no browser.
   - the server's two code refusals read with the neighbours' punctuation,
     and the screening box points an invite code at the invite page
   - seats at their cap are not a warning (capState)
   - no Pro blurb says "No caps" beside a seat cap (seed and fake) */
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
const { openFailedSentence } = await import('../src/lib/screening-model.js');
const { capState } = await import('../src/ui/plan-cards.js');
const { readFileSync } = await import('node:fs');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

/* the invite box: the server's bare sentence gets a full stop and a next step */
const inv = errorSentence(new Error('That code is not valid'), 'x');
ok(/^That code is not valid\b.*\.$/.test(inv) && /try again/.test(inv), 'the invite refusal ends like its neighbours: ' + inv);
/* the screening box: an invite code is pointed at the invite page, on every refusal */
const sc = openFailedSentence(new Error('That screening pass is not valid'));
ok(/\.$/.test(sc) && /invite page/.test(sc), 'the screening refusal points an invite code at the invite page: ' + sc);
ok(errorSentence(new Error('That is a screening pass — open it in the screening room'), 'x') === 'That is a screening pass — open it in the screening room', 'the screening-pass-in-the-invite-box sentence is untouched');

/* seats at their cap */
ok(capState('seats', 1, 1) === 'seats', 'one seat of one is not a warning');
ok(capState('projects', 3, 3) === 'full', 'three films of three still warns');
ok(capState('seats', 0, 1) === null && capState('projects', 9, null) === null, 'under the cap, or no cap, says nothing');

/* the Pro blurb against its seat cap */
for (const f of ['../supabase/schema/supabase-schema.sql', 'fake-supabase.mjs']) {
  const t = readFileSync(new URL(f, import.meta.url), 'utf8');
  ok(!/'[^']*No caps[^']*'/.test(t), f + ' has no "No caps" blurb above a 10-seat cap');
}

console.log(fail ? `\n✗ ${fail} failed` : `✓ all ${pass} account-r4 checks pass`);
process.exit(fail ? 1 : 0);
