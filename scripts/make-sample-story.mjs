/* Generates src/data/sample.dragon.story.json from the hand-written
   steps below, using the shipped buildSynopsisFromOutline() so every
   mark's offsets are exactly what the app itself would produce.
   Run from the repo root:  node scripts/make-sample-story.mjs */
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
await import(pathToFileURL(root + '/scripts/node-seams.mjs').href);
const S = await import(pathToFileURL(root + '/src/lib/story.js').href);
const sample = JSON.parse(readFileSync(root + '/src/data/sample.dragon.json', 'utf8'));

const F = 'save_the_cat';
// [beat, scene number or null, text]
const STEPS = [
  ['opening_image', 1, '2014, prize day in a school hall of plastic chairs. Young Ragavan collects a medal he genuinely earned while his parents watch from the back.'],
  ['theme_stated', 2, 'At the school gate the plan is said out loud: engineering, a masters abroad, then marriage. Nobody imagines it needs a shortcut.'],
  ['setup', null, 'Ragavan has top marks, a family that has planned his life around them, and has never once had to pretend.'],
  ['catalyst', null, 'He is turned down for a college seat, not on his marks but on the kind of person he appears to be, and the insult is precise.'],
  ['debate', null, 'There is almost no debate. He turns the humiliation straight into a new identity instead of an argument.'],
  ['break_into_two', 3, 'Three years later Ragavan arrives on campus as someone else and treats the front block as his own.'],
  ['break_into_two', 4, 'In front of an audience he counts his own list of arrears on the board, and makes it a performance.'],
  ['b_story', 5, 'In the canteen Ragavan runs the room while his friend Anbu quietly keeps the score Ragavan refuses to keep.'],
  ['fun_and_games', 6, 'On the quad his notoriety is complete: known by everybody, known for nothing.'],
  ['fun_and_games', 7, 'He is summoned for the first time, and the college’s rule is stated to him and not negotiated.'],
  ['fun_and_games', 8, 'In the hostel at night Anbu reads out everything Ragavan still has left to clear.'],
  ['fun_and_games', 9, 'Keerthi asks him the question the whole film will keep asking.'],
  ['fun_and_games', 10, 'At dusk on the quad Keerthi leaves the conversation open, and he lets her.'],
  ['fun_and_games', 11, 'In the exam hall he attempts one paper, badly.'],
  ['fun_and_games', 12, 'Back at the board, the number of arrears has gone up.'],
  ['fun_and_games', 13, 'One night in the hostel he adopts the name for good, and the haircut and the clothes change with it.'],
  ['fun_and_games', 14, 'He orders the certificate he never earned.'],
  ['fun_and_games', 15, 'With the forged degree in hand he talks his way past the HR desk of a corporate firm.'],
  ['fun_and_games', 16, 'On his first day on the floor he is good at the work immediately, which is the problem.'],
  ['fun_and_games', 17, 'Six months on there is a promotion and a better desk.'],
  ['fun_and_games', 18, 'At home one night his father is told a version of events.'],
  ['midpoint', 19, 'He carries the big client pitch alone and wins it: a false victory, because the credential is fake and the competence is real.'],
  ['bad_guys_close_in', 20, 'On the beach road at dusk he proposes to Pallavi, and the life he invented is almost complete.'],
  ['bad_guys_close_in', 21, 'On a campus visit he did not plan, his former dean recognises him.'],
  ['bad_guys_close_in', 22, 'The dean gives him an ultimatum instead of an exposure: one term to clear every arrear, or lose it all.'],
  ['bad_guys_close_in', 23, 'He is re-admitted in public, among students who know exactly who he is.'],
  ['bad_guys_close_in', 24, 'Running the office and the college at once, he makes his first slip.'],
  ['bad_guys_close_in', 25, 'The board a third time, and now it carries his own current name.'],
  ['bad_guys_close_in', 26, 'He sits the papers properly for the first time.'],
  ['bad_guys_close_in', 27, 'He asks Anbu for help, and Anbu sets a price.'],
  ['bad_guys_close_in', 28, 'An answer sheet is swapped, and the shortcut comes back in a new form.'],
  ['bad_guys_close_in', 29, 'At the office the engagement date is fixed, in front of everybody.'],
  ['all_is_lost', 30, 'A classmate loses the job offer she had earned, and the reason is Ragavan.'],
  ['all_is_lost', 31, 'The results come out, and they cost somebody who never took a shortcut.'],
  ['dark_night', 32, 'Ragavan stops arguing with anybody, himself included.'],
  ['break_into_three', 33, 'At home, without a speech, he decides, and turns down the clean way out he is offered.'],
  ['finale', 34, 'He confesses in front of three hundred people.'],
  ['finale', 35, 'He surrenders and is sentenced, and the procedure is shown rather than skipped.'],
  ['final_image', 36, 'On a delivery route in plain daylight he is earning something much smaller, and keeping it.']
];

const story = { ...S.blankStory(), framework: F,
  idea: sample.blueprint.s1_whatif,
  logline: sample.blueprint.s2_log_final,
  outline: STEPS.map(([beat, num, text], i) => {
    const st = { id: 'dragon-st-' + String(i + 1).padStart(2, '0'), beat: F + ':' + beat, text };
    if (num) st.sceneId = 'dragon-sc-' + num;
    return st;
  }) };
for (const st of story.outline) if (!S.beatById(F, st.beat.split(':')[1])) throw new Error('bad beat ' + st.beat);
S.buildSynopsisFromOutline(story, F);
story.sourceName = 'Dragon (sample)';
let k = 0;
for (const m of story.marks) m.id = 'dragon-mk-' + String(++k).padStart(2, '0');
// Verify every mark is verbatim.
for (const m of story.marks) if (story.source.slice(m.start, m.end) !== m.text) throw new Error('offset drift');
delete story.updatedAt;
const out = {
  _about: 'THE DRAGON SAMPLE’S STORY, for the Story page (story.html) and the hub’s sample project. A RECONSTRUCTION, like every other piece of the sample’s paperwork: the idea and the logline are the sample blueprint’s own answers, and the step outline is written from the sample’s 36 scene synopses in src/data/sample.dragon.json (plus three steps for beats the scene list skips), one step per scene, each filed under a Save the Cat! beat. None of it is the film’s writing. The synopsis and its marks are GENERATED from the outline by buildSynopsisFromOutline() in src/lib/story.js, so every mark’s offsets are what the app itself produces; edit the steps and regenerate rather than editing `source` by hand. `sceneId` on a step names the hub’s sample scene id (dragon-sc-<number>). A DYNAMIC IMPORT: vite.config.js keeps it out of the shared `data` chunk, the same exception as sample.dragon.script.json.',
  story
};
writeFileSync(root + '/src/data/sample.dragon.story.json', JSON.stringify(out, null, 2) + '\n');
console.log('steps', story.outline.length, 'marks', story.marks.length, 'chars', story.source.length);
