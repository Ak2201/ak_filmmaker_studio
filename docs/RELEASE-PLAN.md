# Release plan — taking {{brand}} from "wired in test mode" to paying customers

Written 9 Oct 2026 on branch `sell/doc`. This is a plan, not a status report.
Where it says something is live or not live it copies `docs/HANDOFF.md` §4,
which is the authority; if the two disagree, HANDOFF §4 and the database win.

Conventions used throughout:

- **{{brand}}** is `src/data/brand.json` `name` (currently FilmMakerStudio).
  It may change; do not bake the name into ad creatives you cannot re-cut.
- **[H]** marks a number that is a **hypothesis**, not a measurement. Every
  target, conversion rate and budget in this file is [H] unless it cites a
  source. Validate it in the first two weeks, then replace it with an actual.
- **[re-check]** marks a competitor fact that came from aggregator sites
  (`docs/FEATURE-IDEAS.md` "Market context" says they disagree). Do not put
  one in an ad until you have read the vendor's own page that day.
- Status words: **LIVE** (verified live per HANDOFF §4), **BUILT** (in code,
  needs an owner step before it works for customers), **PLANNED**.

---

## 1. Goal and positioning

### 1.1 Goal

Get the first 100 paying customers [H] at list prices (Basic ₹599,
Intermediate ₹799, Pro ₹999), with a refund rate under the "duplicate charge /
not delivered" exceptions only, and enough testimonials and funnel data to
decide whether to open the invite gate. Revenue is secondary to proving
three things in 30 days:

1. A stranger can land, understand the product, request/receive access, and
   pay without help.
2. People who pay actually use it past day 3 (writes, imports, plans).
3. At least one paid channel and one free channel produce customers at a
   cost the owner is willing to repeat.

### 1.2 Who it is for (ICP)

| Segment | Why they buy | Likely tier | Where they are |
|---|---|---|---|
| Tamil / Indian indie and short filmmakers (first or second film) | Cannot afford dollar subscriptions; shoot on WhatsApp and Excel today | Basic or Intermediate | Instagram, YouTube, film WhatsApp groups |
| Film students (FEFSI, MGR Film Institute, private film schools, mass-comm) | Learning plus a real tool for diploma/short films | Free (sample) then Basic | College groups, faculty, festivals |
| Small production houses / line producers | Budget vs actuals, DPR, call sheets by WhatsApp, GST-ready invoices | Pro | Referrals, word of mouth |
| Screenwriters, assistant directors | Tamil typing, script import, breakdown | Basic / Intermediate | Writers' groups, Twitter/X, Instagram |

Not the target at launch: Hollywood-format studios, anyone who needs real-time
multi-user co-writing at scale, anyone who needs a subscription-style
enterprise contract.

### 1.3 The promise

"From the idea to the screening, in one place that works the way an Indian
set works: Tamil on the page, call sheets on WhatsApp, rupees in the budget.
Pay once; it is yours."

### 1.4 Three positioning lines (from FEATURE-IDEAS, kept in sync)

1. **Pay once, own it forever.** No dollar subscriptions bleeding your budget.
2. **Built for Kollywood and Indian sets.** Tamil scripts, FEFSI bata, Chennai
   rate cards, call sheets on WhatsApp — story to CBFC to OTT.
3. **Your script stays on your machine.** Local-first, your own AI key, backed
   up to your own Google Drive.

Rules for using them: line 1 must stay consistent with the refund policy
(final sale, see §4.5); line 3 must not be stretched into "we never store
anything" — sign-in and optional cloud sync exist.

### 1.5 Differentiators against the usual tools

Prices below are intentionally omitted. If you quote one, mark it
**[re-check]** and read the vendor page first.

| Tool | What it is strong at | Where {{brand}} is different | Be careful |
|---|---|---|---|
| StudioBinder | Cloud all-in-one, call-sheet read receipts | Pay once in rupees; WhatsApp-native call sheets; local-first | Do not claim read receipts parity |
| Celtx | Script → breakdown → budget | One-time price; Tamil typing; Indian rate cards, CBFC/OTT prep | Celtx has a free tier; do not say "they are paid-only" |
| Final Draft | The `.fdx` standard | Imports `.fdx`; one-time and cheaper; planning tools beyond writing | Final Draft is also one-time; do not say "only we are one-time" against it |
| Scrite (India) | Native Indian-language typing | Budget, DPR, petty cash, call sheets, deliverables on top of typing | They lead on typing; say "typing plus the rest of the set", not "better typing" |
| WRAPPLAB (India) | Typing, script → schedule | Same as above | Verify current pricing and features before comparing |

FEATURE-IDEAS's market note: the closest Indian rivals are strong on Tamil
typing and weak on budgets and on-set tools, and nobody in the scanned list
sells once in rupees. That is a **scan finding, not a guarantee** — repeat the
scan before launch week.

---

## 2. Release gates

A gate is closed only when its acceptance check passes. "Done in code" rows
were verified by tests when merged; they still need a smoke check on the
production deploy.

### 2.1 OWNER-ONLY (the container cannot do these)

