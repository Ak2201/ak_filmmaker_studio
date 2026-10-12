-- ============================================================
-- 43. USAGE COUNTERS AND COHORTS (Admin console v2, plan §3.4 and §3.5)
--     NOT RUN LIVE. Standalone file; supabase-schema.sql is not edited.
-- ------------------------------------------------------------
-- The owner's decision, 12 Oct 2026: usage analytics are YES — counts
-- only, a fixed name list, an opt-out in Settings, and privacy.html
-- updated in the commit that ships the client half. This is the
-- database half.
--
--   usage_daily  (day, name, plan, count)   DAILY COUNTERS. No user id,
--                no e-mail, no IP, no session, and — the rule that
--                matters — NO CONTENT COLUMN OF ANY KIND: nothing a
--                person wrote, named, imported or asked an AI can reach
--                this table, because the only column that carries
--                anything but a number is `name`, and `name` is a CHECK
--                against a fixed list. A counter cannot say who or what.
--
--   usage_names()  the list. module_open:<id> for every module id in
--                src/data/navigation.json, plus script_import,
--                export_pdf, export_docx, ai_call, drive_connect,
--                limit_hit, share_created, screening_pass_used. GENERATED
--                by scripts/make-usage-names-sql.mjs, and
--                `npm run test:usage-names` fails when it drifts. The
--                CHECK calls the function, so adding a module is a
--                `create or replace` and not a constraint rewrite — and
--                a counter row already written is never invalidated by
--                a module later leaving the list.
--
--   bump_usage(text[])   authenticated. Validates every name against the
--                list and IGNORES the unknown, takes at most the first 50
--                names of a call, and rate-limits per user (60 calls an
--                hour, P0429 beyond). A duplicate name counts twice —
--                the client batches ("opened Breakdown three times") and
--                sends one call on pagehide.
--
--   THE ONE PLACE A USER ID IS KEPT, AND HOW LONG. The rate limit has to
--   know who called, so `usage_rate (user_id, hour, calls)` exists, and
--   it is deleted after 48 hours (swept by bump_usage itself). It holds
--   no name and no count of anything but calls. It is also the only
--   source for "people who flushed a batch in the last day or two" — so
--   admin_usage() reports active users over 24 and 48 hours and CANNOT
--   report a weekly figure: weekly would need a user id kept for a week,
--   which is exactly what a counter table avoids. privacy.html says the
--   same in words.
--
--   admin_usage(p_days)    per-module opens by day, feature adoption by
--                plan, dead modules (no open in 14 days), limit hits.
--   admin_cohorts(p_weeks) signup -> trial -> active in trial -> checkout
--                -> paid -> refunded, by signup week, by source and by
--                attribution. Derived live from studio_members,
--                payments, refunds, invite_redemptions and promo_codes;
--                nothing is stored.
--
-- WHAT THE COHORT STAGES MEAN (each is a COUNT OF PEOPLE WHO REACHED THE
-- STAGE, independently; none is forced to imply the one before, so a
-- buyer who never held a trial is still counted as paid):
--   signed_up        a non-anonymous auth user created in the window
--   members          has a studio_members row (passed the gate)
--   trial_started    trial_started_at set and trial_source not 'admin'
--                    ('admin' is the section 30 grandfather backfill and
--                    console grants, not somebody pressing start)
--   active_in_trial  trial_started and a project_data row on a film they
--                    own was written inside the trial window. LOCAL-FIRST
--                    CAVEAT: work that never synced is invisible here, so
--                    this undercounts anybody without cloud sync.
--   checkout_started has a payments row that is not a console grant
--   paid             a payment 'paid' or since 'refunded'
--   refunded         a payment 'refunded', or a processed refunds row
-- SOURCE is how they came in: 'code' (a standard invite code redeemed, or
-- trial_source 'code'), else the trial_source ('signup' | 'admin' |
-- 'refund'), else 'none'. ATTRIBUTION is the kind of promo code on their
-- first paid payment ('promo' | 'referral' | 'affiliate' | 'gift'), else
-- 'none'.
--
--   43.1  usage_names()                (generated block)
--   43.2  tables: usage_daily, usage_rate
--   43.3  bump_usage()
--   43.4  admin_usage()
--   43.5  cohort_rows() (internal), admin_cohorts()
--   43.6  grants
--   43.7  CHECKS TO RUN
-- ============================================================

