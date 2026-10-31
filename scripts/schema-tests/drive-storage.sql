-- ============================================================
-- SECTION 66 CHECKS — drive-only storage (server half) and the tour flag
-- ------------------------------------------------------------
-- Runs after §65 and §66 (loaded twice), above the purge. People from
-- earlier files: the owner …000a, the finance admin …4601 and the plain
-- member …4604 (role-matrix.sql) — all of them existed when §66 first
-- loaded, so the backfill marked them toured. New here (…66xx): a film
-- owner, a collaborator, a brand-new account, and …66ff, which
-- test-schema.mjs inserts BETWEEN the two loads of §66 so the re-run's
-- (absent) backfill can be checked.
-- t.raises() comes from admin-controls.sql.
-- ============================================================
\set ON_ERROR_STOP on

-- 66.1 THE SWITCH -----------------------------------------------------------
select t.ok(public.get_storage_mode() = 'supabase', '66.1 storage_mode starts as supabase');
begin;
select t.claims('00000000-0000-4000-8000-000000000001', 'anon');
select t.ok(public.get_storage_mode() = 'supabase', '66.2 anon can read the storage mode');
select t.ok(t.raises($$select public.admin_set_storage_mode('drive')$$, '42501'), '66.3 anon cannot set it');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004604');
select t.ok(t.raises($$select public.admin_set_storage_mode('drive')$$, '42501'), '66.4 a member cannot set it');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000004601');
select t.ok(t.raises($$select public.admin_set_storage_mode('drive')$$, '42501'), '66.5 a finance admin cannot set it: it is the owner''s switch');
select t.ok(t.raises($$select public.admin_set_billing_settings('{"storage_mode":"drive"}'::jsonb)$$, '42501')
         or public.get_storage_mode() = 'supabase', '66.6 nor through the billing settings writer');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_set_storage_mode('cloud')$$, '22023'), '66.7 a mode that is not supabase or drive is refused');
select t.ok(t.raises($$select public.admin_set_storage_mode(null)$$, '22023'), '66.8 null is refused');
select t.reset();
commit;

-- 66.2 GOOGLE TOKENS --------------------------------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000006601', 'd66-owner@example.com',  now(), '{"full_name":"Drive Owner"}'),
  ('00000000-0000-4000-8000-000000006602', 'd66-collab@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006603', 'd66-new@example.com',    now(), '{}');

begin;
select t.service();
insert into public.google_tokens (user_id, enc_refresh, scope)
values ('00000000-0000-4000-8000-000000006603', repeat('A', 64), 'openid email https://www.googleapis.com/auth/drive.file');
select t.ok((select count(*) from public.google_tokens where user_id = '00000000-0000-4000-8000-000000006603') = 1,
  '66.9 the service role (the google-token function) can write a token row');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000006603');
select t.ok(t.raises($$select count(*) from public.google_tokens$$, '42501'), '66.10 authenticated cannot select google_tokens, not even its own row');
select t.ok(t.raises($$insert into public.google_tokens (user_id, enc_refresh) values (auth.uid(), repeat('B', 64))$$, '42501'),
  '66.11 nor write one');
select t.ok((public.google_token_status() ->> 'has_token')::boolean
        and public.google_token_status() ? 'updated_at'
        and not (public.google_token_status() ? 'enc_refresh'),
  '66.12 google_token_status() says whether there is a grant, never the ciphertext');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000006602');
select t.ok((public.google_token_status() ->> 'has_token')::boolean = false, '66.13 and only for the caller: another account reads no token');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000000001', 'anon');
select t.ok(t.raises($$select public.google_token_status()$$, '42501'), '66.14 anon cannot ask');
select t.ok(t.raises($$select count(*) from public.google_tokens$$, '42501'), '66.15 anon cannot select the table');
select t.reset();
commit;
select t.ok(t.raises($$insert into public.google_tokens (user_id, enc_refresh) values ('00000000-0000-4000-8000-000000006602', 'short')$$, '23514'),
  '66.16 a ciphertext too short to be iv + tag is refused');

