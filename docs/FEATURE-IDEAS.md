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
feature agents started on 7 Oct built every idea now marked *built*; it
reached `main` in the release of 8 Oct 2026 (`docs/HISTORY.md` item 20).
The billing items marked *not started* need schema sections of their own,
from §25 (§24 is the characters/costs sync scopes).
Strike an idea through, and say where it landed, in the commit that ships
it — the same rule as `docs/UX-AUDIT-2026-10-06.md`.

## Tier 1 — build first: small, India-specific, and rivals don't have them

| # | Idea | What it gives the buyer | Size | Server | Status |
|---|---|---|---|---|---|
| 1 | WhatsApp call sheet | One tap sends each person their own call time, location (Maps link) and scenes, to the unit group or one by one. Indian crews run on WhatsApp; no competitor does this. | S | no | built (on-set) — release 8 Oct 2026 |
| 2 | Petty cash + daily expense log | Batta, food, fuel and location tips logged per day against a budget line, with float in, spent and balance. | M | no | built (money) — release 8 Oct 2026 |
| 3 | Budget vs actuals (cost report) | Estimate, spent and variance per line, so overruns show on day 3, not at wrap. Saturation.io charges $25/user/month for this. | M | no | built (money) — release 8 Oct 2026 |
| 4 | Daily Production Report (DPR) | End-of-day call/wrap times, scenes and pages shot against plan, delays, spend. Reads the shoot-day marks. | M | no | built (schedule) — release 8 Oct 2026 |
| 5 | Upgrade by paying the difference | A Starter buyer moves to Indie for the price gap, so small first sales climb the tiers. | M | yes | built (billing) — release 8 Oct 2026 |
| 6 | Referral + affiliate codes | Every buyer gets a personal code; film-YouTubers get tracked commissions. Builds on the promo codes (§20). | S–M | yes | built (billing) — release 8 Oct 2026 |
| 7 | "Made with FilmMakerStudio" on decks, screening links and call sheets | Every pitch deck a director sends advertises the product, carrying their referral code. Free plans keep it; paid plans can remove it. | S | no | built (growth) — release 8 Oct 2026 |

## Tier 2 — strong differentiators

| # | Idea | Why | Size | Server | Status |
|---|---|---|---|---|---|
| 8 | Tamil-script typing (type phonetically, get Tamil) | Scrite and WRAPPLAB, the two India-specific rivals, lead with this. Dialogue only, so the page count stays exact. | M | no | built (writing) — release 8 Oct 2026 |
| 9 | Crew payments + advances ledger | Agreed fee, advances (cash/UPI), balance due, days worked — settled at wrap without disputes. | M | no | built (money) — release 8 Oct 2026 |
| 10 | CBFC prep kit + sensitivity flags | Rule-based flags (smoking disclaimer, animal NOC, violence, real names) with cited sources, a likely-rating hint, the dialogue list, the e-Cinepramaan checklist. | M | no | built (compliance) — release 8 Oct 2026 |
| 11 | Revision compare + revised-page marks | What changed between drafts; industry asterisks and coloured pages in the PDF. | M | no | built (revisions) — release 8 Oct 2026 |
| 12 | Locked scene numbers (12A, OMITTED) | Call sheets stop renumbering once shooting starts. | M | no | built (revisions) — release 8 Oct 2026 |
| 13 | GST invoices — buyers and vendor bills | A buyer can't book the purchase without a tax invoice; productions need GST/TDS on rentals and crew. | M | yes (buyer side) | buyer invoices not started (schema §25 onward); GST and TDS on expenses and crew built (money) |
| 14 | Sunrise / sunset / golden hour on the shoot day | Plan exteriors around the light, computed offline. | S | no | built (on-set) — release 8 Oct 2026 |
| 15 | Dialogue list / subtitle prep export | Numbered CSV and an SRT starting file, Tamil and English side by side, for subtitlers and dubbing. | S | no | built (compliance) — release 8 Oct 2026 |
| 16 | Target runtime with songs counted | Set 140 minutes; see estimate vs target per act, songs included. | S | no | built (compliance) — release 8 Oct 2026 |
| 17 | Emotional craft layer (Library shelf + glossary, per-beat/per-scene intended emotion, emotion curve, honest hints, AI emotional read) | Teaches and applies the craft of engineering the audience's feeling; learning free, tools paid. Original wording only — the source book is copyrighted. | M–L | no | **planned** — `docs/WIP-EMOTION-PLAN.md` |

