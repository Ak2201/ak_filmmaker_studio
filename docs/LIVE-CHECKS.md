# Live checks — running `docs/SECURITY-RLS.md` against a real database

`docs/SECURITY-RLS.md` is a **static** audit. It ends with a list of checks that
need two real signed-in accounts, and three live runs have whittled that list
down without clearing it. This document is how the rest of it gets run, by
someone who has the credentials, in one command.

```bash
npm run live-checks                  # read-only. Writes nothing. Start here.
npm run live-checks -- --mutate      # the full set. Creates and removes rows.
```

The script is `scripts/live-checks.mjs`. It is a dev tool: nothing in `src/`
imports it, it is not an entry in `vite.config.js`, and `scripts/` is outside
the build, so it cannot reach `dist/` or the service worker's precache
manifest. Node 22 or newer (the repo's `engines` field already says so).

**Why it exists rather than a checklist.** The audit's own LIVE CHECK 1 §F1
makes the case better than anything here could: *"a line-by-line reading of the
SQL produced a careful audit and twenty correct observations, and could not see
that the thing did not run."* A manual checklist of ten items gets worked
through once, by the person who wrote it, and never again.

---

## 1. Credentials

Everything comes from the environment. Nothing is read from a file in the repo,
and nothing is ever printed: every value that could be a credential is
registered with the redactor, and server responses are run through it too
before they reach the report — GoTrue happily returns a fresh `access_token`
and `refresh_token` in a sign-in body.

| Variable | Required | What it is |
|---|---|---|
| `FMS_SUPABASE_URL` | yes | `https://<project-ref>.supabase.co` |
| `FMS_SUPABASE_ANON_KEY` | yes | the **anon / publishable** key — see the warning below |
| `FMS_A_ACCESS_TOKEN` | for most checks | account **A**'s user JWT (the project owner) |
| `FMS_A_REFRESH_TOKEN` | alternative to the above | survives the access token's ~1h expiry |
| `FMS_B_ACCESS_TOKEN` | for the collaborator checks | account **B**'s user JWT (the guest) |
| `FMS_B_REFRESH_TOKEN` | alternative to the above | as above |
| `FMS_A_ACCOUNT_ID` | for check L9 only | a throwaway multi-seat account — see §4 |
| `FMS_A_EMAIL` / `FMS_A_PASSWORD` | no | last-resort fallback; see §1.3 |
| `FMS_B_EMAIL` / `FMS_B_PASSWORD` | no | as above |

### 1.1 Never the `service_role` key. This is the one rule with teeth.

Most of these checks are statements about **what a client holding the public key
can do**: "an anonymous caller sees no rows", "a comment guest cannot write the
document", "an edit collaborator cannot move the project". A `service_role` key
is `BYPASSRLS`. Every one of those checks would pass with one, and the pass
would mean nothing at all — a harness reporting green while testing nothing.

So the script does not merely warn:

- it decodes the key and **refuses to start** if the `role` claim is anything
  but `anon`, or if the key begins `sb_secret_`;
- it also refuses to start if a variable matching `SERVICE_ROLE`, `SERVICE_KEY`
  or `SECRET_KEY` is in the same shell at all, even unused. A secret sitting
  beside the anon key is one arrow-up in shell history from being the value
  that gets used.

Both refusals exit **2** with `NOT RUN`, never 0.

Where to find the right key: Supabase dashboard → Project Settings → API →
*Project API keys* → the **anon / public** (or `sb_publishable_…`) one. It is
the same key that ships in the browser bundle under `fms_supabase_cfg_v1`,
which is exactly why it is the interesting one to test with.

### 1.2 Getting A's and B's tokens (the Google-only route)

The app now ships exactly one auth call — `signInWithGoogle()` in
`src/lib/cloud.js` — so there is no password to hand the script. Lift a session
out of a signed-in browser instead:

1. Sign in to the deployed app as **A** in one browser profile, and as **B** in
   a second profile (or a different browser). They must be two different Google
   accounts; the script checks the two user ids and **fails** if they match,
   because every collaborator check would otherwise pass trivially.
2. In each, open DevTools → Application → Local Storage and find the Supabase
   auth entry (`sb-<project-ref>-auth-token`). It is JSON holding
   `access_token` and `refresh_token`.
3. Export them. Prefer the refresh token — an access token expires in about an
   hour and the script will tell you so rather than guessing:

```bash
export FMS_A_REFRESH_TOKEN='…'     # from A's browser profile
export FMS_B_REFRESH_TOKEN='…'     # from B's
```

Use `export` in a throwaway shell, not a `.env` file in the repo. There is no
`.env` support on purpose: a file is a thing that gets committed.

### 1.3 The email/password fallback, and why it is a smell

`FMS_*_EMAIL` + `FMS_*_PASSWORD` sign in through
`/auth/v1/token?grant_type=password`. That only works if the **Email provider is
enabled**, which `supabase-schema.sql`'s header says to disable. If this route
works, the script records it and **check PS1 fails** citing it — the behaviour
is better evidence than the dashboard flag. Treat a working password grant as a
finding, not a convenience.

---

## 2. What a run does, and does not, write

**Default (no `--mutate`): nothing is written.** Checks that must create rows
report `NOT RUN` with the reason. Two probes still send requests that *attempt*
a write — an anonymous `POST /projects` and `POST /accounts` — because an INSERT
that RLS refuses writes nothing, and one that is *not* refused is the finding.

**With `--mutate`**, the run creates, and then removes:

| Created | Owner | Why |
|---|---|---|
| 1 `projects` row | A | the subject of almost every check |
| 2 `project_data` rows (`feature`, `scenes`) | A | so R1 has a real row to prove the read side with |
| 1 `comments` row | A | likewise, plus the reply target for L6 |
| 1 `projects` row | B | the destination for L5's comment-move probe |
| 1 `accounts` row | A | the subject of L8 |
| 1 `accounts` row | B | the destination an edit collaborator must not reach (L2) |
| several `shares` rows | A | one per share-link check, deleted as each finishes |
| 1 `comments` row | B | the suggestion L5/L6/L7 are about |
| 1 `project_data` row (`workbench`) | A | inserted, updated and deleted by L10 to drive realtime |

Everything is titled with a unique `RUN_TAG` (`live-check <ISO timestamp>
<uuid8>`) and registered in an owned-objects ledger. **Every destructive call
goes through `assertOwned()` and throws if the id is not in that ledger**, and
there is deliberately no environment variable for "the project to test
against": deleting a share, a comment or a project is not something to run
against real work.

Teardown runs in a `finally`, prints a line per object, and says `LEFT BEHIND`
with the server's reason for anything it could not remove. `--keep` skips it.

The one exception to "only what it created" is `FMS_A_ACCOUNT_ID` — see §4. The
run adds and removes **member rows** on that account and never deletes the
account itself.

---

## 3. The checks

`source` cites where in `docs/SECURITY-RLS.md` each one comes from. The script
prints the same ids.

### Provider settings — configuration, not SQL

No policy in `supabase-schema.sql` can compensate for either of the first two.
"Google only" is two facts and this repository can supply only one: the client
ships a single auth call, which is the markup, while Supabase mints a session
for **any** enabled provider and the `/auth/v1/*` endpoints accept the public
anon key that ships in the browser bundle. A provider no button points at is
still a working way in.

| id | Proves | A failure means |
|---|---|---|
| `PS1` | Email sign-in is disabled | `signInWithOtp()` works against your project URL with the bundled key. Email covers magic link *and* email+password, so an account can be created and a session minted without ever touching Google. Turn Email off in Authentication → Providers. |
| `PS2` | Anonymous sign-in is off | The sharper of the two. An anonymous session has a **non-null `auth.uid()`**, which satisfies the "is the caller signed in?" half of *every* policy in the schema — including `claim_share()`'s own gate. |
| `PS3` | Google is the only provider enabled | Something else (Apple, GitHub, phone/SMS, SAML…) is reachable. Default-off, so this is a check rather than a change — but check it. |
| `PS4` | The key in use is the publishable one | Informational; the hard gate is in §1.1. |

`PS1` corroborates the dashboard flag with a password grant against a bogus
`@example.com` address, which distinguishes `email_provider_disabled` from
`invalid_credentials` **without sending an email or creating anything**. `PS2`
additionally attempts a real anonymous signup under `--mutate`, because a flag
is not behaviour; if that succeeds the message names the user id to delete.

### Anonymous, read-only, the public key

| id | Proves | A failure means |
|---|---|---|
| `A1` | no `42P17` on any of the seven tables | Policy recursion — the cloud layer returns 500 to every caller and has never worked. Note the lesson from LIVE CHECK 2: Postgres names the relation you *entered through*, so read `pg_policies` for every table in the cycle, not just the one in the message. |
| `A2` | all seven tables resolve (no `PGRST205` / `42P01`) | Sections 6 and 7 may not have run, in which case everything section 7 hardened is unfixed live. |
| `A3.*` | anon `SELECT` on `projects`, `project_data`, `comments`, `shares` yields no rows | A leak. **Reports `AMBIGUOUS`, not `PASS`, unless the run knows a row exists** — see below. |
| `A4` | same for `project_collaborators`, `accounts`, `account_members` | As above; also reports `AMBIGUOUS` for the same reason. |
| `A5` | `has_project_access()` → false for anon; `project_owner_is_caller()` exists | If the function is missing, schema section 9 has not run — and section 9 is what removes the recursion `A1` tests for. |
| `A6` | anon `INSERT` into `projects` / `accounts` is refused with `42501` | An anonymous caller can create rows. A refusal that is *not* `42501` means the gateway turned it away rather than a policy, which is a different and weaker guarantee. |
| `A7` | `account_owner()` / `account_role()` are not callable by anon | An anonymous account-membership oracle (finding F3). Postgres grants `EXECUTE` to **PUBLIC** on every new function and `revoke … from authenticated, anon` does not touch that grant. Check `proacl`. |
| `A8` | `purge_expired_shares()` is not callable by anon | Same cause as A7, but this function **deletes rows from `shares`**. Needs `--mutate`: permission can only be tested by calling it, and a permission check that passes runs the body. |
| `A8b` | nor by an ordinary signed-in user | As above. Needs `--mutate`. |
| `A9` | `resolve_share()` yields nothing for a nonexistent token | The token is the whole authentication; a wrong one must yield nothing. |

**The `AMBIGUOUS` status, and why it is not a pass.** With RLS on and no
matching policy, a `SELECT` returns an **empty set rather than an error**. The
tables may also simply be empty. Both look identical, which is why this
question survived three live runs unresolved. `A3`/`A4` therefore report
`AMBIGUOUS` whenever the run cannot prove a row exists, and `R1` is the
resolution.

### The read side

| id | Proves | A failure means |
|---|---|---|
| `R1` | with a real row present, an anonymous caller still sees `[]` | A leak, unambiguously. This is the audit's *"last cheap check"* and the whole reason `--mutate` creates a project: it makes the `[]` mean something. |
| `R2` | B, holding no grant, sees none of A's rows | Cross-tenant leak to a signed-in stranger. |

### The numbered live checks

| id | Audit | Proves | A failure means |
|---|---|---|---|
| `L1` | 1 | a `comment`-role guest cannot write `project_data` | The single most important property in the schema is broken: `pd_write` asks for `'edit'`, so comment-only sharing is supposed to be read-only for the document. |
| `L2` | 2 · P1 | an `edit` collaborator cannot move the project into an account they own | **HIGH.** `account_id` feeds `has_project_access()`, which grants an account's owner/admin `edit` unconditionally — so their access stops depending on the collaborator row and revoking the share does nothing. Then `acc_delete` lets them delete the account, and `accounts.id` cascades to projects: the film, every `project_data` row and every comment. A guest invited to make notes can delete the film. |
| `L3` | 3 · S1 | deleting the `shares` row removes an already-claimed grant | **HIGH.** A 7-day link is a 7-day window to claim *permanent* access, and the revoke button's "Anyone using it will lose access" is a lie. |
| `L4` | 4 · S1, F4 | an expired grant loses `SELECT` **and** `UPDATE` | If only `SELECT` goes, that is finding F4: the app shows the expired collaborator nothing while their writes still land. Silent in the worst way. Takes ~25s; `--skip-slow` reports it `NOT RUN`. |
| `L5` | 5 · C1, C4/F5 | an author cannot set their own suggestion to `accepted` | The field value never changes, so what this produces is a lie in the record — a suggestion that reads as approved by the writer and was not. Also checks the comment cannot be moved between projects (C4/F5). |
| `L6` | 6 · C2 | deleting a replied-to root comment is refused, and threads cap at one level | `parent_id` cascades, so this removes other people's writing. The depth probe matters too: unbounded depth is unbounded cascade. |
| `L7` | 7 · C3 | `author_name` carries no `@` | `cm_select` shows every comment to anyone holding a view link, so a view link would hand over the email address of everyone who ever commented. Also asserts `author_id` was forced server-side — the run deliberately sends the *wrong* id. |
| `L8` | 8 · A1 | an account owner cannot write `plan`, `seat_limit`, `storage_limit_mb` | **HIGH (billing).** `enforce_seat_limit()` is correct; the limit it enforces was a column the person being limited could set to 9999 with one `PATCH`. |
| `L9` | 9 · A2, A3, A5 | an admin cannot mint an owner row, demote or delete the owner's, seize `owner_id`, or reassign a claimed seat | **HIGH.** From `owner`, A2's path reaches `accounts.owner_id`, and from there every project in the account with the real owner locked out. **Needs `FMS_A_ACCOUNT_ID` — see §4.** |
| `L10` | 10 | a realtime subscriber with no grant receives no `INSERT`, `UPDATE` **or** `DELETE` payload | The channel name is guessable, and DELETE payloads are documented as not RLS-filtered the way INSERT and UPDATE are. The fix is Realtime Authorization (private channels) rather than `postgres_changes` alone. |

### Regressions named in the live-run sections

| id | Proves | A failure means |
|---|---|---|
| `F6` | a project owner cannot mint a `shares` row attributed to someone else | Finding F6, a regression section 9 introduced. The pattern is worth remembering: rewriting a policy to fix its `USING` clause quietly rewrites its `WITH CHECK` too. Diff both. |
| `P1b` | even the owner cannot hand `projects.owner_id` to another user | `projects_guard_owner` is absent or not firing. |
| `D1` | `project_data.updated_by` is forced to `auth.uid()` | `cloud.js` uses it as the realtime self-echo guard, so an editor who stamps a collaborator's id onto every write makes that collaborator's browser discard every incoming change — their screen silently stops matching the document, with no error anywhere. |
| `S4b` | an `edit` collaborator cannot create a share link, nor read the tokens | Access could be re-delegated downward, invisibly to the owner. |
| `A6b` | `claim_invite()` — informational | Reports whether the gap in finding A6 is still open. See §6. |

### Positive controls, and why nearly every check has one

Several checks assert that something was *refused*. A refusal proves nothing if
the actor never had the access in the first place — "B cannot move the project"
is worthless if B is not a collaborator at all. So:

- `L1` first confirms B **reads** `project_data` before asserting B cannot write it.
- `L2` first confirms B can **rename** the project before asserting B cannot move it.
- `L3` and `L4` confirm B reads the data **before** the revoke or the expiry.
- `L5` confirms B can edit their own comment **body** before asserting they cannot touch `status`.
- `L8` confirms A can **rename** their account before asserting they cannot write `plan`.
- `L9` confirms B actually **reads `account_members`** (i.e. is a real admin) before asserting the escalations fail.
- `L10` subscribes **as the owner too**, and reports `NOT RUN` if even the owner
  receives nothing — otherwise "B received nothing" cannot be told apart from
  realtime being switched off, which is the skipped-check-reads-as-a-pass trap
  `CLAUDE.md` names about the verify gate.

When a control fails, the check reports `NOT RUN` or `AMBIGUOUS` and says which
control it was. It never reports `PASS`.

---

## 4. Check L9 needs a prepared account, and the reason is structural

`L9`'s attack needs an account with at least three seats: A as owner, B as the
escalating admin, and one spare for the `owner` row B tries to mint.
`accounts.seat_limit` **defaults to 1**, and `L8` is the proof that a client
holding the public key cannot raise it. The two checks are in tension by
design, so this one precondition can only be created with the service key, in
the SQL editor, by hand:

```sql
-- Once, in the Supabase SQL editor. Use a THROWAWAY account: making someone
-- an admin of an account grants them edit on every project in it.
insert into public.accounts (name, owner_id, seat_limit)
values ('rls live checks', '<A''s auth.users id>', 5)
returning id;
```

```bash
export FMS_A_ACCOUNT_ID='<that id>'
```

Without it, `L9` reports `NOT RUN` carrying this explanation. The script
verifies the account is owned by A and **refuses** to write member rows
otherwise, and it never deletes the account — only the member rows it added.

---

## 5. Reading the output

Five statuses, and the distinction between the last three is the point of the
whole thing:

| | |
|---|---|
| `PASS` | ran, and the database behaved as `SECURITY-RLS.md` says it should |
| `FAIL` | ran, and it did not. The line carries the actual server response. |
| `NOT RUN` | did **not** run. The line says what it needed. |
| `AMBIGUOUS` | ran, found nothing wrong, and cannot distinguish "the policy worked" from "there was nothing to see" |
| `INFO` | context, not an assertion (the session identities, `claim_invite`) |

Exit codes:

| | |
|---|---|
| `0` | every registered check ran and passed. Only then. |
| `1` | at least one `FAIL` |
| `2` | could not start — missing or wrong credentials, or the project was unreachable. **Nothing was verified.** |
| `3` | nothing failed, but at least one check reached no verdict |

**Exit 3 is not a pass, and the script says so in words.** A harness that
reports green because it skipped everything is worse than no harness — the exact
failure mode `CLAUDE.md` documents about the verify gate, where a skipped group
read identically to a passing one. So a `NOT RUN` or an `AMBIGUOUS` anywhere
makes the whole run non-zero, and a check that *throws* is recorded as `NOT RUN`
rather than `FAIL`: a thrown check reached no verdict, and calling it a failure
would send someone hunting a security hole that is really a broken
precondition. A network error is likewise indeterminate, never a finding.

Other flags: `--json` for machine-readable output (same statuses, same ids),
`--skip-slow` to report `L4` and `L10` as `NOT RUN` instead of waiting,
`--expiry-seconds=N` and `--realtime-seconds=N` to tune the two waits,
`--keep` to leave the created rows for inspection.

---

## 6. What is **not** automated, and why

This list is the useful half of this document. Nothing from the audit was
dropped silently; each item below is here with its reason.

### Needs the SQL editor — PostgREST cannot reach the catalogue

`LIVE CHECK 3`'s verification paragraph asserts things about `pg_policies` and
`pg_proc`, and PostgREST exposes only the `public` schema and no arbitrary-SQL
RPC. **Even a `service_role` key over REST cannot read `pg_catalog`**, so these
are not automatable from outside at all — and the harness refuses a service key
anyway.

1. **20 policies exist, and zero `UPDATE`/`ALL` policy is missing a `WITH
   CHECK`.** The behavioural consequences are covered by `L5`, `F6` and `P1b`,
   but the structural assertion needs the catalogue.
2. **Zero policies read the table they guard.** `A1` catches the symptom
   (`42P17`); only the catalogue proves the property.
3. **RLS is enabled on all seven tables.** Implied by `A3`/`A4`/`A6` behaving,
   not proven by them.
4. **`proacl` holds no PUBLIC `EXECUTE` grant.** `A7`, `A8` and `A8b` test the
   behaviour, which is what matters; the audit's own F3 lesson is that the
   *source* of a `revoke` statement cannot tell you what the ACL says.

Run these in the SQL editor when the schema changes.

### Accepted, unfixed, or a product decision — there is nothing to assert

5. **S2 — share tokens are stored in plaintext.** Accepted, and it trades
   against a real feature: `sh_owner_select` returns the token so the owner can
   re-copy a link. Still open item #3. A check would only restate the schema.
6. **S3 — no rate limit on `resolve_share()`.** A provider setting, and testing
   it means brute-forcing your own project. Put Supabase's rate limiting in
   front of it.
7. **S4 — the token rides in a query string.** Mitigated by
   `Referrer-Policy: strict-origin-when-cross-origin` and a `default-src 'self'`
   CSP in `vercel.json`/`netlify.toml`, plus the `replaceState` in
   `handleSharedLink()`. Header configuration, not a database property.
8. **S5 — `resolve_share()`'s `is_expired` column is dead.** Cosmetic; the
   `WHERE` clause already excludes expired rows.
9. **S6 — `claim_share()` ignores seats and account membership.** Billing, not
   security.
10. **D2 — no size limit on `project_data.data`.** Accepted-unfixed, so an
    automated check would push a large payload into the operator's database to
    demonstrate something the audit already states.
11. **A8 (note) — unlimited `accounts` creation.** No rate limit, no assertion
    to make.
12. **P3 — `projects_guard_owner` is `security definer` and need not be.**
    Note only; currently load-bearing because §7.3 calls `account_role()`.

### Deliberately inconsistent, documented as such

13. **S1a** — an account admin cannot manage collaborators. **S1b** — a
    collaborator cannot leave a project. **C6** — an account admin cannot
    moderate comments. **A7 (note)** — `seat_limit` defaults to 1 and the
    backfill consumes it (this one surfaces as `L9`'s skip reason when the
    prepared account is too small). All in the safe direction; widening any of
    them is a product decision rather than a bug fix.

### Live, and genuinely needs a human eye

14. **Realtime Authorization.** `L10` tests `postgres_changes` behaviour.
    Whether to move to private channels is a design decision the audit
    recommends and a test cannot make.
15. **MAMI / IFFI**-style findings and anything else in the repo that is a
    sourcing question rather than a schema question. Out of scope here.

### Expected to land separately

16. **`claim_invite()` — schema section 11, and its nine checks.** A separate
    piece of work adds a `claim_invite()` RPC as schema section 11, with nine
    live checks of its own written into `docs/SECURITY-RLS.md` under
    **CLAIM_INVITE (§11)**. That work was not committed when this harness was
    written, so **it is not covered here**. Check `A6b` probes
    `rpc/claim_invite` and reports which state the database is in, so a run
    tells you whether the gap is still open.

    When section 11 lands, add those nine checks by appending entries to the
    `CHECKS` array in `scripts/live-checks.mjs` — section 7 of the file. Each
    entry is `{ id, source, title, needs, run }`; `needs` is declarative
    (`['mutate', 'A', 'B']` and so on) and the runner turns an unmet need into
    a `NOT RUN` line carrying the reason, so nothing has to be threaded through
    a sequence of conditionals. Checks run in array order and share one `ctx`,
    so an entry may leave something behind for a later one — `L5` leaves its
    comment for `L6` and `L7`, which is the pattern a claim/expiry/revoke
    sequence will want.

---

## 7. A first run, end to end

```bash
export FMS_SUPABASE_URL='https://<ref>.supabase.co'
export FMS_SUPABASE_ANON_KEY='<anon / publishable key — NOT the service key>'

npm run live-checks                      # read-only sanity pass
                                         # expect exit 3: the write-side and
                                         # collaborator checks report NOT RUN

export FMS_A_REFRESH_TOKEN='…'           # from A's signed-in browser
export FMS_B_REFRESH_TOKEN='…'           # from B's
export FMS_A_ACCOUNT_ID='…'              # the prepared account from §4

npm run live-checks -- --mutate          # the full set
```

Then record the outcome in `docs/SECURITY-RLS.md` the way LIVE CHECKS 1, 2 and
3 are recorded — including what the run could **not** determine. Those three
sections are the most valuable part of that document precisely because two of
them say so.
