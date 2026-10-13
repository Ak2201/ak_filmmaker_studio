-- ============================================================
-- 44. SYNC HEALTH AND LIMIT PRESSURE (Admin console v2, plan §3.6)
--     RUN LIVE 13 Oct 2026. Standalone file; supabase-schema.sql is not edited.
-- ------------------------------------------------------------
-- Two read-only reports for the console's "Sync & storage" tab, and the
-- one tiny counter that lets the client say when a sync write was
-- refused.
--
--   sync_errors (day, scope, code, count)   DAILY COUNTERS, like events
--        and usage_daily: no user id, no e-mail, no project id, no
--        payload, no error text. `scope` and `code` are CHECKs against
--        fixed lists, so the table cannot carry anything a person wrote.
--   report_sync_error(scope, code)   authenticated; strict allow-lists
--        (an unknown value is counted as 'other', never stored as typed);
--        capped per user (30 an hour, P0429) and in total (20,000 a day,
--        past which a report is dropped silently).
--   admin_sync_overview()   accounts by last-sync age; project_data
--        bytes, total and the ten heaviest accounts; rows per scope; and
--        the scopes the project_data CHECK ALLOWS, read from
--        pg_constraint, so the console can diff them against the
--        client's own list. That diff is what would have flagged
--        section 37 (the live client syncing `write_goals` while the
--        database refused it) — code ahead of the database.
--   admin_limit_pressure()  accounts at or above 80% of a plan cap.
--
--   THERE IS NO "SEND UPGRADE NUDGE" FUNCTION. The owner decided on
--   12 Oct 2026 that nothing outbound is built for now; limit pressure
--   is a report an administrator reads. Do not add one here.
--
-- ONE DEPARTURE FROM THE PLAN'S WORDING, ON PURPOSE. The plan says
-- admin_limit_pressure() reads user_limits(). user_limits() answers '{}'
-- — no caps at all — while purchases_required() is false (section 32),
-- which is the state the studio is in until launch: the report would be
-- empty exactly when the owner needs it to decide how to launch. So it
-- reads each member's PLAN LIMITS (plans.limits for user_plan()) — what
-- they would meet once the switch is on — and says whether they are
-- being enforced right now in `enforced`.
--
-- STORAGE. The cap is accounts.storage_limit_mb on the member's best
-- account (default 500; section 6), converted to bytes, and the use is
-- the logical size of the project_data rows on films they own. NOTHING
-- ENFORCES THAT COLUMN today (no trigger reads it, user_limits() has no
-- storage key), so storage pressure is a heads-up and not a wall; the
-- console should say so.
--
--   44.1  sync_errors, the two allow-lists, a per-user rate table
--   44.2  report_sync_error()
--   44.3  admin_sync_overview()
--   44.4  admin_limit_pressure()
--   44.5  grants
--   44.6  CHECKS TO RUN
-- ============================================================

-- 44.1 TABLES AND ALLOW-LISTS -----------------------------------------
/** The scopes cloud.js can write — the project_data CHECK's names as of
 *  section 37 — plus 'other'. Edit with the CHECK when a scope is added;
 *  an unlisted scope is counted as 'other', which the console shows. */
create or replace function public.sync_error_scopes()
returns text[]
language sql
immutable
as $$
  select array['feature','short','library','feature_prefs','short_prefs','library_prefs','activity',
               'scenes','contacts','shots','script','locations','workbench','dissect','festivals',
               'scriptgen','songs','story','idea_vault','edit','deliverables','characters','costs',
               'write_goals','other']::text[];
$$;

/** The refusals a sync write meets: 23514 a CHECK (an unknown scope),
 *  42501 RLS or a grant, P0401 not a studio member, P0402 a plan limit,
 *  P0429 a rate limit, 23505 a conflict, 'network' the request never
 *  arrived, 'other' anything else. */
create or replace function public.sync_error_codes()
returns text[]
language sql
immutable
as $$
  select array['23514','42501','P0401','P0402','P0429','23505','PGRST202','network','other']::text[];
$$;

create table if not exists public.sync_errors (
  day    date   not null,
  scope  text   not null,
  code   text   not null,
  count  bigint not null default 0 check (count >= 0),
  primary key (day, scope, code),
  constraint sync_errors_scope_check check (scope = any (public.sync_error_scopes())),
  constraint sync_errors_code_check  check (code  = any (public.sync_error_codes()))
);
alter table public.sync_errors enable row level security;
revoke all on public.sync_errors from public, anon, authenticated;

/** Rate rows, kept 48 hours and swept by report_sync_error() itself.
 *  The only user id this section keeps; it holds a call count and no scope. */
