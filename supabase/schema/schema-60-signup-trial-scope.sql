-- RUN: owner, in the Supabase SQL editor, AFTER §59 (it restates §51.12's
--      start_trial(), so it needs §50 and §51). Hash the file first
--      (shasum -a 256 supabase/schema/schema-60-signup-trial-scope.sql) and
--      compare it with the editor's contents before pressing Run
--      (docs/LAUNCH.md §4). Re-runnable. No function redeploy. Read back
--      with 60.4 below; the two-account checks are docs/SECURITY-RLS.md §60.
-- ============================================================
-- 60. A PRESSED TRIAL FOLLOWS THE CONSOLE'S TRIAL SCOPE
-- ------------------------------------------------------------
-- Owner decision, 26 Oct 2026: the trial is three days of the WHOLE
-- studio (console: trial_minutes 4320, trial_scope 'full'). Until now
-- the console's trial_scope could not give that to anybody who pressed
-- START MY FREE TRIAL: start_trial() (§30.5, restated in §50 and §51.12)
-- wrote
--
--     case when src = 'signup' then 'sample' else coalesce(s.trial_scope, 'sample') end
--
-- so a pressed trial ('signup') was ALWAYS the sample, and the setting
-- reached only code-redeemed ('code') and administrator-started trials.
-- With trial_scope 'full' the console said "the whole studio" and the
-- person got the sample films.
--
-- THE ONE CHANGE: every trial start_trial() writes takes
-- coalesce(billing_settings.trial_scope, 'sample'). With the setting at
-- its default 'sample' that is exactly what a pressed trial got before;
-- code and administrator trials already read it and are unchanged. The
-- body is §51.12's otherwise, byte for byte, and every refusal stays as
-- it was: not signed in and anonymous sessions 42501, disabled 42501,
-- declined (and a declined re-ask, §50) 42501, switched off
-- {reason: 'disabled'}, a second trial {reason: 'used'}, a buyer
-- {reason: 'paid'}. The length is unchanged too: trial_minutes for a
-- pressed trial, code_trial_days for a code.
--
-- WHAT A FULL TRIAL OPENS (billing_status(), §53.4, not restated here):
-- entitled true while it runs; `features` is the plans row named by
-- billing_settings.trial_plan (indie when unset) instead of the free
-- plan's {"sample_only": true, "new_projects": false}, so plan-gate.js's
-- sampleOnly() is false and new projects are allowed; `trial_scope`
-- 'full'. `limits` are NOT widened: user_limits() still reads the free
-- plan's row, so a trial keeps ONE film in the cloud, no shares and no
-- collaborators (local work is never capped). That is §53.4 as it stands
-- and is an owner decision, not something this section changes.
--
-- trial_offer() (§33.1, anon) gains `trial_scope`, the setting a pressed
-- trial now follows, so the public pages can say "the whole studio" only
-- when it is true. Every key it had keeps its name and meaning; a page
-- reading an older server sees no trial_scope and says nothing about it.
-- ============================================================

do $guard$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'invite_requests' and column_name = 'last_declined_at') then
    raise exception 'Section 60 needs section 50 (invite_requests.last_declined_at). Run sections 50 and 51 first.';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'billing_settings' and column_name = 'trial_scope') then
    raise exception 'Section 60 needs section 30 (billing_settings.trial_scope).';
  end if;
end
$guard$;