## Tier 3 — good, later

**Production**

| Idea | Size | Server | Status |
|---|---|---|---|
| FEFSI bata wage table, versioned — shipped as the last published (2022, expired) table, never as current | M | no | built (money) — release 8 Oct 2026 |
| Budget top sheet with contingency | S | no | built (money) — release 8 Oct 2026 |
| Movie Magic-style budget CSV export | M | no | built (money) — release 8 Oct 2026 |
| Printable one-liner schedule | S | no | built (schedule) — release 8 Oct 2026 |
| Route sheet: address, Maps link, nearest hospital and police | S | no | built (on-set) — release 8 Oct 2026 |
| Equipment checklists per shoot day | M | no | built (schedule) — release 8 Oct 2026 |
| Stripboard banners: company moves, travel/holding days, day-load warning | S–M | no | built (schedule) — release 8 Oct 2026 |
| Offline "shoot pack" for the day | M | no | built (schedule) — release 8 Oct 2026 |
| Monsoon weather flag on EXT days | S | no, but an external API + `connect-src` | not started |

**Writing**

| Idea | Size | Server | Status |
|---|---|---|---|
| Characters as data, one-step rename across every cue | M | no | built (writing) — release 8 Oct 2026 |
| Treatment / one-pager / synopsis documents that start pre-filled | S | no | built (writing) — release 8 Oct 2026 |
| Table-read export (lines, words, minutes per character) | S | no | built (writing) — release 8 Oct 2026 |
| Commit Tamil script as an alternate take | S | no | built (writing) — release 8 Oct 2026 |
| Script-notes overview across the whole script | S | no (existing comments) | not started |
| Writing-goal history across devices | S | yes (widen the CHECK) | not started |

**AI, on the buyer's own key** — every point must quote the script word
for word; a quote that isn't is stripped and counted.

| Idea | Size | Status |
|---|---|---|
| Coverage report (a reader's report on the whole script) | M | built (AI) — release 8 Oct 2026 |
| Logline workshop | S | built (AI) — release 8 Oct 2026 |
| Character-voice check | S | built (AI) — release 8 Oct 2026 |

**Growth and money**

| Idea | Size | Server | Status |
|---|---|---|---|
| Onboarding tour + first-week checklist (derived, writes only on action) | M | no | built (growth) — release 8 Oct 2026 |
| Landing-page e-mail capture | S | yes | not started (schema §25 onward) |
| First-party funnel counts — no pixel, no personal data, opt-out | S | yes | not started (schema §25 onward) |
| Testimonials section (ships empty; never invented) | S | no | built (growth) — release 8 Oct 2026 |
| WhatsApp support link (`VITE_SUPPORT_WHATSAPP`) | S | no | built (growth) — release 8 Oct 2026 |
| Gift a licence | M | yes | not started (schema §25 onward) |
| Film-school licence (seats + bulk student codes) | M | yes | not started (schema §25 onward) |
| Public read-only call-sheet / deck links that don't hit the invite gate | M | yes, needs a security review | DESIGN ONLY (growth) — proposal SQL, feature flag off |
| Paid template / sample packs | L (content) | small | not started |
| Tamil-script UI labels | L | no | not started — reverses `lang.js`'s design; decide first |
| OTT delivery checklists (Netflix, Prime; Aha / Sun NXT / ZEE5 user-filled — no published specs) | S | no | built (compliance) — release 8 Oct 2026 |

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
