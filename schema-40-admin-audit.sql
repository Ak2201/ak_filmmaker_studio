-- ============================================================
-- 40. THE ADMIN AUDIT LOG   NOT RUN LIVE
-- ------------------------------------------------------------
-- Admin console v2, docs/ADMIN-CONSOLE-PLAN.md §3.1. Every admin WRITE
-- leaves a row, in the SAME TRANSACTION as the thing it records: an
-- action and its audit row commit together or not at all.
--
--   40.1  admin_audit             the table. RLS on, no grants, append-only.
--   40.2  admin_audit_write()     the helper every writer calls. Definer-only:
--                                 no API role can execute it.
--   40.3  admin_list_audit()      the console's read, keyset-paged, admin only.
--   40.4  the writers, RESTATED IN FULL (not wrapped), one audit call each:
--         grant_plan  set_plan  set_plan_price  set_next_price
--         set_billing_settings  set_refund_requests_enabled
--         set_promo_code  grant_trial  grant_email  revoke_email_grant
--         decide_request  decide_refund_request  issue_invoice
--         resend_receipt  reset_user  terminate_session
--         create_invite  revoke_invite  mark_referral_paid
--
-- EVERY BODY BELOW IS THE LATEST DEFINITION IN supabase-schema.sql at
-- the time of writing, with ONE kind of change: a snapshot taken before
-- the write where the "before" is not already in hand, and one
-- admin_audit_write() call after it. Validation, refusals, sentences,
-- errcodes, return values and grants are byte-identical. Which body was
-- latest (later sections override earlier ones):
--   grant_plan §18                set_plan §18        create_invite §13.5
--   revoke_invite §13.5           terminate_session §13.5   decide_request §14
--   mark_referral_paid §22        set_promo_code §23 (the second)
--   reset_user §25                set_refund_requests_enabled §27
--   decide_refund_request §27     issue_invoice §28   set_next_price §30
--   grant_trial §30               set_plan_price §31  grant_email §32
--   revoke_email_grant §32        resend_receipt §35
--   set_billing_settings §39 (the fourth)
--
-- WHAT IS NEVER WRITTEN INTO A ROW. No invite CODE (a credential: the
-- row names the invite by id, pass type, expiry and label), no script or
-- project content, no payment `raw`. A row says what changed and who did
-- it, and never carries what the change was ABOUT beyond a snapshot of
-- the settings it edited.
--
-- THE CONVENTION THE CONSOLE'S "EVERYTHING ABOUT THIS PERSON" RELIES ON.
-- target_kind 'user' puts the person in target_id. Any other kind that
-- concerns one person carries their id as `user_id` inside `after`
-- (or `before` for a revoke), and admin_list_audit(p_target => <uuid>)
-- and admin_customer() both match on it.
--
-- `at` DEFAULTS TO clock_timestamp(), NOT now(). The keyset cursor is
-- `at`; now() is frozen for a whole transaction, so one transaction that
-- audited three credits would stamp them identically and a page boundary
-- through them would skip rows. clock_timestamp() is distinct per row.
--
-- APPEND-ONLY, AS FAR AS A DATABASE CAN BE. UPDATE and DELETE are refused
-- by a row trigger and TRUNCATE by a statement trigger, for EVERY role
-- including the table's owner. A superuser can still drop the trigger or
-- set session_replication_role = replica; nothing in SQL stops that, and
-- the Supabase dashboard's SQL editor is exactly that role. The log is
-- tamper-evident against the API and the console, not against the owner.
-- ============================================================

-- 40.1 THE TABLE --------------------------------------------------------
create table if not exists public.admin_audit (
  id          uuid        primary key default gen_random_uuid(),
  at          timestamptz not null default clock_timestamp(),
  actor       uuid,                       -- no FK: deleting a user must not delete what they did
  actor_email text,
  action      text        not null check (length(action) between 1 and 80),
  target_kind text        not null check (length(target_kind) between 1 and 40),
  target_id   text        not null check (length(target_id) <= 200),
  before      jsonb,
  after       jsonb,
  note        text        check (note is null or length(note) <= 500)
);
create index if not exists admin_audit_at_idx     on public.admin_audit (at desc, id desc);
create index if not exists admin_audit_target_idx on public.admin_audit (target_id, at desc);
create index if not exists admin_audit_actor_idx  on public.admin_audit (actor, at desc);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;
-- no policies: RLS on, no grants. admin_list_audit() is the only way out
-- and admin_audit_write() the only way in.

create or replace function public.admin_audit_immutable()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'The audit log is append-only.' using errcode = '42501';
end;
$fn$;

drop trigger if exists admin_audit_no_change   on public.admin_audit;
drop trigger if exists admin_audit_no_truncate on public.admin_audit;
create trigger admin_audit_no_change
  before update or delete on public.admin_audit
  for each row execute function public.admin_audit_immutable();
create trigger admin_audit_no_truncate
  before truncate on public.admin_audit
  for each statement execute function public.admin_audit_immutable();

-- 40.2 THE HELPER -------------------------------------------------------
/** Called by the definer writers below and by every later admin writer.
 *  NOT callable from the API: it is revoked from public, anon and
 *  authenticated, and a definer body runs as the owner, which can. It
 *  re-checks is_studio_admin() anyway — a grant that slipped would then
 *  let an administrator write rows for a thing they did not do, and a
 *  non-administrator nothing at all. The actor is the caller (auth.uid()
 *  survives a definer boundary), its e-mail from the JWT, else auth.users. */
