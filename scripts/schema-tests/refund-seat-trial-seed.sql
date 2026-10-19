-- ============================================================
-- SECTION 48 SEED — loaded BEFORE §48's first load
-- ------------------------------------------------------------
-- The live database already holds invite requests that §48's backfill has
-- to mark. They can only be seeded here, before the column and its
-- trigger exist: the second load fills nulls only, so seeding between the
-- two loads would test the re-run, not the backfill. refund-seat-trial.sql
-- asserts what the backfill made of them.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004815', 'rst-old-reask@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004816', 'rst-old-waiting@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004817', 'rst-old-decline@example.com', now(), '{}');
insert into public.invite_requests (user_id, email, status, times_asked, requested_at, decided_at) values
  -- declined, then re-asked after the wait (the re-ask set it back to pending)
  ('00000000-0000-4000-8000-000000004815', 'rst-old-reask@example.com',   'pending',  2, now() - interval '1 day',   now() - interval '9 days'),
  -- asked once and still waiting: never declined
  ('00000000-0000-4000-8000-000000004816', 'rst-old-waiting@example.com', 'pending',  1, now() - interval '1 day',   null),
  -- declined and not re-asked
  ('00000000-0000-4000-8000-000000004817', 'rst-old-decline@example.com', 'declined', 1, now() - interval '3 days',  now() - interval '2 days');
