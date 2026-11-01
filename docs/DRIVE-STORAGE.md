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
| Client sync | `src/lib/drive-store.js`, `src/lib/drive-project-sync.js`, the `cloud.js` routing, the Picker, the migration sheet (`test:drive-store`, `prove:drive-only`) | Built; integrated with this half in item 77. See *The client half* below. |
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

# The client half (31 Oct 2026)

### Where the code is

| File | What it does |
| --- | --- |
| `src/lib/drive-store.js` | The adapter: layout, revisions, push/pull/conflict, comments, sharing, private budget, screening exports. PURE apart from an injected `transport`; no store.js, no cloud.js, no DOM, no localStorage. |
| `src/lib/drive-migrate.js` | Moves an account's server rows into its Drive, verified before anything is deleted. Pure apart from what is injected. |
| `src/lib/drive-project-sync.js` | cloud.js's drive branch (lazy): WHEN to push and pull, the device state, comments/shares/budget/screening/migration entry points. NOT `drive-sync.js`, which stays the single-file backup. |
| `src/lib/drive.js` | Gains `transport` (the store's wire, token + one 401 retry) and `setTokenSource()` (the silent mint, asked first). |
| `src/lib/drive-picker.js` | The Google Picker, lazy, on a click only. |
| `src/ui/drive-ui.js` | The migration sheet, the drive share sheet, and the Reconnect / shared-film / late-files toasts. Reached through the `driveUI` port. |
| `src/lib/cloud.js` | `readStorageMode()`; every sync entry point routes `if (_mode === 'drive')`. |
| `src/lib/auth-scope.js` | `googleQueryParams({ drive, needGrant })`, shared by `cloud.js` and `start-auth.js`. |

### Layout

```
<product name>/                 appProperties fms_kind=root
  <project title>/              fms_kind=project, fms_pid=<local id>, fms_format
    project.json                fms_kind=meta: {v, id, title, format, region, files:{scope:id}, budgetPrivate}
    <scope>.json                fms_kind=scope, fms_scope: exactly project_data.data for that scope
    comments.json               fms_kind=comments: {v, items:[comment rows + tombstones]}
    frames/                     fms_kind=frames: storyboard images (refs stay drive:<id>)
    screening-<pass>.json       fms_kind=screening: a pass's read-only export
  Private — <id>/               fms_kind=private: library.json + costs.json when the budget is private
```

Everything is found by `appProperties`, never by name. The scopes are exactly
`SCOPE_BY_KEY` in cloud.js (passed in, not hand-listed); `fms_scene_bin_v1`
stays local. Upload is multipart under 5 MB and resumable at or above.

### The sync rule

The device keeps, per scope, `{ id, rev, hash }`: the head revision it last
AGREED with and the canonical SHA-256 (sorted keys) of that content. Local is
**dirty** when its hash differs; the remote **moved** when its head differs.

- **Push**: 2 s after the last save, at most 10 s after the first; flushed on
  `visibilitychange:hidden` / `pagehide` (keepalive under 64 KB). Before an
  upload the head is read; if it moved, it is a conflict.
- **Pull**: on project open, on focus / visible, every 60 s while visible.
  One `files.list` on the folder (heads only); only moved scopes download.
  Applied with the same echo guard cloud.js uses, and `cloud:synced` names the
  scopes so open pages redraw.
- **Conflict**: script and story merge three-way (`script-merge.js`,
  `story-merge.js`) against the base revision, only while §49's co-editing
  switch is on; write goals merge always (a union). Otherwise — or when Drive
  has pruned the base revision — the remote wins in storage and the local copy
  goes to the salvage list (Settings → Sync → Recovered copies), with a toast.
- **The race Drive cannot close** (no compare-and-swap): after every upload the
  revision list is read; a revision that landed between the check and the
  write is merged back once.
- **A refused write never looks like a save.** A 403/5xx/no-token leaves the
  local copy as written, the status line says what Drive answered, and the
  scope stays dirty, so the next pass sends it.
- **No realtime, no presence** in drive mode: both key off a `projects` row
  that no longer exists. `joinPresence()` answers null.

### Sharing, comments, screening

- **Share** = `permissions.create` on the folder (edit→writer,
  comment→commenter, view→reader), Google's e-mail carrying
  `<origin>/?drive=<folderId>`. The Share sheet is e-mail only in drive mode
  (link tokens with an edit role are gone) and suggests the account's member
  e-mails. Revoke = `permissions.delete`. Account seats still count account
  membership, not Drive permissions.
- **Opening a shared film**: the `?drive=` link raises a toast whose button
  opens the Google Picker on the folder. Then the folder's children are listed;
  if they are invisible (Q1 = no) a second Picker on the folder's contents with
  multiselect ("Select all, then Select") — **Fallback A**. Files named in
  `project.json` that this account cannot see raise "N new files in this film —
  pick to open", which reruns Fallback A.
- **Comments**: writers read-modify-write `comments.json` with the same head
  check, merging by id (union; later `updated_at` wins; deletes are tombstones
  so a merge cannot resurrect them). **Commenters** cannot write files: they
  post a Drive comment on `comments.json` whose content is `FMSC1:` + the item;
  a writer's next pull folds it in (author = whoever Drive says posted it) and
  deletes the Drive comment. **Fallback B**: if Drive refuses the commenter's
  comment, the UI says "Ask the owner for edit access to comment."
- **Private budget**: `library.json` and `costs.json` are MOVED into an
  owner-only folder in the root (permissions inherit from folders, so a move is
  the only way to hide a file). Owner-only in drive mode: §55's edit
  collaborators with a grant cannot be expressed in Drive.
- **Screening**: the owner's console makes the pass (`admin_create_invite`
  with no target project), writes `screening-<pass>.json` (story, feature,
  short, scenes — what `screening_open` returned), shares it `anyone/reader`
  with no discovery, and puts the FILE ID on the pass. `screening_open` hands
  the id over only while the pass is valid; the room reads the file with the
  build's API key in the `x-goog-api-key` HEADER (repo rule: never in a URL)
  and no OAuth. Expiry: the owner's client removes the anyone permission and
  trashes the file on its next pull after `expires_at`, and at once on revoke.
