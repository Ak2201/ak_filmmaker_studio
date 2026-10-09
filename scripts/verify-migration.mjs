/* ============================================================
   MIGRATION VERIFIER
   ------------------------------------------------------------
   Answers the only question that matters about this refactor:
   did anything get lost on the way from four hand-written HTML
   files to a data-driven build?

   Serves dist/, loads every page in Chromium, and compares each
   one against its ORIGINAL in legacy/ on the things a user would
   notice:

     1. data-key parity — the storage contract. A missing key
        means somebody's saved work no longer has a field to
        load into. This must be exact.
     2. visible-text coverage — did any prose disappear?
     3. no console errors, no inline event handlers.
     4. no runaway writes (the save-loop regression test).
     5. no horizontal overflow at phone width.

   Run: npm run build && npm run verify
   ------------------------------------------------------------
   THE CONTRAST PROBE NO LONGER WALKS A LIST.

   It used to. `SURFACES` named about thirty selectors and
   everything not on it was unmeasured — not a theoretical gap:
   the stat strip shipped at 2.34:1 on seven pages and stayed
   green for as long as it existed, because nobody had added
   `.bd-stat` to a string. A list can only be extended, and it
   was always extended after the bug.

   The probe now walks EVERY LEAF TEXT NODE in `main`, in the
   open modals and in the shell, across 4 themes x 5 skins x 14
   pages, at the AA floor of 4.5:1. That was the stated right
   end state for a long time and could not be turned on, because
   a wholesale walk reported 173 distinct failures. They were
   three faults, and all three are closed:

     1. A HUE USED AS TEXT — 111 of the 173. The base hues are
        fills, chosen to be painted behind something; as text
        they run 1.45-2.5:1. Fixed to --hue-deep / --hue-lift /
        --hue-on, and held there by the source check below,
        which greps for the rule being broken anywhere rather
        than waiting for a page to render it.
     2. SLAB WIDGETS WHOSE CHILDREN HARD-CODE --panel-*. --panel
        is dark in every theme; the SLAB is not — mission makes
        it transparent, binder and console make it --paper-sunk.
        Cream on cream at 1.04:1, invisible rather than faint,
        and hidden because the DEFAULT skin is the one where it
        happens to look right. The last two were
        `.director-card .study p` and `.formula p`.
     3. --ink-faint AS TEXT — 41 `color:` rules. The token
        clears 4.5:1 against NO ground in ANY theme: 4.13:1 at
        best on the ink theme's sunk card, 2.34:1 at worst on
        Desk's. It could not be retuned — raised far enough to
        clear AA it becomes --ink-muted — so it stopped being a
        text colour at all. tokens.css records the reasoning;
        the second source check below keeps it out, along with
        --rule, --rule-hair and --print-rule, which are worse.

   PSEUDO-ELEMENT GLYPHS ARE MEASURED TOO, and they used not to
   be. A ::before is not a text node, so the walk above could not
   see one at all — and in this app pseudo-element content is not
   decoration. The dash in front of every `.door-contents li`,
   the ○/● of a checklist, the `TAMIL ·` eyebrow, the numbers on
   `.rule-card` and `.ladder-rung`, the ⌕ in the search box and
   the whole of the glossary popover (`content: attr(data-gloss)`)
   are glyphs a reader is meant to read. A status dot rendered at
   1.2:1 looked fine to every check in this file.

   So the element walk beside the text walk measures both
   pseudos, with the pseudo's own background composited in front
   of its element's through the SAME groundOf(), and skips only
   what is genuinely not text or genuinely not painted:
   `content: ""` (a shape — the status dot and the six washes in
   editorial.css), url()/gradient content (a picture), and a
   pseudo that is display:none, hidden, transparent, zero-size or
   on a collapsed box. aria-hidden is NOT a skip: a decoration is
   still seen, so it still has to be legible.

   Verdict when it was turned on: 13,560 measurements across the
   four themes, five skins and fifteen pages, and ZERO failures —
   because the two source checks below already forbid the colours
   that would have caused them, and they grep `color:` without
   caring whether the selector names a pseudo-element. That is
   the source checks doing exactly the job they were added for,
   and it is why the answer below is worth what it claims.

   WHAT IS STILL UNMEASURED, so that nobody mistakes this for
   total coverage:
     - The page in any state this run does not reach. Every model
       is seeded on every page and every modal that opens is
       opened, but a hover, a focus ring, an error state or a
       disabled control is a style nothing here renders.
     - ::first-line, ::first-letter, ::marker, ::placeholder,
       ::selection and ::backdrop. Only ::before and ::after are
       walked; the others take a colour too.
     - Text painted by SVG `fill`, and text over a background
       IMAGE or gradient rather than a colour — groundOf reads
       backgroundColor only, so a glyph on a gradient is measured
       against whatever sits behind the gradient.
     - Chrome outside `main`, the modals and the shell on the
       module pages: breakdown, write and dashboard expose only
       MAIN and the shortcut sheet to the ROOTS selector.
   The source checks cover part of what a rendered walk cannot
   reach; between them the answer is "the rule is not broken
   anywhere in the source, and nothing rendered fails".
   ============================================================ */

import { chromium } from 'playwright';
import { parseHTML } from 'linkedom';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* --baseline recaptures the reference instead of asserting against it.
   Re-baselining is a deliberate act — a redesign that rewrites copy
   should require someone to type `npm run baseline` and say so in a
   commit, not quietly pass because the check drifted with it. */
const WRITE_BASELINE = process.argv.includes('--baseline');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'baseline.json');

/* ---- the first-paint byte budget ------------------------------
   scripts/budget.json holds, per page, the most JS+CSS a first paint
   may fetch. `--budget` recaptures every row at 110% of what loads
   now — the same shape of deliberate act as `--baseline`, and for the
   same reason: a budget that moved by itself would never fail.

   The three chunks named here are the ones vite.config.js keeps out
   of `studio` on purpose, so a first paint never pays for them. A
   fetch of any one of them at load is a regression whatever the byte
   total says, and is failed by name. */
const WRITE_BUDGET = process.argv.includes('--budget');
const BUDGET_FILE = path.join(ROOT, 'scripts', 'budget.json');
const BUDGET = fs.existsSync(BUDGET_FILE) ? JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8')) : { pages: {} };
const LAZY_CHUNKS = /\/(supabase|pptxgen|sample\.dragon\.script)-[^/]*\.js$/;
const measuredBudget = {};
const knownLeaksSeen = new Set();   // which knownLazyFetches entries actually fired

/* THE VERIFY RUN'S CLOCK IS NOT PINNED, and it must not be.

   A FROZEN_CLOCK + a UTC-pinned context used to sit here, solving
   the same festival-countdown problem that COUNTDOWN solves further
   down. Two mechanisms, and they are not merely redundant — they
   contradict each other.

   COUNTDOWN's whole premise is that THE PAGE RENDERS TODAY'S
   countdowns: it derives the varying numbers from the baseline's
   capturedAt and from `new Date()` in this script, and removes the
   symmetric difference. Freezing the browser's clock makes the page
   render some OTHER day's countdowns, so the set the filter removes
   is no longer the set the page moved — and whatever it failed to
   predict leaks as an unexplained missing word. It leaked exactly
   one ("61") the first time the two were put in the same file.

   Pinning the timezone was worse in the same way. COUNTDOWN reads
   the LOCAL calendar day, because that is the day the browser
   thinks it is; forcing the browser to UTC while this script stays
   on the machine's zone makes the two disagree by a day for part of
   every day.

   COUNTDOWN is the one that survives, and not only because it was
   first. It needs no constant to keep in step with the baseline, it
   costs coverage only on the words that actually moved — zero of
   them immediately after a re-baseline — and it was simulated
   across 400 days without a leak. */
/* VERIFY_DIST, for the same reason VERIFY_PORT exists one paragraph
   down: two sessions in one checkout fight over `dist/` as well as
   over the port. One of them rebuilding with the gate ON in the
   middle of the other's baseline capture turned nine pages of that
   baseline into copies of invite.html — the capture never failed, it
   just recorded the wrong site. Build into your own directory
   (`vite build --outDir dist-verify`) and name it here. */
const DIST = path.join(ROOT, process.env.VERIFY_DIST || 'dist');
/* Overridable, because several worktrees of this repo can be live at
   once and they all used to bind 5321. The contention was not
   theoretical: sessions took to running `lsof -ti:5321 | xargs kill -9`
   as a preamble, which SIGKILLed whoever legitimately held the port —
   two separate runs died mid-Chromium that way, reporting as
   "Target page, context or browser has been closed" rather than as
   what it was. Pass VERIFY_PORT=5322 (or anything free) instead of
   killing someone else's run. */
const PORT = Number(process.env.VERIFY_PORT) || 5321;

const PAGES = [
  { page: 'index.html',   legacy: 'index.html',                        name: 'hub' },
  { page: 'feature.html', legacy: 'arunak-filmmaker-blueprint.html',   name: 'feature' },
  { page: 'short.html',   legacy: 'arunak-shortfilm-blueprint.html',   name: 'short' },
  { page: 'library.html', legacy: 'arunak-filmmaker-library.html',     name: 'library' },
  // No legacy counterpart — this page did not exist before v5. The
  // `legacy` field is vestigial now that nothing diffs against it.
  { page: 'breakdown.html', legacy: null, name: 'breakdown' },
  // Also post-v5, also with no legacy counterpart: the 2023 pages had
  // no stripboard, no reports and no contacts because the app stopped
  // at the tech recce.
  { page: 'stripboard.html', legacy: null, name: 'stripboard' },
  { page: 'reports.html',    legacy: null, name: 'reports' },
  { page: 'contacts.html',   legacy: null, name: 'contacts' },
  { page: 'visualize.html',  legacy: null, name: 'visualize' },
  { page: 'write.html',      legacy: null, name: 'write' },
  { page: 'plan.html',       legacy: null, name: 'plan' },
  /* study.html and dissect.html left this list on 6 Oct 2026: they are
     redirect stubs now, and their content is the Library's Case Studies
     and Dissection tabs — so library.html's row carries their words and
     keys. A stub has nothing to measure, and measuring one would only
     have measured library.html twice under another name. */
  // New. Needs a `dashboard` entry in scripts/baseline.json before this
  // row can pass — baselineFacts() exits 2 without one. Re-baselining is
  // deliberate, so that is a separate, stated act.
  { page: 'dashboard.html',  legacy: null, name: 'dashboard' },
  // The estimator's own page. It was the last block on library.html,
  // reached by a nav entry pointing at an anchor that never existed.
  { page: 'budget.html',     legacy: null, name: 'budget' },
  /* The studio-wide settings page: the API keys for both providers, and
     the appearance controls. Added to this list late — it shipped with
     ZERO gate coverage, because a page absent from here is invisible to
     every check in the run: no data-key diff, no text coverage, no
     overflow measurement, no AA walk, no console-error check.

     That is the trap this row exists to close, and it is a property of
     the list rather than of the page: anything added to vite.config.js
     and navigation.json looks wired up and is still unchecked until it
     is named here too, and nothing fails to tell you so. If you add a
     page entry, add it here in the same commit and re-baseline. */
  { page: 'settings.html',   legacy: null, name: 'settings' },
  /* shoot.html shipped exactly the way the note above warns about —
     in vite.config.js and navigation.json, absent from here — and was
     unchecked from the day it landed. Both rows arrive with the
     re-baseline that regrouped six phases into the PRD's five stages. */
  { page: 'shoot.html',      legacy: null, name: 'shoot' },
  { page: 'story.html',      legacy: null, name: 'story' },
  /* Post-Production. Both rows arrive in the same commit as the page
     entries, as the settings note above demands, with the re-baseline
     that took the two modules from `planned` to `built`. */
  { page: 'edit.html',         legacy: null, name: 'edit' },
  { page: 'deliverables.html', legacy: null, name: 'deliverables' },
  // The screening room's entry form. The room itself needs a live pass
  // and is proved by scripts/prove-gate.mjs instead.
  { page: 'screening.html',  legacy: null, name: 'screening' },
  // The doorway: what a closed gate lands on. Signed out here (the run
  // never signs in), so the capture is the sign-in-first state; the
  // request and approval paths are proved by scripts/prove-gate.mjs.
  { page: 'invite.html',     legacy: null, name: 'invite' },
  // The application console. Signed out here, so the capture is the
  // "sign in" state; the numbers and the queue are proved by
  // scripts/prove-gate.mjs against a fake Supabase.
  { page: 'admin.html',      legacy: null, name: 'admin' }
];

