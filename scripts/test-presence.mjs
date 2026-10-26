/* ============================================================
   TEST — co-writing presence (src/lib/presence.js), in Node.
   Names from a Supabase user, initials, one row per person however
   many tabs, yourself left out, "editing" judged on this machine's
   clock and only within the window, the warning sentence.
   ============================================================ */
const P = await import('../src/lib/presence.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

// names
eq(P.displayNameOf({ user_metadata: { full_name: 'Meera Nair' }, email: 'm@x.in' }), 'Meera Nair', 'full name first');
eq(P.displayNameOf({ user_metadata: { name: 'Ravi' } }), 'Ravi', 'then name');
eq(P.displayNameOf({ email: 'arun.k@example.com' }), 'arun.k', 'then the e-mail before the @');
eq(P.displayNameOf(null), 'A collaborator', 'nothing known');
eq(P.initials('Cal Collab'), 'CC', 'two words');
eq(P.initials('meera'), 'M', 'one word');
eq(P.initials('Anna Maria de Souza'), 'AS', 'first and last');
eq(P.initials(''), '?', 'no name');

// people
const raw = {
  me: [{ name: 'Me', elId: 'e1', editing: true, at: 10 }],
  cal: [{ name: 'Cal', elId: 'e2', editing: false, at: 5 }, { name: 'Cal', elId: 'e9', editing: true, at: 20 }],
  ann: [{ name: 'Ann', elId: 'e3', editing: true, at: 7 }],
  ghost: []
};
const now = 100000;
let people = P.presencePeople(raw, 'me', { cal: now - 1000, ann: now - 60000 }, now);
eq(people.map((p) => p.key), ['ann', 'cal'], 'yourself and empty entries left out, sorted by name');
eq(people.find((p) => p.key === 'cal').elId, 'e9', 'several tabs: the most recent speaks');
ok(people.find((p) => p.key === 'cal').editing, 'seen typing a second ago: editing');
ok(!people.find((p) => p.key === 'ann').editing, 'seen a minute ago: no longer editing, whatever it says');
ok(!P.presencePeople({ x: [{ name: 'X', editing: true, at: 1 }] }, 'me', {}, now)[0].editing, 'never seen to change: not editing');

// caret offsets
eq(P.presencePeople({ x: [{ name: 'X', elId: 'e1', pos: 7, at: 1 }] }, 'me', {}, now)[0].pos, 7, 'a caret offset is carried');
eq(P.presencePeople({ x: [{ name: 'X', elId: 'e1', pos: -1, at: 1 }] }, 'me', {}, now)[0].pos, null, 'a bad one reads as unknown');
eq(P.presencePeople({ x: [{ name: 'X', elId: 'e1', at: 1 }] }, 'me', {}, now)[0].pos, null, 'an older page that sends none: unknown');

// noteSeen
let st = P.noteSeen(raw, {}, {}, 500);
eq(st.seen, { me: 500, cal: 500, ann: 500 }, 'first look stamps everyone with an edit time');
st = P.noteSeen({ ...raw, cal: [{ name: 'Cal', at: 20 }] }, st.at, st.seen, 900);
eq(st.seen.cal, 500, 'an unchanged stamp keeps the old sighting');
st = P.noteSeen({ cal: [{ name: 'Cal', at: 21 }] }, st.at, st.seen, 1200);
eq(st.seen, { cal: 1200 }, 'a moved stamp is seen now; people who left are dropped');

// warning
eq(P.editingWarning([{ name: 'Cal', editing: true }, { name: 'Ann', editing: false }]),
  'Cal is writing in this script now. Saves replace each other, so agree who writes, or take turns.', 'one person');
ok(/^Ann and Cal are writing/.test(P.editingWarning([{ name: 'Ann', editing: true }, { name: 'Cal', editing: true }])), 'two people');
ok(/^A, B and C are/.test(P.editingWarning(['A', 'B', 'C'].map((name) => ({ name, editing: true })))), 'three people');
eq(P.editingWarning([]), '', 'nobody: no warning');
// co-editing on (§49): saves merge, so the warning must not say they replace each other
ok(!/replace each other|take turns/.test(P.editingWarning([{ name: 'Cal', editing: true }], true)), 'co-edit: no take-turns advice');
ok(/merge line by line/.test(P.editingWarning([{ name: 'Cal', editing: true }], true)), 'co-edit: says saves merge');

/* One channel carries both pages: a Story tab is not in the script, and the reverse. */
{
  const raw = {
    me: [{ name: 'Me', at: 1 }],
    cal: [{ name: 'Cal', elId: 'e1', at: 5 }, { name: 'Cal', page: 'story', step: 's2', editing: true, at: 9 }],
    ann: [{ name: 'Ann', page: 'story', step: '', at: 3 }],
    old: [{ name: 'Old build', elId: 'e2', at: 2 }]
  };
  const seen = { cal: Date.now() };
  eq(P.presencePeople(raw, 'me', seen, Date.now(), 'script').map((p) => [p.name, p.elId]), [['Cal', 'e1'], ['Old build', 'e2']],
    'the script counts only script tabs (a tab that names no page is the script)');
  const story = P.presencePeople(raw, 'me', seen, Date.now(), 'story');
  eq(story.map((p) => [p.name, p.step, p.editing]), [['Ann', '', false], ['Cal', 's2', true]], 'the Story page counts only Story tabs, with their step');
  eq(P.presencePeople(raw, 'me', seen, Date.now()).length, 3, 'no page given: every tab, as before');
  eq(P.storyPresenceLine(story, (id) => (id === 's2' ? 3 : 0)), 'Also here: Ann, Cal (editing step 3).', 'the Story line names the step by this page\'s number');
  eq(P.storyPresenceLine([{ name: 'Cal', step: 'gone', editing: false }], () => 0), 'Also here: Cal.', 'a step this page does not have is not named');
  eq(P.storyPresenceLine([{ name: 'Cal', step: 's1', editing: false }], () => 1), 'Also here: Cal (on step 1).', 'on a step, not typing');
  eq(P.storyPresenceLine([], () => 0), '', 'nobody: no line');
}

console.log((fail ? '✗' : '✓') + ' test-presence: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
