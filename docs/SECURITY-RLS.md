# Row-level security audit — `supabase-schema.sql`

**This is a static audit.** `supabase-schema.sql` has never been executed against a
real database, and nothing below was tested against one. Every claim here is read
off the SQL text and the documented behaviour of Postgres RLS. The syntax was
machine-checked — all 141 top-level statements and all 24 PL/pgSQL function bodies
parse under the real Postgres grammar (libpg_query via `pglast`) — but parsing is
not permission testing. **Run the live checks in the last section before a single
share link goes to a person who is not you.**

Audited at: the file as of this commit, sections 1–6 (v3 + v4), plus the section 7
hardening this audit produced.

Two things frame everything that follows:

1. **A share link is a bearer credential.** `resolve_share()` answers to `anon`, and
   the token is the whole authentication. Anyone who forwards the link forwards the
   access. Nothing in a database can fix that; what a database *can* do is make the
   link expire and make revoking it mean something. Before this audit, neither was
   true (finding **S1**).
2. **RLS gates rows, never columns.** Every policy here that permits an UPDATE
   permits an update to *every column of that row*. Four of the findings below are
   the same mistake in four places: a policy said "you may write this row" and
   somebody could then write a column nobody meant them to (`account_id`, `plan`,
   `seat_limit`, `comments.status`, `project_data.updated_by`). A `WITH CHECK` cannot
   see the OLD row, so the fix is always a trigger.

---

## Verdict per table

| Table | RLS | Verdict before | After section 7 |
|---|---|---|---|
| `projects` | enabled | **Fix required** — an `edit` collaborator could move the project into their own account and then delete it (P1) | OK |
| `project_data` | enabled | **Minor fix** — `updated_by` was a client-supplied identity claim (D1) | OK |
| `project_collaborators` | enabled | **Fix required** — a grant outlived both the link's expiry and the owner revoking it (S1) | OK |
| `shares` | enabled | **Fix required** — see S1; plus token stored in plaintext (S2, accepted) | OK with caveats |
| `comments` | enabled | **Fix required** — author could self-accept (C1), reply cascade let an author delete other people's replies (C2), email addresses published to every link holder (C3) | OK |
| `accounts` | enabled | **Fix required** — the buyer could write their own `plan` and `seat_limit`; an owner-*role* member could seize `owner_id` (A1, A2) | OK |
| `account_members` | enabled | **Fix required** — an admin could mint an `owner` row or delete the owner's (A3); a new account's creator could not invite anyone (A4) | OK |

No table leaks one user's projects to another. **`anon` cannot enumerate anything.**
Details under "Enumeration" below.

---

## 1. `projects`

**RLS:** enabled. Four policies. `proj_select` and `proj_insert` are defined twice —
the section-6 versions win, because the file is applied top to bottom and every
policy is drop-then-create. The file says so explicitly, which is the right call;
a reader who stops at section 5 gets the wrong answer.

| Policy | Cmd | Permits | To whom |
|---|---|---|---|
| `proj_select` | SELECT | read the row | owner, active account owner/admin, any collaborator |
| `proj_insert` | INSERT | create, `owner_id = auth.uid()`, into an account you belong to (or none) | any authenticated user |
| `proj_update` | UPDATE | write **every column** | owner, `edit` collaborator |
| `proj_delete` | DELETE | delete (cascades `project_data`, `shares`, `comments`, collaborators) | owner only |

### P1 — an `edit` collaborator could seize and then destroy the project. **HIGH. Fixed.**

`proj_update` admits an `edit` collaborator. `projects_guard_owner` blocked a change
to `owner_id` — and stopped there. `account_id` was added in v4 and nothing guarded
it. Two consequences, both reachable with one `PATCH` against the public REST
endpoint using the anon key:

- `projects.account_id` is read by `has_project_access()`, which grants an account's
  owner/admin **full** access (`edit`, unconditionally) to every project in that
  account. An editor who moves the project into an account they own therefore holds
  access that no longer depends on their collaborator row — deleting that row, or
  revoking the share it came from, does nothing.
- `account_id references accounts(id) on delete cascade`, and `acc_delete` lets an
  account owner delete their own account. So: move the project in, delete the
  account, and the project, every `project_data` row (the entire screenplay, the
  scene model, the contacts) and every comment cascade away. A guest invited to
  *make notes* could delete the film.

Fixed in §7.3: `projects_guard_owner` now also refuses a change to `account_id`
unless the actor is the current owner, and unless the destination is an account they
are actually a member of.

### P2 — `_pushProjectMeta()` sends `owner_id` on every upsert. **Functional. Fixed in `cloud.js`.**

Not a hole; the trigger correctly rejects it. But it meant an `edit` collaborator
renaming a project got `42501` every time, because the client's upsert always set
`owner_id: session.user.id`. `cloud.js` now updates first without touching
`owner_id`, and only inserts (with `owner_id`) when the row does not exist.

