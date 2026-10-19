# Database schema

Everything the Supabase project runs, as plain SQL. Sections are numbered in the
order they were AUTHORED, not the order they are applied (see run order below).

| File | Sections | Notes |
| --- | --- | --- |
| `supabase-schema.sql` | §1–§39 | Projects, sync scopes, accounts, collaborators, invite gate, billing (§16–§23, §36 generated from `src/data/plan-matrix.json`), refunds, invoices, trial, plan features, retired free plan. |
| `schema-40-admin-audit.sql` | §40 | Admin audit log. Needs §1–§39. |
| `schema-41-admin-health.sql` | §41 | Admin health. Standalone. |
| `schema-42-customer-360.sql` | §42 | Customer 360 view. Needs §40. |
| `schema-43-usage-cohorts.sql` | §43 | Usage cohorts; `usage_names()` is generated (`node scripts/make-usage-names-sql.mjs --write`). |
| `schema-44-sync-limits.sql` | §44 | Sync limits. Standalone. |
| `schema-45-admin-controls.sql` | §45 | Admin controls. Needs §40. |
| `schema-46-role-matrix.sql` | §46 | Role matrix (`require_role()` on the admin writers). Needs §45. |
| `schema-47-delete-anonymise.sql` | §47 | Total delete anonymises kept invoices. Needs §45. |
| `schema-48-presence.sql` | §48 | Who may join a project's private presence channel (`realtime.messages` policies + `can_join_presence()`). Needs §1–§3. **Not run live.** The client ships safely first: until this runs, presence shows nobody. |
| `schema-49-co-editing.sql` | §49 | The co-editing switch: `billing_settings.co_editing_enabled`, `co_editing_enabled()`, `admin_set_co_editing_enabled()` (owner). Needs §40, §45. **Not run live.** Safe before it runs: a missing function reads as OFF. |
| `schema-50-refund-seat-trial.sql` | §50 | Refunds need the finance (or owner) role in the database too; a refund request reads refunded only once processed, and cannot be declined while a refund is in flight; seats follow the current plan; a declined invite request keeps blocking `start_trial()` after a re-ask. Needs §45. **Not yet run live.** |
| `schema-51-security-followups.sql` | §51 | The security audit's follow-ups: a limited promo code is reserved when an order opens and never counted past its cap; upgrade credit counts only organisations still owned and only payments that applied a plan (`payments.plan_applied`, backfilled); a credited payment is not refunded under an upgrade; support cannot disable an administrator; no cross-user `user_plan`/`user_limits`/`is_entitled`/`is_studio_member`/`account_plan`; screening passes only for owned films; the collaborator cap holds on a move; films are not handed to other users; **`claim_share()` works again** (it failed 42702 on every call) and a link's grant follows the link; owners cannot rewrite a collaborator's comment; `sh_owner_all` dropped; no anonymous trials; deleting a team or removing a member never takes a member's films; a deleted member's address leaves their referral code. Needs §40, §45, §46, §50. **Not yet run live.** sha256 `860ed0741bad08c196d40d00602c4fb5481290519017691a30529bb4ac63ac44`. |
| `patches/2026-10-10-billing_status.sql` | — | Hand-extracted `billing_status()` for pasting into the SQL editor. |

## Run order
`supabase-schema.sql` (§1–§39) → 40 → 41 → 42 → 43 → 44 → 45 → 46 → 47 → 48 → 49 → 50 → 51. Every file
is re-runnable ON ITS OWN, at its place in that order. §50 goes with a redeploy of `rzp-refund`
(`docs/BILLING.md` §20); §51 with a redeploy of `rzp-verify` (`docs/BILLING.md` §21).

**Never replay an EARLIER file over a later database.** Re-running is safe only for the newest
section. `supabase-schema.sql` (and §40, §42) still contain the pre-§46 admin writers, so running
them after §46 puts back `is_studio_admin()`-only checks, drops the audit writes, and undoes
§50/§51 — every statement succeeds and nothing says so. `scripts/deploy-billing.mjs --sql` now
refuses a database where §45 has run, and a bare run of that script deploys functions only.

## Rules
- **Verify before you run.** Pasting SQL through a clipboard corrupts em-dashes and `₹`. Hash the file
  (`shasum -a 256`) and compare it to the editor's contents before pressing Run.
- **Client change needing a new scope?** Run the schema section FIRST (code ahead of the database fails silently).
- **Do not edit generated blocks by hand** (§36 plan features, §43 usage names): change the JSON source and
  run the matching `make:*` script; `test:plans` / `test:usage-names` fail on drift.
- **Tests:** `npm run test:schema` loads the whole schema on a real PostgreSQL and runs the checks in
  `scripts/schema-tests/` (setup in `CLAUDE.md`). Live status of each section: `docs/HANDOFF.md`.
- Deploy order for billing: `docs/BILLING.md`; admin sections: `docs/ADMIN-CONSOLE.md`.
