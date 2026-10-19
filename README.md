# FilmMakerStudio

> *A working desk for screenwriting, pre-production and craft study.*

Last reviewed: 2026-10-19

A local-first, browser-based studio for filmmakers: write the story, write and
revise the screenplay, break it down into scenes and elements, schedule, budget,
shoot, and deliver. About 50 HTML pages, one static build, no application server.
Everything a user writes lives in their browser's `localStorage`; signing in with
Google and a plan or trial adds optional Supabase sync on top.

It is a **writing tool people keep months of work in**, so correctness of stored
data beats every other consideration. Read [`CLAUDE.md`](CLAUDE.md) before
changing anything.

## Who it is for

Independent and first-time filmmakers, screenwriters and small crews, with a
working knowledge of Tamil cinema in the reference material (Tanglish glosses,
Chennai rate cards, Tamil-aware screenplay type). Rupee figures and Indian
festival and certification rules are first-class.

## Feature map

Stages follow `src/data/navigation.json`, which is the information architecture.

| Stage | Pages | What is there |
| --- | --- | --- |
| **Story** | `story.html`, `vault.html` | Beats and pacing, story bible (characters, conflict, stakes, theme, world), Idea Vault, pitch deck (`.pptx`) |
| **Screenplay** | `screenplay.html`, `drafts.html` | Screenplay Writer (one type-change path, smart type, dictation, find, notes, revisions), numbered drafts, title page, screenplay import (text, `.docx`, PDF), Fountain and PDF export. `write.html` redirects here |
| **Pre-production** | `preprod.html`, `breakdown.html`, `stripboard.html`, `plan.html`, `visualize.html`, `reports.html`, `contacts.html`, `budget.html` | Screenplay Analysis (screen time, cast matrix, auto-tag), Scene Breakdown and Elements, Scene List, Songs, Shot List, Storyboard, Lookbook, Locations and Shoot Calendar (schedule), Stripboard and Day Out of Days, Sides, Budget, Cast and Crew contacts, Production Reports. All are views of one scene model |
| **Shoot** | `shoot.html`, `contacts.html#call-sheets` | Shoot Day (the one view that writes back to a scene: shot, part, dropped) and Call Sheets |
| **Post-production** | `edit.html`, `deliverables.html` | Edit log (reads shoot marks, never writes them) and the deliverables checklist, with festival formats |
| **Library** | `library.html` (`study.html` and `dissect.html` redirect) | Case studies, dissection, film terminology, directors, rules, rates, festivals |
| **Dashboard** | `dashboard.html`, `index.html` | The hub (your films, where you left off) and the project dashboard (progress and readiness, derived) |
| **Settings** | `settings.html` | Account, AI key on this device, Drive backup, appearance |
| **Purchase** | `purchase.html`, `purchases.html` | Plans, checkout, invoices and refund requests; `purchases.html` is the admin side |
| **Admin console** | `admin.html` | People, requests, purchases, growth, health, audit, usage, controls. Shown by `VITE_ADMIN_EMAILS`, guarded by RLS |

The two original blueprints (`feature.html`, `short.html`) are still shipped; their
steps now also surface inside the stages above.

Cross-cutting:

- **AI Desk, bring your own key.** Anthropic or Gemini through one `callModel()`;
  the key stays on the device, drafts are applied only on Accept. Plan-gated.
- **Chrome extension.** The same pages in a side panel (`extension/`,
  built by `npm run build:extension`). Details: [`docs/EXTENSION.md`](docs/EXTENSION.md).
- **Screening room.** `screening.html` is a read-only room for a screening pass.
- **Backup.** JSON export/import and optional Google Drive backup.
- **PWA.** Installable, offline shell through a service worker.

## The public site, plans, purchases switch and site gate

**Public site.** `start.html` (the landing page), `pricing.html` and eleven
`product-*.html` pages sit outside the site gate. The home, pricing and product
pages are generated from `src/data/marketing-*.json` by `npm run make:marketing`.
`privacy.html`, `terms.html` and `refund.html` keep their words in markup on purpose.

