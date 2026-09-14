/* ============================================================
   POST-EXTRACT: rewrite legacy page filenames in the data.
   ------------------------------------------------------------
   The extractors read the ORIGINAL pages, so any cross-page link
   they capture inside a `raw` block still points at the old
   `arunak-*.html` filenames. Those files are redirect stubs now,
   and the build entries are feature/short/library.html.

   This runs as part of `npm run extract` so a re-extraction can
   never quietly reintroduce dead links.
   ============================================================ */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA = new URL('../../src/data/', import.meta.url).pathname;

const RENAMES = {
  'arunak-filmmaker-blueprint.html': 'feature.html',
  'arunak-shortfilm-blueprint.html': 'short.html',
  'arunak-filmmaker-library.html': 'library.html'
};

let touched = 0;
for (const name of readdirSync(DATA).filter((f) => f.endsWith('.json'))) {
  const path = join(DATA, name);
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [from, to] of Object.entries(RENAMES)) after = after.split(from).join(to);
  if (after !== before) {
    writeFileSync(path, after);
    console.log(`relinked ${name}`);
    touched++;
  }
}

const remaining = readdirSync(DATA)
  .filter((f) => f.endsWith('.json'))
  .filter((f) => /arunak-[a-z]+\.html|arunak-[a-z]+-[a-z]+\.html/.test(readFileSync(join(DATA, f), 'utf8')));

if (remaining.length) {
  console.error('FAIL — legacy page links still present in:', remaining.join(', '));
  process.exit(1);
}
console.log(`relink ok — ${touched} file(s) rewritten, 0 legacy links remain`);
