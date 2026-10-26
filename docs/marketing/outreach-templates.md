# Outreach templates

Written 26 Oct 2026. NOT SENT. Personal messages, one at a time, edited for
the person. Never a mass send, never to a bought list. Sign with the trading
name and your first name only if you choose to; `brand.json` keeps `seller`
empty, so the owner's full name is never written.

Fill before sending: `{TRIAL}` from `trial_offer()`, prices only from
`price_notice()`, a code's discount only from the console. Every link is
tagged per `docs/MARKETING-PLAYBOOK.md` §3.

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

Would you like a year of the Pro plan, free, to try on a real project? There
is no obligation to post anything. If you do review it, say what you really
think, including what is missing.

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
- Your link: https://filmmakerstudio.in/start?src=yt-{handle}&utm_campaign={video}&ref={CODE}

What I need from you:
- Mark it as a paid partnership (the platform's box and a spoken line).
- Say only what is true of the product today. The one-page brief below has
  the list. Please do not promise features that are not built yet, a free
  plan (there is none) or refunds (purchases are final except a duplicate
  charge, a plan never activated, and what Indian law requires).
- Plans are one year each; nothing renews by itself. Please do not say
  "pay once" or "lifetime".

Either of us can end this any time; commission already earned is still paid.
```

### The one-page creator brief

| You may say | Do not say |
| --- | --- |
| Story, screenplay, breakdown, stripboard, budget, call sheets, shoot day, deliverables in one browser studio | "Replaces Final Draft / Celtx / StudioBinder" |
| Tamil dialogue with English slug lines; an opt-in Type Tamil mode turns romanised dialogue into Tamil script, word by word | "Converts your whole script to Tamil" / "types Tamil for you" |
| Budgets in rupees starting from Chennai rates, with sources | "Union rates" / "FEFSI-approved" |
| Imports Fountain, Final Draft, Word, text, real-text PDF; exports PDF, Word, Final Draft, Fountain | "Imports scanned PDFs" |
| Works offline once installed | "Never needs the internet" |
| Your work lives in your browser first; Drive backup on Intermediate and Pro | "Nothing ever leaves your computer" |
| One payment for one year; nothing renews by itself | "Pay once", "lifetime" |
| A {TRIAL} trial, no card | A trial length you have not just checked |
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

{Festival} is one of the short-film calls our users plan around, so I
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

Remove "one of the short-film calls our users plan around" unless the
festival really is in the product's festival list (`src/data/festivals*.json`).

## 5. WhatsApp groups

### Before sharing anything

Contribute first: answer questions for two weeks. Read the group's rules;
if links or promotion are not allowed, do not post one, and ask the admin.

### The share message (when the group allows it, or when asked)

```
I make a browser tool for planning films — script import, breakdown,
stripboard, budget in rupees, call sheets as a WhatsApp message. It is built
for Tamil units first. There is a {TRIAL} free trial on two sample films,
no card. Happy to answer questions here or in DM.
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
free trial: https://filmmakerstudio.in/start?src=reddit&utm_campaign={subreddit}
```
