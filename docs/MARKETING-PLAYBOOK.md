# Marketing playbook — the owner's plan for finding paying filmmakers

Written 26 Oct 2026; revised the same day for the source-bucket contract,
the whole-studio trial decision and the switching guides. Status: a PLAN.
Nothing in it has been posted, sent or spent. It replaces the marketing half of `docs/RELEASE-PLAN.md` §5 where the
two disagree (that file still says "pay once" and "invite-only"; both are
history since the yearly plans of 21 Oct and the trial decision of 26 Oct).

Companion files:

| File | What it holds |
| --- | --- |
| `docs/marketing/email-series.md` | Six plain-text e-mails, NOT SENT, for when Resend is configured |
| `docs/marketing/ad-copy.md` | Meta, Instagram and YouTube ad variants, true claims only |
| `docs/marketing/outreach-templates.md` | Creators, affiliates, film schools, festivals, WhatsApp groups |
| `docs/marketing/content-calendar.md` | Eight weeks of posts, day by day |
| `docs/OUTREACH-FILM-SCHOOLS.md` | The three-e-mail film-school sequence and the Harvey setup |
| `social/CAPTIONS.md` | Instagram profile and the caption for every poster |

## 0. Rules every line of copy follows

These come from `CLAUDE.md`, `docs/BILLING.md` and the refund policy. They
are not style preferences; breaking one is either untrue, unlawful under
India's CCPA dark-pattern guidelines, or both.

1. **No invented social proof.** No testimonials, user counts, "filmmakers
   love it", ratings, awards or "as seen in" until a real one exists, with the
   person's written consent. The first real quote goes through the console's
   testimonial approval (schema §59), never straight into an ad.
2. **No invented scarcity.** The founding price rises on a date the server
   holds **or** when the founding places are taken, whichever comes first.
   Quote the date from `price_notice()` the day you post. Never write "only N
   left" unless you read N from `price_notice()` that morning, and prefer not
   to write it at all (§7.3).
3. **Never type a price you have not just read.** The live figures are
   `price_notice()` (rupees) and `price_notice('USD')` (dollars plus the rupee
   amount actually charged). The table in §2.2 is a snapshot for planning.
   Ads and captions in `docs/marketing/` use placeholders (`{BASIC_YEAR}`,
   `{FROM_DAY}`, `{RISE_DATE}`) so a stale figure cannot be copied by accident.
   **The same goes for the founding date and the trial**: copy meant for
   posting never types the date or the length. `{RISE_DATE}` is read from
   `price_notice()` `plans[].next_price_at` (an IST date; null means the rise
   has fired, so drop the line) and `{TRIAL_LENGTH}` from `trial_offer()`
   `trial_hours` (72 hours is "3 days"), both on the console the day you
   post. Only §6, the owner's own steps, names the decided values.
4. **The charged amount is never hidden.** If a post shows a dollar figure,
   it also says what is charged today (rupees, until `usd_checkout` is on).
5. **Plans are one year each.** Never "pay once", "lifetime", "own it
   forever". The true lines are: one payment for one year; nothing renews by
   itself; buy again to add a year; move up mid-year and the unused part is
   credited.
6. **The trial is two server settings, and copy follows both.**
   `{TRIAL_LENGTH}` is whatever `trial_offer()` answers that day; if you
   have not just read it, write "a free trial" with no length. What the
   trial opens is `{TRIAL_OPENS}`: "the whole studio" ONLY when
   `trial_offer()` carries `trial_scope: "full"` (it gains that key with
   schema §60; an older server sends none) and `trial_plan` is `pro`;
   otherwise "the tools on the two sample films". A whole-studio trial still
   keeps the no-plan limits (one film in the cloud, no share links, no
   collaborators; local work is never capped), so never promise sharing or a
   team on the trial.
7. **Purchases are final** except a duplicate charge, a plan never activated,
   and refunds Indian law requires. Never "money-back guarantee".
8. **No real person** in a sample, a screenshot or an ad without consent.
   The Dragon and The Dark Knight samples are reconstructions and say so.
9. **Name only what is built and on the plan you name.** Call sheets, Shoot
   Day, Edit Log, Deliverables and the AI tools are **Pro**. Breakdown,
   auto-tagging, cast matrix, screen time, storyboard, shot list, stripboard,
   Day Out of Days, budget, contacts, sides, reports, Google Drive backup and
   the Chrome extension are **Intermediate and up**. Story, Idea Vault,
   screenplay, drafts, import and PDF exports are on **every plan (Basic and
   up)**. The pricing page's table is generated from
   `src/data/plan-matrix.json`; when in doubt, read it there. A module whose
   `plans` is `[]` there is switched off on every plan and is never named:
   today that is case studies, dissection, the glossary, the pitch deck, the
   lookbook, media, songs and the Screenplay Analysis module (`script-breakdown`;
   the Script analysis tab on the Screenplay Writer is not that module).
10. **Disclose every paid relationship** (affiliates, sponsored posts), in
    the video and in the description, per platform rules and ASCI guidance.

## 1. Positioning

### 1.1 Who it is for, in order