-- 43.1 THE LIST ------------------------------------------------------
-- BEGIN GENERATED: usage names (scripts/make-usage-names-sql.mjs, from src/data/navigation.json)
-- Do not edit by hand: change navigation.json, run
-- `node scripts/make-usage-names-sql.mjs --write`, commit both.
-- `npm run test:usage-names` fails when this text is not what the script prints.
create or replace function public.usage_names()
returns text[]
language sql
immutable
as $names$
  select array[
    'module_open:case-studies',
    'module_open:dissection',
    'module_open:glossary',
    'module_open:story-beats',
    'module_open:idea-vault',
    'module_open:pitch-deck',
    'module_open:screenplay',
    'module_open:revisions',
    'module_open:import-script',
    'module_open:script-breakdown',
    'module_open:breakdowns',
    'module_open:elements',
    'module_open:scene-list',
    'module_open:screen-time',
    'module_open:docs',
    'module_open:auto-tag',
    'module_open:cast-matrix',
    'module_open:shot-list',
    'module_open:storyboard',
    'module_open:lookbook',
    'module_open:media',
    'module_open:budget',
    'module_open:contacts',
    'module_open:stripboard',
    'module_open:songs',
    'module_open:calendar',
    'module_open:locations',
    'module_open:dood',
    'module_open:sides',
    'module_open:reports',
    'module_open:shoot-day',
    'module_open:call-sheets',
    'module_open:edit-log',
    'module_open:deliverables',
    'script_import',
    'export_pdf',
    'export_docx',
    'ai_call',
    'drive_connect',
    'limit_hit',
    'share_created',
    'screening_pass_used'
  ]::text[];
$names$;
-- END GENERATED: usage names

-- 43.2 TABLES ---------------------------------------------------------
create table if not exists public.usage_daily (
  day    date   not null,
  name   text   not null,
  plan   text   not null,
  count  bigint not null default 0 check (count >= 0),
  primary key (day, name, plan),
  constraint usage_daily_name_check check (name = any (public.usage_names())),
  constraint usage_daily_plan_check check (plan in ('free', 'starter', 'indie', 'pro'))
);
alter table public.usage_daily enable row level security;
revoke all on public.usage_daily from public, anon, authenticated;
-- no policies: RLS on, no grants. bump_usage() writes; admin_usage() reads.

create table if not exists public.usage_rate (
  user_id uuid        not null references auth.users(id) on delete cascade,
  hour    timestamptz not null,
  calls   int         not null default 0 check (calls >= 0),
  primary key (user_id, hour)
);
create index if not exists usage_rate_hour_idx on public.usage_rate (hour);
alter table public.usage_rate enable row level security;
revoke all on public.usage_rate from public, anon, authenticated;

-- 43.3 bump_usage -----------------------------------------------------
/** Authenticated. Returns how many names were counted. A caller who is
 *  not an enabled studio member counts nothing (and is not an error: the
 *  client never learns whether it was counted). */
