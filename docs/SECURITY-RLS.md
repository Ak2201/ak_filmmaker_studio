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
| `acc_insert` | INSERT | create, `owner_id = auth.uid()` | any authenticated user, unlimited — and, until §19, with **any plan and any limits** (A1b) |
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

### A1b — the customer could MINT an account on any plan. **HIGH (billing). Fixed in schema §19, UNRUN.**

A1's fix was `accounts_guard`, a `BEFORE UPDATE` trigger. `acc_insert`'s
`WITH CHECK` is `owner_id = auth.uid()` and nothing else, so

```sql
insert into accounts (name, owner_id, plan, seat_limit) values ('Mint', auth.uid(), 'pro', 999);
```

through PostgREST was refused by nothing: the guard never fired, the policy
asked only whose account it was. `user_plan()` (§16.2) answers with the best
plan among the organisations a user *owns*, so the minted row made every
limit trigger in §16.8 and `billing_status()` read that user as Pro from then
on — unlimited projects, shares and collaborators, the extension, every feature
tick — for the cost of one POST with the publishable key. Found while the
account panel was built (CLAUDE.md open item 5), recorded there, and left open
until 7 Oct 2026.

§19 extends the guard to `BEFORE INSERT OR UPDATE`. On INSERT, a caller that
is neither privileged nor inside `apply_plan()`'s `fms.billing` flag may
create a row only with the table's defaults — `plan 'free'`, `seat_limit 1`,
`storage_limit_mb 500`, `plan_until null`, `plan_period null` — and anything
else is the same `42501` *"Plan and limits are set by billing, not by the
client"*. The policy itself is unchanged; the schema comment says why the
guard and not a `WITH CHECK` (the definer functions bypass RLS, so a policy
would not fire for them, and that asymmetry is the shape of this bug).
Worth knowing: `account_for_buyer()` runs inside `admin_grant_plan()` as an
*authenticated* admin — `is_privileged_caller()` is false there even though
the function is `security definer` — and still passes, because it inserts
`(name, owner_id)` and nothing else. That is why the rule is "equals the
defaults", not "is privileged". `scripts/schema-tests/accounts.sql` proves
all of it on a real PostgreSQL (15 checks); the live checks are below.

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

### A6 — pending invites cannot be claimed. **Functional gap. Addressed in schema §11, UNRUN.**

`account_members.user_id` stays null until an invite is claimed, and *nothing in the
schema ever claims one* — there is no `claim_invite()` RPC, and `am_write` requires
the caller to already be an owner/admin of the account they are being invited to.
`am_select` matches on `user_id = auth.uid()`, which is null, so an invitee cannot
even see the invite. The invite flow does not work end to end. Out of scope for a
security fix; it needs a `claim_invite(p_token)` RPC modelled on `claim_share()`.

Schema section 11 adds `claim_invite(p_account_id uuid default null)`, and
`src/lib/cloud.js` calls it once per signed-in user. **It has never been executed
against a database.** Its security model, the one place it refuses to widen, and
the nine live checks it needs are in the section "CLAIM_INVITE (§11)" at the end of
this document. The suggestion above — *"a `claim_invite(p_token)` RPC"* — was
**not** followed on the credential: there is no token. The reasoning is in that
section and at length in the schema.

### A7 — `seat_limit` defaults to 1 and the backfill consumes it. **Note.**

The personal account created by the backfill has `seat_limit = 1` and one owner row,
so the first invite raises `53400`. Correct for a one-seat plan; surprising if
nobody expected it.

### A8 — anyone can create unlimited accounts. **Note.** No rate limit on `acc_insert`.

---

## 6b. `promo_codes` (schema §20, 7 Oct 2026). **UNRUN.**

| Policy | Cmd | Permits | To whom |
|---|---|---|---|
| — | — | RLS enabled, **no policy**; `anon` and `authenticated` revoked outright | nobody from the client |

