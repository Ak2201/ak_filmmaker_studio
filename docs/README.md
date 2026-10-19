# Documentation index

Last reviewed: 2026-10-19

One line per document: what it is for, and its status as its own header states it. When a status here and the
document disagree, the document wins; when a document and `HANDOFF.md` §4 disagree about what is live, `HANDOFF.md` wins.

## Start here

- [`HANDOFF.md`](HANDOFF.md) - the entry point: repo state, owner decisions, what is live, the pending registry. Reviewed 19 Oct 2026; carries a 19 Oct note on the new repo layout. Older dated notes inside are a record, not rewritten.
- [`../CLAUDE.md`](../CLAUDE.md) - working notes and hard invariants (storage keys, tokens, skins, traps), the commands, and the open-items table. Read before changing anything.
- [`BRANCHING.md`](BRANCHING.md) - develop on `develop`, release to `main` only through the gate. Set 8 Oct 2026; reviewed 19 Oct.

## Operations

- [`DEPLOY.md`](DEPLOY.md) - hosting the static build (v1 and account-layer passages marked as shipped). Reviewed 19 Oct.
- [`LAUNCH.md`](LAUNCH.md) - what only the owner can do to launch; current-state box at top (open: live Razorpay key and a refund, Resend, two-account RLS checks). Written 7 Oct, reviewed 19 Oct.
- [`BROWSER-HANDOFF.md`](BROWSER-HANDOFF.md) - the launch steps that need the owner's own browser; a dated record of 8-10 Oct with a status note. Reviewed 19 Oct.
- [`RELEASE-PLAN.md`](RELEASE-PLAN.md) - from test mode to paying customers; 9 Oct plan with a 19 Oct status refresh (schema §1-§47 live, `rzp-refund` deployed).
- [`BILLING.md`](BILLING.md) - Razorpay, three paid tiers, plan caps, deploy order; sections marked RUN LIVE where they ran. Reviewed 19 Oct.
- [`GATE.md`](GATE.md) - the invite/site gate: switching it on and what it does. Reviewed 19 Oct.
- [`GOOGLE-AUTH.md`](GOOGLE-AUTH.md) - Google sign-in and storage setup runbook; kept as the recipe for a fresh project, with a 19 Oct status box correcting live facts.
- [`EXTENSION.md`](EXTENSION.md) - the Chrome extension (same pages, side panel, plan gate). Reviewed 19 Oct.
- [`LIVE-CHECKS.md`](LIVE-CHECKS.md) - running the RLS audit against a real database with `npm run live-checks` (30 checks; the two-account checks have never been run). Reviewed 19 Oct.
- [`ADMIN-CONSOLE.md`](ADMIN-CONSOLE.md) - admin console v2 schema run order, §40-§47, all live since 13 Oct. Reviewed 19 Oct.
- [`ADMIN-CONSOLE-TODO.md`](ADMIN-CONSOLE-TODO.md) - what still needs fixing in the console (13 Oct); reviewed 19 Oct.
- [`KNOWN-ISSUES.md`](KNOWN-ISSUES.md) - bugs found and not yet fixed (currently two recorded decisions and one unlooked-at item). Reviewed 19 Oct.
- [`../supabase/schema/README.md`](../supabase/schema/README.md) - the SQL files, authoring versus run order (`supabase-schema.sql` §1-§39, then schema-40 to schema-47), and the rules for running them.

## Security and data

- [`SECURITY-RLS.md`](SECURITY-RLS.md) - row-level security audit of the schema; text is 29 Sep-8 Oct with a 19 Oct status note ("never run" lines have since changed; `HANDOFF.md` §4 wins).
- [`STORAGE-MODEL.md`](STORAGE-MODEL.md) - where a user's work lives: projects, accounts, what syncs. Reviewed 19 Oct.

## Design and architecture