-- 60.1 start_trial: §51.12's body, plus the marked line ----------------------
create or replace function public.start_trial(p_source text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  s    public.billing_settings;
  m    public.studio_members;
  src  text;
  mins int;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- §51: an anonymous session has a uid but is not an account
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google to start a trial' using errcode = '42501';
  end if;
  -- end §51

  select * into s from public.billing_settings x where x.id;
  select * into m from public.studio_members x where x.user_id = uid for update;

  if m.user_id is not null and m.disabled_at is not null then
    raise exception 'This account has been disabled.' using errcode = '42501';
  end if;
  -- A declined request is an administrator's "no". There is no other row
  -- that records it for somebody who was never a member.
  if exists (select 1 from public.invite_requests r where r.user_id = uid and r.status = 'declined') then
    raise exception 'This account was not approved.' using errcode = '42501';
  end if;
  -- §50: and a re-ask does not erase it. Only an approval clears
  -- last_declined_at. Non-members only, so a member's landing call still
  -- gets its 'used' verdict rather than an error.
  if m.user_id is null
     and exists (select 1 from public.invite_requests r where r.user_id = uid and r.last_declined_at is not null) then
    raise exception 'This account was not approved.' using errcode = '42501';
  end if;
  -- end §50

  if not coalesce(s.trial_enabled, false) then
    return jsonb_build_object('started', false, 'reason', 'disabled');
  end if;
  if m.trial_started_at is not null then
    return jsonb_build_object('started', false, 'reason', 'used');
  end if;
  -- paid_at, not status='paid': it catches a grant and a refunded buyer
  -- too, so a refund is not a way back to a fresh trial. (Do NOT use
  -- paid_credit_paise here — it filters period='lifetime' and misses
  -- grants.)
  if exists (select 1 from public.payments p where p.user_id = uid and p.paid_at is not null) then
    return jsonb_build_object('started', false, 'reason', 'paid');
  end if;

  src := case
           when p_source is not null and public.is_studio_admin() then p_source
           when m.invite_code_id is not null                      then 'code'
           else 'signup'
         end;
  mins := case when src = 'code' then coalesce(s.code_trial_days, 7) * 1440
               else coalesce(s.trial_minutes, 30) end;

  insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
  values (uid, 'user', now(), mins, src,
          -- §60: every trial follows the console's scope (a pressed one was always 'sample')
          coalesce(s.trial_scope, 'sample'))
  on conflict (user_id) do update
     set trial_started_at = now(),
         trial_minutes    = excluded.trial_minutes,
         trial_source     = excluded.trial_source,
         trial_scope      = excluded.trial_scope
   -- the WHERE closes the two-concurrent-calls race: the second finds
   -- trial_started_at already set and does nothing
   where public.studio_members.trial_started_at is null;

  -- Parity with the two other paths that admit somebody
  -- (activate_payment, admin_grant_plan). Inserts (name, owner_id) only,
  -- which is how it passes accounts_guard's INSERT branch; see section 19.
  perform public.account_for_buyer(uid, null);

  return jsonb_build_object('started', true, 'status', public.billing_status());
end;
$fn$;
revoke execute on function public.start_trial(text) from public, anon;
grant  execute on function public.start_trial(text) to authenticated;

-- 60.2 trial_offer: §33.1's keys, plus trial_scope ---------------------------
create or replace function public.trial_offer()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'trial_enabled',     coalesce(s.trial_enabled, false),
    'trial_minutes',     coalesce(s.trial_minutes, 30),
    'trial_hours',       round(coalesce(s.trial_minutes, 30) / 60.0, 2),
    'purchase_required', coalesce(s.purchase_required, false),
    -- §60: what a pressed trial opens, 'sample' or 'full'
    'trial_scope',       coalesce(s.trial_scope, 'sample'))
    from (select 1) one
    left join public.billing_settings s on s.id;
$$;
revoke execute on function public.trial_offer() from public;
grant  execute on function public.trial_offer() to anon, authenticated;

notify pgrst, 'reload schema';

-- 60.3 NOTHING IS BACKFILLED -----------------------------------------------
-- A trial already running keeps the scope it was started with: its row
-- says 'sample' and billing_status() reads the row. Widening running
-- trials would be an administrator's act (admin_grant_trial gives 'full').

-- 60.4 CHECKS TO RUN LIVE (read-only, as the owner in the SQL editor) ----
-- select pg_get_functiondef('public.start_trial(text)'::regprocedure) like '%§60%';   -> true
-- select pg_get_functiondef('public.start_trial(text)'::regprocedure) like '%then ''sample'' else%';   -> false
-- select public.trial_offer() ? 'trial_scope';                                    -> true
-- select trial_scope, trial_minutes, trial_plan from public.billing_settings;      -> full, 4320, (owner's choice)
-- Scratch-database checks: scripts/schema-tests/signup-trial-scope.sql (npm run test:schema);
-- the two-account checks: docs/SECURITY-RLS.md §60.
-- ============================================================