create or replace function public.bump_usage(p_names text[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid   uuid := auth.uid();
  pl    text;
  n     int;
  done  int := 0;
  today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_names is null or cardinality(p_names) = 0 then return 0; end if;
  if not exists (select 1 from public.studio_members m where m.user_id = uid and m.disabled_at is null) then
    return 0;
  end if;

  -- the rate limit. A raise rolls the increment back, so a flood stays at
  -- the cap instead of growing.
  if random() < 0.02 then
    delete from public.usage_rate r where r.hour < now() - interval '48 hours';
  end if;
  insert into public.usage_rate as r (user_id, hour, calls)
       values (uid, date_trunc('hour', now()), 1)
  on conflict (user_id, hour) do update set calls = r.calls + 1
  returning r.calls into n;
  if n > 60 then
    raise exception 'Too many usage reports just now.' using errcode = 'P0429';
  end if;

  pl := public.user_plan(uid);
  if pl is null or pl not in ('free', 'starter', 'indie', 'pro') then pl := 'free'; end if;

  with picked as (
    select x as name, count(*)::bigint as c
      from unnest(p_names[1:50]) x
     where x = any (public.usage_names())
     group by x
  ), up as (
    insert into public.usage_daily as d (day, name, plan, count)
    select today, p.name, pl, p.c from picked p
    on conflict (day, name, plan) do update set count = d.count + excluded.count
    returning 1
  )
  select coalesce((select sum(c) from picked), 0)::int into done;
  return done;
end;
$fn$;

-- 43.4 admin_usage ----------------------------------------------------
/** Keys: since, until, days[], tracking_began, modules[], features[],
 *  dead_modules[], daily_total[], active_users. All figures are counters
 *  (bump_usage) except active_users, which is read from the 48-hour rate
 *  rows and says so. Days are Asia/Kolkata, like the funnel's. */
create or replace function public.admin_usage(p_days int default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  d      int  := least(greatest(coalesce(p_days, 30), 1), 365);
  today  date := (now() at time zone 'Asia/Kolkata')::date;
  since  date;
  v_days jsonb;
  v_mods jsonb;
  v_feat jsonb;
  v_dead jsonb;
  v_tot  jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  since := today - (d - 1);

  select jsonb_agg(to_char(g, 'YYYY-MM-DD') order by g) into v_days
    from generate_series(since, today, interval '1 day') g;

  -- every module in the list, zero-filled: a module with no rows is the
  -- finding, so it must appear
  select coalesce(jsonb_agg(m.item order by m.opens desc, m.name), '[]'::jsonb) into v_mods
  from (
    select n.name,
           coalesce(w.opens, 0) as opens,
           jsonb_build_object(
             'name', n.name,
             'id', substr(n.name, length('module_open:') + 1),
             'opens', coalesce(w.opens, 0),
             'opens_14d', coalesce(r.opens, 0),
             'last_opened', l.last_day,
             'by_plan', coalesce(bp.by_plan, '{}'::jsonb),
             'by_day', (select jsonb_agg(coalesce(x.c, 0) order by g)
                          from generate_series(since, today, interval '1 day') g
                          left join (select u.day, sum(u.count) c from public.usage_daily u
                                      where u.name = n.name and u.day >= since group by u.day) x on x.day = g::date)
           ) as item
      from unnest(public.usage_names()) n(name)
      left join (select u.name, sum(u.count) opens from public.usage_daily u where u.day >= since group by u.name) w on w.name = n.name
      left join (select u.name, sum(u.count) opens from public.usage_daily u where u.day >= today - 13 group by u.name) r on r.name = n.name
      left join (select u.name, max(u.day) last_day from public.usage_daily u where u.count > 0 group by u.name) l on l.name = n.name
      left join (select q.name, jsonb_object_agg(q.plan, q.c) by_plan
                   from (select u.name, u.plan, sum(u.count) c from public.usage_daily u where u.day >= since group by u.name, u.plan) q
                  group by q.name) bp on bp.name = n.name
     where n.name like 'module_open:%'
  ) m;

  select coalesce(jsonb_agg(f.item order by f.name), '[]'::jsonb) into v_feat
  from (
    select n.name,
           jsonb_build_object(
             'name', n.name,
             'total', coalesce(w.total, 0),
             'by_plan', coalesce(bp.by_plan, '{}'::jsonb),
             'by_day', (select jsonb_agg(coalesce(x.c, 0) order by g)
                          from generate_series(since, today, interval '1 day') g
                          left join (select u.day, sum(u.count) c from public.usage_daily u
                                      where u.name = n.name and u.day >= since group by u.day) x on x.day = g::date)
           ) as item
      from unnest(public.usage_names()) n(name)
      left join (select u.name, sum(u.count) total from public.usage_daily u where u.day >= since group by u.name) w on w.name = n.name
      left join (select q.name, jsonb_object_agg(q.plan, q.c) by_plan
                   from (select u.name, u.plan, sum(u.count) c from public.usage_daily u where u.day >= since group by u.name, u.plan) q
                  group by q.name) bp on bp.name = n.name
     where n.name not like 'module_open:%'
  ) f;

  select coalesce(jsonb_agg(substr(n.name, length('module_open:') + 1) order by n.name), '[]'::jsonb) into v_dead
    from unnest(public.usage_names()) n(name)
   where n.name like 'module_open:%'
     and not exists (select 1 from public.usage_daily u where u.name = n.name and u.day >= today - 13 and u.count > 0);

  select coalesce(jsonb_agg(jsonb_build_object('day', to_char(g, 'YYYY-MM-DD'), 'events', coalesce(x.c, 0)) order by g), '[]'::jsonb) into v_tot
    from generate_series(since, today, interval '1 day') g
    left join (select u.day, sum(u.count) c from public.usage_daily u where u.day >= since group by u.day) x on x.day = g::date;

  return jsonb_build_object(
    'since', since, 'until', today, 'days', v_days,
    'tracking_began', (select min(u.day) from public.usage_daily u),
    'modules', v_mods,
    'features', v_feat,
    'dead_modules', v_dead,
    'daily_total', v_tot,
    'active_users', jsonb_build_object(
      'source', 'usage_rate rows, kept 48 hours: people who sent at least one batch',
      'last_24h', (select count(distinct r.user_id) from public.usage_rate r where r.hour > now() - interval '24 hours'),
      'last_48h', (select count(distinct r.user_id) from public.usage_rate r where r.hour > now() - interval '48 hours'),
      'weekly',   'not available by design'));
end;
$fn$;

-- 43.5 COHORTS ----------------------------------------------------------
/** One row per non-anonymous account created on or after p_start (an
 *  Asia/Kolkata date), with the stages it reached. Internal. */
create or replace function public.cohort_rows(p_start date)
returns table (user_id uuid, wk date, source text, attribution text,
               is_member boolean, trial_started boolean, active_in_trial boolean,
               checkout_started boolean, paid boolean, refunded boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select au.id,
         date_trunc('week', au.created_at at time zone 'Asia/Kolkata')::date,
         case when exists (select 1 from public.invite_redemptions r join public.invite_codes c on c.id = r.code_id
                            where r.user_id = au.id and c.pass_type = 'standard') or m.trial_source = 'code' then 'code'
              when m.trial_source in ('signup', 'admin', 'refund') then m.trial_source
              else 'none' end,
         coalesce((select pc.kind from public.payments p join public.promo_codes pc on pc.code = p.promo_code
                    where p.user_id = au.id and p.status in ('paid', 'refunded')
                    order by p.paid_at nulls last, p.created_at limit 1), 'none'),
         m.user_id is not null,
         (m.trial_started_at is not null and m.trial_source is distinct from 'admin'),
         (m.trial_started_at is not null and m.trial_source is distinct from 'admin'
           and exists (select 1 from public.project_data pd join public.projects pr on pr.id = pd.project_id
                        where pr.owner_id = au.id
                          and pd.updated_at >= m.trial_started_at
                          and pd.updated_at <= m.trial_started_at + make_interval(mins => coalesce(m.trial_minutes, 30)))),
         exists (select 1 from public.payments p where p.user_id = au.id and p.status <> 'granted'),
         exists (select 1 from public.payments p where p.user_id = au.id and p.status in ('paid', 'refunded')),
         (exists (select 1 from public.payments p where p.user_id = au.id and p.status = 'refunded')
           or exists (select 1 from public.refunds f join public.payments p on p.id = f.payment_id
                       where p.user_id = au.id and f.status = 'processed'))
    from auth.users au
    left join public.studio_members m on m.user_id = au.id
   where not au.is_anonymous
     and (au.created_at at time zone 'Asia/Kolkata')::date >= p_start;
$$;

/** Keys: weeks, since, stages[], by_week[], by_source[], by_attribution[],
 *  totals. Every row carries the same counts: signed_up, members,
 *  trial_started, active_in_trial, checkout_started, paid, refunded. */
create or replace function public.admin_cohorts(p_weeks int default 12)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  w      int  := least(greatest(coalesce(p_weeks, 12), 1), 52);
  today  date := (now() at time zone 'Asia/Kolkata')::date;
  this_w date := date_trunc('week', now() at time zone 'Asia/Kolkata')::date;
  since  date;
  v_week jsonb;
  v_src  jsonb;
  v_att  jsonb;
  v_tot  jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  since := this_w - (w - 1) * 7;

  with c as materialized (select * from public.cohort_rows(since)),
  agg(wk, source, attribution, signed_up, members, trial_started, active_in_trial, checkout_started, paid, refunded) as (
    select wk, source, attribution,
           count(*), count(*) filter (where is_member), count(*) filter (where trial_started),
           count(*) filter (where active_in_trial), count(*) filter (where checkout_started),
           count(*) filter (where paid), count(*) filter (where refunded)
      from c group by wk, source, attribution
  )
  select
    -- every week in the window appears, even an empty one
    (select jsonb_agg(jsonb_build_object(
              'week_start', to_char(g::date, 'YYYY-MM-DD'),
              'signed_up',        coalesce(x.signed_up, 0),        'members',          coalesce(x.members, 0),
              'trial_started',    coalesce(x.trial_started, 0),    'active_in_trial',  coalesce(x.active_in_trial, 0),
              'checkout_started', coalesce(x.checkout_started, 0), 'paid',             coalesce(x.paid, 0),
              'refunded',         coalesce(x.refunded, 0)) order by g)
       from generate_series(since, this_w, interval '7 days') g
       left join (select a.wk, sum(a.signed_up) signed_up, sum(a.members) members, sum(a.trial_started) trial_started,
                         sum(a.active_in_trial) active_in_trial, sum(a.checkout_started) checkout_started,
                         sum(a.paid) paid, sum(a.refunded) refunded from agg a group by a.wk) x on x.wk = g::date),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'source', s.source, 'signed_up', s.signed_up, 'members', s.members, 'trial_started', s.trial_started,
              'active_in_trial', s.active_in_trial, 'checkout_started', s.checkout_started, 'paid', s.paid, 'refunded', s.refunded)
              order by s.signed_up desc, s.source), '[]'::jsonb)
       from (select a.source, sum(a.signed_up) signed_up, sum(a.members) members, sum(a.trial_started) trial_started,
                    sum(a.active_in_trial) active_in_trial, sum(a.checkout_started) checkout_started,
                    sum(a.paid) paid, sum(a.refunded) refunded from agg a group by a.source) s),
    (select coalesce(jsonb_agg(jsonb_build_object(
              'attribution', s.attribution, 'signed_up', s.signed_up, 'members', s.members, 'trial_started', s.trial_started,
              'active_in_trial', s.active_in_trial, 'checkout_started', s.checkout_started, 'paid', s.paid, 'refunded', s.refunded)
              order by s.signed_up desc, s.attribution), '[]'::jsonb)
       from (select a.attribution, sum(a.signed_up) signed_up, sum(a.members) members, sum(a.trial_started) trial_started,
                    sum(a.active_in_trial) active_in_trial, sum(a.checkout_started) checkout_started,
                    sum(a.paid) paid, sum(a.refunded) refunded from agg a group by a.attribution) s),
    (select jsonb_build_object(
              'signed_up', coalesce(sum(a.signed_up), 0), 'members', coalesce(sum(a.members), 0),
              'trial_started', coalesce(sum(a.trial_started), 0), 'active_in_trial', coalesce(sum(a.active_in_trial), 0),
              'checkout_started', coalesce(sum(a.checkout_started), 0), 'paid', coalesce(sum(a.paid), 0),
              'refunded', coalesce(sum(a.refunded), 0)) from agg a)
  into v_week, v_src, v_att, v_tot;

  return jsonb_build_object(
    'weeks', w, 'since', since, 'until', today,
    'stages', jsonb_build_array('signed_up', 'members', 'trial_started', 'active_in_trial', 'checkout_started', 'paid', 'refunded'),
    'by_week', v_week, 'by_source', v_src, 'by_attribution', v_att, 'totals', v_tot,
    'notes', jsonb_build_object(
      'stages', 'each stage counts people who reached it, independently; none implies the one before',
      'active_in_trial', 'counts synced project_data written inside the trial window; local-only work is not visible',
      'trial_started', 'excludes trial_source admin (grandfather backfill and console grants)'));
