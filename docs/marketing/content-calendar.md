# Content calendar — eight weeks

Written 26 Oct 2026. NOT POSTED. Week 1 begins on Day 0 of the playbook
(`docs/MARKETING-PLAYBOOK.md` §5: the day the launch pass is live). Any line
about the pass says `{PASS_PRICE}`, `{PASS_LENGTH}`, `{PASS_ENDS}` and (with a
cap) `{PASS_LEFT}`, and any line about the
founding price says `{RISE_DATE}`, each read from `trial_offer()->'pass'` /
`price_notice()` on the console the day you post (playbook §0 rules 3 and
6), never typed from this file. If Day 0 is not a Monday, start at the Day 0 row and keep the order.

Three feed posts or reels a week (Mon / Wed / Fri), stories most days, one
long-form item a week (a YouTube demo or a guide shared to groups). Every
reel is a real screen recording of the shipped build. Captions come from
`social/CAPTIONS.md`; ad versions from `ad-copy.md`.

Mix target: demo 40%, craft 25%, behind the build 15%, answers to real
questions 15%, the offer 5%. The offer appears at most once a week.

Plan tags in brackets say which plan the shown tool needs; say it in the
caption when it is not Basic.

Every guide you share carries the channel's `src`
(`/guide-script-breakdown?src=ig-story&utm_campaign=wk3`): guide pages send
its own `landing_view` under that bucket the moment it is opened, once per
tab (`marketing.js`; playbook §3), and the bucket rides along to `/start`. Instagram tags (`ig-*`) all count as `instagram`.

| Week | Mon | Wed | Fri | Stories / long-form | Other channels that week |
| --- | --- | --- | --- | --- | --- |
| **1 — the launch offer opens** | `poster-1` announcement + "Launch offer: {PASS_PRICE} for {PASS_LENGTH} of the whole studio, ends {PASS_ENDS}" | Reel: import a script → scenes appear [Basic import; breakdown Intermediate] | `poster-2` what it is | Story: "what is the first thing you would plan?" poll · YouTube: 3-min tour of the Dragon sample | Launch-week checklist (playbook §5); 5 creators; 10 schools |
| **2 — writing** | Reel: Tamil dialogue, English slugs, page count [Basic] | Craft carousel: "Five lines every call sheet needs" (no product) | Reel: drafts — compare two drafts, restore one [Basic] | Story: Q&A box "ask about screenplay format" · Share `guide-tamil-screenplay-format` | Meta Test 1 starts if the Day 7 review said go |
| **3 — breakdown** | Reel: auto-tag suggestions on a scene, accept and correct [Intermediate] | Craft: "How to break down a scene" using the Dragon sample | `feature-07` elements list [Intermediate] | YouTube: breakdown walkthrough, 5 min · Share `guide-script-breakdown` | Directory listings; 3 Reddit/Quora answers |
| **4 — schedule** | Reel: stripboard drag into days, Day Out of Days updates [Intermediate] | Behind the build: why Shoot Day has a "part" mark — "we got some of it" is the commonest outcome of a day | `feature-11` stripboard poster | Story: "how many days was your last short?" poll | Meta Test 2 (winners only); Product Hunt prep |
| **5 — money** | Reel: budget from the Chennai rate card (indicative bands; the re-checked figures show their source) [Intermediate] | Craft: "Budgeting a short film in rupees" carousel → `guide-short-film-budget` | The offer, once: plans as a year, from {FROM_DAY} a day, {PLAN_TERMS}, founding prices to {RISE_DATE} | Story: answer the week's top budget question | Product Hunt launch (Tue–Thu) if the trial has run 4 weeks cleanly |
| **6 — the shoot** | Reel: call sheet sent as a WhatsApp message, per-person call time [Pro] | Reel: Shoot Day — mark scenes shot / part / dropped [Pro] | Craft: "What to do at wrap: the daily report" | YouTube: from stripboard to call sheet, 4 min [Pro] | Festival partner outreach (4) |
| **7 — trust** | Post: "Where your script lives" → `trust.html` | Reel: export to PDF, Word, Final Draft, Fountain [every plan] | Reel: offline on set — network off, keep working | Story: "what would make you trust a new tool?" box; answer the replies publicly | Referral reminder to buyers (own broadcast, opt-in) |
| **8 — delivery and review** | Reel: deliverables checklist with festival deadlines [Pro] | Craft: CBFC checklist for a short, "confirm with your regional office" → `guide-cbfc-checklist` | Behind the build: what changed in eight weeks from what people asked (only real changes) | Story: the founding-date fact, stated once if still true | Eight-week review: keep the two channels with purchases, drop the rest |

## Rules

- Before each post, check the shown tool is on the plan the caption names
  (`pricing.html` table) and the pass line matches `trial_offer()->'pass'` (and is dropped once it reads `open` false).
- No customer film, name, face or message without written consent. The
  first consented testimonial, once approved in the console (schema §59),
  can replace week 7's Friday slot.
- The founding date appears in week 5 (the offer) and, if still true, once in
  week 8. Never as a countdown sticker.
- If a week's numbers (playbook §7.2) show a post type failing twice, swap it
  for the demo or craft post that did best, rather than posting more offers.
- Hashtags: 5–10 local and specific ones per post (see `social/CAPTIONS.md`).
