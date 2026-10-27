-- ============================================================
-- CLEAN SLATE BEFORE LAUNCH — purge every test account and test row
-- (owner, 27 Oct 2026). NOT a numbered section: it runs ONCE, on the
-- live project, and never again.
-- ------------------------------------------------------------
-- The app never launched, so every account in the live database is a
-- test account. This keeps exactly ONE person — the admin
-- arunkumarmohanans@gmail.com, "the keeper" — and removes everything else:
--
--   * every other sign-in (auth.users) and ALL of its work: projects
--     (project_data, comments, collaborators and shares go with them),
--     accounts and team seats, studio membership, console roles, device
--     locks;
--   * for EVERYBODY, the keeper included: payments, refunds, refund
--     requests, invoices, invoice buyer details, the invoice counters,
--     referral credits, e-mail grants, and (§62, when it has run)
--     subscriptions and the rzp_plans cache — so the keeper ends with NO
--     plan and no trial;
--   * the funnel counts (events), usage and sync-error telemetry, leads,
--     invite codes (their tickets and redemptions), promo codes, the
--     invite-request queue, testimonials, support tickets and their
--     notes, the console's notes on people, the §47 deletion tombstones,
--     and the admin audit log.
--
-- DELETED, NOT ANONYMISED. §47's admin_delete_user() keeps a deleted
-- buyer's invoice (anonymised) because a real invoice is a tax record.
-- These were TEST-MODE payments: no money moved, no supply was made, so
-- none of them is a Bill of Supply anybody may rely on. That is the only
-- reason it is right to delete them, and to empty invoice_counters so the
-- first REAL invoice is FMS/<fy>/000001. Rule 46 (CGST Rules) wants
-- invoice serial numbers consecutive and unique per financial year, which
-- is what §28's counter keeps gapless — restarting it is lawful ONLY
-- because no invoice it numbered was ever a real one. Never run this, or
-- anything like it, once a live payment exists.
--
-- NOT TOUCHED: plans, plan_prices, billing_settings, site_announcement,
-- feature_overrides (except an 'account'-scoped override naming an
-- account this deletes), every function, policy and trigger definition.
-- The `updated_by` / `set_by` columns on those rows are ON DELETE SET
-- NULL, so a row last edited by a deleted tester loses that pointer and
-- nothing else. The keeper's own projects are KEPT; on them, a comment by
-- anybody else (and the replies under it) goes, a share made by anybody
-- else goes, and project_data.updated_by is cleared where it named
-- somebody else (that column has no ON DELETE action and would refuse
-- the delete). Outside the database nothing is touched: each tester's
-- browser localStorage and any Drive backup file in their own Drive stay
-- where they are.
--
-- IRREVERSIBLE. TAKE A BACKUP FIRST (dashboard → Database → Backups).
--
-- RUN ORDER: after §61 (the week pass). It works before or after §62
-- (auto-renew): §62's subscriptions and rzp_plans are emptied when they
-- exist and skipped when they do not. Every table from §58 onward is
-- guarded with to_regclass the same way. Any OTHER public table the
-- script does not know makes the PREVIEW say so and the PURGE refuse —
-- a table nobody classified is exactly the one a purge gets wrong.
--
-- THREE PARTS, each runnable on its own, each between its own markers:
--   PART 1  PREVIEW   read-only; one result: the keeper, then a row
--                     count per table of what PART 2 would delete
--   PART 2  PURGE     one transaction; refuses unless exactly one
--                     keeper exists and current_user is postgres (the
--                     SQL editor); checks its own result before COMMIT
--   PART 3  READ-BACK read-only; one result: each check, expected,
--                     actual, ok
-- Run 1, read it; run 2; run 3 and expect every ok = true.
--
-- THE PASTE RULE (CLAUDE.md, "PASTING SQL THROUGH THE CLIPBOARD
-- CORRUPTS IT"): never paste this as text. Base64 the part, decode it
-- in the page, set the editor's model, and compare its SHA-256 with the
-- part's before pressing Run. Each part is extracted byte-exact with:
--   awk '/^-- @@ PART 2 BEGIN/,/^-- @@ PART 2 END/' \
--     supabase/schema/patches/purge-test-data-2026-10-27.sql | shasum -a 256
-- (the checksums are in docs/LIVE-STEPS-2026-10-27.md §0). The test
-- (scripts/schema-tests/purge.sql, under npm run test:schema) runs PART 2
-- extracted with that same awk line, so what is tested is this file.
-- ============================================================

-- @@ PART 1 BEGIN — PREVIEW (read-only)
with k as (
  select count(*) as n,
         case when count(*) = 1 then min(u.id::text) end as id
    from auth.users u
   where lower(u.email) = 'arunkumarmohanans@gmail.com'
),
known(tbl) as (values
  -- emptied for everybody
  ('refunds'), ('refund_requests'), ('referral_credits'), ('invoice_buyer_details'), ('invoices'),
  ('invoice_counters'), ('payments'), ('subscriptions'), ('rzp_plans'), ('email_grants'), ('events'),
  ('leads'), ('invite_redemptions'), ('invite_tickets'), ('invite_codes'), ('promo_codes'),
  ('invite_requests'), ('testimonials'), ('admin_audit'), ('admin_notes'), ('support_ticket_notes'),
  ('support_tickets'), ('usage_daily'), ('usage_rate'), ('sync_errors'), ('sync_error_rate'),
  ('deleted_subjects'),
  -- the keeper's rows stay
  ('projects'), ('project_data'), ('project_collaborators'), ('shares'), ('comments'), ('accounts'),
  ('account_members'), ('studio_members'), ('admin_roles'), ('user_active_sessions'),
  -- configuration, not touched
  ('plans'), ('plan_prices'), ('billing_settings'), ('site_announcement'), ('feature_overrides')
),
unknown as (
  select string_agg(c.relname, ', ' order by c.relname) as names, count(*) as n
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p')
     and c.relname not in (select tbl from known)
),
-- what PART 2 deletes, as a WHERE clause per table; $K is the keeper's id
plan(ord, tbl, what, cond) as (values
  (10, 'auth.users',            'sign-ins other than the keeper',                    'id <> $K'),
  (11, 'projects',              'films owned by somebody else',                      'owner_id <> $K'),
  (12, 'project_data',          'data of those films',                               'project_id in (select id from public.projects where owner_id <> $K)'),
  (13, 'project_data',          '(kept) keeper film rows whose updated_by is cleared','updated_by <> $K and project_id in (select id from public.projects where owner_id = $K)'),
  (14, 'project_collaborators', 'collaborator rows',                                 'user_id <> $K or project_id in (select id from public.projects where owner_id <> $K)'),
  (15, 'shares',                'share links',                                       'created_by <> $K or project_id in (select id from public.projects where owner_id <> $K)'),
  (16, 'comments',              'comments (plus replies under them)',                'author_id is distinct from $K or project_id in (select id from public.projects where owner_id <> $K)'),
  (17, 'accounts',              'accounts owned by somebody else',                   'owner_id <> $K'),
  (18, 'account_members',       'team seats other than the keeper''s own',           'user_id is distinct from $K or account_id in (select id from public.accounts where owner_id <> $K)'),
  (19, 'studio_members',        'studio members other than the keeper',              'user_id <> $K'),
  (20, 'admin_roles',           'console roles other than the keeper',               'user_id <> $K'),
  (21, 'user_active_sessions',  'device locks other than the keeper',                'user_id <> $K'),
  (22, 'feature_overrides',     'account overrides naming a deleted account',        'scope = ''account'' and scope_id not in (select id::text from public.accounts where owner_id = $K)'),
  (30, 'payments',              'ALL payments (the keeper''s too)',                  'true'),
  (31, 'refunds',               'ALL refunds',                                       'true'),
  (32, 'refund_requests',       'ALL refund requests',                               'true'),
  (33, 'invoices',              'ALL invoices',                                      'true'),
  (34, 'invoice_buyer_details', 'ALL invoice buyer details',                         'true'),
  (35, 'invoice_counters',      'ALL invoice counters (numbering restarts at 1)',    'true'),
  (36, 'referral_credits',      'ALL referral credits',                              'true'),
  (37, 'email_grants',          'ALL e-mail grants',                                 'true'),
  (38, 'subscriptions',         'ALL subscriptions (§62; null = not run)',           'true'),
  (39, 'rzp_plans',             'ALL cached Razorpay plans (§62; null = not run)',   'true'),
  (40, 'events',                'ALL funnel counts',                                 'true'),
  (41, 'leads',                 'ALL leads',                                         'true'),
  (42, 'invite_codes',          'ALL invite codes',                                  'true'),
  (43, 'invite_tickets',        'ALL invite tickets',                                'true'),
  (44, 'invite_redemptions',    'ALL invite redemptions',                            'true'),
  (45, 'promo_codes',           'ALL promo codes',                                   'true'),
  (46, 'invite_requests',       'ALL invite requests',                               'true'),
  (47, 'testimonials',          'ALL testimonials (§59; null = not run)',            'true'),
  (48, 'admin_audit',           'ALL of the admin audit log',                        'true'),
  (49, 'admin_notes',           'ALL console notes on people',                       'true'),
  (50, 'support_tickets',       'ALL support tickets',                               'true'),
  (51, 'support_ticket_notes',  'ALL support ticket notes',                          'true'),
  (52, 'usage_daily',           'ALL usage counts',                                  'true'),
  (53, 'usage_rate',            'ALL usage rate rows',                               'true'),
  (54, 'sync_errors',           'ALL sync-error counts',                             'true'),
  (55, 'sync_error_rate',       'ALL sync-error rate rows',                          'true'),
  (56, 'deleted_subjects',      'ALL §47 deletion tombstones',                       'true')
)
select 0 as ord, '(keeper)' as tbl,
       'auth.users rows with the keeper''s e-mail: MUST be 1, or PART 2 refuses' as what,
       k.n as rows
  from k
union all
select 1, '(keeper)', 'keeper id: ' || coalesce(k.id, 'NONE'), null from k
union all
select 2, '(unknown tables)',
       'public tables this script does not classify: MUST be 0, or PART 2 refuses'
         || coalesce(' — ' || u.names, ''),
       u.n
  from unknown u
union all
select p.ord, p.tbl, p.what,
       case when k.id is null then null
            when to_regclass(case when p.tbl like '%.%' then p.tbl else 'public.' || p.tbl end) is null then null
            else (xpath('/row/n/text()', query_to_xml(
                    format('select count(*) as n from %s where %s',
                           case when p.tbl like '%.%' then p.tbl else 'public.' || p.tbl end,
                           replace(p.cond, '$K', quote_literal(k.id) || '::uuid')),
                    false, true, '')))[1]::text::bigint
       end
  from plan p, k
 order by ord;
-- @@ PART 1 END

-- @@ PART 2 BEGIN — PURGE (one transaction; irreversible once committed)
begin;
do $purge$
declare
  keeper   uuid;
  n        bigint;
  t        text;
  pass     int;
  stuck    text[];
  unknown  text;
  free_seats int;
  -- emptied for everybody, in an order the foreign keys accept; the loop
  -- below retries anything a key still holds back (§62's columns, say),
  -- so a table added later cannot make the order wrong
  empty_tables text[] := array[
    'refunds', 'refund_requests', 'referral_credits', 'invoice_buyer_details', 'invoices',
    'invoice_counters', 'payments', 'subscriptions', 'rzp_plans', 'email_grants', 'events',
    'leads', 'invite_redemptions', 'invite_tickets', 'invite_codes', 'promo_codes',
    'invite_requests', 'testimonials', 'admin_audit', 'admin_notes', 'support_ticket_notes',
    'support_tickets', 'usage_daily', 'usage_rate', 'sync_errors', 'sync_error_rate',
    'deleted_subjects'];
  keep_tables text[] := array[
    'projects', 'project_data', 'project_collaborators', 'shares', 'comments', 'accounts',
    'account_members', 'studio_members', 'admin_roles', 'user_active_sessions',
    'plans', 'plan_prices', 'billing_settings', 'site_announcement', 'feature_overrides'];
  -- GUARD TRIGGERS STOOD DOWN for this transaction only. ALTER TABLE is
  -- transactional: an error anywhere rolls the DISABLE back with
  -- everything else, and the ENABLE below runs before COMMIT.
  --   admin_audit_no_change   the log is append-only by design; emptying a
  --                           test log is the one deliberate exception
  --   account_members_guard   refuses to remove an 'owner' seat unless
  --                           auth.uid() owns the account, and auth.uid()
  --                           is null in the SQL editor
  --   comments_guard_delete   refuses to delete a comment with replies
  --                           unless auth.uid() owns the project (null here)
  -- Nothing else needs it: admin_roles_keep_an_owner is satisfied because
  -- the keeper is made owner FIRST, accounts_guard and projects_guard_owner
  -- let the postgres role through (is_privileged_caller), and the other
  -- triggers fire on INSERT/UPDATE only.
  guards text[][] := array[
    array['admin_audit', 'admin_audit_no_change'],
    array['account_members', 'account_members_guard'],
    array['comments', 'comments_guard_delete']];
  g text[];
begin
  if current_user <> 'postgres' then
    raise exception 'PURGE refused: run it in the Supabase SQL editor as postgres (current_user is %)', current_user;
  end if;
  select count(*) into n from auth.users u where lower(u.email) = 'arunkumarmohanans@gmail.com';
  if n <> 1 then
    raise exception 'PURGE refused: % auth.users rows have the keeper''s e-mail, want exactly 1', n;
  end if;
  select u.id into keeper from auth.users u where lower(u.email) = 'arunkumarmohanans@gmail.com';

  select string_agg(c.relname, ', ' order by c.relname) into unknown
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p')
     and not (c.relname = any (empty_tables || keep_tables));
  if unknown is not null then
    raise exception 'PURGE refused: public tables this script does not classify: % — review them and add each to a list first', unknown;
  end if;

  foreach g slice 1 in array guards loop
    if exists (select 1 from pg_trigger where tgrelid = to_regclass('public.' || g[1]) and tgname = g[2]) then
      execute format('alter table public.%I disable trigger %I', g[1], g[2]);
    end if;
  end loop;

  -- 1. the keeper is the owner BEFORE any other owner goes (keep_an_owner)
  insert into public.admin_roles (user_id, role) values (keeper, 'owner')
    on conflict (user_id) do update set role = 'owner';
  delete from public.admin_roles where user_id <> keeper;

  -- 2. the keeper is an admin studio member, enabled, with no trial
  insert into public.studio_members (user_id, role) values (keeper, 'admin')
    on conflict (user_id) do update
      set role = 'admin', disabled_at = null, invite_code_id = null,
          trial_started_at = null, trial_minutes = null, trial_source = null, trial_scope = null;
  delete from public.studio_members where user_id <> keeper;

  -- 3. everything emptied for everybody
  for pass in 1 .. 6 loop
    stuck := '{}';
    foreach t in array empty_tables loop
      continue when to_regclass('public.' || t) is null;
      begin
        execute format('delete from public.%I', t);
      exception when foreign_key_violation then
        stuck := stuck || t;
      end;
    end loop;
    exit when cardinality(stuck) = 0;
  end loop;
  if cardinality(stuck) > 0 then
    raise exception 'PURGE refused: a foreign key still holds rows in %', stuck;
  end if;

  -- 4. other people's work, including what they left on the keeper's films
  delete from public.comments
   where author_id is distinct from keeper
      or project_id in (select id from public.projects where owner_id <> keeper);
  delete from public.shares
   where created_by <> keeper
      or project_id in (select id from public.projects where owner_id <> keeper);
  delete from public.project_collaborators
   where user_id <> keeper
      or project_id in (select id from public.projects where owner_id <> keeper);
  delete from public.projects where owner_id <> keeper;   -- project_data, comments, shares cascade
  -- project_data.updated_by has no ON DELETE action; project_data_stamp
  -- writes auth.uid() (null here) on UPDATE, which is the value wanted
  update public.project_data set updated_by = null where updated_by <> keeper;

  -- 5. accounts and seats (accounts.owner_id is ON DELETE RESTRICT, so
  -- other people's accounts go before their sign-ins)
  delete from public.accounts where owner_id <> keeper;   -- their seats cascade
  delete from public.account_members where user_id is distinct from keeper;
  update public.account_members set invited_by = null where invited_by <> keeper;
  delete from public.feature_overrides
   where scope = 'account'
     and scope_id not in (select id::text from public.accounts where owner_id = keeper);
  delete from public.user_active_sessions where user_id <> keeper;

  -- 6. the keeper's accounts carry no plan (seats back to the free cap,
  -- as a lapse leaves them — §61's mark_payment_refunded)
  free_seats := greatest(1, coalesce(public.plan_cap((select p.limits from public.plans p where p.id = 'free'), 'seats'), 1000));
  perform set_config('fms.billing', 'on', true);
  update public.accounts
     set plan = 'free', plan_until = null, plan_period = null,
         seat_limit = least(seat_limit, free_seats), updated_at = now()
   where owner_id = keeper;

  -- 7. the sign-ins last. On Supabase auth.identities, auth.sessions (and
  -- the refresh tokens under them), auth.mfa_factors and
  -- auth.one_time_tokens cascade from auth.users; every public column
  -- that points at a user is CASCADE or SET NULL, or was cleared above.
  delete from auth.users where id <> keeper;

  foreach g slice 1 in array guards loop
    if exists (select 1 from pg_trigger where tgrelid = to_regclass('public.' || g[1]) and tgname = g[2]) then
      execute format('alter table public.%I enable trigger %I', g[1], g[2]);
    end if;
  end loop;

  -- 8. check the result BEFORE commit: any surprise rolls all of it back
  select count(*) into n from auth.users;
  if n <> 1 or not exists (select 1 from auth.users where id = keeper) then
    raise exception 'PURGE check failed: % sign-ins left', n;
  end if;
  if (select count(*) from public.admin_roles) <> 1
     or not exists (select 1 from public.admin_roles where user_id = keeper and role = 'owner') then
    raise exception 'PURGE check failed: admin_roles is not exactly the keeper as owner';
  end if;
  if (select count(*) from public.studio_members) <> 1
     or not exists (select 1 from public.studio_members where user_id = keeper and role = 'admin' and disabled_at is null) then
    raise exception 'PURGE check failed: studio_members is not exactly the keeper as admin';
  end if;
  foreach t in array empty_tables loop
    continue when to_regclass('public.' || t) is null;
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'PURGE check failed: % still holds % row(s)', t, n; end if;
  end loop;
  if exists (select 1 from public.accounts where plan <> 'free' or plan_until is not null) then
    raise exception 'PURGE check failed: an account still carries a plan';
  end if;
  if public.price_notice() is null then
    raise exception 'PURGE check failed: price_notice() no longer answers';
  end if;
  raise notice 'PURGE done: one sign-in (%), no payments, no invoices, no test data', keeper;
end
$purge$;
commit;
-- @@ PART 2 END

-- @@ PART 3 BEGIN — READ-BACK (read-only)
with k as (select u.id from auth.users u where lower(u.email) = 'arunkumarmohanans@gmail.com'),
emptied(tbl) as (values
  ('payments'), ('refunds'), ('refund_requests'), ('invoices'), ('invoice_buyer_details'),
  ('invoice_counters'), ('referral_credits'), ('email_grants'), ('subscriptions'), ('rzp_plans'),
  ('events'), ('leads'), ('invite_codes'), ('invite_tickets'), ('invite_redemptions'),
  ('promo_codes'), ('invite_requests'), ('testimonials'), ('admin_audit'), ('admin_notes'),
  ('support_tickets'), ('support_ticket_notes'), ('usage_daily'), ('usage_rate'),
  ('sync_errors'), ('sync_error_rate'), ('deleted_subjects')
),
checks(ord, what, expected, actual) as (
  select 1, 'auth.users rows', '1', (select count(*) from auth.users)::text
  union all
  select 2, 'the one sign-in is the keeper', 'true',
         ((select count(*) from auth.users u where u.id in (select id from k)) = 1)::text
  union all
  select 3, 'admin_roles: exactly the keeper, as owner', 'true',
         ((select count(*) from public.admin_roles) = 1
          and exists (select 1 from public.admin_roles r where r.user_id in (select id from k) and r.role = 'owner'))::text
  union all
  select 4, 'studio_members: exactly the keeper, admin, enabled', 'true',
         ((select count(*) from public.studio_members) = 1
          and exists (select 1 from public.studio_members m where m.user_id in (select id from k)
                         and m.role = 'admin' and m.disabled_at is null))::text
  union all
  select 5, 'accounts on a plan', '0',
         (select count(*) from public.accounts a where a.plan <> 'free' or a.plan_until is not null)::text
  union all
  select 6, 'projects owned by anybody but the keeper', '0',
         (select count(*) from public.projects p where p.owner_id not in (select id from k))::text
  union all
  select 10 + row_number() over (order by e.tbl), e.tbl || ' rows', case when to_regclass('public.' || e.tbl) is null then 'n/a' else '0' end,
         case when to_regclass('public.' || e.tbl) is null then 'n/a'
              else (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', e.tbl), false, true, '')))[1]::text end
    from emptied e
  union all
  select 90, 'price_notice() still answers', 'true', (public.price_notice() is not null)::text
)
select what, expected, actual, expected = actual as ok from checks order by ord;
-- @@ PART 3 END
