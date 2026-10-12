-- ============================================================
-- SECTION 46 CHECKS — the role matrix
-- ------------------------------------------------------------
-- Runs after the whole schema, §40, §42, §45 and §46 have loaded. Own
-- people (…4601 upward). The base admin …000a is the owner §45's backfill
-- made. For every one of the twenty retrofitted writers and every kind of
-- caller: allowed means "does not stop at the role check" (a success, or a
-- later validation error, both fine); denied means exactly 42501.
-- Each probe runs inside a sub-transaction that is rolled back, so the
-- people and settings are the same for the next probe.
-- ============================================================
\set ON_ERROR_STOP on

create or replace function t.try(p_user uuid, p_sql text) returns text language plpgsql as $$
begin
  begin
    perform t.claims(p_user);
    execute p_sql;
    raise sqlstate 'P0999' using message = 'probe done';
  exception when others then
    perform t.reset();
    if sqlstate = 'P0999' then return 'ok'; end if;
    return sqlstate;
  end;
end $$;
grant execute on function t.try(uuid, text) to anon, authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004601', 'rm-finance@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004602', 'rm-support@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004603', 'rm-legacy@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004604', 'rm-member@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004605', 'rm-target@example.com',  now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004601', 'admin'),
  ('00000000-0000-4000-8000-000000004602', 'admin'),
  ('00000000-0000-4000-8000-000000004603', 'admin'),
  ('00000000-0000-4000-8000-000000004604', 'user'),
  ('00000000-0000-4000-8000-000000004605', 'user');
insert into public.admin_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000004601', 'finance'),
  ('00000000-0000-4000-8000-000000004602', 'support');
-- …4603 is an admin MEMBER with no admin_roles row on purpose.

begin;
select t.claims('00000000-0000-4000-8000-000000004603');
select t.ok(public.studio_role() = 'owner', '46.0 fixture: an admin with no admin_roles row reads as owner');
select t.reset();
commit;

-- ------------------------------------------------------------
-- The matrix: function, a call that reaches (or stops at) the role check,
-- and the non-owner roles allowed through.
-- ------------------------------------------------------------
create temp table rm_matrix (fn text, call_sql text, allowed text[]);
insert into rm_matrix values
  ('admin_decide_refund_request',  $$select public.admin_decide_refund_request('00000000-0000-4000-8000-0000000fffff', 'approved', null)$$, array['finance']),
  ('admin_issue_invoice',          $$select public.admin_issue_invoice('00000000-0000-4000-8000-0000000fffff')$$,                           array['finance']),
  ('admin_resend_receipt',         $$select public.admin_resend_receipt('00000000-0000-4000-8000-0000000fffff')$$,                          array['finance']),
  ('admin_set_promo_code',         $$select public.admin_set_promo_code('RM46TEST', '{"percent_off": 10}'::jsonb)$$,                        array['finance']),
  ('admin_mark_referral_paid',     $$select public.admin_mark_referral_paid(array['00000000-0000-4000-8000-0000000fffff']::uuid[], 'x')$$,  array['finance']),
  ('admin_grant_trial',            $$select public.admin_grant_trial('00000000-0000-4000-8000-000000004605', 30, 'rm')$$,                   array['support']),
  ('admin_terminate_session',      $$select public.admin_terminate_session('00000000-0000-4000-8000-000000004605', false)$$,                array['support']),
  ('admin_add_note',               $$select public.admin_add_note('00000000-0000-4000-8000-000000004605', 'rm note')$$,                     array['support']),
  ('admin_grant_plan',             $$select public.admin_grant_plan('00000000-0000-4000-8000-000000004605', 'nosuchplan', 30, 'rm')$$,      array[]::text[]),
  ('admin_set_plan',               $$select public.admin_set_plan('nosuchplan', '{}'::jsonb)$$,                                              array[]::text[]),
  ('admin_set_plan_price',         $$select public.admin_set_plan_price('nosuchplan', 'monthly', 100, 100, null)$$,                          array[]::text[]),
  ('admin_set_next_price',         $$select public.admin_set_next_price('nosuchplan', 100, null)$$,                                          array[]::text[]),
  ('admin_set_billing_settings',   $$select public.admin_set_billing_settings('{}'::jsonb)$$,                                                array[]::text[]),
  ('admin_set_refund_requests_enabled', $$select public.admin_set_refund_requests_enabled(true)$$,                                           array[]::text[]),
  ('admin_grant_email',            $$select public.admin_grant_email('rm-grant@example.com', 'member', null, 30, 'rm')$$,                    array[]::text[]),
  ('admin_revoke_email_grant',     $$select public.admin_revoke_email_grant('rm-grant@example.com')$$,                                       array[]::text[]),
  ('admin_decide_request',         $$select public.admin_decide_request('00000000-0000-4000-8000-0000000fffff', false, 'no')$$,              array[]::text[]),
  ('admin_reset_user',             $$select public.admin_reset_user('00000000-0000-4000-8000-0000000fffff', 'rm')$$,                         array[]::text[]),
  ('admin_create_invite',          $$select public.admin_create_invite('standard', 1, null, null, 'rm')$$,                                   array[]::text[]),
  ('admin_revoke_invite',          $$select public.admin_revoke_invite('00000000-0000-4000-8000-0000000fffff')$$,                            array[]::text[]);
