# Live steps, 21 Oct 2026 — §52 (yearly plans)

One piece of SQL and one redeploy on the live project (`conhlrulxfwkhsnymakz`).
The client on `develop` already sells plans by the year; **do not release it to
`main` until both steps below are done**, or the site will sell "a year" while
the database still grants "for good".

## 0. The paste rule

Never paste SQL through the clipboard as text (CLAUDE.md, "Pasting SQL
through the clipboard corrupts it"). Paste base64, decode it in the page, and
compare the checksum before pressing Run.

```bash
shasum -a 256 supabase/schema/schema-52-yearly-plans.sql
# 6c1a80996bc1d6df5d321ad4dc1e7830c61812d36e27a52b0a7f74f42318945f
```

## 1. Run §52

After §51. It is re-runnable; the backfill happens once
(`billing_settings.yearly_switch_at` is the marker).

## 2. Redeploy the four functions

```bash
npx --yes supabase@latest functions deploy rzp-order rzp-verify rzp-webhook rzp-refund --project-ref conhlrulxfwkhsnymakz
```

`supabase login` needs a real terminal. Between steps 1 and 2 checkout keeps
working: the old `rzp-order` sends `'lifetime'`, which §52 records as a year.

## 3. Read back

```sql
select yearly_switch_at from public.billing_settings;                 -- one instant, now
select id, plan, plan_until, plan_period from public.accounts
 where plan <> 'free' order by plan_until;                             -- buyers: a year from the switch; grants: null
select plan_id, period, starts_at, ends_at, amount_paise from public.payments
 where status = 'paid' order by paid_at;                               -- period 'year', ends_at = plan_until
```

Then, signed in as a buyer, `purchase.html` should say "Valid until <date>"
and offer RENEW on the current plan.

## 4. Tell the buyers (draft)

> Subject: Your {{plan}} plan now runs until {{date}}
>
> Hello — plans on the studio are now bought a year at a time. Your plan
> runs until {{date}}, a full year from today. Nothing is charged
> automatically: when the year is ending you will see a reminder in the
> app, and you can renew from Plan & purchases if you want another year.
> Your work stays in your browser whatever you decide. Questions:
> reply to this e-mail.

(Send from the support address; never sign with the owner's name.)
