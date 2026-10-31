# Drive-only storage

Owner decision, 20 Oct 2026, confirmed 31 Oct 2026: every piece of writing,
every frame and every photo lives in the user's own Google Drive, one folder
per project. Supabase keeps only who people are (Google identity), plans,
billing, invites and the gate, the console, and analytics. A team gets access
by having the project's Drive folder shared with it.

**Nothing changes live until the owner flips the switch.** The server switch
is `billing_settings.storage_mode`: `'supabase'` (the default) or `'drive'`.
While it reads `'supabase'`, every existing sync path stays byte-identical. The
owner flips it from the console (People → **Where films are kept**). The owner
steps, including rollback, are in `docs/LIVE-STEPS-2026-10-31.md`.

## Status (31 Oct 2026)

| Half | Where | State |
| --- | --- | --- |
| Schema §66 | `supabase/schema/schema-66-drive-storage.sql`, checked by `scripts/schema-tests/drive-storage.sql` (67 checks under `npm run test:schema`) | Built. **Not run live.** |
| Token function | `supabase/functions/google-token/index.ts` + the pure `supabase/functions/_shared/google-token.js` (`npm run test:google-token`) | Built. **Not deployed**, and its secrets are not set. |
| Console switch | `src/ui/storage-admin.js` over `src/lib/storage-mode-api.js` | Built. |
| Revoke hooks | `src/lib/google-token.js` `revokeGoogleGrant()`, called by DELETE TOTALLY (both console paths) and by `cloud.js` `signOut({ everywhere: true })` | Built. Nothing in the UI calls `everywhere` yet. |
| Client sync | `src/lib/drive-store.js`, `src/lib/drive-project-sync.js`, the `cloud.js` routing, the Picker, the migration sheet | The client half, built separately against this contract. |
| Phase 0 spike | `spike-drive.html` (appendix below) | Never run. |

**The spike never ran, so the design assumes the worst answers under
`drive.file`.** The scope stays `drive.file`, and the app never requests the
restricted `drive` scope (that would need a paid CASA assessment). Each
fallback below is written into the design, not left for later.

## 1. The Drive layout

- **Root folder.** One per user, named `FilmMakerStudio`, with
  `appProperties {fms_kind:'root', fms_v:'1'}`. A device finds it by that
  appProperty and makes it only when there is none.
- **Project folder.** One per project, inside root, with
  `appProperties {fms_kind:'project', fms_pid, fms_format, fms_v:'1'}`. It is
  named after the film and renamed with it, but never looked up by name.
- **Files in a project folder.** Each carries `{fms_kind, fms_pid, fms_scope?}`.

  | File | Content |
  | --- | --- |
  | `project.json` | the manifest: `{v:1, id, title, format, region, sample?, createdAt, files:{<scope>:<fileId>}, comments, frames, budgetPrivate?}` |
  | `<scope>.json` | exactly what cloud.js would upsert as `project_data.data` for that scope |
  | `comments.json` | `{v:1, items:[…]}`, one item per row of the old `comments` table |
  | `frames/` | storyboard images; refs stay `drive:<fileId>` |
  | `screening-<passId>.json` | a read-only export for a screening pass (§4) |

- **One file per scope**, not one blob: it maps 1:1 onto `project_data`
  rows, so the migration verifies and deletes one scope at a time; each
  scope has its own `headRevisionId`, so two people editing scenes and the
  script never collide; and the merge tables (`COEDIT`, `MERGE_BY_SCOPE`)
  are already keyed by scope. The scope list is `SCOPE_BY_KEY` in cloud.js,
  never a hand-written list. `LOCAL_ONLY` (the scene bin) stays local.
- **Private budget (§55 parity).** `library.json` and `costs.json` are moved
  into an owner-only folder (`fms_kind:'private'`) in root. Moving a file is
  the only way to hide it from a shared folder, because permissions inherit
  from the folder. Decision: in drive mode a private budget is owner-only.
  Drive cannot express §55's "edit collaborators who have a grant".

## 2. Sync on the client

