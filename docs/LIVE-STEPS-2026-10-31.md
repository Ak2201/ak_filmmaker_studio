# Live steps, 31 Oct 2026: drive-only storage (§66, google-token) and the first-ever tour

The design is in `docs/DRIVE-STORAGE.md`. **Nothing changes for anybody until
step 6.** Steps 1–5 are safe to do in any order before that:

- the client reads a missing `get_storage_mode()` as `supabase`;
- a missing `mark_tour_started()` falls back to the device-local tour rule;
- `google-token` answers 503 until its secrets are set.

Never run steps 6 and later before §66 has run AND the function is deployed.

## 1. Google Cloud (the same OAuth client sign-in already uses)

1. **Client secret.** Cloud Console → APIs & Services → Credentials → the
   OAuth 2.0 client that Supabase Auth → Providers → Google names.
   - Copy its **Client ID** and **Client secret**.
   - In Supabase → Auth → Providers → Google, confirm it is the SAME client
     id. There is one client for sign-in and Drive. Consent is recorded per
     client, so a second client would raise a second consent popup (CLAUDE.md,
     "There is ONE Google OAuth client").
2. **Offline access needs no console change.** `access_type=offline` is a
   request parameter, not a scope. The client sends it with
   `prompt=consent` only in drive mode, on a device that has no stored grant
   yet.
3. **The consent screen needs no change.** It must stay **In production**
   with the same scopes: openid, email, profile and `drive.file`.
   `drive.file` is non-sensitive, so no verification is triggered. Re-check
   the page once after step 6 and confirm it still says verification is not
   required. **Never add the restricted `drive` scope**: that needs a paid
   CASA assessment.
4. **Picker** (needed by the client half for a teammate opening a shared
   film):
   1. Enable the **Google Picker API** (and keep the Drive API enabled).
   2. Create an **API key** restricted by HTTP referrer to both hosts:
      `https://filmmakerstudio.in/*` and
      `https://thefilmmakerstudio.vercel.app/*`.
   3. Restrict its APIs to Picker and Drive.
   4. Set `VITE_GOOGLE_API_KEY` (the key) and `VITE_GOOGLE_APP_ID` (the
      project NUMBER, from the Dashboard) in the Vercel environment, then
      redeploy the site.

   The key is public by design: the referrer restriction is what guards it.

## 2. Secrets for the function

In a real terminal (the CLI refuses a tool shell; CLAUDE.md, "`supabase login`
needs a REAL TTY"):

```bash
supabase login
supabase link --project-ref conhlrulxfwkhsnymakz
openssl rand -base64 32            # → GOOGLE_TOKEN_KEY; keep a copy in your password manager
supabase secrets set GOOGLE_CLIENT_ID='<client id>' GOOGLE_CLIENT_SECRET='<client secret>' GOOGLE_TOKEN_KEY='<the base64 above>'
```

- **Keep `GOOGLE_TOKEN_KEY` safe and never rotate it casually.** Every stored
  grant is encrypted with it. A new key makes every stored grant undecryptable:
  each person then sees "Reconnect Google Drive" once and the function
  deletes their unreadable row. Nothing is lost, but everyone has to consent
  again.
- Never put any of the three values in the repo or in `.env`.

## 3. Deploy the function (CLI, never the dashboard editor)

```bash
supabase functions deploy google-token
```

- It imports `../_shared/google-token.js`. The dashboard's in-browser editor
  has no parent directory, so a deploy from there would need a pasted copy of
  a shared file. Use the CLI.
- Deploy WITH JWT verification, which is the default. Do not pass
  `--no-verify-jwt`.

**Read it back:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://conhlrulxfwkhsnymakz.supabase.co/functions/v1/google-token
```

Expect `401`. A `404` means it is not deployed. Ask the server which
functions exist; do not trust the CLI's own output (CLAUDE.md, "ALL FOUR EDGE
FUNCTIONS ARE DEPLOYED").

## 4. Run §66 live, with the checksum

```bash
F=supabase/schema/schema-66-drive-storage.sql
shasum -a 256 $F
# df2cf91444af86ca66515a00abfb135c27220da7cdbaf7027578f017a897ca51
base64 < $F                        # what you paste: decode it in the page, set the Monaco model
```

- **Never paste the SQL as text.** Base64 it across the clipboard, decode it
  in the page, set the editor's model directly, and compare the editor's
  SHA-256 with the hash above before pressing Run (CLAUDE.md, "PASTING SQL
  THROUGH THE CLIPBOARD CORRUPTS IT").
- §66 needs §40 and §45, which are live, and it runs after §65. It is
  re-runnable. The tour backfill runs only on the FIRST run, by design.

**Read it back** in the SQL editor:

```sql
select public.get_storage_mode();                                  -- supabase
select (select count(*) from public.account_profile) = (select count(*) from auth.users);  -- true
select count(*) from public.google_tokens;                         -- 0
select has_table_privilege('authenticated', 'public.google_tokens', 'select');  -- false
select pg_get_constraintdef(oid) from pg_constraint where conname = 'invite_codes_target_check';
--   CHECK (((pass_type)::text = 'screening_pass'::text) OR ((target_project_id IS NULL) AND (drive_file_id IS NULL)))
```

The clean-slate purge (`docs/LIVE-STEPS-2026-10-27.md` §0) knows §66's two
tables now, and its four checksums were recomputed. Run it before or after
§66.

## 5. The spike (two Google accounts, about 20 minutes)

Run `spike-drive.html` as `docs/DRIVE-STORAGE.md` (appendix) describes, and
fill in its results table. The answers decide which fallbacks ship:

- **Q1 or Q2 passes**: a teammate picks the folder once and the client does
  the rest.
- **Both fail**: Fallback A ships. A teammate also picks the files inside the
  folder ("Select all, then Select") and picks again for files added later.
- **Q4 fails**: Fallback B ships. A commenter reads comments but cannot post
  them; they are told to ask the owner for edit access.

## 6. Flip the switch, on a test studio first

1. Sign in to the console as the owner and go to People → **Where films are
   kept**. Read the counts: films, scopes and comments still on the server.
2. Tick **Keep films in each person's Google Drive** and confirm. The change
   is in the audit log (`set_storage_mode`).
3. In a private window, sign in as a TEST account that has a film on the
   server:
   - Google asks for consent again once. This is offline access.
   - The sheet "Moving your films to your Google Drive" runs.
   - The film appears in that account's Drive under `FilmMakerStudio/`.
4. Back in the console, **Films still on the server** drops by one, and
   **People with Drive renewal set up** rises by one.
5. Reload the test account an hour later. Drive still syncs without a popup.
   That is the `google-token` mint working.

## 7. Rollback

- **Untick the switch** (or run `select public.admin_set_storage_mode('supabase')`
  as the owner). From each page's next load:
  - clients sync to the server again;
  - `maybeMigrateLocalToCloud` re-uploads each person's films from their
    own device.
- **Films already moved stay in each person's Drive.** Nothing is deleted
  from Drive by a rollback.
- **Stored grants stay** and are harmless. To remove one person's grant:

  ```bash
  curl -X POST …/functions/v1/google-token -H "Authorization: Bearer <their JWT>" -d '{"action":"revoke"}'
  ```

  The console's DELETE TOTALLY revokes it at Google before it deletes the
  person.
- **The schema needs no rollback.** §66 with the switch on `supabase`
  changes nothing.

## What is NOT live after these steps

- Schema §66 has not run live.
- The `google-token` function has not been deployed.
- The client half has never run against real Drive. Its proofs use a faked
  Drive.
- No refund, payment or invoice path is touched by any of this.