-- 66.3 THE TOUR FLAG --------------------------------------------------------
select t.ok((select count(*) from public.account_profile a
              join auth.users u on u.id = a.user_id
             where u.id in ('00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000004604')
               and a.tour_started_at is not null) = 2,
  '66.17 every account that existed when §66 first ran is backfilled as toured');
select t.ok(not exists (select 1 from public.account_profile where user_id = '00000000-0000-4000-8000-0000000066ff'),
  '66.18 the re-run did NOT backfill: an account made between the two loads has no profile row');
begin;
select t.claims('00000000-0000-4000-8000-000000004604');
select t.ok(public.mark_tour_started() = false, '66.19 mark_tour_started() is false for a backfilled account');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-0000000066ff');
select t.ok(public.mark_tour_started() = true, '66.20 an account made between the loads gets its tour');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000006603');
select t.ok((public.tour_status() ->> 'started_at') is null, '66.21 a brand-new account reads no tour yet');
select t.ok(public.mark_tour_started() = true,  '66.22 its first mark_tour_started() is true');
select t.ok(public.mark_tour_started() = false, '66.23 and every later one false (another device, another tab)');
select t.ok((public.tour_status() ->> 'started_at') is not null and (public.tour_status() ->> 'finished_at') is null,
  '66.24 tour_status() shows it started, not finished');
select t.ok(public.mark_tour_finished() is not null, '66.25 mark_tour_finished() records the finish');
select t.ok((public.tour_status() ->> 'finished_at') is not null, '66.25b and tour_status() reads it back');
select t.ok((select count(*) from public.account_profile) = 1, '66.26 an account sees only its own profile row');
select t.ok(t.raises($$update public.account_profile set tour_started_at = null$$, '42501'), '66.27 and cannot write it directly');
select t.reset();
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000000001', 'anon');
select t.ok(t.raises($$select public.mark_tour_started()$$, '42501'), '66.28 anon cannot mark a tour');
select t.reset();
commit;

-- seed: a film owned by …6601 with two scopes, four comments, a collaborator,
-- a share and two screening passes. Replica mode for the seed alone (the
-- membership and plan triggers are not what is tested here).
set session_replication_role = replica;
insert into public.projects (id, owner_id, title, format) values
  ('00000000-0000-4000-8000-0000000066a1', '00000000-0000-4000-8000-000000006601', 'Drive Film', 'feature');
insert into public.project_data (project_id, scope, data) values
  ('00000000-0000-4000-8000-0000000066a1', 'scenes', '{"a":1,"b":[1,2],"c":{"x":"y"}}'),
  ('00000000-0000-4000-8000-0000000066a1', 'script', '{"els":[{"id":"e1","t":"FADE IN:"}]}');
insert into public.comments (id, project_id, scope, field_key, author_id, author_name, body, parent_id) values
  ('00000000-0000-4000-8000-0000000066c1', '00000000-0000-4000-8000-0000000066a1', 'feature', 's1', '00000000-0000-4000-8000-000000006601', 'Owner', 'one', null),
  ('00000000-0000-4000-8000-0000000066c2', '00000000-0000-4000-8000-0000000066a1', 'feature', 's1', '00000000-0000-4000-8000-000000006602', 'Collab', 'reply to one', '00000000-0000-4000-8000-0000000066c1'),
  ('00000000-0000-4000-8000-0000000066c3', '00000000-0000-4000-8000-0000000066a1', 'feature', 's2', '00000000-0000-4000-8000-000000006601', 'Owner', 'three', null),
  ('00000000-0000-4000-8000-0000000066c4', '00000000-0000-4000-8000-0000000066a1', 'feature', 's2', '00000000-0000-4000-8000-000000006602', 'Collab', 'a reply the client never read', '00000000-0000-4000-8000-0000000066c3');
