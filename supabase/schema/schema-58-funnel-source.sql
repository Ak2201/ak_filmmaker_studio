-- RUN: owner, in the Supabase SQL editor, AFTER §57. Hash the file first
--      (shasum -a 256 supabase/schema/schema-58-funnel-source.sql) and compare
--      it with the editor's contents before pressing Run (docs/LAUNCH.md §4).
--      Re-runnable. No function redeploy. Read back with 58.6 below.
-- ============================================================
-- 58. FUNNEL COUNTS BY SOURCE, AND FOUR MORE STEPS
-- ------------------------------------------------------------
-- §29's events table is DAILY COUNTERS: (day, name, count), no user id,
-- no e-mail, no IP, no session. This section keeps that promise and adds
-- one aggregate dimension: WHERE THE VISIT CAME FROM, as a short bucket
-- the client derives from ?src= / ?utm_source= (src/lib/attribution.js
-- records it; funnel.js maps it onto a FIXED list), e.g. 'google',
-- 'instagram', 'email', 'other'. Never ?ref=: a referral code names one
-- member. It is part of the per-day
-- key, so a row is still "how many, that day, from there" — never who.
--
--   events.source  text NOT NULL DEFAULT ''  ('' = no source, every row
--                  written before this section). CHECK: '' or
--                  ^[a-z0-9_-]{1,32}$ with no run of 7 or more digits —
--                  no spaces, no '@', no '.', no phone number.
--
--   THE PATTERN ALONE DOES NOT KEEP PERSONAL DATA OUT, and nobody should
--   read it as if it did: 'kasi-v-example-com' or 'john-smith' passes it.
--   What keeps a person out of this column is the CLIENT sending only a
--   name from a fixed list (src/lib/funnel.js sourceBucket(): google,
--   instagram, youtube, ... and 'other' for anything else). The server's
--   share is the charset, the length, the digit-run refusal, and the 200-
--   a-day cap below, so a hand-made call cannot store free text either.
--   primary key    (day, name) -> (day, name, source).
--   names          + trial_start, sample_open, signin_done,
--                  plan_view_in_app. Every §29 name is kept.
--
-- bump_event(p_name text) keeps working UNCHANGED for every deployed
-- client (anon-callable, the same 22023 on an unknown name). It must be
-- restated: its body said ON CONFLICT (day, name), which no longer names
-- a unique index once the key grows, so it now calls the two-argument form
-- with no source. bump_event(p_name text, p_source text) is new, with NO
-- default on p_source — a default would make {p_name} ambiguous between
-- the two overloads for PostgREST (PGRST203).
--
-- A SOURCE IS NORMALISED, NOT TRUSTED: lower-cased and trimmed; null or
-- '' is "no source"; anything else that fails the pattern is 22023, so
-- the client cannot smuggle free text in (the same reason names are an
-- allowlist). And a bot cannot grow the table without bound: once a day
-- holds 200 distinct sources, a NEW source that day is counted as
-- 'other'. A source already seen that day keeps counting as itself.
--
-- Opt-out is unchanged and lives in the client (Do Not Track, Global
-- Privacy Control, "Don't count this visit"): a visit that opted out
-- sends nothing, so there is nothing here to honour.
--
-- THE CONSOLE: admin_funnel(from, to) keeps its signature and meaning —
-- one row per step, summed across sources — now listing all ten steps.
-- admin_funnel_by_source(from, to) is new: (name, source, total) for
-- every (step, source) with a count in the window, '' shown as 'direct'
-- by the console. Both are administrators only (is_studio_admin(); §46
-- left the reads un-narrowed). anon still reads no raw row.
-- ============================================================

-- 58.1 the column, its check, the wider names, the wider key -----------
alter table public.events add column if not exists source text not null default '';

/* Dropped and re-added rather than "add if missing", so a database that
   ran an earlier draft of this section gets the digit-run refusal too. */
alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check
  check (source = '' or (source ~ '^[a-z0-9_-]{1,32}$' and source !~ '[0-9]{7}'));

alter table public.events drop constraint if exists events_name_check;
alter table public.events add constraint events_name_check check (name in (
  'landing_view','pricing_view','invite_request','signup','checkout_start','purchase',
  'trial_start','sample_open','signin_done','plan_view_in_app'));

