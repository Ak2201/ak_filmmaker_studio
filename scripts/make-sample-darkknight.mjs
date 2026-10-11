/* Builds the Dark Knight sample's two big data files from their sources:

     scripts/sample-darkknight/scenes.mjs     the scene rows (no eighths)
     scripts/sample-darkknight/act1..4.mjs    the pages, one string per scene
     scripts/sample-darkknight/paperwork.mjs  everything that is not a scene

   Writes src/data/sample.darkknight.json and
   src/data/sample.darkknight.script.json. eighths and pageNumber are
   MEASURED off the pages with script.js's own metric, so the breakdown
   cannot disagree with the script. Deterministic: same sources, same
   bytes. The story file is a separate step (make-sample-story.mjs
   darkknight), because it reads the file this one writes.

   Run from the repo root:  node scripts/make-sample-darkknight.mjs */
import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
await import(pathToFileURL(root + '/scripts/node-seams.mjs').href);
const imp = (p) => import(pathToFileURL(root + '/' + p).href);
const Sc = await imp('src/lib/script.js');
const { headingFields } = await imp('src/lib/scene-sync.js');
const { parseScene } = await imp('scripts/sample-darkknight/parse.mjs');
const { SCENES } = await imp('scripts/sample-darkknight/scenes.mjs');
const P = await imp('scripts/sample-darkknight/paperwork.mjs');
const dragon = JSON.parse(readFileSync(root + '/src/data/sample.dragon.json', 'utf8'));

const pages = {};
for (const f of ['act1', 'act2', 'act3', 'act4']) {
  Object.assign(pages, (await imp('scripts/sample-darkknight/' + f + '.mjs')).default);
}

const fail = (m) => { throw new Error(m); };
const upper = (s) => s.toUpperCase();

/* ---- the screenplay ---- */
const NOTICE = [
  'SAMPLE PAGES. This screenplay was written for this app, as the pages its demo project is broken down from. It is a reconstruction for practice: it follows the public structure of The Dark Knight (2008) scene by scene, but every action line and every line of dialogue is newly written here, and all of the paperwork attached to it is invented, imagined as if a Chennai unit were making the film. It is not the film\'s screenplay and contains none of its dialogue. Delete the project, or edit any of it, and nothing is lost.',
  'The dialogue is in English and the slug lines, action and transitions are too, which is the arrangement a screenplay page needs for its fixed-width Courier grid to stay arithmetic: this app\'s schedule, sides and budget are all derived from that count. The locations are Chennai and Tamil Nadu stand-ins, all invented.'
];
const elements = NOTICE.map((text) => ({ type: 'action', text }));
const rows = [];
let lines = elements.reduce((a, e) => a + Sc.elementLines(e), 0);
SCENES.forEach(([number, intExt, location, dayNight, shootDay, cast, synopsis, els]) => {
  const src = pages[number];
  if (!src) fail('no pages for scene ' + number);
  const heading = { type: 'scene', text: intExt + '. ' + upper(location) + ' - ' + dayNight };
  const f = headingFields(heading.text);
  if (f.intExt !== intExt || f.dayNight !== dayNight || upper(f.location) !== upper(location)) {
    fail('heading does not round-trip for scene ' + number + ': ' + JSON.stringify(f));
  }
  const body = parseScene(src);
  const sliceLines = [heading, ...body].reduce((a, e) => a + Sc.elementLines(e), 0);
  rows.push({
    number: String(number), intExt, dayNight, location,
    eighths: Math.max(1, Math.round((sliceLines / Sc.LINES_PER_PAGE) * 8)),
    pageNumber: String(Math.floor(lines / Sc.LINES_PER_PAGE) + 1),
    shootDay, synopsis, elements: { cast, ...els }
  });
  elements.push(heading, ...body);
  lines += sliceLines;
});
for (const k of Object.keys(pages)) if (!SCENES.some((s) => String(s[0]) === k)) fail('pages for unknown scene ' + k);

