/* ============================================================
   TEST — a newer script arriving while the Screenplay Writer is open
   (src/lib/script-incoming.js), in Node. Same copy: nothing. Nothing
   unsaved: load it. Mid-edit: keep the writer's copy AND the arrival,
   as a draft. "Use theirs" keeps the writer's copy as a draft. No
   branch drops a line, and drafts from both sides survive once each.
   ============================================================ */
import './node-seams.mjs';
const I = await import('../src/lib/script-incoming.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };

const el = (id, text, type = 'action') => ({ id, type, text });
const mine = { elements: [el('a', 'INT. FLAT - NIGHT', 'scene'), el('b', 'Ravi paces.')], revisions: [{ id: 'r1', name: 'Draft 1', date: '2026-10-01', elements: [] }] };
const fresh = { elements: [el('a', 'INT. FLAT - NIGHT', 'scene'), el('b', 'Ravi paces. Meera knocks.')], revisions: [{ id: 'r1', name: 'Draft 1', date: '2026-10-01', elements: [] }, { id: 'r2', name: 'Draft 2', date: '2026-10-05', elements: [] }] };

ok(I.incomingAction({ mine, fresh: JSON.parse(JSON.stringify(mine)), dirty: true }) === 'same', 'an identical copy does nothing, even mid-edit');
ok(I.incomingAction({ mine, fresh: null, dirty: false }) === 'same', 'no copy, nothing to do');
ok(I.incomingAction({ mine, fresh, dirty: false }) === 'load', 'nothing unsaved: load the arrival');
ok(I.incomingAction({ mine, fresh, dirty: true }) === 'keepBoth', 'mid-edit: keep both');
ok(I.incomingAction({ mine: { elements: [el('z', '')] }, fresh, dirty: true }) === 'load', 'mid-edit on the one blank line: just load it');
ok(I.incomingAction({ mine, fresh: { ...mine, numbering: { locked: true, at: 'x', ids: {} } }, dirty: false }) === 'load', 'locked numbering arriving counts as a change');

const both = I.keepBoth(mine, fresh, 'From another device, 10:42');
ok(both.elements === mine.elements, 'keepBoth keeps the writer\'s lines on screen');
ok(both.revisions.map((r) => r.id).slice(0, 2).join() === 'r1,r2', 'and every draft from both sides, once each, in date order');
const kept = both.revisions[both.revisions.length - 1];
ok(kept.name === 'From another device, 10:42' && kept.elements.map((e) => e.text).join('|') === 'INT. FLAT - NIGHT|Ravi paces. Meera knocks.', 'the arrival is kept whole as a named draft');
ok(kept.elements.every((e) => e.liveId), 'the draft remembers which live lines it came from');
ok(mine.revisions.length === 1, 'the inputs are not modified');

const theirs = I.takeTheirs(both, fresh, 'Your version, 10:43');
ok(theirs.elements === fresh.elements, 'Use theirs puts the arrival on screen');
const mineDraft = theirs.revisions[theirs.revisions.length - 1];
ok(mineDraft.name === 'Your version, 10:43' && mineDraft.elements[1].text === 'Ravi paces.', 'and keeps the writer\'s copy as a draft');
ok(theirs.revisions.some((r) => r.name === 'From another device, 10:42'), 'the earlier draft of the arrival is still there');

ok(I.unionRevisions([{ id: 'x', date: '2' }], [{ id: 'x', date: '2' }, { id: 'y', date: '1' }]).map((r) => r.id).join() === 'y,x', 'union is by id and sorted by date');

// Two people typing at once: each arrival replaces this page's last
// arrival draft instead of adding a whole-script draft per save.
{
  const now = Date.parse(both.revisions[both.revisions.length - 1].date);
  const id = kept.id;
  const again = I.keepBoth(both, { ...fresh, elements: [el('a', 'INT. FLAT - DAY', 'scene')] }, 'From another device, 10:44', { replaceId: id, now: now + 60000 });
  ok(again.revisions.length === both.revisions.length, 'a second arrival within ten minutes replaces the arrival draft');
  const r = again.revisions.find((x) => x.id === id);
  ok(r && r.name === 'From another device, 10:44' && r.elements[0].text === 'INT. FLAT - DAY', 'in place, same id, with the newest arrival');
  const later = I.keepBoth(both, fresh, 'From another device, 11:00', { replaceId: id, now: now + 11 * 60000 });
  ok(later.revisions.length === both.revisions.length + 1, 'after ten minutes it is a new draft again');
  ok(I.keepBoth(both, fresh, 'x', { replaceId: 'gone' }).revisions.length === both.revisions.length + 1, 'an unknown draft id adds a draft');
}

// A page saving the copy it loaded before a newer one synced in does not
// stamp its stale lines as the newest edit (script.js stampChanged).
{
  const S = await import('../src/lib/script.js');
  S.saveScript({ elements: [{ id: 'q', type: 'action', text: 'old', u: 100 }] });
  S.saveScript({ elements: [{ id: 'q', type: 'action', text: 'NEWER', u: 9e12 }] });   // a collaborator's line, synced in
  S.saveScript({ elements: [{ id: 'q', type: 'action', text: 'old', u: 100 }] });     // a stale page saves
  const q = S.loadScript().elements.find((e) => e.id === 'q');
  ok(q && Number(q.u) === 100, 'the stale line keeps its old stamp, so a merge still prefers the newer line');
  S.saveScript({ elements: [{ id: 'q', type: 'action', text: 'edited here', u: 100 }] });
  ok(Number(S.loadScript().elements.find((e) => e.id === 'q').u) > 9e11, 'once storage agrees with the page, an edit is stamped as usual');
  S.saveScript({ elements: [{ id: 'z', type: 'action', text: 'new line' }] });
  ok(Number(S.loadScript().elements.find((e) => e.id === 'z').u) > 0, 'a genuinely new line is stamped');
}

console.log((fail ? '✗' : '✓') + ' test-incoming: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