The table is reached only through `quote_order(plan, code)` (`security
definer`, granted to `anon` and `authenticated`, answers a price and a
reason and never a row) and the two `admin_*` RPCs behind
`is_studio_admin()`. What a stranger can learn by calling `quote_order` is
whether a string is a live code and what it is worth — an offer, never
entry; there is no rate limit, by decision (docs/BILLING.md §7). `uses` is
written only by `activate_payment()`, which only the service role can call.
`payments.promo_code` references the table with `on delete set null`, so a
code can never be deleted out from under the ledger by accident; the console
deactivates, it does not delete. Live checks:

1. As the anon key, signed out: `select count(*) from promo_codes` → expect
   `42501 permission denied`. **Not** `42P01` (the table does not exist — §20
   never ran) and **not** `0 rows` (a policy exists that should not).
2. As a signed-in non-admin: the same → 42501; `select
   admin_list_promo_codes()` → 42501; `select admin_set_promo_code('X',
   '{"percent_off":10}')` → 42501.
3. As anon: `select quote_order('indie', 'NOTACODE')` → `ok: false, reason:
   'unknown'`, the list price, a sentence. `select quote_order('indie',
   null)` → `ok: true`, the list price.
4. As the admin: make a code on the console; as anon quote it → `ok: true`
   with the discounted amount; deactivate it on the console; quote again →
   `inactive`.
5. After one test-mode purchase with the code: the ledger row carries it,
   `uses` reads 1 on the console, and a second purchase with a `max_uses: 1`
   code is refused by `rzp-order` with *"used as many times as it allows"*.

---

## 6c. The growth sections (schema §21 onward, 7 Oct 2026). **UNRUN.**

Each section below passes `npm run test:schema` on PostgreSQL 16 (its own
file in `scripts/schema-tests/`); none has met the live database. The
checks are written to be run in order, after §21 onward has been pasted
into the SQL editor and `rzp-order` redeployed.

### §21 — upgrade by paying the difference

| Object | Grant | Notes |
|---|---|---|
| `quote_for(uuid, text, text)` | nobody (internal) | the one price; reached through `quote_order` and `create_pending_payment` |
| `paid_credit_paise(uuid)` | nobody (internal) | sums `paid` + `lifetime` rows |
| `quote_order(text, text)` | `anon`, `authenticated` | now `quote_for(auth.uid(), …)` — a signed-in caller learns only their OWN credit |
| `payments.credit_paise` | — | written by `create_pending_payment` (service role) only |

The risk this section adds is a caller pricing somebody else's upgrade;
`quote_order` takes no user argument, so it cannot. Live checks:

1. As anon: `select quote_for('<any uuid>', 'indie', null)` → `42501`;
   `select paid_credit_paise('<any uuid>')` → `42501`. As anon,
   `quote_order('indie', null)` → the list price, `credit_paise: 0`.
2. As a signed-in buyer who paid for Starter in test mode:
   `quote_order('indie', null)` → `amount_paise` = Indie − what they paid,
   `upgrade_from: 'starter'`; `quote_order('starter', null)` → `22023`
   *"You already have Starter"*.
3. The test-mode upgrade from `settings.html#plan`: Razorpay's order
   shows the difference; the ledger row's `credit_paise` is the Starter
   amount; the organisation is on Indie.
4. With the service key, open an Indie and a Pro order for one test
   user, activate Pro then Indie → `accounts.plan` stays `pro`.

### §22 — referral codes

| Table / function | Policy / grant | Permits | To whom |
|---|---|---|---|
| `billing_settings` | RLS on, **no policy**, API roles revoked | — | nobody from the client |
| `referral_credits` | RLS on, **no policy**, API roles revoked | — | nobody from the client |
| `my_referral()` | `authenticated` | the caller's OWN code and credits (amounts and dates, never the friend) | a signed-in member |
| `ensure_referral_code(uuid)`, `payments_referral_after()` | nobody | mint a code; write a credit | internal / trigger |
| `admin_get/set_billing_settings`, `admin_list_referral_credits`, `admin_mark_referral_paid` | `authenticated`, re-check `is_studio_admin()` | the console | an administrator |

