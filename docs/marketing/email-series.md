# E-mail series — eight messages

**Status: NOT SENT.** Written 26 Oct 2026. Nothing here may go out until:

1. `RESEND_API_KEY` and `MAIL_FROM` are set (`docs/BILLING.md` §13, §16) and
   one test message has arrived from `support@filmmakerstudio.in`;
2. the recipient is on the leads list **with consent**, or is a customer
   receiving a message about their own account. The leads form exists but is
   HIDDEN (`lead.live` is false in `src/data/marketing-site.json`) until
   privacy.html carries the owner's leads paragraph; until it is live and
   schema §29's `add_lead` answers, the list is empty and e-mails 1–5 have
   nobody they may lawfully go to. A "stop" reply is honoured the same day,
   by the owner: there is no console button for one lead, so delete that
   row from `public.leads` in the SQL editor and add its hash to
   `public.deleted_subjects` (schema §45.6; a tombstoned address is then
   refused if the form is submitted again), and keep no copy elsewhere;
3. every `{PLACEHOLDER}` below is filled from the server the day it is sent
   (see the table): no date, no price and no pass length is ever typed
   from this file.

Plain text only: no images, no tracking pixels, no open tracking. One link
per message where possible, each tagged `src=email` (console bucket `email`;
playbook §3). The `utm_campaign` on each link names the message for your own
notes only: it is never stored on the server, so the console shows all six
e-mails as one `email` row. Every message ends
with the footer. Sign with the trading name; never the owner's name.

## Fill-ins (read on the day of sending)

`{IMPORT_PASS_LINE}` in e-mail 3 is "Bring your own script in with the launch
pass, {PASS_PRICE} for {PASS_LENGTH}:" while `trial_offer()->'pass'` reads
`open` true, and "Bring your own script in on any plan:" otherwise.

| Placeholder | Source |
| --- | --- |
| `{PASS_PRICE}` | `trial_offer()->'pass'` `amount_paise` ÷ 100, in rupees ("₹49"); read on the day. If `pass.open` is false, the e-mail leaves the pass out |
| `{PASS_LENGTH}` | `pass.days` in words ("7 days") |
| `{PASS_ENDS}` | `pass.ends_at` as an IST date and time; null means no deadline, so drop the "ends" line |
| `{PASS_LEFT}` | "`pass.left` of `pass.cap` left", only when a cap is set; otherwise drop it |
| `{BASIC_YEAR}`, `{INDIE_YEAR}`, `{PRO_YEAR}` | `price_notice()` current price per plan, in rupees |
| `{FROM_DAY}` | the pricing page's "from about … a day" figure (derived, never typed) |
| `{RISE_DATE}` | `price_notice()` `plans[].next_price_at`, written as a date in IST ("31 December 2026"); null means the rise has fired, so drop the sentence |
| `{FIRST_NAME}` | only if the person gave it; otherwise "Hello," |

## Footer (every message)

```
You are getting this because you asked for launch news on filmmakerstudio.in.
Reply "stop" and you will not hear from us again.
FilmMakerStudio · support@filmmakerstudio.in · [Postal address]
```

`[Postal address]` is the owner's to write (`brand.json` `address` is empty
on purpose). Do not send with the bracket left in.

---

## E-mail 1 — the day they sign up (welcome)

**Subject:** Your film, from the first idea to the call sheet

```
Hello {FIRST_NAME},

Thanks for asking to hear from us. Here is what FilmMakerStudio is, in one
paragraph: a studio in your browser that takes a film from story to
screenplay, breakdown, schedule, budget and call sheets, then on to the shoot
day and delivery. It is built for how Tamil and Indian units actually work:
Tamil dialogue with English slug lines, budgets in rupees that start from
an indicative Chennai rate card (the figures re-checked against a public page
say which page and when), and call sheets you can
send as a WhatsApp message.

The quickest way to see it on your own script is the launch pass:
{PASS_PRICE} for {PASS_LENGTH} of the whole studio, once per account.
{PASS_TERMS}. (With the pass closed, send instead: "The
plans are on the pricing page, from about {FROM_DAY} a day.")

https://filmmakerstudio.in/start?src=email&utm_campaign=welcome

If something is unclear, reply to this e-mail. A person reads every reply.

FilmMakerStudio
```

## E-mail 2 — day 2 (a craft tip, no selling)

**Subject:** What a call sheet must say (five lines)

```
Hello {FIRST_NAME},

No product today, just the five things every call sheet needs, because a
missing one is how a unit loses its first hour:

1. The call time, per person, not one time for everyone.
2. The location with a map pin, and where to park.
3. The scenes in shooting order, with the pages each one covers.
4. Who is needed and when they are released.
5. Sunrise or sunset if you are chasing light, and the weather.

We wrote a longer guide, with a worked example:
https://filmmakerstudio.in/guide-call-sheet?src=email&utm_campaign=tip

FilmMakerStudio
```

## E-mail 3 — day 4 (one pain, one feature)

**Subject:** Stop retyping your script into a spreadsheet