**Plans.** Three paid tiers (Basic, Intermediate, Pro) generated from one matrix,
`src/data/plan-matrix.json`, with a free trial offered first. Payments are
Razorpay, through four Supabase edge functions. Caps are database triggers.
See [`docs/BILLING.md`](docs/BILLING.md).

**Purchases switch.** `purchase_required` is a database setting. Off (the current
state per [`docs/HANDOFF.md`](docs/HANDOFF.md)) nothing is walled or capped and
membership only decides whether work syncs; on, a plan or a running trial is needed.

**Site gate.** `src/lib/sitegate.js` hides every non-public page until it knows
who is asking: signed out goes to `start.html`, any other refusal to `invite.html`
(the offer page). It follows the purchases switch and fails closed when it cannot
tell. `npm run build` has the gate on; `npm run build:open` turns it off and is
the only build `npm run verify` accepts. [`docs/GATE.md`](docs/GATE.md).

## Quick start

Needs **Node >= 22.12** (Vite 8). Older Node fails with
`styleText is not exported from node:util`.

```bash
npm install
npm run dev          # Vite dev server on :5173, no service worker
npm run build        # static output in dist/, site gate ON (what hosts run)
npm run build:open   # same with the gate off; what verify needs
npm run preview      # serve the build on :4173, exercises the real service worker
npm run verify       # the page gate; run build:open first
```

Before every commit: `npm run build:open && npm run verify`.

## Commands

All defined in [`package.json`](package.json).

### Dev and build

| Command | Does |
| --- | --- |
| `dev`, `preview` | Dev server; serve the build |
| `build`, `build:open` | Production build (gate on); gate-off build |
| `build:verify` | Gate-off build into `dist-verify/` (read by `prove:growth`, `prove:ai-coverage`, `prove:nav`) |
| `build:extension` | The Chrome extension into `dist-extension/` |
| `extract` | Regenerate `src/data/*.json` from `legacy/` and self-check |
| `icons`, `og` | PWA icons from tokens; `public/og.png` |

### Verify and baseline

| Command | Does |
| --- | --- |
| `verify` | Loads every page in Chromium and diffs against `scripts/baseline.json` (data-keys, words, handlers, overflow at 390px, contrast, skins, backup round trip). Refuses a gated `dist/` |
| `verify -- --budget` | Recapture `scripts/budget.json` (first-paint bytes) |
| `baseline` | Recapture `scripts/baseline.json`; deliberate, never a fix for a failing run |
| `density` | Design-density report; measures, asserts nothing |
| `smoke` | Smoke the production host |
| `live-checks` | The RLS audit against a real database ([`docs/LIVE-CHECKS.md`](docs/LIVE-CHECKS.md)) |

### `test:*` (Node, no browser unless noted)

| Group | Commands |
| --- | --- |
| Static checks | `test:undef`, `test:layers`, `test:dialogs`, `test:brand`, `test:keys`, `test:links`, `test:pagefile`, `test:returnto`, `test:countdown`, `test:homestage`, `test:launcher-rows`, `test:marketing`, `test:testimonials`, `test:videos` |
| Models | `test:story`, `test:bible`, `test:beats`, `test:pacing`, `test:screenplay`, `test:script-notes`, `test:drafts`, `test:import`, `test:pdf`, `test:format`, `test:journey`, `test:learn`, `test:stage-guide`, `test:blueprint-route`, `test:board-models`, `test:hub-models`, `test:write-models`, `test:feature-model`, `test:tanglish`, `test:samples`, `test:sync`, `test:backup-summary` |
| Production modules | `test:breakdown`, `test:breakdown-extras`, `test:element-index`, `test:stripboard`, `test:shots`, `test:blocking`, `test:board-frames`, `test:sun`, `test:takes`, `test:ready-sheet`, `test:callsheet`, `test:costs`, `test:budget-kpis`, `test:impact`, `test:revisions`, `test:post`, `test:delivery`, `test:inference` |
| Money and plans | `test:money`, `test:billing`, `test:invoice`, `test:plans`, `test:usage-names` |
| AI | `test:ai-coverage`, `test:ai-phase2`; also `test:ai-desk` and `test:ai-lazy` (needs a gated build), which are not in `test:all` (`ship` and CI run `test:ai-lazy`) |
| Database | `test:schema` loads the whole schema on a real PostgreSQL and runs `scripts/schema-tests/*.sql`; needs a local Postgres or `PGHOST` (setup in `CLAUDE.md`) |
| Online | `test:videos:online` (not in `test:all`) |