| Order | Who | What they need that the product really has | Plan they fit |
| --- | --- | --- | --- |
| 1 | **Tamil independent and short filmmakers**, first or second film, Chennai, Coimbatore, Madurai, the diaspora | Tamil dialogue with English slug lines, and an opt-in Type Tamil mode (romanised Tamil in a dialogue line is offered in Tamil script, word by word); budgets in rupees starting from Chennai rates with a source and a checked date on each figure; call sheets as a WhatsApp message (Pro); CBFC and OTT delivery checklists (Pro, Deliverables) | Intermediate (prepare the shoot) or Pro (run it) |
| 2 | **Other Indian independents** (Malayalam, Telugu, Kannada, Hindi) | The same planning chain in rupees. Be honest: the Tamil-specific help is Tamil only | Intermediate |
| 3 | **Film and Viscom students** | A real tool for the diploma film, plus the learning Library; a student price through the `STUDENT50` code | Intermediate at the student price |
| 4 | **Small production houses and line producers** | Budget against actuals, production reports, call sheets, the shoot day, deliverables | Pro |
| 5 | **International independents** (second wave) | Final Draft (.fdx) both ways, Fountain, Word, PDF; local-first storage; one yearly payment that does not renew by itself | Basic or Intermediate. Dollar checkout is OFF until Razorpay International is approved (§6 step 7) |

Not the target: studios that need enterprise contracts, union (SAG/IATSE/WGA)
paperwork, or real-time co-writing at scale.

### 1.2 The one sentence

> Write, plan and shoot your film in one place that works the way an Indian
> set works: Tamil on the page, call sheets on WhatsApp, rupees in the budget.
> A year of the studio for less than a cup of tea a day.

"Less than a tea a day" holds at every tier before and after the rise (the
dearest risen price is about ₹5.48 a day). Recheck it if prices change.

### 1.3 Three proof lines (each one checkable in the product)

1. **From script to call sheet without retyping.** Import a screenplay
   (Fountain, Final Draft, Word, text or PDF) and the scenes, characters and
   locations flow into the breakdown, the stripboard and the call sheet.
2. **Built for Tamil units.** Tamil dialogue, English slugs, Chennai rates
   with sources, CBFC and OTT delivery checklists and call sheets on
   WhatsApp (the last two on Pro).
3. **Your work stays yours.** It lives in your browser first, works offline
   on set, backs up to your own Google Drive on the plans that include it,
   and exports in open formats. Never stretch this into "we store nothing":
   signed-in projects sync to the studio's cloud.

### 1.4 What the simulated launch told us (and what it did not)

`docs/research/LAUNCH-SIM-24-2026-10-21.md` is a model playing 24 personas,
not market research. It is still useful as a list of objections to answer
before anybody raises them:

- **Trust beats price.** 11 of 24 worried a small new tool might vanish with
  their script. Answer: the trust page (`trust.html`), open-format exports,
  the local-first model, and a person who replies. Lead with these, not the
  deadline.
- **The countdown backfired.** 10 of 24 read it as pressure, 1 as a reason to
  buy. So the founding date is stated once, plainly, and never shouted.
- **"How long is the trial?"** was the most asked question. Say
  `{TRIAL_LENGTH}` wherever the trial is offered (read that day), and say
  what it opens: `{TRIAL_OPENS}` (rule 6).
- **Writers want confidentiality in plain words**, crew are not the buyer,
  and non-Tamil personas wanted their own script. Do not promise Malayalam or
  Telugu tooling that does not exist.

## 2. The offer

### 2.1 What a visitor gets

| Piece | Truth to say | Where it lives |
| --- | --- | --- |
| **Free trial, `{TRIAL_LENGTH}`, `{TRIAL_OPENS}`** | Decided 26 Oct 2026: 3 days of the whole studio, no card. True only once schema §60 has run (a pressed trial then follows the console's `trial_scope`) and the console reads `trial_scope` full and `trial_plan` pro (§6.1). Until both read back, a pressed trial is the tools on the two sample films (The Dragon and The Dark Knight reconstructions), and copy says so. Either way: no card, it starts only when they press start (or redeem a code), and a whole-studio trial keeps the no-plan limits (one film in the cloud, no share links, no collaborators) | `trial_offer()` (`trial_hours`, and `trial_scope` once §60 has run); console Growth → Trial |
| **Yearly plans** | Basic, Intermediate, Pro, one payment each for one year, nothing renews by itself | `price_notice()`; `pricing.html` |
| **Founding prices** | Today's prices hold until `{RISE_DATE}` (the server's `next_price_at`; the owner is moving it to 31 Dec 2026, §6 step 2) or until the founding places fill, whichever is first. A plan bought now is a full year at the price paid | `price_notice()` |
| **Student band** | Code `STUDENT50` gives the student price on Intermediate. Verify a student ID or college e-mail by hand for bulk requests | Promo code (§20); the button on the plan cards |
| **Referral codes** | Every paying member has a `REF-XXXXXX` code. The friend gets `referral_friend_pct` off (default 10%); the referrer is owed `referral_reward_pct` of what the friend paid (default 10%), paid by hand | The Purchase page ("Your referral code", `purchase.html`); console Growth |
| **Affiliate codes** | A promo code with a commission %, for creators. Revenue and commission due are derived per code; paid by hand | Console Billing → Promo codes ("Commission %"); Growth shows the report |
| **Upgrade mid-year** | The unused part of the year is credited against the higher plan | `apply_plan` (§52) |

The panel's own COPY LINK is `/purchase?ref=CODE` with no `src`, so a
member-shared link is counted as `direct` unless the member adds
`&src=referral` (§3).