create or replace function public.admin_audit_write(
  p_action      text,
  p_target_kind text,
  p_target_id   text,
  p_before      jsonb default null,
  p_after       jsonb default null,
  p_note        text  default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if nullif(btrim(coalesce(p_action, '')), '') is null or nullif(btrim(coalesce(p_target_kind, '')), '') is null then
    raise exception 'An audit row names an action and a target kind.' using errcode = '22023';
  end if;
  v_email := coalesce(nullif(auth.jwt() ->> 'email', ''),
                      (select u.email from auth.users u where u.id = v_uid));
  insert into public.admin_audit (actor, actor_email, action, target_kind, target_id, before, after, note)
  values (v_uid, v_email, left(btrim(p_action), 80), left(btrim(p_target_kind), 40),
          left(coalesce(p_target_id, ''), 200), p_before, p_after,
          nullif(left(btrim(coalesce(p_note, '')), 500), ''));
end;
$fn$;

-- 40.3 THE READ ---------------------------------------------------------
/** Keyset-paged, newest first. {rows: [...], has_more, next_before}: pass
 *  next_before back as p_before for the next page.
 *    p_actor   a uuid, or part of the actor's e-mail
 *    p_action  a PREFIX: 'grant' matches grant_plan, grant_trial, grant_email
 *    p_target  a target id; 'kind:id'; or a USER id, which also matches
 *              every row that names that person as user_id
 *    p_from / p_to  inclusive bounds on `at`
 *    p_limit   1 to 200, default 50 */
create or replace function public.admin_list_audit(
  p_actor  text        default null,
  p_action text        default null,
  p_target text        default null,
  p_from   timestamptz default null,
  p_to     timestamptz default null,
  p_limit  int         default 50,
  p_before timestamptz default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  lim  int := least(greatest(coalesce(p_limit, 50), 1), 200);
  a    text := nullif(btrim(coalesce(p_actor, '')), '');
  ac   text := nullif(btrim(coalesce(p_action, '')), '');
  tg   text := nullif(btrim(coalesce(p_target, '')), '');
  out  jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  with page as (
    select x.*, row_number() over (order by x.at desc, x.id desc) as rn
      from (
        select au.*
          from public.admin_audit au
         where (a  is null or au.actor::text = a or position(lower(a) in lower(coalesce(au.actor_email, ''))) > 0)
           and (ac is null or position(lower(ac) in lower(au.action)) = 1)
           and (tg is null or au.target_id = tg
                           or au.target_kind || ':' || au.target_id = tg
                           or au.after  ->> 'user_id' = tg
                           or au.before ->> 'user_id' = tg)
           and (p_from   is null or au.at >= p_from)
           and (p_to     is null or au.at <= p_to)
           and (p_before is null or au.at <  p_before)
         order by au.at desc, au.id desc
         limit lim + 1
      ) x
  )
  select jsonb_build_object(
           'rows',        coalesce(jsonb_agg(to_jsonb(g) - 'rn' order by g.rn) filter (where g.rn <= lim), '[]'::jsonb),
           'has_more',    coalesce(count(*) > lim, false),
           'next_before', (select min(g2.at) from page g2 where g2.rn <= lim))
    into out
    from page g;
  return out;
end;
$fn$;

-- 40.4 THE WRITERS, RESTATED -------------------------------------------

-- admin_grant_plan  (was §18) -------------------------------------------
create or replace function public.admin_grant_plan(p_user uuid, p_plan text, p_days int, p_note text default null)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  acc     uuid;
  v_prior text;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if not exists (select 1 from public.plans p where p.id = p_plan and p.id <> 'free') then
    raise exception 'No such paid plan' using errcode = '22023';
  end if;
  v_prior := public.user_plan(p_user);
  acc := public.account_for_buyer(p_user, null);
  perform public.apply_plan(acc, p_plan, 'lifetime', 0);
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, status, note, paid_at, starts_at, ends_at)
  values (p_user, acc, p_plan, 'grant', 0, 'granted', left(p_note, 300), now(), now(), null);
  insert into public.studio_members (user_id, role) values (p_user, 'user') on conflict (user_id) do nothing;
  perform public.admin_audit_write('grant_plan', 'user', p_user::text,
    jsonb_build_object('plan', v_prior), jsonb_build_object('plan', p_plan), left(p_note, 300));
  return null;
end;
$fn$;

-- admin_set_plan  (was §18) ---------------------------------------------
create or replace function public.admin_set_plan(p_id text, p_patch jsonb)
returns public.plans
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  row public.plans;
  lim jsonb;
  k   text;
  v_before jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  select * into row from public.plans p where p.id = p_id for update;
  if row.id is null then raise exception 'No such plan' using errcode = '22023'; end if;
  v_before := to_jsonb(row);
  if p_patch ? 'limits' then
    lim := p_patch -> 'limits';
    if jsonb_typeof(lim) <> 'object' then raise exception 'limits must be an object' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(lim) loop
      if k not in ('projects','collaborators','shares','seats','extension') then
        raise exception 'Unknown limit "%"', k using errcode = '22023';
      end if;
      if k = 'extension' then
        if jsonb_typeof(lim -> k) <> 'boolean' then raise exception 'extension must be true or false' using errcode = '22023'; end if;
      elsif jsonb_typeof(lim -> k) not in ('number', 'null') or (jsonb_typeof(lim -> k) = 'number' and (lim ->> k)::numeric < 0) then
        raise exception '% must be a whole number or null for unlimited', k using errcode = '22023';
      end if;
    end loop;
  end if;
  if p_patch ? 'features' then
    if jsonb_typeof(p_patch -> 'features') <> 'object' then raise exception 'features must be an object' using errcode = '22023'; end if;
    if (select count(*) from jsonb_object_keys(p_patch -> 'features')) > 200 then raise exception 'too many feature keys' using errcode = '22023'; end if;
    for k in select jsonb_object_keys(p_patch -> 'features') loop
      if k !~ '^[a-z0-9_-]{1,40}$' then raise exception 'Bad feature key "%"', k using errcode = '22023'; end if;
      if jsonb_typeof(p_patch -> 'features' -> k) <> 'boolean' then raise exception 'feature "%" must be true or false', k using errcode = '22023'; end if;
    end loop;
  end if;
  if p_id = 'free' and ((p_patch ? 'price_paise'   and (p_patch ->> 'price_paise')::int   > 0)
                     or (p_patch ? 'monthly_paise' and (p_patch ->> 'monthly_paise')::int > 0)
                     or (p_patch ? 'yearly_paise'  and (p_patch ->> 'yearly_paise')::int  > 0)) then
    raise exception 'The free plan cannot have a price' using errcode = '22023';
  end if;
  update public.plans p
     set name          = coalesce(nullif(left(trim(p_patch ->> 'name'), 40), ''), p.name),
         blurb         = case when p_patch ? 'blurb' then left(coalesce(p_patch ->> 'blurb', ''), 200) else p.blurb end,
         price_paise   = coalesce((p_patch ->> 'price_paise')::int,   p.price_paise),
         monthly_paise = coalesce((p_patch ->> 'monthly_paise')::int, p.monthly_paise),
         yearly_paise  = coalesce((p_patch ->> 'yearly_paise')::int,  p.yearly_paise),
         limits        = case when p_patch ? 'limits' then p.limits || (p_patch -> 'limits') else p.limits end,
         features      = case when p_patch ? 'features' then p_patch -> 'features' else p.features end,
         active        = coalesce((p_patch ->> 'active')::boolean, p.active),
         updated_at    = now(), updated_by = auth.uid()
   where p.id = p_id
   returning * into row;
  perform public.admin_audit_write('set_plan', 'plan', p_id, v_before, to_jsonb(row),
    left('patch: ' || coalesce((select string_agg(x, ',') from jsonb_object_keys(p_patch) x), ''), 200));
  return row;
end;
$fn$;

-- admin_set_plan_price  (was §31) ---------------------------------------
create or replace function public.admin_set_plan_price(
  p_plan        text,
  p_currency    text,
  p_amount_minor int,
  p_next_minor  int         default null,
  p_at          timestamptz default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  cur text := upper(btrim(coalesce(p_currency, '')));
  v_before jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if cur !~ '^[A-Z]{3}$' then
    raise exception 'A currency is a three-letter ISO 4217 code, such as USD.' using errcode = '22023';
  end if;
  if cur = 'INR' then
    raise exception 'The rupee price is the one that is charged. Set it with admin_set_plan() and schedule its rise with admin_set_next_price(); giving the card a second author is how a quote and an invoice come to disagree.'
      using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan;
  if pl.id is null then raise exception 'No such plan "%"', p_plan using errcode = '22023'; end if;
  if p_amount_minor is null or p_amount_minor < 0 then
    raise exception 'A price is a whole number of minor units (cents), and not negative.' using errcode = '22023';
  end if;

  if p_next_minor is null then
    if p_at is not null then
      raise exception 'A date with no new price changes nothing. The date belongs to the plan, not to the currency.' using errcode = '22023';
    end if;
  else
    if p_next_minor <= p_amount_minor then
      raise exception 'The new price (%) must be ABOVE the current one (%). Telling people a price is about to rise and then not raising it is a prohibited practice, not a marketing choice.',
        p_next_minor, p_amount_minor using errcode = '22023';
    end if;
    if pl.next_price_at is null then
      raise exception 'No rise is scheduled for %. There is ONE date per plan and every currency follows it — schedule the rupee rise with admin_set_next_price() first.',
        pl.name using errcode = '22023';
    end if;
    if p_at is not null and p_at <> pl.next_price_at then
      raise exception 'A currency cannot rise on a date of its own. % rises at %; pass that instant, or null.',
        pl.name, pl.next_price_at using errcode = '22023';
    end if;
  end if;

  select to_jsonb(pp) into v_before from public.plan_prices pp where pp.plan_id = pl.id and pp.currency = cur;

  insert into public.plan_prices (plan_id, currency, amount_minor, next_amount_minor, updated_by)
  values (pl.id, cur, p_amount_minor, p_next_minor, auth.uid())
  on conflict (plan_id, currency) do update
     set amount_minor      = excluded.amount_minor,
         next_amount_minor = excluded.next_amount_minor,
         updated_at        = now(),
         updated_by        = auth.uid();

  perform public.admin_audit_write('set_plan_price', 'plan_price', pl.id || ':' || cur, v_before,
    jsonb_build_object('plan_id', pl.id, 'currency', cur, 'amount_minor', p_amount_minor, 'next_amount_minor', p_next_minor));
  return public.price_notice(cur);
end;
$fn$;

-- admin_set_next_price  (was §30) ---------------------------------------
create or replace function public.admin_set_next_price(p_plan text, p_paise int, p_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl public.plans;
  v_before jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  select * into pl from public.plans p where p.id = p_plan;
  if pl.id is null then raise exception 'No such plan "%"', p_plan using errcode = '22023'; end if;
  v_before := jsonb_build_object('price_paise', pl.price_paise, 'next_price_paise', pl.next_price_paise, 'next_price_at', pl.next_price_at);

  if p_paise is null then
    update public.plans set next_price_paise = null, next_price_at = null, updated_at = now() where id = p_plan;
    perform public.admin_audit_write('set_next_price', 'plan', p_plan, v_before,
      jsonb_build_object('price_paise', pl.price_paise, 'next_price_paise', null, 'next_price_at', null));
    return public.price_notice();
  end if;
  if p_at is null then
    raise exception 'A price rise needs a date. Without one nothing would ever change and the notice would be untrue.' using errcode = '22023';
  end if;
  if p_paise <= pl.price_paise then
    raise exception 'The new price (%) must be ABOVE the current one (%). Telling people a price is about to rise and then not raising it is a prohibited practice, not a marketing choice.',
      p_paise, pl.price_paise using errcode = '22023';
  end if;
  update public.plans set next_price_paise = p_paise, next_price_at = p_at, updated_at = now() where id = p_plan;
  perform public.admin_audit_write('set_next_price', 'plan', p_plan, v_before,
    jsonb_build_object('price_paise', pl.price_paise, 'next_price_paise', p_paise, 'next_price_at', p_at));
  return public.price_notice();
end;
$fn$;

-- admin_set_billing_settings  (was §39) ---------------------------------
create or replace function public.admin_set_billing_settings(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  k text;
  v int;
  g int;
  v_before jsonb;
  v_after  jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be an object' using errcode = '22023'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('referral_friend_pct', 'referral_reward_pct', 'referral_reward_paise',
                 'trial_enabled', 'trial_minutes', 'code_trial_days', 'trial_scope', 'trial_plan',
                 'price_rises_after_buyers', 'purchase_required') then
      raise exception 'Unknown setting "%"', k using errcode = '22023';
    end if;
  end loop;

  if p_patch ? 'purchase_required' and jsonb_typeof(p_patch -> 'purchase_required') <> 'boolean' then
    raise exception 'Purchases required is on (true) or off (false).' using errcode = '22023';
  end if;
  -- section 39: turning it ON must not retroactively wall the people who
  -- were admitted on the old promise. Everybody else is fair game.
  if coalesce((p_patch ->> 'purchase_required')::boolean, false)
     and not public.purchases_required() then
    select count(*) into g
      from public.studio_members m
     where m.disabled_at is null
       and m.trial_source  = 'admin'
       and m.trial_minutes >= 525600
       and public.user_plan(m.user_id) = 'free'
       and not public.trial_active(m.user_id);
    if g > 0 then
      raise exception 'Requiring a plan would wall % member(s) who were admitted before purchases existed and whose grandfathered access has run out. Give them a plan, a longer trial or an e-mail grant first.', g
        using errcode = '22023', hint = 'grandfathered';
    end if;
  end if;
  if p_patch ? 'trial_minutes' then
    v := (p_patch ->> 'trial_minutes')::int;
    if v is null or v < 1 or v > 44640 then
      raise exception 'A trial lasts between 1 minute and 31 days (44640 minutes).' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'code_trial_days' then
    v := (p_patch ->> 'code_trial_days')::int;
    if v is null or v < 1 or v > 365 then
      raise exception 'An invite code buys between 1 and 365 days.' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'trial_scope' and (p_patch ->> 'trial_scope') not in ('sample', 'full') then
    raise exception 'A trial shows either the sample alone ("sample") or the whole studio ("full").' using errcode = '22023';
  end if;
  if p_patch ? 'trial_plan' and (p_patch ->> 'trial_plan') is not null
     and not exists (select 1 from public.plans p where p.id = p_patch ->> 'trial_plan') then
    raise exception 'No such plan "%"', p_patch ->> 'trial_plan' using errcode = '22023';
  end if;
  if p_patch ? 'price_rises_after_buyers' and (p_patch ->> 'price_rises_after_buyers') is not null
     and (p_patch ->> 'price_rises_after_buyers')::int < 1 then
    raise exception 'A founding-seat cap is at least 1, or null for no cap.' using errcode = '22023';
  end if;

  v_before := public.admin_get_billing_settings();

  update public.billing_settings s
     set referral_friend_pct   = coalesce((p_patch ->> 'referral_friend_pct')::int, s.referral_friend_pct),
         referral_reward_pct   = case when p_patch ? 'referral_reward_pct' then (p_patch ->> 'referral_reward_pct')::int
                                      when p_patch ? 'referral_reward_paise' and p_patch ->> 'referral_reward_paise' is not null then null
                                      else s.referral_reward_pct end,
         referral_reward_paise = case when p_patch ? 'referral_reward_paise' then (p_patch ->> 'referral_reward_paise')::int
                                      when p_patch ? 'referral_reward_pct' and p_patch ->> 'referral_reward_pct' is not null then null
                                      else s.referral_reward_paise end,
         trial_enabled         = coalesce((p_patch ->> 'trial_enabled')::boolean, s.trial_enabled),
         trial_minutes         = coalesce((p_patch ->> 'trial_minutes')::int, s.trial_minutes),
         code_trial_days       = coalesce((p_patch ->> 'code_trial_days')::int, s.code_trial_days),
         trial_scope           = coalesce(p_patch ->> 'trial_scope', s.trial_scope),
         trial_plan            = case when p_patch ? 'trial_plan' then p_patch ->> 'trial_plan' else s.trial_plan end,
         price_rises_after_buyers = case when p_patch ? 'price_rises_after_buyers'
                                         then (p_patch ->> 'price_rises_after_buyers')::int
                                         else s.price_rises_after_buyers end,
         purchase_required     = coalesce((p_patch ->> 'purchase_required')::boolean, s.purchase_required),
         updated_at = now(), updated_by = auth.uid()
   where s.id;
  if p_patch ? 'referral_friend_pct' then
    update public.promo_codes c set percent_off = (p_patch ->> 'referral_friend_pct')::int, updated_at = now() where c.kind = 'referral';
  end if;
  v_after := public.admin_get_billing_settings();
  perform public.admin_audit_write('set_billing_settings', 'billing_settings', 'global', v_before, v_after,
    left('patch: ' || coalesce((select string_agg(x, ',') from jsonb_object_keys(p_patch) x), ''), 200));
  return v_after;
exception
  when check_violation then
    raise exception 'A referral pays the friend 1–100%% off, and the referrer EITHER a percentage (1–100) OR a fixed amount in paise' using errcode = '22023';
end;
$fn$;

-- admin_set_refund_requests_enabled  (was §27) --------------------------
create or replace function public.admin_set_refund_requests_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_old boolean;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if p_enabled is null then raise exception 'Say on or off' using errcode = '22023'; end if;
  select s.refund_requests_enabled into v_old from public.billing_settings s where s.id;
  update public.billing_settings s set refund_requests_enabled = p_enabled, updated_at = now(), updated_by = auth.uid() where s.id;
  perform public.admin_audit_write('set_refund_requests_enabled', 'setting', 'refund_requests_enabled',
    jsonb_build_object('enabled', v_old), jsonb_build_object('enabled', p_enabled));
  return p_enabled;
end;
$fn$;

-- admin_set_promo_code  (was §23) ---------------------------------------
create or replace function public.admin_set_promo_code(p_code text, p_patch jsonb)
returns public.promo_codes
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  row  public.promo_codes;
  ids  text[];
  bad  text;
  comm numeric;
  v_before jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if v_code is null or v_code !~ '^[A-Z0-9][A-Z0-9-]{2,31}$' then
    raise exception 'A code is 3 to 32 letters, digits or dashes' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'patch must be an object' using errcode = '22023'; end if;
  if p_patch ? 'plan_ids' then
    if jsonb_typeof(p_patch -> 'plan_ids') = 'array' then
      select array_agg(x) into ids from jsonb_array_elements_text(p_patch -> 'plan_ids') x;
      if ids is not null and cardinality(ids) = 0 then ids := null; end if;
      select x into bad from unnest(ids) x where x not in (select id from public.plans where id <> 'free') limit 1;
      if bad is not null then raise exception 'No such paid plan "%"', bad using errcode = '22023'; end if;
    elsif jsonb_typeof(p_patch -> 'plan_ids') <> 'null' then
      raise exception 'plan_ids must be a list of plan ids or null' using errcode = '22023';
    end if;
  end if;
  if p_patch ? 'commission_pct' then
    if jsonb_typeof(p_patch -> 'commission_pct') not in ('number', 'null') then
      raise exception 'commission_pct must be a number or null' using errcode = '22023';
    end if;
    comm := (p_patch ->> 'commission_pct')::numeric;
  end if;
  select * into row from public.promo_codes c where c.code = v_code for update;
  if row.code is not null and row.kind in ('referral', 'gift') and p_patch ? 'commission_pct' and comm is not null then
    raise exception 'A % code carries no commission', row.kind using errcode = '22023';
  end if;
  v_before := case when row.code is not null then to_jsonb(row) end;
  if row.code is null then
    insert into public.promo_codes (code, percent_off, amount_off_paise, plan_ids, max_uses, valid_from, valid_until, active, note, created_by, commission_pct, kind)
    values (v_code,
            (p_patch ->> 'percent_off')::int,
            (p_patch ->> 'amount_off_paise')::int,
            case when p_patch ? 'plan_ids' then ids end,
            (p_patch ->> 'max_uses')::int,
            (p_patch ->> 'valid_from')::timestamptz,
            (p_patch ->> 'valid_until')::timestamptz,
            coalesce((p_patch ->> 'active')::boolean, true),
            left(p_patch ->> 'note', 300),
            auth.uid(),
            comm,
            case when comm is not null then 'affiliate' else 'promo' end)
    returning * into row;
  else
    update public.promo_codes c
       set percent_off      = case when p_patch ? 'percent_off'      then (p_patch ->> 'percent_off')::int        else c.percent_off end,
           amount_off_paise = case when p_patch ? 'amount_off_paise' then (p_patch ->> 'amount_off_paise')::int   else c.amount_off_paise end,
           plan_ids         = case when p_patch ? 'plan_ids'         then ids                                      else c.plan_ids end,
           max_uses         = case when p_patch ? 'max_uses'         then (p_patch ->> 'max_uses')::int           else c.max_uses end,
           valid_from       = case when p_patch ? 'valid_from'       then (p_patch ->> 'valid_from')::timestamptz  else c.valid_from end,
           valid_until      = case when p_patch ? 'valid_until'      then (p_patch ->> 'valid_until')::timestamptz else c.valid_until end,
           active           = coalesce((p_patch ->> 'active')::boolean, c.active),
           note             = case when p_patch ? 'note' then left(p_patch ->> 'note', 300) else c.note end,
           commission_pct   = case when p_patch ? 'commission_pct' then comm else c.commission_pct end,
           kind             = case when c.kind in ('referral', 'gift') or not (p_patch ? 'commission_pct') then c.kind
                                   when comm is not null then 'affiliate' else 'promo' end,
           updated_at       = now()
     where c.code = v_code
     returning * into row;
  end if;
  perform public.admin_audit_write('set_promo_code', 'promo_code', v_code, v_before, to_jsonb(row));
  return row;
exception
  when check_violation then
    raise exception 'A code takes either a percentage (1–100) or an amount off in paise, not both; uses must be positive, the window must end after it starts, and a commission is above 0 and at most 100%%' using errcode = '22023';
end;
$fn$;

-- admin_grant_trial  (was §30) ------------------------------------------
create or replace function public.admin_grant_trial(p_user uuid, p_minutes int, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_before jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if p_minutes is null or p_minutes < 1 or p_minutes > 525600 then
    raise exception 'Between 1 minute and a year.' using errcode = '22023';
  end if;
  select jsonb_build_object('trial_started_at', m.trial_started_at, 'trial_minutes', m.trial_minutes,
                            'trial_source', m.trial_source, 'trial_scope', m.trial_scope)
    into v_before from public.studio_members m where m.user_id = p_user;
  insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
  values (p_user, 'user', now(), p_minutes, 'admin', 'full')
  on conflict (user_id) do update
     set trial_started_at = now(), trial_minutes = excluded.trial_minutes,
         trial_source = 'admin', trial_scope = excluded.trial_scope;
  perform public.admin_audit_write('grant_trial', 'user', p_user::text, v_before,
    jsonb_build_object('trial_minutes', p_minutes, 'trial_source', 'admin', 'trial_scope', 'full'),
    left(p_note, 300));
  return jsonb_build_object('ok', true, 'user', p_user, 'minutes', p_minutes, 'note', p_note);
end;
$fn$;

-- admin_grant_email  (was §32) ------------------------------------------
create or replace function public.admin_grant_email(p_email text, p_role text default 'member',
                                                    p_plan text default null, p_days int default null,
                                                    p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  mail text := lower(btrim(coalesce(p_email, '')));
  pl   text := nullif(nullif(btrim(coalesce(p_plan, '')), ''), 'free');
  uid  uuid;
  done boolean := false;
  v_before jsonb;
  v_res    jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if mail !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an e-mail address.' using errcode = '22023';
  end if;
  if coalesce(p_role, '') not in ('member', 'admin') then
    raise exception 'Access is as a member or as an admin.' using errcode = '22023';
  end if;
  if pl is not null and not exists (select 1 from public.plans p where p.id = pl) then
    raise exception 'No such plan "%"', p_plan using errcode = '22023';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 3650) then
    raise exception 'A grant lasts 1 to 3650 days, or until you remove it.' using errcode = '22023';
  end if;

  select to_jsonb(g) into v_before from public.email_grants g where g.email = mail;
  perform public.undo_email_grant(mail);
  insert into public.email_grants (email, role, plan, until, note, created_by)
  values (mail, p_role, pl, case when p_days is null then null else now() + make_interval(days => p_days) end,
          nullif(left(btrim(coalesce(p_note, '')), 300), ''), auth.uid())
  on conflict (email) do update
     set role = excluded.role, plan = excluded.plan, until = excluded.until,
         note = excluded.note, created_by = excluded.created_by, created_at = now();

  select u.id into uid from auth.users u
   where lower(u.email) = mail and u.email_confirmed_at is not null limit 1;
  if uid is not null then done := public.apply_email_grant(uid); end if;

  v_res := (select jsonb_build_object('email', g.email, 'role', g.role, 'plan', g.plan, 'until', g.until,
                                      'applied', g.applied_user is not null, 'applied_at', g.applied_at,
                                      'applied_plan', g.applied_plan)
              from public.email_grants g where g.email = mail);
  perform public.admin_audit_write('grant_email', 'email_grant', mail, v_before,
    coalesce(v_res, '{}'::jsonb) || case when uid is not null then jsonb_build_object('user_id', uid) else '{}'::jsonb end,
    left(p_note, 300));
  return v_res;
end;
$fn$;

-- admin_revoke_email_grant  (was §32) -----------------------------------
create or replace function public.admin_revoke_email_grant(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  mail text := lower(btrim(coalesce(p_email, '')));
  v_before jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if not exists (select 1 from public.email_grants g where g.email = mail) then
    raise exception 'No access was given to that address.' using errcode = '22023';
  end if;
  select to_jsonb(g) || jsonb_build_object('user_id', g.applied_user) into v_before
    from public.email_grants g where g.email = mail;
  perform public.undo_email_grant(mail);
  delete from public.email_grants g where g.email = mail;
  perform public.admin_audit_write('revoke_email_grant', 'email_grant', mail, v_before, null);
end;
$fn$;

-- admin_decide_request  (was §14) ---------------------------------------
create or replace function public.admin_decide_request(p_user uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  r public.invite_requests;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  select * into r from public.invite_requests ir where ir.user_id = p_user for update;
  if r.user_id is null then
    raise exception 'No such request' using errcode = '22023';
  end if;
  if p_approve then
    insert into public.studio_members (user_id, role)
    values (p_user, 'user')
    on conflict (user_id) do update set disabled_at = null;
  end if;
  update public.invite_requests ir
     set status = case when p_approve then 'approved' else 'declined' end,
         decided_at = now(), decided_by = auth.uid(),
         decision_note = nullif(left(trim(coalesce(p_note, '')), 500), '')
   where ir.user_id = p_user;
  perform public.admin_audit_write('decide_request', 'invite_request', p_user::text,
    jsonb_build_object('status', r.status),
    jsonb_build_object('status', case when p_approve then 'approved' else 'declined' end, 'user_id', p_user),
    nullif(left(trim(coalesce(p_note, '')), 500), ''));
end;
$fn$;

-- admin_decide_refund_request  (was §27) --------------------------------
create or replace function public.admin_decide_refund_request(p_id uuid, p_decision text, p_note text default null)
returns public.refund_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare q public.refund_requests;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  if p_decision not in ('approved','declined') then raise exception 'Decision is approved or declined' using errcode = '22023'; end if;
  if p_decision = 'declined' and length(btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'Say why, in a sentence — the customer will read it' using errcode = '22023';
  end if;
  select * into q from public.refund_requests r where r.id = p_id for update;
  if q.id is null then raise exception 'No such request' using errcode = '22023'; end if;
  if q.status not in ('pending','approved') then raise exception 'That request was already %', q.status using errcode = '22023'; end if;
  perform public.admin_audit_write('decide_refund_request', 'refund_request', p_id::text,
    jsonb_build_object('status', q.status),
    jsonb_build_object('status', p_decision, 'user_id', q.user_id, 'payment_id', q.payment_id),
    nullif(left(btrim(coalesce(p_note, '')), 500), ''));
  update public.refund_requests r set status = p_decision, admin_note = nullif(left(btrim(coalesce(p_note, '')), 500), ''),
         decided_at = now(), decided_by = auth.uid()
   where r.id = p_id returning * into q;
  return q;
end;
$fn$;

-- admin_issue_invoice  (was §28) ----------------------------------------
-- issue_invoice() is idempotent: a payment that already has an invoice
-- gets it back. That call is NOT a change, so it leaves no audit row.
create or replace function public.admin_issue_invoice(p_payment uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  inv     public.invoices;
  existed boolean;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  existed := exists (select 1 from public.invoices i where i.payment_id = p_payment);
  inv := public.issue_invoice(p_payment);
  if not existed and inv.id is not null then
    perform public.admin_audit_write('issue_invoice', 'invoice', inv.id::text, null,
      jsonb_build_object('number', inv.number, 'payment_id', p_payment, 'user_id', inv.user_id,
                         'amount_paise', inv.amount_paise, 'currency', inv.currency));
  end if;
  return inv;
end;
$fn$;

-- admin_resend_receipt  (was §35) ---------------------------------------
create or replace function public.admin_resend_receipt(p_invoice uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v text;
  v_user uuid;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  update public.invoices i set emailed_at = null where i.id = p_invoice returning i.razorpay_order_id, i.user_id into v, v_user;
  if v is null then raise exception 'No such invoice, or it has no Razorpay order' using errcode = '22023'; end if;
  perform public.admin_audit_write('resend_receipt', 'invoice', p_invoice::text, null,
    jsonb_build_object('razorpay_order_id', v, 'user_id', v_user));
  return v;
end;
$fn$;

-- admin_reset_user  (was §25) -------------------------------------------
create or replace function public.admin_reset_user(p_user uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_members    int := 0;
  v_requests   int := 0;
  v_redeems    int := 0;
  v_sessions   int := 0;
  v_authrows   int := 0;
  v_authgone   boolean := false;
  v_target     public.studio_members;
  v_res        jsonb;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if p_user is null then
    raise exception 'No user given' using errcode = '22023';
  end if;
  -- Two refusals that stop a console from locking itself out. An admin
  -- clearing themselves would drop their own membership mid-click; an
  -- admin clearing a PEER would do it without that peer agreeing. Demote
  -- first, deliberately, then clear - two steps on purpose.
  if p_user = auth.uid() then
    raise exception 'You cannot clear your own account' using errcode = '42501';
  end if;
  select * into v_target from public.studio_members m where m.user_id = p_user;
  if v_target.role = 'admin' then
    raise exception 'That account is an administrator. Change their role first, then clear them.'
      using errcode = '42501';
  end if;

  delete from public.studio_members       where user_id = p_user;
  get diagnostics v_members  = row_count;
  delete from public.invite_requests      where user_id = p_user;
  get diagnostics v_requests = row_count;
  -- Frees the seat on whatever code they came in through: a code with
  -- max_uses 1, spent on somebody being cleared, becomes usable again.
  delete from public.invite_redemptions   where user_id = p_user;
  get diagnostics v_redeems  = row_count;
  -- The device lock. Without this the next sign-in can be refused as a
  -- second device by a session nobody is holding.
  delete from public.user_active_sessions where user_id = p_user;
  get diagnostics v_sessions = row_count;

  -- AND THE SESSION ITSELF, which is the part that makes the next
  -- sign-in a new one rather than a resumed one. Deleting the device
  -- lock above does NOT sign anybody out: their refresh token is still
  -- good and the browser keeps using it. This revokes it. Wrapped,
  -- because auth.sessions is not ours and a permissions change there
  -- must not cost the caller the rest of the reset.
  begin
    delete from auth.sessions where user_id = p_user;
    /* ROWS, not "no exception". Deleting zero rows succeeds, so the
       first version reported signed_out true for a user who had no
       session at all - including one that does not exist. An admin
       reading "signed out" would believe a session had been revoked
       when none had. Caught by the 25.1 probe on a non-existent uuid,
       8 Oct 2026. */
    get diagnostics v_authrows = row_count;
    v_authgone := v_authrows > 0;
  exception when others then
    v_authgone := false;
  end;

  v_res := jsonb_build_object(
    'membership_removed', v_members  > 0,
    'request_removed',    v_requests > 0,
    'redemptions_freed',  v_redeems,
    'device_lock_cleared', v_sessions > 0,
    'signed_out',         v_authgone,
    'note',               nullif(left(trim(coalesce(p_note, '')), 500), '')
  );
  perform public.admin_audit_write('reset_user', 'user', p_user::text,
    jsonb_build_object('role', v_target.role, 'was_member', v_members > 0), v_res,
    nullif(left(trim(coalesce(p_note, '')), 500), ''));
  return v_res;
end;
$fn$;

-- admin_terminate_session  (was §13.5) ----------------------------------
create or replace function public.admin_terminate_session(p_user uuid, p_disable boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n int;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if p_user = auth.uid() and p_disable then
    raise exception 'You cannot disable your own account' using errcode = '22023';
  end if;
  delete from public.user_active_sessions s where s.user_id = p_user;
  get diagnostics n = row_count;
  if p_disable then
    update public.studio_members m set disabled_at = now() where m.user_id = p_user;
  end if;
  perform public.admin_audit_write('terminate_session', 'user', p_user::text,
    jsonb_build_object('held_session', n > 0), jsonb_build_object('disabled', coalesce(p_disable, false)));
end;
$fn$;

-- admin_create_invite  (was §13.5) --------------------------------------
-- The row records the invite by id, kind, expiry and label. NEVER the code.
create or replace function public.admin_create_invite(
  p_pass_type text default 'standard',
  p_max_redemptions int default 1,
  p_expires_at timestamptz default null,
  p_target_project uuid default null,
  p_label text default null
)
returns public.invite_codes
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  v text;
  row public.invite_codes;
  i int;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  if p_pass_type = 'screening_pass' and p_expires_at is null then
    -- FR-103: a screening pass is time-limited by definition.
    raise exception 'A screening pass needs an expiry' using errcode = '22023';
  end if;
  loop
    bytes := gen_random_bytes(12);
    v := '';
    for i in 0..11 loop
      v := v || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes ic where ic.code = v);
  end loop;
  insert into public.invite_codes (code, pass_type, target_project_id, max_redemptions, expires_at, label, created_by)
  values (v, p_pass_type, p_target_project, greatest(1, p_max_redemptions), p_expires_at, left(p_label, 120), auth.uid())
  returning * into row;
  perform public.admin_audit_write('create_invite', 'invite', row.id::text, null,
    jsonb_build_object('pass_type', row.pass_type, 'max_redemptions', row.max_redemptions,
                       'expires_at', row.expires_at, 'target_project', row.target_project_id, 'label', row.label));
  return row;
end;
$fn$;

-- admin_revoke_invite  (was §13.5) --------------------------------------
create or replace function public.admin_revoke_invite(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_old public.invite_codes;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  select * into v_old from public.invite_codes ic where ic.id = p_id for update;
  update public.invite_codes ic set revoked_at = coalesce(ic.revoked_at, now()) where ic.id = p_id;
  -- Revoking an id that is not there changed nothing, as before: no row.
  if v_old.id is not null then
    perform public.admin_audit_write('revoke_invite', 'invite', p_id::text,
      jsonb_build_object('revoked_at', v_old.revoked_at, 'label', v_old.label),
      jsonb_build_object('revoked_at', coalesce(v_old.revoked_at, now())));
  end if;
end;
$fn$;

-- admin_mark_referral_paid  (was §22) -----------------------------------
-- One audit row per credit actually marked, so a person's page shows it.
create or replace function public.admin_mark_referral_paid(p_ids uuid[], p_note text default null)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  n int := 0;
  rec record;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  for rec in
    with u as (
      update public.referral_credits r
         set status = 'paid', paid_at = now(), paid_by = auth.uid(), paid_note = left(p_note, 300)
       where r.id = any (coalesce(p_ids, '{}')) and r.status = 'owed'
       returning r.id, r.referrer_user_id, r.amount_paise
    ) select * from u
  loop
    n := n + 1;
    perform public.admin_audit_write('mark_referral_paid', 'referral_credit', rec.id::text,
      jsonb_build_object('status', 'owed'),
      jsonb_build_object('status', 'paid', 'user_id', rec.referrer_user_id, 'amount_paise', rec.amount_paise),
      left(p_note, 300));
  end loop;
  return n;
end;
$fn$;

-- 40.5 GRANTS -----------------------------------------------------------
-- The helper is for definer bodies only. Everything else keeps the grants
-- it had: admin_* to authenticated, never to anon.
revoke execute on function public.admin_audit_write(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.admin_list_audit(text, text, text, timestamptz, timestamptz, int, timestamptz) from public, anon;
grant  execute on function public.admin_list_audit(text, text, text, timestamptz, timestamptz, int, timestamptz) to authenticated;

revoke execute on function public.admin_grant_plan(uuid, text, int, text)                  from public, anon;
revoke execute on function public.admin_set_plan(text, jsonb)                              from public, anon;
revoke execute on function public.admin_set_plan_price(text, text, int, int, timestamptz)  from public, anon;
revoke execute on function public.admin_set_next_price(text, int, timestamptz)             from public, anon;
revoke execute on function public.admin_set_billing_settings(jsonb)                        from public, anon;
revoke execute on function public.admin_set_refund_requests_enabled(boolean)               from public, anon;
revoke execute on function public.admin_set_promo_code(text, jsonb)                        from public, anon;
revoke execute on function public.admin_grant_trial(uuid, int, text)                       from public, anon;
revoke execute on function public.admin_grant_email(text, text, text, int, text)           from public, anon;
revoke execute on function public.admin_revoke_email_grant(text)                           from public, anon;
revoke execute on function public.admin_decide_request(uuid, boolean, text)                from public, anon;
revoke execute on function public.admin_decide_refund_request(uuid, text, text)            from public, anon;
revoke execute on function public.admin_issue_invoice(uuid)                                from public, anon;
revoke execute on function public.admin_resend_receipt(uuid)                               from public, anon;
revoke execute on function public.admin_reset_user(uuid, text)                             from public, anon;
revoke execute on function public.admin_terminate_session(uuid, boolean)                   from public, anon;
revoke execute on function public.admin_create_invite(text, int, timestamptz, uuid, text)  from public, anon;
revoke execute on function public.admin_revoke_invite(uuid)                                from public, anon;
revoke execute on function public.admin_mark_referral_paid(uuid[], text)                   from public, anon;
grant  execute on function public.admin_grant_plan(uuid, text, int, text)                  to authenticated;
grant  execute on function public.admin_set_plan(text, jsonb)                              to authenticated;
grant  execute on function public.admin_set_plan_price(text, text, int, int, timestamptz)  to authenticated;
grant  execute on function public.admin_set_next_price(text, int, timestamptz)             to authenticated;
grant  execute on function public.admin_set_billing_settings(jsonb)                        to authenticated;
grant  execute on function public.admin_set_refund_requests_enabled(boolean)               to authenticated;
grant  execute on function public.admin_set_promo_code(text, jsonb)                        to authenticated;
grant  execute on function public.admin_grant_trial(uuid, int, text)                       to authenticated;
grant  execute on function public.admin_grant_email(text, text, text, int, text)           to authenticated;
grant  execute on function public.admin_revoke_email_grant(text)                           to authenticated;
grant  execute on function public.admin_decide_request(uuid, boolean, text)                to authenticated;
grant  execute on function public.admin_decide_refund_request(uuid, text, text)            to authenticated;
grant  execute on function public.admin_issue_invoice(uuid)                                to authenticated;
grant  execute on function public.admin_resend_receipt(uuid)                               to authenticated;
grant  execute on function public.admin_reset_user(uuid, text)                             to authenticated;
grant  execute on function public.admin_terminate_session(uuid, boolean)                   to authenticated;
grant  execute on function public.admin_create_invite(text, int, timestamptz, uuid, text)  to authenticated;
grant  execute on function public.admin_revoke_invite(uuid)                                to authenticated;
grant  execute on function public.admin_mark_referral_paid(uuid[], text)                   to authenticated;

notify pgrst, 'reload schema';

-- 40.6 CHECKS TO RUN, none of which has been run live -------------------
--  1. anon and a non-admin: admin_list_audit() -> 42501; admin_audit_write()
--     -> 42501 for EVERY API role (permission denied: it is not callable).
--  2. anon and authenticated: select/insert/update/delete on admin_audit
--     -> permission denied.
--  3. as admin, grant a trial to a throwaway user; admin_list_audit() shows
--     one 'grant_trial' row with the actor's id and e-mail.
--  4. inside begin; ... rollback; an admin write followed by a forced error
--     leaves NO audit row and NO change.
--  5. as the table owner: update, delete and truncate on admin_audit all
--     raise 'The audit log is append-only.'
--  6. each restated writer still answers exactly as before (the §16–§39
--     test files pass unchanged: npm run test:schema).
--  7. re-running the section is a no-op (one trigger of each kind).
-- Test file: scripts/schema-tests/admin-audit.sql (run by npm run test:schema).
-- ============================================================