- **Plan caps** are counted client-side from `billing_status().limits` against
  owned project folders: the P0402 triggers no longer see content.

### Tokens

Sign-in asks Google for `access_type=offline` + `prompt=consent` only when the
server is in drive mode AND this device has no record of the grant
(`fms_drive_sync_v1.store[<uid>].granted`) or the server said `regrant`.
On a session carrying `provider_refresh_token`, the client calls
`google-token {action:'store'}` once. From then on `drive.js` asks
`google-token {action:'mint'}` before anything else (one in-flight mint); a
409 `{code:'regrant'}` shows **Reconnect Google Drive**, which signs in again
with consent. The access token stays in memory only. `signOut({everywhere:true})`
revokes first; the console's DELETE TOTALLY revokes `{user_id}` first.

### Migration of server content

On a sign-in in drive mode, when `drive_migrate_list()` returns anything owned,
under `navigator.locks('fms-drive-migrate')` (one tab), per project: find or
create the folder by `fms_pid`; per scope read → write → **read back → compare
canonical hashes** (retry once, then stop that project); `comments.json` the
same; frames moved into `frames/` (frames not owned are left and reported);
collaborators shared in; **only then** `drive_migrate_delete_scope(p_data =
the read-back JSON)` per scope (the server deletes only if its row still
equals it; a `false` re-copies and re-verifies that scope), the comments, and
`drive_migrate_finish`. Nothing is deleted before the read-back matches;
progress is in `fms_drive_sync_v1.migrate`, so a killed run resumes. The local
copy is refreshed from the verified Drive copy (a differing local copy is
salvaged first). The sheet says "Nothing on our server is deleted until your
Drive copy reads back identical", has Pause, and folds into a toast that does
not time out. Collaborator-only projects are not migrated: they appear when
their owner migrates and shares.

### What the client expects from the server (§66 + google-token)

| Call | Client use |
| --- | --- |
| `get_storage_mode()` → text | anon and authenticated; anything but `'drive'` reads as `'supabase'` |
| `google_token_status()` → `{has_token, updated_at}` | marks the grant recorded when the session carries no refresh token |
| `drive_migrate_list()` → rows `{project_id, title, format, scopes}` | `scopes` may be text[] or `[{scope}]` |
| `drive_migrate_read(p_project, p_scope)` → jsonb | |
| `drive_migrate_delete_scope(p_project, p_scope, p_data)` → boolean | `false` = the row changed: re-copy |
| `drive_migrate_collaborators(p_project)` → `(email, role)` | role in edit/comment/view |
| `drive_migrate_delete_comments(p_project, p_ids)` | |
| `drive_migrate_finish(p_project)` | |
| `screening_open(...)` → adds `drive_file_id` | |
| `screening_set_drive_file(p_pass uuid, p_file_id text, p_title text, p_format text)` | puts the file id (and the film's title and format) on a pass made by `admin_create_invite` with `p_target_project = null`, which §66's relaxed `invite_codes_target_check` allows. (The client branch first called this `admin_set_screening_file`; the integration, item 77, moved it to §66's name.) |
| `POST /functions/v1/google-token` `{action:'store'|'mint'|'revoke', refresh_token?, user_id?}` | `mint` → `{access_token, expires_in, scope}`; 409 `{code:'regrant'}`; 404 `{code:'no_token'}` (the silent GIS mint is tried next); `store` → 204; `revoke` → 200 `{revoked, removed, google}` (sent by `google-token.js` `revokeGoogleGrant()`, the one revoke path) |

### Tests

- `npm run test:drive-store` (in `test:all`): drive-store + drive-migrate
  against `scripts/fake-drive.mjs` — root/folder once, round trips, merges
  (script/story/write goals), keep-both, pruned base, commenter folding,
  Fallback A and B, private budget, faults, the migration's ordering, a
  read-back mismatch, a killed run resuming, a row changed mid-migration.
- `npm run prove:drive-only` (CI proofs job, `PROVE_DIST=dist-verify`): the
  built app against the same fake Drive and a faked Supabase — see its header.

### If the spike answers badly

- **Q1 and Q2 both fail** → Fallback A is what ships (already built).
- **Q4 fails** → Fallback B (already built): commenters are read-only.
- **Q5: revisions pruned** → keep-both (already built).
- **Q6: no expiry on anyone-links** → the owner's client removes them (built).


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