A credit is written only by the trigger on `payments`, which only the
service role's `activate_payment()` moves to `paid`; a member cannot
credit themselves because `quote_for()` refuses their own code. Live
checks:

1. As anon: `select count(*) from referral_credits` and
   `from billing_settings` → `42501` (not `42P01`, which means §22 never
   ran). `select my_referral()` → `42501`.
2. As a signed-in member who has paid nothing: `my_referral()` →
   `eligible: false`. After a test-mode purchase: `eligible: true`,
   `code` `REF-XXXXXX`; asked again → the same code.
3. As that member: `quote_order('indie', '<their code>')` → `ok: false,
   reason: 'own_code'`.
4. A second test account buys with the code → 10% off; after activation
   the console's Growth tab shows one owed credit naming both addresses;
   MARK SELECTED PAID → paid, and the first member's panel reads it.
5. As a non-admin: `select admin_list_referral_credits()` → `42501`.

### §23 — affiliate codes

No new table: `promo_codes.commission_pct` sits in the table §20 already
closed to the client. `admin_affiliate_report()` and
`admin_affiliate_orders(text)` are granted to `authenticated` and
re-check `is_studio_admin()`; the second returns buyers' e-mail
addresses, so the check is the whole boundary. Live checks:

1. As a non-admin: `select admin_affiliate_report()` and
   `select admin_affiliate_orders('X')` → `42501`.
2. As the admin: a code with "Commission %" 20 → the promo list says
   "20% commission"; `admin_set_promo_code('<a REF- code>',
   '{"commission_pct": 10}')` → `22023`.
3. One test-mode purchase through it, one refunded: the Growth tab shows
   orders 1, revenue = the paid amount, commission = floor(20%),
   refunded 1.

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

**These are automated now — run `npm run live-checks`.** All 15 distinct
assertions in the numbered list below are implemented in
`scripts/live-checks.mjs`, along with the checks from LIVE CHECK 1–3 and the
findings, for 34 in total. `docs/LIVE-CHECKS.md` has the environment
variables, what each check proves and what a failure means. The SQL below
stays as the readable statement of intent.

Two things about that harness are worth knowing before you trust a green run.
It **refuses to start** on a `service_role` key — that key is BYPASSRLS, so
every check would pass and prove nothing — and it exits non-zero when checks
merely did not run, because "ran but incomplete" is not a pass. And nearly
every check carries a **positive control**: a refusal proves nothing if the
actor never had the access in the first place, so the harness confirms B *can*
rename a project before asserting B cannot move it, and reports NOT RUN rather
than PASS when a control fails.

**16 items are deliberately NOT automated**, listed with reasons in §6 of
`docs/LIVE-CHECKS.md`. The important one: the catalogue assertions — 20
policies, zero UPDATE/ALL without a `WITH CHECK`, zero policies reading their
own table, RLS on all seven tables, `proacl` — **cannot be automated at all**,
because PostgREST exposes only the `public` schema and no arbitrary-SQL RPC, so
not even a service_role key over REST can read `pg_catalog`. Their behavioural
consequences are covered; the structural properties still need the SQL editor.

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
8b. **Nor is it mintable (A1b, §19).** As `A`, with the publishable key:
    `insert into accounts (name, owner_id, plan, seat_limit) values ('Mint', auth.uid(), 'pro', 999)`
    → expect 42501 *"Plan and limits are set by billing"*. Repeat with only
    `plan = 'pro'`, only `seat_limit = 2`, only `storage_limit_mb = 1`, only
    `plan_until = now()` → 42501 each. Then the positive control:
    `insert into accounts (name, owner_id) values ('Plain', auth.uid())` →
    one row, `plan 'free'`, `seat_limit 1`, `storage_limit_mb 500`,
    `plan_until null`. Then `select billing_status() ->> 'plan'` → still
    `'free'`. If the first insert *succeeds*, §19 never ran — check with
    `select tgtype from pg_trigger where tgname = 'accounts_guard'` in the SQL
    editor: bit 2 (INSERT) must be set (tgtype 7 = BEFORE INSERT OR UPDATE,
    ROW; 19 = BEFORE UPDATE only).