- **Push**: 2 s after the last write to a scope, flushed at a 10 s cap and on
  `pagehide`. A refused write fires `storage:error`, never `saved`.
- **Pull**: on project open, on focus, and every 60 s while the tab is
  visible. One `files.list` reads every scope's `headRevisionId`, and only
  the scopes that changed are downloaded.
- **No realtime in drive mode.** The `pd:`, `cm:` and `pr:` channels are not
  joined. Presence RLS needs a `projects` row, which no longer exists.
- **Conflicts.** Before each upload the client reads the scope's
  `headRevisionId`:
  - If it moved and the scope has a merger (`script` and `story` under §49's
    switch, `write_goals`), the client three-way merges against the stored
    base revision.
  - If there is no merger, or Drive has pruned the base revision (404), the
    remote copy wins in storage and the local copy goes to the existing
    Recovered copies list (keep both).
  - Drive has no compare-and-swap, so after each upload the client
    re-checks the revisions once and merges again if one landed in between.
- **Device state** lives in the existing `fms_drive_sync_v1`, as the
  subfields `store` and `migrate`. That key is device-local, is in
  `ALL_KEYS`, and is out of `GLOBAL_KEYS`. No new key.
- **The project entry** gains the field `drive:{folderId, role, picked?}`.
  It is never exported in a backup.

## 3. Teams and comments

- **Sharing is the folder's Drive permissions**, which replace both
  `project_collaborators` and share links. Roles map edit → `writer`,
  comment → `commenter`, view → `reader`. Google e-mails the person a link
  to `/?drive=<folderId>`. In drive mode there are no link shares with an
  edit role.
- **A teammate opens the film once through the Google Picker** (the folder).
  This needs `VITE_GOOGLE_API_KEY` and `VITE_GOOGLE_APP_ID`.
  - **Fallback A** (the spike's Q1/Q2 fail and the folder's children stay
    invisible under `drive.file`): a second Picker opens on that folder,
    multiselect on, with "Select all, then Select". A file added later shows
    up as "N new files in this film — pick to open", which reruns Fallback A.
- **Comments.**
  - Writers read, modify and write `comments.json`, merging by item id.
  - Commenters cannot write files, so they post a Drive comment on
    `comments.json` whose content starts `FMSC1:`. A writer's next pull folds
    it in and deletes it.
  - **Fallback B** (Drive refuses the Comments API to a commenter): the role
    reads as view-only, with "Ask the owner for edit access to comment."
- **Seats** (`account_members`) stay in Supabase and still limit an
  account's membership. They do not limit Drive permissions.
- **Plan caps** in drive mode are counted on the client from
  `billing_status().limits` against the folders a person owns. The P0402
  triggers protected our database, and the content is no longer in it.

## 4. The screening room

- A pass stays in `invite_codes`, because it is gate data: the code, its
  expiry, the open count and the viewer log.
- In drive mode the owner's client writes `screening-<passId>.json`, shares
  that one file as anyone-with-the-link reader with discovery off, and calls
  `screening_set_drive_file(pass, fileId, title, format)`.
- `screening_open()` then returns `drive_file_id` instead of scopes, and only
  while the pass is valid. `screening.html` reads the file with the public
  API key and no OAuth.
- The file id appears in no URL, so the pass's expiry is the gate. The owner's
  client deletes the anyone permission and trashes the file on its next pull
  after the pass expires or is revoked.
- Moving a film keeps a Drive pass and unlinks it from the old project row. A
  pass that still served synced scopes has nothing left to show, so the move
  revokes it and keeps its viewer log.

## 5. Token renewal: the `google-token` function

Supabase never stores Google's `provider_token`, and a GIS silent mint needs
a live Google session. To keep Drive working silently past the hour, the
server holds a refresh token:

- **Sign-in** asks for `access_type=offline` and `prompt=consent` in drive
  mode, on a device that has no grant yet (`store.granted`) or after a
  `regrant`. Offline access is not a scope, so the consent screen does not
  change.
- On `SIGNED_IN`, the client posts `session.provider_refresh_token` to
  `google-token` `{action:'store'}`. The function refuses to store
  (409 `mode`) unless the studio is in drive mode, so no grant is collected
  before one is needed.