create table if not exists public.sync_error_rate (
  user_id uuid        not null references auth.users(id) on delete cascade,
  hour    timestamptz not null,
  calls   int         not null default 0 check (calls >= 0),
  primary key (user_id, hour)
);
create index if not exists sync_error_rate_hour_idx on public.sync_error_rate (hour);
alter table public.sync_error_rate enable row level security;
revoke all on public.sync_error_rate from public, anon, authenticated;

-- 44.2 report_sync_error ------------------------------------------------
create or replace function public.report_sync_error(p_scope text, p_code text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid   uuid := auth.uid();
  s     text;
  c     text;
  n     int;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  s := case when p_scope = any (public.sync_error_scopes()) then p_scope else 'other' end;
  c := case when p_code  = any (public.sync_error_codes())  then p_code  else 'other' end;

  if random() < 0.02 then
    delete from public.sync_error_rate r where r.hour < now() - interval '48 hours';
  end if;
  insert into public.sync_error_rate as r (user_id, hour, calls)
       values (uid, date_trunc('hour', now()), 1)
  on conflict (user_id, hour) do update set calls = r.calls + 1
  returning r.calls into n;
  if n > 30 then
    raise exception 'Too many sync reports just now.' using errcode = 'P0429';
  end if;

  -- the whole table's daily ceiling: past it a report is dropped, because
  -- a counter that a flood can grow without bound is a free-text store
  -- by volume
  if coalesce((select sum(e.count) from public.sync_errors e where e.day = today), 0) >= 20000 then
    return;
  end if;
  insert into public.sync_errors as e (day, scope, code, count) values (today, s, c, 1)
  on conflict (day, scope, code) do update set count = e.count + 1;
end;
$fn$;

-- 44.3 admin_sync_overview ----------------------------------------------
/** Keys: observed_at, members, last_sync_buckets, project_data
 *  {rows, bytes, accounts_with_data}, top_accounts[10], per_scope[],
 *  allowed_scopes[] (from pg_constraint), scopes_in_use[],
 *  in_use_not_allowed[], reportable_scopes[], reportable_not_allowed[],
 *  errors {since, total, by_scope_code[], by_day[], on_scopes_not_allowed[]}.
 *  Bytes are the stored JSON's text length (octet_length(data::text)), a
 *  logical size and not the TOAST-compressed one. */
create or replace function public.admin_sync_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  v_buckets jsonb;
  v_pd      jsonb;
  v_top     jsonb;
  v_scope   jsonb;
  v_allowed text[];
  v_inuse   text[];
  v_report  text[] := public.sync_error_scopes();
  v_err     jsonb;
  v_members int;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;

  -- scopes the project_data CHECK allows, as written in the constraint
  select coalesce(array_agg(distinct q.s order by q.s), '{}') into v_allowed
    from (select (regexp_matches(pg_get_constraintdef(con.oid), '''([a-z_]+)''', 'g'))[1] as s
            from pg_constraint con
           where con.conrelid = to_regclass('public.project_data')
             and con.contype = 'c'
             and pg_get_constraintdef(con.oid) like '%scope%') q;

  select coalesce(array_agg(distinct pd.scope order by pd.scope), '{}') into v_inuse from public.project_data pd;

  with owner_data as (
    select pr.owner_id as user_id,
           count(distinct pr.id)                             as films,
           count(pd.project_id)                              as rows,
           coalesce(sum(octet_length(pd.data::text)), 0)     as bytes,
           max(pd.updated_at)                                as last_sync
      from public.projects pr
      left join public.project_data pd on pd.project_id = pr.id
     group by pr.owner_id
  ), mem as (
    select m.user_id, od.last_sync, od.rows, od.bytes, od.films
      from public.studio_members m
      left join owner_data od on od.user_id = m.user_id
     where m.disabled_at is null
  )
  select (select count(*) from mem),
         jsonb_build_object(
           'under_1d', count(*) filter (where last_sync > now() - interval '1 day'),
           'd1_to_7',  count(*) filter (where last_sync <= now() - interval '1 day'  and last_sync > now() - interval '7 days'),
           'd7_to_30', count(*) filter (where last_sync <= now() - interval '7 days' and last_sync > now() - interval '30 days'),
           'over_30d', count(*) filter (where last_sync <= now() - interval '30 days'),
           'never',    count(*) filter (where last_sync is null))
    into v_members, v_buckets
    from mem;

  select jsonb_build_object(
           'rows', (select count(*) from public.project_data),
           'bytes', (select coalesce(sum(octet_length(pd.data::text)), 0) from public.project_data pd),
           'accounts_with_data', (select count(distinct pr.owner_id) from public.project_data pd join public.projects pr on pr.id = pd.project_id))
    into v_pd;

  select coalesce(jsonb_agg(t.item order by t.bytes desc), '[]'::jsonb) into v_top
    from (select od.bytes,
                 jsonb_build_object('user_id', od.user_id,
                                    'email', (select u.email::text from auth.users u where u.id = od.user_id),
                                    'bytes', od.bytes, 'rows', od.rows, 'films', od.films, 'last_sync', od.last_sync) as item
            from (select pr.owner_id as user_id, count(distinct pr.id) films, count(pd.project_id) rows,
                         coalesce(sum(octet_length(pd.data::text)), 0) bytes, max(pd.updated_at) last_sync
                    from public.projects pr left join public.project_data pd on pd.project_id = pr.id
                   group by pr.owner_id) od
           order by od.bytes desc limit 10) t;

  select coalesce(jsonb_agg(jsonb_build_object('scope', s.scope, 'rows', s.rows, 'bytes', s.bytes, 'last_write', s.last_write)
                            order by s.bytes desc, s.scope), '[]'::jsonb) into v_scope
    from (select pd.scope, count(*) rows, sum(octet_length(pd.data::text)) bytes, max(pd.updated_at) last_write
            from public.project_data pd group by pd.scope) s;

  select jsonb_build_object(
           'since', (now() at time zone 'Asia/Kolkata')::date - 13,
           'total', coalesce((select sum(e.count) from public.sync_errors e where e.day >= (now() at time zone 'Asia/Kolkata')::date - 13), 0),
           'by_scope_code', (select coalesce(jsonb_agg(jsonb_build_object('scope', x.scope, 'code', x.code, 'count', x.c) order by x.c desc, x.scope, x.code), '[]'::jsonb)
                               from (select e.scope, e.code, sum(e.count) c from public.sync_errors e
                                      where e.day >= (now() at time zone 'Asia/Kolkata')::date - 13 group by e.scope, e.code) x),
           'by_day', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'count', x.c) order by x.day), '[]'::jsonb)
                        from (select e.day, sum(e.count) c from public.sync_errors e
                               where e.day >= (now() at time zone 'Asia/Kolkata')::date - 13 group by e.day) x),
           'on_scopes_not_allowed', (select coalesce(jsonb_agg(jsonb_build_object('scope', x.scope, 'count', x.c) order by x.c desc), '[]'::jsonb)
                                       from (select e.scope, sum(e.count) c from public.sync_errors e
                                              where e.day >= (now() at time zone 'Asia/Kolkata')::date - 13
                                                and e.scope <> 'other' and not (e.scope = any (v_allowed))
                                              group by e.scope) x))
    into v_err;

  return jsonb_build_object(
    'observed_at', now(),
    'members', v_members,
    'last_sync_buckets', v_buckets,
    'project_data', v_pd,
    'top_accounts', v_top,
    'per_scope', v_scope,
    'allowed_scopes', to_jsonb(v_allowed),
    'scopes_in_use', to_jsonb(v_inuse),
    'in_use_not_allowed', to_jsonb(coalesce((select array_agg(s order by s) from unnest(v_inuse) s where not (s = any (v_allowed))), '{}')),
    'reportable_scopes', to_jsonb(v_report),
    'reportable_not_allowed', to_jsonb(coalesce((select array_agg(s order by s) from unnest(v_report) s where s <> 'other' and not (s = any (v_allowed))), '{}')),
    'errors', v_err);
