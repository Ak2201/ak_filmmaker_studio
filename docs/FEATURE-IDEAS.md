# Feature ideas — 7 Oct 2026

Gathered by four research passes on 7 Oct 2026: three read the code for
gaps (story + screenplay; pre-production → post; growth, collaboration and
money) and one scanned competitors and the Indian market. Every idea was
checked against the code before being called a gap, so nothing here is
already built. Merged, de-duplicated and ranked by what makes the product
sell and keep buyers.

**Size:** S ≈ a day, M ≈ a few days, L ≈ a week or more.
**Server:** "yes" means a new schema section that has to be run on the
live database like §16–§20 (see `docs/LAUNCH.md` §4). Everything else is
local-first and works with no server.

**Status** is where each idea stood when this file was written: the nine
feature agents started on 7 Oct are building every idea marked *building*.
Strike an idea through, and say where it landed, in the commit that ships
it — the same rule as `docs/UX-AUDIT-2026-10-06.md`.

## Tier 1 — build first: small, India-specific, and rivals don't have them

| # | Idea | What it gives the buyer | Size | Server | Status |
|---|---|---|---|---|---|
| 1 | WhatsApp call sheet | One tap sends each person their own call time, location (Maps link) and scenes, to the unit group or one by one. Indian crews run on WhatsApp; no competitor does this. | S | no | building (on-set) |
| 2 | Petty cash + daily expense log | Batta, food, fuel and location tips logged per day against a budget line, with float in, spent and balance. | M | no | building (money) |
| 3 | Budget vs actuals (cost report) | Estimate, spent and variance per line, so overruns show on day 3, not at wrap. Saturation.io charges $25/user/month for this. | M | no | building (money) |
| 4 | Daily Production Report (DPR) | End-of-day call/wrap times, scenes and pages shot against plan, delays, spend. Reads the shoot-day marks. | M | no | building (schedule) |
| 5 | Upgrade by paying the difference | A Starter buyer moves to Indie for the price gap, so small first sales climb the tiers. | M | yes | building (billing) |
| 6 | Referral + affiliate codes | Every buyer gets a personal code; film-YouTubers get tracked commissions. Builds on the promo codes (§20). | S–M | yes | building (billing) |
| 7 | "Made with FilmMakerStudio" on decks, screening links and call sheets | Every pitch deck a director sends advertises the product, carrying their referral code. Free plans keep it; paid plans can remove it. | S | no | building (growth) |

## Tier 2 — strong differentiators

| # | Idea | Why | Size | Server | Status |
|---|---|---|---|---|---|
| 8 | Tamil-script typing (type phonetically, get Tamil) | Scrite and WRAPPLAB, the two India-specific rivals, lead with this. Dialogue only, so the page count stays exact. | M | no | building (writing) |
| 9 | Crew payments + advances ledger | Agreed fee, advances (cash/UPI), balance due, days worked — settled at wrap without disputes. | M | no | building (money) |
| 10 | CBFC prep kit + sensitivity flags | Rule-based flags (smoking disclaimer, animal NOC, violence, real names) with cited sources, a likely-rating hint, the dialogue list, the e-Cinepramaan checklist. | M | no | building (compliance) |
| 11 | Revision compare + revised-page marks | What changed between drafts; industry asterisks and coloured pages in the PDF. | M | no | building (revisions) |
| 12 | Locked scene numbers (12A, OMITTED) | Call sheets stop renumbering once shooting starts. | M | no | building (revisions) |
| 13 | GST invoices — buyers and vendor bills | A buyer can't book the purchase without a tax invoice; productions need GST/TDS on rentals and crew. | M | yes (buyer side) | building (billing; money for vendor bills) |
| 14 | Sunrise / sunset / golden hour on the shoot day | Plan exteriors around the light, computed offline. | S | no | building (on-set) |
| 15 | Dialogue list / subtitle prep export | Numbered CSV and an SRT starting file, Tamil and English side by side, for subtitlers and dubbing. | S | no | building (compliance) |
| 16 | Target runtime with songs counted | Set 140 minutes; see estimate vs target per act, songs included. | S | no | building (compliance) |
| 17 | Emotional craft layer (Library shelf + glossary, per-beat/per-scene intended emotion, emotion curve, honest hints, AI emotional read) | Teaches and applies the craft of engineering the audience's feeling; learning free, tools paid. Original wording only — the source book is copyrighted. | M–L | no | **planned** — `docs/WIP-EMOTION-PLAN.md` |

## Tier 3 — good, later

**Production**

