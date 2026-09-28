# StudioBinder topics vs. The Filmmaker's Studio

A roadmap input, not shipped content. Nothing here is built into the app.

The 22 topic categories below are StudioBinder's own blog taxonomy, taken from
their site navigation on 28 Sep 2026. Only the category *names* are reproduced —
they are labels, not content. Everything in the "Where" and "Verdict" columns is
an assessment of this repo, mapped against the 24 feature steps, the 11 short
steps, and the five library data sets.

## The map

| StudioBinder topic | Where the Studio covers it | Verdict |
|---|---|---|
| **Scriptwriting** | Feature Vol I 01–12 · Short 01–08 | **Strong** — the spine of the product |
| **Writing** | same as above (StudioBinder splits these; the Studio doesn't) | **Strong** |
| **Development** | Vol I 01 Spark · 02 Logline · 03 Theme & Stakes | **Strong** |
| **Brainstorming** | Vol I 01 Spark · Short 01 Seed | **Covered** |
| **Budgeting** | Vol II 23 · `rates.chennai.2024.json` (6 sections, 52 presets) + live calculator | **Strong** — the most concrete thing in the app |
| **Producing** | Vol II 23 Schedule/Budget/Crew · 24 Tech Recce · Short 09 Production Reality | **Covered**, pre-production only |
| **Cinematography** | Vol II 16 Storyboard & Shot List · 17 Cinematography Plan | **Covered**, as planning |
| **Directing** | Vol II 14 Director's Vision · 20 Casting · `directors.json` (10) | **Partial** — vision and casting, nothing about directing on the day |
| **Auteur Directors** | `directors.json` (10) · `watchlist.json` (24) | **Covered** as reference |
| **Movies** | `films.json` (22) · `watchlist.json` (24) | **Covered** as reference |
| **Film Theory** | `rules.json` (50 aphorisms with attribution) | **Partial** — maxims, not theory |
| **Breakdowns** | Vol II 13 Script Lock · 16 Shot List | **Partial** — breaking down, not analysing finished films |
| **Music & Sound Effects** | Vol II 22 Sound & Music | **Covered**, as a pre-production brief |
| **Scheduling** | Vol II 23 | **Weak — and in scope.** See below |
| **Distribution** | Short 10 Festival Strategy · `festivals.json` (18) | **Partial** — festivals only; no sales, platforms or self-release |
| **Production Hacks** | scattered through `rules.json` | **Weak** |
| **Post-Production** | one passing mention in `steps.feature.json` | **Gap** |
| **Editing Techniques** | "editor" appears as a budget line and a crew role | **Gap** |
| **Video Gear** | equipment exists as rate presets, never as guidance | **Gap** |
| **Marketing** | nothing | **Gap** |
| **Motion Graphics** | nothing | **Gap** |
| **Video Effects** | nothing | **Gap** |

## What the gaps actually mean

Six hard gaps — Post-Production, Editing, Video Gear, Marketing, Motion Graphics,
Video Effects. Five of the six sit **after the clapperboard**, and that is not an
oversight. The feature blueprint's own cover says it: *"from the first 'what if?'
to ROLL CAMERA."* The Studio is a development-and-prep tool that deliberately
stops where principal photography starts. StudioBinder is a production-management
product covering the whole pipeline, so a category-by-category comparison will
always show that tail missing.

Treat those five as **out of scope until the product boundary changes**, not as a
backlog. Adding a thin post-production section would make the app broader and
worse; its credibility comes from being unusually deep on the part it covers.

Two things in the table are different, and worth acting on.

**Scheduling is the real gap.** It is squarely inside the existing boundary —
scheduling *is* pre-production — and today it is one field group inside Vol II 23.
"Stripboard" and "day out of days" appear nowhere in `src/data`. This is already
open item 2 (scene → shot → stripboard → day-out-of-days → call sheet), and this
map is independent evidence for its priority: it is the only topic where the
Studio claims the ground and does not hold it.

**Video Gear is a near-miss.** `rates.chennai.2024.json` already carries 52
equipment presets with real Chennai prices. It knows what an Alexa Mini day costs
and nothing about when to choose one. That is the cheapest gap to close, because
the data is already there and the library page already renders it — it needs
guidance attached to rows that exist, not a new section.

## If the goal is to learn rather than to build

Ranked by what this repo cannot teach you, most useful first:

1. **Post-production as a whole** — the largest blind spot, and the part of the
   pipeline the app never touches. Editing theory first: it changes how you write
   and shoot.
2. **Scheduling craft** — stripboards, day-out-of-days, the logic that turns a
   scene list into shoot days. Learning this feeds open item 2 directly, so the
   study and the build are the same work.
3. **Distribution beyond festivals** — the app stops at submission strategy;
   sales agents, platforms and self-release are the rest of the sentence.
4. **Marketing** — poster, trailer, campaign. Absent entirely, and the one that
   most often decides whether the other 23 steps were worth doing.

Motion graphics and video effects are specialisms; skip unless a specific film
needs them.

---
Generated 28 Sep 2026. Re-check the taxonomy before trusting it — StudioBinder
reorganises their blog, and this reflects one reading of their navigation.
