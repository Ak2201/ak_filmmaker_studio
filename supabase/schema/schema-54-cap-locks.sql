-- ============================================================
-- 54. THE PLAN CAPS HOLD UNDER PARALLEL INSERTS   NOT YET RUN LIVE
-- ------------------------------------------------------------
-- 21 Oct 2026, from the server audit. Every cap trigger counts and then
-- compares: `select count(*) ...; if n >= cap then raise`. Under READ
-- COMMITTED an insert another transaction has not committed yet is
-- invisible to that count, so five `POST /rest/v1/projects` sent at once
-- by a Basic owner holding 2 of 3 each counted 2, each passed, and the
-- owner ended with 7 synced projects. Seats, live share links and
-- collaborators had the same hole. These triggers are the server-side
-- limit the plans rely on.
--
-- The fix is ONE line in each trigger, before its count: a transaction-
-- scoped advisory lock on the thing the cap counts, so a second insert
-- for the same key waits until the first commits or rolls back, and its
-- count (a new statement, so a new snapshot) then sees the first row.
--
--   enforce_project_limit       per owner        'fms:cap:projects:<owner>'
--   enforce_share_limit         per owner        'fms:cap:shares:<owner>'
--                               (the share cap counts across ALL the
--                               owner's films, so a per-film lock would
--                               still let two films race)
--   enforce_collaborator_limit  per film         'fms:cap:collab:<project>'
--   enforce_seat_limit          per organisation 'fms:cap:seats:<account>'
--
-- An advisory lock rather than `select ... for update` on the parent row,
-- so a cap check never blocks an ordinary save of the project or account
-- row it is keyed on. A hashtext() collision only makes two unrelated
-- inserts wait for each other; it can never let one through. Inserts that
-- the cap does not apply to (a privileged caller, no cap on the plan, an
-- UPDATE the trigger lets straight through) take no lock.
--
-- Each body below is the LATEST definition byte for byte (§26.1 for
-- projects and shares, §51.7 for collaborators, §50.3b for seats) plus
-- the marked `-- §54` line. Triggers are unchanged and not recreated.
--
-- ORDER: run AFTER §50 and §51 (it restates their bodies; run before them
-- and they would put the unlocked bodies back). No client or edge
-- function change depends on it; until it runs the caps behave as they
-- always have. REQUIRES §16 (plan_cap, user_limits, user_plan), §26,
-- §50, §51. Re-runnable.
-- ============================================================

-- 54.1 projects, per owner ------------------------------------------------
create or replace function public.enforce_project_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  pl  := public.user_plan(new.owner_id);
  cap := public.plan_cap(public.user_limits(new.owner_id), 'projects');
  if cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('fms:cap:projects:' || new.owner_id::text));  -- §54
  select count(*) into n from public.projects p where p.owner_id = new.owner_id;
  if n >= cap then
    raise exception 'Your % plan syncs up to % project%. Upgrade to add another to the cloud; it is still saved on this device.',
      coalesce((select x.name from public.plans x where x.id = pl), initcap(pl)), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;

-- 54.2 live share links, per owner (the cap spans every film) --------------
create or replace function public.enforce_share_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid; cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  pl  := public.user_plan(owner);
  cap := public.plan_cap(public.user_limits(owner), 'shares');
  if cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('fms:cap:shares:' || coalesce(owner::text, '')));  -- §54
  select count(*) into n from public.shares s join public.projects p on p.id = s.project_id
   where p.owner_id = owner and (s.expires_at is null or s.expires_at > now());
  if n >= cap then
    raise exception 'Your % plan allows % live share link%. Revoke one, or upgrade.',
      coalesce((select x.name from public.plans x where x.id = pl), initcap(pl)), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;

-- 54.3 collaborators, per film ---------------------------------------------
create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid; cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  -- §51: an UPDATE that keeps the film is not a new seat
  if tg_op = 'UPDATE' and new.project_id is not distinct from old.project_id then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  pl  := public.user_plan(owner);
  cap := public.plan_cap(public.user_limits(owner), 'collaborators');
  if cap is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('fms:cap:collab:' || coalesce(new.project_id::text, '')));  -- §54
  select count(*) into n from public.project_collaborators pc where pc.project_id = new.project_id;
  if n >= cap then
    raise exception 'This film''s owner is on the % plan, which allows % collaborator% per film.',
      coalesce((select x.name from public.plans x where x.id = pl), initcap(pl)), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;

-- 54.4 seats, per organisation ---------------------------------------------
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  used int;
  lim  int;
  cur  jsonb;
begin
  if tg_op = 'UPDATE'
     and not (old.status = 'revoked' and new.status in ('pending','active')) then
    return new;
  end if;
  -- §50: a lapsed grant or a refunded plan reads as 'free' here, whatever
  -- the stored column still says.
  select p.limits into cur from public.plans p where p.id = public.account_plan(new.account_id);
  select least(a.seat_limit, greatest(1, coalesce(public.plan_cap(cur, 'seats'), 1000)))
    into lim from public.accounts a where a.id = new.account_id;
  -- end §50
  perform pg_advisory_xact_lock(hashtext('fms:cap:seats:' || coalesce(new.account_id::text, '')));  -- §54
  select count(*) into used
    from public.account_members
   where account_id = new.account_id
     and status in ('pending','active')
     and (tg_op = 'INSERT' or (account_id, invited_email) <> (new.account_id, new.invited_email));
  if used >= lim then
    raise exception 'Seat limit reached for this account (% of %). Add seats to invite more people.', used, lim
      using errcode = '53400';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
