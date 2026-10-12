-- ============================================================
-- 41. LAUNCH AND HEALTH — what the live database says about itself
--     (Admin console v2, docs/ADMIN-CONSOLE-PLAN.md §3.2)
--     NOT RUN LIVE. Standalone file; supabase-schema.sql is not edited.
-- ------------------------------------------------------------
-- The console's "Launch & health" tab needs one read that is made of
-- LIVE state and not of what the repository says should be live. The
-- lessons it exists for are in CLAUDE.md: rzp-refund answered 404 for
-- three days while the docs said it was deployed, and plans.features
-- sat EMPTY on all three paid tiers until somebody asked the table.
--
--   41.1  three internal probes (revoked from everybody)
--   41.2  admin_health()          one jsonb, every figure OBSERVED
--   41.3  admin_launch_preview()  who the purchases switch would wall
--   41.4  grants
--   41.5  CHECKS TO RUN
--
-- RULES THE FUNCTIONS FOLLOW
--   * A probe reports what it saw. It never names a likely cause: a
--     missing marker is "marker X not found", not "section N was not
--     run" (the marker could have been dropped, renamed or never made).
--   * A probe that itself raises does not take the report down: its
--     slot carries {"error": <sqlstate>, "message": <sqlerrm>}, which is
--     what was observed. An empty slot that reads as "all clear" is the
--     hue-assertion trap applied to a dashboard.
--   * Read-only. Nothing here writes, so nothing here calls
--     admin_audit_write() (section 40).
--   * Edge-function reachability, Razorpay mode and whether Resend is
--     configured cannot be seen from SQL. The client probes the first
--     two; the third is only INFERRED, from receipts that were never
--     mailed (`receipts` below says so).
--
-- THE PURCHASES SWITCH, AND ITS ROLLBACK. There is no purchase_switch
-- log table and this section adds none. Rolling the switch back needs
-- NOTHING NEW: admin_set_billing_settings('{"purchase_required":false}')
-- (section 39.2) is never refused, and giving access back is the one
-- direction it will not second-guess. When the switch was last thrown
-- and by whom is NOT recoverable from billing_settings: its updated_at /
-- updated_by move on ANY setting (a trial length, a price cap), so
-- reading them as "the switch" would be a guess. They are reported under
-- billing_settings_last_touched, labelled as any-setting. The switch's
-- own history is an audit row (section 40, action on target
-- 'billing_settings'), and the console reads it from admin_list_audit().
-- That is why there is no admin_switch_state() here.
-- ============================================================

-- 41.1 INTERNAL PROBES ---------------------------------------------------
create or replace function public.health_has_fn(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = p_name);
$$;

create or replace function public.health_has_col(p_table text, p_col text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = p_table and c.column_name = p_col);
$$;