- `{action:'mint'}` returns `{access_token, expires_in, scope}`. On
  `invalid_grant` the function deletes the row and answers 409 `regrant`,
  which the client shows as "Reconnect Google Drive". The function never
  returns a refresh token.
- `{action:'revoke', user_id?}` revokes at Google, then deletes the row. If
  Google cannot be reached, the row is kept so a later revoke can reach it.
  A `user_id` that is somebody else needs the owner role, which the function
  asks the database as the caller (`studio_role()`).
- **Encryption.** The token is stored as base64(iv[12] ‖ AES-256-GCM
  ciphertext+tag), with the **user id as AAD**. A row copied onto another
  user id does not decrypt. The key is the function secret
  `GOOGLE_TOKEN_KEY`, and the client secret is `GOOGLE_CLIENT_SECRET`.
- **No client role may select `google_tokens`, not even its owner.**
  `google_token_status()` says only whether a grant exists and when it was
  renewed.
- **Revocation points.** The console's DELETE TOTALLY calls
  `revoke {user_id}` before `admin_delete_user`; the cascade from
  `auth.users` drops the row even if Google is down.
  `cloud.js signOut({everywhere:true})` calls `revoke` before
  `auth.signOut({scope:'global'})`.

## 6. Moving existing films (copy, read back, verify, then delete)

The move runs on sign-in in drive mode, when `drive_migrate_list()` names
films the person owns. A `navigator.locks` lock (`fms-drive-migrate`) keeps
it to one tab. For each film:

1. Find the folder by `fms_pid`, or make it. A rerun reuses the folder.
2. For each scope: `drive_migrate_read`, write `<scope>.json`, read it back,
   and compare canonical hashes (sorted-key stringify, then SHA-256). A
   mismatch is retried once, then the film stops with an error.
3. Comments the same way, into `comments.json`.
4. Frames: the client moves each `drive:` file into `frames/`. Frames the
   owner does not own are listed and left where they are.
5. The client shares the folder with each person `drive_migrate_collaborators`
   names.
6. **Only once every scope is verified**, the server rows are deleted:
   - `drive_migrate_delete_scope(p, scope, <the JSON read back>)` deletes a
     row **only if it still equals that payload** (jsonb equality). An edit
     that landed after the read survives, returns false, and that scope goes
     round again.
   - `drive_migrate_delete_comments(p, ids)` deletes exactly the named ids,
     and keeps a comment that has a reply the client never read (deleting a
     parent cascades to its replies).
   - `drive_migrate_finish(p)` refuses (P0001) while any scope or comment
     row remains. It then removes shares, collaborators and the project row.

A failure anywhere leaves the server rows as they were, and the next sign-in
resumes from `fms_drive_sync_v1.migrate`. Every step is idempotent. Every
migrate RPC is owner-only and refuses unless the studio is in drive mode
(55000). A collaborator's films are moved by their owner, never by them.

## 7. What stays in Supabase

- Sign-ins.
- `studio_members`, invite codes, tickets, redemptions and requests.
- Device sessions.
- `accounts` and `account_members`.
- Plans, payments, invoices, `billing_settings`, referral credits, promo
  codes and testimonials.
- Funnel and analytics events, and the admin audit log.
- §66's `google_tokens` and `account_profile`, which are account data.

`admin_storage_overview()` gives the console counts only: films, scopes and
comments still on the server, and how many people have Drive renewal set up.
In drive mode the console cannot open anybody's writing, and that is the
point of the change.

## 8. The first-ever tour (§66, same section)

`account_profile.tour_started_at` is the account's own "has ever been
toured" flag. `mark_tour_started()` returns true **exactly once** across
every device and tab; the client starts the tour (Dragon sample, every
navigation page) on true. Every account that existed when §66 first ran is
backfilled as toured. The backfill runs only on that first load, so a re-run
does not mark people who signed up in between. The device's own progress
stays in `fms_tour_v1`. If the function is missing (PGRST202), the client
falls back to the device-local rule.

