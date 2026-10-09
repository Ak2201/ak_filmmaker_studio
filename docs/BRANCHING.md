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
| `develop` | Integration. Every feature lands here first. May be red between features, but a feature branch is merged only after **its own** tests pass. Created 8 Oct 2026 from `wip-all` (`973ad47`); the ten workstreams it carried were released to `main` the same day. |
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

The first release ran on 8 Oct 2026: the ten workstreams, gated on
`feature/integration`, merged into `develop` and then into `main`
("Release: the ten workstreams", gate counts in the merge message). `develop`
and `main` are level after it. Docs-only commits may go straight to `main`;
merge `main` into `develop` afterwards so they do not diverge.

Two things learned running the gate the first time: `--baseline` and
`--budget` must be SEPARATE runs (in a `--baseline` run the budget is not
measured, so a combined run writes an empty `pages` map), and a proof that
counts the requests it aborts itself fails for its own reasons — judge a
failed resource by its URL.

## What only the owner can set (not possible from this container)

- **Branch protection on `main`** (GitHub → Settings → Branches → Add rule
  for `main`): require a pull request, require the status checks **`tests`,
  `verify` and `proofs`** (they appear in the list after the workflow has
  run once), disallow direct pushes and force pushes. Until this is set, the
  checks report but do not block.
- **CI exists since 9 Oct 2026**: `.github/workflows/gate.yml` ("Gate") runs
  steps 2–5 on every pull request into `main` or `develop`, on every push to
  `develop`, and by hand (Actions → Gate → Run workflow). Three parallel
  jobs: `tests` (`test:all` against a `postgres:16` service), `verify`
  (open build, uncapped, log kept 7 days on failure) and `proofs` (gated
  build and every `prove:*`). The first-paint budget (step 6) is inside
  `verify`. Steps 7–8 (docs, the schema list) stay a human's job.
- **Vercel / Netlify**: confirm the production branch is `main`, and that
  `develop` deploys only as a preview (a preview must not be indexed — check
  `robots.txt`/`noindex` behaviour on preview URLs).