`test:undef` parses `src/` for an identifier used and never declared; it exists
because the motion layer is invisible to every browser check (`navigator.webdriver`).

### `prove:*` (Playwright, need a build)

| Command | Proves |
| --- | --- |
| `prove:gate` | Invite gate, device lock, admin, screening room (gated build) |
| `prove:billing` | A purchase end to end against a faked Razorpay |
| `prove:storage`, `prove:drive`, `prove:cloud-delete` | Storage and sync, Drive backup against a faked Drive, total delete |
| `prove:sw` | The service worker against a cleanUrls host |
| `prove:extension` | The unpacked extension in Chromium (after `build:extension`) |
| `prove:growth`, `prove:ai-coverage` | Landing-page weight and funnel; AI coverage (read `dist-verify/`) |
| `prove:story-path`, `prove:dialogs`, `prove:script`, `prove:tamil`, `prove:walk`, `prove:adoption` | Story path per format, in-app dialogs, screenplay editor, Tamil type, a walk through the studio, adoption of no-project work (gate-off build) |
| `prove:nav` | One frame per page whichever link opened it (`PROVE_DIST=dist-verify`) |
| `prove:ai-desk`, `prove:stage-guide`, `prove:board-frames` | AI Desk, stage guide, board frames (run in CI or on demand) |

### Make, record and asset

`make:marketing` (generated public pages), `record:marketing`, `shots`,
`thumbs`, `demo`.

### `test:all` and `ship`

- **`test:all`** chains every Node-only `test:*` check above (about 60, starting
  with `test:undef` and `test:layers`) with no browser. CI runs it with a
  PostgreSQL 16 service for `test:schema`.
- **`ship`** is the full local release gate: `test:all`, `build:open`, `verify`,
  the gate-off proofs, then a gated `build`, `test:ai-lazy`, `prove:gate`,
  `prove:billing`, `prove:storage`, `prove:cloud-delete`, `prove:drive`,
  `prove:sw`, `build:extension`, `prove:extension`, `build:verify`,
  `prove:growth` and `prove:ai-coverage`. CI also runs `prove:nav` and
  `prove:ai-desk`, which `ship` does not.

## Architecture