end;
$fn$;

-- 44.4 admin_limit_pressure ---------------------------------------------
/** Members at or above 80% of a numeric cap in their plan's limits (or of
 *  their account's storage_limit_mb, not enforced today), or
 *  over a cap of zero. Keys: observed_at, enforced, threshold_pct,
 *  count, accounts[] — each {user_id, email, plan, plan_name, max_pct,
 *  metrics[{key, used, cap, pct}]}, heaviest first, at most 200. A null
 *  cap is unlimited and never counts. See the header for why this reads
 *  plans.limits and not user_limits(). */
create or replace function public.admin_limit_pressure()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  v_rows jsonb;
  v_n    int;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;

  with base as (
    select m.user_id, public.user_plan(m.user_id) as plan_id
      from public.studio_members m where m.disabled_at is null
  ), lim as (
    select b.user_id, b.plan_id, p.name as plan_name, p.limits
      from base b join public.plans p on p.id = b.plan_id
  ), usage as (
    select l.*,
           (select count(*) from public.projects pr where pr.owner_id = l.user_id) as projects,
           (select count(*) from public.shares sh join public.projects pr on pr.id = sh.project_id
             where pr.owner_id = l.user_id and (sh.expires_at is null or sh.expires_at > now())) as shares,
           (select coalesce(max(c), 0) from (select count(*) c from public.project_collaborators pc
              join public.projects pr on pr.id = pc.project_id where pr.owner_id = l.user_id group by pc.project_id) t) as collaborators,
           (select count(*) from public.account_members am
             where am.account_id = (select a.id from public.accounts a where a.owner_id = l.user_id
                                     order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last limit 1)
               and am.status in ('pending', 'active')) as seats,
           (select coalesce(sum(octet_length(pd.data::text)), 0) from public.project_data pd
              join public.projects pr on pr.id = pd.project_id where pr.owner_id = l.user_id) as storage_bytes,
           (select a.storage_limit_mb::numeric * 1048576 from public.accounts a where a.owner_id = l.user_id
             order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last limit 1) as storage_cap_bytes
      from lim l
  ), metric as (
    select u.user_id, u.plan_id, u.plan_name, k.key, k.used::numeric as used, (u.limits ->> k.key)::numeric as cap
      from usage u
     cross join lateral (values ('projects', u.projects), ('shares', u.shares), ('collaborators', u.collaborators),
                                ('seats', u.seats)) k(key, used)
     where jsonb_typeof(u.limits -> k.key) = 'number'
    union all
    select u.user_id, u.plan_id, u.plan_name, 'storage_bytes', u.storage_bytes::numeric, u.storage_cap_bytes
      from usage u where u.storage_cap_bytes is not null
  ), pct as (
    select mt.*, case when mt.cap > 0 then round(mt.used / mt.cap * 100, 1)
                      when mt.used > 0 then 100 else 0 end as pct
      from metric mt
  ), per_user as (
    select p.user_id, p.plan_id, p.plan_name, max(p.pct) as max_pct,
           jsonb_agg(jsonb_build_object('key', p.key, 'used', p.used, 'cap', p.cap, 'pct', p.pct) order by p.pct desc, p.key) as metrics
      from pct p group by p.user_id, p.plan_id, p.plan_name
    having max(p.pct) >= 80
  )
  select (select count(*) from per_user),
         coalesce(jsonb_agg(jsonb_build_object(
                    'user_id', x.user_id,
                    'email', (select u.email::text from auth.users u where u.id = x.user_id),
                    'plan', x.plan_id, 'plan_name', x.plan_name,
                    'max_pct', x.max_pct, 'metrics', x.metrics) order by x.max_pct desc, x.user_id), '[]'::jsonb)
    into v_n, v_rows
    from (select * from per_user order by max_pct desc, user_id limit 200) x;

  return jsonb_build_object(
    'observed_at', now(),
    'enforced', public.purchases_required(),
    'threshold_pct', 80,
    'count', v_n,
    'accounts', v_rows);