| # | Step | Acceptance check | Steps are in | State |
|---|---|---|---|---|
| O1 | **Razorpay LIVE**: complete KYC for an individual seller, generate live key id + secret | Razorpay dashboard shows live mode enabled | `docs/BILLING.md` §1, `docs/LAUNCH.md` §6 | Not done; test mode works (HANDOFF §4) |
| O2 | Put the live key id in `VITE_RAZORPAY_KEY_ID`; set live key secret and webhook secret as Supabase function secrets only (never git) | `rzp-webhook` answers **401 "bad signature"** to an unsigned POST (the 503 to 401 transition is the proof) | `docs/BILLING.md` §1; HANDOFF §4 | Test-mode equivalents done; live not |
| O3 | Register the **live** webhook URL in Razorpay and set the matching secret (two halves of one step) | `supabase secrets list` shows the digest; probe returns 401 | HANDOFF §4 | Not done for live |
| O4 | Run schema **§20 to §29 in order**, in the same session as redeploying edge functions. HANDOFF §4 says **§20–§24 are already live**; §25 onward and §26 are **not run live**; §27 (refunds), §28 (Bill of Supply invoices) and §29 (leads, funnel) are built and need running. Read the live database first (`select` from the tables / functions) and run only what is missing, in order, asking before each SQL | Each section's read-back check in its `-- RUN` header passes; `npm run test:schema` green on PostgreSQL 16 before running live | `docs/BROWSER-HANDOFF.md` §1, `docs/LAUNCH.md` §4, `docs/BILLING.md` | §20–§24 live; §25–§29 pending (confirm §25 state) |
| O5 | **Deploy the edge functions**: `rzp-order`, `rzp-verify`, `rzp-webhook --no-verify-jwt`, and the new **`rzp-refund`** | All four ACTIVE; `rzp-order` returns 401 without a JWT; `rzp-refund` returns 401/403 without an admin JWT | `docs/BILLING.md` §1 | Three deployed in test mode; `rzp-refund` built, not deployed |
| O6 | **Seed `plans.features`** for each tier from `matrixFeatures(planId)` (`src/lib/plans.js`) so tiers really differ | In the console Features matrix, Free is sample-only; Basic has no Drive/AI if the matrix says so; matches `src/data/plan-matrix.json` | `docs/BILLING.md` §0; HANDOFF §6c R4 | Not seeded (matrix gates nothing until seeded) |
| O7 | **Confirm prices in the admin console equal the landing page** (`free 0 / starter 59900 / indie 79900 / pro 99900` paise; landing stamps from `vite.config.js` `startFigures`) | Open `/start#pricing` and `admin.html` side by side; identical | HANDOFF §4, §6c P3 | Prices real; confirm at launch |
| O8 | Run the **two-account RLS checks** (second real Google account) before taking money | Every row in `docs/SECURITY-RLS.md` ticked with a date; account B cannot read account A's film | `docs/SECURITY-RLS.md`, `docs/LAUNCH.md` §5 | Read side proven; two-account checks never run |
| O9 | **GSTIN line** on Terms: supply the number or delete the sentence | `/terms` has no `[OWNER: GSTIN…]` marker | `docs/LAUNCH.md` §3, HANDOFF P8 | Open |
| O10 | **Support inbox**: replace `supportEmail` in `src/data/brand.json` (still a personal Gmail) with a dedicated inbox; rebuild | Footer, legal pages, extension show the new address; `npm run test:brand` passes | HANDOFF §6c R "Owner steps left" | Open |
| O11 | Optional: set `VITE_SUPPORT_WHATSAPP` (digits only) | Footer shows a WhatsApp help link that opens a chat | HANDOFF P11 | Open |
| O12 | **Google Branding re-request** on 9 Oct 2026 or later | Branding status clears in the console | `docs/LAUNCH.md` §2, HANDOFF P6 | Open |
| O13 | Submit `sitemap.xml` in Search Console | Property verified; sitemap shows "Success" | `docs/LAUNCH.md` §7 | Open |
| O14 | Paste landing URL into WhatsApp and Instagram DM; run Meta's sharing debugger | Link card with image and hook appears | `docs/LAUNCH.md` §7 | Open |
| O15 | Decide **invite-only or open** (`VITE_SITE_GATE`) and write the decision in `docs/LAUNCH.md` §1 | Decision recorded; deploy matches it | `docs/LAUNCH.md` §1, `docs/GATE.md` | Open (see §3 for the recommended staging) |
| O16 | Second admin address (`VITE_ADMIN_EMAILS`) signs in once | Console shows both admins | HANDOFF P5 | Open |
| O17 | Test a **refund end to end in test mode** (customer request, admin approval, Razorpay refund, plan lapse) | Refund row `processed`; account plan reverts per §27 | `docs/BILLING.md` | Never run |
| O18 | After all of the above: **one real live purchase by the owner** of the cheapest tier, then refund it as a duplicate-charge drill | `payments` row `paid` with live ids; invoice issued; refund works | `docs/BILLING.md` | Do last |

### 2.2 DONE IN CODE (verify with a smoke check, not a rebuild)

| Item | Where | Smoke check |
|---|---|---|
| One brand variable and no owner traces | `src/data/brand.json`, `npm run test:brand` | Footer name and OG card match brand.json |
| Tier labels Free/Basic/Intermediate/Pro on unchanged ids | `src/lib/plans.js`; schema §26 (not run live) | Pricing table and console agree on names |
| Plan matrix drives landing pricing | `src/data/plan-matrix.json` | Landing table matches the matrix |
| Landing page, FAQ, pricing, screenshots | `start.html` (public, outside the gate) | `/start` loads signed out; sections `#features #pricing #faq` resolve |
| Dashboard "Today's desk", UX audit fixes | HANDOFF §6c R6, R7 | Open dashboard in a fresh project |
| Razorpay end to end in test mode | HANDOFF §4 | Test purchase produced a `paid` row and activated `starter` |
| Upgrade by difference, referral, affiliate codes | schema §21–§23 (live), `src/lib/growth.js` | Console Growth section lists them |
| Legal pages with owner's legal name | `privacy.html`, `terms.html`, `refund.html` | Read each at 390px in both themes |
| **Built, needs owner step** — admin refund button + customer refund requests | schema §27, `rzp-refund` | Needs O4 and O5, then O17 |
| **Built, needs owner step** — GST Bill of Supply invoices | schema §28 | Needs O4; after a test purchase an invoice number `FMS/2026-27/…` exists and the PDF opens |
| **Built, needs owner step** — leads capture and first-party funnel counts | schema §29 | Needs O4; submit a lead on `/start`, see a count move in the console |
| **Built, needs owner step** — production gaps G1–G6 | `feature/sell-ready` | Merged and deployed; see HANDOFF §6c G |
| Release gate script | `npm run ship` | Green; note T8: it does not yet run every `test:*` suite, so also run the ones in `docs/BRANCHING.md` |

> Everything in the "Built, needs owner step" rows above is **not live** until
> the owner steps run: run §27–§29 live, deploy `rzp-refund`.

### 2.3 Go / no-go rule

