-- ============================================================
-- SECTION 49 CHECKS — the co-editing switch
-- ------------------------------------------------------------
-- Runs after §40, §45, §46 and §49. People from earlier files: the
-- owner …000a, the finance admin …4601 and the plain member …4604
-- (role-matrix.sql).
-- ============================================================
\set ON_ERROR_STOP on

select t.ok(public.co_editing_enabled() = false, '49.1 the switch starts OFF');

begin;
select t.claims('00000000-0000-4000-8000-000000004604');
select t.ok(public.co_editing_enabled() = false, '49.2 anyone signed in can read it');
select t.ok(t.raises($$select public.admin_set_co_editing_enabled(true)$$, '42501'), '49.3 a member cannot turn it on');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000004601');
select t.ok(t.raises($$select public.admin_set_co_editing_enabled(true)$$, '42501'), '49.4 a finance admin cannot either: it is the owner''s switch');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_set_co_editing_enabled(null)$$, '22023'), '49.5 null is refused: say on or off');
select t.ok(public.admin_set_co_editing_enabled(true) = true, '49.6 the owner turns it on');
select t.reset();
commit;

select t.ok(public.co_editing_enabled() = true, '49.7 and everyone now reads ON');
select t.ok(exists (select 1 from public.admin_audit where action = 'set_co_editing_enabled' and after ->> 'enabled' = 'true'),
  '49.8 the change is in the audit log');

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_co_editing_enabled(false);
select t.reset();
commit;
select t.ok(public.co_editing_enabled() = false, '49.9 and back OFF, so later files see the default');