### P3 — `projects_guard_owner` is `security definer` and does not need to be. **Note only.**

It reads nothing. `security invoker` would be the smaller privilege. Left alone:
changing it is churn, and §7.3 now *does* call `account_role()`, which is granted
only to `authenticated` — so the definer context is currently load-bearing.

---

## 2. `project_data`

This is the table that holds the writing. One row per (project, scope); `scope` is
`CHECK`-constrained to the fourteen names `cloud.js` maps.

| Policy | Cmd | Permits | To whom |
|---|---|---|---|
| `pd_select` | SELECT | read | anyone with `view` |
| `pd_write` | ALL | insert / update / **delete** | anyone with `edit` |

**A `comment`-role guest cannot write here.** That is the single most important
thing in the file and it is correct: `has_project_access(pid,'comment')` returns
true for `comment` and `edit`, but `pd_write` asks for `'edit'`, which only matches
`c.role = 'edit'`. Comment-only sharing really is read-only for the document.

### D1 — `updated_by` was whatever the client sent. **LOW. Fixed.**

`cloud.js` uses it as the realtime self-echo guard:

```js
if (session && row.updated_by === session.user.id) return;  // self echo
```

An editor who stamped a *collaborator's* id onto every write would make that
collaborator's browser discard every incoming change: their screen silently stops
matching the document, with no error anywhere. Not a leak, but an identity claim
from a client is worth nothing. §7.4 forces `updated_by := auth.uid()`.

`updated_at` is deliberately **not** forced server-side — it is the clock the
last-write-wins merge compares against `markRemoteSeen()`, and overwriting it would
desynchronise that clock into a push/pull ping-pong. Noted in the schema.

### D2 — no size limit on `data`. **LOW. Not fixed.**

An `edit` collaborator can upload arbitrarily large JSONB. `accounts.storage_limit_mb`
exists and nothing enforces it. Enforce at the storage tier or with a `pg_column_size`
CHECK when the plan work lands.

---

## 3. `project_collaborators`

| Policy | Cmd | Permits | To whom |
|---|---|---|---|
| `pc_select` | SELECT | read the row | the row's own user, the project owner |
| `pc_owner_write` | ALL | insert / update / delete | the project owner |

A collaborator sees **only their own** grant, not the list of everyone else on the
project. That is the privacy-preserving default and it is right: a share-link holder
should not learn who else holds one.

Self-claim goes through `claim_share()` (`security definer`, so it bypasses RLS) and
needs no INSERT policy. Correct.

### S1 — a share grant outlived both its expiry and its revocation. **HIGH. Fixed.**

This is the finding that matters most, because the UI makes two promises the schema
did not keep. `chrome.js`'s share dialog offers `1 DAY / 7 DAYS / 30 DAYS`, and its
revoke button asks: *"Revoke this link? Anyone using it will lose access."*

Before §7.1, once a recipient had opened the link and signed in:

- `claim_share()` wrote a **permanent** `project_collaborators` row. `shares.expires_at`
  was consulted at claim time and never again.
- Deleting the `shares` row (revoke) deleted a token. The access stayed. There was
  no path in the app or the schema that removed a claimed grant.

So a 7-day link was a 7-day *window to claim* permanent access, and "revoke" was a
no-op against anyone who had already used the link — which is everyone it was sent
to. A link forwarded once to the wrong person could not be taken back.

Fixed in §7.1 by making the grant belong to the link:

- `project_collaborators.via_share uuid references shares(id) **on delete cascade**`
  — revoking the link deletes the grant, including a revoke done straight against
  the table rather than through the app.
- `project_collaborators.expires_at`, copied from the link, and honoured in
  `has_project_access()` (§7.2).
- A grant the owner made by hand has `via_share = null`, and `claim_share()` refuses
  to re-attribute it, so a link can never revoke a deliberate grant.
- `purge_expired_shares()` for the operator to schedule; `EXECUTE` is revoked from
  `authenticated` and `anon`.

### S1a — an account admin cannot manage collaborators. **Note only, not fixed.**

`pc_owner_write` checks `projects.owner_id`, but `has_project_access()` grants an
account owner/admin full project access. So an admin can read and rewrite the whole
screenplay but cannot add or remove a collaborator on it. Inconsistent rather than
unsafe, and the safe direction. Left as-is deliberately; widening it is a product
decision, not a bug fix.

### S1b — a collaborator cannot remove themselves. **Note only.**

`pc_owner_write` is owner-only and `pc_select` is read-only. There is no "leave this
project". Minor UX gap.

---

## 4. `shares`

| Policy | Cmd | Permits | To whom |
|---|---|---|---|
| `sh_owner_select` | SELECT | read the row **including the token** | project owner only |
| `sh_owner_write` | ALL | create / update / delete, `created_by = auth.uid()` | project owner only |

An `edit` collaborator **cannot** create a share link. Correct and important — it
means access cannot be re-delegated downward.