Do not announce publicly until **O1–O9, O17, O18** are closed. O10 and O12–O14
can finish during the private beta. If O8 (two-account RLS) fails, stop: a buyer
seeing another buyer's film is the unrecoverable failure.

---

## 3. Launch timeline (T-14 to T+30)

T0 is the first day the public landing page is announced. Weeks are
suggestions; shorten if gates close early, never skip a gate to hit a date.

### Week T-14 to T-8 — close the gates

| Day | Do | Owner / who |
|---|---|---|
| T-14 | Merge `feature/sell-ready` into `develop`, run the full release gate (`docs/BRANCHING.md`), promote to `main` only through it | Owner + a cloud session |
| T-14 | Start Razorpay live KYC (it can take days); decide the dedicated support inbox | Owner |
| T-13 | Run §25–§29 live in one session with edge function deploys (O4, O5); read back every object | Owner + browser session |
| T-12 | Seed `plans.features` (O6); confirm prices (O7) | Owner |
| T-11 | Two-account RLS checks (O8) with a trusted friend as account B | Owner + friend |
| T-10 | GSTIN decision (O9); set support inbox and WhatsApp (O10, O11); rebuild | Owner |
| T-9 | Test-mode refund drill (O17); invoice drill | Owner |
| T-8 | Re-request Google branding (O12, on or after 9 Oct) | Owner |

### Week T-7 to T-1 — private beta (invite-only gate stays ON)

Goal: 20–50 invited filmmakers [H], mixed across the ICP segments.

- Recruit from people you already know: ex-collaborators, college seniors,
  two or three film-school faculty, a few film YouTubers, two small
  production houses.
- Give every beta user an **invite link** (`invite.html#code=…`, copied from
  the console) and a **beta promo code** (§20) so they can test paying at a
  steep discount, or grant the plan directly in the console if you prefer to
  test activation without money.
- Ask each person to do three things in their first session: open the
  Dragon sample, import or paste a scene, make a call sheet and send it on
  WhatsApp.
- Collect feedback in one place (a shared sheet or a WhatsApp group, not
  DMs). Columns: name, role, what they tried, what broke, would they pay,
  quote allowed (yes/no).
- **Testimonials**: ask for one to two sentences and a first name + role
  (and a film title if public). Get **written permission** (a WhatsApp
  message counts if screenshotted) before using any quote or film. Only
  add them to the landing's Voices section once consented; the section is
  hidden until it has real content, and must never contain invented ones.
- Daily: check the funnel counts (§6) and the console for errors; fix
  blockers before T0.
- Beta exit criteria [H]: at least 70% of testers reach the call sheet,
  zero data-loss reports, zero payment failures not explained by a test
  card, three usable testimonials.

### Week T0 to T+7 — soft launch

- Decide O15. Recommended: **keep the invite gate on** for week 1 and use
  the landing's "Request an invite" as a demand signal; approve requests
  within 24 hours. This limits support load while you learn. Open the gate
  (`VITE_SITE_GATE=off`, rebuild) only after a week with no blocking bugs
  and a refund rate you understand.
- Switch Razorpay to live (O1–O3, O18). Do the owner's own live purchase
  first.
- Announce to your own network: Instagram story + post, WhatsApp groups you
  belong to, personal DMs to the beta group asking them to share.
- Start the ₹300/day Meta test (§5.2) on day 3 once the pixel-free
  tracking (§5.2.5) is confirmed working.
- Daily: answer every support message within 24 hours; log each as a bug,
  question, or request.

### Week T+8 to T+14 — public launch

- If the soft week was clean: open the gate, or keep it on if the invite
  request volume is manageable and you value the curation (the invite
  gate is itself a marketing line; decide deliberately, not by default).
- Publish the launch offers (§4.2). Run the launch Instagram sequence
  (§5.1) and email sequence (§5.7).
- Film-YouTuber affiliate outreach goes live (§5.4).
- Press and community posts: write one honest "why I built this" post for
  Instagram and one for relevant forums or groups.

### Week T+15 to T+21 — iterate on evidence

- Hold the first weekly review (§6.3) with at least two weeks of funnel data.
- Fix the top two friction points the funnel shows (for example pricing view
  with no checkout start means the table is unclear; checkout start with
  no purchase means a payment problem or a price objection).
- Scale or kill ad sets using the rules in §5.2.4.
- Publish the first customer story with permission.

### Week T+22 to T+30 — consolidate and plan next

- First-month retrospective: customers, revenue, refunds, support load,
  best channel, worst assumption.
- Decide the first post-launch roadmap items from §9 using real requests.
- Prepare the festival-season or film-school offer (§4.3) for the next
  calendar hook.
- Update `docs/HANDOFF.md` §4 with what is actually live; strike this
  plan's [H] marks where you now have a measurement.

---

## 4. Pricing and offers

### 4.1 Tier matrix (summary; the source is `src/data/plan-matrix.json`)

List prices below are live per HANDOFF §4 and are **editable in the admin
console**. The landing page stamps them at build time, so a price change is
a rebuild, not just a console edit; keep both equal (O7).

| | Free | Basic | Intermediate | Pro |
|---|---|---|---|---|
| Price (pay once) | ₹0 | ₹599 | ₹799 | ₹999 |
| DB id | `free` | `starter` | `indie` | `pro` |
| Sample project only | yes | no | no | no |
| New projects | no | yes | yes | yes |
| Script import, exports | no | yes | yes | yes |
| Google Drive backup | no | check matrix | yes | yes |
| AI tools | no | check matrix | check matrix | check matrix |
| Cloud projects | 1 | 3 | 10 | unlimited |
| Collaborators per film | 0 | 2 | 5 | unlimited |
| Live share links | 0 | 3 | 10 | unlimited |
| Organisation seats | 1 | 1 | 3 | 10 |
| Chrome extension | no | yes | yes | yes |

Limits come from `docs/BILLING.md` §0; feature rows come from the plan
matrix. Cells marked "check matrix" must be read from the file when you
write ad copy, because the matrix is a plan until O6 seeds it. Do not
advertise a tier difference that `plans.features` does not yet enforce.

