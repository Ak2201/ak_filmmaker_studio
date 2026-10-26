-- ============================================================
-- SECTION 59 CHECKS — testimonials: consent, RLS, revoke, approval
-- Its own people (…59xx): two authors, an owner-role administrator and a
-- support-role administrator; and anon.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005901', 'tm-author1@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005902', 'tm-author2@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005903', 'tm-owner@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000005904', 'tm-support@example.com', now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000005901', 'user'),
  ('00000000-0000-4000-8000-000000005902', 'user'),
  ('00000000-0000-4000-8000-000000005903', 'admin'),
  ('00000000-0000-4000-8000-000000005904', 'admin');
insert into public.admin_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000005903', 'owner'),
  ('00000000-0000-4000-8000-000000005904', 'support');

create or replace function t.tm_consent() returns text language sql as $$
  select 'I agree that my words, name, role and film may be shown on the public site. I can take this back in Settings.'::text $$;

-- 1. an author submits; the database stamps the consent time and the author
begin;
select t.claims('00000000-0000-4000-8000-000000005901');
select t.ok((select r.status = 'pending' and r.author = '00000000-0000-4000-8000-000000005901'::uuid and r.consented_at is not null
               from public.submit_testimonial('  It planned my first short from script to call sheet.  ', 'Author One', 'Director', 'Small Film', t.tm_consent()) r),
  '59. an author submits: pending, theirs, consent time set by the database');
select t.ok((select quote = 'It planned my first short from script to call sheet.' from public.my_testimonials() limit 1),
  '59. the quote is stored trimmed');
-- a direct insert, through the column grant and the policy
insert into public.testimonials (quote, display_name, consent_text) values ('A direct insert, still mine and pending.', 'Author One', t.tm_consent());
select t.ok((select count(*) = 2 from public.my_testimonials()), '59. a direct insert of the granted columns is allowed and is the author''s');
do $$ begin
  insert into public.testimonials (quote, display_name, consent_text, status) values ('Trying to publish my own words directly.', 'A', t.tm_consent(), 'approved');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. an author cannot set status -> 42501'; end $$;
do $$ begin
  insert into public.testimonials (quote, display_name, consent_text, author) values ('Trying to write as somebody else here.', 'A', t.tm_consent(), '00000000-0000-4000-8000-000000005902');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. an author cannot set author -> 42501'; end $$;
do $$ begin
  insert into public.testimonials (quote, display_name, consent_text, consented_at) values ('Trying to backdate the consent here.', 'A', t.tm_consent(), now() - interval '1 year');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. an author cannot set consented_at -> 42501'; end $$;
do $$ begin
  update public.testimonials set status = 'approved';
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. an author cannot update a row (status) -> 42501'; end $$;
do $$ begin
  delete from public.testimonials;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. an author cannot delete -> 42501'; end $$;
do $$ begin
  perform public.submit_testimonial('short', 'A', null, null, t.tm_consent());
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 59. a quote under 20 characters -> 23514'; end $$;
do $$ begin
  perform public.submit_testimonial('A perfectly long enough quote here.', 'A', null, null, 'ok');
  raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 59. no real consent sentence -> 23514'; end $$;
commit;

-- 2. the second author sees none of the first author's rows
begin;
select t.claims('00000000-0000-4000-8000-000000005902');
select t.ok((select count(*) = 0 from public.testimonials), '59. another author selects none of them (RLS)');
select t.ok((select count(*) = 0 from public.my_testimonials()), '59. my_testimonials() is only my own');
select public.submit_testimonial('The stripboard finally made sense to me.', 'Author Two', null, null, t.tm_consent());
do $$ begin
  perform public.revoke_testimonial('00000000-0000-0000-0000-000000000000'::uuid);
  raise exception 'should have refused';
exception when sqlstate 'P0002' then raise notice 'ok - 59. revoking an id that is not mine -> P0002'; end $$;
commit;
do $$ declare other uuid := (select id from public.testimonials where author = '00000000-0000-4000-8000-000000005901' order by created_at limit 1);
begin
  perform t.claims('00000000-0000-4000-8000-000000005902');
  perform public.revoke_testimonial(other);
  raise exception 'should have refused';
exception when sqlstate 'P0002' then raise notice 'ok - 59. an author cannot revoke somebody else''s testimonial -> P0002'; end $$;
select t.reset();
select t.ok((select count(*) = 0 from public.testimonials where revoked_at is not null), '59. ... and nothing was revoked');

