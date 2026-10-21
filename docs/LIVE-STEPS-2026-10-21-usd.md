# Live steps — §55 (charging in US dollars)

One piece of SQL, one redeploy and two Razorpay/console steps on the live
project (`conhlrulxfwkhsnymakz`). The long form is `docs/BILLING.md` §24.
Nothing here changes what anyone pays until step 5.

## 0. The paste rule

Never paste SQL through the clipboard as text. Paste base64, decode it in the
page, and compare the checksum before pressing Run.

```bash
shasum -a 256 supabase/schema/schema-55-usd-checkout.sql
# must equal the sha256 on the §55 row of supabase/schema/README.md
```

## 1. Run §55

After §53 and §54. It is re-runnable.

## 2. Redeploy the four functions

```bash
npx --yes supabase@latest functions deploy rzp-order rzp-verify rzp-webhook rzp-refund --project-ref conhlrulxfwkhsnymakz
```

`supabase login` needs a real terminal. Rupee checkout keeps working between
steps 1 and 2.

## 3. Read back

```sql
select pg_get_function_identity_arguments('public.quote_for'::regproc);
  -- p_user uuid, p_plan text, p_code text, p_account uuid, p_currency text
select count(*) from pg_proc where proname = 'create_pending_payment';   -- 1
select count(*) from pg_proc where proname = 'quote_order';              -- 2
select public.price_notice('USD') ->> 'charged_currency',
       public.price_notice('USD') -> 'usd_checkout';                     -- INR, false
select conname from pg_constraint
 where conname in ('payments_currency_check', 'refunds_currency_check'); -- two rows
select usd_checkout from public.billing_settings where id;               -- false
```

## 4. Razorpay

Enable **International payments** (USD) on the account in the Razorpay
dashboard. Wait for approval.

## 5. Prices, then the switch

Type the dollar prices in the console (Tiers & grants), then turn on
"Charge in US dollars". Make one USD test-mode purchase and refund it before
taking a live dollar payment.
