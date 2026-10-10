/* ============================================================
   TEST — the dashboard's stage states and the suggestion, in Node
   ------------------------------------------------------------
   Nothing is mandatory: a project with only an imported script and
   scenes is In progress in Pre-production and Not started in Story,
   and the suggestion follows the work rather than film order.
   ============================================================ */
import { mem } from './node-seams.mjs';

const J = await import('../src/lib/journey.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a));
const proj = { id: 'p1', title: 'T', format: 'feature' };
const by = (st, id) => st.find((s) => s.id === id);
const ids = (st) => st.map((s) => s.id);

/* ---- empty ----------------------------------------------------- */
mem.clear();
let st = J.stageStates(proj);
eq(ids(st), ['story', 'screenplay', 'preprod', 'production', 'post'], 'five stages, in film order');
ok(st.every((s) => s.status.id === 'none' && s.status.label === 'Not started'), 'an empty project starts nothing');
ok(st.every((s) => /\.html/.test(s.href)), 'every stage has an href from navigation.json');
eq(by(st, 'story').href, 'story.html', 'story href');
eq(by(st, 'production').href, 'shoot.html', 'production href');
eq(J.suggestNext(st), { id: 'story', why: 'start' }, 'empty → suggest the first stage');
eq(J.lastWorked(st), null, 'nothing to resume');
ok(by(st, 'preprod').start && by(st, 'screenplay').start, 'the two script-in-hand starts exist');

/* ---- only a story ---------------------------------------------- */
mem.clear();
mem.set('fms_story_v1', JSON.stringify({ v: 1, logline: 'A boy finds a dragon.', source: 'Once upon a time there was a dragon.', updatedAt: 1700000000000 }));
st = J.stageStates(proj);
eq(by(st, 'story').status.id, 'doing', 'a logline and synopsis → Story in progress');
ok(['screenplay', 'preprod', 'production', 'post'].every((i) => by(st, i).status.id === 'none'), 'nothing downstream started');
eq(J.suggestNext(st), { id: 'story', why: 'continue' }, 'story in progress → continue it');
eq(J.lastWorked(st).id, 'story', 'resume points at the story');

/* ---- only a script and scenes: no gating ----------------------- */
mem.clear();
const el = (type, text) => ({ id: Math.random().toString(36).slice(2), type, text });
mem.set('fms_script_v1', JSON.stringify({ elements: [el('scene', 'INT. HOUSE - DAY'), el('action', 'A door opens.')] }));
const sc = (id, patch) => ({ id, number: id, intExt: 'INT', dayNight: 'DAY', location: 'House', synopsis: '', eighths: 8, elements: {}, shotState: '', shotAt: '', ...patch });
mem.set('fms_scenes_v1', JSON.stringify({ scenes: [sc('1', { elements: { cast: ['Asha'] } }), sc('2')] }));
st = J.stageStates(proj);
eq(by(st, 'story').status.label, 'Not started', 'Story is Not started — no gating');
eq(by(st, 'screenplay').status.id, 'doing', 'a script in hand → Screenplay in progress');
eq(by(st, 'preprod').status.label, 'In progress', 'scenes → Pre-production In progress');
ok(/2 scenes · 1 broken down/.test(by(st, 'preprod').facts[0]), 'preprod fact counts scenes and coverage: ' + by(st, 'preprod').facts[0]);
eq(by(st, 'production').status.id, 'none', 'nothing shot yet');
eq(J.suggestNext(st), { id: 'preprod', why: 'continue' }, 'furthest-along open stage wins without timestamps');

/* ---- production marks give a timestamp that wins --------------- */
const t = '2026-10-09T10:00:00.000Z';
mem.set('fms_scenes_v1', JSON.stringify({ scenes: [sc('1', { shotState: 'shot', shotAt: t }), sc('2')] }));
mem.set('fms_story_v1', JSON.stringify({ v: 1, logline: 'x', updatedAt: Date.parse(t) + 5000 }));
st = J.stageStates(proj);
eq(by(st, 'production').status.id, 'doing', 'one scene shot → Production in progress');
eq(J.suggestNext(st).id, 'story', 'the most recently worked open stage is suggested');
eq(J.lastWorked(st).id, 'story', 'resume = newest stamp');

/* ---- suggestNext on hand-built states -------------------------- */
const S = (id, k, at = 0) => ({ id, status: J.STATUS[k], at });
eq(J.suggestNext([S('a', 'done'), S('b', 'done'), S('c', 'none')]), { id: 'c', why: 'next' }, 'finished work → earliest not started');
eq(J.suggestNext([S('a', 'done'), S('b', 'done')]), null, 'all done → no nudge');
eq(J.suggestNext([S('a', 'none'), S('b', 'doing')]), { id: 'b', why: 'continue' }, 'later work is respected');

console.log('test:journey — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
