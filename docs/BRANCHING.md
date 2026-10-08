# Branching — develop, then main

Set by the owner on 8 Oct 2026: **all development happens on `develop`;
`main` only receives work that has been tested.** `main` is what the hosts
deploy, so it must always pass the release gate below.

```
feature/<name> ──► develop ──(release gate passes)──► main
                      ▲                                  │
                      └──────── merge main back ─────────┘   (after any hotfix)
```

## The branches

| Branch | Rule |
|---|---|
| `main` | Production. Deployable at all times. Receives **only** a `--no-ff` merge of `develop` that passed the release gate, a hotfix, or a docs-only change. Never receive unfinished work. |
| `develop` | Integration. Every feature lands here first. May be red between features, but a feature branch is merged only after **its own** tests pass. Created 8 Oct 2026 from `wip-all` (`973ad47`), so it currently holds the ten unfinished workstreams — see `docs/WIP.md`. |
| `feature/<name>` | One piece of work, cut from `develop`, merged back into `develop` with `--no-ff`. Example: `feature/on-set`, `feature/emotional-craft`. |
| `hotfix/<name>` | Cut from `main` for a production bug; merge to `main`, then merge `main` into `develop`. |
| `wip-all`, `archive/*`, `wip/*` | **Frozen.** Backups of the 7 Oct stopped work. Do not develop on them; they cannot be deleted (GitHub returns 403). `develop` continues from `wip-all`. |

## Day to day

```bash
git fetch origin
git worktree add .claude/worktrees/<name> -b feature/<name> origin/develop
# …work, commit, run the tests for what you touched…
git push origin feature/<name>
# merge into develop only when the feature's own tests pass:
git checkout develop && git merge --no-ff feature/<name> && git push origin develop
```

Work in a worktree, never in the main checkout directory (it may have another
branch checked out). Retry a push 5/10/20/30 s on an HTTP 500.

## The release gate (develop → main)

Run on a clean checkout of `develop`, **uncapped**, with distinct
`VERIFY_PORT` / `PROVE_PORT`, and record the results in the merge commit:

1. `npm install` (then `git checkout package-lock.json`).
2. `VITE_SITE_GATE=off npx vite build --outDir dist-verify`, then
   `VERIFY_DIST=dist-verify npm run verify` → "all pages pass".
   A re-baseline is allowed **only** after reading the per-page word diff and
   proving **zero data-key movement** on every page.
3. Every `npm run test:*` passes (`test:schema` needs
   `pg_ctlcluster 16 main start`). Any script in `scripts/` that has no npm
   entry (`test-revisions`, `test-ai-coverage`, `prove-ai-coverage`) is either
   given one or run by hand.
4. `npm run prove:storage`, `prove:drive`, `prove:sw`, `build:extension` +
   `prove:extension`.
5. `npm run build` (gate ON), then `prove:gate` and `prove:billing`.
6. First-paint budget (`scripts/budget.json`) holds, or the growth is
   justified in the commit and the file recaptured with
   `npm run verify -- --budget`.
7. `CLAUDE.md`'s status table, `docs/HISTORY.md`, `docs/FEATURE-IDEAS.md` and
   `docs/LAUNCH.md` describe what is being released.
8. Any new Supabase schema section is listed in `docs/LAUNCH.md` §4 so the
   owner runs it **before** the release goes live.

Then:

```bash
git checkout main && git pull --ff-only origin main
git merge --no-ff develop -m "Release: <what> — gate results: <counts>"
git push origin main
```

## Today's position

`develop` is **not releasable**: it is the unfinished union, `verify` never
completed on it, and no `prove:*` has run. **Nothing moves from `develop` to
`main` until the integration pass (`docs/HANDOFF.md` §6b step 11) has run the
gate above and it is green.** Docs-only commits may go straight to `main`;
merge `main` into `develop` afterwards so they do not diverge.

## What only the owner can set (not possible from this container)

- **Branch protection on `main`** (GitHub → Settings → Branches): require a
  pull request from `develop`, require the status checks below, disallow
  direct pushes and force pushes.
- **CI**: the repo has no `.github/workflows/`, so nothing enforces the gate.
  Adding a workflow that runs steps 2–6 on every PR to `main` is the natural
  next task (the browser tests need Playwright's Chromium and, for
  `test:schema`, PostgreSQL 16 — both installable in a GitHub runner).
  Until then the gate is run by hand and recorded in the merge commit.
- **Vercel / Netlify**: confirm the production branch is `main`, and that
  `develop` deploys only as a preview (a preview must not be indexed — check
  `robots.txt`/`noindex` behaviour on preview URLs).