/* THE BUILD HAS TO BE THE OPEN ONE. src/lib/sitegate.js makes the
   website invite-only: every page a signed-out visitor loads becomes a
   redirect to invite.html. This run loads every page signed out and
   measures its words, keys, overflow and contrast, so under the gate
   it would measure invite.html twenty times and report the rest as
   lost. vite.config.js stamps which build this is into a <meta>; an
   invite build is refused here with the command that makes the other
   one, and prove-gate.mjs refuses the open build for the mirror-image
   reason. Two builds, each checked by the tool that can see it. */
{
  const idx = path.join(DIST, 'index.html');
  const stamp = fs.existsSync(idx) ? (fs.readFileSync(idx, 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1] : null;
  if (stamp !== 'off') {
    console.error(`✗ dist/ was built with the site gate ${stamp ? 'ON' : 'unstamped'}; this run loads pages signed out and needs the open build.`);
    console.error('  Build it with:  npm run build:open     (VITE_SITE_GATE=off vite build)');
    console.error('  The production build (npm run build) keeps the gate on; prove it with npm run prove:gate.');
    process.exit(2);
  }
}

/* Every skin the source tree defines. Read from disk rather than
   listed here, for the same reason the steps come from JSON: a
   hand-written list of what exists is wrong by the second change.
   `_contract.css` is documentation, not a skin — it sets nothing. */
const SKIN_FILES = fs
  .readdirSync(path.join(ROOT, 'src', 'styles', 'skins'))
  .filter((f) => f.endsWith('.css') && !f.startsWith('_'))
  .map((f) => f.replace(/\.css$/, ''))
  .sort();

/* ------------------------------------------------------------
   KNOWN DIVERGENCES
   ------------------------------------------------------------
   Words that appear in a legacy page and deliberately do not
   appear in its replacement. Every entry needs a reason, because
   an unexplained one is indistinguishable from a bug. Anything
   NOT on this list that goes missing fails the run.
   ------------------------------------------------------------ */
/* Words that are deliberately gone from a page since the baseline was
   captured, each with the reason.

   Emptied when the oracle was re-baselined. Every previous entry
   explained a divergence from the original legacy/ markup, and against
   a baseline taken from the app's own output there is no such
   divergence — the stale-allowance check flagged all of them the moment
   the baseline landed, which is the check working.

   It is not dead. Reword something on purpose and verify will fail with
   the missing word; add it here with a reason and the run goes green
   again. Two rules keep this list honest: an entry that stops firing
   fails the run, so it cannot rot into a permanent excuse; and if the
   list is growing, that is the signal to re-baseline deliberately with
   `npm run baseline` rather than to keep adding rows. */
const EXPECTED = {
  /* EMPTY, and emptied BY the re-baseline rather than by hand-waving.

     It held four rows: `dragan` on the hub (the sample project renamed
     to Dragon) and `vv` / `included` / `compasses` on feature (step 08's
     copy corrected through the English-override sidecar). Every one was
     a real, deliberate wording change, and every one was the right use
     of this list at the time.

     Recapturing the oracle makes them all redundant in the same moment:
     the baseline now records the pages as they actually read, so those
     words are not "missing" from anything and the allowances never fire.
     The anti-rot half of this check would then fail the run for stale
     allowances — which is the mechanism working, not a regression, and
     is exactly what happened the last two times this file was emptied.

     An entry here is a one-off divergence between a known-good page and
     an older oracle. If you find yourself adding a third, the answer is
     `npm run baseline` and a sentence in the commit saying so. */
  /* The launcher prints "N modules" from navigation.json, so adding
     one takes that number off the page and the word-set check
     reports it as missing from a file nobody edited. Exactly the
     collision the note in CLAUDE.md describes, firing for the first
     time since the last re-baseline: Shoot Day took the map from 25
     modules to 26.

     An allowance rather than a re-baseline because it is the FIRST
     row. The guidance is to recapture once two or three of these
     have piled up — a baseline taken to absorb one derived digit
     would bake in everything else that happened to be on screen
     that minute. The anti-rot check will fail the run if this ever
     stops firing, which is what stops it becoming a permanent
     excuse.

     AND THAT IS EXACTLY WHAT HAPPENED, one commit later and for an
     unrelated reason: deriving the theme labels removed the word
     `sepia` from all SIXTEEN pages, which is sixteen rows — well past
     the two or three this note draws the line at — so the oracle was
     recaptured. The recapture absorbed the module count with
     everything else, the row above stopped firing, and the anti-rot
     check failed the run exactly as designed. The row is gone; the
     reason it existed is preserved here and in its own commit.

     The lesson is not that the judgement above was wrong — it was
     right for one digit. It is that an allowance is only ever valid
     until the next recapture, whoever makes it and for whatever
     reason. */
  hub: {},
  stripboard: {},
  reports: {},
  contacts: {},
  visualize: {},
  write: {},
  plan: {},
  breakdown: {},
  feature: {},
  short: {},
  library: {},
  budget: {},
  dashboard: {},
  settings: {},
  shoot: {},
  story: {},
  edit: {},
  deliverables: {},
  screening: {},
  invite: {},
  admin: {}
};

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};

const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
/* ---- data check: Tanglish must be romanised ----------------
   Runs before the browser starts, because it needs no browser and
   because a data fault should fail fast.

   Every translatable string carries its Tanglish alongside as
   `fooTanglish`, and Tanglish in this codebase is romanised Tamil in
   the Latin alphabet — that is the convention glossary.json has
   always used, and it is what makes the text survive fonts that have
   no Tamil coverage.

   This exists because three stray Tamil characters reached the data
   file inside otherwise-romanised sentences, from a mangled escape
   sequence in a generator script. None were visible in review and
   none broke anything loudly; they would simply have rendered in a
   substituted font, mid-word, forever. A machine finds them in
   milliseconds and a person does not find them at all.

   Typographic dashes and curly quotes are allowed: they are the
   studio's punctuation in both languages. ------------------------ */
{
  const ALLOWED = '\u2014\u2013\u2018\u2019\u201c\u201d\u2026';
  const offences = [];
  const walk = (node, key) => {
    if (typeof node === 'string') {
      if (!/Tanglish$/.test(key)) return;
      const bad = [...node].filter((c) => c.charCodeAt(0) > 127 && !ALLOWED.includes(c));
      if (bad.length) {
        const at = node.indexOf(bad[0]);
        offences.push(`${key}: "${bad.join('')}" in "...${node.slice(Math.max(0, at - 30), at + 30)}..."`);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach((v) => walk(v, key));
    Object.entries(node).forEach(([k, v]) => walk(v, k));
  };
  const dataDir = path.join(ROOT, 'src', 'data');
  fs.readdirSync(dataDir).filter((f) => f.endsWith('.json')).forEach((f) => {
    walk(JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')), f);
  });
  if (offences.length) {
    console.error('\n✗ Tanglish must be romanised — non-ASCII found in ' + offences.length + ' field(s):');
    offences.forEach((o) => console.error('  ' + o));
    console.error('\n  Tanglish is Tamil written in the Latin alphabet, as src/data/glossary.json');
    console.error('  writes it. If you meant Tamil script, it needs a different field name and');
    console.error('  the label typography in study.css needs revisiting before it will read right.\n');
    process.exit(2);
  }
  console.log('✓ Tanglish fields are romanised');
}

/* ---- source check: the old storage prefix is gone -----------
   The arunak_ -> fms_ rename touched 137 string literals across 26
   files. A half-finished rename is the worst outcome available here:
   the app writes fms_ and reads arunak_ for one key, so a field
   saves and never comes back, and nothing looks broken until
   somebody reopens a project.

   A grep can see that and a person cannot, which is the whole
   argument for checking it rather than trusting the pass. The one
   legitimate mention is in store.js's migratePrefix(), which has to
   name the prefix it is migrating FROM.
   ------------------------------------------------------------ */
{
  const survivors = [];
  const roots = ['src', 'scripts'];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      if (!/\.(js|mjs|json|css|html)$/.test(ent.name)) continue;
      const rel = path.relative(ROOT, full);
      // This file is the check; naming the prefix is its job.
      if (rel === path.join('scripts', 'verify-migration.mjs')) continue;
      // store.js's migratePrefix() has to name what it migrates FROM.
      if (rel === path.join('src', 'lib', 'store.js')) continue;
      /* Prose is not a live key. A comment explaining the rename is
         exactly what a later reader needs; what must not survive is a
         string literal the app actually reads or writes. Comments are
         blanked rather than dropped so the reported line numbers stay
         true, and a multi-line block comment is handled properly:
         testing whether a line starts with an asterisk missed the
         continuation lines, which is how this check first flagged
         its own documentation as a surviving key. */
      const source = fs.readFileSync(full, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
      source.split('\n').forEach((line, i) => {
        if (!line.includes('arunak_')) return;
        /* The backup applier maps legacy note keys forward out of a
           pre-rename file. Notes are the one thing a backup stores as
           a RAW key rather than a field name, so this mapping has to
           name the old prefix. It used to live in src/pages/hub.js and
           moved to src/lib/backup.js when the format was split out of
           the page, so that this ONE copy serves the file picker and
           the Drive restore alike — which is why this allowance names
           the file it is in rather than a page. */
        if (rel === path.join('src', 'lib', 'backup.js') && line.includes("indexOf('arunak_')")) return;
        survivors.push(`${rel}:${i + 1}  ${line.trim().slice(0, 96)}`);
      });
    }
  };
  roots.forEach((r) => { const d = path.join(ROOT, r); if (fs.existsSync(d)) walk(d); });
  ['vercel.json', 'netlify.toml', 'supabase-schema.sql'].forEach((f) => {
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full)) return;
    fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
      if (line.includes('arunak_')) survivors.push(`${f}:${i + 1}  ${line.trim().slice(0, 96)}`);
    });
  });
  if (survivors.length) {
    console.error(`\n\u2717 the old arunak_ storage prefix survives in ${survivors.length} place(s):`);
    survivors.slice(0, 20).forEach((o) => console.error('  ' + o));
    if (survivors.length > 20) console.error(`  ...and ${survivors.length - 20} more`);
    console.error('\n  A key written as fms_ and read as arunak_ saves and never comes back.');
    console.error('  Only store.js\'s migratePrefix() may name the old prefix.\n');
    process.exit(2);
  }
  console.log('\u2713 no arunak_ storage keys survive');
}