grant select on rm_matrix to authenticated;

select t.ok((select count(*) from rm_matrix) = 20, '46.1 the matrix names all twenty retrofitted writers');
select t.ok((select count(*) from rm_matrix m join pg_proc p on p.proname = m.fn and p.pronamespace = 'public'::regnamespace
              where pg_get_functiondef(p.oid) like '%require_role(array[%'
                and (pg_get_functiondef(p.oid) like '%require_role(array[''' || (case when m.allowed = array[]::text[] then 'owner' else m.allowed[1] end) || ''']%')) = 20,
  '46.1 the live definition of each writer carries the role named in the matrix');

-- allowed / denied for every caller kind
do $$
declare
  m record;
  who record;
  got text;
  should_pass boolean;
begin
  for m in select * from rm_matrix order by fn loop
    for who in select * from (values
        ('owner',        '00000000-0000-4000-8000-00000000000a'::uuid),
        ('legacy-admin', '00000000-0000-4000-8000-000000004603'::uuid),
        ('finance',      '00000000-0000-4000-8000-000000004601'::uuid),
        ('support',      '00000000-0000-4000-8000-000000004602'::uuid),
        ('member',       '00000000-0000-4000-8000-000000004604'::uuid)) v(label, uid) loop
      should_pass := who.label in ('owner', 'legacy-admin') or who.label = any(m.allowed);
      got := t.try(who.uid, m.call_sql);
      if should_pass then
        perform t.ok(got is distinct from '42501', format('46.2 %s: %s is allowed (got %s)', m.fn, who.label, got));
      else
        perform t.ok(got = '42501', format('46.2 %s: %s is refused with 42501 (got %s)', m.fn, who.label, got));
      end if;
    end loop;
  end loop;
end $$;

-- anon cannot call any of them at all (grants unchanged)
select t.ok((select count(*) from rm_matrix m join pg_proc p on p.proname = m.fn and p.pronamespace = 'public'::regnamespace
              where has_function_privilege('anon', p.oid, 'execute')) = 0,
  '46.3 anon can execute none of the twenty writers (grants unchanged)');
select t.ok((select count(*) from rm_matrix m join pg_proc p on p.proname = m.fn and p.pronamespace = 'public'::regnamespace
              where has_function_privilege('authenticated', p.oid, 'execute')) = 20,
  '46.3 authenticated can still execute all twenty (the role check is inside)');

-- the sentence
begin;
select t.claims('00000000-0000-4000-8000-000000004601');
do $$
declare msg text;
begin
  begin
    perform public.admin_set_billing_settings('{}'::jsonb);
  exception when others then msg := sqlerrm;
  end;
  perform t.ok(msg like 'Your role (finance) cannot do this. It needs the owner role.', '46.4 the refusal names the role and the need: ' || coalesce(msg, '(none)'));
end $$;
select t.reset();
commit;

-- the audit row is still written for an allowed call, and a refused call leaves none
select t.reset();
do $$
declare before_n bigint; after_n bigint;
begin
  select count(*) into before_n from public.admin_audit;
  perform t.claims('00000000-0000-4000-8000-000000004601');
  begin perform public.admin_add_note('00000000-0000-4000-8000-000000004605', 'finance may not'); exception when others then null; end;
  perform t.reset();
  select count(*) into after_n from public.admin_audit;
  perform t.ok(after_n = before_n, '46.5 a refused call writes no audit row and no note');
  perform t.ok(not exists (select 1 from public.admin_notes where body = 'finance may not'), '46.5 and no note was stored');
end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004602');
select public.admin_add_note('00000000-0000-4000-8000-000000004605', 'support may');
select t.reset();
select t.ok(t.audits('add_note') >= 1 and exists (select 1 from public.admin_audit a where a.action = 'add_note' and a.actor = '00000000-0000-4000-8000-000000004602'),
  '46.5 an allowed call by support still writes its audit row with the actor');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000004601');
select public.admin_set_promo_code('RM46FIN', '{"percent_off": 5}'::jsonb);
select t.reset();
select t.ok(exists (select 1 from public.admin_audit a where a.action = 'set_promo_code' and a.actor = '00000000-0000-4000-8000-000000004601'),
  '46.5 finance setting a promo code still writes its audit row');
rollback;

-- re-running §46 is a no-op for the matrix: nobody lost access and the
-- backfilled owner can still reach everything.
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.studio_role() = 'owner' and t.try('00000000-0000-4000-8000-00000000000a', $$select public.admin_set_billing_settings('{}'::jsonb)$$) is distinct from '42501',
  '46.6 the backfilled owner still reaches the owner-only switch');
select t.reset();
commit;
