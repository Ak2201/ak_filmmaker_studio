-- billing_status() as of main 99ba52b - supabase-schema.sql lines 7207-7284 plus its two grant lines.
-- Two changes vs the live copy: the key 'trial_minutes', and a full trial no longer
-- swaps the trial plan's features over a BOUGHT plan (and pl = 'free'). Re-run as one statement block.
create or replace function public.billing_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  uid    uuid := auth.uid();
  pl     text;
  acc    public.accounts;
  lim    jsonb;
  s      public.billing_settings;
  m      public.studio_members;
  t_ends timestamptz;
  t_on   boolean;
  feat   jsonb;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  pl := public.user_plan(uid);
  select * into acc from public.accounts a where a.owner_id = uid
   order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last limit 1;
  lim := public.user_limits(uid);
  select * into s from public.billing_settings x where x.id;
  select * into m from public.studio_members x where x.user_id = uid;
  t_ends := public.trial_ends_at(uid);
  t_on   := public.trial_active(uid);

  -- A 'full' scope trial (what an invite code buys) shows the whole
  -- studio by borrowing another plan's features. A 'sample' trial — what
  -- signing up buys — uses the free plan's own map, which section 18
  -- already seeded as {"sample_only": true, "new_projects": false}. That
  -- is why the trial needed no new gating on the client.
  feat := coalesce((select p.features from public.plans p where p.id = pl), '{}'::jsonb);
  -- Only while the person has not paid: a buyer whose trial is still
  -- running keeps the plan they BOUGHT, not the trial plan's map (a Pro
  -- buyer was held to Indie's features until the trial clock ran out).
  if t_on and m.trial_scope = 'full' and pl = 'free' then
    feat := coalesce((select p.features from public.plans p
                       where p.id = coalesce(s.trial_plan, 'indie')), '{}'::jsonb);
  end if;

  return jsonb_build_object(
    'plan',        pl,
    'plan_name',   (select name from public.plans where id = pl),
    'limits',      lim,
    'features',    feat,
    'account_id',  acc.id,
    'account_name', acc.name,
    'plan_until',  case when pl <> 'free' then acc.plan_until end,
    'bought_plan', acc.plan,
    'lapsed',      acc.plan is not null and acc.plan <> 'free' and acc.plan_until is not null and acc.plan_until <= now(),
    'disabled',    exists (select 1 from public.studio_members x where x.user_id = uid and x.disabled_at is not null),
    'member',      exists (select 1 from public.studio_members x where x.user_id = uid and x.disabled_at is null),
    -- section 30
    'trial_enabled', coalesce(s.trial_enabled, false),
    'trial_active',  t_on,
    'trial_ends_at', t_ends,
    'trial_minutes', coalesce(s.trial_minutes, 30),
    'trial_used',    m.trial_started_at is not null,
    'trial_source',  m.trial_source,
    'trial_scope',   case when t_on then m.trial_scope end,
    'entitled',      (pl <> 'free') or t_on,
    'usage', jsonb_build_object(
      'projects',      (select count(*) from public.projects p where p.owner_id = uid),
      'shares',        (select count(*) from public.shares sh join public.projects p on p.id = sh.project_id
                         where p.owner_id = uid and (sh.expires_at is null or sh.expires_at > now())),
      'collaborators', (select coalesce(max(c), 0) from (select count(*) c from public.project_collaborators pc
                         join public.projects p on p.id = pc.project_id where p.owner_id = uid group by pc.project_id) t),
      'seats',         (select count(*) from public.account_members am where am.account_id = acc.id and am.status in ('pending','active'))
    ),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'plan_id', x.plan_id, 'period', x.period,
                   'amount_paise', x.amount_paise, 'status', x.status, 'created_at', x.created_at, 'ends_at', x.ends_at)
                   order by x.created_at desc)
                  from (select * from public.payments q where q.user_id = uid order by q.created_at desc limit 12) x), '[]'::jsonb)
  );
end;
$fn$;

revoke execute on function public.billing_status()                          from public, anon;
grant  execute on function public.billing_status()                          to authenticated;
