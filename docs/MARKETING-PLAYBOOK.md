# Marketing playbook — the owner's plan for finding paying filmmakers

Written 26 Oct 2026. Status: a PLAN. Nothing in it has been posted, sent or
spent. It replaces the marketing half of `docs/RELEASE-PLAN.md` §5 where the
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
4. **The charged amount is never hidden.** If a post shows a dollar figure,
   it also says what is charged today (rupees, until `usd_checkout` is on).
5. **Plans are one year each.** Never "pay once", "lifetime", "own it
   forever". The true lines are: one payment for one year; nothing renews by
   itself; buy again to add a year; move up mid-year and the unused part is
   credited.
6. **The trial length is a server setting.** Write "a 3-day trial" only once
   `trial_offer()` answers `trial_minutes: 4320` (§6, step 1). Until then the
   copy says "a free trial".
7. **Purchases are final** except a duplicate charge, a plan never activated,
   and refunds Indian law requires. Never "money-back guarantee".
8. **No real person** in a sample, a screenshot or an ad without consent.
   The Dragon and The Dark Knight samples are reconstructions and say so.
9. **Name only what is built and on the plan you name.** Call sheets, Shoot
   Day, Edit Log, Deliverables and the AI tools are **Pro**. Breakdown,
   storyboard, shot list, stripboard, budget, cast and crew and sides are
   **Intermediate**. Writing, story, drafts and import are **Basic**. The
   pricing page's table is generated from `src/data/plan-matrix.json`; when in
   doubt, read it there.
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
| 5 | **International independents** (second wave) | Final Draft (.fdx) both ways, Fountain, Word, PDF; local-first storage; a yearly price far under the usual subscriptions | Basic or Intermediate. Dollar checkout is OFF until Razorpay International is approved (§6 step 7) |

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
- **"How long is the trial?"** was the most asked question. The 3-day,
  whole-studio trial answers it, so say the length wherever the trial is
  offered (once it is live).
- **Writers want confidentiality in plain words**, crew are not the buyer,
  and non-Tamil personas wanted their own script. Do not promise Malayalam or
  Telugu tooling that does not exist.

## 2. The offer

### 2.1 What a visitor gets

| Piece | Truth to say | Where it lives |
| --- | --- | --- |
| **3-day trial, whole studio** | Every module, on your own films and the samples, for 3 days, no card — true once the trial plan is Pro (§6.1). Starts only when they press start (or redeem a code) | `trial_offer()`; console Growth → Trial |
| **Yearly plans** | Basic, Intermediate, Pro, one payment each for one year, nothing renews by itself | `price_notice()`; `pricing.html` |
| **Founding prices** | Today's prices hold until **31 Dec 2026** (the server's `next_price_at`, once moved; §6 step 2) or until the founding places fill, whichever is first. A plan bought now is a full year at the price paid | `price_notice()` |
| **Student band** | Code `STUDENT50` gives the student price on Intermediate. Verify a student ID or college e-mail by hand for bulk requests | Promo code (§20); the button on the plan cards |
| **Referral codes** | Every paying member has a `REF-XXXXXX` code. The friend gets `referral_friend_pct` off (default 10%); the referrer is owed `referral_reward_pct` of what the friend paid (default 10%), paid by hand | `settings.html#plan`; console Growth |
| **Affiliate codes** | A promo code with a commission %, for creators. Revenue and commission due are derived per code; paid by hand | Console Billing → Promo codes ("Commission %"); Growth shows the report |
| **Upgrade mid-year** | The unused part of the year is credited against the higher plan | `apply_plan` (§52) |

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
| Student (Intermediate + `STUDENT50`) | ₹399 | ≈ ₹1.09 | follows Intermediate | — |

The USD column is the seed in `supabase-schema.sql` §56; the owner may have
changed it on the console. `price_notice('USD')` is the only figure to quote.

## 3. Tagged links: how every channel is counted

The studio carries no ad pixel and no third-party script (by design; see
`docs/LAUNCH.md` §8). Attribution is first-party: `src/lib/attribution.js`
reads `?src=` (or `utm_source`) and `?ref=` on arrival, keeps them for the
tab only (sessionStorage), and schema §58 counts every funnel step per
source. A `?ref=` code is carried to the purchase page's "Have a code?" box.

**The link shape**

```
https://filmmakerstudio.in/start?src=<channel>&utm_campaign=<name>
https://filmmakerstudio.in/start?src=<channel>&utm_campaign=<name>&ref=<CODE>   (affiliates, referrals)
```