Confirm `referral_friend_pct`, `referral_reward_pct` and that `STUDENT50`
exists and is active on the console **before** any post names them.

### 2.2 Snapshot of the figures (planning only — re-read before use)

Read 26 Oct 2026 from `src/lib/plans.js` `LIST_PRICE`, `EDU_PRICE` and the
live `price_notice()` values recorded in `CLAUDE.md`:

| Plan (id) | Year today | Per day | Founding price rises to | USD today → next (display; charged in ₹ until `usd_checkout`) |
| --- | --- | --- | --- | --- |
| Basic (`starter`) | ₹599 | ≈ ₹1.64 | ₹999 | $19 → $29 |
| Intermediate (`indie`) | ₹799 | ≈ ₹2.19 | ₹1,499 | $29 → $39 |
| Pro (`pro`) | ₹999 | ≈ ₹2.74 | ₹1,999 | $39 → $49 |
| Student (Intermediate + `STUDENT50`) | ₹399 (only with the fixed-amount code of §6 step 6) | ≈ ₹1.09 | an owner decision before the rise (§6 step 6) | — |

The USD column is the seed in `supabase-schema.sql` §56; the owner may have
changed it on the console. `price_notice('USD')` is the only figure to quote.

## 3. Tagged links: how every channel is counted

The studio carries no ad pixel and no third-party script (by design; see
`docs/LAUNCH.md` §8). Attribution is first-party: `src/lib/attribution.js`
reads `?src=` (or `utm_source`), `utm_campaign` and `?ref=` on arrival and
keeps them for the tab only (sessionStorage, key `fms_attrib_session`).
`src/lib/funnel.js` `funnelSource()` reads that record and sends its
**bucket** (below) with each daily count; schema §58 stores the count per
bucket. A `?ref=` code is carried to the purchase page's "Have a code?" box.

**What is counted, and where (26 Oct 2026).** `landing_view` on `/start`
(once per tab), `signup`, `signin_done` (the OAuth return, `cloud.js`),
`sample_open` (the hub), `trial_start` (`billing.js`, when the server says
the trial started), `plan_view_in_app` (the purchase page, signed in),
`checkout_start` and `purchase` all carry the tab's bucket. Three things
still hold:

- **Guide pages and the switching guides send no `landing_view` of their
  own.** They capture `?src=`, so a click through to `/start` in the same tab
  counts under that bucket. Untagged guide traffic is read in Search Console.
- The per-source table exists only once §58 has run live (§6 step 3); until
  then the totals still count and the table stays empty.
- Visitors with Do Not Track or Global Privacy Control send nothing.

**The link shape**

```
https://filmmakerstudio.in/start?src=<tag>&utm_campaign=<note>
https://filmmakerstudio.in/start?src=<tag>&utm_campaign=<note>&ref=<CODE>   (affiliates, referrals)
```

**Buckets: what the console shows for each tag.** The console never shows
the tag you typed. It shows the BUCKET `sourceBucket()` maps it to: an exact
name, or the family of the part before the first `-`. Anything that matches
neither counts as `other`; no `src` at all shows as `direct`. **Slugs are not
counted separately**: `school-loyola`, `school-psg` and `school` are all one
`school` row, and `creator-filmkaadhal` is one `partner` row with every other
creator. That is deliberate: a count may say how many came from schools, never
which school or which creator (no per-person or per-school data in the
counts).

| You write `src=` | Console bucket |
| --- | --- |
| `google`, `bing`, `duckduckgo` (or `ddg`), `yahoo` | the same name |
| `instagram`, `ig`, `insta`, `ig-<anything>`, `insta-<anything>` | `instagram` |
| `facebook`, `fb`, `fb-<anything>` | `facebook` |
| `meta-<anything>`, `ads` | `ads` |
| `youtube`, `yt`, `yt-<anything>` | `youtube` |
| `whatsapp`, `wa`, `wa-<anything>` | `whatsapp` |
| `x`, `twitter` | `x` |
| `linkedin`, `telegram`, `reddit`, `threads`, `pinterest`, `producthunt`, `podcast`, `quora` | the same name |
| `email`, `mail`, `newsletter` | `email` |
| `partner`, `affiliate`, `creator-<anything>`, `aff-<anything>` | `partner` |
| `event`, `festival`, `fest-<anything>` | `event` |
| `school`, `school-<anything>` | `school` |
| `directory`, `dir-<anything>` | `directory` |
| `referral`, `ref-<anything>` | `referral` |
| anything else (`email-1`, `preflight-test`, `tiktok`, …) | `other` |

Rules:

- Lowercase, no spaces, no e-mail addresses. Use the tags in the register
  below and nothing new without adding a row here first, or it reads `other`.
- **`utm_campaign` is never stored on the server.** It stays in the visitor's
  tab only. Use it as a reading aid for your OWN link notes (which link you
  put where, in a sheet you keep), not as something the console can split.
- The **first** source in a tab wins; the **latest** code wins.
- Organic search and typed URLs arrive with no `src` and show as `direct`.
- **What the console cannot tell apart, and where to read it instead:**
  - Meta test cells (all `ads`): read each cell in Meta Ads Manager (landing
    page views, spend), and compare against the console's `ads` row by day.
  - YouTube in-stream ads vs your own channel (both `youtube`): the ad's
    views and clicks are in Google Ads; run them in different weeks if the
    split matters.
  - One creator vs another (all `partner`): each creator has their own
    affiliate code, so read revenue per code in Growth → Affiliates.
  - One school or festival vs another: their cohort or festival promo code,
    in Billing → Promo codes.

