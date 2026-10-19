-- ============================================================
-- A STAND-IN FOR SUPABASE REALTIME, for the §48 checks only.
-- ------------------------------------------------------------
-- A plain PostgreSQL has no `realtime` schema, and §48 does nothing
-- without one. This makes the two pieces §48's policies touch, the way
-- Supabase ships them: realtime.messages (topic, extension) with row
-- level security on, and realtime.topic(), which the Realtime server
-- answers from the channel being joined (here, a setting the checks
-- set). Loaded by scripts/test-schema.mjs between §48's first loads
-- (no Realtime: a notice and no policy) and its last (policies made).
-- ============================================================
\set ON_ERROR_STOP on
create schema if not exists realtime;
create table if not exists realtime.messages (
  id        bigserial primary key,
  topic     text not null,
  extension text not null,
  payload   jsonb
);
alter table realtime.messages enable row level security;
create or replace function realtime.topic() returns text
language sql stable as $$ select nullif(current_setting('realtime.topic', true), '') $$;
grant usage on schema realtime to authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;