Rules for `src` (the console only shows what fits):

- lowercase letters, digits, `-` and `_`, at most 32 characters; anything
  else is folded to `-` or cut. No spaces, no e-mail addresses.
- **The console breaks down by `src` only.** `utm_campaign` is kept for the
  tab and the launch-offers form but is not a column in the per-source
  funnel. When you need to compare two ads, put the cell in `src`
  (`meta-t1a`, `meta-t1b`), not only in `utm_campaign`.
- The **first** source in a tab wins; the **latest** code wins.
- A day holds at most 200 distinct sources; a new one after that counts as
  `other`. Keep the list below short and reuse it.
- Organic search and typed URLs arrive with no `src` and show as `direct`.
  Guide pages are measured by their own `landing_view`, not by a tag.

**The channel register** (add a row before you use a new tag)

| Channel | `src` | `utm_campaign` example | `ref` |
| --- | --- | --- | --- |
| Instagram bio | `ig-bio` | `profile` | — |
| Instagram post / reel / story link | `ig-post`, `ig-reel`, `ig-story` | `wk1-callsheet` | — |
| Meta ads (one per test cell) | `meta-t1a` … `meta-t1g` | `test1` | — |
| YouTube in-stream ads | `yt-ads` | `y1` | — |
| Meta retargeting | `meta-rt` | `rt1` | — |
| YouTube creator | `yt-<creator>` | `review-nov` | the creator's affiliate code |
| YouTube own channel | `yt-own` | `demo-import` | — |
| WhatsApp groups (shared message) | `wa-group` | `share-v1` | — |
| WhatsApp own broadcast | `wa-bcast` | `bcast-<n>` | — |
| Film school (one per school) | `school-<slug>` | `pilot-<term>` | a cohort promo code if issued |
| Festival / film society partner | `fest-<slug>` | `<fest>-2026` | the partner's code if agreed |
| Reddit answer | `reddit` | `<subreddit>` | — |
| Quora answer | `quora` | `<topic>` | — |
| Product Hunt | `producthunt` | `launch` | — |
| Directories (AlternativeTo, SaaSHub, …) | `dir-<name>` | `listing` | — |
| E-mail series (§ `email-series.md`) | `email-1` … `email-6` | `welcome` | — |
| Referral (a member shares) | `referral` | — | their `REF-` code |

Example, for a YouTube creator with the code `FILMKAADHAL20`:
`https://filmmakerstudio.in/start?src=yt-filmkaadhal&utm_campaign=review-nov&ref=FILMKAADHAL20`

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

No pixel, so optimise for **landing page views**, not purchases, and read
purchases per `src` in the console.

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

1. Do not judge a cell before ₹500 spent or 300 landing views.
2. Pause a cell whose cost per landing view is twice the best cell's.
3. Pause a cell with 0 `trial_start` after ₹700 spent.
4. Pause **everything** if the console shows `landing_view` but no
   `pricing_view` or `trial_start` from any `meta-*` source after ₹1,500:
   the page or the tag is broken, not the audience.
5. One change at a time. Never raise a budget and swap a creative the same
   day.

**Test 2 — the following week, ₹3,500 (₹500/day) on the one or two winners**.
Move up only if `trial_start` per ₹100 spent holds within 30% of Test 1.

**Scale** — +20% every 3 days while blended cost per purchase stays under
**40% of the plan price bought** (Intermediate at ₹799 → at most about ₹320).
Above that, stop and rework; do not scale a loss.

**Retargeting** (`meta-rt`) — people who engaged with the Instagram account
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
  `src=wa-group`.

### 4.5 Film schools

Follow `docs/OUTREACH-FILM-SCHOOLS.md` (three e-mails, Harvey, the DPDP Act
rules). Update its "7-day trial" line to the live trial length once §6 step 1
is done, or offer invite codes (which carry their own `code_trial_days`).

- **Weekly**: 10 schools contacted (Harvey caps at 20 a day with approval on).
- **Offer**: a faculty Pro grant to evaluate; `STUDENT50` for students; a
  20-minute online workshop "from a short-film script to a call sheet".
- **Tag**: `src=school-<slug>` on every link sent to that school.
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
- **Tag**: `src=fest-<slug>`.
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
- **Weekly**: 3 answers. Tag product links `src=reddit` / `src=quora`; leave
  guide links untagged (they measure themselves).

### 4.8 SEO: the guide pages

