# Deploying FilmMakerStudio

Last reviewed: 2026-10-19. Release flow (develop to main, the gate) is `docs/BRANCHING.md`;
what is live is `docs/HANDOFF.md` §4. This file was first written for v1 (local-only) and
the account layer, both of which have since shipped; passages that described them as
future are marked.

Static build, no server. The app is **local-first**: everything a user
writes lives in their own browser. The Supabase account layer is
optional and can ship later — see [v1.1](#v11--the-account-layer).

That split is the most useful thing on this page. Four of the six
outstanding items are account features, and the app is fully usable
without any of them. **Ship v1 local-only; add accounts when the
console work is done.** Waiting on Google Cloud configuration to
release a working writing tool is the wrong trade.

---

## Hosts — there are TWO Vercel projects, and they differ by one letter

| | Production | Dev preview |
| --- | --- | --- |
| Address | **`filmmakerstudio.in`** (alias: `thefilmmakerstudio.vercel.app`) | `thefilmakerlocal.vercel.app` |
| Vercel project | the original | `thefilmakerlocal` |
| Branch deployed | `main` | **`develop`** |
| Build | `npm run build` (gate ON) | `npm run build` (gate ON) |
| Service worker | registered | **disabled**, `VITE_DISABLE_SW=1` |
| Who can see it | anybody with an invite | Vercel Authentication (Standard) |

**READ THE NAME TWICE.** Production has two "m"s — *thefil**mm**aker* —
and the preview has one — *thefil**m**aker*. They are one letter apart
and both end `.vercel.app`. Changing a setting on the wrong one is a
quiet way to take the live site down.

Since 11 Oct 2026 production also answers on **`filmmakerstudio.in`**,
which is the one unambiguous way to tell them apart in a browser. In the
VERCEL DASHBOARD they are still one letter apart, so the warning stands
where it matters most.

Set up 9 Oct 2026; the full record, including what was checked in the
browser and what was NOT, is `docs/BROWSER-HANDOFF.md` §6. Both hosts
are registered as Google OAuth origins and as Supabase redirect URLs,
so sign-in is configured on each.

Pushing to `develop` redeploys the preview; pushing to `main` redeploys
production. That is the whole of the difference day to day.

## v1 — the static app

### 1. Pre-flight

```bash
npm ci
npm run ship      # the whole gate: test:all, build:open + verify, the prove:* scripts, then build
```

`npm run ship` is no longer "build + verify": it runs `test:all`, `build:open` and `verify`
(verify refuses a gated `dist/`; the open build is the only one it accepts), a series of
`prove:*` scripts, then the real gated `build`, which is the output the hosts serve (gate
ON). The quick pre-commit check CLAUDE.md names is `npm run build:open && npm run verify`.

`verify` must print `✓ all pages pass`. It is not a linter — it is the
thing standing between a refactor and somebody's lost screenplay. It
checks, across the pages in `scripts/baseline.json` (26 today; 13 when this
table was written):

| | |
|---|---|
| data-key parity | the storage contract. A renamed key orphans saved work |
| text coverage | no prose silently disappeared |
| contrast | WCAG AA on every theme × skin (one of each now: dark, `studio`), modals open |
| overflow | none at 390px, menus open and shut |
| inline handlers | zero, including inside modals — they are inert under our CSP |
| idle writes | zero in four seconds (the save-loop regression test) |
| themes / skins | counted from the app, not named (one each since 14 Oct 2026) |
| backup round trip | two projects out and back, every scoped key restored per project, none crossed over |

**If it is red, do not deploy.** Every failure it has ever reported has
been real.

### 2. Push

Develop on `develop` and release to `main` through the gate in `docs/BRANCHING.md`;
never push unfinished work to `main`. Pushing `main` redeploys production.

```bash
git push -u origin main   # only after the release gate in docs/BRANCHING.md
```

### 3. Deploy

The live hosts are on Vercel (see the table above). `netlify.toml` is committed and kept
in step with `vercel.json` (CSP `connect-src` must name the same origins in both), but no
Netlify site is recorded as deployed. For Netlify:

```bash
npx netlify deploy --prod --dir=dist
```

Vercel config (`vercel.json`) is also present if you prefer it. Pick
one and delete the other eventually — two header files that must agree
is a bug waiting to happen.

### 3b. Why the two host configs differ on two rewrites

`vercel.json` sends `/studio` and `/shared/:token` to `/`.
`netlify.toml` sends them to `/index.html`. That is deliberate.

Vercel sets `cleanUrls: true`, which 308-redirects `/index.html` to
`/`. A rewrite whose *destination* is `/index.html` gets swallowed by
that redirect and 404s — both of those routes were dead in production
because of it, including the entire share-link route. Netlify has no
such interaction and `/index.html` is idiomatic there.

Do not "fix" the difference to make the files match without testing
both hosts.

And do not try to explain this inside `vercel.json`. JSON has no
comments, and Vercel's schema rejects unknown properties — adding a
`_comment` key fails the build with "should NOT have additional
property", which is a deploy that never happens rather than an error
you see locally. This section exists because that was tried.

### 4. Verify the headers actually landed

Do not skip this. The app **depends** on the CSP being enforced: it
shipped inline handlers that were only ever inert in production, and
they were found by testing under the real header, not locally.

```bash
curl -sI https://<your-site> | grep -i -E 'content-security-policy|x-frame-options'
```

Expect `script-src 'self'`. If the header is missing, the site will
appear to work *better* than it should — broken inline handlers will
start firing. That is not good news.

### 5. Smoke test the deployed build

On the real URL, not localhost:

1. Create a project, add two scenes in **Breakdown**
2. Open **Stripboard** — the scenes are there, page counts agree
3. Open **Reports** — totals match
4. `Export ▾ → Save as PDF` — check it paginates and prints on white
5. Hard-reload — the work is still there
6. `Backup ▾ → Export everything`, then **Erase everything**, then
   import the file back. Everything returns.

Step 6 is the one worth doing properly. It is the only backup a
local-first app has.

### 6. Offline / PWA

> **Update 10 Oct 2026:** on the production host the worker WAS observed — one active
> worker, typed `.html` URLs open (`docs/BROWSER-HANDOFF.md` §0 RESULT 0.2 item 2), and
> `npm run prove:sw` checks it against a cleanUrls host. The dev preview deliberately
> registers none (`VITE_DISABLE_SW=1`). Whether the OFFLINE shell works end to end is
> still only what steps 1-3 below would show. The text that follows is the original
> account from the build environment.

The service worker had **never been observed working** when this was written, and the cause
was established rather than assumed. On the preview server
(`localhost`, a secure context, worker served 200 as `text/javascript`
with valid content and no module syntax) registration still fails with
Chromium's opaque *"An unknown error occurred when fetching the
script."*

The discriminating test: a **one-line, trivially valid** worker
registered from the same origin fails identically. That rules the app
out — every environment used to build this blocks service-worker
script fetches. Nothing about `sw.js` is known to be wrong, and
nothing about it is known to be right either.

A real HTTPS deployment is the first place it can actually be
checked. Treat this as genuinely unknown, not as working.

1. Load the site, then go offline (DevTools → Network → Offline)
2. Reload. It should still open and your work should still be there
3. DevTools → Application → Service Workers: one active worker

If it misbehaves, ship without it:

```bash
VITE_DISABLE_SW=1 npm run build
```

---

## v1.1 — the account layer

> **DONE.** The account layer is live: schema §1–§47 have run on project
> `conhlrulxfwkhsnymakz`, Google sign-in works on both hosts, and the Supabase Site URL and
> redirect allow-list cover both (`docs/HANDOFF.md` §4, `docs/LAUNCH.md` §4 and §7a). The
> steps below are the recipe for a fresh project, not a to-do list.

**Each step is useless without the one before it. Do them in order.**

### 1. Run the schema — nothing works until this happens

On a fresh project, `supabase/schema/supabase-schema.sql` (§1–§39) is run first, then
`supabase/schema/schema-40..47` in order (`supabase/schema/README.md`). It has run on the
live project. Until it runs on a new one, sign-in will *appear* to succeed and every sync will
fail against tables that do not exist.

Supabase → SQL Editor → run the file (checksummed: never paste SQL through the clipboard
unhashed, see `supabase/schema/README.md`). Then check:

```sql
select tablename from pg_tables where schemaname = 'public';
select relname, relrowsecurity from pg_class
  where relname in ('projects','project_data','accounts','account_members');
```

Every table must have `relrowsecurity = true`. RLS off on
`project_data` means one user can read another's script.

### 2. Fix the Site URL

Supabase → Authentication → URL Configuration. A new project must set the Site URL to
the real origin (`filmmakerstudio.in`; it once pointed at the dead
`ak-filmmaker-studio.vercel.app`) and add `/**` entries for BOTH hosts to Additional
Redirect URLs (done for the live project, `docs/LAUNCH.md` §7a item 4).

### 3. Google OAuth

Follow `docs/GOOGLE-AUTH.md` for the click-path and the traps (including the
consent-screen state that produces a bare `access_denied`), and `docs/LAUNCH.md` §2 for
the live project's actual configuration.

### 4. Test on two devices

Cross-device continuity is the whole point of the account layer; no record in
`docs/HANDOFF.md` or `docs/LIVE-CHECKS.md` shows it exercised end to end. Sign in on one machine, write, sign in on
another, confirm it arrives — then edit both while offline and confirm
neither silently wins.

---

## Rollback

The build is static, so rollback is redeploying the previous version:

```bash
npx netlify rollback          # or redeploy a previous commit's dist
```

Nothing to migrate back. User data is in the user's browser, and the
account layer is additive — turning it off loses no local work.

---

## Known unverified

Stated plainly, because "untested" and "broken" are different things
and only a deployment can tell them apart:

- **Offline / PWA** — registration observed working on production (10 Oct 2026);
  the offline shell itself is still unrecorded; see step 6
- **Google sign-in** — works: a real login completed on the preview and production hosts
  (`docs/BROWSER-HANDOFF.md` §0 RESULT 0.2 item 4)
- **RLS, realtime, cross-device sync** — the RLS read side is proven live; the checks
  needing two real accounts have never run (`docs/SECURITY-RLS.md`)
- **Safari `afterprint`** — PDF cleanup has a timeout fallback, untested
- **The 101-page feature-blueprint PDF** is correct but long: `print.css`
  gives each step its own page on purpose

---

## Adding a page later

1. `vite.config.js` → add the entry
2. `scripts/verify-migration.mjs` → add it to its page list (`ALL_PAGES`, filtered into `PAGES`)
3. `src/data/navigation.json` → add the module, `status: "planned"`
   until it is real
4. `npm run build && npm run baseline` — **deliberately**, and say so in
   the commit. Re-baselining is how a regression becomes invisible
   forever. Verify the existing pages are green *first*, so the only
   thing the new baseline captures is the thing you meant.

A new **storage key** needs four registrations or it silently misbehaves
— `SCOPED_KEYS`, `PROJECT_KEYS` (now in `src/lib/backup.js`, not the hub), `ALL_KEYS` (still
on the hub) and the Supabase scope list. Miss the backup map and the key is exported by nothing and
restored by nothing. The round-trip check in `verify` will catch it.
