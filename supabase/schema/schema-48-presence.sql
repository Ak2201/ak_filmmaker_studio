-- ============================================================
-- 48. CO-WRITING PRESENCE: WHO MAY JOIN A PROJECT'S CHANNEL   NOT YET RUN LIVE
-- ------------------------------------------------------------
-- The Screenplay Writer shows who else has the script open
-- (src/lib/presence.js, src/ui/presence.js). Supabase Realtime carries
-- it on a PRIVATE channel named 'pr:<project id>', because on a public
-- channel presence is not covered by row level security at all: anyone
-- holding the anon key and a project's id could join it and read the
-- names of the people writing. A private channel asks
-- realtime.messages's policies instead, and the two below let in
-- exactly the people has_project_access() already lets read the
-- project (its owner, the account's owner and admins, an unexpired
-- collaborator), for the presence extension only. Nothing is stored:
-- presence lives in the Realtime server's memory while a page is open.
--
-- ORDER: the client ships first and is safe without this section — a
-- private channel nobody is allowed to join is refused, and the page
-- then simply shows no one (the sync channels are separate and public,
-- as before). Run this, and presence appears; nothing else changes.
--
-- Re-runnable. Does nothing where realtime.messages does not exist (a
-- plain PostgreSQL, as in npm run test:schema, which stubs the table to
-- check the policies). REQUIRES §1–§3 (has_project_access).
-- ============================================================

/* The one question both policies ask, kept in public so it can be
   tested without Realtime: does this topic name a project the caller
   may read? A topic that is not 'pr:<uuid>' is a no. */
create or replace function public.can_join_presence(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_pid uuid;
begin
  if p_topic is null or p_topic !~ '^pr:[0-9a-fA-F-]{36}$' then return false; end if;
  begin
    v_pid := substring(p_topic from 4)::uuid;
  exception when others then
    return false;
  end;
  return public.has_project_access(v_pid, 'view');
end
$fn$;
revoke all on function public.can_join_presence(text) from public;
grant execute on function public.can_join_presence(text) to authenticated;

do $do$
begin
  if to_regclass('realtime.messages') is null then
    raise notice '§48: realtime.messages does not exist here; the presence policies were not created';
    return;
  end if;
  execute 'drop policy if exists "fms presence: project readers receive" on realtime.messages';
  execute 'drop policy if exists "fms presence: project readers send" on realtime.messages';
  execute $p$
    create policy "fms presence: project readers receive" on realtime.messages
      for select to authenticated
      using (realtime.messages.extension = 'presence' and public.can_join_presence(realtime.topic()))
  $p$;
  execute $p$
    create policy "fms presence: project readers send" on realtime.messages
      for insert to authenticated
      with check (realtime.messages.extension = 'presence' and public.can_join_presence(realtime.topic()))
  $p$;
end
$do$;
