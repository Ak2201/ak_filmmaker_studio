# E-mail series — six messages

**Status: NOT SENT.** Written 26 Oct 2026. Nothing here may go out until:

1. `RESEND_API_KEY` and `MAIL_FROM` are set (`docs/BILLING.md` §13, §16) and
   one test message has arrived from `support@filmmakerstudio.in`;
2. the recipient is on the leads list **with consent** (the launch-offers
   form on `/start`, schema §29), or is a customer receiving a message about
   their own account;
3. every `{PLACEHOLDER}` below is filled from the server the day it is sent
   (see the table), and the trial length matches `trial_offer()`.

Plain text only: no images, no tracking pixels, no open tracking. One link
per message where possible, each tagged `src=email-<n>`. Every message ends
with the footer. Sign with the trading name; never the owner's name.

## Fill-ins (read on the day of sending)

| Placeholder | Source |
| --- | --- |
| `{TRIAL_DAYS}` | `trial_offer().trial_hours / 24` (3 once the 26 Oct setting is made) |
| `{BASIC_YEAR}`, `{INDIE_YEAR}`, `{PRO_YEAR}` | `price_notice()` current price per plan, in rupees |
| `{FROM_DAY}` | the pricing page's "from about … a day" figure (derived, never typed) |
| `{RISE_DATE}` | `price_notice()` `next_at`, written as a date in IST ("31 December 2026") |
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
Chennai rates and show where each figure came from, and call sheets you can
send as a WhatsApp message.

The quickest way to see it is the free trial: {TRIAL_DAYS} days of the whole
studio, no card needed. It starts when you press start, not before.

https://filmmakerstudio.in/start?src=email-1&utm_campaign=welcome

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
https://filmmakerstudio.in/guide-call-sheet

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

Try it on your own script during the trial:
https://filmmakerstudio.in/start?src=email-3&utm_campaign=import

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

Each plan is one payment for one year. Nothing renews by itself: when the
year ends, buy the next one if you want it. Moving up mid-year credits the
unused part of your year.

These are founding prices. They hold until {RISE_DATE}, or until the
founding places are taken if that comes first. A plan bought before then is
a full year at the price you paid.

Purchases are final, except a duplicate charge, a plan that was never
activated on your account, and refunds Indian law requires. Please use the
trial first so you know what you are buying.

Students: the code STUDENT50 gives the student price on Intermediate.

https://filmmakerstudio.in/pricing?src=email-4&utm_campaign=plans

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

If you have been waiting, the trial is still the right first step. If the
studio is not for you, ignore this e-mail; we will not send a countdown.

https://filmmakerstudio.in/pricing?src=email-5&utm_campaign=founding

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
3. Open the Dragon sample to see every tool filled in before you fill your
   own.

You also have a referral code, on the Plan tab of Settings. A friend who uses it gets
a discount, and you are credited a share of what they pay. Both figures are
shown beside the code.

Your invoices are on the Purchase page whenever you need them.

Reply to this e-mail with anything that gets in your way.

FilmMakerStudio
```

## Rules for editing this file

- Do not add a testimonial, a user count or a "filmmakers are saying" line
  until a real, consented one exists (schema §59 approval).
- Do not write "pay once", "lifetime" or "money-back".
- Do not add a second reminder about the deadline. One is information; two is
  a countdown.
- Keep each e-mail under about 200 words.
