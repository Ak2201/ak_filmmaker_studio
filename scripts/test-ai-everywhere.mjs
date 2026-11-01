#!/usr/bin/env node
/* The ten "AI everywhere" Desk tasks, checked as a SET, in Node, no browser
   (docs/AI-EVERYWHERE.md). Each lane's own test (test-ai-preprod / post /
   story) covers its pure model: schemas, facts, id filtering, blanks-only
   merges, undo guards. This file checks what only the whole set can show:
   every documented task is registered once with the shape the Desk reads, the
   read-only ones carry no apply, the writers do, no id is lost or renamed,
   nothing a task file does can bypass the models (no storage, no ?key=), and
   every task has a pill on its page. */
import { mem } from './node-seams.mjs';
void mem;
import { readFileSync } from 'node:fs';

let fail = 0, pass = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* id -> [kind, writes?, page file that mounts its pill] — from the spec. */
const SPEC = {
  'shoot-order':      ['list', true,  'src/pages/stripboard.js'],
  'recce-notes':      ['list', true,  'src/pages/plan.js'],
  'budget-estimate':  ['list', true,  'src/ui/budget.js'],
  'callsheet-notes':  ['text', true,  'src/pages/contacts.js'],
  'draft-changes':    ['read', false, 'src/pages/drafts.js'],
  'day-wrap-summary': ['read', false, 'src/pages/shoot.js'],
  'edit-notes':       ['list', true,  'src/pages/edit.js'],
  'cert-read':        ['read', false, 'src/pages/deliverables.js'],
  'character-arcs':   ['list', true,  'src/ui/story-bible.js'],
  'script-cleanup':   ['list', true,  'src/pages/screenplay.js']
};

const files = ['preprod', 'post', 'story'];
const tasks = [];
for (const lane of files) {
  let mod;
  try { mod = await import('../src/lib/ai-tasks-' + lane + '.js'); }
  catch (e) { ok(false, 'ai-tasks-' + lane + '.js loads in Node', e.message); continue; }
  tasks.push(...mod.TASKS);
}

console.log('registration');
const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
ok(tasks.length === 10 && Object.keys(byId).length === 10, 'ten tasks, ids unique', tasks.map((t) => t.id).join());
ok(Object.keys(SPEC).every((id) => byId[id]) && tasks.every((t) => SPEC[t.id]), 'the set equals the spec (no id missing, renamed or extra)');
const registry = read('src/lib/ai-tasks.js');
ok(/Preprod\.TASKS/.test(registry) && /Post\.TASKS/.test(registry) && /Story\.TASKS/.test(registry), 'ai-tasks.js registers all three lanes');
ok(/\.load\(\)/.test(registry) || /load\b/.test(registry), 'registerAll awaits the lanes\' load()');

console.log('shape');
for (const [id, [kind, writes]] of Object.entries(SPEC)) {
  const t = byId[id];
  if (!t) continue;
  ok(t.kind === kind, id + ': kind ' + kind, t.kind);
  ok(typeof t.input === 'function' && typeof t.run === 'function', id + ': input() and run()');
  ok(writes ? typeof t.apply === 'function' : !t.apply, id + (writes ? ': has apply()' : ': read-only, no apply (writes nothing)'));
  ok(typeof t.label === 'string' && t.label.length > 0, id + ': has a label');
  ok(t.editable !== true || kind === 'text' || kind === 'list', id + ': editable only where the input is the prompt');
}

console.log('source rules');
for (const lane of files) {
  for (const f of ['src/lib/ai-tasks-' + lane + '.js', 'src/lib/ai-' + lane + '-model.js']) {
    const s = read(f);
    ok(!/\blocalStorage\b|\bsessionStorage\b/.test(s), f + ': no storage call (writes go through the owning model)');
    ok(!/[?&]key=/.test(s), f + ': no key on a URL');
    ok(!/\bdocument\b|\bwindow\b/.test(s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), f + ': no document/window in src/lib');
    ok(!/\b(confirm|alert|prompt)\(/.test(s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), f + ': no native dialog');
  }
}
const kit = read('src/lib/ai-task-kit.js');
ok(/refineText/.test(kit), 'the kit supplies refineText (same schema on refine)');
for (const lane of files) {
  const s = read('src/lib/ai-tasks-' + lane + '.js');
  ok(/refineText/.test(s), 'ai-tasks-' + lane + '.js: refine goes through refineText (system prompt and schema unchanged)');
}

console.log('pills');
for (const [id, [, , page]] of Object.entries(SPEC)) {
  const s = read(page);
  ok(new RegExp('aiPill\\b[\\s\\S]{0,1500}' + id.replace(/-/g, '\\-')).test(s) || s.includes("'" + id + "'"), id + ': a pill on ' + page);
  ok(/ai-pill\.js/.test(s) && !/from '[^']*\/ai\.js'/.test(s), page + ': imports only the light ai-pill.js, not ai.js (test:ai-lazy)');
}
const desk = read('src/ui/ai-desk.js');
ok(/Copy/.test(desk), 'the Desk\'s read panel has a Copy button');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
