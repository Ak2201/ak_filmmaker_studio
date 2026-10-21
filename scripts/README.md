# scripts/ — the gate, the tests, the proofs and the generators

Last reviewed: 2026-10-19

Everything here is plain Node (`.mjs`). Nothing in `scripts/` ships to users;
it is what keeps the build honest and what regenerates committed assets.
`CLAUDE.md` ("Commands", "The verification workflow") is the authority on
WHY each check exists; this file is the map of WHERE each one is and HOW it
is wired. The npm names below are read from `package.json`; if a script is
not in `package.json` it says so.

## How they are wired together

| Entry point | What it runs |
| --- | --- |
| `npm run test:all` | Every no-browser `test:*` check (about 60, in `package.json`'s order), starting with `test:undef`. Also run by CI's `tests` job (with a Postgres 16 service for `test:schema`). |
| `npm run ship` | `test:all`, `build:open`, `verify`, the open-build proofs, `build` (gated), `test:ai-lazy`, the gated-build proofs, `build:extension` + `prove:extension`, `build:verify`, `prove:growth`, `prove:ai-coverage`. The full local release gate (`docs/BRANCHING.md`). |
| `.github/workflows/gate.yml` | Three parallel jobs on PRs into `main`/`develop` and pushes to `develop`/`main`: **tests** (`test:all`), **verify** (`build:open`, `verify`, then `prove:adoption`, `prove:story-path`, `prove:dialogs`, `prove:script`, `prove:ai-desk`), **proofs** (`build`, `test:ai-lazy`, `prove:gate`, `prove:billing`, `prove:storage`, `prove:cloud-delete`, `prove:drive`, `prove:sw`, `build:extension`, `prove:extension`, `build:verify`, `prove:growth`, `prove:ai-coverage`, `prove:nav` with `PROVE_DIST=dist-verify`). |
| `.github/workflows/smoke.yml` | `scripts/smoke-production.mjs`, on a successful Vercel production deploy (or by hand). |

Two builds matter: `npm run build` is the gated build (what the hosts run),
`npm run build:open` is `VITE_SITE_GATE=off` into `dist/` and is the only build
`verify` accepts; `npm run build:verify` writes the open build to
`dist-verify/` for the proofs that must not share `dist/`.

In `package.json` but in neither `test:all`, `ship` nor CI (run by hand):
`prove:stage-guide`, `prove:board-frames`, `test:videos:online`
(needs the network), `density`, `live-checks`, `smoke`, `demo`, `thumbs`,
`shots`, `record:marketing`, `make:marketing` (its drift check
`test:marketing` IS in `test:all`). In `ship` but not CI: `prove:tamil`,
`prove:walk`. In CI but not `ship`: `prove:ai-desk`, `prove:nav`.

Not in `package.json` at all: `prove-admin-health.mjs` and
`prove-admin-people.mjs` (console v2 tabs; each file's header gives its
own command line, an open build and `PROVE_DIST`/`PROVE_PORT`), and the
two probe files described under "Loose files".

## 1. verify and baseline

| File | npm | Purpose |
| --- | --- | --- |
| `verify-migration.mjs` | `verify`, `baseline` | THE gate. Serves `dist/` (open build only), loads every page in Chromium and diffs it against `baseline.json`: every `data-key`, word coverage with the `EXPECTED` allowlist, inline handlers, idle `localStorage` writes, 390px overflow, console errors, theme/skin checks, the AA contrast walk, the scripts-off probe, the backup round trip. `-- --budget` recaptures `budget.json`. `VERIFY_PORT` picks the port (default 5321). |
| `baseline.json` | | What verify diffs against. Recapture is deliberate (`npm run baseline`), never a fix for a red run. |
| `budget.json` | | First-paint byte budget (110%) and the lazy chunks a first paint must not fetch. |
| `density.mjs` | `density` | A design-density report. Measures, asserts nothing. |

## 2. test-*.mjs — no browser, run under Node (all in `test:all` unless noted)

About 60 files, one per model or derivation (`test-story`, `test-screenplay`,
`test-budget-kpis`, `test-stripboard`, `test-sync`, `test-plans`, ...). They
import the real `src/lib` modules through `node-seams.mjs`. Run one with
`npm run test:<name>` (the name is the file name minus `test-`, with a few
exceptions: `test-home-stage` is `test:homestage`, `test-page-file` is
`test:pagefile`, `test-return-to` is `test:returnto`, `test-trial-countdown`
is `test:countdown`, `test-write-route` runs inside `test:blueprint-route`).

Worth knowing:

- `test-schema.mjs` (`test:schema`) loads the WHOLE schema from
  `supabase/schema/` into a scratch PostgreSQL with `schema-tests/shim.sql`,
  then runs the `schema-tests/*.sql` checks with real role switches. It needs
  a local Postgres (CLAUDE.md "Commands" has the macOS recipe; CI uses a
  service container and `PGHOST`/`PGUSER`/`PGPASSWORD`).
- `test-pdf-text.mjs` builds its inputs with `pdf-fixtures/make-pdf.mjs`.
- `test-marketing.mjs` fails when the generated public pages drift from
  `src/data/marketing-*.json`; `--fixture` runs it against
  `fixtures/marketing-pages.fixture.json` (media existence check skipped).
- `test:usage-names` is `make-usage-names-sql.mjs --check` (see section 5).
- `test:ai-desk` (`test-ai-desk.mjs`) is the last step of `test:all`: the
  AI Desk's line diff and partial-accept merge, in Node.

## 3. check-*.mjs — static checks over the source (no browser)

| File | npm | Checks |
| --- | --- | --- |
| `check-undeclared.mjs` | `test:undef` | Parses `src/` with acorn; fails on an identifier used and never declared or imported. The only check that can see `motion-app.js` (inert under webdriver). First step of `test:all`. |
| `check-layers.mjs` | `test:layers` | `src/ui` and `src/pages` never learn how data is stored (`docs/ARCHITECTURE.md`). |
| `check-brand.mjs` | `test:brand` | The product name lives only in `src/data/brand.json`. |
| `check-dialogs.mjs` | `test:dialogs` | No native `confirm`/`alert`/`prompt` anywhere. |
| `check-testimonials.mjs` | `test:testimonials` | No invented social proof. |
| `check-ai-lazy.mjs` | `test:ai-lazy` | `src/lib/ai.js` stays out of every built page's first-paint graph. Needs a build; in `ship` and CI's `proofs` job, not in `test:all`. |
| `check-videos-online.mjs` | `test:videos:online` | Asks YouTube oEmbed whether each approved video id exists. Network; manual only. |

## 4. prove-*.mjs — browser proofs (Playwright + Chromium, against `dist/`)

Each drives the built site in a real browser; most serve `dist/` on their own
port. Which build each needs is in its header: gate-OFF (`build:open`) for
anything that loads pages signed out; the gated build for `prove:gate`,
`prove:storage`, `prove:sw` and the like. `PW_CHROMIUM` points at a Chromium
binary when Playwright's default is not installed. A failing proof's first
suspect is the proof (CLAUDE.md, item 20).

| npm | File | Proves |
| --- | --- | --- |
| `prove:gate` | `prove-gate.mjs` | Invite gate, device lock, admin, screening room, site gate. Refuses the open build. |
| `prove:billing` | `prove-billing.mjs` | A purchase end to end against a faked Razorpay. |
| `prove:storage` | `prove-storage.mjs` | Storage and sync paths. |
| `prove:cloud-delete` | `prove-cloud-delete.mjs` | Cloud delete behaviour. |
| `prove:drive` | `prove-drive.mjs` | Drive backup against a faked Drive. |
| `prove:sw` | `prove-sw.mjs` | The service worker against a cleanUrls host (the redirected-response trap). |
| `prove:extension` | `prove-extension.mjs` | The unpacked extension (`build:extension` first). |
| `prove:growth` | `prove-growth.mjs` | Landing/growth funnel; no Supabase chunk on the start page. Open build. |
| `prove:ai-coverage` | `prove-ai-coverage.mjs` | Coverage screens; reads `dist-verify/`. |
| `prove:ai-desk` | `prove-ai-desk.mjs` | The AI Desk through `fake-ai.mjs`. |
| `prove:adoption` | `prove-adoption.mjs` | Work with no project is adopted into the next empty project. |
| `prove:story-path` | `prove-story-path.mjs` | The Story path per format. |
| `prove:dialogs` | `prove-dialogs.mjs` | The in-app dialog appears; Cancel keeps data. |
| `prove:script` | `prove-script.mjs` | The screenplay editor. |
| `prove:tamil` | `prove-tamil.mjs` | Tamil typing, executed. |
| `prove:walk` | `prove-walk.mjs` | Revisions, coverage and costs screens on the Dragon sample, 390 and 1280. |
| `prove:nav` | `prove-nav.mjs` | One frame per page however it is reached; `PROVE_DIST=dist-verify` in CI. |
| `prove:stage-guide` | `prove-stage-guide.mjs` | The stage guide shares storage with the blueprints. Manual. |
| `prove:board-frames` | `prove-board-frames.mjs` | Drawn storyboard frames against faked Gemini image and Drive. Manual. |
| (none) | `prove-admin-health.mjs`, `prove-admin-people.mjs` | Console v2 tabs against the fakes. Manual; see each header. |

## 5. make-*.mjs — generators (committed output)

Re-run after the input they derive from changes; none runs in `ship`.

| File | npm | Writes |
| --- | --- | --- |
| `make-marketing-pages.mjs` | `make:marketing` | Home, `pricing.html` and the `product-<id>.html` pages from `src/data/marketing-*.json` (`test:marketing` fails on drift). |
| `record-marketing-media.mjs` | `record:marketing` | `public/marketing/` loops, posters and stills (see `public/marketing/README.md`). Needs `build:open`, Chromium, ffmpeg. |
| `make-shots.mjs` | `shots` | `public/shots/*.webp`, four product screenshots for `start.html`. Needs `build:open`. |
| `make-demo.mjs` | `demo` | `public/media/demo.mp4` and `demo-poster.webp`. Needs ffmpeg. |
| `make-video-thumbs.mjs` | `thumbs` | Video thumbnails served from our own origin. Network, once. |
| `make-og.mjs` | `og` | `public/og.png`, from `tokens.css` and `brand.json`. |
| `make-icons.mjs` | `icons` | PWA icons under `public/icons/`. |
| `make-posters.mjs` | (none) | The Instagram kit in `social/` (see `social/README.md`). |
| `make-plan-features-sql.mjs` | (none) | Schema section 36 from `plan-matrix.json`; `--print`, `--write`, `--check`. `test:plans` fails on drift. |
| `make-usage-names-sql.mjs` | `test:usage-names` runs `--check` | The usage-counter list in `supabase/schema/schema-43-usage-cohorts.sql`, from `navigation.json`. `--write` regenerates. |
| `make-sample-story.mjs`, `make-sample-darkknight.mjs` | (none) | `src/data/sample.*` JSON from hand-written sources; the Dark Knight inputs are in `sample-darkknight/`. |
| `build-extension.mjs` | `build:extension` | `dist-extension/`, the Chrome extension. |

## 6. Seams and fakes (imported, not run)

| File | Used by | Provides |
| --- | --- | --- |
| `node-seams.mjs` | the Node tests | Empty `store.js`, `.json` as modules, `.css` as empty. Import it first. |
| `fake-supabase.mjs` | `prove-gate`, `prove-extension`, `prove-billing`, `prove-board-frames`, the admin proofs and more | An in-memory Supabase project behind a Playwright route handler (`F.db`, `F.reset()`), including the section 30 trial and price rise. |
| `fake-admin-rpcs.mjs` and `-controls`, `-people`, `-usage` | admin proofs | Admin RPC handlers registered on the fake's `EXT_RPC`/`EXT_FN`; import for the side effect. |
| `fake-ai.mjs` | AI tests and proofs | A stand-in `fetch` for Anthropic (LF frames) and Gemini (CRLF frames). No real key is ever needed. |
| `lib/icon-font.mjs` | the Vite build | Cuts the Material Symbols subset; fails the build on a name that is not a symbol. |

## 7. Live and deploy — never part of the gate

| File | npm | Purpose |
| --- | --- | --- |
| `smoke-production.mjs` | `smoke` | Checks the SERVED site is the build, in a real browser. `node scripts/smoke-production.mjs [origin]`; default is the host in `brand.json`. Fired by `smoke.yml`. |
| `live-checks.mjs` | `live-checks` | The checks from `docs/SECURITY-RLS.md` against a real Supabase project with two real accounts. Needs credentials. |
| `deploy-billing.mjs` | (none) | Schema 16-18 and the billing edge functions in one command (`--print`, `--sql`, ...; see header and `docs/BILLING.md`). Needs credentials; it is old, so read the header before use. |

## 8. Other directories

- `extract/` — `npm run extract`: the parsers that turn `legacy/` into
  `src/data/*.json` (`feature-steps`, `short-steps`, `library`, `relink`),
  self-checking; `SCHEMA.md` is the output contract. Never edit `legacy/`.
- `schema-tests/` — SQL for `test:schema`: `shim.sql` and `audit-shim.sql`
  (what Supabase provides) plus one file per area (billing, trial, refunds,
  RLS role matrix, scopes, admin, usage cohorts, ...).
- `fixtures/` — `marketing-pages.fixture.json`, for `test-marketing --fixture`.
- `pdf-fixtures/` — `make-pdf.mjs`, the PDF builder `test-pdf-text` uses.
- `sample-darkknight/` — hand-written inputs for `make-sample-darkknight.mjs`.

## Loose files

`_ku-probe.mjs` and `_rf-probe.mjs` are underscore-prefixed throwaway Playwright
probes (they hard-code a Chromium path and read `baseline.json` keys). Nothing
references them and they are in no npm script; treat them as scratch.

## Adding one

A new `test-*` goes in `package.json` AND in `test:all`, or it never runs in CI.
A new browser proof goes in `ship` and in the right `gate.yml` job (open build
-> `verify` job, gated build -> `proofs` job). Keep a header comment saying what
it can and cannot prove.