do $k$
declare cols text[];
begin
  select array_agg(a.attname::text order by a.attname)
    into cols
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
   where c.conrelid = 'public.events'::regclass and c.contype = 'p';
  if cols is distinct from array['day','name','source'] then
    if cols is not null then
      execute (select format('alter table public.events drop constraint %I', conname)
                 from pg_constraint where conrelid = 'public.events'::regclass and contype = 'p');
    end if;
    alter table public.events add constraint events_pkey primary key (day, name, source);
  end if;
end
$k$;

alter table public.events enable row level security;
revoke all on public.events from public, anon, authenticated;

-- 58.2 the step list, in funnel order (one place for the RPCs below) ---
create or replace function public.funnel_event_names()
returns text[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select array['landing_view','pricing_view','invite_request','signup','signin_done',
               'sample_open','trial_start','plan_view_in_app','checkout_start','purchase']::text[];
$$;

-- 58.3 bump_event, two arguments ----------------------------------------
create or replace function public.bump_event(p_name text, p_source text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  d date := (now() at time zone 'Asia/Kolkata')::date;
  s text := lower(btrim(coalesce(p_source, '')));
begin
  if p_name is null or not (p_name = any(public.funnel_event_names())) then
    raise exception 'Unknown event.' using errcode = '22023';
  end if;
  if s <> '' and (s !~ '^[a-z0-9_-]{1,32}$' or s ~ '[0-9]{7}') then
    raise exception 'A source is up to 32 of a-z, 0-9, _ and -, with no long number in it.' using errcode = '22023';
  end if;
  if s <> '' and not exists (select 1 from public.events e where e.day = d and e.source = s)
     and (select count(distinct e.source) from public.events e where e.day = d) >= 200 then
    s := 'other';
  end if;
  insert into public.events (day, name, source, count) values (d, p_name, s, 1)
    on conflict (day, name, source) do update set count = public.events.count + 1;
end;
$fn$;

-- 58.4 bump_event, one argument: what every deployed client calls -------
create or replace function public.bump_event(p_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  perform public.bump_event(p_name, null::text);
end;
$fn$;

-- 58.5 the console -------------------------------------------------------
create or replace function public.admin_funnel(p_from date, p_to date)
returns table (name text, total bigint)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select n.name, coalesce(sum(e.count), 0)::bigint
      from unnest(public.funnel_event_names()) with ordinality as n(name, ord)
      left join public.events e on e.name = n.name and e.day between coalesce(p_from, date '1970-01-01') and coalesce(p_to, date '2999-12-31')
     group by n.name, n.ord order by n.ord;
end;
$fn$;

create or replace function public.admin_funnel_by_source(p_from date, p_to date)
returns table (name text, source text, total bigint)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  return query
    select n.name, e.source, sum(e.count)::bigint
      from unnest(public.funnel_event_names()) with ordinality as n(name, ord)
      join public.events e on e.name = n.name and e.day between coalesce(p_from, date '1970-01-01') and coalesce(p_to, date '2999-12-31')
     group by n.name, n.ord, e.source
    having sum(e.count) > 0
     order by n.ord, sum(e.count) desc, e.source;
end;
$fn$;

revoke execute on function public.funnel_event_names()                from public;
revoke execute on function public.bump_event(text)                    from public;
revoke execute on function public.bump_event(text, text)              from public;
revoke execute on function public.admin_funnel(date, date)            from public, anon;
revoke execute on function public.admin_funnel_by_source(date, date)  from public, anon;
grant  execute on function public.funnel_event_names()                to anon, authenticated;
grant  execute on function public.bump_event(text)                    to anon, authenticated;
grant  execute on function public.bump_event(text, text)              to anon, authenticated;
grant  execute on function public.admin_funnel(date, date)            to authenticated;
grant  execute on function public.admin_funnel_by_source(date, date)  to authenticated;

notify pgrst, 'reload schema';

-- 58.6 CHECKS TO RUN LIVE (read-only, as the owner in the SQL editor) ----
-- select pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.events'::regclass order by conname;
--   -> events_name_check lists ten names; events_pkey is (day, name, source);
--      events_source_check is '' or ^[a-z0-9_-]{1,32}$ and no [0-9]{7}
-- select oid::regprocedure from pg_proc where proname = 'bump_event';
--   -> bump_event(text) AND bump_event(text,text)
-- select * from public.admin_funnel_by_source(current_date - 7, current_date);
-- Scratch-database checks: scripts/schema-tests/funnel-source.sql (npm run test:schema).
-- ============================================================
