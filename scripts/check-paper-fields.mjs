/* ============================================================
   test:paper — every WRITING textarea is paper
   ------------------------------------------------------------
   Owner, 20 Oct 2026: wherever somebody writes (story, beats, the Save
   the Cat beat sheet, characters, blueprint answers) the field is the
   screenplay's paper page — white, black Courier Prime. The look lives
   in src/styles/paper-field.css and the only ways in are the helpers in
   src/ui/paper-field.js (paperTextarea / paperField / paperScope).

   This is a source scan, like test:layers: no browser, so nothing can
   hide from it. In each WRITING file below it fails on

     P1  a textarea built with h('textarea…') or createElement('textarea')
         — build it with paperTextarea() instead (the one exception is
         the copy-to-clipboard shim, which nobody sees)
     P2  a <textarea …> in markup whose class does not name paper-field,
         unless the file is a SCOPE file (it puts .paper-scope on the
         container every such textarea lands in)
     P3  a SCOPE file that no longer calls paperScope(...)

   Comments are blanked first (acorn), so a comment that MENTIONS a
   textarea is not a hit. Not listed, on purpose: settings, search,
   admin, money and date forms, which stay dark.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd();

/* file → what it must do. `scope` names the container the file marks
   with paperScope(), which covers raw markup inside it. */
const WRITING = {
  'src/pages/story.js': {},
  'src/pages/dashboard.js': {},
  'src/pages/feature.js': { scope: 'main (steps, the treatment ladder, table rows)' },
  'src/pages/short.js': { scope: 'main' },
  'src/ui/steps.js': { scope: 'each section.step (raw blocks: the beat table)' },
  'src/ui/story-bible.js': {},
  'src/ui/character-card.js': {},
  'src/ui/beat-board.js': {},
  'src/ui/stage-guide-widgets.js': {},
  'src/ui/idea-vault.js': {},
  'src/ui/story-kit.js': {}
};

function blankComments(src) {
  const out = src.split('');
  acorn.parse(src, {
    ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true,
    onComment: (block, text, start, end) => {
      for (let i = start; i < end; i++) if (out[i] !== '\n') out[i] = ' ';
    }
  });
  return out.join('');
}

const lineOf = (s, i) => s.slice(0, i).split('\n').length;
const bad = [];
let built = 0, marked = 0;