- [`ARCHITECTURE.md`](ARCHITECTURE.md) - screen and logic separate (plug-and-play UI), held by `npm run test:layers`. Owner goal of 15 Oct; reviewed 19 Oct.
- [`DESIGN-KIT.md`](DESIGN-KIT.md) - Swiss Precision, dark only: tokens and the component kit (from 14 Oct). Reviewed 19 Oct.
- [`ICON-MAP.json`](ICON-MAP.json) - data file, not prose; no header to read, purpose not verified here.
- [`HISTORY.md`](HISTORY.md) - the build log, the long form of every open item. A historical log, not current documentation; paths and counts are as written then.

## Plans and handoffs

- [`HANDOFF-MOBILE-AND-REVAMP-2026-10-14.md`](HANDOFF-MOBILE-AND-REVAMP-2026-10-14.md) - mobile UI and revamp hand-off; phases 2 and 3 BUILT and merged (PR #21, 15 Oct), open items in its section 7.
- [`NEXT-UI-REVAMP-PLAN-2026-10-14.md`](NEXT-UI-REVAMP-PLAN-2026-10-14.md) - the next UI revamp plan; BUILT (phases 1-4), merged via PR #21.
- [`PARITY-MATRIX.md`](PARITY-MATRIX.md) - mobile and desktop prototypes against the app (14 Oct audit); the work it drove is built, public rows superseded.
- [`PROMPT-FOR-NEXT-PERSON.md`](PROMPT-FOR-NEXT-PERSON.md) - the prompt that drove the 14 Oct mobile-and-revamp workflow; historical, keeps the owner rules and gotchas.
- [`NEXT-IDEAS-PLAN.md`](NEXT-IDEAS-PLAN.md) - twenty ideas ordered (12 Oct); Phases 1-2 built, Phase 0 partly done, Phase 3 open awaiting owner decisions.
- [`WIP-EMOTION-PLAN.md`](WIP-EMOTION-PLAN.md) - emotional-craft layer; plan only, still open, nothing built (checked 19 Oct; next free schema section is §48).
- [`MIROFISH-ANALYSIS.md`](MIROFISH-ANALYSIS.md) - MiroFish (multi-agent prediction engine) against this product: do not integrate (AGPL, server, Zep); a native "Test audience (simulated)" Desk task is sketched. Research only, 19 Oct; nothing built.

## Archive

Kept for history, not maintained. Each file opens with an ARCHIVED 19 Oct 2026 banner.

- [`archive/ADMIN-CONSOLE-PLAN.md`](archive/ADMIN-CONSOLE-PLAN.md) - admin console v2 plan (12 Oct); superseded by `ADMIN-CONSOLE.md` (§40-§47 built).
- [`archive/BLUEPRINT-REALIGN-PLAN.md`](archive/BLUEPRINT-REALIGN-PLAN.md) - blueprint and stages realignment; built 6 Oct, see `HISTORY.md`.
- [`archive/SCREENPLAY-WRITER-PLAN.md`](archive/SCREENPLAY-WRITER-PLAN.md) - screenplay writer plan (6 Oct); shipped, see `HISTORY.md`.
- [`archive/RESUME.md`](archive/RESUME.md) - first, narrower resume note; superseded by `HANDOFF.md`.
- [`archive/WIP.md`](archive/WIP.md) - every stopped workstream on one branch; `wip-all` was merged, see `HANDOFF.md`.
- [`archive/NEXT-STAGE-FLOW.md`](archive/NEXT-STAGE-FLOW.md) - prompt for the remaining stage-flow work; completed.
- [`archive/UX-AUDIT-2026-10-06.md`](archive/UX-AUDIT-2026-10-06.md) - the 6 Oct UI/UX audit; fixes recorded in `KNOWN-ISSUES.md`.
- [`archive/FEATURE-IDEAS.md`](archive/FEATURE-IDEAS.md) - feature ideas research snapshot (7 Oct).
- [`archive/COVERAGE.md`](archive/COVERAGE.md) - StudioBinder topics versus this product; a roadmap input from 28 Sep.
- [`archive/VIDEO-CANDIDATES.md`](archive/VIDEO-CANDIDATES.md) - video candidates; all approved and live (10 Oct).
- [`archive/SPASEX-DESIGN-ANALYSIS.md`](archive/SPASEX-DESIGN-ANALYSIS.md) - another brand's design language; not this product's, see `DESIGN-KIT.md`.