insert into public.project_collaborators (project_id, user_id, role) values
  ('00000000-0000-4000-8000-0000000066a1', '00000000-0000-4000-8000-000000006602', 'comment');
insert into public.shares (project_id, role, token, created_by) values
  ('00000000-0000-4000-8000-0000000066a1', 'view', 'd66-share-token', '00000000-0000-4000-8000-000000006601');
insert into public.invite_codes (id, code, pass_type, target_project_id, max_redemptions, expires_at, created_by) values
  ('00000000-0000-4000-8000-0000000066b1', 'DRV66DRIVEPASS', 'screening_pass', '00000000-0000-4000-8000-0000000066a1', 5, now() + interval '2 days', '00000000-0000-4000-8000-000000006601'),
  ('00000000-0000-4000-8000-0000000066b2', 'DRV66SCOPEPASS', 'screening_pass', '00000000-0000-4000-8000-0000000066a1', 5, now() + interval '2 days', '00000000-0000-4000-8000-000000006601'),
  ('00000000-0000-4000-8000-0000000066b3', 'DRV66OLDPASS',   'screening_pass', '00000000-0000-4000-8000-0000000066a1', 5, now() - interval '1 day',  '00000000-0000-4000-8000-000000006601');
set session_replication_role = origin;

-- 66.5 IN SUPABASE MODE EVERY MIGRATE RPC REFUSES ----------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000006601');
select t.ok(t.raises($$select * from public.drive_migrate_list()$$, '55000')
        and t.raises($$select public.drive_migrate_read('00000000-0000-4000-8000-0000000066a1', 'scenes')$$, '55000')
        and t.raises($$select public.drive_migrate_delete_scope('00000000-0000-4000-8000-0000000066a1', 'scenes', '{"a":1,"b":[1,2],"c":{"x":"y"}}')$$, '55000')
        and t.raises($$select * from public.drive_migrate_collaborators('00000000-0000-4000-8000-0000000066a1')$$, '55000')
        and t.raises($$select public.drive_migrate_delete_comments('00000000-0000-4000-8000-0000000066a1', array['00000000-0000-4000-8000-0000000066c1']::uuid[])$$, '55000')
        and t.raises($$select public.drive_migrate_finish('00000000-0000-4000-8000-0000000066a1')$$, '55000'),
  '66.29 in supabase mode every migrate RPC refuses (55000), even for the owner');
select t.ok(t.raises($$select public.screening_set_drive_file('00000000-0000-4000-8000-0000000066b1', 'drvFile66abcdef', 'Drive Film', 'feature')$$, '55000'),
  '66.30 and a screening pass cannot be pointed at Drive');
select t.reset();
commit;
select t.ok((select count(*) from public.project_data where project_id = '00000000-0000-4000-8000-0000000066a1') = 2,
  '66.31 nothing was deleted');

-- the owner flips the switch
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_set_storage_mode('drive') = 'drive', '66.32 the owner sets drive');
select t.ok((public.admin_storage_overview() ->> 'mode') = 'drive'
        and (public.admin_storage_overview() ->> 'projects_on_server')::int >= 1
        and (public.admin_storage_overview() ->> 'users_with_token')::int >= 1
        and not (public.admin_storage_overview() ? 'data'),
  '66.33 admin_storage_overview() gives counts, no content');
select t.reset();
commit;
select t.ok(exists (select 1 from public.admin_audit where action = 'set_storage_mode' and after ->> 'mode' = 'drive'),
  '66.34 the flip is in the audit log');
begin;
select t.claims('00000000-0000-4000-8000-000000004604');
select t.ok(t.raises($$select public.admin_storage_overview()$$, '42501'), '66.35 a member cannot read the overview');
select t.reset();
commit;

-- 66.5 IN DRIVE MODE --------------------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000006602');
select t.ok(t.raises($$select public.drive_migrate_read('00000000-0000-4000-8000-0000000066a1', 'scenes')$$, '42501'),
  '66.36 a collaborator cannot read the film for moving');
