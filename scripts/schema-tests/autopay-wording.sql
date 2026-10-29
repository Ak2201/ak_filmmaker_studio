-- ============================================================
-- SECTION 65 CHECKS — auto-pay wording (cancel with Razorpay)
-- Runs after §65 has loaded (the runner loads it twice). The refusal for a
-- second live subscription keeps its code and hint; only the words moved.
-- ============================================================
\set ON_ERROR_STOP on

do $$
declare def text := pg_get_functiondef('public.quote_subscription(uuid, uuid, text, text)'::regprocedure);
begin
  if def not like '%It can be cancelled from the Razorpay mandate e-mail or in your bank or UPI app.%' then
    raise exception 'quote_subscription does not carry the new wording';
  end if;
  if def like '%Settings, Plan%' then raise exception 'the old wording survived'; end if;
  if def not like '%hint = ''subscribed''%' then raise exception 'the subscribed hint was lost'; end if;
  raise notice 'ok - 65. quote_subscription says to cancel with Razorpay, hint unchanged';
end $$;
