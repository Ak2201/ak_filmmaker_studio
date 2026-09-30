# Storage model — projects, accounts, and what syncs

Where a user's work actually lives, and which of the three axes decides it.
Read this with invariant 1 in `CLAUDE.md` open: every key string here is a
contract with somebody's months of writing.

## The shape of a key

```
fms_scenes_v1__9f2c1e7a-…            a project's scene model
└──┬──┘ └──┬──┘  └────┬─────┘
prefix   what          which project
```

There are **two dimensions and one key form**. The project is in the key,
as it always has been. The account is not in any key — it is a property of
the *project*, recorded in the projects list. That is the whole design, and
the reason it could ship without renaming a single existing key.

## Three namespaces, one list

`fms_studio_projects_v1` holds an array of project meta. Each entry may carry
an additive `ns` field listing the namespaces it is visible in:

| `ns` | means |
| --- | --- |
| absent, or `[""]` | this device, signed out |
| `["", "<uid>"]` | this device **and** that account |
| `["<uid>"]` | that account only (it came from the cloud) |

`Store.listProjects()` filters on the namespace the page is running in.
`Store.listAllProjects()` returns every entry regardless — see
[Studio-wide operations](#studio-wide-operations).

Data separation follows from list separation: a project id only exists to be
suffixed if the open namespace can see it. Nothing about the blob keys
changed, so a studio written by the previous build reads back identically —
absent `ns` is the device, which is exactly what signed-out users already had.

**An entry can never carry two account ids by accident.** `createProject()`
stamps one namespace; `adoptDeviceProjects()` only touches entries that are
device-*only*. The single way one project reaches two accounts is the server
saying so — a claimed share — which is what sharing means.

### The pointer is the exception

"Which project is open" has to differ per namespace, or signing in would
leave it aimed at a project you cannot see. The bare
`fms_studio_current_project_v1` remains the **device** pointer, unchanged in
name and value format; an account uses
`fms_studio_current_project_v1@<uid>`. That is a new key, not a renamed one,
so there was nothing to migrate.

`currentProjectId()` validates the pointer against the open namespace before
returning it, because the storage proxy suffixes every scoped write with
whatever it returns — an unvalidated pointer left by another namespace would
aim a page's autosave into another account's blob. It memoises the answer:
the proxy asks on every single `localStorage` access.

### No project open

With no project selected, the bare unsuffixed key is the **pre-projects
slot** — data from the 2023 single-blueprint pages. It is device data by
definition, so an account with nothing open writes to `fms_scenes_v1@<uid>`
instead of reading and overwriting it.

## Where identity comes from

`fms_studio_account_v1` holds the signed-in Supabase user id, or is absent.
Absent is the normal state and is not an error.

- **cloud.js writes it**, on every auth transition, and nothing else does.
- **store.js reads it**, raw, at module evaluation — long before the Supabase
  SDK is even fetched. `Storage.prototype` is patched at that moment, so this
  file cannot ask who is signed in; it can only read what was left for it.
- It is read **once per document**. A page that re-read it live would load
  359 fields from one namespace and then autosave them into another the
  moment a session changed underneath it. `Store.setAccount()` therefore
  returns `true` when the effective namespace changes, and schedules a
  reload; callers that get `true` must stop what they were doing.
- An **involuntary** sign-out (a refresh token that died while the tab sat
  open) passes `{ reload: false }`. The page finishes its life writing to the
  namespace it loaded from, which is where that data belongs; the switch
  happens on the next load. Yanking a document out from under somebody
  mid-sentence is the worse failure.

Like the AI key at `fms_ai_key_v1`, it goes through `rawGet`/`rawSet`/
`rawRemove` and is in **none of the five registries**:

| registry | why not |
| --- | --- |
| `SCOPED_KEYS` (store.js) | must never be suffixed with a project id |
| `PROJECT_KEYS` (hub.js) | it is not project data |
| `ALL_KEYS` (hub.js) | "reset the studio" should not half-sign-you-out while Supabase still holds a session |
| the Supabase scope list | it must never sync; it is per device |
| `GLOBAL_KEYS` (hub.js) | **the one most easily missed** — it is what `export-all` walks, and an account id inside a backup file would make another machine claim to be somebody |

## Signing in does not move anything

Signed out, the app is exactly what it was: no login wall, no migration,
nothing relocated. Signing in shows that account's projects.

Existing device work is **offered**, never taken. `listAdoptableProjects()`
returns device projects no account has claimed; accepting *adds* the account
to their `ns`. One copy of the data, reachable from both sides — sign out and
the film is still there. Copying a film *between* accounts is what the backup
file is for.

`deleteProject()` follows the same logic: it removes the project from the
namespace you are standing in, and wipes the `__<projectId>` blobs only when
no namespace refers to them any more. Deleting a project inside an account
does not erase the copy that was on the machine before that account existed.

## Studio-wide operations

The rule from `CLAUDE.md` about the storage proxy scoping "studio-wide"
operations to the open project now has a second edge: **anything built from
`Store.listProjects()` is scoped to the open namespace.** Two callers in
`src/pages/hub.js` are genuinely studio-wide and want `listAllProjects()`
instead:

- `exportAll()` — a file that calls itself a full studio backup and holds one
  namespace's films is the 2024 single-film "full backup" bug wearing a new
  hat.
- `resetAll()` — "this erases EVERYTHING" must not leave another namespace's
  projects on disk, for the same reason it must not leave another project's.

Both are outside this change's file ownership and are recorded here so the
next person does not have to rediscover them.

## Not separated per account (deliberate, and stated plainly)

| key | scope | why |
| --- | --- | --- |
| `fms_studio_prefs_v1`, `fms_studio_theme_v1`, `fms_studio_skin_v1` | device | appearance is a property of the screen you are at, not of an account |
| `fms_supabase_cfg_v1` | device | it is what lets you sign in at all; scoping it per account would lock the door and post the key inside |
| `fms_ai_key_v1` | device | a bring-your-own key typed on this machine; see the header of `src/lib/ai.js` |
| `fms_note_*` | device | private notes are keyed by field name only. They are not separated per *project* either and never have been — two projects share a note on the same field. Separating them means renaming an open-ended key family, plus both backup importers, which is a migration of its own and not one to hide inside another change |
| `fms_studio_cloud_queue_v1`, `fms_studio_sync_meta_v1`, `fms_studio_sync_salvage_v1` | device | all three are keyed by project id inside their value, and project ids do not collide across namespaces |

## What is NOT verified

- **Nothing in this file has ever run against a live Supabase project.**
  `supabase-schema.sql` has still never been applied to a database (see
  `docs/SECURITY-RLS.md`), so the cloud half of the account story —
  `pullProjectList()` filing a pulled project into the right namespace, a
  claimed share landing in two namespaces, realtime writing to a blob whose
  project this namespace can see — is reasoned about, not observed.
- `npm run verify` never signs in, so the gate exercises the **device
  namespace only**. The account paths were proved with a separate Playwright
  script that simulates identity at the one place the app reads it
  (`fms_studio_account_v1`), which is all store.js has to go on.
- The reload on an account switch is not exercised by any automated run; the
  tests set the identity key and navigate, which is the same transition with
  the reload performed by hand.