select t.ok(t.raises($$select public.drive_migrate_delete_scope('00000000-0000-4000-8000-0000000066a1', 'scenes', '{"a":1,"b":[1,2],"c":{"x":"y"}}')$$, '42501'),
  '66.37 nor delete a scope, even with the right payload');
select t.ok(t.raises($$select public.drive_migrate_finish('00000000-0000-4000-8000-0000000066a1')$$, '42501'),
  '66.38 nor finish it');
select t.ok((select count(*) from public.drive_migrate_list()) = 0, '66.39 a collaborator''s list holds none of the films it is only shared on');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000006601');
select t.ok((select scopes from public.drive_migrate_list() where project_id = '00000000-0000-4000-8000-0000000066a1') = array['scenes', 'script']
        and (select comments from public.drive_migrate_list() where project_id = '00000000-0000-4000-8000-0000000066a1') = 4,
  '66.40 the owner''s list names the scopes and counts the comments, with no data');
select t.ok(public.drive_migrate_read('00000000-0000-4000-8000-0000000066a1', 'scenes') = '{"a":1,"b":[1,2],"c":{"x":"y"}}'::jsonb,
  '66.41 drive_migrate_read returns the scope''s data');
select t.ok(public.drive_migrate_read('00000000-0000-4000-8000-0000000066a1', 'songs') is null, '66.42 and null for a scope that has no row');
select t.ok(public.drive_migrate_delete_scope('00000000-0000-4000-8000-0000000066a1', 'scenes', '{"a":1,"b":[1,2],"c":{"x":"z"}}') = false,
  '66.43 delete_scope refuses a payload that differs (false)');
select t.ok(public.drive_migrate_delete_scope('00000000-0000-4000-8000-0000000066a1', 'scenes', null) = false,
  '66.44 and a null payload');
select t.ok(exists (select 1 from public.project_data where project_id = '00000000-0000-4000-8000-0000000066a1' and scope = 'scenes'),
  '66.45 the row is still there');
select t.ok(t.raises($$select public.drive_migrate_finish('00000000-0000-4000-8000-0000000066a1')$$, 'P0001'),
  '66.46 finish refuses while scopes and comments remain');
select t.ok(public.drive_migrate_delete_scope('00000000-0000-4000-8000-0000000066a1', 'scenes', '{"c":{"x":"y"},"b":[1,2],"a":1}') = true,
  '66.47 the same data in another key order deletes it (jsonb equality)');
select t.ok(public.drive_migrate_delete_scope('00000000-0000-4000-8000-0000000066a1', 'scenes', '{"c":{"x":"y"},"b":[1,2],"a":1}') = false,
  '66.48 a second delete is a no-op (false): idempotent');
select t.ok((select string_agg(email || ':' || role, ',') from public.drive_migrate_collaborators('00000000-0000-4000-8000-0000000066a1')) = 'd66-collab@example.com:comment',
  '66.49 drive_migrate_collaborators names each person and role');
select t.ok((public.screening_set_drive_file('00000000-0000-4000-8000-0000000066b1', 'drvFile66abcdef', 'Drive Film', 'feature')).drive_file_id = 'drvFile66abcdef',
  '66.50 the pass''s maker points it at a Drive file');
select t.ok(t.raises($$select public.screening_set_drive_file('00000000-0000-4000-8000-0000000066b1', 'not a file id!', null, null)$$, '23514'),
  '66.51 a value that is not a Drive file id is refused');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000006602');
select t.ok(t.raises($$select public.screening_set_drive_file('00000000-0000-4000-8000-0000000066b2', 'drvFile66zzzzzz', null, null)$$, '42501'),
  '66.52 somebody else cannot repoint a pass');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000000001', 'anon');
select t.ok((select drive_file_id from public.screening_open('drv66-drive-pass', 'viewer@example.com')) = 'drvFile66abcdef'
        and (select scopes from public.screening_open('DRV66DRIVEPASS', null)) is null,
  '66.53 a Drive pass opens to its file id and no scopes');