end;
$fn$;

-- 44.5 GRANTS -----------------------------------------------------------
revoke execute on function public.sync_error_scopes()               from public, anon;
revoke execute on function public.sync_error_codes()                from public, anon;
revoke execute on function public.report_sync_error(text, text)     from public, anon;
revoke execute on function public.admin_sync_overview()             from public, anon;
revoke execute on function public.admin_limit_pressure()            from public, anon;
grant  execute on function public.sync_error_scopes()               to authenticated;
grant  execute on function public.sync_error_codes()                to authenticated;
grant  execute on function public.report_sync_error(text, text)     to authenticated;
grant  execute on function public.admin_sync_overview()             to authenticated;
grant  execute on function public.admin_limit_pressure()            to authenticated;

notify pgrst, 'reload schema';

-- 44.6 CHECKS TO RUN ------------------------------------------------------
--  1. anon: report_sync_error -> 42501 (no grant). Direct select or
--     insert on sync_errors as authenticated or anon -> 42501.
--  2. a signed-in user: report_sync_error('script', '23514') -> one row,
--     count 1; again -> count 2. An unknown scope or code is stored as
--     'other'; nothing the caller typed reaches the table.
--  3. the 31st report in an hour -> P0429, and the count stays at 30.
--  4. anon / non-admin: admin_sync_overview(), admin_limit_pressure()
--     -> 42501.
--  5. admin_sync_overview(): allowed_scopes equals the scope names in
--     pg_get_constraintdef of project_data's CHECK; in a rolled-back
--     transaction that drops 'write_goals' from the CHECK,
--     reportable_not_allowed lists it.
--  6. admin_limit_pressure(): a member at 3 of 3 projects on a plan
--     whose limit is 3 appears at 100; one at 2 of 3 does not; a null
--     cap never appears; `enforced` equals purchases_required().
--  7. re-running the section is a no-op.
-- Read-back after the owner runs it:
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'sync_errors_scope_check';
--   select admin_sync_overview() -> 'allowed_scopes';   -- as an admin
-- Test file: scripts/schema-tests/sync-limits.sql (npm run test:schema).
-- ============================================================
