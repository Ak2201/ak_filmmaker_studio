# Drive-only storage

Owner decision, 20 Oct 2026, confirmed 31 Oct 2026: every piece of writing,
every frame and every comment lives in the user's own Google Drive, one folder
per project. Supabase keeps sign-in, plans, billing, invites, the gate, the
console and analytics. A team gets access by having the project's folder
shared with them.

**Status (31 Oct 2026): the client is built** (branch `feat/drive-client`)
behind the server switch `billing_settings.storage_mode` ('supabase' default |
'drive'). **Nothing changes live until the owner flips it.** While it is
'supabase', every Supabase path is byte-identical and the drive code is never
fetched. The server half (schema §66, the `google-token` edge function) is a
separate branch; the contract between the two is listed under *What the client
expects from the server* below. Owner steps: `docs/LIVE-STEPS-2026-10-31.md`.

The Phase 0 spike (appendix) never ran, so this design assumes the WORST
answers under `drive.file` and builds the fallbacks in. The scope stays
`drive.file`; restricted `drive` is never requested.

## Where the code is

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

## Layout

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

## The sync rule

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

## Sharing, comments, screening

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

## Tokens

Sign-in asks Google for `access_type=offline` + `prompt=consent` only when the
server is in drive mode AND this device has no record of the grant
(`fms_drive_sync_v1.store[<uid>].granted`) or the server said `regrant`.
On a session carrying `provider_refresh_token`, the client calls
`google-token {action:'store'}` once. From then on `drive.js` asks
`google-token {action:'mint'}` before anything else (one in-flight mint); a
409 `{code:'regrant'}` shows **Reconnect Google Drive**, which signs in again
with consent. The access token stays in memory only. `signOut({everywhere:true})`
revokes first; the console's DELETE TOTALLY revokes `{user_id}` first.

## Migration of server content

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

## What the client expects from the server (§66 + google-token)

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
| **`admin_set_screening_file(p_id uuid, p_drive_file_id text)`** | **named by the client** (the spec named no setter): puts the file id on the pass; `admin_create_invite` must accept a screening pass with `p_target_project = null` |
| `POST /functions/v1/google-token` `{action:'store'|'mint'|'revoke', refresh_token?, user_id?}` | `mint` → `{access_token, expires_in}`; 409 `{code:'regrant'}`; `store`/`revoke` → 204 |

## Tests

- `npm run test:drive-store` (in `test:all`): drive-store + drive-migrate
  against `scripts/fake-drive.mjs` — root/folder once, round trips, merges
  (script/story/write goals), keep-both, pruned base, commenter folding,
  Fallback A and B, private budget, faults, the migration's ordering, a
  read-back mismatch, a killed run resuming, a row changed mid-migration.
- `npm run prove:drive-only` (CI proofs job, `PROVE_DIST=dist-verify`): the
  built app against the same fake Drive and a faked Supabase — see its header.

## If the spike answers badly

- **Q1 and Q2 both fail** → Fallback A is what ships (already built).
- **Q4 fails** → Fallback B (already built): commenters are read-only.
- **Q5: revisions pruned** → keep-both (already built).
- **Q6: no expiry on anyone-links** → the owner's client removes them (built).

## Appendix: the Phase 0 spike (still unrun)

Owner decision, 20 Oct 2026: every piece of writing, every frame and every
photo lives in the user's Google Drive. Supabase keeps sign-in, plans and
billing, and the console. Each project becomes one Drive folder, and a team
gets access by having that folder shared with them.

Before any storage code is written, this spike settles what Google's
`drive.file` scope allows for a folder that has been shared. Every later
design choice depends on the answers. The spike is the dev-only page
`spike-drive.html` (code: `src/dev/drive-spike.js`). It is never built or
shipped. It uses the app's own OAuth client and scope, and it stores
nothing.

## What you need

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

## Steps

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

## What each answer changes

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

## Results

_To be filled in from the pasted blocks._

| Q | Result | Notes |
| --- | --- | --- |
| Q1 Picker unlocks folder contents | | |
| Q2 Folder id alone works | | |
| Late-added file visible | | |
| Q4 Commenter can write / can comment | | |
| Q5 Revisions kept (now / 1 h / 1 day) | | |
| Q6 Link share, expiry, revoke | | |