Short version; the long one is [`CLAUDE.md`](CLAUDE.md), with
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/STORAGE-MODEL.md`](docs/STORAGE-MODEL.md).

- **Storage proxy and `fms_` keys.** `src/lib/store.js` patches `Storage.prototype`
  to suffix keys per project (`fms_scenes_v1__<id>`); accounts are scoped by an `ns`
  field on the project list. Every storage key and `data-key` is a contract with
  saved work and is never renamed without a migration (`migratePrefix()` is the
  pattern). `store.js` must evaluate before anything reads storage.
- **One scene model.** Scene list, breakdown, stripboard, day out of days, call
  sheet, budget and reports all read `src/lib/scenes.js`; only `shoot.html` writes back.
- **Derived, not stored.** Readiness, the journey, counts, heatmaps and pacing
  flags are computed at render time; one representation per thing.
- **Two layers.** `src/lib/` holds models and logic with no DOM; `src/ui/` and
  `src/pages/` draw. `npm run test:layers` enforces the split.
- **Content in JSON.** Copy, steps, films, rules and navigation live in
  `src/data/*.json`, not in markup.
- **Skin and tokens.** Colours come from `src/styles/tokens.css`; shapes from
  `--sk-*` variables set by the one skin in `src/styles/skins/`.
- **One dark Swiss look.** Dark only; violet `#8B5CF6` is a mark, `--brand`
  `#7C3AED` the text-bearing fill. Kit and token table: [`docs/DESIGN-KIT.md`](docs/DESIGN-KIT.md).
- **Service worker.** `src/sw.js` (vite-plugin-pwa, `injectManifest`) precaches the
  shell and must never answer a navigation with a redirected response; `prove:sw` checks it.
- **No inline handlers.** A strict CSP ships in `vercel.json`; use `delegate()`
  with `data-action`.

## Directory tree

```
.
├── index.html feature.html short.html library.html     hub, two blueprints, reference library
├── dashboard.html preprod.html story.html vault.html   project home, pre-production path, Story, Idea Vault
├── screenplay.html drafts.html                         Screenplay Writer and numbered drafts
├── breakdown.html stripboard.html plan.html            scene-derived views (plan = locations, calendar)
├── visualize.html reports.html contacts.html budget.html
├── shoot.html edit.html deliverables.html              shoot day, post-production
├── screening.html                                      a screening pass's read-only room
├── settings.html purchase.html purchases.html          account; plans; admin purchases
├── admin.html invite.html                              console; the offer page a closed gate lands on
├── start.html pricing.html product-*.html (11)         public site (GENERATED: make:marketing)
├── privacy.html terms.html refund.html                 legal, words kept in markup
├── write.html study.html dissect.html                  redirect stubs
├── arunak-*.html (3), 404.html                         old-URL redirect stubs; not found
├── kit.html                                            dev-only component showcase, not shipped
├── arunak-portothozhil-sample.json                     legacy sample file at the root
├── package.json vite.config.js                         scripts; build, chunks, PWA, brand stamping
├── vercel.json netlify.toml                            host config, kept in step (headers, CSP, rewrites)
├── .env                                                public VITE_* build settings (committed)
├── CLAUDE.md                                           working notes and invariants: READ FIRST
├── src/
│   ├── data/      ALL content as JSON; navigation.json is the IA
│   ├── lib/       models and logic, no DOM (store, cloud, scenes, plan-gate, sitegate, ...)
│   ├── ui/        shared chrome and widgets (chrome, shell, tabs, dialog, palette, ...)
│   │   ├── kit/             the Swiss component kit, one import path
│   │   └── script-editor/   the screenplay editor core
│   ├── pages/     one entry script per page (hub/ and admin-tabs/ hold parts)
│   ├── styles/    tokens.css, base.css, one sheet per page; skins/ holds the one skin
│   └── sw.js      service worker
├── scripts/       verify, prove-*, test-*, make-* and fakes (see Commands)
│   ├── extract/ lib/ fixtures/ schema-tests/ pdf-fixtures/ sample-darkknight/
│   └── baseline.json budget.json                       what verify diffs against
├── supabase/
│   ├── functions/ rzp-order rzp-verify rzp-webhook rzp-refund, _shared/
│   └── schema/    supabase-schema.sql (§1-§39), schema-40..47, patches/, README.md
├── extension/     manifest template, background worker, side-panel entry
├── public/        icons, manifest, og.png, robots.txt, sitemap.xml, marketing/, media/, shots/
├── legacy/        the original hand-written pages: reference only, NEVER EDIT
├── social/        captions, posters and post images
├── docs/          handoff, plans, runbooks (docs/README.md is the index); archive/ for superseded
├── .github/workflows/   gate.yml, smoke.yml
└── .claude/       launch.json, settings, workflows/, worktrees/ (local tooling)
```

## Environment variables

Vite inlines every `VITE_*` variable into the bundle, so they are public. A real
secret never goes in them.

| Where | Names | Notes |
| --- | --- | --- |
| `.env` (committed, public on purpose) | `VITE_GOOGLE_CLIENT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_EMAILS`, `VITE_RAZORPAY_KEY_ID` | The anon key is the legacy `eyJ...` JWT, not `sb_publishable_...` (supabase-js is pinned at 2.45.4). Admin e-mails decide what is shown, not what is allowed |
| `VITE_SITE_GATE` | `off` only | Set by `build:open` / `build:verify`; unset means gate ON. Not set in `.env` on purpose |
| `.env.local` (gitignored) and host settings | local secrets | Never committed |
| Supabase function secrets (`supabase secrets set`) | Razorpay key secret and webhook secret, `RESEND_API_KEY`, `MAIL_FROM` | Read only by the edge functions. See [`docs/BILLING.md`](docs/BILLING.md) |

## Data and security

- **Local first.** Without signing in, nothing leaves the browser.
- **Row-level security** guards every table; the client bundle is public and the
  admin gate by e-mail is visibility, not a boundary. Audit: [`docs/SECURITY-RLS.md`](docs/SECURITY-RLS.md);
  the live two-account checks are listed in `docs/HANDOFF.md` and [`docs/LIVE-CHECKS.md`](docs/LIVE-CHECKS.md).
- **Edge functions** (`supabase/functions/`): `rzp-order`, `rzp-verify`,
  `rzp-webhook` (`verify_jwt: false`, HMAC-checked), `rzp-refund`. Deploy with the
  Supabase CLI, not the dashboard editor.
- **Schema run order.** `supabase-schema.sql` (§1-§39), then `schema-40` to
  `schema-47`; every file is re-runnable. Hash a file before pasting it, and run a
  section before shipping a client that needs its scope. Full rules and the table:
  [`supabase/schema/README.md`](supabase/schema/README.md). Which sections are live: `docs/HANDOFF.md`.

## CI

| Workflow | Runs | What |
| --- | --- | --- |
| **Gate** (`.github/workflows/gate.yml`) | PRs into `main` and `develop`; pushes to `develop` and `main`; manual | Three parallel jobs: `tests` (`test:all` with PostgreSQL 16), `verify` (`build:open`, `verify`, then `prove:adoption`, `prove:story-path`, `prove:dialogs`, `prove:script`, `prove:ai-desk`) and `proofs` (gated `build`, `test:ai-lazy`, gate/billing/storage/cloud-delete/drive/sw proofs, extension, `build:verify`, growth, ai-coverage, `prove:nav`) |
| **Smoke** (`.github/workflows/smoke.yml`) | A successful Vercel production deployment; manual | Smokes the served site (`npm run smoke`), because the build gates cannot tell that the deployed bundle is the one just built |

## Branching and release

Develop on `develop` (or a `feature/*` branch cut from it); `main` receives only
a `--no-ff` merge of `develop` that passed the release gate, a hotfix or a
docs-only change. Never commit unfinished work to `main`.
Full rules: [`docs/BRANCHING.md`](docs/BRANCHING.md).

## Deployment

A static build (`dist/`) on Vercel (`vercel.json`) or Netlify (`netlify.toml`),
kept in step: cache headers, a strict CSP whose `connect-src` must name every
provider origin, and clean-URL rewrites. Node 22 on the host. Production host and
the off-repo steps: [`docs/DEPLOY.md`](docs/DEPLOY.md) and [`docs/LAUNCH.md`](docs/LAUNCH.md).

## Documentation

[`docs/README.md`](docs/README.md) is the index. Start with
[`docs/HANDOFF.md`](docs/HANDOFF.md) (repo state, decisions, pending registry),
then [`CLAUDE.md`](CLAUDE.md). Superseded documents are in [`docs/archive/`](docs/archive/).

## Contributing

The short rules; the reasons are in [`CLAUDE.md`](CLAUDE.md).

1. Storage keys and `data-key` strings are never renamed without a migration.
2. Content goes in `src/data/*.json`; derive lists, never hand-write them.
3. Colours, sizes and shapes come from tokens and `--sk-*` variables; no raw colours.
4. No inline handlers, no native `confirm`/`alert`/`prompt` (use `src/ui/dialog.js`).
5. The product name lives only in `src/data/brand.json`.
6. Never edit `legacy/`. Money parsing only through `src/lib/money.js`.
7. Run `npm run build:open && npm run verify` before every commit, and the
   `test:*` checks for what you touched.

## Licence

Licence: see owner.
<!-- TODO(owner): decide the licence. package.json declares "ISC", but a
     previous README stated a different (personal-use) licence. Resolve and
     keep package.json and this section in agreement. -->