/* ---- days: Monday-Saturday from the first day ---- */
const days = {};
{
  const d = new Date(P.FIRST_DAY + 'T00:00:00Z');
  for (let n = 1; n <= P.SHOOT_DAYS; n++) {
    if (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1);
    days[String(n)] = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
const usedDays = new Set(rows.map((r) => r.shootDay));
for (let n = 1; n <= P.SHOOT_DAYS; n++) if (!usedDays.has(n)) fail('no scene on shoot day ' + n);
for (const n of usedDays) if (!days[String(n)]) fail('scene on unknown day ' + n);

/* ---- cross-checks ---- */
const locs = new Set(rows.map((r) => r.location.toLowerCase()));
for (const k of Object.keys(P.RECCES)) if (!locs.has(k.toLowerCase())) fail('recce for unknown location ' + k);
for (const m of P.MEDIA) if (!locs.has(m.linkedTo.toLowerCase())) fail('media linked to unknown location ' + m.linkedTo);
const names = new Set(P.CONTACTS.map((c) => c.name));
for (const cs of P.CALL_SHEETS) {
  for (const n of Object.keys(cs.calls)) if (!names.has(n)) fail('call sheet names unknown contact ' + n);
  for (const s of cs.sceneNumbers) if (!rows.some((r) => r.number === s)) fail('call sheet names unknown scene ' + s);
}
for (const s of [...P.SHOTS, ...P.FRAMES]) if (!rows.some((r) => r.number === s.scene)) fail('shot/frame names unknown scene ' + s.scene);
for (const f of P.FRAMES) if (!P.SHOTS.some((s) => s.scene === f.scene && s.number === f.shotNumber)) fail('frame names unknown shot ' + f.scene + '/' + f.shotNumber);
for (const c of P.CONTACTS) if (!/@darkknight\.example$/.test(c.email)) fail('bad email ' + c.email);
for (const k of Object.keys(P.BLUEPRINT)) if (!(k in dragon.blueprint)) fail('blueprint key Dragon does not carry: ' + k);
for (const k of Object.keys(dragon.blueprint)) if (!(k in P.BLUEPRINT)) fail('blueprint key missing: ' + k);

const main = {
  _about: P.ABOUT,
  title: P.TITLE,
  format: 'feature',
  blueprint: P.BLUEPRINT,
  blueprintChecks: dragon.blueprintChecks,
  scenes: rows,
  days,
  recces: P.RECCES,
  media: P.MEDIA,
  contacts: P.CONTACTS,
  callSheets: P.CALL_SHEETS,
  shots: P.SHOTS,
  frames: P.FRAMES,
  boards: P.BOARDS,
  script: { documents: P.DOCUMENTS },
  calc: P.CALC
};
writeFileSync(root + '/src/data/sample.darkknight.json', JSON.stringify(main, null, 2) + '\n');

const scriptAbout = [
  'THE DARK KNIGHT SAMPLE\'S SCREENPLAY - 40 scenes, the pages the rest of',
  'the sample is derived from.',
  '',
  'A RECONSTRUCTION FOR PRACTICE. It follows the public structure of the',
  'film scene by scene; every action line and every line of dialogue is',
  'newly written for this app, and every piece of paperwork around it is',
  'invented. It is not the film\'s screenplay and none of the film\'s famous',
  'lines appear in it. No real cast or crew is named anywhere.',
  '',
  'WHY IT IS ITS OWN FILE. sample.darkknight.json is a static import, so',
  'every byte of it sits in first paint; these pages are bigger than the',
  'whole of the rest of that file and are needed only after a click, so the',
  'hub reaches them with a dynamic import and they ship as their own chunk,',
  'with the matching exception in vite.config.js, as Dragon\'s do.',
  '',
  'WHERE THE NUMBERS COME FROM. scenes[].eighths and pageNumber in',
  'sample.darkknight.json are MEASURED off these pages by',
  'scripts/make-sample-darkknight.mjs with script.js\'s own metric',
  '(LINES_PER_PAGE = 55, action 61 columns, dialogue 35), so the breakdown,',
  'the schedule and the budget cannot disagree with the pages. The headings',
  'are generated from the scene rows, so they match them in count and order.',
  'Edit the scene sources in scripts/sample-darkknight/ and regenerate; do',
  'not edit this file by hand.'
];
writeFileSync(root + '/src/data/sample.darkknight.script.json',
  JSON.stringify({ _about: scriptAbout, elements }, null, 2) + '\n');

const eighths = rows.reduce((a, r) => a + r.eighths, 0);
const calcTotal = P.CALC.reduce((a, r) => a + Number(r.days) * Number(r.rate), 0);
console.log('scenes', rows.length, 'days', Object.keys(days).length, 'contacts', P.CONTACTS.length,
  'elements', elements.length, 'pages(script)', Sc.pageCount(elements), 'pages(breakdown)', eighths / 8,
  'calc total', calcTotal);