/* ---- source check: a fill is never a text colour ------------
   CLAUDE.md states the rule and the app spent a long time not
   following it: 111 of 173 AA failures across 14 pages x 4 themes x
   5 skins were a base hue used as `color`. --accent, --hue and the
   six named hues are chosen to be painted BEHIND something; as text
   they run 1.45-2.5:1.

   This is a SOURCE check rather than a rendered one on purpose. The
   rendered probe walks a selector list, and a list only ever catches
   what somebody remembered to add — which is exactly how the stat
   strip stayed broken for its whole life. Grepping the source
   catches the rule being broken anywhere, including in files no test
   page happens to render.

   Only the `color` property counts. `border-color`, `background` and
   friends are decoration and a raw hue is correct there.
   ------------------------------------------------------------ */
{
  const HUES = 'accent|hue|feature|shorts|library|visualize|plan|shoot|ok|warn';
  // `color` as its own property: line start, `{`, `;`, or a quote in
  // an inline style. Never *-color.
  const RE = new RegExp(String.raw`(^|[;{"'\s])color:\s*var\(--(${HUES})\)`, 'g');
  /* src/data is deliberately NOT scanned. Its `raw` blocks are 2023
     markup regenerated by `npm run extract` from legacy/, which must
     never be edited — so a hue written inline there cannot be fixed
     in the file. It is corrected on the way in by
     normaliseInlineHue() in src/ui/steps.js, which covers the same
     token list this check does. If you widen one, widen the other. */
  const roots = ['src/styles', 'src/pages', 'src/ui'];
  const offences = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      if (!/\.(css|js|json)$/.test(ent.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      text.split('\n').forEach((line, i) => {
        RE.lastIndex = 0;
        let m;
        while ((m = RE.exec(line)) !== null) {
          offences.push(`${path.relative(ROOT, full)}:${i + 1}  --${m[2]}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
  };
  roots.forEach((r) => { const d = path.join(ROOT, r); if (fs.existsSync(d)) walk(d); });
  if (offences.length) {
    console.error(`\n✗ a fill used as a text colour, in ${offences.length} place(s):`);
    offences.slice(0, 20).forEach((o) => console.error('  ' + o));
    if (offences.length > 20) console.error(`  ...and ${offences.length - 20} more`);
    console.error('\n  Text on a light ground takes --<hue>-deep, on a dark ground --<hue>-lift,');
    console.error('  and on top of the fill itself --<hue>-on. A border or a background may');
    console.error('  keep the base hue — only the `color` property is wrong here.\n');
    process.exit(2);
  }
  console.log('✓ no fill used as a text colour');
}

/* ---- source check: a hairline is never a text colour --------
   The companion to the check above, and the same argument one step
   further down the palette. --accent and the hues fail as text
   because they are chosen to be painted BEHIND something;
   --ink-faint, --rule, --rule-hair and --print-rule fail as text
   because they are chosen to be barely there.

   --ink-faint is the one that mattered. It was the studio's third
   ink, used as `color` in 41 rules across thirteen stylesheets, and
   it clears 4.5:1 against no ground in any theme — 4.13:1 at best on
   the ink theme's sunk card, 2.34:1 at worst on Desk's. Retuning it
   was not available: raised far enough to clear AA it becomes
   --ink-muted. So it stopped being a text colour, and this is what
   keeps it from coming back. Six files had already worked around it
   one at a time, each with a comment saying the same thing; a check
   says it once.

   SOURCE rather than rendered, for the reason the note at the top of
   this file gives: a rendered walk only sees the state a test run
   happens to reach. The wholesale walk below is much better than the
   selector list it replaced, but a page with no scenes renders no
   strips, and a rule on a strip is then unmeasured. A grep has no
   such blind spot.

   SVG `fill` counts. .char-map-svg .char-name is <text>, and its
   colour comes from `fill` — the one place `color:` is not the
   property that makes text a colour.

   Borders, backgrounds and strokes are exactly what these tokens are
   for and are not matched.
   ------------------------------------------------------------ */
{
  const HAIRLINES = 'ink-faint|rule|rule-hair|print-rule';
  const RE = new RegExp(
    String.raw`(^|[;{"'\s])(color|fill):\s*var\(--(${HAIRLINES})\)`, 'g');
  const roots = ['src/styles', 'src/pages', 'src/ui'];
  const offences = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { walk(full); continue; }
      if (!/\.(css|js|json)$/.test(ent.name)) continue;
      fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
        RE.lastIndex = 0;
        let m;
        while ((m = RE.exec(line)) !== null) {
          offences.push(`${path.relative(ROOT, full)}:${i + 1}  --${m[3]}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
  };
  roots.forEach((r) => { const d = path.join(ROOT, r); if (fs.existsSync(d)) walk(d); });
  if (offences.length) {
    console.error(`\n✗ a hairline used as a text colour, in ${offences.length} place(s):`);
    offences.slice(0, 20).forEach((o) => console.error('  ' + o));
    if (offences.length > 20) console.error(`  ...and ${offences.length - 20} more`);
    console.error('\n  --ink-faint clears 4.5:1 against no ground in any theme, and --rule,');
    console.error('  --rule-hair and --print-rule are worse (1.2-3.5:1). Secondary text takes');
    console.error('  --ink-muted; on a slab it takes --sk-slab-muted; on the chrome or an ink');
    console.error('  panel it takes --chrome-muted / --panel-muted; on the print page it takes');
    console.error('  --print-muted. These four keep border-color, background and stroke.\n');
    process.exit(2);
  }
  console.log('✓ no hairline used as a text colour');
}

/* ---- source check: a Tamil face must sit BEHIND the monospace ones
   `--f-script` is the screenplay stack and it now names a Tamil font,
   because Courier Prime ships `latin`/`latin-ext` only and no
   monospaced Tamil font exists — so a Tamil script set in it otherwise
   falls through to whatever the OS picks.

   THE ORDER IS THE WHOLE THING, and getting it wrong is silent. Google
   serves Noto Sans Tamil as three @font-face blocks — tamil, latin-ext
   and latin — all under one family name, so the family claims Latin
   too. Placed BEFORE 'Courier New' it becomes the first available font
   on any page that has not loaded Courier Prime and takes every glyph:
   measured, a slug line went from 600px of Courier New to 534px of
   proportional sans. Nothing errors, nothing overflows, the text and
   the keys are all still correct — the fixed-width grid the page count
   is arithmetic on has simply stopped being fixed-width.

   So: the Tamil family must appear, and it must come after the last
   monospace family that covers Latin. ------------------------------- */
{
  const tokens = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
  const bad = [];
  // every declaration of --f-script, in every theme block
  const decls = tokens.match(/--f-script:[^;]+;/g) || [];
  if (!decls.length) bad.push('no --f-script declaration found at all');
  const TAMIL = /Noto Sans Tamil|Latha|Nirmala|Tamil/i;
  for (const d of decls) {
    const list = d.replace(/--f-script:\s*/, '').replace(/;$/, '')
      .split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, ''));
    const tamilAt = list.findIndex((f) => TAMIL.test(f));
    if (tamilAt === -1) { bad.push('no Tamil family in: ' + d.trim()); continue; }
    // the Latin-covering monospace faces this stack relies on
    const monoAt = list.map((f, i) => (/^(Courier Prime|Courier New|Courier)$/i.test(f) ? i : -1))
      .filter((i) => i >= 0);
    const lastMono = monoAt.length ? Math.max(...monoAt) : -1;
    if (lastMono === -1) { bad.push('no Courier family in: ' + d.trim()); continue; }
    if (tamilAt < lastMono) {
      bad.push('Tamil family is at position ' + (tamilAt + 1) + ' but the last Courier '
        + 'family is at ' + (lastMono + 1) + ' — it will claim Latin too: ' + d.trim());
    }
  }
  if (bad.length) {
    console.error('\n✗ --f-script font order is wrong:');
    bad.forEach((b) => console.error('  ' + b));
    console.error('\n  The Tamil family goes LAST, after Courier Prime / Courier New /');
    console.error('  Courier. Before them it is the first available font on pages that');
    console.error('  never loaded Courier Prime, and it silently replaces the');
    console.error('  fixed-width grid that pageCount() is arithmetic on.\n');
    process.exit(2);
  }
  console.log('✓ --f-script keeps Tamil behind the monospace faces');
}

/* ---- data check: the Tanglish sidecar must still address real steps
   src/data/steps.tanglish.json is keyed `<namespace>:<step id>`, and
   it decorates files that `npm run extract` REGENERATES. A step that
   is renumbered, renamed or dropped leaves a key here pointing at
   nothing, and the symptom is silent: that step simply shows English
   in Tanglish mode and nobody notices which one.

   Both directions are checked. An orphan key is a fault, and so is a
   step with no translation, because "43 of 43" is the only version of
   this that is finished. The second one reports rather than fails, so
   that adding a step does not block a commit — but it does print the
   gap every single run. ---------------------------------------- */
{
  const NS = {
    feature:    ['steps.feature.json', ['vol1', 'vol2']],
    short:      ['steps.short.json', ['steps']],
    production: ['steps.production.json', ['production', 'post']]
  };
  const real = new Set();
  for (const [ns, [file, arrays]] of Object.entries(NS)) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', file), 'utf8'));
    arrays.forEach((a) => (d[a] || []).forEach((st) => real.add(ns + ':' + st.id)));
  }
  const side = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'steps.tanglish.json'), 'utf8'));
  const orphans = Object.keys(side.decks).filter((k) => !real.has(k))
    .concat(Object.keys(side.why).filter((k) => !real.has(k)));
  if (orphans.length) {
    console.error('\n✗ steps.tanglish.json addresses steps that do not exist:');
    orphans.forEach((o) => console.error('  ' + o));
    console.error('  Either the step was renamed/removed, or the key is a typo.\n');
    process.exit(2);
  }
  const untranslated = [...real].filter((k) => !side.decks[k]);
  console.log(`✓ Tanglish sidecar: ${Object.keys(side.decks).length}/${real.size} step decks`
    + (untranslated.length ? ` (missing: ${untranslated.join(', ')})` : ''));
}

/* ---- data check: the priority sidecar must address real steps too
   src/data/steps.priority.json marks a ten-step spine and maps
   fifteen steps to what their answers feed. Same rot risk as the
   Tanglish sidecar and the same fix: it decorates files that
   `npm run extract` regenerates, so a renumbered step leaves a key
   pointing at nothing.

   The symptom without this check is quiet: src/ui/steps.js warns to
   the console on page load, which a developer with the console open
   sees and CI never does. The agent that built the sidecar asked for
   this rather than leaving it. ------------------------------------ */
{
  const NS = {
    feature:    ['steps.feature.json', ['vol1', 'vol2']],
    short:      ['steps.short.json', ['steps']],
    production: ['steps.production.json', ['production', 'post']]
  };
  const real = new Set();
  for (const [ns, [file, arrays]] of Object.entries(NS)) {
    const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', file), 'utf8'));
    arrays.forEach((a) => (d[a] || []).forEach((st) => real.add(ns + ':' + st.id)));
  }
  const prio = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'steps.priority.json'), 'utf8'));
  const refs = [...(prio.spine || []).map((e) => e.step), ...Object.keys(prio.unlocks || {})];
  const orphans = [...new Set(refs.filter((k) => !real.has(k)))];
  if (orphans.length) {
    console.error('\n\u2717 steps.priority.json marks steps that do not exist:');
    orphans.forEach((o) => console.error('  ' + o));
    console.error('  A spine rung or an unlocks entry is pointing at a renamed or removed step.\n');
    process.exit(2);
  }
  console.log(`\u2713 steps.priority sidecar: ${(prio.spine || []).length}-step spine, `
    + `${Object.keys(prio.unlocks || {}).length} unlocks, all resolve`);
}

await new Promise((resolve, reject) => {
  server.once('error', (e) => {
    if (e && e.code === 'EADDRINUSE') {
      console.error(`\n✗ port ${PORT} is already in use.`);
      console.error('  Another verify run (possibly in another worktree) holds it.');
      console.error('  Do NOT kill it — that is how two runs have already died mid-Chromium.');
      console.error(`  Run this one on its own port instead:  VERIFY_PORT=${PORT + 1} npm run verify\n`);
      process.exit(2);
    }
    reject(e);
  });
  server.listen(PORT, resolve);
});

/* ---- helpers ---------------------------------------------- */
const strip = (html) => String(html).replace(/<[^>]+>/g, ' ');
const words = (s) => strip(s).replace(/&[a-z]+;|&#\d+;/gi, ' ')
  .toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [];

/* The reference the live pages are diffed against.

   This used to be legacy/ — the four hand-written pages the app was
   migrated from. That oracle did its job: it proved the migration lost
   no data-key and no prose. But it pins the app to 2023 markup, so any
   deliberate redesign has to be bought with EXPECTED entries until the
   allowlist is the document and the check is noise.

   scripts/baseline.json replaces it. The first baseline was captured
   from a build that still passed 100% against legacy/, so the original
   guarantee is inherited rather than discarded — the file records which
   commit it came from. legacy/ stays: `npm run extract` reads it, and
   it remains the historical record. It is no longer the oracle. */
function baselineFacts(name) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(
      '\nNo scripts/baseline.json. Capture one with:\n' +
      '  npm run build && npm run baseline\n' +
      'Only do that when the current output is known good — it becomes the reference.\n'
    );
    process.exit(2);
  }
  const all = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const page = all.pages[name];
  if (!page) {
    console.error(`\nbaseline.json has no entry for "${name}". Re-run npm run baseline.\n`);
    process.exit(2);
  }
  return { keys: new Set(page.keys), text: page.words };
}

/* ---- the other clock: the festival countdown ----------------
   Same fault as CLOCK further down, and the same remedy — the oracle
   cannot contain a clock, so the clock comes out of both sides. It
   gets more words than the greeting because the remedy had to be
   derived rather than listed.

   The short film's festival tracker prints live countdowns from the
   dates in festivals.checks.json: "in 33 days", "119 days ago". Every
   one of them moves with the calendar, and in BOTH directions — a
   future deadline counts down, a past one counts up. A baseline
   captured on 29 September therefore failed on 30 September with 13
   unexplained missing words, all 13 a bare integer and not one of
   them copy anybody had touched. Left alone it fails again the next
   day, with a different 13.

   Two things keep this from being a second hand-written word set:

   - WHICH numbers vary depends on the date the baseline was captured,
     so they are computed from the same file the page reads, at the two
     dates that matter: the baseline's own capturedAt and now.
   - Only what actually DIFFERS between those two dates is a clock.
     "in", "days" and "ago" are on the page at both, so they cancel
     out and keep their coverage — as does any number that happens to
     land on the same value twice. What is excluded is exactly what
     moved, so the cost is small and it is worth having measured
     rather than asserted: on the day this was written, 42 word-slots
     across all 15 pages, 1.11% of the short film's words and under
     0.6% of every other page's, every one of them a bare integer.
     Immediately after a re-baseline the cost is zero, because the two
     dates are the same day and the difference is empty.

   That second point is also why "today" / "tomorrow" / "yesterday"
   need no special case: relativeDays prints those instead of a number
   within a day of a deadline, and the symmetric difference picks them
   up on the two runs where they change while leaving them checked on
   every other run. It covers the one case where a whole phrase goes,
   too: once every deadline in the overlay is in the past, nothing on
   the page says "in N days" any more, so "in" is excluded on that run
   and on no other. Simulated across the 400 days after this baseline,
   the derivation absorbed every countdown shift with no leaks, and
   the only non-numeric words it ever removed were those four.

   An EXPECTED entry cannot do this job, which is worth saying because
   it is the obvious first reach. It would name integers that are
   wrong tomorrow, and the anti-rot check would then fail the run for
   stale allowances — so the list would need editing every day, and on
   any day nobody edited it, it would be hiding real deletions behind
   numbers that no longer mean anything. Nor is this a re-baseline:
   recapturing would go green until midnight and change nothing. */
const COUNTDOWN = (() => {
  /* Mirrors relativeDays / daysUntil / todayISO in
     src/lib/festivals.js. A second copy of a parser is a trap in this
     codebase — see the money.js entry in CLAUDE.md — but this is not a
     path the app can reach: verify is a node script whose job is to
     predict what the browser will render. Keep the two in step.
     Calendar-day arithmetic in UTC so a DST boundary cannot shift a
     count by one; local components for "today", because that is the
     day the browser running the page thinks it is. */
  const todayISO = (d = new Date()) => {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const daysUntil = (iso, from) => {
    const a = ISO.exec(String(iso));
    const b = ISO.exec(String(from));
    if (!a || !b) return null;
    const ms = Date.UTC(+a[1], +a[2] - 1, +a[3]) - Date.UTC(+b[1], +b[2] - 1, +b[3]);
    return Math.round(ms / 86400000);
  };
  const relativeDays = (n) => {
    if (n === null) return '';
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    return n > 0 ? `in ${n} days` : `${-n} days ago`;
  };

  let dates = [];
  try {
    const data = JSON.parse(fs.readFileSync(
      path.join(ROOT, 'src', 'data', 'festivals.checks.json'), 'utf8'));
    dates = Object.values(data.festivals || {})
      .flatMap((f) => (f && f.deadlines) || [])
      .map((d) => d && d.date)
      .filter((d) => ISO.test(String(d)));
  } catch (e) { /* no overlay on disk means no countdowns on the page */ }

  let capturedAt = null;
  try {
    capturedAt = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')).capturedAt;
  } catch (e) { /* no baseline yet — nothing to reconcile against */ }
  if (!dates.length || !capturedAt) return new Set();

  const vocabulary = (on) =>
    new Set(dates.flatMap((d) => words(relativeDays(daysUntil(d, on)))));
  const then = vocabulary(todayISO(new Date(capturedAt)));
  const now = vocabulary(todayISO());
  return new Set([...then, ...now].filter((w) => !(then.has(w) && now.has(w))));
})();

/* Said out loud rather than applied quietly. An exclusion nobody can
   see is how a check quietly stops checking: if this line ever lists
   a word that is not a festival countdown, the derivation is wrong. */
if (!WRITE_BASELINE) {
  console.log(COUNTDOWN.size
    ? `\u2713 festival countdown moved since the baseline; ${COUNTDOWN.size} ` +
      `clock word(s) out of both sides: ${[...COUNTDOWN].sort().join(', ')}`
    : '\u2713 festival countdown unchanged since the baseline');
}


/* ---- run --------------------------------------------------- */
// Playwright resolves its own downloaded browser. PW_CHROMIUM overrides
// that for environments that ship Chromium at a fixed path instead.
const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
);
const report = [];
const captured = {};
let failures = 0;

for (const spec of PAGES) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // The sandbox cannot reach fonts.googleapis.com; that is the
    // environment, not the app.
    if (/fonts\.g(oogleapis|static)\.com|ERR_TUNNEL|Failed to load resource/.test(m.text())) return;
    errors.push('console: ' + m.text());
  });

  /* --- FIRST-PAINT BYTES, recorded on THIS load and no other -----
     Every same-origin JS and CSS response the page fetches before it
     settles, as loaded, before a project exists and before anything
     is seeded. Summed per page and judged against scripts/budget.json
     below; the lazy chunks (supabase, pptxgen, the sample script) are
     named in the failure if any of them is fetched here, because the
     whole point of their being separate chunks is that a first paint
     never pays for them. */
  const firstPaintLoads = [];
  const onResponse = (r) => {
    let u;
    try { u = new URL(r.url()); } catch (e) { return; }
    if (u.origin !== `http://localhost:${PORT}`) return;
    if (!/\.(m?js|css)$/.test(u.pathname)) return;
    firstPaintLoads.push(r.body().then((b) => ({ url: u.pathname, bytes: b.length })).catch(() => null));
  };
  page.on('response', onResponse);

  await page.goto(`http://localhost:${PORT}/${spec.page}`, { waitUntil: 'networkidle' });

  page.off('response', onResponse);
  const firstPaint = (await Promise.all(firstPaintLoads)).filter(Boolean);

  /* --- FIRST-RUN WIDTH, measured before a project exists ---------
     Everything below this point runs with a project created, because
     the blueprints will not scope storage without one. The cost of
     that convenience was a blind spot: the hub's first-run panel is
     the only thing a brand-new user ever sees, and it is replaced by
     the project grid the instant a project appears — so no width
     check in this file has ever measured it.

     It pushed the page 238px sideways at 390px, and the gate stayed
     green throughout. Measure it here, while the studio is genuinely
     empty, before we spoil the condition.

     Same caveat as the main width check: the page loaded at 1280 and
     is resized afterwards, so anything gated on matchMedia at load
     has already decided. See "Known blind spot" in CLAUDE.md. */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  const firstRun = await page.evaluate(() => ({
    overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    sawEmptyState: !!document.querySelector('.empty-projects-state, .bd-empty')
  }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(250);

  // The hub needs a project before the blueprints will scope storage.
  await page.evaluate(() => {
    if (window.StudioStore && !StudioStore.currentProject()) {
      StudioStore.createProject({ title: 'Verification', format: 'feature' });
    }
  });
  await page.waitForTimeout(600);

  const live = await page.evaluate(() => ({
    keys: [...document.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key')),
    // innerHTML, not innerText — the legacy side is read the same way.
    // innerText drops anything currently display:none (the resume card
    // before there is anything to resume, the projects toolbar with no
    // projects) and the text of unselected <option>s, which made a
    // faithful port look like it had lost a twentieth of its copy.
    text: (() => {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach((n) => n.remove());
      return clone.innerHTML;
    })(),
    inlineHandlers: document.querySelectorAll(
      '[onclick],[onchange],[oninput],[onsubmit],[onkeydown],[ondblclick],[onfocus],[onblur]'
    ).length,
    steps: document.querySelectorAll('.step').length,
    hasMain: !!document.querySelector('main#main')
  }));

  // --- idle-write probe (the save-loop regression) ---
  await page.evaluate(() => {
    window.__w = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { window.__w++; return orig.call(this, k, v); };
  });
  await page.waitForTimeout(4000);
  const idleWrites = await page.evaluate(() => window.__w);

  // --- phone width ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));

  // --- themes must actually swap ---
  // The stylesheets key off :root[data-theme]; chrome.js once set only
  // body.dark/.sepia, which no rule matches — so all three themes
  // rendered identically, the picker was a no-op and sepia was
  // unreachable. Nothing above would notice: the text, the keys and the
  // handlers are all still correct on a page with the wrong palette.
  const themes = await page.evaluate(() => {
    const api = window.StudioUI;
    if (!api || !api.applyTheme) return { unavailable: true };
    const bg = () => getComputedStyle(document.body).backgroundColor;
    const before = document.documentElement.getAttribute('data-theme');
    /* Read the list from the app rather than repeating it here. When a
       fourth theme was added, a hardcoded ['paper','sepia','ink'] would
       have gone on passing while saying nothing about it — the check
       would have quietly stopped covering the newest palette, which is
       the one most likely to be wrong. */
    const names = api.themeOrder ? api.themeOrder() : ['paper', 'sepia', 'ink'];
    const out = {};
    names.forEach((t) => { api.applyTheme(t); out[t] = bg(); });
    if (before) document.documentElement.setAttribute('data-theme', before);
    return { out, names };
  });
  const themeCount = themes.unavailable ? null : themes.names.length;
  const themeSwatches = themes.unavailable
    ? null
    : new Set(Object.values(themes.out)).size;

  /* --- skins must actually swap, and all of them must have loaded ---

     Same failure mode as the theme, one level up. A skin is a file of
     --sk-* variables and the language reads them; if the glob stops
     picking a file up, or a skin's variables are all overridden, or
     someone hard-codes a shape back into modules.css, then the picker
     still lists the skin and choosing it still sets the attribute and
     the page still renders correctly — just identically. Nothing else
     in this run would notice.

     Two assertions, because they catch different things. The
     FINGERPRINT catches a skin that no longer changes anything. The
     COUNT catches a skin file that never reached the browser at all,
     which the fingerprint cannot see: a skin that does not exist
     produces no duplicate. */
  const skins = await page.evaluate(() => {
    const api = window.StudioSkin;
    if (!api) return { unavailable: true };
    const before = document.documentElement.getAttribute('data-skin');
    const probe = () => {
      const de = getComputedStyle(document.documentElement);
      // Read the contract, not one element: a skin is allowed to leave
      // any given object untouched, but not to leave all of them.
      return [
        'title-size', 'title-style', 'radius', 'card-pad', 'deco-rule-w',
        'deco-rule-c', 'deck-size', 'h2-size', 'stepnum-size', 'cover-min'
      ].map((k) => de.getPropertyValue('--sk-' + k).trim()).join('|');
    };
    const out = {}, wide = [];
    api.listSkins().forEach((sk) => {
      api.applySkin(sk.id);
      out[sk.id] = probe();
      // The viewport is already 390px here. A skin is free to be
      // roomier or larger-typed than the default; it is not free to
      // push the page sideways on a phone, and only the default one
      // is measured by the check above.
      const de = document.documentElement;
      const over = Math.max(0, de.scrollWidth - de.clientWidth);
      if (over > 0) wide.push(sk.id + ' +' + over + 'px');
    });
    api.applySkin(before || 'studio');
    return { out, ids: Object.keys(out), wide };
  });
  /* The breakdown's chips and element cards only exist once a scene
     does, so on an empty studio the hue assertions below would report
     "nothing to check" forever — a check that never runs is a check
     that does not exist.

     AFTER the text and key capture above, deliberately: the baselines
     were captured in the empty state, and seeding before the capture
     would delete every teaching empty state's prose from the page and
     fail the coverage check for the right words and the wrong reason.
     Everything below this line therefore runs against a studio with
     work in it, and everything above it against an empty one.

     EVERY MODEL, EVERY PAGE — not just the breakdown's scenes.

     The contrast probe below walks the whole document now, and an
     empty document has almost nothing in it to walk. Seven pages
     reported zero contrast findings on a run where a seeded copy of
     the same build reported thirty-five between them: the strips, the
     day-out-of-days grid, the shot table, the call sheet and the
     location cards simply were not on the page. A wholesale walk of an
     empty state is a list by another name.

     So: scenes with elements, shoot days and page counts; two people
     and a call sheet; two shots, a frame and a board; a recce and two
     day dates; four script elements. Through the proxy on purpose —
     these are project-scoped keys, and writing them raw would put the
     data where nothing reads it. */
  await page.evaluate(() => {
    const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
    /* The first two scenes are the breakdown's originals, unchanged:
       the hue assertion needs two elements in different categories and
       these are what it was written against. */
    set('fms_scenes_v1', { scenes: [
      { id: 'verify-1', number: '1', intExt: 'INT', dayNight: 'DAY',
        location: 'Police Station', synopsis: '', eighths: 8, pageNumber: '1', shootDay: '1',
        elements: { cast: ['Prakash'], props: ['Iron sickle'] } },
      { id: 'verify-2', number: '2', intExt: 'INT', dayNight: 'DAY',
        location: 'Forest Road', synopsis: '', eighths: 8, pageNumber: '2', shootDay: '1',
        elements: { cast: ['Kumaresan'], wardrobe: ['Khaki uniform'] } },
      /* Two more so the other times of day, the EXT badge and a second
         shoot day exist: .tod-night and .tod-dusk render nothing at all
         on a board where every scene is INT/DAY. */
      { id: 'verify-3', number: '3', intExt: 'EXT', dayNight: 'NIGHT',
        location: 'College gate', synopsis: 'The rejection.', eighths: 12, pageNumber: '3',
        shootDay: '2', elements: { cast: ['Prakash'], vehicles: ['Jeep'] } },
      { id: 'verify-4', number: '4', intExt: 'EXT', dayNight: 'EVENING',
        location: 'Hostel room', synopsis: 'No deliberation.', eighths: 6, pageNumber: '4',
        shootDay: '', elements: {} }
    ] });
    set('fms_contacts_v1', {
      contacts: [
        { id: 'vc1', name: 'Anitha R', role: 'Line Producer', department: 'Production',
          phone: '98400 00000', email: 'a@example.com', notes: 'Chennai unit' },
        { id: 'vc2', name: 'Vel S', role: 'Gaffer', department: 'Camera',
          phone: '', email: '', notes: '' }
      ],
      callSheets: [
        { id: 'vcs1', title: 'Day 1', date: '2025-01-09', generalCall: '06:00',
          location: 'Police Station', notes: 'Rain cover booked',
          sceneIds: ['verify-1', 'verify-2'], calls: { vc1: '05:30' } }
      ]
    });
    set('fms_shots_v1', {
      shots: [
        { id: 'vsh1', sceneId: 'verify-1', number: '1A', size: 'WS', lens: '35mm',
          description: 'Establish the hall.' },
        { id: 'vsh2', sceneId: 'verify-1', number: '1B', size: 'CU', lens: '85mm',
          description: 'The medal.', done: true }
      ],
      frames: [{ id: 'vfr1', shotId: 'vsh1', caption: 'Wide from the balcony', ref: '' }],
      boards: [{ id: 'vbd1', name: 'Palette', note: 'Warm interiors',
                 entries: [{ id: 'ven1', title: 'Ratsasan', ref: '', why: 'Night sodium' }] }]
    });
    set('fms_locations_v1', {
      recces: { 'police station': { permission: 'pending', power: 'genset', notes: 'Ask the AC' } },
      dayDates: { 1: '2025-01-09', 2: '2025-01-10' }
    });
    set('fms_script_v1', { elements: [
      { id: 've1', type: 'scene', text: 'INT. POLICE STATION - DAY' },
      { id: 've2', type: 'action', text: 'Prakash waits.' },
      { id: 've3', type: 'character', text: 'PRAKASH' },
      { id: 've4', type: 'dialogue', text: 'I did not sign it.' }
    ] });
    /* The Story stage: one hand tag, one placed by position, a tension
       override and a clipping, so the matrix, the marks (both kinds),
       the heatmap and the vault are all on the page to be walked. */
    const syn = 'A student is turned down for a college seat. He becomes somebody else. '
              + 'Years later the one man who knows recognises him and hands him a deadline.';
    set('fms_story_v1', { v: 1, source: syn, sourceName: 'verify', framework: 'three_act', logline: '',
      tension: { 'three_act:inciting': 6 },
      marks: [
        { id: 'vm1', start: 0, end: 44, text: syn.slice(0, 44), tags: { three_act: 'inciting' }, origin: 'manual', rationale: '' },
        { id: 'vm2', start: 72, end: syn.length, text: syn.slice(72), tags: {}, origin: 'ai', rationale: 'The deadline turns it.' }
      ] });
    set('fms_idea_vault_v1', [{ id: 'vv1', snippet: 'A headline about forged degrees.', url: 'https://example.com/a',
      title: '', at: 1759000000000, beat: '' }]);
    /* Post-Production. One scene in the cut with a note and an open
       pick-up, one cut out, so the edit log's owed / locked / out rows,
       the verdict line and the pick-up list are all on the page; two
       deliverables ticked and one marked not needed, so every state
       of a checklist card is walked. The scenes above carry no
       shotState, which is what puts a conflict-free 'owed' row on the
       page too. */
    set('fms_edit_v1', { scenes: {
        'verify-1': { cut: 'in', note: 'Needs the insert of the medal.' },
        'verify-2': { cut: 'locked', note: '' },
        'verify-4': { cut: 'out', note: 'Lost in the assembly.' } },
      pickups: [{ id: 'vpk1', sceneId: 'verify-1', what: 'Insert of the medal', done: false, at: '2025-01-10T00:00:00.000Z' },
                { id: 'vpk2', sceneId: 'verify-2', what: 'A wide of the road', done: true, at: '2025-01-10T00:00:00.000Z' }] });
    set('fms_deliverables_v1', { items: {
        master_prores: { state: 'done', note: 'On the red drive.' },
        subs_en: { state: 'doing', note: '' },
        mix_51: { state: 'na', note: 'Stereo film.' } },
      custom: [{ id: 'vdv1', label: 'A 4K HDR master for the streamer', group: 'custom', when: 'release' }] });
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);

  /* --- what is inside a modal has never been checked ---

     Every count above reads the DOM as it stands at load. A modal is
     built on first open, so nothing in one has ever been measured —
     and that is not hypothetical: the cloud auth modal shipped FOUR
     inline onclick/onsubmit attributes, which under the production
     `script-src 'self'` are inert. The sign-in button was the single
     control on the site guaranteed not to work in production, and it
     passed every run of this file.

     So: open everything that opens, then count again. */
  const modals = await page.evaluate(() => {
    const api = window.StudioUI;
    if (!api) return { unavailable: true };
    const opened = [];
    const OPENERS = [
      'openCloudAuthModal', 'openShareDialog', 'openMigrationModal', 'openShortcutSheet'
    ];
    OPENERS.forEach((n) => {
      if (typeof api[n] !== 'function') return;
      try { api[n](); opened.push(n); } catch (e) { /* needs state we do not have */ }
    });
    // The hub's own new-project modal, if this page has one.
    document.querySelectorAll('[data-action="new-project"], #newProjectBtn').forEach((b) => {
      try { b.click(); opened.push('new-project'); } catch (e) {}
    });
    const inline = document.querySelectorAll(
      '[onclick],[onchange],[oninput],[onsubmit],[onkeydown],[ondblclick],[onfocus],[onblur]'
    ).length;
    const de = document.documentElement;
    const overflow = Math.max(0, de.scrollWidth - de.clientWidth);
    return { opened, inline, overflow };
  });

  /* --- text must stay legible on the surface it sits on ---

     Twice now a surface has been restyled without its text. Moving
     .tip-box from an ink ground to paper left `color: var(--panel-ink)`
     behind, which is near-white on near-white; giving Console a light
     slab left the resume card's --panel-gilt heading on it, same
     result. Both render perfectly happily and both are invisible.

     Nothing else here can see that. The keys are right, the words are
     right — `innerHTML` still contains them, so the coverage check is
     satisfied by text no human can read.

     So: for every theme crossed with every skin, walk EVERY LEAF TEXT
     NODE in `main` and in whatever modals are open, and compute the
     WCAG contrast against the composited ancestor background. The
     floor is 4.5 — AA for body text.

     THIS USED TO WALK A LIST, AND THAT IS THE POINT OF THE CHANGE.
     `SURFACES` named about thirty selectors, and everything not on it
     was unmeasured: the stat strip shipped at 2.34:1 on seven pages
     and stayed green for its whole life because nobody added
     `.bd-stat` to a string. The list could not be completed, only
     extended, and it was extended reactively — always after the bug.

     The wholesale walk was not available before because 173 distinct
     places failed it. They were three faults, and all three are now
     closed: a base hue used as text (111), a slab widget whose
     children hard-coded --panel-* (the 1.04:1 cases), and --ink-faint
     used as text (41 rules, a token that clears 4.5:1 against no
     ground in any theme and is now not a text colour at all — see
     tokens.css). With those gone the honest check costs nothing to
     turn on, so it is on.

     PSEUDO-ELEMENT GLYPHS ARE WALKED TOO, in the second loop below.
     They were the last thing here that was not a text node, and in
     this app they carry real reading — see the note at the top of
     this file for the list and for the skips.

     WHAT STILL LIMITS IT, and none of it is a reason to go back to a
     list. A page renders only the state this run puts it in, so the
     models are seeded above and the modals are opened above; text
     that needs a hover, a focus, an error or a disabled control is
     still unmeasured. Only ::before and ::after are walked, not
     ::marker / ::placeholder / ::selection / ::first-line. groundOf
     reads backgroundColor, so text over a background IMAGE or a
     gradient is measured against whatever is behind it. And ROOTS
     reaches less chrome on the module pages than on the blueprints.
     The source checks near the top of this file cover part of what a
     rendered walk cannot reach. */
  /* The probe is a FUNCTION rather than an inline closure because it
     runs more than once on two pages — see EXTRA_STATES below. It
     reads nothing from this file's scope: everything it needs is on
     the window. */
  const contrastProbe = () => {
    const api = window.StudioUI, skinApi = window.StudioSkin;
    if (!api || !skinApi) return { unavailable: true };

    const parse = (c) => {
      const m = String(c).match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(',').map((n) => parseFloat(n));
      return { c: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
    };
    const rgb = (c) => { const p = parse(c); return p && p.a > 0 ? p.c : null; };
    const lum = ([r, g, b]) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    /* Composite the stack, do not stop at the first non-transparent
       layer. A 7%-alpha wash over a near-black card is, to the eye,
       near-black — treating it as its own opaque colour reported a
       perfectly legible chip as 1:1 and sent me looking for a bug that
       was in this function. Layers accumulate until one is opaque. */
    /* `top` is an extra layer painted IN FRONT of everything the
       element stack provides — a pseudo-element's own background,
       which sits above its originating element's. It is a parameter
       rather than a second function because the compositing rule is
       the thing that was hard to get right, and two copies of it
       would disagree the first time one was touched. Called with one
       argument it behaves exactly as it always did. */
    const groundOf = (el, top) => {
      const layers = [];
      if (top && top.a > 0) layers.push(top);
      const opaqueYet = () => layers.length > 0 && layers[layers.length - 1].a >= 1;
      for (let n = el; !opaqueYet() && n && n !== document.documentElement; n = n.parentElement) {
        const p = parse(getComputedStyle(n).backgroundColor);
        if (!p || p.a === 0) continue;
        layers.push(p);
        if (p.a >= 1) break;
      }
      const base = parse(getComputedStyle(document.body).backgroundColor);
      if (!layers.length || layers[layers.length - 1].a < 1) {
        layers.push(base && base.a >= 1 ? base : { c: [255, 255, 255], a: 1 });
      }
      // Back to front: the deepest opaque layer first, then blend up.
      let out = layers[layers.length - 1].c;
      for (let i = layers.length - 2; i >= 0; i--) {
        const { c, a } = layers[i];
        out = out.map((v, k) => c[k] * a + v * (1 - a));
      }
      return out;
    };

    /* Containers, AND the controls. `.btn` was not on this list, and
       that is how a button rendered at 1:1 — --chrome-ink is the same
       value as --paper in the paper theme, so breakdown's "+ Add scene"
       was cream on cream, focusable and invisible, and a green run said
       nothing. A check that only looks at panels will keep missing the
       things people actually click. */
    /* WCAG AA for body text. This was 3.0 — a floor chosen to catch
       text that had VANISHED without crying wolf about muted greys.
       It did its job: the invisible cases are gone. 4.5 is the real
       bar, and the gap between the two is where "technically legible"
       lives. */
    const AA = 4.5;
    /* THE WHOLE DOCUMENT, not a list of selectors. `main` is the page;
       the modals are added because they are built on first open and
       live outside it, and the navigation band is added because the
       breadcrumb and the phase tabs are wayfinding — a "you are here"
       marker nobody can read is worse than none.

       `.sh-bar`, NOT `.shell`. This list said `.shell` from the day it
       was written and `.shell` has never existed in this app: the band
       shell.js builds is `.sh-bar`. So the clause that claims to cover
       the breadcrumb and the phase tabs covered nothing, on every page,
       in every theme, for as long as the check has existed — and it
       read as deliberate coverage, which is worse than an omission
       because nobody goes looking for it.

       Same family as the `--hue` class that matched no rule and the
       `.is-primary` button that matched no rule: a selector naming
       something that is not there fails silently and looks fine. The
       difference is that this one was in the thing whose job is to
       notice.

       `.sh-plate` is in too — it is the one surface whose colours are
       deliberately constant across themes, so it is the one most
       likely to be wrong in exactly one of them.

       Anything with text in it is measured, whether or not somebody
       thought of it. That is the whole difference. */
    const ROOTS = 'main, .modal, .shortcut-sheet, .sh-bar, .sh-plate, .toolbar';

    /* A per-element name, built from the element and its two nearest
       classed ancestors. The old version printed the matched SURFACE
       plus the element, which was only ever as specific as the list;
       with no list there is nothing to print but the path. */
    const pathOf = (el) => {
      const seg = [];
      for (let n = el; n && n.tagName && seg.length < 3; n = n.parentElement) {
        const cls = (n.className || '').toString().trim().split(/\s+/).filter(Boolean)[0];
        seg.unshift(n.tagName.toLowerCase() + (cls ? '.' + cls : ''));
        if (n.tagName === 'MAIN') break;
      }
      return seg.join('>');
    };

    /* --- is this pseudo-element TEXT, or is it a shape? ---

       A ::before is not a text node, so the walk above cannot see one
       at all. In this app that is not a technicality: the dash in
       front of every `.door-contents li`, the ○/● of a checklist, the
       `TAMIL ·` eyebrow, the numbers on `.rule-card` and
       `.ladder-rung` and the ⌕ in the search box are all glyphs a
       reader is meant to read, and every one of them was unmeasured.

       The distinction that keeps this from crying wolf is content.
       `content: ""` with a background is a DOT, a bar or a corner —
       a shape, with no foreground to measure, and the status dot at
       `.lx-mod-state::before` and the six `content: ""` washes in
       editorial.css are exactly that. They are skipped, and skipping
       them is not a loophole: there is genuinely no text there.

       Everything that resolves to characters is text and is measured:
       string literals (including the CSS-escaped ones, which Chrome
       has already turned into the character by computed-value time),
       `counter()` / `counters()`, `attr()` — the glossary popover is
       `content: attr(data-gloss)` and is the largest run of
       pseudo-element prose in the app — and the quote keywords.

       Images are not text: `url()` and the gradient functions are
       stripped before the test, so `content: url(x)` is a shape and a
       hypothetical `url(x) " 3 notes"` still measures the words. The
       `/ "alt"` tail is the accessible name, never painted, so it is
       dropped rather than counted as a visible glyph. */
    const glyphOf = (content) => {
      if (!content) return '';
      let c = String(content).trim();
      if (c === 'none' || c === 'normal') return '';
      c = c.split(/\s+\/\s+/)[0];
      c = c.replace(
        /(?:-webkit-)?(?:url|image-set|(?:repeating-)?(?:linear|radial|conic)-gradient)\([^()]*\)/g, ' ');
      const LIT = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g;
      let out = '', m;
      while ((m = LIT.exec(c)) !== null) out += (m[1] !== undefined ? m[1] : m[2]);
      const rest = c.replace(LIT, ' ');
      // A counter or an attribute is characters whose value we do not
      // need to know — one stand-in glyph is enough to say "text here".
      if (/\b(?:counters?|attr)\s*\(/.test(rest) || /\b(?:open|close)-quote\b/.test(rest)) out += '#';
      return out.trim();
    };

    /* Freeze transitions for the duration of the probe.

       Three findings survived every real fix and would not reproduce
       by hand: two door buttons and a backup chip, always reporting
       the PREVIOUS combination's colour. Those elements have
       `transition: background`/`color`, and a property mid-transition
       computes to its in-flight value — at t≈0, the old one. The check
       was measuring its own switching, not the design.

       A real user never sees this: they change theme once and the
       transition lands. Only a loop that switches sixteen times and
       reads instantly can catch a colour in the air. */
    const freeze = document.createElement('style');
    freeze.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}';
    document.head.appendChild(freeze);

    const beforeTheme = api.currentTheme();
    const beforeSkin = skinApi.currentSkin();
    const worst = [];
    let measured = 0;

    for (const t of api.themeOrder()) {
      for (const sk of skinApi.listSkins()) {
        api.applyTheme(t);
        skinApi.applySkin(sk.id);
        /* Force a style recalc between the attribute change and the
           reads. Sixteen theme/skin switches in a tight loop, each
           followed by hundreds of getComputedStyle calls, and some of
           those reads came back with the PREVIOUS combination's custom
           properties — reporting a door button as :root blue while the
           root element already resolved the ink palette. */
        void document.documentElement.offsetHeight;
        document.querySelectorAll(ROOTS).forEach((root) => {
          /* TEXT NODES, not elements. Walking elements and asking
             "does it have children?" misses a label that sits beside a
             nested <span>, and a button's label is usually a bare text
             node with no element of its own — which is half of why the
             1:1 button went unseen for as long as it did. Every run of
             visible characters on the page is its own measurement. */
          const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = w.nextNode())) {
            if (!node.textContent.trim()) continue;
            const el = node.parentElement;
            if (!el) continue;
            if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION|TITLE)$/.test(el.tagName)) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || cs.display === 'none') continue;
            const fg = rgb(cs.color);
            if (!fg) continue;
            const g = groundOf(el);
            const r = ratio(fg, g);
            measured++;
            if (r < AA) {
              /* fg and bg are in the finding on purpose. Without them
                 every investigation starts by guessing which of nine
                 similar elements was the bad one, and three of mine
                 guessed wrong. */
              worst.push({
                where: pathOf(el),
                text: node.textContent.trim().slice(0, 24),
                fg: `rgb(${fg.map(Math.round).join(',')})`,
                bg: `rgb(${g.map(Math.round).join(',')})`,
                theme: t, skin: sk.id, ratio: Math.round(r * 100) / 100
              });
            }
          }

          /* --- and now the glyphs that are not text nodes ---

             Same floor, same grounds, same finding shape; the only
             differences are that the colour comes from
             getComputedStyle(el, pseudo) rather than the element, and
             that the pseudo's OWN background composites in front of
             the element's before the ratio is taken. A chip whose
             ::before paints a dark pill under a pale glyph is legible
             and must not be reported against the pale card behind it.

             Elements, not text nodes, obviously — but the element's
             own text is already covered above, so nothing here is
             measured twice: `where` carries the ::before / ::after
             suffix and dedupes separately.

             WHAT IS SKIPPED, AND WHY EACH ONE IS NOT A LOOPHOLE. A
             glyph nobody can see is not an accessibility failure, and
             a check that reports one gets switched off:
               - no glyph at all (see glyphOf) — a shape, not text.
               - display:none / visibility:hidden / opacity 0 on the
                 pseudo or on its element. Not painted.
               - a zero-area originating box. A pseudo on a collapsed
                 element is not on the screen. `auto` is not zero —
                 an inline pseudo computes its width to `auto` and is
                 very much visible, so only a resolved 0 counts.
               - font-size 0, the old icon-font trick.
             An aria-hidden decoration is NOT skipped. It is still
             seen, so it still has to be legible; hiding a dash from a
             screen reader says nothing about the eye. */
          const ew = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
          let host = root.nodeType === 1 ? root : null;
          do {
            if (!host) continue;
            if (/^(SCRIPT|STYLE|NOSCRIPT|OPTION|TITLE)$/.test(host.tagName)) continue;
            const own = getComputedStyle(host);
            if (own.visibility === 'hidden' || own.display === 'none') continue;
            if (parseFloat(own.opacity) === 0) continue;
            const box = host.getBoundingClientRect();
            if (box.width <= 0 || box.height <= 0) continue;
            for (const pseudo of ['::before', '::after']) {
              const ps = getComputedStyle(host, pseudo);
              if (!ps) continue;
              const glyph = glyphOf(ps.content);
              if (!glyph) continue;
              if (ps.display === 'none' || ps.visibility === 'hidden') continue;
              if (parseFloat(ps.opacity) === 0) continue;
              if (parseFloat(ps.fontSize) === 0) continue;
              const pw = parseFloat(ps.width), ph = parseFloat(ps.height);
              if (pw === 0 || ph === 0) continue;
              /* -webkit-text-fill-color wins over color where both are
                 set, and `transparent` there means the glyph is a mask
                 for something else — no foreground to measure. */
              const fill = ps.webkitTextFillColor || ps.color;
              const fg = rgb(fill === 'currentcolor' ? ps.color : fill);
              if (!fg) continue;
              const g = groundOf(host, parse(ps.backgroundColor));
              const r = ratio(fg, g);
              measured++;
              if (r < AA) {
                worst.push({
                  where: pathOf(host) + pseudo,
                  text: glyph.slice(0, 24),
                  fg: `rgb(${fg.map(Math.round).join(',')})`,
                  bg: `rgb(${g.map(Math.round).join(',')})`,
                  theme: t, skin: sk.id, ratio: Math.round(r * 100) / 100
                });
              }
            }
          } while ((host = ew.nextNode()));
        });
      }
    }
    api.applyTheme(beforeTheme);
    skinApi.applySkin(beforeSkin);
    freeze.remove();
    // One row per distinct place, not one per theme-skin pair.
    const seen = new Map();
    for (const w of worst) if (!seen.has(w.where) || seen.get(w.where).ratio > w.ratio) seen.set(w.where, w);
    const all = [...seen.values()].sort((a, b) => a.ratio - b.ratio);
    /* The cap is on what gets PRINTED, not on what was found. It used
       to be on both, and a run reporting "10 places" when there were
       173 is a run that understates the size of the job in front of
       you — which is the one number you need before deciding whether
       to fix or to escalate. */
    /* Every distinct place, not the worst ten: the cap is applied
       where the findings are PRINTED, after the per-state results
       below are merged — a cap taken here would hide a finding from
       one state behind ten from another. `measured` is how many
       text runs and glyphs were actually tested, so the size of the
       walk is a number in the report rather than a claim. */
    return { fails: all, total: all.length, measured };
  };
  const contrast = await page.evaluate(contrastProbe);
  let lowContrast = contrast.unavailable ? [] : contrast.fails;
  let lowContrastTotal = contrast.unavailable ? 0 : contrast.total;
  const contrastStates = contrast.unavailable ? [] : [{ state: 'as loaded', measured: contrast.measured, below: contrast.total }];

  /* --- colour that means something must still mean it ---

     modules.css has one rule with teeth: a coloured rule survives only
     where its hue varies to say WHICH. Folding the rest into a plain
     hairline card is most of this redesign — and the first pass folded
     in two that were carrying data. The hub's three blueprint doors
     came out with a 1px rule and the feature door's hue repainted to
     the generic hairline, so three blueprints read as two.

     Nothing else here could see it. The keys, the words, the handlers
     and the overflow are all identical on a page whose colour coding
     has quietly collapsed — which is the same reason the theme check
     exists. So: every hue group must still render more than one
     colour, at a width you can actually see. */
  const hueGroups = await page.evaluate(() => {
    /* `variant` names the class that says "this one is a different
       KIND". Where it exists, the check asks whether the design still
       SHOWS that difference — a question with an answer. Asking
       instead "do these differ?" of any group at all would flag sets
       that are legitimately uniform, and the short page has one: its
       example pairs carry no .alt, so one hue there is correct.

       The breakdown's two groups deliberately have NO variant, and
       that is a correction rather than an omission. Gating them on
       `.bd-chip.hue-library` made the check blind to precisely the bug
       it was written for: when breakdown.js wrote the wrong class
       name, the variant stopped existing, the group was skipped, and
       the run went green with every chip rendering grey. A gate that
       disappears along with the thing it guards is not a gate. These
       two are seeded above, so two elements in different categories
       are always present and distinct colours can simply be required. */
    const GROUPS = [
      { sel: '.door', variant: '.door.shorts', side: 'Top', what: 'hub blueprint doors' },
      { sel: '.start-card', variant: '.start-card.f', side: 'Left', what: 'hub start cards' },
      { sel: '.fest-card', variant: '.fest-card.t2', side: 'Left', what: 'festival tiers' },
      { sel: '.example', variant: '.example.alt', side: 'Left', what: 'worked examples' },
      { sel: '.bd-chip', side: 'Left', what: 'breakdown element chips' },
      { sel: '.bd-el', side: 'Left', what: 'breakdown element index' }
    ];
    return GROUPS.map((g) => {
      const els = [...document.querySelectorAll(g.sel)];
      /* Reported as skipped rather than dropped. A group that never
         appears on any page looks exactly like a group that passes if
         you only print the ones that ran — and the breakdown's chips
         only exist once the page has scenes, so on an empty studio
         these two assertions do not fire at all. Say so. */
      if (els.length < 2 || (g.variant && !document.querySelector(g.variant))) {
        return { what: g.what, skipped: els.length < 2 ? 'fewer than two present' : 'no variant present' };
      }
      const seen = new Set(), widths = new Set();
      els.forEach((el) => {
        const cs = getComputedStyle(el);
        seen.add(cs['border' + g.side + 'Color']);
        widths.add(parseFloat(cs['border' + g.side + 'Width']) || 0);
      });
      return { what: g.what, colours: seen.size, minWidth: Math.min(...widths) };
    });
  });
  const hueBroken = hueGroups.filter((g) => !g.skipped && (g.colours < 2 || g.minWidth < 3));

  const skinCount = skins.unavailable ? null : skins.ids.length;
  const skinFingerprints = skins.unavailable ? null : new Set(Object.values(skins.out)).size;

  // --- overflow with every phase menu OPEN ---
  // The plain overflow check above measures a page with all menus shut,
  // and missed a 260px dropdown anchored to the rightmost phase pushing
  // 96px of horizontal overflow at 375px. Open them all and measure
  // again; a dropdown that escapes the viewport is a layout bug whether
  // or not the page is scrolled sideways by default.
  const overflowOpen = await page.evaluate(() => {
    const SEL = '.sh-phase-menu, .tb-menu-panel';
    if (!document.querySelector(SEL)) return { checked: false, overflow: 0, escaped: 0 };
    document.querySelectorAll(SEL).forEach((m) => { m.hidden = false; });
    const de = document.documentElement;
    const escaped = [...document.querySelectorAll(SEL)]
      .filter((m) => {
        const r = m.getBoundingClientRect();
        return r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1);
      }).length;
    const overflow = Math.max(0, de.scrollWidth - de.clientWidth);
    document.querySelectorAll(SEL).forEach((m) => { m.hidden = true; });
    return { checked: true, overflow, escaped };
  });

  /* --- the states a page is NOT in when it loads ------------------

     docs/KNOWN-ISSUES.md §7: the walk above sees the Story page at the
     one path step it opens on and the Write page in its default Margin
     beat guide, so the structure picker (3), the step outline (4), the
     hand-off to the screenplay (6) and the Panel card were checked by
     hand and never by the gate. Each state is put on the page the way
     a person puts it there — the hash the stepper writes, the pref the
     Beat guide select writes — and the same probe runs again. Findings
     merge by place, keeping the worst ratio; `measured` is summed so
     the report says how much wider the walk is.

     LAST, deliberately: the text and key capture, the hue check and
     the overflow measurements above all describe the page AS LOADED,
     and the baseline must not move because the walk got wider. */
  const EXTRA_STATES = {
    story: [3, 4, 6].map((n) => ({ state: 'path step ' + n, hash: 'path-' + n })),
    write: [{ state: 'Panel beat guide', prefs: { key: 'fms_write_prefs_v1', set: { beatGuide: 'panel' } } }]
  };
  for (const st of EXTRA_STATES[spec.name] || []) {
    if (st.hash) {
      await page.evaluate((hash) => { location.hash = '#' + hash; }, st.hash);
      await page.waitForTimeout(400);
    } else if (st.prefs) {
      /* A device pref, outside the storage proxy's scoping, written the
         way beat-guide.js writes it: read, merge, write. */
      await page.evaluate(({ key, set }) => {
        let cur = {};
        try { cur = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (e) { cur = {}; }
        localStorage.setItem(key, JSON.stringify({ ...cur, ...set }));
      }, st.prefs);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      /* The Panel card follows the caret: put it in the first row, so
         the card carries a placed beat rather than its empty line. */
      await page.evaluate(() => {
        const f = document.querySelector('#wr-page [data-el] textarea, #wr-page [data-el] input');
        if (f) f.focus();
      });
      await page.waitForSelector('#bg-panel', { timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    const again = await page.evaluate(contrastProbe);
    if (again.unavailable) continue;
    const present = await page.evaluate((sel) => !!document.querySelector(sel),
      st.hash ? '#' + st.hash : '#bg-panel');
    contrastStates.push({ state: st.state + (present ? '' : ' (NOT REACHED)'), measured: again.measured, below: again.total });
    const byWhere = new Map(lowContrast.map((c) => [c.where, c]));
    for (const c of again.fails) {
      c.where = c.where + ' @ ' + st.state;
      if (!byWhere.has(c.where) || byWhere.get(c.where).ratio > c.ratio) byWhere.set(c.where, c);
    }
    lowContrast = [...byWhere.values()].sort((a, b) => a.ratio - b.ratio);
    lowContrastTotal = lowContrast.length;
  }
  /* A state that was asked for and not reached is a check that did not
     run, and a check that did not run must not look like one that
     passed. */
  const statesMissed = contrastStates.filter((c) => / NOT REACHED/.test(c.state)).map((c) => c.state);
  const contrastMeasured = contrastStates.reduce((a, c) => a + c.measured, 0);
  lowContrast = lowContrast.slice(0, 10);

  const liveKeys = new Set(live.keys);
  const liveWords = new Set(words(live.text));

  // Capturing a baseline records what the build produces; there is
  // nothing to compare it against yet, so skip the assertions.
  if (WRITE_BASELINE) {
    captured[spec.name] = { keys: [...liveKeys].sort(), words: [...liveWords].sort() };
    await ctx.close();
    continue;
  }

  const old = baselineFacts(spec.name);
  const missingKeys = [...old.keys].filter((k) => !liveKeys.has(k));
  const allowed = EXPECTED[spec.name] || {};
  /* The hub greets you by time of day, so exactly one of these words is
     on the page at any moment and the other three are not. A baseline
     captured at 3pm therefore fails every run after 5pm.

     This is an EXCLUSION, not an EXPECTED entry, and the difference
     matters: an allowance that stops firing is reported as stale, and
     this one genuinely fires only some of the time. The oracle cannot
     contain a clock — so the clock comes out of both sides.

     The set must cover EVERY word that varies, not just the obvious
     ones. It first held morning/afternoon/evening/late, which looks
     complete until 21:00, when the greeting becomes "Working late" and
     the word "good" leaves the page. `npm run verify` could not pass
     between 21:00 and 05:00 and nobody had run it at night yet. */
  const CLOCK = new Set(['morning', 'afternoon', 'evening', 'late', 'good', 'working']);
  /* Both clocks come out of both sides, and out of the denominator
     too — as CLOCK always was. A word the oracle cannot hold an
     opinion about is not coverage that was lost, and leaving it in the
     total would put 100% permanently out of reach. */
  const varying = (w) => CLOCK.has(w) || COUNTDOWN.has(w);
  const stable = [...new Set(old.text)].filter((w) => !varying(w));
  const gone = stable.filter((w) => !liveWords.has(w));
  const missingWords = gone.filter((w) => !(w in allowed));       // unexplained
  const explained = gone.filter((w) => w in allowed);             // deliberate
  const total = stable.length;
  const coverage = ((total - gone.length) / total) * 100;
  // Coverage counting deliberate rewording as intact — this is the
  // number that must be 100%.
  const accountedCoverage = ((total - missingWords.length) / total) * 100;
  // An allowlist entry that no longer fires is stale; say so rather
  // than letting the list rot into a set of permanent excuses.
  const staleAllowances = Object.keys(allowed).filter((w) => !gone.includes(w));

  const row = {
    page: spec.name,
    legacyKeys: old.keys.size,
    liveKeys: liveKeys.size,
    missingKeys: missingKeys.length,
    missingKeySample: missingKeys.slice(0, 8),
    textCoverage: +coverage.toFixed(2),
    accountedCoverage: +accountedCoverage.toFixed(2),
    explainedDivergences: explained.length,
    staleAllowances,
    missingWordSample: missingWords.slice(0, 200),
    steps: live.steps,
    hasMain: live.hasMain,
    inlineHandlers: live.inlineHandlers,
    idleWrites,
    hOverflowAt390: overflow,
    firstRunOverflowAt390: firstRun.overflow,
    firstRunEmptyStateSeen: firstRun.sawEmptyState,
    hOverflowMenusOpen: overflowOpen.overflow,
    menusEscapingViewport: overflowOpen.escaped,
    themes: themeCount,
    distinctThemes: themeSwatches,
    skins: skinCount,
    distinctSkins: skinFingerprints,
    skinsOverflowing: skins.unavailable ? null : skins.wide,
    hueGroups,
    modalsOpened: modals.unavailable ? null : modals.opened,
    modalInlineHandlers: modals.unavailable ? null : modals.inline,
    lowContrast,
    lowContrastTotal,
    contrastMeasured,
    contrastStates,
    firstPaintBytes: firstPaint.reduce((a, f) => a + f.bytes, 0),
    firstPaintFiles: firstPaint.length,
    firstPaintLazyLeaks: firstPaint.map((f) => f.url).filter((u) => LAZY_CHUNKS.test(u)),
    errors
  };
  report.push(row);
  measuredBudget[spec.name] = { bytes: row.firstPaintBytes, files: firstPaint.map((f) => `${f.url} ${f.bytes}`) };

  const bad = [];
  /* --- the first-paint byte budget ---------------------------------
     See the recording above. The budget is a FILE rather than a
     constant so that tightening it is a visible, reviewable edit; the
     failure says how. A page with no row in the file fails too: a page
     that is not budgeted is a page whose first paint can grow for ever
     without anyone being told. */
  if (!WRITE_BUDGET) {
    const b = (BUDGET.pages || {})[spec.name];
    if (!b || !Number.isFinite(b.bytes)) {
      bad.push(`no first-paint budget for "${spec.name}" in scripts/budget.json — ` +
        `measured ${row.firstPaintBytes} bytes; add a row, or run \`npm run verify -- --budget\` to recapture every row at 110% of what loads now`);
    } else if (row.firstPaintBytes > b.bytes) {
      bad.push(`first paint is ${row.firstPaintBytes} bytes of JS+CSS, over the ${b.bytes}-byte budget ` +
        `(${firstPaint.length} files) — shrink the page, or raise "pages.${spec.name}.bytes" in scripts/budget.json deliberately; ` +
        `\`npm run verify -- --budget\` recaptures every row at 110% of what loads now`);
    }
    /* A lazy chunk fetched on load fails by name — unless budget.json
       KNOWS about it. `knownLazyFetches` is the same shape as EXPECTED:
       a reasoned allowance that the anti-rot check after the loop fails
       the moment it stops firing, so it cannot become a permanent
       excuse. The first entry was written by the check that found it:
       cloud.js's boot() fetches the Supabase SDK on every page once a
       build carries a project URL. */
    const known = BUDGET.knownLazyFetches || {};
    for (const url of row.firstPaintLazyLeaks) {
      const name = (url.match(LAZY_CHUNKS) || [])[1];
      if (name && known[name]) { knownLeaksSeen.add(name); continue; }
      bad.push(`a lazy chunk is fetched on load: ${url} — ` +
        'supabase, pptxgen and the sample script must stay behind import() (vite.config.js manualChunks)');
    }
  }
  if (missingKeys.length) bad.push(`${missingKeys.length} data-keys missing`);
  if (missingWords.length) {
    bad.push(`${missingWords.length} unexplained missing words (${missingWords.slice(0, 6).join(', ')})`);
  }
  if (staleAllowances.length) {
    bad.push(`stale allowlist entries: ${staleAllowances.join(', ')}`);
  }
  if (live.inlineHandlers) bad.push(`${live.inlineHandlers} inline handlers`);
  if (!modals.unavailable && modals.inline > 0) {
    bad.push(
      `${modals.inline} inline handler(s) inside modal markup — inert under the shipped CSP ` +
      `(opened: ${modals.opened.join(', ') || 'none'})`
    );
  }
  if (!modals.unavailable && modals.overflow > 0) {
    bad.push(`${modals.overflow}px horizontal overflow at 390px with modals open`);
  }
  if (idleWrites > 0) bad.push(`${idleWrites} idle writes`);
  if (overflow > 0) bad.push(`${overflow}px horizontal overflow at 390px`);
  if (firstRun.overflow > 0) {
    bad.push(`${firstRun.overflow}px horizontal overflow at 390px BEFORE a project exists`
      + ' (the first-run state — see the note where it is measured)');
  }
  if (overflowOpen.checked && overflowOpen.overflow > 0) {
    bad.push(`${overflowOpen.overflow}px horizontal overflow at 390px with the dropdowns open`);
  }
  if (overflowOpen.checked && overflowOpen.escaped > 0) {
    bad.push(`${overflowOpen.escaped} dropdown(s) escape the viewport at 390px`);
  }
  if (themeSwatches !== null && themeSwatches !== themeCount) {
    bad.push(
      `themes do not swap (${themeSwatches} distinct background(s) across ` +
      `${themeCount}: ${themes.names.join('/')})`
    );
  }
  if (skinCount !== null && skinCount !== SKIN_FILES.length) {
    bad.push(
      `${SKIN_FILES.length} skin file(s) on disk but ${skinCount} reached the page ` +
      `(disk: ${SKIN_FILES.join(', ')}; page: ${skins.ids.join(', ')})`
    );
  }
  if (skinFingerprints !== null && skinFingerprints !== skinCount) {
    bad.push(
      `skins do not swap (${skinFingerprints} distinct look(s) across ${skinCount} skins)`
    );
  }
  for (const c of lowContrast) {
    bad.push(
      `text invisible on its surface: ${c.where} at ${c.ratio}:1 ` +
      `(${c.theme} + ${c.skin}, ${c.fg} on ${c.bg}, "${c.text}")`
    );
  }
  if (lowContrastTotal > lowContrast.length) {
    bad.push(`...and ${lowContrastTotal - lowContrast.length} more place(s) below 4.5:1 (worst 10 shown)`);
  }
  for (const m of statesMissed) bad.push(`contrast walk: state "${m.replace(' (NOT REACHED)', '')}" was asked for and not reached`);
  for (const g of hueBroken) {
    bad.push(
      `${g.what}: colour no longer distinguishes them ` +
      `(${g.colours} distinct hue(s), thinnest rule ${g.minWidth}px)`
    );
  }
  if (!skins.unavailable && skins.wide.length) {
    bad.push(`horizontal overflow at 390px under skin(s): ${skins.wide.join(', ')}`);
  }
  if (errors.length) bad.push(`${errors.length} console/page errors`);
  if (!live.hasMain) bad.push('no <main id="main">');
  if (bad.length) { failures++; row.FAIL = bad; }

  await ctx.close();
}

/* ---- the first-paint table, and the budget file ---------------- */
{
  const kb = (n) => (n / 1024).toFixed(1).padStart(7) + ' KB';
  console.log('\nfirst paint (same-origin JS+CSS, as loaded, before any project exists):');
  console.log('  ' + 'page'.padEnd(14) + 'files'.padStart(6) + '      loaded' + '      budget' + '  lazy chunks fetched on load');
  for (const spec of PAGES) {
    const m = measuredBudget[spec.name];
    if (!m) continue;
    const b = (BUDGET.pages || {})[spec.name];
    const leaks = m.files.map((f) => f.split(' ')[0]).filter((u) => LAZY_CHUNKS.test(u)).map((u) => u.replace(/^\/assets\//, ''));
    console.log('  ' + spec.name.padEnd(14) + String(m.files.length).padStart(6) + '  ' + kb(m.bytes)
      + '  ' + (b && Number.isFinite(b.bytes) ? kb(b.bytes) : '     (none)') + '  ' + (leaks.join(', ') || '-'));
  }
  /* The anti-rot half of knownLazyFetches: an allowance that no page
     fired is stale, and a stale allowance is a check that has quietly
     stopped checking. Fix the leak, delete the row, in one commit. */
  if (!WRITE_BUDGET) {
    const stale = Object.keys(BUDGET.knownLazyFetches || {}).filter((k) => !knownLeaksSeen.has(k));
    if (stale.length) {
      failures++;
      report.push({ page: 'first-paint budget', FAIL: [`stale knownLazyFetches entr${stale.length === 1 ? 'y' : 'ies'} in scripts/budget.json: ${stale.join(', ')} — no page fetched it on load any more; delete the row`] });
      console.log(`✗ stale knownLazyFetches in scripts/budget.json: ${stale.join(', ')} (no longer fetched on load — delete the row)`);
    } else if (knownLeaksSeen.size) {
      console.log(`⚠ known lazy-chunk fetch(es) on load, allowed by scripts/budget.json with a reason: ${[...knownLeaksSeen].join(', ')}`);
    }
  }
  if (WRITE_BUDGET) {
    const pages = {};
    for (const spec of PAGES) {
      const m = measuredBudget[spec.name];
      if (!m) continue;
      // 110%, rounded up to the next KB, so the row reads as a figure rather than a measurement.
      pages[spec.name] = { bytes: Math.ceil((m.bytes * 1.1) / 1024) * 1024, measured: m.bytes, files: m.files.length };
    }
    fs.writeFileSync(BUDGET_FILE, JSON.stringify({
      _about: 'The most JS+CSS (same-origin, raw bytes) each page may fetch on its first load, before a project ' +
        'exists. Judged by npm run verify. Each row was captured at 110% of what loaded at the time; tighten a row ' +
        'by editing it, recapture every row with `npm run verify -- --budget` (a deliberate act, like --baseline, ' +
        'and worth a sentence in the commit). The lazy chunks — supabase-*, pptxgen-*, sample.dragon.script-* — ' +
        'are failed by name if a first paint ever fetches one, whatever the total says.',
      capturedAt: new Date().toISOString(),
      // Carried over, never recaptured: each row is a reasoned allowance.
      knownLazyFetches: BUDGET.knownLazyFetches || {},
      pages
    }, null, 2) + '\n');
    console.log(`\n✓ budget written — ${Object.keys(pages).length} pages, scripts/budget.json`);
  }
}

if (WRITE_BASELINE) {
  const sha = (() => {
    try {
      return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
    } catch (e) { return 'unknown'; }
  })();
  fs.writeFileSync(BASELINE_FILE, JSON.stringify({
    _about:
      'Reference for npm run verify. Regenerate ONLY with `npm run build && npm run baseline`, ' +
      'and only when the current output is known good — it becomes the thing every later run is judged against.',
    capturedAt: new Date().toISOString(),
    capturedFrom: sha,
    provenance:
      'Captured from the build at the commit above. The FIRST baseline (16bf3b4) came from a build that ' +
      'still passed 100% against the original legacy/ pages, so the migration guarantee entered the chain ' +
      'there; every later capture inherits whatever the build was at that moment, which is why re-baselining ' +
      'is a deliberate act and belongs in a commit message.',
    pages: captured
  }, null, 2) + '\n');
  await browser.close();
  server.close();
  const n = Object.keys(captured).length;
  const keys = Object.values(captured).reduce((a, p) => a + p.keys.length, 0);
  console.log(`\n✓ baseline written — ${n} pages, ${keys} data-keys, from ${sha}`);
  console.log('  scripts/baseline.json');
  process.exit(0);
}

/* ---- scripts-off palette probe ----------------------------------
   The theme check above runs the page's scripts, so the four JS
   fallbacks in chrome.js could all be flipped to the wrong theme and
   the run would stay green as long as they agreed with each other —
   the bare `:root` half of tokens.css is invisible to it. CLAUDE.md
   names the check that sees it and says it was run by hand: load the
   built page with SCRIPTS OFF and ask what the ground already is.

   Which theme is the default is READ, not named. The bare `:root`
   block declares one palette; whichever `[data-theme="…"]` block
   carries the same `--paper` is the default theme, and that is what
   the ground must be before any script runs. The run also asks the
   opposite question: with the OS preferring the OTHER scheme, the
   `prefers-color-scheme` block must already paint that theme — so
   neither kind of visitor sees a flash of the wrong palette.

   Two more things nothing can fix after the fact are asserted on the
   same scripts-off document: `color-scheme` is set (a form control or
   a scrollbar painted in the other scheme is the one flash CSS cannot
   cover), and `--sk-radius` resolves (studio.css declares its shapes
   on bare `:root` so the first paint is right before skin.js runs —
   the "skin defaults belong on bare :root" trap). */
let scriptsOff = { checked: false };
{
  const css = fs.readFileSync(path.join(ROOT, 'src', 'styles', 'tokens.css'), 'utf8');
  const blockAfter = (idx) => {
    const open = css.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
    }
    return '';
  };
  const decl = (block, prop) => ((block.match(new RegExp('(?:^|[;\\s])' + prop.replace(/[-]/g, '\\-') + '\\s*:\\s*([^;]+);')) || [])[1] || '').trim();
  const bare = blockAfter(css.search(/^:root\s*\{/m));
  const themed = {};
  for (const m of css.matchAll(/^:root\[data-theme="([a-z]+)"\]\s*\{/gm)) themed[m[1]] = blockAfter(m.index);
  const media = {};
  for (const m of css.matchAll(/@media \(prefers-color-scheme:\s*(light|dark)\)\s*\{/g)) media[m[1]] = blockAfter(m.index);
  const hexToRgb = (hex) => {
    const h = hex.replace('#', '');
    const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return `rgb(${parseInt(f.slice(0, 2), 16)}, ${parseInt(f.slice(2, 4), 16)}, ${parseInt(f.slice(4, 6), 16)})`;
  };
  const defaultPaper = decl(bare, '--paper');
  const defaultScheme = decl(bare, 'color-scheme');
  const defaultTheme = Object.keys(themed).find((t) => decl(themed[t], '--paper') === defaultPaper) || null;
  const otherScheme = defaultScheme === 'dark' ? 'light' : 'dark';
  const otherPaper = media[otherScheme] ? decl(media[otherScheme], '--paper') : '';

  const probeFacts = { defaultTheme, defaultScheme, defaultPaper, otherScheme, otherPaper };
  const bad = [];
  if (!defaultTheme) bad.push(`bare :root's --paper (${defaultPaper || 'missing'}) matches no [data-theme] block — cannot tell which theme is the default`);
  if (!defaultScheme) bad.push('bare :root declares no color-scheme');
  if (!otherPaper) bad.push(`no @media (prefers-color-scheme: ${otherScheme}) block restates --paper`);

  const results = [];
  if (!bad.length) {
    const HOST = `http://localhost:${PORT}/__scripts-off-probe.html`;
    for (const [scheme, wantPaper] of [[defaultScheme, defaultPaper], [otherScheme, otherPaper]]) {
      const pctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
      const ppage = await pctx.newPage();
      await ppage.route('**/__scripts-off-probe.html', (route) => route.fulfill({
        status: 200, contentType: 'text/html', body: '<!doctype html><html><head><title>probe</title></head><body></body></html>'
      }));
      await ppage.goto(HOST, { waitUntil: 'load' });
      for (const spec of PAGES) {
        const facts = await ppage.evaluate(async (src) => {
          const f = document.createElement('iframe');
          f.setAttribute('sandbox', 'allow-same-origin');   // same origin so we can read it; NO allow-scripts
          f.style.cssText = 'width:1200px;height:800px';
          const loaded = new Promise((res) => { f.onload = res; setTimeout(res, 8000); });
          f.src = src;
          document.body.appendChild(f);
          await loaded;
          // Give pending stylesheets a frame; fonts can fail, the sheets cannot.
          await new Promise((r) => setTimeout(r, 250));
          const d = f.contentDocument;
          if (!d || !d.documentElement) { f.remove(); return { error: 'no document' }; }
          const de = d.documentElement;
          const cs = d.defaultView.getComputedStyle(de);
          const out = {
            scriptsRan: !!d.querySelector('#app') && d.querySelector('#app').children.length > 0,
            dataTheme: de.getAttribute('data-theme'),
            dataSkin: de.getAttribute('data-skin'),
            htmlBg: cs.backgroundColor,
            bodyBg: d.body ? d.defaultView.getComputedStyle(d.body).backgroundColor : null,
            colorScheme: cs.colorScheme,
            skRadius: cs.getPropertyValue('--sk-radius').trim(),
            paper: cs.getPropertyValue('--paper').trim(),
            sheets: d.styleSheets.length
          };
          f.remove();
          return out;
        }, `http://localhost:${PORT}/${spec.page}`);
        results.push({ page: spec.name, scheme, ...facts });
        const want = hexToRgb(wantPaper);
        const ground = facts.bodyBg && facts.bodyBg !== 'rgba(0, 0, 0, 0)' ? facts.bodyBg : facts.htmlBg;
        if (facts.error) { bad.push(`${spec.name} (prefers ${scheme}): ${facts.error}`); continue; }
        if (facts.scriptsRan) bad.push(`${spec.name} (prefers ${scheme}): the sandbox ran scripts — the probe is not measuring what it claims`);
        if (facts.dataTheme) bad.push(`${spec.name} (prefers ${scheme}): [data-theme="${facts.dataTheme}"] is set with scripts off — the markup is choosing a theme`);
        if (ground !== want) bad.push(`${spec.name} (prefers ${scheme}): scripts-off ground is ${ground}, the ${scheme === defaultScheme ? defaultTheme + ' (default)' : otherScheme} theme's --paper is ${want} (${wantPaper}) — a flash of the wrong palette`);
        if (facts.colorScheme !== scheme) bad.push(`${spec.name} (prefers ${scheme}): color-scheme is "${facts.colorScheme}" with scripts off, expected "${scheme}" — form controls and scrollbars will flash`);
        if (!facts.skRadius || !/^\d/.test(facts.skRadius)) bad.push(`${spec.name} (prefers ${scheme}): --sk-radius is "${facts.skRadius}" with scripts off — the skin's defaults are not on bare :root`);
      }
      await pctx.close();
    }
  }
  scriptsOff = { checked: !!results.length, ...probeFacts, probed: results.length, pages: results.length / 2 };
  if (bad.length) { failures++; scriptsOff.FAIL = bad; }
  report.push({ page: 'scripts-off palette', ...scriptsOff });
  console.log(bad.length
    ? `✗ scripts-off palette: ${bad.length} finding(s)\n  ` + bad.slice(0, 8).join('\n  ')
    : `✓ scripts-off palette: ${results.length / 2} pages x 2 OS preferences paint the right ground before any script runs ` +
      `(default ${defaultTheme} = ${defaultPaper}; prefers-${otherScheme} = ${otherPaper}; color-scheme and --sk-radius set)`);
}

/* ---- fragment-target sweep ---------------------------------------
   "A nav target must not depend on data existing" (CLAUDE.md): six of
   the eighteen fragment hrefs in navigation.json once lived only on
   the POPULATED branch of a page's render, so on a studio with no
   scenes the phase menu looked broken to exactly the person who had
   never opened the page. The per-page checks above load each page at
   its URL with no fragment, so they cannot tell whether an anchor
   resolves — and a sticky band with the wrong `scroll-padding-top`
   is a second bug with the same symptom: the heading lands behind the
   chrome, which reads as the page landing in the wrong place.

   So: every fragment href the app offers — navigation.json's modules,
   guides and shelves; the hub's start cards, section links and the
   journey strip; and every target the blueprint drawer and the
   "DO THIS IN" tools resolve to from steps.stages.json — is loaded as
   `page.html#frag` in THREE studio states (no project, an empty
   project, the seeded Dragon sample), and each must (a) exist in the
   DOM and (b) land with its top at or below the pinned chrome
   (`--sh-cover-h`, falling back to `--sh-chrome-h`) and above the
   fold. 0 missing and 0 obscured is the bar, and both halves matter.

   IN VERIFY RATHER THAN ITS OWN SCRIPT, because the three states are
   the gate's own fixtures (the same createProject() and the hub's own
   sample button), and because a target that stops resolving is a
   regression in the thing every commit is supposed to be checked
   against. The cost is a few minutes of page loads; a separate
   `prove:` script would be run by nobody until the menu looked broken
   again. */
let fragments = { checked: false };
{
  const nav = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'navigation.json'), 'utf8'));
  const stages = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'steps.stages.json'), 'utf8'));
  const known = new Set(PAGES.map((p) => p.page));
  const targets = new Map();   // "page.html#frag" -> [sources]
  const add = (href, source) => {
    if (!href || !href.includes('#')) return;
    const [file, frag] = href.split('#');
    if (!frag) return;
    const page = (file || 'index.html').replace(/^\.\//, '');
    if (!known.has(page)) return;
    const key = page + '#' + frag;
    if (!targets.has(key)) targets.set(key, new Set());
    targets.get(key).add(source);
  };
  // navigation.json: every href anywhere in it
  const modulesById = new Map();
  JSON.stringify(nav, (k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.href) add(v.href, 'navigation.json' + (v.id ? ' ' + v.id : ''));
      if (v.id && v.href) modulesById.set(v.id, v.href);
      for (const g of v.guide || []) if (g && g.href) add(g.href, 'navigation.json guide');
    }
    return v;
  });
  // steps.stages.json: the drawer's "Open in the blueprint" and the step row's DO THIS IN tools
  const BP = { feature: 'feature.html', production: 'feature.html', short: 'short.html' };
  for (const [key, info] of Object.entries(stages.steps || {})) {
    const [ns, id] = key.split(':');
    if (!info || !Array.isArray(info.tools) || !info.tools.length) continue;
    if (BP[ns]) add(BP[ns] + '#' + id, 'blueprint drawer');
    for (const t of info.tools) {
      if (typeof t === 'string') add(modulesById.get(t), 'steps.stages tool ' + t);
      else if (t && t.href) add(t.href, 'steps.stages tool');
    }
  }
  // the parts' covers
  for (const [ns, parts] of Object.entries(stages.parts || {})) for (const p of parts) add(BP[ns] + '#' + p.cover, 'blueprint part cover');

  const ORIGIN = `http://localhost:${PORT}`;
  const sweep = async (label, prepare) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const pg = await ctx.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.goto(`${ORIGIN}/index.html`, { waitUntil: 'networkidle' });
    const prepared = await prepare(pg);
    const rows = [];
    for (const key of [...targets.keys()].sort()) {
      const [page, frag] = key.split('#');
      await pg.goto(`${ORIGIN}/${page}#${frag}`, { waitUntil: 'load' }).catch((e) => errs.push(key + ': ' + e.message));
      const measure = () => pg.evaluate((id) => {
        const el = document.getElementById(id);
        if (!el) return { missing: true };
        const de = document.documentElement;
        const cs = getComputedStyle(de);
        const px = (v) => parseFloat(v) || 0;
        const cover = px(cs.getPropertyValue('--sh-cover-h')) || px(cs.getPropertyValue('--sh-chrome-h'));
        const r = el.getBoundingClientRect();
        const hidden = !!el.closest('[hidden]') || (r.width === 0 && r.height === 0);
        return { top: Math.round(r.top), cover: Math.round(cover), vh: innerHeight, hidden, scrollY: Math.round(scrollY) };
      }, frag);
      /* The verdict is the SETTLED position. html has scroll-behavior:
         smooth and a jump to the end of the feature blueprint travels
         ~72,000px in about 1.3s; the tab strip re-lands a frame after
         it opens; and the band itself can change height when the spy
         names a new stage. A measurement taken at 900ms passed
         #phase-4 in one state and failed it in another on the same
         build — the difference was which side of the band's growth
         the sample fell. So: wait past the longest scroll, measure,
         and give a bad answer one more second to become good. */
      await pg.waitForTimeout(1700);
      let m = await measure();
      const ok = (x) => !x.missing && !x.hidden && x.top >= x.cover - 1 && x.top < x.vh;
      if (!ok(m)) { await pg.waitForTimeout(1000); m = await measure(); }
      rows.push({ key, ...m, ok: ok(m) });
    }
    await ctx.close();
    return { label, prepared, rows, errs };
  };

  /* The sample, through the hub's own button — the same path a person
     takes, so the lazy script import and every model it seeds are the
     real ones. */
  const prepareSample = async (pg) => {
    const btn = await pg.$('[data-action="sample-project"]');
    if (!btn) return false;
    await btn.click();
    try {
      await pg.waitForFunction(() => {
        const S = window.StudioStore; const p = S && S.currentProject();
        return !!p && JSON.parse(localStorage.getItem('fms_scenes_v1') || '{}').scenes?.length > 10;
      }, null, { timeout: 15000 });
    } catch (e) { return false; }
    await pg.waitForTimeout(600);
    return true;
  };

  /* The hub's own fragment links — the journey strip's stage cards, the
     start cards, the section links — harvested from the rendered hub
     with a project open (the strip is hidden without one), BEFORE the
     sweeps, so every state tests them. */
  {
    const hctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const hp = await hctx.newPage();
    await hp.goto(`${ORIGIN}/index.html`, { waitUntil: 'networkidle' });
    await prepareSample(hp);
    const harvested = await hp.evaluate(() =>
      [...document.querySelectorAll('#journey a[href], .start-card[href], .ql[href], .hero a[href^="#"], .nav-link[href^="#"], .eps-tour-item[href]')]
        .map((a) => a.getAttribute('href')));
    harvested.forEach((h) => add(h.startsWith('#') ? 'index.html' + h : h, 'hub'));
    await hctx.close();
  }

  const states = [];
  states.push(await sweep('no project', async () => true));
  states.push(await sweep('empty project', async (pg) => pg.evaluate(() => {
    const S = window.StudioStore;
    if (!S) return false;
    if (!S.currentProject()) S.createProject({ title: 'Verification', format: 'feature' });
    return !!S.currentProject();
  })));
  states.push(await sweep('seeded sample', prepareSample));

  const bad = [];
  const summary = states.map((s) => {
    const missing = s.rows.filter((r) => r.missing).map((r) => r.key);
    const hidden = s.rows.filter((r) => !r.missing && r.hidden).map((r) => r.key);
    const obscured = s.rows.filter((r) => !r.missing && !r.hidden && !r.ok)
      .map((r) => `${r.key} (top ${r.top}px vs chrome ${r.cover}px, fold ${r.vh}px)`);
    if (!s.prepared) bad.push(`state "${s.label}" could not be prepared — its ${s.rows.length} loads measured the wrong studio`);
    if (missing.length) bad.push(`${s.label}: ${missing.length} fragment target(s) missing from the DOM: ${missing.slice(0, 8).join(', ')}`);
    if (hidden.length) bad.push(`${s.label}: ${hidden.length} fragment target(s) present but hidden: ${hidden.slice(0, 8).join(', ')}`);
    if (obscured.length) bad.push(`${s.label}: ${obscured.length} fragment target(s) land behind the chrome or below the fold: ${obscured.slice(0, 8).join('; ')}`);
    if (s.errs.length) bad.push(`${s.label}: ${s.errs.length} page error(s): ${s.errs.slice(0, 3).join(' | ')}`);
    return { state: s.label, prepared: s.prepared, targets: s.rows.length, missing: missing.length, hidden: hidden.length, obscured: obscured.length, pageErrors: s.errs.length };
  });
  fragments = { checked: true, targets: targets.size, states: summary };
  if (bad.length) { failures++; fragments.FAIL = bad; }
  report.push({ page: 'fragment targets', ...fragments });
  console.log((bad.length ? '✗' : '✓') + ` fragment targets: ${targets.size} hrefs x ${states.length} states — `
    + summary.map((s) => `${s.state}: ${s.missing} missing, ${s.hidden} hidden, ${s.obscured} obscured of ${s.targets}`).join('; '));
  if (bad.length) bad.forEach((b) => console.log('  ' + b));
}

/* ---- backup round trip --------------------------------------
   Export is the ONLY backup a local-first app has, so it gets its own
   assertion rather than riding on the per-page diff.

   v1 read the per-project keys straight off localStorage, where the
   storage proxy resolved them to whichever project was open — so a file
   labelled "full studio backup" held exactly one film, and the other
   projects were gone the moment the browser was. Nothing in the page
   diff could see it: the hub's markup is identical either way.

   Two projects out, two projects back, with their contents matched. */
const rtCtx = await browser.newContext({
  viewport: { width: 1280, height: 900 }
});
const rtPage = await rtCtx.newPage();
const rtErrors = [];
rtPage.on('pageerror', (e) => rtErrors.push(e.message));
await rtPage.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'networkidle' });

const exported = await rtPage.evaluate(async () => {
  const S = window.StudioStore;
  if (!S) return { unavailable: true };
  S.listProjects().forEach((p) => S.deleteProject(p.id));
  /* Seed EVERY scoped key, not just the feature blueprint.

     The backup map is a hand-maintained list, and this project has now
     added seven model keys in a day — scenes, contacts, shots, script,
     locations, workbench, dissect. A key that is registered in
     SCOPED_KEYS but missed in hub.js's PROJECT_KEYS is exported by
     nothing and restored by nothing, and the user finds out when a
     restore comes back empty. That exact bug has happened here before,
     to the export that called itself a full studio backup.

     Marking every key per project also proves the export keeps the two
     projects' data apart, which a single-key test cannot. */
  const seed = (tag) => S.SCOPED_KEYS.forEach((k) => {
    const body = { __rt: tag + '-' + k };
    if (k === 'fms_filmmaker_combined_v1') body.lad_1_logline = tag + '-CONTENT';
    localStorage.setItem(k, JSON.stringify(body));
  });
  const a = S.createProject({ title: 'RT Alpha', format: 'feature' });
  S.setCurrentProject(a.id);
  seed('ALPHA');
  const b = S.createProject({ title: 'RT Beta', format: 'short' });
  S.setCurrentProject(b.id);
  seed('BETA');

  // Capture the blob instead of letting the browser download it.
  let blob = null;
  const origCreate = URL.createObjectURL;
  const origClick = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = function (b2) { blob = b2; return 'blob:verify-stub'; };
  HTMLAnchorElement.prototype.click = function () {};
  document.querySelector('[data-action="export-all"]').click();
  URL.createObjectURL = origCreate;
  HTMLAnchorElement.prototype.click = origClick;
  return { text: blob ? await blob.text() : null };
});

let backup = { checked: false };
if (!exported.unavailable && exported.text) {
  const parsed = JSON.parse(exported.text);
  const loglines = Object.values(parsed.data || {})
    .map((d) => d.feature_blueprint && d.feature_blueprint.lad_1_logline)
    .filter(Boolean).sort();

  // Wipe, then re-import the captured file through the real input path.
  await rtPage.evaluate((text) => {
    const S = window.StudioStore;
    S.listProjects().forEach((p) => S.deleteProject(p.id));
    window.confirm = () => true;
    window.alert = () => {};
    const input = document.getElementById('importAllFile');
    const dt = new DataTransfer();
    dt.items.add(new File([text], 'backup.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, exported.text);

  // importV2 finishes with location.reload()
  await rtPage.waitForLoadState('networkidle').catch(() => {});
  await rtPage.waitForTimeout(1200);

  const restored = await rtPage.evaluate(() => {
    const S = window.StudioStore;
    const read = (k, id) => {
      try { return JSON.parse(S.rawGet(k + '__' + id) || '{}'); } catch (e) { return {}; }
    };
    return S.listProjects().map((p) => {
      const tag = p.title.replace('RT ', '').toUpperCase();
      const lost = S.SCOPED_KEYS.filter((k) => read(k, p.id).__rt !== tag + '-' + k);
      return {
        title: p.title,
        logline: read('fms_filmmaker_combined_v1', p.id).lad_1_logline || null,
        keysChecked: S.SCOPED_KEYS.length,
        keysLost: lost
      };
    }).sort((x, y) => (x.title > y.title ? 1 : -1));
  });

  backup = {
    checked: true,
    exportVersion: parsed._version,
    projectsInFile: (parsed.projects || []).length,
    loglinesInFile: loglines,
    projectsRestored: restored.length,
    restored,
    pageErrors: rtErrors
  };

  const bad = [];
  if (parsed._version < 2) bad.push(`export is v${parsed._version}, expected v2+`);
  if ((parsed.projects || []).length !== 2) {
    bad.push(`export listed ${(parsed.projects || []).length} project(s), expected 2`);
  }
  if (loglines.join('|') !== 'ALPHA-CONTENT|BETA-CONTENT') {
    bad.push(`export carried [${loglines.join(', ')}], expected both projects' content`);
  }
  if (restored.length !== 2) bad.push(`restored ${restored.length} project(s), expected 2`);
  restored.forEach((r) => {
    if (r.keysLost && r.keysLost.length) {
      bad.push(`${r.title}: ${r.keysLost.length} of ${r.keysChecked} scoped keys did not survive the backup (${r.keysLost.join(', ')})`);
    }
  });
  const restoredLoglines = restored.map((r) => r.logline).sort().join('|');
  if (restoredLoglines !== 'ALPHA-CONTENT|BETA-CONTENT') {
    bad.push(`restored content [${restoredLoglines}], expected both projects' content`);
  }
  if (bad.length) { failures++; backup.FAIL = bad; }
} else {
  backup.FAIL = ['could not capture an export blob'];
  failures++;
}
report.push({ page: 'backup round trip', ...backup });

await rtCtx.close();
await browser.close();
server.close();

console.log(JSON.stringify(report, null, 2));
console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ all pages pass');
process.exit(failures ? 1 : 0);
