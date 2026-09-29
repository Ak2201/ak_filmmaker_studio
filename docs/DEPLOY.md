# Deploying The Filmmaker's Studio

Static build, no server. The app is **local-first**: everything a user
writes lives in their own browser. The Supabase account layer is
optional and can ship later — see [v1.1](#v11--the-account-layer).

That split is the most useful thing on this page. Four of the six
outstanding items are account features, and the app is fully usable
without any of them. **Ship v1 local-only; add accounts when the
console work is done.** Waiting on Google Cloud configuration to
release a working writing tool is the wrong trade.

---

## v1 — the static app

### 1. Pre-flight

```bash
npm ci
npm run ship      # build + verify; refuses to pass if the gate is red
```

`verify` must print `✓ all pages pass`. It is not a linter — it is the
thing standing between a refactor and somebody's lost screenplay. It
checks, across 13 pages:

| | |
|---|---|
| data-key parity | the storage contract. A renamed key orphans saved work |
| text coverage | no prose silently disappeared |
| contrast | WCAG AA, 4 themes × 5 skins, modals open |
| overflow | none at 390px, menus open and shut |
| inline handlers | zero, including inside modals — they are inert under our CSP |
| idle writes | zero in four seconds (the save-loop regression test) |
| themes / skins | 4 and 5, each visibly distinct |
| backup round trip | all 14 scoped keys restored, per project, none crossed over |

**If it is red, do not deploy.** Every failure it has ever reported has
been real.

### 2. Push

```bash
git push -u origin main
```

### 3. Deploy

Netlify (`netlify.toml` is committed, with the headers):

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

### 6. Offline / PWA — untested, test it first

The service worker has **never been observed working**, and the cause
is now established rather than assumed. On the preview server
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

**Each step is useless without the one before it. Do them in order.**

### 1. Run the schema — nothing works until this happens

`supabase-schema.sql` has never been executed against the live project.
Until it runs, sign-in will *appear* to succeed and every sync will
fail against tables that do not exist.

Supabase → SQL Editor → run the whole file. Then check:

```sql
select tablename from pg_tables where schemaname = 'public';
select relname, relrowsecurity from pg_class
  where relname in ('projects','project_data','accounts','account_members');
```

Every table must have `relrowsecurity = true`. RLS off on
`project_data` means one user can read another's script.

### 2. Fix the Site URL

Supabase → Authentication → URL Configuration. It still points at
`ak-filmmaker-studio.vercel.app`. Set it to your real origin and add
`/**` to Additional Redirect URLs — the app returns the user to
whichever of the 13 pages they signed in from.

### 3. Google OAuth

Follow `docs/GOOGLE-AUTH.md`. It has the click-path and the traps,
including the consent-screen state that produces a bare `access_denied`
with no explanation.

### 4. Test on two devices

Cross-device continuity is the whole point of the account layer and has
never been exercised. Sign in on one machine, write, sign in on
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

- **Offline / PWA** — never observed working. Proven to be the build
  environment blocking worker fetches, not the app; see step 6
- **Google sign-in** — the code path is built and exercised up to and
  back from the redirect, but no real login has ever completed
- **RLS, realtime, cross-device sync** — need a live project
- **Safari `afterprint`** — PDF cleanup has a timeout fallback, untested
- **The 101-page feature-blueprint PDF** is correct but long: `print.css`
  gives each step its own page on purpose

---

## Adding a page later

1. `vite.config.js` → add the entry
2. `scripts/verify-migration.mjs` → add it to `PAGES`
3. `src/data/navigation.json` → add the module, `status: "planned"`
   until it is real
4. `npm run build && npm run baseline` — **deliberately**, and say so in
   the commit. Re-baselining is how a regression becomes invisible
   forever. Verify the existing pages are green *first*, so the only
   thing the new baseline captures is the thing you meant.

A new **storage key** needs four registrations or it silently misbehaves
— `SCOPED_KEYS`, hub's `PROJECT_KEYS` and `ALL_KEYS`, and the Supabase
scope list. Miss the backup map and the key is exported by nothing and
restored by nothing. The round-trip check in `verify` covers all 14
keys and will catch it.