/** Does project_data's scope CHECK name this scope? Read from pg_constraint. */
create or replace function public.health_scope_check_has(p_scope text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(bool_or(pg_get_constraintdef(con.oid) like '%''' || p_scope || '''%'), false)
    from pg_constraint con
   where con.conrelid = to_regclass('public.project_data')
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%scope%';
$$;

revoke execute on function public.health_has_fn(text)         from public, anon, authenticated;
revoke execute on function public.health_has_col(text, text)  from public, anon, authenticated;
revoke execute on function public.health_scope_check_has(text) from public, anon, authenticated;

-- 41.2 admin_health() -----------------------------------------------------
/** The whole report, one jsonb. Keys:
 *    observed_at
 *    sections      {expected, present[], missing[{section, marker}], shared_marker[]}
 *    plan_features [{plan, active, keys, enabled, empty}]  paid tiers only
 *    purchases_required, trial_offer, price_notice (raw + sanity)
 *    receipts, payments, refunds, invite_requests, wall
 *    billing_settings_last_touched  (ANY setting, not the switch — see header)
 *    checks        [{id, level, observed}]  level: ok | warn | info | unknown
 *  Each probe's slot is its value or {"error", "message"}. */
create or replace function public.admin_health()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  v_sections  jsonb;
  v_features  jsonb;
  v_req       jsonb;
  v_trial     jsonb;
  v_price     jsonb;
  v_receipts  jsonb;
  v_payments  jsonb;
  v_refunds   jsonb;
  v_requests  jsonb;
  v_wall      jsonb;
  v_touched   jsonb;
  v_checks    jsonb := '[]'::jsonb;
  v_missing   jsonb;
  v_n         int;
  v_age       numeric;
  v_x         jsonb;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;

  -- SECTIONS --------------------------------------------------------------
  -- One marker object per section, chosen by reading the section's text.
  -- Sections 8 and 9 and 10 repair earlier ones and add little of their
  -- own, so their markers are policies / the realtime membership those
  -- sections (re)created. Section 36 is DATA (the matrix written into
  -- plans.features), so its marker is "no paid tier's map is empty".
  begin
    with m(section, marker, present) as (values
      ( 1, 'table projects',                      to_regclass('public.projects') is not null),
      ( 2, 'table project_data',                  to_regclass('public.project_data') is not null),
      ( 3, 'table project_collaborators',         to_regclass('public.project_collaborators') is not null),
      ( 4, 'table shares',                        to_regclass('public.shares') is not null),
      ( 5, 'table comments',                      to_regclass('public.comments') is not null),
      ( 6, 'table accounts',                      to_regclass('public.accounts') is not null),
      ( 7, 'function is_privileged_caller',       public.health_has_fn('is_privileged_caller')),
      ( 8, 'policy proj_select on projects',      exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projects' and policyname = 'proj_select')),
      ( 9, 'policy sh_owner_select on shares',    exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shares' and policyname = 'sh_owner_select')),
      (10, 'project_data in supabase_realtime',   exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_data')),
      (11, 'function claim_invite',               public.health_has_fn('claim_invite')),
      (12, 'scope check names songs',             public.health_scope_check_has('songs')),
      (13, 'table invite_codes',                  to_regclass('public.invite_codes') is not null),
      (14, 'table invite_requests',               to_regclass('public.invite_requests') is not null),
      (15, 'function admin_overview',             public.health_has_fn('admin_overview')),
      (16, 'table plans',                         to_regclass('public.plans') is not null),
      (17, 'scope check names deliverables',      public.health_scope_check_has('deliverables')),
      (18, 'column plans.features',               public.health_has_col('plans', 'features')),
      (19, 'trigger accounts_guard fires on insert',
             exists (select 1 from pg_trigger t where t.tgname = 'accounts_guard' and t.tgrelid = to_regclass('public.accounts') and (t.tgtype & 4) = 4)),
      (20, 'table promo_codes',                   to_regclass('public.promo_codes') is not null),
      (21, 'function paid_credit_paise',          public.health_has_fn('paid_credit_paise')),
      (22, 'table referral_credits',              to_regclass('public.referral_credits') is not null),
      (23, 'function admin_affiliate_report',     public.health_has_fn('admin_affiliate_report')),
      (24, 'scope check names characters',        public.health_scope_check_has('characters')),
      (25, 'function admin_reset_user',           public.health_has_fn('admin_reset_user')),
      (26, 'function enforce_project_limit',      public.health_has_fn('enforce_project_limit')),
      (27, 'table refunds',                       to_regclass('public.refunds') is not null),
      (28, 'table invoices',                      to_regclass('public.invoices') is not null),
      (29, 'table leads',                         to_regclass('public.leads') is not null),
      (30, 'column studio_members.trial_started_at', public.health_has_col('studio_members', 'trial_started_at')),
      (31, 'table plan_prices',                   to_regclass('public.plan_prices') is not null),
      (32, 'table email_grants',                  to_regclass('public.email_grants') is not null),
      (33, 'function trial_offer',                public.health_has_fn('trial_offer')),
      (34, 'function payments_refund_trial',      public.health_has_fn('payments_refund_trial')),
      (35, 'function admin_resend_receipt',       public.health_has_fn('admin_resend_receipt')),
      (36, 'data: no paid plan has an empty features map',
             to_regclass('public.plans') is not null and public.health_has_col('plans', 'features')
             and not exists (select 1 from public.plans p where p.id <> 'free' and p.features = '{}'::jsonb)
             and exists (select 1 from public.plans p where p.id <> 'free')),
      (37, 'scope check names write_goals',       public.health_scope_check_has('write_goals')),
      (38, 'constraint plans_free_not_offered',   exists (select 1 from pg_constraint where conname = 'plans_free_not_offered')),
      (39, 'function admin_purchase_wall',        public.health_has_fn('admin_purchase_wall'))
    )
    select coalesce(jsonb_agg(jsonb_build_object('section', section, 'marker', marker) order by section) filter (where not present), '[]'::jsonb),
           jsonb_build_object(
             'expected', count(*),
             'present',  coalesce(jsonb_agg(section order by section) filter (where present), '[]'::jsonb))
      into v_missing, v_sections
      from m;
    v_sections := v_sections || jsonb_build_object(
      'missing', v_missing,
      -- sections whose marker is a repair shared with, or the same kind as,
      -- another's: a hit proves the object, not that every statement ran
      'weak_markers', jsonb_build_array(8, 9, 10, 19, 36));
  exception when others then
    v_sections := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
    v_missing := null;
  end;

  -- PLAN FEATURES ---------------------------------------------------------
  begin
    select coalesce(jsonb_agg(jsonb_build_object(
             'plan', p.id, 'active', p.active,
             'keys', (select count(*) from jsonb_object_keys(p.features)),
             'enabled', (select count(*) from jsonb_each(p.features) e where e.value = 'true'::jsonb),
             'empty', p.features = '{}'::jsonb) order by p.sort), '[]'::jsonb)
      into v_features
      from public.plans p where p.id <> 'free';
  exception when others then
    v_features := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- THE SWITCH, THE TRIAL, THE PRICES --------------------------------------
  begin
    v_req := to_jsonb(public.purchases_required());
  exception when others then
    v_req := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;
  begin
    v_trial := public.trial_offer();
  exception when others then
    v_trial := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;
  begin
    v_x := public.price_notice();
    v_price := jsonb_build_object(
      'notice', v_x,
      'plans_listed',    jsonb_array_length(coalesce(v_x -> 'plans', '[]'::jsonb)),
      'free_listed',     exists (select 1 from jsonb_array_elements(coalesce(v_x -> 'plans', '[]'::jsonb)) e where e ->> 'id' = 'free'),
      'zero_or_null_price', (select count(*) from jsonb_array_elements(coalesce(v_x -> 'plans', '[]'::jsonb)) e
                              where coalesce((e ->> 'price_paise')::int, 0) <= 0),
      'rising',          exists (select 1 from jsonb_array_elements(coalesce(v_x -> 'plans', '[]'::jsonb)) e where (e ->> 'rising')::boolean));
  exception when others then
    v_price := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- RECEIPTS ---------------------------------------------------------------
  -- "Awaiting" = an invoice with a buyer e-mail and no emailed_at. A mail
  -- that FAILED releases its claim (section 35), so it lands here; so does
  -- an invoice issued before section 35, which was left unclaimed on
  -- purpose. The two are told apart by age only: `awaiting_recent` is
  -- issued in the last 7 days. Whether Resend is configured is NOT
  -- observable; a recent invoice that is still awaiting is what is seen.
  begin
    select jsonb_build_object(
             'awaiting',            count(*) filter (where i.emailed_at is null and coalesce(btrim(i.buyer_email), '') <> ''),
             'awaiting_recent',     count(*) filter (where i.emailed_at is null and coalesce(btrim(i.buyer_email), '') <> '' and i.issued_at > now() - interval '7 days'),
             'oldest_awaiting_age_seconds',
                 (extract(epoch from now() - min(i.issued_at) filter (where i.emailed_at is null and coalesce(btrim(i.buyer_email), '') <> '')))::bigint,
             'no_buyer_email',      count(*) filter (where coalesce(btrim(i.buyer_email), '') = ''),
             'invoices',            count(*),
             'resend_configured',   'not observable from SQL')
      into v_receipts
      from public.invoices i;
  exception when others then
    v_receipts := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- PAYMENTS -----------------------------------------------------------------
  -- No table records a webhook delivery, so "last webhook seen" is not
  -- observable; the newest capture and newest settled refund are given
  -- instead, which is what a working webhook leaves behind.
  begin
    select jsonb_build_object(
             'created_older_than_1h',        count(*) filter (where p.status = 'created' and p.created_at < now() - interval '1 hour'),
             'oldest_created_age_seconds',   (extract(epoch from now() - min(p.created_at) filter (where p.status = 'created' and p.created_at < now() - interval '1 hour')))::bigint,
             'paid',                         count(*) filter (where p.status = 'paid'),
             'last_paid_at',                 max(p.paid_at) filter (where p.status = 'paid'),
             'last_webhook_seen',            'not observable from SQL')
      into v_payments
      from public.payments p;
  exception when others then
    v_payments := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- REFUNDS -------------------------------------------------------------------
  begin
    select jsonb_build_object(
             'requests_pending',              (select count(*) from public.refund_requests r where r.status = 'pending'),
             'oldest_pending_age_seconds',    (select (extract(epoch from now() - min(r.created_at)))::bigint from public.refund_requests r where r.status = 'pending'),
             'requests_approved_not_refunded',(select count(*) from public.refund_requests r where r.status = 'approved'),
             'refunds_in_flight',             (select count(*) from public.refunds f where f.status in ('initiated', 'pending')),
             'refunds_failed',                (select count(*) from public.refunds f where f.status = 'failed'),
             'last_refund_processed_at',      (select max(f.processed_at) from public.refunds f where f.status = 'processed'))
      into v_refunds;
  exception when others then
    v_refunds := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- INVITE REQUESTS -----------------------------------------------------------
  begin
    select jsonb_build_object(
             'pending', count(*),
             'oldest_age_seconds', (extract(epoch from now() - min(q.requested_at)))::bigint)
      into v_requests
      from public.invite_requests q where q.status = 'pending';
  exception when others then
    v_requests := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- THE WALL CENSUS (section 39) -----------------------------------------------
  begin
    v_wall := public.admin_purchase_wall();
  exception when others then
    v_wall := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- WHEN BILLING SETTINGS LAST MOVED (any setting) -------------------------------
  begin
    select jsonb_build_object(
             'at', s.updated_at, 'by', s.updated_by,
             'by_email', (select u.email::text from auth.users u where u.id = s.updated_by),
             'scope', 'any billing setting, not only purchase_required')
      into v_touched
      from public.billing_settings s where s.id;
  exception when others then
    v_touched := jsonb_build_object('error', sqlstate, 'message', sqlerrm);
  end;

  -- CHECKS: each one states the level and the observation, nothing else --------
  if v_sections ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'sections', 'level', 'unknown', 'observed', 'the section probe raised ' || (v_sections ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'sections',
      'level', case when jsonb_array_length(v_missing) = 0 then 'ok' else 'warn' end,
      'observed', jsonb_array_length(v_sections -> 'present') || ' of ' || (v_sections ->> 'expected') || ' markers found'
                  || case when jsonb_array_length(v_missing) > 0
                          then '; not found: ' || (select string_agg('§' || (e ->> 'section') || ' (' || (e ->> 'marker') || ')', ', ') from jsonb_array_elements(v_missing) e)
                          else '' end);
  end if;

  if jsonb_typeof(v_features) = 'array' then
    select count(*) into v_n from jsonb_array_elements(v_features) e where (e ->> 'empty')::boolean;
    v_checks := v_checks || jsonb_build_object('id', 'plan_features',
      'level', case when jsonb_array_length(v_features) = 0 then 'warn' when v_n = 0 then 'ok' else 'warn' end,
      'observed', jsonb_array_length(v_features) || ' paid plan row(s); ' || v_n || ' with an empty features map');
  else
    v_checks := v_checks || jsonb_build_object('id', 'plan_features', 'level', 'unknown', 'observed', 'the plans probe raised ' || (v_features ->> 'error'));
  end if;

  if jsonb_typeof(v_req) = 'boolean' then
    v_checks := v_checks || jsonb_build_object('id', 'purchases_required', 'level', 'info',
      'observed', 'purchases_required() answers ' || (v_req #>> '{}'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'purchases_required', 'level', 'unknown', 'observed', 'purchases_required() raised ' || coalesce(v_req ->> 'error', '?'));
  end if;

  if v_trial ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'trial_offer', 'level', 'unknown', 'observed', 'trial_offer() raised ' || (v_trial ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'trial_offer',
      'level', case when coalesce((v_trial ->> 'trial_minutes')::int, 0) between 1 and 44640 then 'ok' else 'warn' end,
      'observed', 'trial_enabled ' || coalesce(v_trial ->> 'trial_enabled', 'null') || ', ' || coalesce(v_trial ->> 'trial_minutes', 'null') || ' minutes');
  end if;

  if v_price ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'price_notice', 'level', 'unknown', 'observed', 'price_notice() raised ' || (v_price ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'price_notice',
      'level', case when (v_price ->> 'plans_listed')::int >= 3
                         and (v_price ->> 'zero_or_null_price')::int = 0
                         and not (v_price ->> 'free_listed')::boolean then 'ok' else 'warn' end,
      'observed', (v_price ->> 'plans_listed') || ' plan(s) listed, ' || (v_price ->> 'zero_or_null_price') || ' at a zero or missing price, free plan listed: ' || (v_price ->> 'free_listed'));
  end if;

  if v_receipts ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'receipts', 'level', 'unknown', 'observed', 'the invoices probe raised ' || (v_receipts ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'receipts',
      'level', case when (v_receipts ->> 'awaiting_recent')::int = 0 then 'ok' else 'warn' end,
      'observed', (v_receipts ->> 'awaiting_recent') || ' invoice(s) issued in the last 7 days with no mail recorded; '
                  || (v_receipts ->> 'awaiting') || ' in all');
  end if;

  if v_payments ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'payments_created', 'level', 'unknown', 'observed', 'the payments probe raised ' || (v_payments ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'payments_created',
      'level', case when (v_payments ->> 'created_older_than_1h')::int = 0 then 'ok' else 'info' end,
      'observed', (v_payments ->> 'created_older_than_1h') || ' payment(s) still in created after an hour');
  end if;

  if v_refunds ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'refunds', 'level', 'unknown', 'observed', 'the refunds probe raised ' || (v_refunds ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'refunds',
      'level', case when (v_refunds ->> 'requests_pending')::int + (v_refunds ->> 'requests_approved_not_refunded')::int
                         + (v_refunds ->> 'refunds_in_flight')::int + (v_refunds ->> 'refunds_failed')::int = 0 then 'ok' else 'warn' end,
      'observed', (v_refunds ->> 'requests_pending') || ' request(s) pending, ' || (v_refunds ->> 'requests_approved_not_refunded')
                  || ' approved and not refunded, ' || (v_refunds ->> 'refunds_in_flight') || ' in flight, ' || (v_refunds ->> 'refunds_failed') || ' failed');
  end if;

  if v_requests ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'invite_requests', 'level', 'unknown', 'observed', 'the invite-request probe raised ' || (v_requests ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'invite_requests',
      'level', case when (v_requests ->> 'pending')::int = 0 then 'ok' else 'info' end,
      'observed', (v_requests ->> 'pending') || ' invite request(s) pending');
  end if;

  if v_wall ? 'error' then
    v_checks := v_checks || jsonb_build_object('id', 'purchase_wall', 'level', 'unknown', 'observed', 'admin_purchase_wall() raised ' || (v_wall ->> 'error'));
  else
    v_checks := v_checks || jsonb_build_object('id', 'purchase_wall',
      'level', case when (v_wall ->> 'grandfathered_walled')::int > 0 then 'warn' else 'ok' end,
      'observed', (v_wall ->> 'members') || ' member(s): ' || (v_wall ->> 'paid') || ' paid, ' || (v_wall ->> 'in_trial') || ' in a trial, '
                  || (v_wall ->> 'walled') || ' walled or would be, of whom ' || (v_wall ->> 'grandfathered_walled') || ' grandfathered');
  end if;

  return jsonb_build_object(
    'observed_at',        now(),
    'sections',           v_sections,
    'plan_features',      v_features,
    'purchases_required', v_req,
    'trial_offer',        v_trial,
    'price_notice',       v_price,
    'receipts',           v_receipts,
    'payments',           v_payments,
    'refunds',            v_refunds,
    'invite_requests',    v_requests,
    'wall',               v_wall,
    'billing_settings_last_touched', v_touched,
    'checks',             v_checks);
end;
$fn$;

-- 41.3 admin_launch_preview() ---------------------------------------------
/** Who the purchases switch walls, or — when it is already on — who it
 *  is walling. It REUSES admin_purchase_wall() for the census and lists
 *  the same population: members who are not disabled, on no plan, with
 *  no live trial. Two facts the census does not subtract are given per
 *  person instead, so the console can say them in a sentence:
 *    email_grant   a plan-less e-mail grant is standing, which
 *                  billing_status() treats as entitled (section 33)
 *    grandfathered trial_source 'admin' and a year-long trial (section 30)
 *  `members` is capped at 500 rows (`truncated` says so). Nothing is
 *  written; rollback is admin_set_billing_settings with purchase_required
 *  false, which section 39 never refuses. */
create or replace function public.admin_launch_preview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  v_wall   jsonb;
  v_rows   jsonb;
  v_total  int;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  v_wall := public.admin_purchase_wall();

  with walled as (
    select m.user_id, m.created_at, m.trial_source, m.trial_minutes, m.trial_started_at,
           public.trial_ends_at(m.user_id)                      as trial_ends_at,
           coalesce(m.trial_source = 'admin' and m.trial_minutes >= 525600, false) as grandfathered,
           public.email_grant_active(m.user_id)                  as email_grant
      from public.studio_members m
     where m.disabled_at is null
       and public.user_plan(m.user_id) = 'free'
       and not public.trial_active(m.user_id)
  )
  select (select count(*) from walled),
         coalesce(jsonb_agg(jsonb_build_object(
                    'user_id', x.user_id,
                    'email', (select u.email::text from auth.users u where u.id = x.user_id),
                    'member_since', x.created_at,
                    'trial_source', x.trial_source,
                    'trial_started_at', x.trial_started_at,
                    'trial_ends_at', x.trial_ends_at,
                    'grandfathered', x.grandfathered,
                    'email_grant', x.email_grant) order by x.grandfathered desc, x.created_at), '[]'::jsonb)
    into v_total, v_rows
    from (select * from walled order by grandfathered desc, created_at limit 500) x;

  return jsonb_build_object(
    'observed_at',          now(),
    'switch_on',            coalesce((v_wall ->> 'purchase_required')::boolean, false),
    'census',               v_wall,
    'would_wall_count',     v_total,
    'would_wall_after_grants', (select count(*) from jsonb_array_elements(v_rows) e where not (e ->> 'email_grant')::boolean),
    'blocked_by_grandfathered', coalesce((v_wall ->> 'grandfathered_walled')::int, 0),
    'can_throw',            coalesce((v_wall ->> 'grandfathered_walled')::int, 0) = 0,
    'members',              v_rows,
    'truncated',            v_total > 500,
    'rollback',             jsonb_build_object(
                              'call', 'admin_set_billing_settings',
                              'patch', jsonb_build_object('purchase_required', false),
                              'needs_new_object', false));
end;
$fn$;

-- 41.4 GRANTS ---------------------------------------------------------------
revoke execute on function public.admin_health()          from public, anon;
revoke execute on function public.admin_launch_preview()  from public, anon;
grant  execute on function public.admin_health()          to authenticated;
grant  execute on function public.admin_launch_preview()  to authenticated;

notify pgrst, 'reload schema';

-- 41.5 CHECKS TO RUN ------------------------------------------------------
--  1. anon and a non-admin: admin_health(), admin_launch_preview() -> 42501.
--  2. admin: admin_health() on the live project lists every section as
--     present except those whose marker is genuinely absent; §36 reads
--     present only while no paid tier's features map is empty.
--  3. inside a rolled-back transaction, drop one marker (e.g.
--     `drop table plan_prices cascade`): admin_health() lists section 31
--     under sections.missing and checks[id=sections].level is 'warn'.
--  4. purchases_required answers the same value the anon RPC answers.
--  5. admin_launch_preview(): would_wall_count equals admin_purchase_wall()
--     .walled; blocked_by_grandfathered equals .grandfathered_walled.
--  6. read-back after the owner runs the section, as the owner:
--       select jsonb_array_length(admin_health() -> 'checks');   -- 10
--       select admin_launch_preview() ->> 'can_throw';
-- Test file: scripts/schema-tests/admin-health.sql (npm run test:schema).
-- ============================================================