8c. **The grant path still works through the new guard.** As the admin on
    `admin.html` → Billing → Grant: grant a plan to a member who owns no
    organisation → the ledger shows the ₹0 row and `billing_status()` for
    that member names the plan. This is `account_for_buyer()` inserting with
    defaults inside an *authenticated* admin's call — the case the guard
    must let through.
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

1. ~~**The read side is still unproven, and this has not moved.**
   `projects` holds 0 rows, so an anonymous `[]` cannot distinguish "RLS
   denied it" from "nothing is there".~~ **CLOSED 8 Oct 2026 — see LIVE
   CHECK 4 at the end of this file.** `projects` now holds 6 rows and
   `project_data` 30, and an anonymous GET still returns `[]` for both.
   The ambiguity is gone and the read side passes.
2. The remaining live checks needing two real accounts: collaborator
   isolation, share claim/expiry/revoke end to end, the comment-status
   and reply-cascade guards, and the account-tier escalations. The
   guards all exist now, so these are testable for the first time.
3. Share tokens are still stored in plaintext — a product call, because
   the owner's "re-copy this link" depends on it. **There is no automated
   check for this and there should not be:** it is accepted behaviour, not a
   defect, so there is nothing to assert. Said here so a future reader does
   not go looking for the check and conclude it was forgotten.
4. ~~There is still no `claim_invite()`, so account invites cannot be
   claimed.~~ Written, as schema section 11, and wired into
   `cloud.js`. **Not deployed and not tested** — see the section below,
   which is the only part of this document describing SQL that has
   never run against anything. The account tier is still not reachable
   from the UI: `cloud.js` now calls `rpc/claim_invite`, and nothing
   anywhere lets an owner CREATE an invite, so the flow is closed at
   the accepting end and open at the sending end.
5. Realtime DELETE payloads are documented as not RLS-filtered the way
   INSERT and UPDATE are. Unverified.
6. **Google is the only sign-in the app offers, and nothing in this
   repository can make that true.** The client now ships exactly one
   auth call — `signInWithGoogle()` in `src/lib/cloud.js`; the
   magic-link/OTP path and its email field are gone. That is the UI
   half. The other half is a dashboard setting: Supabase mints a
   session for any provider enabled under Authentication → Providers,
   and the `/auth/v1` endpoints take the public anon key, so a provider
   no button points at is still a working way in. Until **Email is
   disabled** (it covers both magic link and email+password signup) and
   **Anonymous sign-ins are confirmed off**, "Google only" describes the
   markup and not the project. The Anonymous case is the sharper one for
   everything above: an anonymous session gives a non-null `auth.uid()`,
   which satisfies the "is the caller signed in?" half of every policy
   in this document. Setup steps are in the header of
   `supabase-schema.sql`; verifying them is a live check, like the rest
   of this list.
---

## CLAIM_INVITE (§11) — WRITTEN 1 OCT 2026. NOT RUN. NOT TESTED.

Everything above this line has at least been probed against a live database.
This section has not. It closes finding **A6** on paper and the paper is all
there is: the SQL parses (all 181 top-level statements and all 15 PL/pgSQL
bodies, libpg_query via `pglast`) and parsing is not permission testing —
the same sentence this document opens with, and the lesson LIVE CHECK 1
through 3 kept re-teaching.

### What it is

    public.claim_invite(p_account_id uuid default null)
      returns table (account_id uuid, account_name text, role text, status text)
      language plpgsql
      security definer
      set search_path = public, pg_temp

It turns a pending `account_members` row into a membership: sets `user_id` to
the caller, `status` to `active`, `joined_at` to `now()`. With no argument it
sweeps every pending invite addressed to the caller's verified email. With an
account id it accepts exactly that one.

