# Outreach templates

Written 26 Oct 2026. NOT SENT. Personal messages, one at a time, edited for
the person. Never a mass send, never to a bought list. Sign with the trading
name and your first name only if you choose to; `brand.json` keeps `seller`
empty, so the owner's full name is never written.

Fill before sending: `{PASS_PRICE}`, `{PASS_LENGTH}` and `{PASS_ENDS}` from
`trial_offer()->'pass'` (playbook §0 rules 3 and 6; if it reads `open`
false, leave the pass out), `{RISE_DATE}` and prices only from
`price_notice()`, a code's discount only from the console, all read the day
you send. Every link is tagged per `docs/MARKETING-PLAYBOOK.md` §3; the
console shows the bucket (`creator-*` is `partner`, `school-*` is `school`,
`fest-*` is `event`, `wa-*` is `whatsapp`), never the slug.

For film schools, `docs/OUTREACH-FILM-SCHOOLS.md` is the source (three
e-mails, Harvey, DPDP rules); a shorter first-contact version is below.

---

## 1. YouTube and Instagram creators (first message)

**Subject / DM opener:** A filmmaking tool to review, no strings

```
Hi {name},

I watched your {specific video} — {one honest sentence about it}.

I make FilmMakerStudio, a browser studio that takes a film from screenplay
to breakdown, schedule, budget and call sheets, built for Tamil and Indian
units (Tamil dialogue with English slugs, rupee budgets from Chennai rates,
call sheets on WhatsApp).

Would you like an invite code to try it on a real project? There is no
obligation to post anything. If you do post about it, please say you were
given the access free (the platform's paid-partnership or gifted label and
a spoken line), and say what you really think, including what is missing.

If it fits your channel, there is also an affiliate code for your audience
(details below), but that is a separate question.

{signature}
```

## 2. Affiliate terms (send only after they say yes)

```
Here is how the code works, so it is all in writing:

- Your code: {CODE}. Your viewers get {DISCOUNT}% off any plan.
- You earn {COMMISSION}% of what each buyer actually pays with your code,
  after the discount and after any refund.
- I pay on the {DAY} of each month for the previous month, by bank transfer
  or UPI, with a statement of the orders (no buyer names).
- Your link: https://filmmakerstudio.in/start?src=creator-{handle}&utm_campaign={video}&ref={CODE}

What I need from you:
- Mark it as a paid partnership (the platform's box and a spoken line).
- Say only what is true of the product today. The one-page brief below has
  the list. Please do not promise features that are not built yet, a free
  plan (there is none) or refunds (purchases are final except a duplicate
  charge, a plan never activated, and what Indian law requires).
- Plans are one year each, {PLAN_TERMS}. Please do not say "pay once" or
  "lifetime", and do not say whether a plan renews except as the pricing
  page says it on the day.

Either of us can end this any time; commission already earned is still paid.
```

### The one-page creator brief

| You may say | Do not say |
| --- | --- |
| Story, screenplay, breakdown, stripboard, budget, call sheets, shoot day, deliverables in one browser studio | "Replaces Final Draft / Celtx / StudioBinder" |
| Tamil dialogue with English slug lines; an opt-in Type Tamil mode turns romanised dialogue into Tamil script, word by word | "Converts your whole script to Tamil" / "types Tamil for you" |
| Budgets in rupees starting from the Chennai 2024-25 rate card, 8 figures re-checked and dated | "Union rates" / "FEFSI-approved" |
| Imports Fountain, Final Draft, Word, text, real-text PDF; exports PDF, Word, Final Draft, Fountain | "Imports scanned PDFs" |
| Works offline once installed | "Never needs the internet" |
| Your work lives in your browser first; Drive backup on Intermediate and Pro | "Nothing ever leaves your computer" |
| A year of the studio; {PLAN_TERMS} (read from the console that day) | "Pay once", "lifetime", "nothing renews" or "renews" typed from memory |
| The launch pass: {PASS_PRICE} for {PASS_LENGTH} of the whole studio, once per account | "Free trial", "no card", a price or length you have not just checked, "₹49 off a plan" |
| Founding prices until {RISE_DATE} | "Last chance", a countdown, "only N left" |

## 3. Film schools (short first contact)

```
Subject: A script-to-call-sheet tool for your short-film module

Hi {first_name},

I make FilmMakerStudio, a browser tool that takes a student screenplay
through breakdown, stripboard and a budget that starts from Chennai rates.
Nothing to install; student work stays in their own browser first.

I would like to offer a faculty account (the full Pro plan, which adds call
sheets, the shoot day and the CBFC and delivery checklists) to evaluate it,
and a student price for your class (code STUDENT50 on the Intermediate plan). I can also run a
20-minute session on taking one scene from script to call sheet.

Would that be useful for a class at {school}?

{signature}
```

Link, if one is needed: `https://filmmakerstudio.in/start?src=school-{slug}&utm_campaign=pilot-{term}`.

## 4. Festival and film-society partners

```
Subject: A tool for your entrants, and a short talk

Hi {first_name},

{Festival} is in the studio's festival list, with its deadline, so I
wanted to ask whether a small partnership would be useful.

FilmMakerStudio is a browser studio for planning a film: screenplay,
breakdown, schedule, budget, call sheets and a deliverables checklist with
festival deadlines. I could offer:

- a discount code for your entrants, valid until your submission deadline
  ({deadline}), and
- a 20-minute online talk on scheduling or budgeting a short.

I would not describe {Festival} as a partner, sponsor or endorser anywhere
unless you agree to the exact wording in writing.

{signature}
```

Write "is in the studio's festival list, with its deadline" only if the
festival really is in `src/data/festivals.json`; otherwise open with
"{Festival}'s short-film call is coming up". Never claim what users do: no
usage is measured per festival.

## 5. WhatsApp groups

### Before sharing anything

Contribute first: answer questions for two weeks. Read the group's rules;
if links or promotion are not allowed, do not post one, and ask the admin.

### The share message (when the group allows it, or when asked)

```
I make a browser tool for planning films — script import, breakdown,
stripboard, budget in rupees, call sheets as a WhatsApp message. It is built
for Tamil units first. Launch offer: {PASS_PRICE} for {PASS_LENGTH} of the
whole studio, ends {PASS_ENDS}. Happy to answer questions here or in DM.
https://filmmakerstudio.in/start?src=wa-group&utm_campaign=share-v1
```

### Answering a question with a guide (the default)

```
A call sheet needs per-person call times, the location pin, the scenes in
shooting order, who is needed and released when, and sunrise or sunset if
you are chasing light. There is a longer write-up with an example here:
https://filmmakerstudio.in/guide-call-sheet?src=wa-group&utm_campaign=guide
```

### Own broadcast list (opt-in only)

```
FilmMakerStudio update, {month}:
- {one real change, in one line}
- {one tip}
Reply "stop" to leave this list.
```

## 6. Reddit and Quora

- Answer the question fully first. If the answer stands without a link, post
  it without one.
- If you link the product, say "I make this" in the same sentence.
- Follow each subreddit's self-promotion rule; many allow none outside a
  weekly thread.

Template ending, when a tool was asked for:

```
Disclosure: I make FilmMakerStudio, which does this in a browser (script
import to breakdown, stripboard and call sheet; rupee budgets). There is a
launch offer on: https://filmmakerstudio.in/start?src=reddit&utm_campaign={subreddit}
```