**The channel register** (add a row before you use a new tag)

| Channel | `src` | Bucket | `utm_campaign` (your note only) | `ref` |
| --- | --- | --- | --- | --- |
| Instagram bio | `ig-bio` | `instagram` | `profile` | — |
| Instagram post / reel / story link | `ig-post`, `ig-reel`, `ig-story` | `instagram` | `wk1-callsheet` | — |
| Meta ads (one tag per test cell) | `meta-t1a` … `meta-t1g` | `ads` | `test1` | — |
| Meta retargeting | `meta-rt` | `ads` | `rt1` | — |
| YouTube in-stream ads | `yt-ads` | `youtube` | `y1` | — |
| YouTube own channel | `yt-own` | `youtube` | `demo-import` | — |
| YouTube / Instagram creator | `creator-<handle>` | `partner` | `review-nov` | the creator's affiliate code |
| WhatsApp groups (shared message) | `wa-group` | `whatsapp` | `share-v1` | — |
| WhatsApp own broadcast | `wa-bcast` | `whatsapp` | `bcast-<n>` | — |
| Film school (one tag per school, for your notes) | `school-<slug>` | `school` | `pilot-<term>` | a cohort promo code if issued |
| Festival / film society partner | `fest-<slug>` | `event` | `<fest>-2026` | the partner's code if agreed |
| Reddit answer | `reddit` | `reddit` | `<subreddit>` | — |
| Quora answer | `quora` | `quora` | `<topic>` | — |
| Product Hunt | `producthunt` | `producthunt` | `launch` | — |
| Directories (AlternativeTo, SaaSHub, …) | `dir-<name>` | `directory` | `listing` | — |
| E-mail series (`email-series.md`) | `email` | `email` | `welcome`, `plans`, … (one per e-mail) | — |
| Referral (a member shares) | `referral` | `referral` | — | their `REF-` code. The panel's copy link is `/purchase?ref=CODE` with no `src`: counted as `direct` unless the member adds `&src=referral` |

Example, for a YouTube creator with the code `FILMKAADHAL20`:
`https://filmmakerstudio.in/start?src=creator-filmkaadhal&utm_campaign=review-nov&ref=FILMKAADHAL20`
(console: `partner`; the creator's own figures: Growth → Affiliates, code
`FILMKAADHAL20`).

Test every new tagged link once in a private window: it should land on
`/start` (not `/start.html`, which redirects) and the code should appear in
the purchase page's code box after sign-in.

## 4. Channel plan, with weekly actions

Hours are the owner's. The order is free channels first: they teach the
message cheaply before money amplifies it.

### 4.1 Instagram (owned, every week)

- **Profile**: `social/CAPTIONS.md` (bio link `https://filmmakerstudio.in/start?src=ig-bio&utm_campaign=profile`).
- **Weekly**: 3 feed posts or reels (Mon / Wed / Fri), stories on most days,
  reply to every comment and DM within a day.
- **Mix**: 40% real screen-recorded demos, 25% craft (no selling), 15% the
  person behind it, 15% answers to real questions, 5% the offer.
- **Every reel is a real recording of the shipped build.** No mock-ups.
- Hashtags: 5 to 10, local and specific (`#tamilshortfilm`,
  `#chennaifilmmakers`, `#kollywood`, `#indiefilmindia`, `#callsheet`). Look
  at each tag's recent posts before using it.
- The posting order for 8 weeks is in `docs/marketing/content-calendar.md`.

### 4.2 Meta ads (paid; a test with stop rules)

No pixel, so optimise for **landing page views**, not purchases. Every
cell's tag (`meta-*`) lands in the console's one `ads` bucket (§3), so a
CELL is judged on Meta Ads Manager's own figures (spend, landing page views,
cost per landing view), and the console's `ads` row says whether the paid
traffic as a whole goes on to `trial_start` and `purchase`. To compare two
cells on trials, run them on different days, not side by side.

**Test 1 — week 2 of the calendar, 7 days, ₹2,100 total (₹300/day)**

| Cell | `src` | Creative (from `ad-copy.md`) | Audience |
| --- | --- | --- | --- |
| A | `meta-t1a` | M1 "Script to call sheet" reel | Tamil Nadu, 18–40, interests: filmmaking, short film, Tamil cinema |
| B | `meta-t1b` | M2 "Tamil on the page" reel | same |
| C | `meta-t1c` | M1 | Kerala, Karnataka, Telangana, Maharashtra, same interests |
| D | `meta-t1d` | M3 "Budget in rupees" static | Tamil Nadu, interests: film school, mass communication |

Cells E–G (`meta-t1e` M4, `meta-t1f` M5, `meta-t1g` M6) are the reserve
creatives: swap one in when a cell is paused, never more than one a day.

**Stop rules (apply daily, write every change in a log with the date)**

1. Do not judge a cell before ₹500 spent or 300 landing views (Ads
   Manager).
2. Pause a cell whose cost per landing view (Ads Manager) is twice the best
   cell's.
3. Pause the test's weakest cell if the console's `ads` row shows 0
   `trial_start` after ₹700 spent across the test.