end;
$fn$;

-- 43.6 GRANTS -------------------------------------------------------------
revoke execute on function public.usage_names()                from public, anon;
revoke execute on function public.bump_usage(text[])           from public, anon;
revoke execute on function public.admin_usage(int)             from public, anon;
revoke execute on function public.cohort_rows(date)            from public, anon, authenticated;
revoke execute on function public.admin_cohorts(int)           from public, anon;
grant  execute on function public.usage_names()                to authenticated;
grant  execute on function public.bump_usage(text[])           to authenticated;
grant  execute on function public.admin_usage(int)             to authenticated;
grant  execute on function public.admin_cohorts(int)           to authenticated;

notify pgrst, 'reload schema';

-- 43.7 CHECKS TO RUN -------------------------------------------------------
--  1. anon: bump_usage -> 42501 (no grant). A signed-in non-member:
--     bump_usage(['module_open:budget']) -> 0, no row.
--  2. a member: bump_usage(['module_open:budget','module_open:budget',
--     'nonsense']) -> 2; one usage_daily row, count 2, plan = their plan.
--  3. 51 names in one call: only the first 50 are read. The 61st call in
--     an hour -> P0429.
--  4. insert into usage_daily with a name outside the list -> 23514;
--     with plan 'gold' -> 23514. A direct select/insert as authenticated
--     or anon -> 42501 (no grants).
--  5. anon / non-admin: admin_usage(), admin_cohorts() -> 42501.
--  6. admin_usage(30): every module id in navigation.json appears in
--     modules[], zero-filled; dead_modules lists those with no open in 14
--     days; active_users.weekly says it is not available.
--  7. admin_cohorts(12): by_week has 12 rows; totals.signed_up equals the
--     sum of by_week.signed_up; by_source and by_attribution each sum to
--     the totals.
--  8. usage_names() equals the module ids in src/data/navigation.json
--     plus the eight fixed names (npm run test:usage-names, and the
--     schema runner compares the live function to navigation.json).
--  9. re-running the section is a no-op.
-- Read-back after the owner runs it:
--   select cardinality(public.usage_names());
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'usage_daily_name_check';
-- Test file: scripts/schema-tests/usage-cohorts.sql (npm run test:schema).
-- ============================================================
