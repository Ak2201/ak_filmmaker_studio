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

/* Custom properties the 2023 markup used that the design system
   renamed. Same problem as the filenames and the same fix: the raw
   blocks are copied verbatim from legacy/, so a re-extraction would
   put every one of these back.

   These are not cosmetic. An undefined var() makes the whole
   declaration invalid at computed-value time, so `background:
   var(--paper-deep)` does not fall back to anything — it computes to
   transparent. One formula box on the feature page lost its ink
   ground that way and printed near-white text on near-white paper,
   in the DEFAULT theme, until a contrast check went looking. */
const TOKEN_RENAMES = {
  '--muted':      '--ink-muted',
  '--gold':       '--panel-gilt',
  '--paper-deep': '--paper-sunk',
  '--paper-soft': '--paper-raised',
  '--accent-2':   '--accent'
};

let touched = 0;
for (const name of readdirSync(DATA).filter((f) => f.endsWith('.json'))) {
  const path = join(DATA, name);
  const before = readFileSync(path, 'utf8');
  let after = before;
  for (const [from, to] of Object.entries(RENAMES)) after = after.split(from).join(to);
  for (const [from, to] of Object.entries(TOKEN_RENAMES)) {
    after = after.split(`var(${from})`).join(`var(${to})`);
  }
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
