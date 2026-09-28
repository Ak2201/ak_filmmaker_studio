# Google sign-in and account-backed storage — setup runbook

Everything in this file is console work: Google Cloud Console and the
Supabase dashboard. None of it can be done from the repository, and none
of it is done yet. The application code is finished and shipped; until
somebody walks this document, clicking **CONTINUE WITH GOOGLE** will end
at a Supabase error page reading `Unsupported provider: provider is not
enabled`.

Read the two blockers below before you start. They are the reasons a
first attempt fails.

---

## Blocker 1 — the schema has never been run

`supabase-schema.sql` has **never been executed against the live
project.** It is a file in this repository, not a state of the database.

Until it is run there are no `projects`, `project_data`, `accounts`,
`shares` or `comments` tables, no row-level security, and no
`resolve_share` / `claim_share` functions. Sign-in itself will work
without it — Supabase Auth is its own subsystem — and that is the trap:
you get a signed-in pill, an email address in the toolbar, and every
single sync silently failing against a table that does not exist. The
status line will say *"Saved here — could not reach your account"*
forever.

**Account-backed storage does not work until the schema is run.** The run
order is in [step 4](#4-run-the-schema).

## Blocker 2 — the Site URL points at a host that is not yours

The project's Supabase **Site URL** currently points at
`https://ak-filmmaker-studio.vercel.app` — a stale address from an
earlier deploy. The comment at the top of `supabase-schema.sql` still
records that value, which is where it came from.

Supabase uses the Site URL as the fallback redirect target whenever the
`redirect_to` it is handed is not on the allow-list. So with this left
uncorrected, a user who signs in at your real host gets bounced to
`ak-filmmaker-studio.vercel.app` — a host you may not control — with
their access token in the URL fragment. Fix it in
[step 5](#5-supabase--url-configuration) before you enable the provider,
not after.

---

## What the app does with these settings

Worth knowing before you click, because two of the values below have to
match something the code computes.

- **The redirect target is the page the user was on.** `signInWithGoogle()`
  passes `location.origin + location.pathname` — so `/index.html`,
  `/feature.html`, `/write.html` and the ten others are all valid return
  addresses. The allow-list therefore needs a per-origin wildcard, not a
  single URL.
- **The flow is implicit, not PKCE.** The tokens come back in the URL
  *fragment* (`#access_token=…`), which is never transmitted to any
  server, and the app replaces the history entry immediately so nothing
  lingers in the address bar. This is deliberate: PKCE would put a
  `?code=` in the query string and would break the existing magic-link
  path the moment somebody opens the emailed link on a different device
  from the one that asked for it. The reasoning is written out in
  `src/lib/cloud.js` under "COMING BACK FROM THE PROVIDER".
- **The anon key is public by design.** It ships in the browser and that
  is fine — access is decided by the row-level policies in
  `supabase-schema.sql`. **Never** put a `service_role` key anywhere near
  this app; the sign-in dialog rejects one if you paste it, but that is a
  courtesy, not a security boundary.
- **Local-first is still the contract.** Nothing below is required for
  the app to work. A user who never signs in keeps every word in
  `localStorage`, exactly as before.

---

## 1. Google Cloud — create or pick a project

1. Go to <https://console.cloud.google.com/>.
2. Open the project picker in the top bar → **New Project** (or pick an
   existing one).
3. Name it something you will recognise in two years —
   `filmmakers-studio-auth` — and **Create**.
4. Make sure the picker now shows that project. Everything below is
   scoped to it, and configuring the wrong project is the single most
   common way to lose an hour here.

## 2. Google Cloud — OAuth consent screen

**APIs & Services → OAuth consent screen** (newer consoles:
**Google Auth Platform → Branding** / **Audience**).

1. **User type: External.** Internal is only selectable, and only
   correct, if every user has an account in your Google Workspace
   organisation.
2. **App information**
   - App name: `The Filmmaker's Studio` — this is the name the user sees
     on the Google consent sheet, so it should be the name they expect.
   - User support email: your address.
   - App logo: optional. Uploading one triggers Google's brand review;
     skip it unless you want that process.
3. **App domain** (optional while testing, required to publish)
   - Application home page: your production URL.
   - Privacy policy and Terms of service links: required before Google
     will let you move out of Testing.
4. **Authorised domains** — add the registrable domain only, with no
   scheme and no path:
   - `netlify.app` if you are on a `*.netlify.app` subdomain
   - `vercel.app` if you are on a `*.vercel.app` subdomain
   - `supabase.co` — **required**, because the OAuth callback is served
     by Supabase, not by you
   - your own apex domain if you have one, e.g. `example.com`

   `localhost` is not entered here; Google allows it implicitly.
5. **Scopes** — click **Add or remove scopes** and select exactly these
   three non-sensitive scopes. Supabase needs no more, and anything more
   drags you into Google's verification review:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
6. **Test users** — while the app is in *Testing*, only addresses listed
   here can sign in, and **everyone else gets `access_denied`**. Add your
   own address and anyone else trying it out. The app surfaces that error
   verbatim, so if a tester reports "Google sign-in did not complete: …
   has not been granted access", this list is why.
7. **Publishing status** — leave it in Testing until the flow works
   end-to-end, then **Publish app** when you want anyone with a Google
   account to sign in. With only the three scopes above, publishing does
   not require Google's verification review.

## 3. Google Cloud — create the OAuth client

**APIs & Services → Credentials → + Create credentials → OAuth client ID.**

1. **Application type: Web application.**
2. **Name:** `Filmmaker's Studio web` (internal label only).
3. **Authorised JavaScript origins** — scheme and host, **no path, no
   trailing slash**. Add every origin the app is served from:

   ```
   http://localhost:5173          ← vite dev  (npm run dev)
   http://localhost:4173          ← vite preview  (npm run preview)
   https://<your-site>.netlify.app
   https://<your-custom-domain>   ← if you have one
   ```

4. **Authorised redirect URIs** — this is the one people get wrong.
   It is **not** your site. The browser returns to *Supabase*, which then
   bounces it to your site. There is exactly one entry, and it is
   Supabase's callback:

   ```
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

   `<project-ref>` is the 20-character string in your Supabase project
   URL — **Project Settings → General → Reference ID**, and the same
   string in the URL the app is configured with. If you are on a custom
   auth domain, use that host instead.

5. **Create.** Copy the **Client ID** and the **Client secret** now. The
   secret is shown once. It belongs in the Supabase dashboard and nowhere
   else — never in this repository, never in an env file that gets
   committed, never in the browser.

> Changes to origins and redirect URIs can take a few minutes to
> propagate on Google's side. A `redirect_uri_mismatch` immediately after
> saving is often just impatience; wait five minutes before hunting for a
> typo. Then hunt for the typo — it is usually a trailing slash or `http`
> where you meant `https`.

## 4. Run the schema

**Supabase dashboard → SQL Editor → New query.**

1. Paste the whole of `supabase-schema.sql` — the entire file, top to
   bottom, in one go. It is written to be applied in order: section 6
   deliberately redefines `has_project_access()`, `proj_select` and
   `proj_insert` over the versions defined earlier, and the last
   definition is the live one. Running it in pieces, or out of order,
   leaves you with the earlier policies and no account tier.
2. **Run.** It is idempotent — `create table if not exists`,
   `drop policy if exists` then `create policy`, and a backfill block
   that skips rows it has already filled. Re-running it is safe and is
   the correct way to apply a later change to the file.
3. Check afterwards, in the SQL Editor:

   ```sql
   -- all five base tables plus the account tier: 7 rows
   select table_name from information_schema.tables
    where table_schema = 'public' order by 1;

   -- RLS must be ON for every one of them
   select relname, relrowsecurity from pg_class
    where relnamespace = 'public'::regnamespace and relkind = 'r' order by 1;

   -- the scope allow-list must name all 14 keys
   select pg_get_constraintdef(oid) from pg_constraint
    where conrelid = 'public.project_data'::regclass and contype = 'c';

   -- realtime must carry both tables
   select tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public';
   ```

   The scope constraint must list all fourteen:
   `feature, short, library, feature_prefs, short_prefs, library_prefs,
   activity, scenes, contacts, shots, script, locations, workbench,
   dissect`. These are the same fourteen as `SCOPED_KEYS` in
   `src/lib/store.js` and `SCOPE_BY_KEY` in `src/lib/cloud.js`. All three
   lists have to agree: a scope missing from the SQL constraint is
   rejected by Postgres on upsert, and a key missing from `SCOPE_BY_KEY`
   never leaves the browser at all. (`cloud.js` warns in the console at
   load if the second mistake is ever reintroduced.)

## 5. Supabase — URL configuration

**Authentication → URL Configuration.** Do this *before* enabling the
provider, for the reason in [Blocker 2](#blocker-2--the-site-url-points-at-a-host-that-is-not-yours).

- **Site URL** — your real production origin, and only one value is
  allowed:

  ```
  https://<your-site>.netlify.app
  ```

  Replace the stale `https://ak-filmmaker-studio.vercel.app` that is
  there now. If you have a custom domain, use that instead, and make it
  the same host you actually send people to.

- **Redirect URLs** (Additional Redirect URLs) — the allow-list the
  `redirect_to` parameter is checked against. Because the app returns the
  user to whichever of the thirteen pages they were on, use a wildcard
  per origin:

  ```
  https://<your-site>.netlify.app/**
  http://localhost:5173/**
  http://localhost:4173/**
  https://<your-custom-domain>/**          ← if you have one
  ```

  Supabase matches these with a glob: `*` does not cross a `/`, `**`
  does. `…/**` is what covers `/index.html`, `/feature.html` and the
  rest. Add the Netlify deploy-preview pattern
  (`https://deploy-preview-*--<your-site>.netlify.app/**`) only if you
  actually need to sign in from previews; every entry here is a host you
  are willing to hand a token to.

## 6. Supabase — enable the Google provider

**Authentication → Providers → Google.**

1. Toggle **Enable Sign in with Google** on.
2. **Client IDs**: paste the Client ID from step 3.
3. **Client Secret**: paste the secret from step 3.
4. Leave **Skip nonce check** off.
5. Note the **Callback URL (for OAuth)** shown on this panel and confirm
   it is character-for-character the redirect URI you entered in step 3.4.
6. **Save.**

## 7. Point the browser at the project

The app does not read the Supabase URL from a build-time env var — it is
entered per browser and stored in `localStorage` under
`arunak_supabase_cfg_v1`. This is what makes the repository deployable by
anyone without secrets in it.

1. Open the app, click the **SIGN IN** pill in the toolbar.
2. First run shows **Connect an account**. Fill in:
   - **Supabase Project URL** — `https://<project-ref>.supabase.co`
     (Project Settings → Data API → Project URL)
   - **Anon (public) key** — Project Settings → API Keys → `anon` /
     `publishable`. Not the `service_role` key.
3. **SAVE & CONTINUE.** The dialog switches to **Sign in** with both ways
   in: **CONTINUE WITH GOOGLE** and the magic-link email path below it.

---

## Verifying it works

In order, because each step tells you something the next one assumes.

1. **The button navigates.** Clicking **CONTINUE WITH GOOGLE** should
   leave the site for
   `https://<project-ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=…&prompt=select_account`
   and land on Google's account chooser. If it never leaves, open the
   console: a `Cloud is not set up in this browser yet` error means step 7
   did not take.
2. **You come back signed in.** After choosing an account you should
   return to the page you started on, the URL fragment should already be
   gone, a toast should say *"Signed in as …"*, and the pill should show
   your email with a green dot.
3. **The status line is honest.** Click the pill → the menu's second row
   should read *"Everything is in your account"*. If it reads
   *"Saved here — could not reach your account"*, the schema has not been
   run (Blocker 1) or RLS is rejecting the write.
4. **The data actually lands.** Type something into a blueprint step,
   wait two seconds, then in the Supabase dashboard:

   ```sql
   select scope, updated_at, jsonb_typeof(data) from public.project_data
    order by updated_at desc limit 20;
   ```

   Exercise each module you care about — a scene in Breakdown, a contact,
   a shot, a script page, a dissection — and you should see the matching
   scope row appear. Fourteen scopes can appear in total; a project only
   writes the ones it has used.
5. **Cross-device continuity.** Sign in on a second browser. The project
   list and every scope should pull down. Edit in one and watch the other
   update — realtime is on for `project_data`.
6. **Nothing is lost when the network is.** Turn the network off, keep
   typing, turn it back on. The pill goes amber, the menu says *"N changes
   waiting to upload"*, and the queue drains when you reconnect. Your
   writing is never blocked on any of this.
7. **Sign out keeps the work.** Sign out and confirm every project is
   still in the list and every field still populated. Sign-out clears the
   session only — it never touches a `SCOPED_KEY`, the project list, or
   the pending queue.

---

## When it goes wrong

| What you see | What it means |
|---|---|
| `Unsupported provider: provider is not enabled` | Step 6 was not done, or was not saved. |
| `redirect_uri_mismatch` on Google's page | Step 3.4. The redirect URI must be `https://<project-ref>.supabase.co/auth/v1/callback`, not your site. Also check for a trailing slash. |
| `access_denied` — "has not been granted access" | The consent screen is still in **Testing** and this address is not a test user (step 2.6). |
| You land on `ak-filmmaker-studio.vercel.app` | The stale Site URL. Blocker 2. |
| Signed in, but "the session did not stick" | Your return URL is not on the Redirect URLs allow-list, so Supabase fell back to the Site URL. Step 5. |
| Signed in, pill green, but nothing appears in `project_data` | The schema has not been run, or RLS is refusing the write. Blocker 1, then check `has_project_access()`. |
| `new row violates check constraint "project_data_scope_check"` | A scope in `SCOPE_BY_KEY` is not in the SQL allow-list. Re-run the schema; compare the two lists per step 4.3. |
| The console warns *"these project-scoped keys have no cloud scope"* | A key was added to `SCOPED_KEYS` in `store.js` without a matching entry in `SCOPE_BY_KEY` in `cloud.js`. That key saves locally and never syncs. |
| Nothing happens at all, no navigation, no error | Check the CSP. `connect-src` must allow `https://*.supabase.co` and `wss://*.supabase.co` — it does in both `vercel.json` and `netlify.toml`, and those two files must be kept in step. |

**Recovering a copy the sync replaced.** Sync is last-write-wins per
scope, decided on a per-scope clock with the project's `updatedAt` as a
fallback. Before any remote value replaces a *different* non-empty local
value, the local one is copied into a capped ring buffer first. If
somebody believes a sync took their work:

```js
StudioCloud.listSalvage()        // [{ at, projectId, scope, data }, …]
StudioCloud.restoreSalvage(0)    // put entry 0 back and mark it local
```

It holds the last twelve displaced values, per browser.

---

## Security notes

- The **anon key is public**. It is meant to be. Security is the
  row-level policies, which is why Blocker 1 matters: a database with the
  tables but without the policies is worse than no database.
- The **service-role key must never appear** in this repository, in a
  build, in an env var the client can read, or in the sign-in dialog. It
  bypasses RLS entirely.
- **No token is ever put in a query string** by this app. The share link
  token rides in `localStorage` across the OAuth round trip rather than
  on the redirect URL, precisely so it does not end up in a server log or
  a `Referer` header.
- **Audit RLS before you hand out share links to strangers.** The
  policies in `supabase-schema.sql` have been reasoned about and the file
  documents several fixed holes, but they have never been exercised
  against a live project with more than one real user. That audit is open
  item 5 in `CLAUDE.md`.
- **Google's branding.** The sign-in button here uses a single-colour
  glyph that inherits the theme, not Google's four-colour mark, because
  four brand hexes would be the only unthemed thing in a five-skin,
  four-theme palette. If you publish the app and Google's brand review
  asks for the official button, that is the place to change it —
  `GOOGLE_MARK` in `src/ui/auth.js` and `.cm-btn.google` in
  `src/styles/auth.css`.
