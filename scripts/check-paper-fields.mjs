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

if (bad.length) {
  console.error('\n✗ paper fields: ' + bad.length + ' writing field(s) off the page');
  for (const b of bad) console.error('  ' + b);
  console.error('\n  Build a writing textarea with paperTextarea() from src/ui/paper-field.js,');
  console.error('  or give its markup class="paper-field". Settings, search, numbers, money,');
  console.error('  dates and admin forms are NOT writing; do not list their files here.\n');
  process.exit(1);
}
console.log(`✓ paper: ${Object.keys(WRITING).length} writing files, ${built} paperTextarea() calls, ${marked} marked in markup, no bare textarea`);