| Idea | Size | Server | Status |
|---|---|---|---|
| FEFSI bata wage table, versioned — shipped as the last published (2022, expired) table, never as current | M | no | building (money) |
| Budget top sheet with contingency | S | no | building (money) |
| Movie Magic-style budget CSV export | M | no | building (money) |
| Printable one-liner schedule | S | no | building (schedule) |
| Route sheet: address, Maps link, nearest hospital and police | S | no | building (on-set) |
| Equipment checklists per shoot day | M | no | building (schedule) |
| Stripboard banners: company moves, travel/holding days, day-load warning | S–M | no | building (schedule) |
| Offline "shoot pack" for the day | M | no | building (schedule) |
| Monsoon weather flag on EXT days | S | no, but an external API + `connect-src` | not started |

**Writing**

| Idea | Size | Server | Status |
|---|---|---|---|
| Characters as data, one-step rename across every cue | M | no | building (writing) |
| Treatment / one-pager / synopsis documents that start pre-filled | S | no | building (writing) |
| Table-read export (lines, words, minutes per character) | S | no | building (writing) |
| Commit Tamil script as an alternate take | S | no | building (writing) |
| Script-notes overview across the whole script | S | no (existing comments) | not started |
| Writing-goal history across devices | S | yes (widen the CHECK) | not started |

**AI, on the buyer's own key** — every point must quote the script word
for word; a quote that isn't is stripped and counted.

| Idea | Size | Status |
|---|---|---|
| Coverage report (a reader's report on the whole script) | M | building (AI) |
| Logline workshop | S | building (AI) |
| Character-voice check | S | building (AI) |

**Growth and money**

| Idea | Size | Server | Status |
|---|---|---|---|
| Onboarding tour + first-week checklist (derived, writes only on action) | M | no | building (growth) |
| Landing-page e-mail capture | S | yes | building (billing) |
| First-party funnel counts — no pixel, no personal data, opt-out | S | yes | building (billing) |
| Testimonials section (ships empty; never invented) | S | no | building (growth) |
| WhatsApp support link (`VITE_SUPPORT_WHATSAPP`) | S | no | building (growth) |
| Gift a licence | M | yes | building (billing) |
| Film-school licence (seats + bulk student codes) | M | yes | building (billing) |
| Public read-only call-sheet / deck links that don't hit the invite gate | M | yes, needs a security review | DESIGN ONLY (growth) — proposal SQL, feature flag off |
| Paid template / sample packs | L (content) | small | not started |
| Tamil-script UI labels | L | no | not started — reverses `lang.js`'s design; decide first |
| OTT delivery checklists (Netflix, Prime; Aha / Sun NXT / ZEE5 user-filled — no published specs) | S | no | building (compliance) |

## Market context

From the competitor scan. **Several prices came from aggregator sites that
disagree with each other — check against the vendor site before putting a
number in an ad.** StudioBinder's own site was blocked from the research
container.

| Tool | Price (2026, approximate) | Standout |
|---|---|---|
| StudioBinder | ~$19–42/mo; US-focused | All-in-one cloud suite; call-sheet read receipts |
| Celtx | Free; ~$11 / $19 / $67 per month billed yearly | Script → breakdown → budget |
| Final Draft 13 | $199.99 one-time; Suite from $16.99/mo | The `.fdx` standard; revision colours |
| WriterDuet | Free (3 projects); $9.99–13.99/mo | Real-time co-writing, offline |
| Arc Studio | Free (2 scripts); $69–99/yr | Clean editor, beat board |
| Filmustage | Free (10-scene exports); ~$19–66/mo | AI breakdown from `.fdx`/PDF |
| Movie Magic Scheduling / Budgeting | $199.88 / $299.88 per year | The budget format financiers accept |
| Saturation.io | Free (1 project); $25/user/mo | Live budget vs actuals |
| SetHero | Free for 10 people / 1 day; per project | Call times by text with confirmations |
| Scrite / WRAPPLAB (India) | Subscription / free under 3 projects | Native Tamil/Telugu/Hindi typing; script → schedule |

The closest Indian rivals are strong on Tamil typing and weak on budgets
and on-set tools; nobody in the list sells once in rupees.

**Positioning lines**

- "Pay once, own it forever. No dollar subscriptions bleeding your budget."
- "Built for Kollywood: Tamil scripts, FEFSI bata, Chennai rate cards and
  call sheets on WhatsApp — story to CBFC to OTT."
- "Your script stays on your machine. Local-first, your own AI key, backed
  up to your own Google Drive."

## Already built — not ideas

Checked by the research passes so they are not re-proposed: Fountain /
FDX / PDF import; screenplay PDF; dual dialogue; shots; title page; page
view; SmartType; shortcut presets; focus mode and goals; beat board;
dictation; read-as; alternate takes; synopsis → script AI; the Interval
framework; breakdown, elements, auto-tag, cast matrix, shot list,
storyboard, lookbook; stripboard with drag-and-drop and per-day order;
DOOD; sides; reports; call sheet print and PDF; shoot-day marks; edit log
with pick-ups; deliverables; festival tracker; promo codes; screening
passes; pitch deck; Drive backup; share links and comments.