for (const [rel, rule] of Object.entries(WRITING)) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) { bad.push(rel + ': listed as a writing file but missing'); continue; }
  const src = blankComments(fs.readFileSync(file, 'utf8'));

  for (const m of src.matchAll(/\bh\(\s*['"`]textarea\b|createElement\(\s*['"`]textarea['"`]\s*\)/g)) {
    /* The copy-to-clipboard shim: an off-screen textarea that lives for
       one execCommand('copy') and is removed. Not a field anybody sees. */
    if (/execCommand\(\s*['"]copy['"]/.test(src.slice(m.index, m.index + 240))) continue;
    bad.push(`${rel}:${lineOf(src, m.index)}  P1 a textarea built without paperTextarea()`);
  }
  built += (src.match(/\bpaperTextarea\(/g) || []).length;

  for (const m of src.matchAll(/<textarea\b[^>]*>/g)) {
    const cls = (m[0].match(/\bclass\s*=\s*"([^"]*)"/) || [])[1] || '';
    if (/\bpaper-field\b/.test(cls)) { marked++; continue; }
    if (rule.scope) continue;
    bad.push(`${rel}:${lineOf(src, m.index)}  P2 <textarea> markup without class="paper-field"`);
  }

  if (rule.scope && !/\bpaperScope\(/.test(src)) {
    bad.push(`${rel}  P3 must call paperScope() on ${rule.scope}`);
  }
}

/* The helper and the sheet must exist and keep the face as the token. */
const css = fs.readFileSync(path.join(ROOT, 'src/styles/paper-field.css'), 'utf8');
if (!/font-family:\s*var\(--f-script\)/.test(css)) bad.push('paper-field.css: the face must be var(--f-script), never a restated stack');
if (/Courier|Noto Sans Tamil/i.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))) bad.push('paper-field.css: names a font family — read var(--f-script)');

/* Review fixes (21 Oct 2026). Each is a regression the browser gate
   cannot see: the AA walk measures text, not focus rings or weight. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, '');
const focusRule = (cssCode.match(/textarea:focus-visible\s*\{([^}]*)\}/) || [])[1] || '';
if (!/outline:\s*2px solid var\(--accent-primary\)/.test(focusRule)) bad.push('paper-field.css: the focus ring must be var(--accent-primary) — an ink ring outside the field is ~1:1 on the dark ground');
if (!/border-color:\s*var\(--paper-page-ink\)/.test(focusRule)) bad.push('paper-field.css: focus must change the field\'s own rule (border-color: var(--paper-page-ink))');
if (!/\.scene-block input\.slug\.paper-field[^{]*\{\s*font-weight:\s*700/.test(cssCode)) bad.push('paper-field.css: the slug line must stay bold on paper');
if (!/\.dialogue-block[^{]*\.paper-field[^{]*\{\s*font-size:\s*var\(--t-small\)/.test(cssCode)) bad.push('paper-field.css: the screenplay fields must keep --t-small on paper');

const stepsSrc = blankComments(fs.readFileSync(path.join(ROOT, 'src/ui/steps.js'), 'utf8'));
if (!/paperRawInputs\(section\)/.test(stepsSrc)) bad.push('steps.js: renderStep must paper the raw blocks\' one-line answers (paperRawInputs)');
const rx = (name) => { const m = stepsSrc.match(new RegExp('const ' + name + ' = (/.*/[a-z]*);')); return m ? (0, eval)(m[1]) : null; };
const NK = rx('NOT_PROSE_KEY'), NH = rx('NOT_PROSE_HINT');
if (!NK || !NH) bad.push('steps.js: NOT_PROSE_KEY / NOT_PROSE_HINT not found');
else {
  const prose = (key, ph = '') => !NK.test(key) && !NH.test(ph);
  for (const k of ['s4_want', 's4_need', 's4_lie', 's4_wound', 's4_flaw', 's5_philosophy', 's6_mentor_tool']) if (!prose(k)) bad.push('steps.js: ' + k + ' is writing and must be paper');
  for (const [k, ph] of [['hod_dir_date', 'Date'], ['p_budget', 'e.g. ₹1.5L'], ['p_days', 'e.g. 2 days'], ['v2s11_days', ''], ['palette_c1_hex', ''], ['v2s6_artbudget', ''], ['s4_age', '']]) if (prose(k, ph)) bad.push('steps.js: ' + k + ' is a date/number/money field and must stay dark');
}

const dashSrc = blankComments(fs.readFileSync(path.join(ROOT, 'src/pages/dashboard.js'), 'utf8'));
if (/querySelectorAll\(\s*['"]input['"]\s*\)\.forEach\(\s*paperField/.test(dashSrc)) bad.push('dashboard.js: the Title page must not paper every input — dates and numbers stay dark');
const tp = (dashSrc.match(/TP_NOT_PROSE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '';
for (const k of ['meta_started', 'meta_runtime', 'v2_start', 'v2_shoot', 'v2_budget', 'p3_start', 'p3_days', 'p4_lock']) if (!tp.includes("'" + k + "'")) bad.push('dashboard.js: TP_NOT_PROSE must list ' + k);

if (bad.length) {
  console.error('\n✗ paper fields: ' + bad.length + ' writing field(s) off the page');
  for (const b of bad) console.error('  ' + b);
  console.error('\n  Build a writing textarea with paperTextarea() from src/ui/paper-field.js,');
  console.error('  or give its markup class="paper-field". Settings, search, numbers, money,');
  console.error('  dates and admin forms are NOT writing; do not list their files here.\n');
  process.exit(1);
}
console.log(`✓ paper: ${Object.keys(WRITING).length} writing files, ${built} paperTextarea() calls, ${marked} marked in markup, no bare textarea`);
