# Live steps — drive-only storage (31 Oct 2026)

The design is `docs/DRIVE-STORAGE.md`. The client (`feat/drive-client`) does
nothing different until `storage_mode` is `'drive'`. Do these in order.

1. **Google Cloud** (project `filmstudio-495419`, the one OAuth client):
   1. Copy the OAuth client secret into the Supabase secret
      `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_CLIENT_ID`. Generate
      `GOOGLE_TOKEN_KEY` with `openssl rand -base64 32`.
   2. Supabase → Authentication → Google: confirm it is the same client.
   3. Enable the **Google Picker API**. Create an API key restricted to the
      Picker API and the Drive API, by HTTP referrer, for both hosts
      (`filmmakerstudio.in`, `thefilmmakerstudio.vercel.app`). Set
      `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID` (the project NUMBER) in
      the host's environment, then redeploy. Without the key, a teammate
      cannot open a shared folder and the screening room cannot read a pass.
   4. The consent screen needs no change: `drive.file` is still
      non-sensitive, and offline access is not a scope.
2. **Deploy the function**: `supabase functions deploy google-token` (the CLI,
   in a real terminal).
3. **Run §66 live** with the base64 + SHA-256 checksum routine (CLAUDE.md:
   never paste schema SQL without a checksum). Read it back:
   `select get_storage_mode();` → `supabase`;
   `select count(*) from account_profile;` → the number of users.
   The client also needs **`admin_set_screening_file(p_id, p_drive_file_id)`**
   and `admin_create_invite` accepting a screening pass with no target
   project (see the table in `docs/DRIVE-STORAGE.md`).
4. **Run the spike** (`spike-drive.html`) with two accounts and fill in the
   results table in `docs/DRIVE-STORAGE.md`. If Q1 and Q2 both fail,
   Fallback A (already built) is what ships.
5. **Flip** with `admin_set_storage_mode('drive')` from the console, starting
   with a test account's studio. On the next sign-in each owned film moves to
   that account's Drive; the sheet shows progress and nothing on the server is
   deleted until the Drive copy reads back identical.
   **Roll back** with `admin_set_storage_mode('supabase')`: migrated content
   stays in Drive, and the next sign-in's adoption re-uploads from the local
   copy.