Lane B's build adds seven guides, two comparisons, a guides index and a trust
page, generated like the rest of the public site. Linked here relative to
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
| [`compare-celtx.html`](../compare-celtx.html) | "Celtx alternative" searches |
| [`compare-final-draft.html`](../compare-final-draft.html) | ".fdx", "Final Draft alternative" |
| [`trust.html`](../trust.html) | The answer to "will my script be safe / what if you shut down" |

- After they ship: resubmit `public/sitemap.xml` in Search Console (verify by
  DNS TXT; never touch `index.html`'s verification tag).
- **Monthly**: read Search Console's queries; write one new guide only where
  a real query has impressions and no page.
- Comparison pages must stay fair: re-check every competitor fact before
  quoting it anywhere else, and mark it with the date checked.

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
  Indian startup directories. Tag `src=dir-<name>`.

## 5. Launch week, day by day

**Day 0 is the day the owner sets the 3-day, whole-studio trial live**
(§6 step 1). Do not start Day 0 until every item in the pre-flight list is
true.

**Pre-flight (all must be true)**

- [ ] `trial_offer()` reads `trial_minutes: 4320`; scope `full` and trial plan `pro` are set (§6.1)
- [ ] `price_notice()` reads a rise at `2026-12-31T18:29:00Z` (§6.2)
- [ ] §58 and §59 ran with a checksum and read back (§6.3); the console's
      funnel shows a "by source" table
- [ ] A LIVE Razorpay key is on, `RESEND_API_KEY` and `MAIL_FROM` are set,
      and one real ₹ payment and its receipt e-mail arrived (§6.5)
- [ ] The four functions owed a redeploy since §52 are redeployed (probe each
      endpoint; `docs/LIVE-STEPS-2026-10-21.md`)
- [ ] Every tagged link in §3 you will use on Day 0–7 opened once in a
      private window
- [ ] `STUDENT50` and the referral percentages are as the copy says
- [ ] `poster-1.png` no longer says "Invite-only at launch" (regenerate;
      see `social/CAPTIONS.md` notes)

| Day | Actions |
| --- | --- |
| **Day 0** (trial goes live) | Morning: §6.1, read back. Open `/start` and `/pricing` in a private window: the trial strip shows 3 days; the founding line shows 31 Dec. Start one trial yourself on a fresh Google account and walk the whole studio. Afternoon: post feed post 1 (announcement, `content-calendar.md` W1 Mon). Stories: "the trial is open, 3 days, whole studio". Send e-mail 1 to the consented leads list (only once Resend is live). |
| **Day 1** | Reel: script import to stripboard (real recording). Share in your own WhatsApp broadcast (`wa-bcast`). Message 5 YouTube creators. Answer every comment and DM. Read the console: `landing_view`, `trial_start` by source. |
| **Day 2** | Post: "What the trial opens" carousel. 3 Reddit/Quora answers with guide links. Send film-school e-mail 1 to 10 schools (Harvey, approval on). |
| **Day 3** | First trials from Day 0 end today. Read `trial_start` → `checkout_start` → `purchase`. Reply personally to anyone who wrote in. Story: a question box "what stopped you?" |
| **Day 4** | Reel: call sheet to WhatsApp (Pro). Directory listings (§4.9). Follow up the Day 1 creators once. |
| **Day 5** | Post: the trust post ("where your script lives", linking `trust.html`). Second WhatsApp share in groups where you have already contributed. |
| **Day 6** | Reel: budget in rupees with sources. Write down the week's numbers (§7.2) and the three most-asked questions. |
| **Day 7** | Weekly review (§7.4). Decide: start Meta Test 1 next week only if `landing_view` → `trial_start` is working from organic sources (any trials at all from `ig-*` or `wa-*`). Fix the top question on the page or the FAQ before spending. |

## 6. Console steps only the owner can make

Each one is read back by **asking the server**, not by reading the screen.
SQL pasted into the editor follows the paste rule: base64 across the
clipboard, decode in the page, compare the SHA-256 before pressing Run
(`docs/LAUNCH.md` §4).

1. **Trial: 3 days, whole studio.** `admin.html` → Growth → Trial: length
   4320 minutes, scope "full", **and trial plan "Pro"**. (The setting is
   `admin_set_billing_settings` with `{"trial_minutes": 4320, "trial_scope":
   "full", "trial_plan": "pro"}`; it accepts 1 to 44,640 minutes.) The plan
   matters: a "full" trial opens the features of `trial_plan`, and when that
   is empty `billing_status()` falls back to **Intermediate** (`indie`), which
   leaves out call sheets, Shoot Day, Edit Log, Deliverables and the AI tools.
   Copy says "whole studio" only once the trial plan is Pro; otherwise it says
   "the Intermediate plan". Read back: `select public.trial_offer();` as anon must
   show `trial_minutes` 4320 and `trial_hours` 72, and a fresh trial
   account's `billing_status().features` must include `"call-sheets": true`. The pages read this value;
   no copy is edited to change it. Invite codes keep their own
   `code_trial_days` — decide whether a code should still be worth 7 days.
2. **Move the founding-price date to 31 Dec 2026.** On the console's price
   editor (Billing), set each plan's next price date to
   `2026-12-31T18:29:00Z` (23:59 IST on 31 Dec, the same minute of day the 31 Oct date used), keeping the next price
   figures. That goes through `admin_set_next_price(plan, paise, at)`, which
   writes the audit log and refuses a "rise" that is not a rise. Read back:
   `select public.price_notice();` and `select public.price_notice('USD');`
   — every plan's `next_at` reads the new instant, `rising` is true. If the
   console cannot reach it, a checksummed SQL `update public.plans set
   next_price_at = '2026-12-31 18:29:00+00' where id in
   ('starter','indie','pro') and next_price_paise is not null;` does the
   same without the audit row; note it in the audit by hand. Then delete or
   edit any post that named 1 Nov.
3. **Run the two new schema sections** — `schema-58-funnel-source.sql` (per-
   source funnel) then `schema-59-testimonials.sql` (consented testimonials)
   — each with a checksum, each read back with the query in its own header
   (58.6 for §58). Code ships ahead of them and degrades silently until they
   run; the per-source table simply stays empty.
4. **Publish the Chrome extension** per `docs/EXTENSION.md`: build, zip the
   contents of `dist-extension/`, submit to the Chrome Web Store, then add the
   store build's fixed redirect URL (`https://<extension-id>.chromiumapp.org/`)
   to Supabase → Authentication → Redirect URLs. It is an Intermediate and Pro
   feature; say so in its store listing.
5. **Set `RESEND_API_KEY` and `MAIL_FROM` before any real payment**
   (`docs/BILLING.md` §13 and §16). Until then a payment claims a receipt
   and the send fails. The e-mail series also waits for this.
6. **Create the codes the copy names**: `STUDENT50` (50% on Intermediate),
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
for each step, the count per `src`, with no source shown as `direct`.
The ten steps are: `landing_view`, `pricing_view`, `invite_request`,
`signup`, `signin_done`, `sample_open`, `trial_start`, `plan_view_in_app`,
`checkout_start`, `purchase`. These are daily counters — how many, from
where — never who. Visitors with Do Not Track or Global Privacy Control
send nothing, so every count is a floor.

Purchases per plan and refunds come from Billing; affiliate revenue and
commission from Growth → Affiliates; referral credits from Growth →
Referrals. Ad spend is in Meta Ads Manager; match it to `meta-*` sources by
hand, weekly.

### 7.2 The weekly numbers (write them in one sheet)

| KPI | Read as | First-month bar [hypothesis] |
| --- | --- | --- |
| Visits | `landing_view`, total and per source | Trend, not a target |
| Interest | `pricing_view` ÷ `landing_view` | 25%+ |
| Trial rate | `trial_start` ÷ `landing_view` | 5%+ |
| Activation | `sample_open` or real work in the trial (ask 5 triallists) | Most trials open a tool |
| Trial → checkout | `checkout_start` ÷ `trial_start` (same week) | 15%+ |
| Checkout → paid | `purchase` ÷ `checkout_start` | 50%+; lower means a payment problem, check Razorpay |
| Paid cost per purchase | Meta spend ÷ `purchase` from `meta-*` | Under 40% of the plan price |
| Plan mix | Basic / Intermediate / Pro from Billing | Read, do not steer |
| Affiliate yield | purchases per creator code | Keep creators with any sale after 30 days |

Every bar is a guess to be replaced by the first month's real numbers. With
small counts (fewer than ~30 at a step), read the raw numbers, not the
percentages.

### 7.3 Reading it honestly

- A source with visits and no `trial_start` is a message problem for that
  audience; a step that is low for **every** source is a page problem.
- `direct` grows with SEO and word of mouth; it cannot be split further
  without a pixel, by design.
- Do not use the founding-place count in copy as pressure. If it is close to
  full, say the plain fact once ("the founding price ends on 31 Dec or when
  the founding places fill") and let the page show the live count.

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