### The credential is the email, not a token

The A6 note suggested *"a `claim_invite(p_token)` RPC modelled on
`claim_share()`"*. This is modelled on `claim_share()` in **shape** — one
`security definer` RPC, no new RLS policy, the self-claim bypassing the
table's own write policy — and deliberately not in its **credential**.

This document's first framing sentence is that a share link is a bearer
credential and nothing in a database can fix that. For one project that is an
accepted trade. For an account it is not: `account_members.role` of `owner` or
`admin` is read by `has_project_access()`, which grants `edit` on **every
project in the account**, unconditionally, with no collaborator row — the
third entry in "What would leak one user's projects to another". A forwardable
string conferring that would be the most dangerous credential in the system,
and it would need a token column, a delivery channel and an expiry, none of
which exist.

`account_members` already has a credential and its own comment says so: *"the
email is the stable key"*. So the authorisation is "the identity provider says
you are the person this invite was addressed to". Google is the only sign-in
method, so the address is attested by Google, not typed by the claimant.

The email is read from `auth.users` — `email_confirmed_at is not null` and a
non-empty `email` — not from `auth.jwt()`. `comments_set_author()` reads the
JWT, which is right for a display name and wrong for an authorisation
decision.

### Why an anonymous session cannot use it

An anonymous Supabase session has a **non-null `auth.uid()`**, which satisfies
the "is the caller signed in" half of every policy in this file. It is not an
account. Two independent refusals: an anonymous user has no email at all, so
the `auth.users` lookup finds nothing and the function raises `42501`; and the
`is_anonymous` claim is tested explicitly before that. The EXECUTE grant is
the third, below.

### Grants

    revoke execute on function public.claim_invite(uuid) from public, anon;
    grant  execute on function public.claim_invite(uuid) to authenticated;

The revoke names `public` first and on purpose. **F3 in LIVE CHECK 3 was
exactly this mistake:** `revoke execute ... from authenticated, anon` left the
default `PUBLIC` grant untouched, and `purge_expired_shares` — which deletes
rows — answered an anonymous POST with 200 and a count. `revoke ... from
<role>` on a function is almost never sufficient; check `proacl`.

`claim_invite` writes `account_members`, so `anon` must not hold EXECUTE. The
§10.4 exemption — the three functions `anon` keeps, because a policy that
invokes a function the caller cannot execute **errors** instead of returning
false — does not apply: no RLS policy invokes `claim_invite()`.

### What it refuses to do, deliberately

**A pending `owner`-role invite is not claimable.** The claim is an UPDATE, so
`account_members_guard` (§7.7) still fires, and granting or changing an `owner`
row is owner-only there — the claimant is not an owner, so the guard would
refuse with a message about granting roles, which is not what the person did.
The function filters those rows out instead, so the guard is never reached and
the behaviour is documented rather than discovered. An `owner`-role member can
write `accounts` (`acc_update`), which is A2's path; a self-claim flow is not
the place to hand that out. To add a second owner: invite as `admin`, let them
claim, promote the row as the owner.

**No new policy.** `am_write` stays owner/admin-only. Any policy wide enough to
let a stranger write their own pending row would be wide enough to let them
write somebody else's.

**No seat is consumed by claiming.** `enforce_seat_limit()` counts `pending`
and `active` together and returns early on an UPDATE that is not
`revoked -> pending/active`, so the seat was spent when the invite was created
(A7: a backfilled personal account has `seat_limit = 1` and one owner row, so
its first invite raises `53400` before any of this is reached).

**Nothing is frozen that was not already.** No policy `USING` or `WITH CHECK`
in this file was rewritten, so neither of the two traps that bit §9 — a
rewritten `USING` silently rewriting its `WITH CHECK` (F6), and an UPDATE/ALL
policy with no `WITH CHECK` at all (F5) — is in play. The catalogue assertion
"zero UPDATE/ALL policies without a `WITH CHECK`" still holds unchanged.

### Assumptions that could not be tested