### 4.2 Launch offers using the existing mechanisms

All of these are **BUILT and live in schema §20–§23** (HANDOFF §4); they are
priced server-side, so a code can never be faked in the browser.

| Offer | Mechanism | Suggested use | Rule |
|---|---|---|---|
| Beta thank-you code | Promo code (§20), percentage or fixed, limited uses | Private beta: 50% off, single use per person | Expires at T0; say so truthfully |
| Launch-week code | Promo code (§20) with a real end date | First 7 days after public launch, 15–20% [H] | The end date is real; the code is actually disabled after it |
| Upgrade by difference | §21 | "Bought Basic and want more? Pay only the difference" | Always available; mention in FAQ and welcome email |
| Referral codes | §22 | Each buyer gets a personal code; both sides benefit | Define the reward in writing before launch; check the console shows each redemption |
| Affiliate codes | §23 | Film YouTubers: tracked code, commission per sale | Agree commission and payout date in writing; disclose the relationship in their video |
| Student code | Promo code (§20) | 20–30% [H] with a student-ID or college e-mail check done manually | Manual verification; keep a list |

### 4.3 Seasonal and film-school offers

- **Festival season**: tie to real hooks (a submission deadline weeks, a
  local short-film festival, FEFSI/film-school diploma-film season). Use a
  code that ends on the real date. The product already has a festival
  tracker; the offer copy can point at it.
- **Film schools**: offer faculty a free Pro account to evaluate and a
  student code for the class. A bulk edu licence (B3) is **PLANNED, not
  built**; until then use a code per cohort and manage seats by hand.
- **Gift licences (B2)** are **PLANNED**; do not advertise them.

### 4.4 Price changes

- Raise prices later, not lower; early buyers pay-once at today's price is
  itself a story ("founding price") — but only say "founding" if you really
  do raise it.
- A price change = console edit + rebuild landing (stamped at build) + check
  `docs/BILLING.md` §0 matches.

### 4.5 Rules

1. **Never invent scarcity.** No fake countdowns, no "only 10 left" unless a
   code truly has 10 uses, no "price goes up tomorrow" unless it does.
2. **Final-sale messaging must match `refund.html`.** Purchases are final
   except: duplicate charge, charged but plan not delivered, and where
   Indian law requires. Do not write "30-day money-back" anywhere, in ads,
   emails or the Shopify page.
3. **Say what the tiers really include**, read from the matrix; if a feature
   is "built, not seeded", it is not in the offer.
4. **Do not promise features that are PLANNED** (gift, edu, public view
   links, emotional-craft layer) in ads.
5. **No real people in samples or ads** without consent; the Dragon sample is
   a reconstruction and says so.
6. Disclose affiliates and paid partnerships per platform rules.

---

## 5. Channels and marketing plan

Owner channels named so far: **Shopify, Instagram, Meta ads**. Everything
else is optional. Start with the free channels; they teach you the message
cheaply before you pay to amplify it.

### 5.1 Instagram

**Content pillars**

| Pillar | Share of posts [H] | Purpose |
|---|---|---|
| Demo (a real feature doing a real job in 20–40 s) | 40% | Show, do not claim |
| Craft (how a scene breaks down, a budget tip, call-sheet etiquette) | 25% | Be useful to the ICP without selling |
| Founder / behind the build | 15% | Trust; the seller is an individual, lean into it |
| Proof (beta quotes with permission, customer films) | 15% | Social proof; only real ones |
| Offer / CTA | 5% | The link in bio goes to `/start#pricing` |

**Caption style**: short first line that names the pain in plain words
(Tanglish is fine if it is how you speak), two to four lines of detail, one
clear call to action, link in bio. No hype words you cannot back. Tamil and
English are both acceptable; test which gets saves and shares [H].

**Hashtags** (mix 5 to 10 per post, rotate, and check each is not misused
before using):
- English: `#filmmaking #shortfilm #indiefilm #indianfilmmaker #screenwriting #callsheet #filmproduction #filmschool #behindthescenes`
- Tamil / regional: `#kollywood #tamilcinema #tamilshortfilm #tamilfilmmaker #kollywoodfilmmaking #tamilfilm #chennaifilmmakers`
- Tanglish and community hashtags: look for a few the beta group actually
  uses; do not copy a list you have not seen in use.

**Four-week post calendar** (3 feed or reel posts a week plus daily stories;
adapt the order to what the beta taught you)

| Week | Mon | Wed | Fri | Stories |
|---|---|---|---|---|
| 1 (teaser, T-7 to T0) | Reel: "Your call sheet, sent on WhatsApp in one tap" (screen recording: pick the day, tap send per person, show the message with the Maps link) | Carousel: "5 things a call sheet must say" (craft) | Reel: founder talking to camera, why this exists and that it is built in Chennai/India [only if true] | Poll: "How do you send call sheets today?" (collect replies as research) |
| 2 (launch) | Reel: Tamil typing: type phonetically, Tamil script appears in dialogue, page count stays exact | Post: pricing in one image, "pay once", links to `/start#pricing`, consistent with final-sale wording | Reel: stripboard drag-and-drop, reorder a shoot day, day-out-of-days updates | Stories: beta quotes (with permission), "Request an invite" sticker link |
| 3 (proof) | Reel: budget vs actuals: log petty cash, watch the overrun appear on day 3 | Carousel: "How to break down a scene" (craft) using the Dragon sample | Reel: DPR in two minutes at wrap | Stories: Q&A box "ask me about your budget" |
| 4 (retain and refer) | Reel: "From script PDF to schedule" import walkthrough | Post: customer film or quote (permission) | Reel: Drive backup: "your work stays yours" (local-first line) | Stories: referral code reminder, upgrade-by-difference reminder |

