# Drive-only storage: Phase 0 spike

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