1. **A `security definer` function owned by `postgres` can SELECT
   `auth.users`.** The §6 backfill reads `auth.users`, but from a `DO` block in
   the SQL editor, which is not the same privilege context. If this is wrong,
   the first call fails `42501 permission denied for table users`, and the fix
   is a grant on `auth.users` to the function's owner, not a rewrite.
2. **Google sign-in sets `auth.users.email_confirmed_at`.** If it does not,
   every claim refuses with "A confirmed email address is required". Do not
   relax the predicate to `email is not null` without first deciding whether an
   unconfirmed address is an identity.
3. **`auth.uid()` inside the function and inside the triggers it fires is the
   claimant**, not the definer. The file already depends on this for
   `comments_set_author()` and `claim_share()`, so it is an inherited
   assumption rather than a new one — but it has never been proven either.
4. **The `is_anonymous` JWT claim is present** on anonymous sessions. If the
   claim is absent the test is a no-op and the email requirement carries the
   whole refusal.
5. **No PL/pgSQL variable/column ambiguity at run time.** The OUT parameters
   are called `account_id`, `role` and `status`, which are also column names on
   `account_members`. Every column reference in the body is qualified for that
   reason. `create function` does not catch this class of error; the first call
   does.
6. **A data-modifying CTE feeding `select array_agg(...) into`** behaves as
   written. Chosen over `get diagnostics row_count` after `return query` so the
   result does not depend on which Postgres version started setting ROW_COUNT
   there.

### Live checks — none of these have been run

Needs two real Google accounts, `A` (account owner) and `B`, and `B`'s address
in `A`'s hands.

1. **It exists and `anon` cannot call it.** With the publishable key, signed
   out: `POST /rest/v1/rpc/claim_invite` with `{}` → expect
   `401 42501 permission denied for function claim_invite`. Not `PGRST202`;
   that would mean section 11 never ran. Then check `proacl` on the function
   and assert it names `authenticated` and nothing else.
2. **The invite exists.** As `A`, insert the pending row — nothing in the UI
   does this yet:
   `insert into account_members (account_id, invited_email, role, invited_by)
    values (<A's account>, '<B's email>', 'admin', auth.uid())`.
   Expect success, or `53400` if `seat_limit` is still 1 (A7) — raise the seat
   limit as `service_role`, since `accounts_guard` refuses it from a client
   (A1).
3. **`B` cannot see it before claiming.** As `B`:
   `select * from account_members` → expect 0 rows (`am_select` matches on
   `user_id`, still null). This is the half of A6 the function does not fix.
4. **`B` cannot claim it by hand.** As `B`:
   `update account_members set user_id = auth.uid(), status = 'active'` →
   expect 0 rows affected or `42501`. If this succeeds, `am_write` has been
   widened and the function is beside the point.
5. **The claim works.** As `B`: `select * from claim_invite()` → expect one row
   `(A's account id, A's account name, 'admin', 'active')`. Then
   `select user_id, status, joined_at from account_members
     where account_id = <A's account>` as `A` → `user_id` is `B`, status
   `active`, `joined_at` set.
6. **It is idempotent.** `B` calls `claim_invite()` again → expect **0 rows and
   no error**. This is the case the client hits on every sign-in.
7. **Another person's invite is not claimable.** Invite a third address;
   as `B`, `claim_invite()` → expect 0 rows, and the third row's `user_id`
   still null. Then `claim_invite('<A's account>')` as a user with no invite →
   expect `22023`.
8. **An `owner` invite is refused, not half-applied.** As `A`, insert a pending
   row with `role = 'owner'` for `B`'s address; as `B`, `claim_invite()` →
   expect 0 rows claimed, the row untouched, and `accounts.owner_id` unchanged.
9. **The membership is the one intended.** As `B`, now an `admin` of `A`'s
   account: `select id from projects` → expect `A`'s projects (the
   `has_project_access` account branch). Then repeat with a `member`-role
   invite on a second account → expect **none** of that account's projects,
   which is the documented privacy-preserving default and the assertion that
   catches the role being written wrong.

