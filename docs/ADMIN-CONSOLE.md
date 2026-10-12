# Admin console v2 — reference

Sections of this file are written by the schema/UI lanes independently so they
merge cleanly: each section has its own heading, and a lane only edits its own.
The plan and the owner's decisions are in `docs/ADMIN-CONSOLE-PLAN.md`.

## §45 — Admin controls (schema)

File: `schema-45-admin-controls.sql` (standalone, **RUN LIVE: not yet**; requires
§40's `admin_audit_write`, and refuses to load without it). Checks:
`scripts/schema-tests/admin-controls.sql`. Until §40 is folded into
`supabase-schema.sql`, `npm run test:schema` loads
`scripts/schema-tests/audit-shim.sql` (a stand-in `admin_audit_write` that logs to
`public.test_audit_log`) and then the section, twice; delete the shim and its
line in `scripts/test-schema.mjs` when §40 lands and point the audit assertions
(`t.audits(...)`) at the real log.

Owner decisions applied (plan §11): no public contact form, no anon submit,
no outbound mail, no digest. The only anon-callable function is the read-only
`site_announcement_now()`.

### Roles

| Role | Intended reach |
| --- | --- |
| owner | everything; the switch, prices, flags/overrides, roles, banner, export/delete of a person |
| finance | refunds, invoices, payments, promo codes (+ read the support queue) |
| support | notes, trial grants, sessions, the support queue, passes and shares |

`require_role(array['finance'])` is the one line an RPC adds; owner always passes;
42501 with a sentence otherwise. **Existing RPCs are not retrofitted by §45** —
that is a separate pass. `is_studio_admin()` is unchanged and true for all three
roles (a role makes the person an admin member). A studio admin with no
`admin_roles` row reads as `owner`. The last owner cannot be removed or demoted
(trigger, 23514).

### RPCs

| RPC | Who | Notes |
| --- | --- | --- |
| `studio_role() -> text` | authenticated | null for non-admins |
| `require_role(text[])` | authenticated | raises 42501 |
| `admin_list_roles() -> jsonb` | owner | |
| `admin_set_role(p_user uuid, p_role text) -> jsonb` | owner | `p_role` null removes the role and demotes the membership |
| `effective_features() -> jsonb` | authenticated | fails open to the plan's own map |
| `admin_set_feature_override(p_key, p_scope, p_scope_id, p_enabled bool) -> jsonb` | owner | `p_enabled` null deletes the override |
| `admin_list_feature_overrides() -> jsonb` | owner | `{overrides, known_keys}` |
| `site_announcement_now() -> jsonb` | anon, authenticated | one object or null |
| `admin_set_announcement(p_text, p_level='info', p_starts_at=null, p_ends_at=null) -> uuid` | owner | retires the previous banner |
| `admin_clear_announcement() -> int` | owner | |
| `admin_log_ticket(p_email, p_subject, p_body='') -> uuid` | owner, support | |
| `admin_update_ticket(p_id, p_status=null, p_assignee=null, p_note=null, p_unassign=false) -> jsonb` | owner, support | |
| `admin_list_support(p_status=null, p_limit=200) -> jsonb` | owner, support, finance | tickets + pending refunds + pending invites |
| `admin_list_passes() -> jsonb`, `admin_revoke_pass(p_code)`, `admin_extend_pass(p_code, p_days)` | owner, support | metadata only |
| `admin_list_shares() -> jsonb`, `admin_revoke_share(p_share uuid)` | owner, support | no token in the reply |
| `admin_export_user(p_user uuid) -> jsonb` | owner | server-side data only; `note` says so |
| `admin_delete_user(p_user uuid, p_confirm_email text) -> jsonb` | owner | tombstone; refuses self and the last owner |

Every mutating RPC (and the export) calls `admin_audit_write`.

### Feature overrides: the one client change

`billing_status()` is deliberately **not** restated (it has been restated five
times; its shape is the client's contract). Overrides are served by
`effective_features()`, which starts from `billing_status() -> 'features'` and
applies `feature_overrides`: account > plan > global > the plan matrix (within a
scope the restrictive row wins). In `plan-gate.js`, read features as
`(await rpc('effective_features')) ?? billing.features`. Keys must exist as
booleans in some plan's `plans.features` (`sample_only` is refused). A plan-scope
override only touches users of that plan; `plans.features` is never edited, so
`npm run test:plans` is unaffected.

### Support queue status vocabulary

ticket: stored `open|waiting|closed`. refund request: pending -> open,
approved -> waiting; declined/refunded are done and not listed. invite request:
pending -> open; decided ones are not listed. So the `closed` filter lists
tickets only.

### Data-subject tools — decisions worth the owner's eye

- **Invoices are retained** on deletion (Bills of Supply are the seller's
  statutory record; `invoices` has no FK to the person). `payments` and refund
  rows cascade away with the sign-in. The reply says `invoices_retained: n`.
- The tombstone is `sha256(lower(email))` + date. A `BEFORE INSERT` trigger on
  `leads` skips a tombstoned address **silently** (like a repeat sign-up);
  `add_lead()` is not restated. A person can still sign in again with Google;
  only the leads list refuses them.
- Comments the person left on other people's films are kept and anonymised
  (`Deleted user`); share links they made are deleted; a team with other active
  members blocks the deletion until it is transferred or closed.
- The "last owner" refusal in `admin_delete_user` is defensive: the caller must
  be an owner and cannot target themselves, so another owner always exists.

### Banner and verify

`site_announcement_now()` is meant to be read once per session by `chrome.js`.
The banner is text in a row and is **not** in `baseline.json`: `npm run verify`
must run with `site_announcement` empty (it does; the table is new and empty).
