-- ============================================================
-- SECTION 48 CHECKS — who may join a project's presence channel
-- ------------------------------------------------------------
-- Runs after presence-stub.sql and §48. Own people (…4801 upward):
-- an owner, an edit collaborator, a collaborator whose access has
-- expired, and a stranger, around one project.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004801', 'pr-owner@example.com', now(), '{"full_name":"Pia Owner"}'),
  ('00000000-0000-4000-8000-000000004802', 'pr-collab@example.com', now(), '{"full_name":"Cal Collab"}'),
  ('00000000-0000-4000-8000-000000004803', 'pr-expired@example.com', now(), '{"full_name":"Eve Expired"}'),
  ('00000000-0000-4000-8000-000000004804', 'pr-stranger@example.com', now(), '{"full_name":"Sam Stranger"}');
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-000000004810', '00000000-0000-4000-8000-000000004801', 'Presence film');
insert into public.project_collaborators (project_id, user_id, role) values
  ('00000000-0000-4000-8000-000000004810', '00000000-0000-4000-8000-000000004802', 'edit');
insert into public.project_collaborators (project_id, user_id, role, expires_at) values
  ('00000000-0000-4000-8000-000000004810', '00000000-0000-4000-8000-000000004803', 'edit', now() - interval '1 day');
insert into realtime.messages (topic, extension) values
  ('pr:00000000-0000-4000-8000-000000004810', 'presence'),
  ('pr:00000000-0000-4000-8000-000000004810', 'broadcast');

\set topic 'pr:00000000-0000-4000-8000-000000004810'

begin;
select t.claims('00000000-0000-4000-8000-000000004801');
select t.ok(public.can_join_presence(:'topic'), '48.1 the project''s owner may join its presence channel');
select set_config('realtime.topic', :'topic', true);
select t.ok((select count(*) = 1 and bool_and(extension = 'presence') from realtime.messages),
  '48.2 through the policy the owner receives presence, and not broadcast');
insert into realtime.messages (topic, extension) values (:'topic', 'presence');
select t.ok(true, '48.3 and may send presence on it');
select t.ok(t.raises($$insert into realtime.messages (topic, extension) values ('pr:00000000-0000-4000-8000-000000004810', 'broadcast')$$, '42501'),
  '48.4 but not broadcast');
select t.reset();
rollback;

begin;
select t.claims('00000000-0000-4000-8000-000000004802');
select t.ok(public.can_join_presence(:'topic'), '48.5 a collaborator may join');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000004803');
select t.ok(not public.can_join_presence(:'topic'), '48.6 a collaborator whose access expired may not');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000004804');
select t.ok(not public.can_join_presence(:'topic'), '48.7 a stranger may not join');
select set_config('realtime.topic', :'topic', true);
select t.ok((select count(*) = 0 from realtime.messages), '48.8 and receives nothing on it');
select t.ok(t.raises($$insert into realtime.messages (topic, extension) values ('pr:00000000-0000-4000-8000-000000004810', 'presence')$$, '42501'),
  '48.9 and cannot send on it');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000004801');
select t.ok(not public.can_join_presence('pr:not-a-uuid') and not public.can_join_presence('pd:00000000-0000-4000-8000-000000004810')
        and not public.can_join_presence(null) and not public.can_join_presence('pr:00000000-0000-4000-8000-000000009999'),
  '48.10 a malformed topic, another channel''s prefix, no topic and an unknown project are all refused');
select t.reset();
commit;

select t.ok((select count(*) = 2 from pg_policies where schemaname = 'realtime' and tablename = 'messages' and policyname like 'fms presence:%'),
  '48.11 exactly the two presence policies exist, after loading twice');