**Reels ideas bank** (each must be a real screen recording of the shipped
product, no mockups): WhatsApp call sheet; Tamil typing; stripboard
drag-and-drop; budget vs actuals and petty cash; sunrise/sunset and golden
hour on the shoot day; CBFC prep flags (with the "check with the regional
office" caveat); deliverables checklist; pitch deck export; Dragon sample
tour; "what a producer reads in the readiness check".

**Instagram operating rules**: reply to every comment and DM within a day
during launch weeks; pin one post that explains the product in 30 seconds;
use the bio link to `/start`; never post a customer's film, name or message
without written consent.

### 5.2 Meta ads

#### 5.2.1 Campaign structure

| Stage | Objective | Destination | Audience | Why |
|---|---|---|---|---|
| 1 Awareness | Video views or reach | Reel creative, no click needed | Interest-based, broad within India | Cheap proof of which message resonates |
| 2 Traffic | Link clicks / landing page views | `https://{{host}}/start#pricing` with UTM parameters (§5.2.5) | Same, plus lookalike only if you have enough data (usually you will not) | Sends people to the page that explains and prices |
| 3 Retargeting | Traffic or conversions | `/start#pricing` | People who engaged with your Instagram posts/videos (Meta-side audiences, no pixel required) | Warm audience, usually cheapest |

**Audiences to test** (interests change names; search Meta's selector for the
current labels): film making, short film, screenwriting, Kollywood /
Tamil cinema, film school / mass communication, independent film, specific
film institutes if available as interests; geography Tamil Nadu first, then
Kerala/Karnataka/Telangana/Maharashtra; age 18–40 as a start; Tamil and
English language targeting tested separately [H].

#### 5.2.2 Budget ladder (all figures [H])

| Step | Budget | Duration | Move up if |
|---|---|---|---|
| 1 Test | ₹300/day, 2–3 ad sets x 2 creatives | 5–7 days | At least 1,000 landing views total and one ad set clearly cheaper per click |
| 2 Confirm | ₹500/day on the winner | 7 days | Funnel (§6) shows pricing views turning into checkouts |
| 3 Scale | +20% every 3 days on a winner | until CPA rises | CPA at or under the target below |
| 4 Cap | Stop scaling when blended CPA exceeds the contribution margin | — | See rule below |

At ₹599–₹999 one-time and a payment-gateway fee [verify rate in the
Razorpay dashboard], the **maximum acceptable cost per purchase** is well
under the price. A starting guardrail [H]: do not spend more than about
40% of average order value per customer on ads (roughly ₹250–₹350), and
treat anything above that as a test you must justify, not a campaign to scale.

#### 5.2.3 Creatives list

1. 20-s reel: WhatsApp call sheet in one tap.
2. 20-s reel: Tamil phonetic typing.
3. 30-s reel: stripboard drag-and-drop.
4. 20-s reel: budget vs actuals, "overrun on day 3, not at wrap".
5. Static: "Pay once. ₹599." comparison of subscription vs one-off, **without
   competitor prices** unless freshly re-checked **[re-check]**.
6. Static: Dragon sample screenshot, "start with a full film loaded".
7. Founder talking-head, 30 s, honest story.
8. Testimonial card (consented) once available.

Always: a clear CTA ("See pricing"), the price visible, no fake urgency,
no "refund" language that conflicts with refund.html.

#### 5.2.4 KPIs and decision rules (all hypotheses to validate)

| Metric | Target [H] | If worse |
|---|---|---|
| CTR (link) | 1.0% or better | New creative or hook |
| CPC | ₹5–₹15 | Narrow or change audience |
| Landing view to pricing view | 40%+ | Fix hero / above the fold |
| Pricing view to checkout start | 5–10% | Fix pricing clarity; check mobile |
| Checkout start to purchase | 40–60% | Check Razorpay failures, UPI flow |
| Blended CPA (paid) | under ~₹350 | Pause or rework |

Rules: do not judge an ad set before about ₹1,500 [H] spent or about 1,000
landing views; kill an ad set that spends 2x the target CPA with zero
purchases; one change at a time; log every change in a sheet with date.

#### 5.2.5 The pixel trade-off and what we measure instead

**Meta Pixel is NOT installed, by design** (`docs/LAUNCH.md` §8): it would
require changes to `connect-src` / `script-src` in `vercel.json` and
`netlify.toml`, a privacy-policy paragraph, and it cuts against "your work
stays in your browser".

Trade-off, plainly:
- **What you lose**: Meta cannot optimise delivery for purchases, cannot
  build purchase-based lookalikes, and cannot attribute conversions inside
  Ads Manager. Expect to optimise for link clicks or landing page views, not
  conversions, and to pay a higher cost per customer than a pixel-optimised
  account [H].
- **What you keep**: a clean privacy claim, a faster page, no third-party
  script on a tool people keep months of work in.
- **What you do instead**: tag every ad link with UTMs
  (`utm_source=instagram|facebook`, `utm_medium=paid|organic|affiliate`,
  `utm_campaign=<name>`, `utm_content=<creative>`), and read the first-party
  funnel counts (§6, schema §29) per source. Match ad spend per campaign
  (from Ads Manager) to purchases per campaign (from the console) by hand,
  weekly.
- **If you later want the pixel**: put it on `start.html` ONLY, never inside
  the studio, add the header allowances in BOTH host configs in the same
  commit, add a privacy paragraph and a consent control, and update this
  section. That is a decision for the owner, not a default.

Confirm before spending: that the funnel counts record the UTM or at least
the referrer. If schema §29 stores event names only (HANDOFF B5: fixed list,
no personal data), attribution per campaign needs either a separate
landing URL per campaign (`/start?c=ig1`) or a source field added to §29.
**Check what the shipped §29 records and write the answer here.**

### 5.3 Shopify (optional)

Role options, simplest first:

| Option | What it is | Pros | Cons |
|---|---|---|---|
| A. **Link-out** (recommended) | A Shopify page or product that is only a landing/brand page, with a button to `/start#pricing` | No second payment system; Razorpay stays the source of truth; zero double-billing risk | Shopify adds little beyond a branded storefront and Shopify's own audience |
| B. Digital licence that issues a code | Customer pays on Shopify; an order creates a promo/invite code (manual or via an automation) that they redeem in the studio | Uses Shopify's checkout, discounts, and email | Two payment systems; GST/invoice duplication; refunds in two places; a code sold for money must be reconciled with Razorpay's `payments` table |
| C. Full duplicate store | Mirror pricing and fulfil by hand | None worth it | Highest error and support risk |

**Recommendation: A.** If a Shopify store already exists and you want to use
it for reach, make it a link-out. Choose B only if there is a reason Razorpay
cannot be used (there is not one today).

If you do B, the steps and the risks:
1. Create a product per tier at the same price as the console (O7).
2. Decide what the buyer receives: a one-use promo code for the tier (set to
   100% off the tier so the studio activates it) is the cleanest.
3. Fulfilment is **manual at first** (owner creates the code in the console
   and e-mails it); automate only after 10 orders [H].
4. Risks: (a) **double billing**: a customer who also buys on the landing
   page; mitigate by one entry point per campaign. (b) **Refund divergence**:
   a Shopify refund does not cancel the activated plan; you must lapse it by
   hand. (c) **Invoices**: schema §28 Bill of Supply invoices are issued from
   Razorpay activations; a Shopify sale needs its own invoice or a manual
   one, or a statement that it is covered by Shopify's receipt, to be checked
   with an accountant. (d) The refund policy text must be identical on both.
5. Whatever you choose, record the decision in `docs/LAUNCH.md`.

### 5.4 YouTube and film-YouTuber affiliates

- Identify 15–30 Tamil/Indian film-making channels (craft tutorials, short-film
  channels, gear reviews, film-school vlogs).
- Offer a free Pro account to review honestly, plus an **affiliate code
  (§23)** for their audience with a visible discount. Agree commission and
  payout in writing.
- Provide a one-page brief: what the product does, three claims they may make,
  the final-sale wording, what they must not promise (planned features).
- Disclosure of the relationship is required, in the video and description.
- Track per code in the console Growth section; pay on a fixed schedule.

### 5.5 WhatsApp communities

- Join and contribute first (answer questions, share craft tips) before ever
  posting a link; follow each group's rules, and do not spam.
- Build your **own** WhatsApp community or broadcast (beta users plus
  customers): release notes, tips, and the support link. Only add people who
  opted in.
- Provide a "share this product" message with the landing URL; test that the
  link card renders (O14).

### 5.6 Film schools and festivals

- Faculty outreach: free evaluation Pro account, a 20-minute workshop on
  breaking down a short film and budgeting, student code (§4.2).
- Festivals: sponsor or partner on a modest basis (a code for entrants,
  a mention in the festival tracker context); never claim endorsement unless
  the festival agrees in writing.
- Student films that finish are the best proof; ask permission to feature them.

### 5.7 SEO and e-mail

**SEO** (slow, but free):
- Make `/start` the only crawlable door (it is; `/invite` is noindex).
- Submit sitemap (O13); keep titles and descriptions specific
  ("call sheet on WhatsApp", "Tamil screenplay typing", "short film budget
  template India").
- Blog/guide ideas (each written in original wording, no copyrighted book
  text): how to write a call sheet; Tamil screenplay format and typing;
  short-film budget breakdown in rupees; scene breakdown walkthrough; CBFC
  certification checklist for short films with the caveat to confirm with
  the regional office; OTT delivery checklist; festival submission planner.
- Note that blog content must live where the app's invariants allow
  (static markup like the legal pages, or `start.html` sections); do not
  add a CMS dependency for this.

**E-mail** (from the §29 leads list; **BUILT, needs owner step**):
- **Consent first**: only people who ticked the consent text on the
  landing page. Keep a record of when and what they agreed to. Include an
  unsubscribe in every message. Do not import purchased lists.
- Sequence [H]:
  1. Immediately: welcome, what the product is, link to the Dragon sample
     and a request-invite link.
  2. Day 2: one craft tip from the pillar list (value, no sell).
  3. Day 4: how one feature solves one pain, with a short clip.
  4. Day 7: pricing, final-sale policy stated plainly, upgrade-by-difference.
  5. Launch week: the launch code with its real end date.
  6. Post-purchase: onboarding (open sample, import, call sheet), and the
     referral code explanation.
- Sending tool: use a reputable sender; the product has no third-party
  mail script and you should not add one to the studio. If a tool is added
  it needs a privacy paragraph.

---

## 6. Funnel and metrics

### 6.1 Events (first-party, schema §29 — BUILT, needs owner step)

| Event | Fires when | Notes |
|---|---|---|
| `landing_view` | `/start` loads | Denominator for everything |
| `pricing_view` | The pricing section is seen | Intent signal |
| `invite_request` | A visitor submits the request form | Demand under the invite gate |
| `signup` | First sign-in | Activation step 1 |
| `checkout_start` | The Buy button opens Razorpay | Price acceptance |
| `purchase` | Verified payment recorded | The goal |

The registry earlier listed a different name set for B5
(`start_view sample_open plan_view buy_click buy_done`). **Confirm the names
the shipped §29 actually accepts** (the CHECK list is fixed) and correct this
table to match before relying on it. The owner opt-out
`fms_no_analytics_v1` and Do-Not-Track mean counts under-report; treat them
as a floor.

### 6.2 Targets (all [H])

| Step | Target |
|---|---|
| landing_view to pricing_view | 40% |
| pricing_view to invite_request or signup | 8–15% |
| signup to checkout_start | 15–25% |
| checkout_start to purchase | 40–60% |
| Overall landing_view to purchase | 0.5–2% |
| Refund rate | under 3%, exceptions only |
| Day-7 return of paid users | 50%+ (measure by hand from the console until a metric exists) |

If any real number is far from the target, the target was wrong or the page
is; decide which, do not just move the target.

### 6.3 Weekly review ritual (30 minutes, same day each week)

1. Open the admin console funnel counts for the last 7 days and the previous 7.
2. Write the six counts and the three conversion rates in a sheet.
3. Pull Ads Manager spend and clicks by campaign; compute cost per landing
   view and cost per purchase by hand.
4. Read every support message and refund request from the week.
5. Pick one funnel step to improve; write the hypothesis and the change.
6. Record decisions and one thing to stop doing.

### 6.4 Reading it in the admin console

Admin console (`admin.html`) Growth section: leads, funnel counts, referral
and affiliate redemptions, invoices, refund requests. Sections open by hash
(`admin.html#billing`). If a count seems wrong, check the device opt-out and
confirm §29 is actually run live before concluding anything about demand.

---

## 7. Support and operations

### 7.1 Support channels

| Channel | Setup | Response target [H] |
|---|---|---|
| Support e-mail | Dedicated inbox in `brand.json` (O10) | 24 h, 48 h weekends |
| WhatsApp support link | `VITE_SUPPORT_WHATSAPP` (O11) | Same day, business hours |
| In-app | Footer links | — |

Keep a support log (date, user, issue, resolution time, root cause). Tag each
as bug, question, request, billing.

### 7.2 Refund handling flow

Policy is **final sale** except duplicate charge, charged-but-not-delivered,
and where Indian law requires (`refund.html` §3–§4).

1. Customer asks (a customer refund request in Settings, **BUILT, behind a
   toggle, schema §27**; or by e-mail per `refund.html` §5).
2. **Keep the in-app request toggle OFF by default.** Turn it on only after
   O17 has passed and you are ready to answer within the stated time.
3. Admin checks the `payments` row (paid, ids, amount) in the console and the
   Razorpay dashboard for a duplicate or an undelivered activation.
4. If it qualifies: admin approves; the **`rzp-refund`** edge function calls
   Razorpay and records the result. The webhook's refund handling then
   reconciles state.
5. Plan access follows refund.html §7 (what happens to the account); check
   the plan lapsed.
6. Reply with the refund reference and the timeline in `refund.html` §6.
7. If it does not qualify, reply politely, cite the policy, and offer help
   fixing the underlying problem (most "refund" asks are "it did not work").

Never refund outside Razorpay's tools, and never approve in the console
without checking the payment first.

### 7.3 Invoices

Seller is an individual: **Bill of Supply** (no tax charged), gapless
financial-year numbers `FMS/2026-27/000123` assigned at activation (schema
§28, **BUILT, needs owner step**). If a GSTIN is later registered the
invoice mode changes; that is an accountant decision, not a code default.
Check that every `paid` payment has exactly one invoice and that numbers
have no gaps; a gap is an incident.

### 7.4 Customer backups

Tell customers, in onboarding and the FAQ: everything lives in their browser;
**clearing site data deletes it** unless they have a backup. Recommend a
Google Drive backup (Intermediate and Pro per the matrix; the export file
works on every tier) and a downloadable backup after each work session.
Drive backup uses the user's own Drive (`drive.file` scope); the sign-in
grant lasts about an hour and there is no silent re-mint, so a backup may
ask to sign in again.

### 7.5 Incident checklist

| Incident | First actions |
|---|---|
| Payments failing | Check Razorpay status; `rzp-order` and `rzp-verify` logs; webhook probe (401 means alive); confirm the key id in `.env` matches the mode |
| Paid but no plan | Look up the `payments` row; if `paid` but plan unchanged, re-run activation per `docs/BILLING.md`; reply fast, this is a refund exception |
| Webhook 503 | The webhook secret is missing in Supabase; set it |
| Customer sees another's film | Treat as a security incident: take the site down or flip the gate, preserve logs, review RLS (`docs/SECURITY-RLS.md`), notify affected users |
| Site blank in one browser | Service-worker trap (`CLAUDE.md`); check a `.html` URL in a real browser with the worker installed |
| Google sign-in fails | Consent screen / authorised origins (`docs/LAUNCH.md` §2, §7) |
| Data loss report | Ask for the last backup; check storage-migration notes; do not ask them to clear site data |
| Bad deploy | Redeploy the previous Vercel build; never fix forward on live billing |

Keep a one-paragraph incident note after every incident in
`docs/KNOWN-ISSUES.md`.

---

## 8. Legal and compliance checklist

| Item | Check | State |
|---|---|---|
| Privacy, Terms, Refund pages published and linked in footer and on the landing | Read each at 390px in both themes (they are outside the gate and its checks) | Live; read after any edit |
| Seller identity shown (individual's legal name via `{{brand:seller}}`) | Appears on all three pages | Done |
| GSTIN line | Number supplied or sentence deleted (O9) | Open |
| Bill of Supply invoices | Mode set; sample invoice reviewed with an accountant [recommended] | Built, not live |
| Refund policy matches every ad, email and Shopify text | Search all copy for "refund", "money-back", "guarantee" | Ongoing |
| Leads consent | Explicit consent text beside the e-mail field, one paragraph in `privacy.html` describing the list, no third-party script, a working unsubscribe and a way to delete a lead on request | Built; confirm text and paragraph before enabling |
| First-party analytics disclosure | `privacy.html` states what is counted and that no personal data is stored; honours Do-Not-Track | Confirm wording matches §29 |
| No Meta pixel | If ever added: privacy paragraph + header allowances + consent | Not installed |
| No real people in samples; the Dragon sample is a reconstruction and says so | No real name beside a contact; no reproduction of the real screenplay | Done (HANDOFF R/8) |
| Copyright of book-inspired content | Original wording only, Tamil/Indian examples from the studied films, one credit line, no reproduction (needs `scripts/deny-shingles.txt` for the check) | Applies to the emotional-craft layer, not yet built |
| Testimonials and film features | Written permission, saved | Per item |
| Affiliate and influencer disclosure | In writing and in the post | Per partner |
| CBFC / certification content | Always says "confirm with your regional office"; no legal-advice claims (Terms §9) | Done in product |
| Payment data | Card/UPI details never touch our servers (Razorpay checkout) | By design |
| Terms mention of invite-only | Update Terms §3 if the gate opens | At O15 |
| Data requests | A process for deleting an account and its cloud data on request | Define before T0 |

This list is a working checklist, not legal advice; have a lawyer or
accountant confirm GST, invoice and consent wording once.

---

## 9. Post-launch roadmap (from the HANDOFF registry)

Order is by expected effect on sales and trust first, then effort. Sizes are
rough [H]: S under 2 days, M 2–5 days, L over 5 days.

| Priority | ID | Item | Size | Why now |
|---|---|---|---|---|
| 1 | T8, T10 | Full `ship` gate and CI | M | Protects billing and data on every release |
| 2 | P4 follow-ups | Remaining two-account RLS rows (§16–§24 additions, 24.1) | S | Trust; run before scaling |
| 3 | B7 | Public read-only call-sheet and deck links outside the gate | L | Sharing is viral, but needs a security review (token guessing, revocation, no contact details) |
| 4 | B2 | Gift a licence | M | Fits the gifting and festival seasons; follows §27 refund rules |
| 5 | B3 | Film-school edu licence with seats | M | A channel multiplier; manual codes cover the start |
| 6 | Q5 | Tamil-script UI labels (owner decision first) | M | Reverses `lang.js` design; decide, do not drift |
| 7 | Q2 | Script-notes overview | S–M | Safest build; `comments.js` |
| 8 | Q4 | Paid template and sample packs plus one free original starter | M + content | Upsell; originals only |
| 9 | Q1 | Monsoon weather flag | M | Needs a host `connect-src` change in both configs |
| 10 | Q3 | Writing-goal sync across devices | M | Needs a schema section; last |
| 11 | E0–E5 | Emotional-craft layer (A: vocabulary and Library shelf; B: Story emotion layer; C: per-scene feeling; D: AI emotional read; E: case studies) | L total; A is S–M and pure content | Differentiator; "learning free, tools paid"; needs `deny-shingles.txt` first |
| 12 | G1, G2, G7 | Production gaps (after-sunset on DPR wrap, Plan recce fields, lazy CBFC import) | S each | Quality, first paint |
| 13 | T1–T4, T9 | Test gaps (revision tint, ai.js chunk, Tamil typing in a browser, adoption proof, browser walks) | S each | Confidence |
| later | N1–N7 | The "N" ideas | — | **The N1–N7 list is not defined in the docs read for this plan** (HANDOFF §6c has no N block). Name them in the registry before scheduling |

Selection rule: after launch let customer requests and the funnel reorder
this table; write the change here and in HANDOFF §6c.

---

## 10. Risks and mitigations

| Risk | Likelihood [H] | Impact | Mitigation |
|---|---|---|---|
| A buyer sees another buyer's data (RLS gap) | Low | Severe | O8 before money; gate stays on in week 1; incident plan §7.5 |
| Live Razorpay misconfigured, paid but no plan | Medium | High | O18 live drill; webhook probe; support promise 24 h; refund exception covers it |
| `create_pending_payment` signature mismatch after SQL | Medium | High | Run §20+ in the same session as the `rzp-order` deploy; read back |
| Refund abuse under a final-sale policy | Medium | Medium | Keep customer-request toggle off by default; admin checks each; policy text everywhere |
| Ad spend wasted without a pixel | High | Medium | Start at ₹300/day, UTM and funnel counts, strict kill rules (§5.2.4) |
| Funnel counts under-report (Do-Not-Track, opt-out, blockers) | High | Low | Treat as a floor; cross-check with payments and Ads Manager |
| Tier differences not enforced (features not seeded) | Medium | Medium | O6 before announcing tiers; do not sell a difference the gate lacks |
| Price on landing differs from console | Low | Medium | O7; build-time stamp; check both at each price change |
| Competitor claim is wrong in an ad | Medium | Medium | No competitor prices unless re-checked; claims limited to our features |
| Invite gate hides the product from curious visitors | Medium | Medium | Landing is public; request-invite with 24 h approval; decide O15 with data |
| Support overload | Medium | Medium | Cap invites in week 1; FAQ; one inbox; response targets [H] |
| Data loss from cleared browser data | Medium | High | Onboarding backup message; Drive backup prompt; never advise clearing site data |
| Google branding verification delays | Medium | Low | App is in production without sensitive scopes; keep sign-in fallback if any |
| Single point of failure: one individual seller | High | Medium | Dedicated inbox; documented runbooks (this file, HANDOFF, BILLING); second admin (O16) |
| Legal or tax mistakes (GST, invoices, consent) | Medium | Medium | Accountant review once; GSTIN line decision (O9) |
| Copyright claim on book-inspired content | Low | High | Original wording; deny-list check; credit line only |
| Name change after marketing starts | Low | Medium | Use the brand variable; avoid hard-coded name in creatives you cannot re-cut |
| Overpromising planned features | Medium | Medium | §4.5 rule 4; only advertise BUILT-and-live features |

---

## 11. Owner's weekly checklist

One table; do it on the same day each week. "Pre-launch" weeks use the first
column; after T0 use all.

| When | Task | Done when |
|---|---|---|
| Monday | Read funnel counts (7 days vs prior) and fill the sheet (§6.3) | Six counts + three rates written |
| Monday | Ads Manager: spend, clicks, CPC, CTR per ad set; apply kill/scale rules | Decisions logged |
| Monday | Match campaign spend to purchases by UTM/landing variant | Cost per purchase per campaign |
| Tuesday | Read every support item and refund request; reply; log root cause | Inbox at zero, nothing older than 24 h |
| Tuesday | Verify every `paid` payment has an invoice and an activated plan | No mismatches |
| Wednesday | Post: demo reel or craft post (calendar §5.1) | Published, comments answered |
| Wednesday | Check codes: expired launch codes disabled, referral/affiliate redemptions correct | Console matches intent |
| Thursday | One outreach batch: 5 YouTubers, faculty, or community admins | Messages sent, replies logged |
| Thursday | Collect or request one testimonial/film permission | One per week [H] |
| Friday | Post: proof or founder post | Published |
| Friday | Release gate for any code change: `npm run build && npm run verify` on the open build, plus the gate in `docs/BRANCHING.md` | Green, or nothing shipped |
| Friday | Back up the owner's own studio and note Razorpay settlements | Done |
| Weekly | Probe the webhook (expect 401 unsigned); open `/start`, `/privacy`, `/terms`, `/refund` in a real browser at 390px | All load |
| Weekly | Read `docs/HANDOFF.md` §4 and fix anything now untrue | Doc matches reality |
| Monthly | Reconcile Razorpay settlements to `payments`; review refund rate; revisit §9 order; decide O15 again if still gated | One-page note |
