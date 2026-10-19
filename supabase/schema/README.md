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
| `schema-48-refund-seat-trial.sql` | §48 | Refunds need the finance (or owner) role in the database too; a refund request reads refunded only once processed, and cannot be declined while a refund is in flight; seats follow the current plan; a declined invite request keeps blocking `start_trial()` after a re-ask. Needs §45. **Not yet run live.** |
| `patches/2026-10-10-billing_status.sql` | — | Hand-extracted `billing_status()` for pasting into the SQL editor. |

## Run order
`supabase-schema.sql` (§1–§39) → 40 → 41 → 42 → 43 → 44 → 45 → 46 → 47 → 48. Every file
is re-runnable. §48 goes with a redeploy of `rzp-refund` (`docs/BILLING.md` §20).

## Rules
- **Verify before you run.** Pasting SQL through a clipboard corrupts em-dashes and `₹`. Hash the file
  (`shasum -a 256`) and compare it to the editor's contents before pressing Run.
- **Client change needing a new scope?** Run the schema section FIRST (code ahead of the database fails silently).
- **Do not edit generated blocks by hand** (§36 plan features, §43 usage names): change the JSON source and
  run the matching `make:*` script; `test:plans` / `test:usage-names` fail on drift.
- **Tests:** `npm run test:schema` loads the whole schema on a real PostgreSQL and runs the checks in
  `scripts/schema-tests/` (setup in `CLAUDE.md`). Live status of each section: `docs/HANDOFF.md`.
- Deploy order for billing: `docs/BILLING.md`; admin sections: `docs/ADMIN-CONSOLE.md`.