```
Hello {FIRST_NAME},

Most first-time schedules start with someone copying scene headings from the
script into Excel, one by one. It takes an evening and it goes wrong the day
the script changes.

In FilmMakerStudio you import the screenplay (Fountain, Final Draft, Word,
text or a PDF that has real text in it) and the scenes, characters and
locations are read out of your pages. From there the breakdown, the
stripboard and the call sheet all read the same scenes, so a change in one
place reaches the others.

Scanned or password-protected PDFs are refused with a reason rather than
read badly. That is on purpose.

{IMPORT_PASS_LINE}
https://filmmakerstudio.in/start?src=email&utm_campaign=import

FilmMakerStudio
```

## E-mail 4 — day 7 (the plans, plainly)

**Subject:** What a year of the studio costs, and what it does not do

```
Hello {FIRST_NAME},

Here are the plans, with nothing left for checkout to surprise you:

- Basic, {BASIC_YEAR} for a year: writing. Story, screenplay, drafts, import.
- Intermediate, {INDIE_YEAR} for a year: preparing the shoot. Breakdown,
  storyboard, shot list, stripboard, budget, cast and crew, sides.
- Pro, {PRO_YEAR} for a year: running it. Adds call sheets, the shoot day,
  the edit log, deliverables and the AI tools (with your own AI key).

Each plan is a year of the studio: {PLAN_TERMS}. Moving up mid-year
credits the unused part of your year.

These are founding prices. They hold until {RISE_DATE}, or until the
founding places are taken if that comes first. A plan bought before then is
a full year at the price you paid.

Purchases are final, except a duplicate charge, a plan that was never
activated on your account, and refunds Indian law requires. Please look at
the Dragon sample, and the plan table, first so you know what you are
buying.

Students: the code STUDENT50 gives the student price on Intermediate.

https://filmmakerstudio.in/pricing?src=email&utm_campaign=plans

FilmMakerStudio
```

## E-mail 5 — about two weeks before {RISE_DATE} (the date, once)

Send this once, and only if `price_notice()` still shows the rise at
`{RISE_DATE}` that morning. If the owner has moved the date, rewrite it or
do not send it.

**Subject:** The founding price ends on {RISE_DATE}

```
Hello {FIRST_NAME},

One plain fact, once: the founding prices end on {RISE_DATE}, or earlier if
the founding places fill. After that the yearly price of each plan goes up.
The pricing page shows both figures and the date, read from the server.

If the studio is not for you, ignore this e-mail; we will not send a
countdown.

https://filmmakerstudio.in/pricing?src=email&utm_campaign=founding

FilmMakerStudio
```

## E-mail 6 — after a purchase (onboarding and the referral code)

Account e-mail, sent to buyers. The receipt itself is sent separately by
`rzp-verify` / `rzp-webhook`; this one is not a receipt and must not look like one.

**Subject:** Three things to do in your first week

```
Hello {FIRST_NAME},

Thank you for buying a year of FilmMakerStudio. Three things that make the
first week easier:

1. Bring your script in: Import Screenplay, in the Screenplay Writer.
2. Back it up somewhere that is yours. The Backup button in the side rail
   downloads a file of your whole studio, and on Intermediate and Pro you
   can back up to your own Google Drive.
3. Open the Dragon sample to see the tools on your plan filled in before
   you fill your own.

You also have a referral code, on the Purchase page under "Your referral code". A friend who uses it gets
a discount, and you are credited a share of what they pay. Both figures are
shown beside the code.

Your invoices are on the Purchase page whenever you need them.

Reply to this e-mail with anything that gets in your way.

FilmMakerStudio
```

## E-mail 7 — the day a launch pass ends (win-back)

Account e-mail, to a pass buyer who has not bought a plan, sent once on the
day `billing_status()` shows the pass ended. Only once Resend is configured.

**Subject:** Your film is where you left it

```
Hello {FIRST_NAME},

Your launch pass ended today. Nothing you wrote is gone: your projects are
in your browser, and synced ones are kept on the server too.

To keep working on them, a plan is a year of the studio, from about
{FROM_DAY} a day: {PLAN_TERMS}. Founding prices hold until
{RISE_DATE}.

https://filmmakerstudio.in/pricing?src=email&utm_campaign=pass-end

If something stopped you, reply and tell us. A person reads every reply.

FilmMakerStudio
```

## E-mail 8 — a week after the pass ended (once)

Sent once, only if no plan was bought. No countdown, no second reminder.

**Subject:** One thing from your week in the studio

```
Hello {FIRST_NAME},

A week ago your launch pass ended. If the call sheet, the stripboard or the
budget was the part you used, those are on Intermediate and Pro; the
writing tools are on every plan. The pricing page lists exactly what each
plan includes.

https://filmmakerstudio.in/pricing?src=email&utm_campaign=pass-week

FilmMakerStudio
```

## Rules for editing this file

- Do not add a testimonial, a user count or a "filmmakers are saying" line
  until a real, consented one exists (schema §59 approval).
- Do not write "pay once", "lifetime" or "money-back".
- Do not add a second reminder about the deadline. One is information; two is
  a countdown.
- Keep each e-mail under about 200 words.