4. Pause **everything** if the console's `ads` row shows `landing_view` but
   no `pricing_view` or `trial_start` after ₹1,500: the page or the tag is
   broken, not the audience. If `ads` shows NO `landing_view` while Ads
   Manager reports landing page views, the tag is broken: fix the link
   first.
5. One change at a time. Never raise a budget and swap a creative the same
   day.

**Test 2 — the following week, ₹3,500 (₹500/day) on the one or two winners**.
Move up only if the `ads` row's `trial_start` per ₹100 spent holds within
30% of Test 1.

**Scale** — +20% every 3 days while blended cost per purchase stays under
**40% of the plan price bought** (Intermediate at ₹799 → at most about ₹320).
Above that, stop and rework; do not scale a loss.

**Retargeting** (`meta-rt`, bucket `ads`) — people who engaged with the Instagram account
or watched 50% of a reel (Meta-side audiences, no pixel). ₹200/day once the
account has a few thousand engaged people.

**Total for the first month, if every gate passes: about ₹9,000.** If Test 1
fails every rule, the money stops at ₹2,100.

### 4.3 YouTube creators and affiliates

- **List** 20 Tamil and Indian filmmaking channels (craft tutorials,
  short-film makers, film-school vlogs, gear reviewers). Size matters less
  than whether their audience makes films.
- **Offer**: a full year of Pro, free (a console e-mail grant), to review
  honestly, and an **affiliate code** for their audience: a viewer discount
  (suggest 10–15%) and a commission on revenue (suggest 20–25%; the owner
  decides). Make it on Billing → Promo codes with "Commission %" filled in.
- **Brief**: `outreach-templates.md` has the message and the one-page brief
  (what they may claim, what they must not, the final-sale wording,
  disclosure).
- **Tag**: `src=creator-<handle>` (bucket `partner`) plus their code as
  `ref`. The console counts all creators as one `partner` row; each
  creator's own figures are their code's revenue in Growth → Affiliates.
- **Payout**: monthly, by hand, from the Growth tab's affiliate report
  (revenue is already net of discount and refunds). Pay on a fixed date and
  tell them the date in writing first.
- **Weekly**: 5 new creator messages; follow up once after 5 days; never a
  third time.

### 4.4 WhatsApp groups and broadcast

- **Groups**: join film groups as a member, answer questions for two weeks
  before ever sharing a link, follow each group's rules. When a question is
  one the product answers, share the guide page first, the product second.
- **Own broadcast list**: only people who asked to join (beta users, buyers,
  people who wrote in). Two messages a month at most: a release note and a
  tip. Every message says how to leave the list.
- The share message is in `outreach-templates.md` (WhatsApp section), tagged
  `src=wa-group` (bucket `whatsapp`).

### 4.5 Film schools

Follow `docs/OUTREACH-FILM-SCHOOLS.md` (three e-mails, Harvey, the DPDP Act
rules). It names no trial length: a pressed trial is `{TRIAL_LENGTH}` from
`trial_offer()`, and an invite code is worth its own `code_trial_days`
(console), so read whichever you offer on the day.

- **Weekly**: 10 schools contacted (Harvey caps at 20 a day with approval on).
- **Offer**: a faculty Pro grant to evaluate; `STUDENT50` for students; a
  20-minute online workshop "from a short-film script to a call sheet".
- **Tag**: `src=school-<slug>` on every link sent to that school (bucket
  `school`; the console does not split one school from another, so give a
  school its own cohort code if you need its numbers).
- Group access for a whole class is by invite codes and grants, set up by
  hand. There is no bulk education licence in the checkout; do not sell one.

### 4.6 Festivals and film societies

- Target short-film festivals and film societies in Tamil Nadu and Kerala
  with an open call in the next 3 months.