---

# Appendix: the Phase 0 spike (not yet run)

Before any storage code was written, this spike was meant to settle what
Google's `drive.file` scope allows for a folder that has been shared. It has
not run, which is why the design above carries Fallbacks A and B. Running it
(LIVE-STEPS-2026-10-31 §5) tells the owner which of them ship. The spike is
the dev-only page `spike-drive.html` (code: `src/dev/drive-spike.js`). It is
never built or shipped. It uses the app's own OAuth client and scope, and it
stores nothing.

### What you need

- Two Google accounts: **A** (the owner) and **B** (a teammate). A third,
  **C**, for the commenter test is optional.
- The repo running locally with `npm run dev`. `.env` already holds
  `VITE_GOOGLE_CLIENT_ID`.
- In Google Cloud Console → Credentials, on the OAuth client: add
  `http://localhost:5173` to **Authorised JavaScript origins** if it isn't
  there already.
- For test 5 only:
  - an **API key** restricted to the Google Picker API (Credentials →
    Create credentials → API key, then enable "Google Picker API");
  - the project **number** from Cloud Console → Dashboard.

  Paste both into the page. Nothing saves them.

### Steps

Open `http://localhost:5173/spike-drive.html` in two browsers, or in one
normal window and one private window: A in one, B in the other.

| # | Who | Press | Answers |
| --- | --- | --- | --- |
| 1 | A | **1 Make folder + files** | The app can make a project folder with files in it |
| 2 | A | Type B's e-mail, then **2 Share with B (writer)**. Optionally C's, then **2 Share with C (commenter)** | Sharing from inside the app works |
| 4 | B | Paste A's folder id, then **4 Open by folder id** | **Q2**: can a teammate see and change the shared files without the Picker? |
| 5 | B | Fill in the API key and project number, then **5 Open through the Picker** and pick the folder | **Q1**: does picking the folder unlock the files inside it? |
| 1b, 4/5 | A, then B | A presses **1b**; B runs 4 or 5 again | Does a file added *after* sharing show up for the teammate? |
| 6 | C | Paste the folder id, then **6 Write as commenter** | **Q4**: commenters can't write files (expected); can they use Drive's comments instead? |
| 3 | A | **3 Link-share a file**. Open the printed link in a private window, then press **3c Revoke** and reload it | **Q6**: can a screening link be shared, given an expiry, and revoked? |
| 7 | A or B | **7 Revision retention**. Press **7b** an hour later and again the next day | **Q5**: how many revisions Drive keeps for a file the app saves often |

When you're done, press **Copy results** in each browser and paste both blocks to
me.

### What each answer changes

- **Q2 PASS** (B can list and change the files by id): the Picker is needed
  only to find the folder, and the app does everything else.
- **Q2 FAIL, Q1 PASS:** opening a shared project always goes through the
  Picker once per teammate. That is the planned design.
- **Q1 and Q2 both FAIL**, or the 1b file stays hidden: under `drive.file`
  a teammate would have to pick files individually and pick again for every
  new photo. In that case I'll come back to you before going further. The
  alternative is Google's restricted `drive` scope, which needs a paid
  security assessment (CASA) and a re-verified consent screen.
- **Q4:** if Drive's comments API works for commenters, comments become
  Drive comments on the project's files. Otherwise only writers can
  comment.
- **Q5:** the three-way merge needs the base revision. If Drive has pruned
  it, the app falls back to the "keep mine / take theirs" choice, so
  nothing is lost, but it's less smooth.
- **Q6:** if an expiry can't be set on an anyone-with-link permission,
  screening passes expire by being revoked when the owner next opens the
  app (or by the server function, which holds the token).

### Results

_To be filled in from the pasted blocks._

| Q | Result | Notes |
| --- | --- | --- |
| Q1 Picker unlocks folder contents | | |
| Q2 Folder id alone works | | |
| Late-added file visible | | |
| Q4 Commenter can write / can comment | | |
| Q5 Revisions kept (now / 1 h / 1 day) | | |
| Q6 Link share, expiry, revoke | | |