-- 3. anon: no table, only the published view
begin;
select t.claims('00000000-0000-4000-8000-000000005901', 'anon');
do $$ begin
  perform count(*) from public.testimonials;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. anon cannot select the table -> 42501'; end $$;
do $$ begin
  perform public.submit_testimonial('An anonymous quote, long enough.', 'Anon', null, null, t.tm_consent());
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. anon cannot submit -> 42501'; end $$;
select t.ok((select count(*) = 0 from public.public_testimonials()), '59. nothing is public while everything is pending');
commit;

-- 4. support reads the queue and cannot publish; the owner publishes
begin;
select t.claims('00000000-0000-4000-8000-000000005904');
select t.ok((select count(*) = 3 from public.admin_list_testimonials('pending') where author_email like 'tm-author%'), '59. a support administrator lists the pending queue');
do $$ begin
  perform public.admin_set_testimonial_status((select id from public.admin_list_testimonials('pending') limit 1), 'approved');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. a support administrator cannot approve -> 42501'; end $$;
select t.claims('00000000-0000-4000-8000-000000005901');
do $$ begin
  perform public.admin_list_testimonials(null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. an author cannot list the queue -> 42501'; end $$;
do $$ begin
  perform public.admin_set_testimonial_status((select id from public.testimonials limit 1), 'approved');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 59. an author cannot approve their own -> 42501'; end $$;
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005903');
select public.admin_set_testimonial_status(id, 'approved') from public.admin_list_testimonials('pending') where display_name in ('Author One', 'Author Two') and quote <> 'A direct insert, still mine and pending.';
select public.admin_set_testimonial_status(id, 'rejected') from public.admin_list_testimonials('pending') where quote = 'A direct insert, still mine and pending.';
select t.ok((select count(*) = 2 and bool_and(approved_by = '00000000-0000-4000-8000-000000005903'::uuid and approved_at is not null)
               from public.admin_list_testimonials('approved') where author_email like 'tm-author%'),
  '59. the owner approves: approver and time recorded');
do $$ begin
  perform public.admin_set_testimonial_status((select id from public.admin_list_testimonials(null) limit 1), 'published');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 59. an unknown status -> 22023'; end $$;
commit;
select t.ok((select count(*) >= 3 from public.admin_audit where action like 'testimonial_%'), '59. every decision is in the audit log');

-- 5. anon sees the approved ones, display fields only
begin;
select t.claims('00000000-0000-4000-8000-000000005901', 'anon');
select t.ok((select count(*) = 2 from public.public_testimonials()), '59. anon reads the two approved testimonials');
select t.ok((select count(*) = 0 from public.public_testimonials() where quote = 'A direct insert, still mine and pending.'), '59. a rejected one is not public');
commit;
select t.ok((select pg_get_function_result('public.public_testimonials()'::regprocedure) = 'TABLE(id uuid, quote text, display_name text, role text, film text, approved_at timestamp with time zone)'),
  '59. public_testimonials() carries no author, consent text or e-mail');

-- 6. the author revokes: hidden at once, and cannot be approved again
begin;
select t.claims('00000000-0000-4000-8000-000000005901');
select t.ok((select r.revoked_at is not null from public.revoke_testimonial((select id from public.my_testimonials() where status = 'approved' limit 1)) r),
  '59. the author revokes their own');
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000005901', 'anon');
select t.ok((select count(*) = 1 and bool_and(display_name = 'Author Two') from public.public_testimonials()), '59. a revoked testimonial is hidden immediately');
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000005903');
select t.ok((select count(*) = 1 from public.admin_list_testimonials('revoked') where display_name = 'Author One'), '59. the console lists it under revoked');
do $$ begin
  perform public.admin_set_testimonial_status((select id from public.admin_list_testimonials('revoked') where display_name = 'Author One' limit 1), 'approved');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 59. a revoked testimonial cannot be approved again -> 22023'; end $$;
commit;

-- 7. the flood guard
begin;
select t.claims('00000000-0000-4000-8000-000000005902');
do $$ begin
  for i in 1..6 loop perform public.submit_testimonial('Flood guard testimonial number ' || i || '.', 'Author Two', null, null, t.tm_consent()); end loop;
  raise exception 'should have refused';
exception when sqlstate 'P0429' then raise notice 'ok - 59. a sixth testimonial in a day -> P0429'; end $$;
rollback;
select t.reset();