- **Offer**: a discount code for entrants (a promo code with a real end date
  equal to the festival's submission deadline), a 20-minute talk on
  scheduling or budgeting a short.
- Never claim endorsement, partnership or "official tool" unless the
  festival agrees **in writing**, and then use only their wording.
- **Tag**: `src=fest-<slug>` (bucket `event`; the partner's own code is what
  tells one festival from another).
- **Monthly**: 4 festival or society contacts.

### 4.7 Reddit and Quora answers

- Answer real questions where the honest answer is useful without the
  product: call-sheet contents, breakdown method, short-film budgeting in
  India, CBFC for shorts, festival planning.
- Link the matching **guide page** (§4.8) when it is the better answer; name
  the product only when the asker wants a tool, and say you make it.
- Subreddits to read first and follow the rules of: r/Filmmakers,
  r/Screenwriting, r/indiefilm, r/kollywood, r/IndianFilmmakers (check
  each one's self-promotion rule before posting anything with a link).
- **Weekly**: 3 answers. Tag every link, guide links included:
  `/guide-call-sheet?src=reddit`, `/start?src=quora&utm_campaign=<topic>`.
  Guide pages send no `landing_view` of their own (§3); the tag rides along
  to `/start` in the same tab.

### 4.8 SEO: the guide pages

The public site has seven guides, two switching guides, a guides index and
a trust page, generated like the rest of the public site. Linked here relative to
`docs/` (the live URL drops `.html`, e.g. `https://filmmakerstudio.in/guide-call-sheet`):

| Page | Use it for |
| --- | --- |
| [`guides.html`](../guides.html) | The index; link it from the Instagram highlights |
| [`guide-call-sheet.html`](../guide-call-sheet.html) | "How to make a call sheet" — WhatsApp groups, Reddit |
| [`guide-tamil-screenplay-format.html`](../guide-tamil-screenplay-format.html) | Tamil writers' groups, Quora |
| [`guide-short-film-budget.html`](../guide-short-film-budget.html) | Budget questions, film schools |
| [`guide-script-breakdown.html`](../guide-script-breakdown.html) | Students, first ADs |
| [`guide-cbfc-checklist.html`](../guide-cbfc-checklist.html) | Producers; always with "confirm with the regional office" |
| [`guide-ott-delivery.html`](../guide-ott-delivery.html) | Post-production questions |
| [`guide-festival-planner.html`](../guide-festival-planner.html) | Festival season; partner festivals |
| [`compare-celtx.html`](../compare-celtx.html) | "Switching from Celtx": what imports, what exports, what the move looks like |
| [`compare-final-draft.html`](../compare-final-draft.html) | "Switching from Final Draft": `.fdx` in and out, the move step by step |
| [`trust.html`](../trust.html) | The answer to "will my script be safe / what if you shut down" |

- After they ship: resubmit `public/sitemap.xml` in Search Console (verify by
  DNS TXT; never touch `index.html`'s verification tag).
- **Monthly**: read Search Console's queries; write one new guide only where
  a real query has impressions and no page.
- The two switching guides state only OUR checkable facts. Competitor facts
  sit in `src/data/marketing-compare.json` and a row is rendered only when
  its status is `read` (the owner has read the vendor's own page and noted
  the date). Today none is, so none renders, and no post, ad or reply may
  quote a competitor's feature or price either: the same rule, applied to
  everything you write by hand.

### 4.9 Product Hunt and directories

- **Product Hunt**: launch in week 4 or later, after the trial and the
  first fixes from real users. Tuesday to Thursday, 00:01 Pacific. Prepare:
  tagline (≤ 60 chars, from `ad-copy.md`), 4 screenshots of real pages, a
  60-second demo, a maker comment that names what it does not do yet. Link
  `?src=producthunt`. Do not ask for upvotes in groups (it breaks their
  rules and is invented proof).
- **Directories** (one afternoon, week 3): AlternativeTo (as an alternative
  to Celtx, StudioBinder, Final Draft), SaaSHub, Futurepedia only if the AI
  tools are the angle (they are optional and bring-your-own-key: say so),
  Indian startup directories. Tag `src=dir-<name>` (bucket `directory`).

## 5. Launch week, day by day

**Day 0 is the day the owner sets the trial live** (§6 step 1: 3 days of
the whole studio, as decided). Do not start Day 0 until every item in the
pre-flight list is true.

**Before anything else, whatever else is ready: §6 step 2 (the founding
date) must be done before 2026-10-31T18:29Z.** Day 0 waits on a live
Razorpay key, Resend, a real payment and redeployed functions; the price
rise waits for none of them.

**Pre-flight (all must be true)**

- [ ] Schema §60 ran with a checksum and read back (its 60.4 query), so a
      pressed trial follows the console's `trial_scope` (§6 step 3)
- [ ] `select public.trial_offer();` as anon reads `trial_minutes` 4320,
      `trial_hours` 72 and `trial_scope` `full` (§6.1); the console reads
      `trial_plan` `pro`
- [ ] A pressed trial on a fresh Google account: `billing_status()` reads
      `trial_scope` `full`, `features` has `call-sheets` true, and the account
      can create a project of its own. If any of these fails, every line of
      copy says "on the two sample films" instead, and nothing says "whole
      studio" or "your own film"
- [ ] `price_notice()` reads the rise at the decided instant (§6.2; due
      before 2026-10-31T18:29Z, not on Day 0)
- [ ] §58 and §59 ran with a checksum and read back (§6.3); the console's
      funnel shows a "by source" table
- [ ] **Per-source counting works**: open
      `https://filmmakerstudio.in/start?src=ig-bio` in a private window,
      then `select * from public.admin_funnel_by_source(current_date,
      current_date);` shows a `landing_view` row for source `instagram`.
      Then start the fresh account's trial from that same tab and see
      `trial_start` under `instagram` too. Do not start Meta Test 1 until both
      rows appear
- [ ] A LIVE Razorpay key is on, `RESEND_API_KEY` and `MAIL_FROM` are set,
      and one real ₹ payment and its receipt e-mail arrived (§6.5)
- [ ] The four functions owed a redeploy since §52 are redeployed (probe each
      endpoint; `docs/LIVE-STEPS-2026-10-21.md`)
- [ ] Every tagged link in §3 you will use on Day 0–7 opened once in a
      private window
- [ ] `STUDENT50` and the referral percentages are as the copy says
- [ ] Before any e-mail goes to a lead: the leads form is live (`lead.live`
      in `src/data/marketing-site.json`, only after privacy.html carries the
      owner's leads paragraph), §29 `add_lead` answers, and one test
      submission shows its row with the consent sentence. Until then the
      leads list is empty and e-mails 1–5 have nobody to go to
- [ ] `social/poster-1.png` carries no "Invite-only" or "Launching soon" line
      (regenerated 26 Oct 2026; re-check after any change)

| Day | Actions |
| --- | --- |
| **Day 0** (trial goes live) | Morning: §6.1, read back. Open `/start` and `/pricing` in a private window: the trial strip shows the length `trial_offer()` reads; the founding line shows the date `price_notice()` reads. Start one trial yourself on a fresh Google account and open your own project in it. Afternoon: post feed post 1 (announcement, `content-calendar.md` W1 Mon). Stories: "the trial is open: {TRIAL_LENGTH} of {TRIAL_OPENS}, no card" (filled that morning). Send e-mail 1 to the consented leads list (only once Resend is live and the list has a consented row). |
| **Day 1** | Reel: script import to stripboard (real recording). Share in your own WhatsApp broadcast (`wa-bcast`). Message 5 YouTube creators. Answer every comment and DM. Read the console: `landing_view`, `trial_start` by source. |
| **Day 2** | Post: "What the trial opens" carousel (`{TRIAL_OPENS}`, read that day). 3 Reddit/Quora answers with guide links. Send film-school e-mail 1 to 10 schools (Harvey, approval on). |
| **Day 3** | With a 3-day trial, the first trials from Day 0 end today. Read `trial_start` → `checkout_start` → `purchase`. Reply personally to anyone who wrote in. Story: a question box "what stopped you?" |
| **Day 4** | Reel: call sheet to WhatsApp (Pro). Directory listings (§4.9). Follow up the Day 1 creators once. |
| **Day 5** | Post: the trust post ("where your script lives", linking `trust.html`). Second WhatsApp share in groups where you have already contributed. |
| **Day 6** | Reel: budget in rupees with sources. Write down the week's numbers (§7.2) and the three most-asked questions. |
| **Day 7** | Weekly review (§7.4). Decide: start Meta Test 1 next week only if `landing_view` → `trial_start` is working from organic sources (any trials at all under `instagram` or `whatsapp`). Fix the top question on the page or the FAQ before spending. |

## 6. Console steps only the owner can make

Each one is read back by **asking the server**, not by reading the screen.
SQL pasted into the editor follows the paste rule: base64 across the
clipboard, decode in the page, compare the SHA-256 before pressing Run
(`docs/LAUNCH.md` §4).

1. **Trial: 3 days of the whole studio (owner decision, 26 Oct 2026).**
   First run schema §60 (step 3): without it a pressed trial is always the
   sample films, whatever the console says. Then `admin.html` → Growth →
   Trial: length 4320 minutes, scope "full", trial plan "Pro"
   (`admin_set_billing_settings` with
   `{"trial_minutes": 4320, "trial_scope": "full", "trial_plan": "pro"}`; it
   accepts 1 to 44,640 minutes). The trial plan matters: a full trial gets
   the features of `trial_plan`, and with it unset that is Intermediate, so
   no call sheets, Shoot Day, Edit Log, Deliverables or AI tools. Read back:
   `select public.trial_offer();` as anon must show `trial_minutes` 4320,
   `trial_hours` 72 and `trial_scope` `full`; then the §5 pre-flight's
   fresh-account check. The pages read these values; no copy is edited to
   change them, and posting copy fills `{TRIAL_LENGTH}` / `{TRIAL_OPENS}`
   from them on the day.

   Two things this does that are worth knowing before you press it:
   - A whole-studio trial keeps the no-plan LIMITS (§60's header:
     `user_limits()` still reads the free plan's row): one film in the
     cloud, no share links, no collaborators. Local work is never capped.
     Copy never promises sharing or a team on the trial.
   - `trial_scope` and `trial_plan` also govern code and admin trials, so
     every redeemed invite code becomes a full-studio Pro trial for its own
     `code_trial_days`. Decide whether a code should still be worth that
     many days, and set `code_trial_days` accordingly.
2. **Move the founding-price date to 31 Dec 2026. DO BEFORE
   2026-10-31T18:29Z, whatever else is ready.** The live rise fires at that
   instant by itself: `effective_price()` switches to the higher price with
   nobody pressing anything, and every buyer after it is charged it. This
   step does not wait for Day 0. On the console's price
   editor (Billing), set each plan's next price date to
   `2026-12-31T18:29:00Z` (23:59 IST on 31 Dec 2026, the owner's decision of
   26 Oct; the same minute of day the 31 Oct date used), keeping the next price
   figures. That goes through `admin_set_next_price(plan, paise, at)`, which
   writes the audit log and refuses a "rise" that is not a rise. Read back:
   `select p->>'id', p->>'next_price_at', p->>'rising' from
   jsonb_array_elements(public.price_notice()->'plans') p;` (and the same
   with `price_notice('USD')`) — every plan's `next_price_at` reads the new
   instant and `rising` is true. `next_price_at` reads null once a rise has
   fired: null here means the rise already happened. If the
   console cannot reach it, a checksummed SQL `update public.plans set
   next_price_at = '2026-12-31 18:29:00+00' where id in
   ('starter','indie','pro') and next_price_paise is not null;` does the
   same without the audit row; note it in the audit by hand. Then delete or
   edit any post that named 31 Oct.
3. **Run the three new schema sections**, in order —
   `schema-58-funnel-source.sql` (per-source funnel),
   `schema-59-testimonials.sql` (consented testimonials), then
   `schema-60-signup-trial-scope.sql` (a pressed trial follows
   `trial_scope`) — each with a checksum, each read back with the query in
   its own header (58.6 for §58, 60.4 for §60). Code ships ahead of them and
   degrades silently until they run: the per-source table stays empty, and
   `trial_offer()` carries no `trial_scope`, so the pages say nothing about
   what the trial opens.
4. **Publish the Chrome extension** per `docs/EXTENSION.md`: build, zip the
   contents of `dist-extension/`, submit to the Chrome Web Store, then add the
   store build's fixed redirect URL (`https://<extension-id>.chromiumapp.org/`)
   to Supabase → Authentication → Redirect URLs. It is an Intermediate and Pro
   feature; say so in its store listing.
5. **Set `RESEND_API_KEY` and `MAIL_FROM` before any real payment**
   (`docs/BILLING.md` §13 and §16). Until then a payment claims a receipt
   and the send fails. The e-mail series also waits for this.
6. **Create the codes the copy names**: `STUDENT50` as a FIXED amount,
   `{"amount_off_paise": 40000, "plan_ids": ["indie"]}`, not 50%:
   `promo_price()` makes 50% of ₹799 a charge of ₹399.50 while the plan
   cards print ₹399 (`EDU_PRICE.student` in `src/lib/plans.js`). Read it back
   with `select public.quote_order('indie', 'STUDENT50');`: it must quote
   39900 paise. After the rise (Intermediate ₹1,499) the same code would
   charge ₹1,099 while the cards still print ₹399, so decide before the rise
   (31 Dec 2026 once step 2 is done):
   keep ₹399 (set the code to 110000 off at the rise, and re-quote) or move
   the student price (change `EDU_PRICE`, a code change, the same day).
   Then
   one affiliate code per signed creator (Commission % filled in), one
   festival code per partner with `valid_until` = their real deadline. Read
   each back in the Promo codes list.
7. **Turn on dollar checkout only when Razorpay International is approved**:
   `admin_set_usd_checkout(true)` from the console, then `price_notice('USD')`
   must show `charged_currency` `USD`. Until then international copy says
   "charged in rupees at checkout" and quotes `price_notice('USD')`'s rupee
   amount beside the dollar figure.

## 7. KPIs and how to read them

### 7.1 Where the numbers are

`admin.html` → Growth → Funnel: one row per step, summed (`admin_funnel`),
and, once §58 has run, a **by source** table (`admin_funnel_by_source`):
for each step, the count per BUCKET (§3), with no source shown as `direct`
and an unknown tag as `other`.
The ten steps are: `landing_view`, `pricing_view`, `invite_request`,
`signup`, `signin_done`, `sample_open`, `trial_start`, `plan_view_in_app`,
`checkout_start`, `purchase`. These are daily counters — how many, from
where — never who. Visitors with Do Not Track or Global Privacy Control
send nothing, so every count is a floor.

Purchases per plan and refunds come from Billing; affiliate revenue and
commission from Growth → Affiliates; referral credits from Growth →
Referrals. Ad spend is in Meta Ads Manager; match it to the `ads` bucket by
hand, weekly (per cell, use Ads Manager's own figures).

### 7.2 The weekly numbers (write them in one sheet)

| KPI | Read as | First-month bar [hypothesis] |
| --- | --- | --- |
| Visits | `landing_view`, total and per source | Trend, not a target |
| Interest | `pricing_view` ÷ `landing_view` | 25%+ |
| Trial rate | `trial_start` ÷ `landing_view` | 5%+ |
| Activation | `sample_open` or real work in the trial (ask 5 triallists) | Most trials open a tool |
| Trial → checkout | `checkout_start` ÷ `trial_start` (same week) | 15%+ |
| Checkout → paid | `purchase` ÷ `checkout_start` | 50%+; lower means a payment problem, check Razorpay |
| Paid cost per purchase | Meta spend ÷ `purchase` in the `ads` bucket | Under 40% of the plan price |
| Plan mix | Basic / Intermediate / Pro from Billing | Read, do not steer |
| Affiliate yield | purchases per creator code (Growth → Affiliates; the funnel's `partner` row is all creators together) | Keep creators with any sale after 30 days |

Every bar is a guess to be replaced by the first month's real numbers. With
small counts (fewer than ~30 at a step), read the raw numbers, not the
percentages.

### 7.3 Reading it honestly

- A source with visits and no `trial_start` is a message problem for that
  audience; a step that is low for **every** source is a page problem.
- `direct` grows with SEO and word of mouth; it cannot be split further
  without a pixel, by design.
- Do not use the founding-place count in copy as pressure. If it is close to
  full, say the plain fact once ("the founding price ends on {RISE_DATE} or
  when the founding places fill", the date read from `price_notice()` that
  day) and let the page show the live count.

### 7.4 The weekly review (30 minutes, same day each week)

1. Write the §7.2 row.
2. Read every message and comment from the week; list the top 3 questions.
3. Fix one: a FAQ answer, a guide, a caption, or a bug report.
4. Apply the Meta stop rules; log the change.
5. Pay any affiliate or referral credit that is due on its stated date.
6. Pick next week's posts from the calendar; swap any that the week proved
   wrong.

## 8. What not to do

- Do not run ads before the trial, the live key and receipts work.
- Do not buy followers, lists or reviews, or ask groups for upvotes.
- Do not post a customer's film, name or message without written consent.
- Do not advertise planned features (gift licences, bulk education
  licences, public view links).
- Do not quote a competitor's price without checking their page that day.
- Do not oversell Tamil typing: Type Tamil is an opt-in mode for dialogue
  and parentheticals only (headings, action and cues stay in Latin script),
  and it offers each word for the writer to accept. Say exactly that.