**Can a share token be scoped to one project?** Yes. `shares.project_id` is not null
and `claim_share()` grants exactly one `project_collaborators` row for that project.
There is no account-wide or studio-wide link. Good.

**Read only, or read+write?** Either — `shares.role` takes `view`, `comment` or
`edit`, and `edit` is offered in the dialog. An `edit` link holder gets full
read/write/**delete** of every `project_data` scope, which includes `contacts` (crew
names, phone numbers, emails) and `script`. That is what "edit" means, but it is
worth saying out loud that there is no audit trail and no undo on the server side;
the only recovery is the client's local `salvage()` buffer, which is capped at 12
entries on one device.

**Does it expire?** Now, yes, properly (S1). The default in the dialog is 7 days.
`createShare(projectId, role, expiresAt)` still accepts `null`, and the dialog still
offers `NO EXPIRY`. That is a legitimate option; it is not the default and should
not become one.

### S2 — tokens are stored in plaintext. **MEDIUM. Accepted, not fixed.**

`shares.token` is the bearer credential in the clear. Anyone who obtains a database
read — a leaked service key, a backup, a future policy mistake on this table — gets
working links to every project. The standard fix is to store `digest(token,'sha256')`
and look up by hash.

Not done, because it trades against a real feature: `sh_owner_select` returns the
token so the owner can re-copy a link they generated earlier, and the "Active links"
list would have to become "generate a new link" instead. That is a product call.
**Recommended**, with `pgcrypto`, when someone owns that decision.

### S3 — no rate limit on `resolve_share()`. **LOW. Accepted.**

Granted to `anon` and it is the one function a stranger can call freely. Brute force
is not the issue: `genToken()` uses `crypto.randomUUID()` (122 bits) or
`getRandomValues` (128 bits), and the pre-existing comment in `cloud.js` records why
the old `Math.random()` fallback was removed. Put Supabase's rate limiting in front
of it anyway.

### S4 — the token rides in a query string. **LOW. Mitigated already.**

`/shared/:token` rewrites to `/index.html?share=:token`, and `chrome.js` builds
`?share=` URLs directly. A bearer token in a query string normally leaks through
`Referer` and access logs. `vercel.json` sets
`Referrer-Policy: strict-origin-when-cross-origin`, which strips the path and query
cross-origin, and the CSP is `default-src 'self'`, so there are no third-party
subresources to leak to. `handleSharedLink()` also `replaceState`s the token out of
the URL after claiming. This one is adequately handled; noted so the next person
does not re-derive it.

### S5 — `resolve_share()`'s `is_expired` column is dead. **Cosmetic.**

The `WHERE` clause already excludes expired rows, so the returned `is_expired` is
always `false`. `cloud.js` checks it anyway (`if (meta.is_expired)`), which is
harmless — an expired token returns no row and takes the "invalid" branch. The
schema comment explains the history. Left alone.

### S6 — `claim_share()` ignores seats and account membership. **Note.**

A share can bring in someone outside the account without consuming a seat. Billing,
not security, but it is the hole through which a seat limit is worked around.

---

## 5. `comments`

The table this session's UI is built on.

| Policy | Cmd | Permits | To whom |
|---|---|---|---|
| `cm_select` | SELECT | read **every comment on the project** | anyone with `view` |
| `cm_insert` | INSERT | create, `author_id = auth.uid()` | anyone with `comment` (i.e. `comment` or `edit`) |
| `cm_update` | UPDATE | write **every column** | the author, or the project owner |
| `cm_delete` | DELETE | delete (cascades replies) | the author, or the project owner |

Identity is set server-side by the `comments_set_author` trigger, not trusted from
the client — and the ordering is right: RLS `WITH CHECK` is evaluated *after*
`BEFORE ROW` triggers, so `cm_insert`'s `author_id = auth.uid()` tests the value the
trigger wrote, not the one the client sent. `cloud.js` still sends `author_id` and
`author_name`; both are ignored. Good.

**Can a comment author edit or delete another person's comment?**
No, not directly — `cm_update` and `cm_delete` both require `author_id = auth.uid()`
or project ownership. But see C2: they could *destroy* other people's replies, and
see C1: they could rewrite the meaning of their own.

### C1 — an author could accept their own suggestion. **MEDIUM. Fixed.**

`status` is just another column on a row `cm_update` lets the author write. A
`comment`-role guest could `PATCH` their own suggestion to `status = 'accepted'`.
The underlying field value never changes — accepting is applied client-side by
whoever is editing — so what this produces is a **lie in the record**: a suggestion
that reads as approved by the writer and was not. In a tool whose entire point is
tracking what was agreed, that is the interesting attack, not a data loss.

§7.5's `comments_guard` makes a change to `status` require
`has_project_access(project_id, 'edit')`.

### C2 — an author could delete other people's replies. **MEDIUM. Fixed.**

`parent_id references comments(id) on delete cascade`. `cm_delete` lets an author
delete their own comment. Deleting a *root* comment therefore cascaded away every
reply underneath it — other people's writing, removed by someone with no permission
to touch it.

`parent_id` was also entirely unconstrained: a reply could point at a comment in a
different project, a different scope, a different field, or at another reply
(unbounded depth, unbounded cascade).

§7.5 constrains `parent_id` to the same (project, scope, field_key), caps threads at
one level, and blocks deleting a comment that has replies unless you are the project
owner.

### C3 — every commenter's email address was published to every link holder. **MEDIUM. Fixed.**

`comments_set_author` stamped `auth.jwt() ->> 'email'` into `author_name`, and
`cm_select` shows every comment to anyone with `view`. So sending someone a view
link handed them the email address of everyone who had ever commented — the
director, the producer, the crew. Nobody consented to that by writing a note.

§7.5 prefers `user_metadata.full_name`, then `name`, then the email **local part**.
The local part still identifies a person to their collaborators without being a
working address. A proper `profiles` table with a chosen display name is the real
answer; this is the version that does not require one.

### C4 — `cm_update`'s `WITH CHECK` allowed a comment to change project. **LOW. Fixed.**

The schema comment above `cm_update` describes the version of this bug that was
already fixed (no `WITH CHECK` at all). The surviving remnant: the `WITH CHECK`
tests `has_project_access(new.project_id, 'comment')`, so a comment could still be
moved between two projects the author has access to, taking its `scope` and
`field_key` with it. §7.5 freezes `project_id`, `scope`, `field_key`, `parent_id`,
`created_at`, `type` and both `suggest_*` columns on UPDATE.

### C5 — unbounded text, unconstrained `scope`. **LOW. Fixed.**

`body`, `suggest_from`, `suggest_to` had no length limit and `scope` had no CHECK
(unlike `project_data.scope`). §7.5 adds `body` 1–4000, `field_key` 1–160,
`suggest_*` ≤ 20000, and `scope ~ '^[a-z][a-z0-9_]{0,31}$'`. The format check rather
than the enum, deliberately: comments will want to attach to scopes `project_data`
does not have. Tighten to the enum once the scope list stops moving.

### C6 — an account owner/admin cannot moderate comments. **Note only.**

Same shape as S1a: `cm_update`/`cm_delete` check `projects.owner_id`, not
`has_project_access`. An account admin can rewrite the screenplay but cannot delete
an abusive comment on it. Safe direction; left alone.

---

## 6. `accounts` and `account_members`

| Policy | Cmd | Permits | To whom |
|---|---|---|---|
| `acc_select` | SELECT | read | `owner_id`, or any active member |
| `acc_insert` | INSERT | create, `owner_id = auth.uid()` | any authenticated user, unlimited |
| `acc_update` | UPDATE | write **every column** | `owner_id`, or an `owner`-*role* member |
| `acc_delete` | DELETE | delete → **cascades every project in it** | `owner_id` only |
| `am_select` | SELECT | read a member row | the member, or an owner/admin |
| `am_write` | ALL | insert / update / delete member rows | any owner **or admin** |

### A1 — the customer could set their own plan and seat limit. **HIGH (billing). Fixed.**

The schema says, of `enforce_seat_limit`: *"Seats are what the plan sells, so the
limit is enforced in the database rather than in the client that happens to be
asking."* The trigger is correct. The limit it enforces was a column the person being
limited could write. `acc_update` permits the account owner to write the whole row,
so `PATCH /rest/v1/accounts?id=eq.… {"plan":"pro","seat_limit":9999}` with the anon
key raises the ceiling before the trigger checks it. Same for `storage_limit_mb`.

§7.6's `accounts_guard` refuses a change to `plan`, `seat_limit` or
`storage_limit_mb` from any caller that is not `service_role`/`postgres`. The guard
is deliberately **not** `security definer` — `is_privileged_caller()` has to see the
real caller, and a definer function would report the definer's role and make every
caller look privileged.

### A2 — an owner-*role* member could seize the account. **HIGH. Fixed.**

`acc_update`'s `USING` accepts `public.account_role(id) = 'owner'`, which is a
membership row, not `accounts.owner_id`. With no OLD/NEW comparison, such a member
could set `owner_id` to themselves. This is precisely the bug `proj_update` had and
already fixed — the fix was not carried across when accounts were added. `accounts_guard`
now refuses an `owner_id` change unless the actor is the current `owner_id`.

### A3 — an admin was a second owner in all but name. **HIGH. Fixed.**

`am_write` is `FOR ALL` on `account_role(account_id) in ('owner','admin')`, with no
distinction between the two roles and no OLD-row comparison. An admin could:

- insert a row for themselves with `role = 'owner'`, or
- `UPDATE` the real owner's row to `member`/`revoked`, or
- `DELETE` it outright (`USING` governs DELETE; `WITH CHECK` does not apply).

From `owner` they reach A2's path to `accounts.owner_id`, and from there — via
`has_project_access`'s account branch, which grants `edit` on *everything* in the
account — every project in the account, with the real owner locked out.

§7.7 adds `account_members_guard`: granting or changing an `owner` row is owner-only,
the account's own `owner_id` cannot be removed from their account, and a claimed seat
cannot be reassigned to another `user_id`.

### A4 — a brand-new account's creator could not invite anybody. **Functional. Fixed.**

`acc_insert` creates the account; nothing creates the creator's `account_members`
row. So `account_role()` returns null for them and `am_write` denies every write —
the account is inert from birth. Only the v4 *backfill* ever inserts an owner member
row, and it only runs over projects that already exist. §7.7 admits
`account_owner(account_id) = auth.uid()` to `am_write` and `am_select`. This is the
only place in section 7 where anything becomes *more* reachable, and it grants the
account's own owner a power they already had by every other route.

### A5 — the seat limit was only checked on INSERT. **LOW. Fixed.**

Flipping a `revoked` row back to `active` walked straight past it. §7.7 checks that
transition too, excluding the row being updated from its own count.

### A6 — pending invites cannot be claimed. **Functional gap. Not fixed.**

`account_members.user_id` stays null until an invite is claimed, and *nothing in the
schema ever claims one* — there is no `claim_invite()` RPC, and `am_write` requires
the caller to already be an owner/admin of the account they are being invited to.
`am_select` matches on `user_id = auth.uid()`, which is null, so an invitee cannot
even see the invite. The invite flow does not work end to end. Out of scope for a
security fix; it needs a `claim_invite(p_token)` RPC modelled on `claim_share()`.

### A7 — `seat_limit` defaults to 1 and the backfill consumes it. **Note.**

The personal account created by the backfill has `seat_limit = 1` and one owner row,
so the first invite raises `53400`. Correct for a one-seat plan; surprising if
nobody expected it.

### A8 — anyone can create unlimited accounts. **Note.** No rate limit on `acc_insert`.

---

## Enumeration: can `anon` or a signed-in stranger list rows they were not given?

Walked table by table, with `auth.uid()` null (anon) and with a valid-but-unrelated
`auth.uid()`:

- **`projects`** — `proj_select` → `has_project_access(id,'view')`. All three branches
  compare against `auth.uid()`. For `anon` that is `NULL`, and `owner_id = NULL` is
  `NULL`, not true, so `EXISTS` is false. For a stranger, all three are false. **No rows.**
- **`project_data`, `comments`** — same function. **No rows.**
- **`project_collaborators`** — `pc_select` needs `user_id = auth.uid()` or ownership.
  **No rows**, and notably a collaborator cannot enumerate their fellow collaborators.
- **`shares`** — `sh_owner_select` is owner-only. A stranger holding a valid token
  **cannot read the `shares` table**; the only way in is the `resolve_share()` RPC,
  which requires the token. **No rows.**
- **`accounts`, `account_members`** — owner or active member. **No rows.**

RLS is enabled on all seven tables, and none has a `USING (true)` policy. The
functions granted to `anon` are `has_project_access` (returns a boolean, always false
for anon) and `resolve_share` (needs the token). `claim_share`, `account_role` and
`revoke`d `purge_expired_shares` are not reachable by `anon`.

**One caveat I could not verify statically:** Supabase Realtime. The schema adds
`project_data` and `comments` to the `supabase_realtime` publication, and `cloud.js`
subscribes to `pd:<project_id>` / `cm:<project_id>` with a `project_id=eq.` filter.
Supabase applies RLS to `postgres_changes` per subscriber — *but the channel name is
guessable and DELETE payloads are documented as not being RLS-filtered the way
INSERT/UPDATE are* (a DELETE event carries only the replica identity, i.e. the primary
key, unless `REPLICA IDENTITY FULL` is set). Confirm on the live project that a
subscriber with no access receives nothing, and consider Realtime Authorization
(private channels) rather than relying on `postgres_changes` alone.

---

## What would leak one user's projects to another

Ranked, after section 7:

1. **A forwarded share link.** Unavoidable by design; now at least expirable and
   revocable (S1). Default the dialog to an expiry, never to `NO EXPIRY`.
2. **A leaked database read** → plaintext tokens for every project (S2).
3. **The account tier**, if account membership is ever granted casually: an account
   owner or admin reads *every* project in the account, unconditionally, with no
   collaborator row. That is documented as intended in the schema and it is a
   defensible default, but it means "add someone as an admin" is a bigger act than
   it sounds.
4. **`service_role` in a browser.** Nothing in this repo does that —
   `arunak_supabase_cfg_v1` holds the *anon* key, which is public by design and gated
   by everything above. Worth a line in the runbook anyway, because the day somebody
   pastes a service key into that config box, every policy in this file stops
   mattering.

---

## Live checks to run before a stranger holds a link

None of these have been run. They need two real accounts, `A` (owner) and `B`.

```sql
-- 0. as anon (the anon key, signed out)
select count(*) from projects;            -- expect 0
select count(*) from project_data;        -- expect 0
select count(*) from comments;            -- expect 0
select count(*) from shares;              -- expect 0
select public.has_project_access('00000000-0000-0000-0000-000000000000','view');  -- false
```

1. **Comment guest cannot write the document.** Share `comment` to `B`; `B` claims;
   `B` attempts `update project_data set data='{}'` → expect 0 rows / 42501.
2. **Editor cannot move the project.** Share `edit` to `B`; `B` attempts
   `update projects set account_id = <B's account>` → expect 42501
   `Only the owner can move a project between accounts`.
3. **Revoke means revoke.** `B` claims a link, then `A` deletes the `shares` row.
   `B` selects `project_data` → expect 0 rows. (This is the S1 regression test; it
   fails on the pre-§7 schema.)
4. **Expiry means expiry.** Create a share with `expires_at = now() + interval '1 minute'`,
   claim it, wait, then select `project_data` as `B` → expect 0 rows.
5. **Author cannot self-accept.** `B` (comment role) inserts a `suggestion`, then
   `update comments set status='accepted'` → expect 42501.
6. **Author cannot nuke a thread.** `A` replies to `B`'s comment; `B` deletes their
   root comment → expect 42501.
7. **No email in `author_name`.** `B` comments; `A` reads it; assert `author_name`
   contains no `@`.
8. **Plan is not client-writable.** As `A`: `update accounts set seat_limit = 9999`
   → expect 42501.
9. **Admin cannot become owner.** Make `C` an admin; `C` inserts a member row with
   `role='owner'` → expect 42501; `C` deletes the owner's row → expect 42501.
10. **Realtime.** Subscribe as `B` to `pd:<A's project>` before any share exists;
    assert no payloads arrive for inserts, updates *and deletes*.

---

## LIVE CHECK 1 — RUN 29 SEP 2026. RESULT: FAILED.

This document's own header says it is a static audit. It was run
against the real database for the first time on 29 September 2026,
unauthenticated, with the publishable key. Two findings, and the
first one means the cloud layer had never worked at all.

### F1 — infinite recursion in the projects policies. BLOCKING.

    GET /rest/v1/projects            500  42P17
    GET /rest/v1/project_collaborators 500  42P17
    GET /rest/v1/shares              500  42P17

    infinite recursion detected in policy for relation "projects"

Section 7 redefined `proj_select` as
`using (public.has_project_access(id, 'view'))`, and
`has_project_access()` opens by selecting from `public.projects`. A
policy on projects therefore evaluates a function that reads
projects. `security definer` did not prevent it.

Fixed in schema section 8 by inlining the three branches into
`proj_select` so nothing there reads projects, and routing the owner
test in `pc_select` / `pc_owner_write` / `sh_owner_all` through
`project_owner_is_caller()`.

**This is the argument for live checks in one finding.** A
line-by-line reading of the SQL produced a careful audit and twenty
correct observations, and could not see that the thing did not run.

### F2 — accounts and account_members returned 404. NOT a missing table.

    GET /rest/v1/accounts   404  PGRST205 could not find the table

They exist. A missing relation errors 42P01; `has_project_access()`
resolves `account_members` and reached recursion instead, which it
could only do if the table were there. This is PostgREST's schema
cache. Section 8 ends with `notify pgrst, 'reload schema'`.

### What this run could NOT determine

`project_data` and `comments` returned `[]` with HTTP 200 to an
anonymous caller. **That is ambiguous and must not be read as a
pass or a fail.** With RLS on and no matching policy a SELECT returns
an empty set rather than an error, and the tables are empty anyway,
so both a working policy and an absent one look identical. Resolving
it needs one real row: sign in, save something, then repeat the
anonymous GET. Anything other than `[]` is a leak.

Writes were correctly refused on both (`42501`), which is a genuine
pass — an anonymous POST is rejected by RLS, not by the gateway.

---

## LIVE CHECK 2 — RUN 30 SEP 2026. RESULT: F1 FIXED, F2 WAS WRONG.

Run through the Supabase SQL editor against `conhlrulxfwkhsnymakz`,
then verified from outside with the publishable key. Both findings
above are corrected below; **neither was right.**

### F1 — fixed, but not by section 8, and not for the stated reason.

Section 8 **never executed.** The sweep after it was reported as run
came back byte-identical to the sweep before, and the decisive probe
was a function call: `project_owner_is_caller` — created only by
section 8 — returned `PGRST202 not found in the schema cache`, while
section 7's `has_project_access` returned `false / 200`. A section
whose function does not exist did not run.

It could not have run. It has four references this database does not
satisfy: `public.account_members` (no such table), `projects.account_id`
(no such column), `c.expires_at` on project_collaborators (no such
column), and policy `sh_owner_all` (the names are `sh_owner_select`
and `sh_owner_write`). `create policy` against a missing relation
aborts the block.

**The diagnosis above is also wrong.** The deployed `proj_select` was
never `has_project_access(id,'view')` — it was, and pg_policies said
so plainly:

    projects.proj_select
      (owner_id = auth.uid())
      OR EXISTS (SELECT 1 FROM project_collaborators c
                  WHERE c.project_id = projects.id AND c.user_id = auth.uid())

    project_collaborators.pc_select
      (user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM projects p
                  WHERE p.id = project_collaborators.project_id
                    AND p.owner_id = auth.uid())

A mutual loop between two policies on two tables. Postgres names the
relation you entered through, so the 42P17 said `projects` and the
message was read as if projects alone were at fault — the error named
the door, not the room.

`security definer` "did not prevent it" was asserted on no evidence,
and the evidence against it was already in the same sweep:
`project_data` returned **200** throughout, and `pd_select`'s only
test is `has_project_access()`, which reads projects. A definer
function reading projects was demonstrably fine the whole time.

Fixed by **schema section 9**, written against the live catalogue
rather than the file: `project_owner_is_caller()` as `security
definer`, and `pc_select` / `pc_owner_write` / `sh_owner_select` /
`sh_owner_write` / `cm_update` / `cm_delete` routed through it.
`proj_select` was left untouched — once project_collaborators has no
outgoing RLS edge, the cycle is gone.

Verified:

| endpoint (anon, publishable key) | before | after |
|---|---|---|
| `/rest/v1/projects` | 500 `42P17` | **200 `[]`** |
| `/rest/v1/project_collaborators` | 500 `42P17` | **200 `[]`** |
| `/rest/v1/shares` | 500 `42P17` | **200 `[]`** |
| `/rest/v1/project_data` | 200 `[]` | 200 `[]` |
| `/rest/v1/comments` | 200 `[]` | 200 `[]` |
| `rpc/project_owner_is_caller` | 404 `PGRST202` | **200 `false`** |

and in the catalogue: RLS on for all five tables, 14 policies, zero
policies reading the table they guard.

### F2 — withdrawn. The tables genuinely do not exist.

    select c.relname from pg_class c join pg_namespace n
      on n.oid = c.relnamespace
     where n.nspname='public' and c.relkind='r';

    comments, project_collaborators, project_data, projects, shares

`accounts` and `account_members` are **absent**, so `PGRST205` was
accurate and the schema cache was never the problem.

The reasoning that produced F2 — "a missing relation errors 42P01,
and `has_project_access()` resolves `account_members`, so it must
exist" — fails twice. The deployed `has_project_access` does not
mention `account_members` at all (it predates the account tier; four
functions exist in total: `has_project_access`, `claim_share`,
`resolve_share`, `rls_auto_enable`). And even had it, the recursion
fires in the first branch, so the later branch is never reached. An
error that arrives before a line runs says nothing about that line.

**What this means beyond the finding:** sections 6 and 7 of
`supabase-schema.sql` have never run either. `projects_guard_owner`
and `comments_set_author` — both from section 5, line 268 onward —
are also absent, so the original run stopped somewhere near line 200.
The database is roughly sections 1-4 plus section 9.

`src/lib/cloud.js` touches only the five tables that exist, so the
app is not broken by the absence; the account tier is unbuilt rather
than half-built. Section 9 deliberately does not create it.

### Still open after this run

1. **The ambiguous `[]` is still ambiguous.** `projects` holds 0 rows
   (`auth.users` holds 1). Until one real row exists and an anonymous
   GET still returns `[]`, an empty result proves nothing. This is the
   single highest-value check remaining and it is cheap: sign in, save
   a project, re-run the sweep. Anything other than `[]` is a leak.
2. **Sections 5-7 are not deployed.** Everything section 7 hardened —
   share expiry and revocation, the account-move escalation, comment
   author-name leakage, comment status forgery — is unfixed in the
   live database, because the code that fixes it was never applied.
   The audit above describes a database that does not exist.
3. The remaining eight live checks, which need two real accounts.

---

## LIVE CHECK 3 — RUN 30 SEP 2026. SECTIONS 6 AND 7 ARE NOW DEPLOYED.

The gap named at the end of LIVE CHECK 2 — "sections 5-7 are not
deployed, so everything section 7 hardened is unfixed live" — is
closed. Section 6 (the account tier) and section 7 (the hardening)
both ran, unchanged, and were re-read from the catalogue afterwards.

The database now has 7 tables, 20 policies, 13 triggers and 18
functions. `accounts` and `account_members` exist; `projects.account_id`
exists; `project_collaborators` has `via_share` and `expires_at`; every
trigger from sections 5-7 is present.

**This run found four more things, none of which a static reading had
caught, and one of which was live and exploitable.** They are fixed in
schema section 10.

### F3 — `purge_expired_shares` was callable by anyone. HIGH. FIXED.

    POST /rest/v1/rpc/purge_expired_shares   200   0

with nothing but the publishable key, which ships in the client. The
function deletes rows from `shares`.

Section 7.1 ends with `revoke execute ... from authenticated, anon`.
Postgres grants EXECUTE on every new function to **PUBLIC** by default,
and revoking from two named roles does not touch the PUBLIC grant. The
revoke read as if it did the job and did nothing.

`account_role()` and `account_owner()` had the same shape — granted to
`authenticated` deliberately and to PUBLIC by accident — which handed an
anonymous caller an account-membership oracle. All three are now revoked
from `public` explicitly, and re-tested: `401 42501 permission denied`.

The three functions anon legitimately needs keep their grants, because a
policy that invokes a function the caller cannot execute **errors**
rather than returning false, which would break every share-link read:
`has_project_access`, `project_owner_is_caller`, `resolve_share`.

*The general lesson, worth more than the finding:* `revoke ... from
<role>` on a function is almost never sufficient. Check `proacl`. A
default-privilege grant is invisible in the source of the file that
creates the function.

### F4 — an expired collaborator kept UPDATE on the project row. FIXED.

Section 7.1 exists so that an expired or revoked share expires the
**access**. It added `expires_at` and taught `has_project_access()` to
honour it. But `proj_update` never called `has_project_access()` — it
carried an inline collaborator test written back in section 5:

    exists (select 1 from project_collaborators c
             where c.project_id = id and c.user_id = auth.uid()
               and c.role = 'edit')

No expiry test. So an expired collaborator lost SELECT and **kept
UPDATE**: they could not read the project row and could still write it.
Silent in the worst way — the app shows them nothing while their writes
still land. Now `has_project_access(id,'edit')` on both USING and WITH
CHECK.

### F5 — `cm_update` had no WITH CHECK. FIXED.

The same shape section 5 documents for `proj_update`: with no WITH
CHECK, Postgres reuses USING for the new row, and USING only asks "are
you the author", which stays true however `project_id` changes. Section
9 recreated this policy and left it without one — a missed chance
rather than a regression. Both `proj_update` and `cm_update` now have
explicit WITH CHECK, and the catalogue is asserted to contain **zero**
UPDATE/ALL policies without one.

### F6 — section 9 dropped `created_by = auth.uid()`. REGRESSION. FIXED.

This one was mine. Section 5's `sh_owner_write` WITH CHECK is
`exists(owner…) and created_by = auth.uid()`. Section 9 replaced the
whole expression with `project_owner_is_caller(project_id)` and dropped
the second conjunct with it, so a project owner could mint a share row
attributed to someone else. Restored in 10.3.

*Worth naming as a pattern:* rewriting a policy to fix the expression in
its USING clause quietly rewrites its WITH CHECK too. Diff both.

### Verification

Catalogue: 20 policies, **zero** missing a WITH CHECK on UPDATE/ALL,
**zero** reading any RLS-protected table. Every cross-table test now
goes through a `security definer` function, so policy recursion is
structurally impossible rather than merely absent.

Anonymous REST, publishable key:

| probe | result |
|---|---|
| SELECT on all 7 tables | `200 []` — `accounts` no longer `PGRST205` |
| `POST /projects` | `401 42501` new row violates RLS |
| `POST /accounts` | `401 42501` new row violates RLS |
| `rpc/purge_expired_shares` | `401 42501` permission denied |
| `rpc/account_owner`, `rpc/account_role` | `401 42501` permission denied |
| `rpc/has_project_access`, `rpc/project_owner_is_caller` | `200 false` |
| `rpc/resolve_share` | `200 []` |

The app, against production: all 15 routes, 15 `.html` entries, 3 legacy
stubs and `/shared/:token` return 200; all 15 pages render under
Playwright with real content, zero console errors, zero horizontal
overflow.

### Still open

1. **The read side is still unproven, and this has not moved.**
   `projects` holds 0 rows, so an anonymous `[]` cannot distinguish "RLS
   denied it" from "nothing is there". Every WRITE path above is
   genuinely proven — a `42501` is a refusal, not an empty set — and
   every READ path is not. One real row, saved by a signed-in user, then
   still `[]` anonymously, closes it. **This is the last cheap check and
   it should be done next.**
2. The remaining live checks needing two real accounts: collaborator
   isolation, share claim/expiry/revoke end to end, the comment-status
   and reply-cascade guards, and the account-tier escalations. The
   guards all exist now, so these are testable for the first time.
3. Share tokens are still stored in plaintext — a product call, because
   the owner's "re-copy this link" depends on it.
4. There is still no `claim_invite()`, so account invites cannot be
   claimed. The account tier is deployed but not reachable from the UI;
   `cloud.js` does not touch `accounts` or `account_members` at all.
5. Realtime DELETE payloads are documented as not RLS-filtered the way
   INSERT and UPDATE are. Unverified.