Check 9 is the one that proves "landed with the right account membership"
rather than merely "a row changed".

---

## LIVE CHECK 4 — RUN 8 OCT 2026. THE READ SIDE IS PROVEN.

The check this document has called "the last cheap check" since 30 Sep,
and listed as the single highest-value item remaining, is done. It only
ever needed one thing that did not exist yet: real rows. The studio now
holds some.

Run with nothing but the publishable anon key, against production
(`conhlrulxfwkhsnymakz`), `GET /rest/v1/<table>?select=*&limit=3`:

| Table | Real rows | Anon GET | Verdict |
| --- | --- | --- | --- |
| `projects` | **6** | `200 []` | **PROVEN** — rows exist and anon sees none |
| `project_data` | **30** | `200 []` | **PROVEN** |
| `payments` | **1** | `200 []` | **PROVEN** |
| `accounts` | 2 | `401 42501` permission denied for function `account_role` | refused |
| `account_members` | — | `401 42501` permission denied for function `account_role` | refused |
| `studio_members` | 2 | `401 42501` permission denied for function `is_studio_admin` | refused |
| `invite_codes` | — | `401 42501` permission denied for function `is_studio_admin` | refused |
| `invite_redemptions` | — | `401 42501` permission denied for function `is_studio_admin` | refused |
| `plans` | 4 | `200` with rows | **correct** — §18 intends anon to read plans |
| `shares` | 0 | `200 []` | still ambiguous (table is empty) |
| `project_collaborators` | 0 | `200 []` | still ambiguous (table is empty) |
| `comments` | 0 | `200 []` | still ambiguous (table is empty) |

**Three tables are now genuinely proven rather than merely silent**, and
the distinction is the whole point of this check: an empty answer from an
empty table proves nothing, an empty answer from a table holding 30 rows
proves the policy. `projects`, `project_data` and `payments` all hold
real data and all return `[]` to an anonymous caller.

**Three are still ambiguous and will stay so until they hold a row.**
`shares`, `project_collaborators` and `comments` are empty, so their
`[]` means nothing either way. That is a gap in the evidence, not in the
policy, and it closes the moment the collaboration features are
exercised once — which is the two-account session already outstanding.

Also observed, and not a security finding but worth recording: `payments`
already holds one row although no Razorpay key is configured and no
purchase is possible. Worth a look before the first real sale, so nobody
mistakes it for one.

### Who exists, as of 8 Oct 2026

`auth.users` holds 3 accounts; `studio_members` holds 2; `accounts`
holds 2. Addresses are deliberately not reproduced here — query
`auth.users` for them. By role:

- the project-owner account (the same one that owns the Google Cloud
  project): `studio_members` role `admin`, signed in, created 3 Oct
- a second personal account: role `user`, signed in, created 5 Oct
- a third account on a corporate domain: **no `studio_members` row at
  all**, signed in, created 5 Oct

Three things follow, none of them acted on, because each is the owner's
call and one is a privilege grant:

- **The 13.2 bootstrap for the second `VITE_ADMIN_EMAILS` address is not
  actionable**, and now for a checked reason rather than an assumed one:
  that address does not exist in `auth.users` at all. It has never
  signed in. `docs/LAUNCH.md` §4's "if it has signed in" resolves to no.
- **`.env` may name the wrong address.** The second entry in
  `VITE_ADMIN_EMAILS` has never signed in, while a visually
  near-identical address HAS signed in and sits at role `user`. They are
  different addresses and both may be deliberate — the one in `.env` is
  the support e-mail on the Google consent screen, so it is certainly
  real. But if the intent was that the signed-in account be an admin,
  the env var names the wrong one and the console will never appear for
  it. Nobody was promoted: deciding this is a privilege grant.
- The corporate-domain account is signed in with no `studio_members`
  row, so the gate holds it outside — fail-closed, working as designed.
  It needs a row, or an invite, before it can sync.