select t.ok((select scopes from public.screening_open('DRV66SCOPEPASS', null)) is not null
        and (select drive_file_id from public.screening_open('DRV66SCOPEPASS', null)) is null,
  '66.54 a pass with no file still serves the synced scopes, as before');
select t.ok(t.raises($$select * from public.screening_open('DRV66OLDPASS', null)$$, '22023'), '66.55 an expired pass is refused');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000006601');
select t.ok(public.drive_migrate_delete_comments('00000000-0000-4000-8000-0000000066a1',
          array['00000000-0000-4000-8000-0000000066c1', '00000000-0000-4000-8000-0000000066c2', '00000000-0000-4000-8000-0000000066c3']::uuid[]) = 2,
  '66.56 delete_comments deletes the named thread, but not a parent whose reply the client never named');
select t.ok(exists (select 1 from public.comments where id = '00000000-0000-4000-8000-0000000066c4')
        and exists (select 1 from public.comments where id = '00000000-0000-4000-8000-0000000066c3'),
  '66.57 the unseen reply and its parent are both kept');
select t.ok(public.drive_migrate_delete_comments('00000000-0000-4000-8000-0000000066a1',
          array['00000000-0000-4000-8000-0000000066c3', '00000000-0000-4000-8000-0000000066c4']::uuid[]) = 2,
  '66.58 named together on the next pass, they go');
select t.ok(public.drive_migrate_delete_scope('00000000-0000-4000-8000-0000000066a1', 'script', '{"els":[{"t":"FADE IN:","id":"e1"}]}') = true,
  '66.59 the last scope goes');
select t.ok((public.drive_migrate_finish('00000000-0000-4000-8000-0000000066a1') ->> 'collaborators')::int = 1,
  '66.60 finish succeeds once nothing remains');
select t.reset();
commit;

select t.ok(not exists (select 1 from public.projects where id = '00000000-0000-4000-8000-0000000066a1')
        and not exists (select 1 from public.shares where token = 'd66-share-token')
        and not exists (select 1 from public.project_collaborators where project_id = '00000000-0000-4000-8000-0000000066a1'),
  '66.61 the project row, its share and its collaborator are gone');
select t.ok((select target_project_id is null and drive_file_id is not null and revoked_at is null from public.invite_codes where id = '00000000-0000-4000-8000-0000000066b1')
        and (select target_project_id is null and revoked_at is not null from public.invite_codes where id = '00000000-0000-4000-8000-0000000066b2')
        and exists (select 1 from public.invite_redemptions where code_id = '00000000-0000-4000-8000-0000000066b2'),
  '66.62 the Drive pass survives unlinked; the scope pass is revoked, its viewer log kept');
begin;
select t.claims('00000000-0000-4000-8000-000000000001', 'anon');
select t.ok((select title || '/' || format || '/' || drive_file_id from public.screening_open('DRV66DRIVEPASS', null)) = 'Drive Film/feature/drvFile66abcdef',
  '66.63 the Drive pass still opens, with its own title and format, after the project row is gone');
select t.ok(t.raises($$select * from public.screening_open('DRV66SCOPEPASS', null)$$, '22023'), '66.64 the revoked scope pass does not');
select t.reset();
commit;

-- DELETING THE PERSON drops the token and the profile with the sign-in
-- (admin_delete_user ends in delete from auth.users; the console calls
-- google-token revoke first, and the cascade covers Google being down).
delete from auth.users where id = '00000000-0000-4000-8000-000000006603';
select t.ok(not exists (select 1 from public.google_tokens where user_id = '00000000-0000-4000-8000-000000006603')
        and not exists (select 1 from public.account_profile where user_id = '00000000-0000-4000-8000-000000006603'),
  '66.65 deleting a sign-in deletes its token and its tour flag');

-- back to the default, so the purge and anything after see supabase mode
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_set_storage_mode('supabase') = 'supabase', '66.66 and back to supabase (the rollback)');
select t.reset();
commit;
