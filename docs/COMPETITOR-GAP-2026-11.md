# Competitor gap report (November 2026)

Written 2 Nov 2026 during the pre-sale QA. **Nothing in this report has been
built.** It compares FilmMakerStudio with Celtx, Final Draft 13 (and Final Draft
Go), StudioBinder, WriterDuet, Arc Studio Pro, Fade In and the Movie Magic suite
(Scheduling and Budgeting). It also lists what to build in the next phases.

**How far to trust it.** The vendor sites (celtx.com, finaldraft.com,
studiobinder.com, writerduet.com, arcstudiopro.com, fadeinpro.com, ep.com,
saturation.io) could not be reached from the research session. They are outside
its network allowlist. Every competitor fact therefore comes from search-result
snippets of review sites, aggregators, help-centre pages and press, and is cited
inline. Competitor prices conflict between sources and are approximate.
Re-check each figure on the vendor's own pricing page before it goes into
marketing or a sales conversation. `marketing-*.json` competitor rows stay at
`status: "read"` only once that has been done (CLAUDE.md row 64).

The FilmMakerStudio column comes from the repo's own documents: the
`navigation.json` and `plan-matrix.json` data, `docs/FINAL-DRAFT-PARITY.md`,
`docs/AI-EVERYWHERE.md`, `docs/SCRIPT-LOCK.md`, `docs/LOCK-EXTRACT.md` and the
CLAUDE.md open-items table. Where a feature has never run against the live
service, the table says so.

---

## 1. Summary for the owner

**What we are.** FilmMakerStudio is the only product in this set that runs one
film from idea to delivery in one place: Story, Screenplay, Breakdown,
Stripboard, Budget, Shot list and storyboard, Call sheets, Shoot day, Edit log
and Deliverables. Every view reads the same scene model.

- The writing tools (Final Draft, WriterDuet, Arc, Fade In) stop at the script.
- The production tools (StudioBinder, Movie Magic) start from an imported
  script and have no story development.
- Celtx is the nearest match, and it stops at pre-production.

**Where we clearly lead.**
- **Local-first and offline.** Work lives in the browser, and the Shoot Day pack
  works with no signal. Celtx, StudioBinder and Final Draft Go all need a
  connection.
- **India.** We are the only product with Tamil and Tanglish screenplays,
  Chennai crew-rate bands, the FEFSI wage table, GST, TDS and CBFC material,
  rupee pricing and WhatsApp-ready call sheets.
- **AI as an assistant you approve.** You bring your own key, nothing is written
  before you accept it, and every change has an exact undo. The sources found
  no AI in Celtx, Final Draft or Fade In.
- **Post-production.** The Edit log and the Deliverables and festival checklist
  are not offered by any competitor researched.
- **Price.** A yearly plan for the whole studio costs a fraction of one
  StudioBinder month.

**Where we are behind, by what it costs us in sales.**
1. **Real-time co-writing.** WriterDuet, Arc and Final Draft all have it. Ours is
   a merge by element id behind the §49 switch, plus a presence warning. Closing
   this needs server work.
2. **Call sheets sent and confirmed.** StudioBinder and Yamdu send by email or
   SMS, track who confirmed, and add weather, maps and the nearest hospital.
   Ours are printed or sent as WhatsApp text.
3. **Budget depth.** We have no fringes, globals or union fringe tables
   (Movie Magic Budgeting), and no bill-pay or expense capture (Saturation).
4. **TV and episodic templates.** We have none. Final Draft and Celtx handle TV.
5. **Native mobile apps.** We have a PWA. Final Draft Go, Fade In, Arc and Yamdu
   ship store apps.
6. **Never proved live.** These still need to run once for real before a large
   sale: two-account sharing and RLS, a live Razorpay payment and refund, the
   receipt e-mail (`RESEND_API_KEY` is unset) and every AI task against a real
   provider. These are trust gaps, not feature gaps.

**Recommendation.** Sell now on breadth, offline use and India. Do not claim
real-time co-writing or delivered call sheets. Phase 1 should close the trust
gaps in item 6, which need no new feature. Phase 2 should take on call-sheet
delivery and TV templates. Real-time co-editing is the largest build, because
it needs a server, and belongs in Phase 3.

---

## 2. Feature matrix

**Key**
- **Y**: yes.
- **P**: partial.
- **N**: no.
- **?**: not confirmed in any source found. Treat it as unknown, not as no.
- **(u)**: our feature is built but has never been run against the live service.

The "Writer apps" column combines WriterDuet (WD), Arc Studio Pro (Arc) and
Fade In (FI) where they agree, and names the app where they differ. "Movie
Magic" means MMS plus MMB.

### Writing

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Industry screenplay formatting | Y | Y | Y | P (reviewers call it limited) | Y | N |
| Auto-format while typing, Smart Type | Y | ? | Y | ? | Y | N |
| Dual dialogue, CONT'D, MORE | Y | ? | Y | ? | Y | N |
| Live page breaks matching the PDF | Y | P (reviewers report page and margin drift) | Y | ? | Y | N |
| Locked pages, A-pages, scene-number lock | Y | ? | Y | ? | P (FI yes, others ?) | N |
| Coloured revisions, revision marks | Y | ? | Y | P (revised import) | Y (WD on Pro, Arc on Pro) | N |
| Find and replace, macros, bookmarks | Y | ? | Y | ? | ? | N |
| Typewriter scrolling, focus or night mode | P (typewriter yes; night is the focus mode only) | ? | Y (Midnight Mode) | ? | ? | N |
| Writing goals and stats | P (goals) | ? | Y (streaks, peak times) | N | ? | N |
| Dictation and read aloud | Y (u, fake speech APIs only) | ? | ? | N | ? | N |
| TV and episodic templates | N | Y | Y | ? | ? | N |
| Tamil or Indic script support | Y | ? | ? | ? | ? | N |
| Custom dictionary or autocorrect | N | ? | Y | ? | ? | N |

### Story and outline

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Beat board or beat sheet | Y (Lanes and Spine views, drag, colours) | ? | Y (Beat Board, flow lines) | N | Y (Arc); ? (WD, FI) | N |
| Structure templates | Y (11 structures) | ? | P (Structure Lines) | N | ? | N |
| Beat and scene two-way sync | Y | ? | ? | N | ? | N |
| Index cards | Y (Scene List card view) | ? | Y | N | Y (FI) | N |
| Story map or tension heatmap | Y (derived) | ? | Y (Story Map) | N | Y (Arc story maps) | N |
| Story bible (characters, world) | Y | ? | P (Navigator character view) | N | ? | N |
| Craft library and case studies | Y | N | N | P (blog, not in-app) | N | N |

### Breakdown and scheduling

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Tag elements, breakdown sheets | Y | Y | N | Y | P (WD Pro); N (Arc, FI) | Y (MMS) |
| Auto-tag suggestions | Y (accept per item or per category) | ? | N | ? | N | ? |
| Extract everything at script lock | Y | N | N | P (scene numbers kept on re-import) | N | ? |
| Stripboard | Y | Y | N | Y | N | Y |
| Day Out of Days | Y | ? | N | Y | N | Y |
| Conflict detection or red flags | P (readiness check) | ? | N | ? | N | Y (Red Flag Manager) |
| One-liner, shooting schedule, sides | Y | ? | N | Y | N | Y |
| Shoot calendar with sun times | Y | ? | N | ? | N | ? |
| Location recce cards | Y | ? | N | ? | N | N |

### Budget

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Line-item budget | Y | Y (Studio tier) | N | P (sources conflict) | N | Y |
| Top sheet | Y | ? | N | ? | N | Y |
| Fringes, globals, union fringe tables | N (one wage table; no fringe engine) | ? | N | ? | N | Y |
| Actuals against plan, cost report | Y | P (linked to breakdown) | N | ? | N | Y |
| Petty cash, crew payments | Y | ? | N | ? | N | ? |
| Budget versions, compare | Y | ? | N | ? | N | Y |
| Local rates (Chennai bands, FEFSI) | Y | N | N | N | N | N |
| Multi-currency per film | Y (INR or USD) | ? | N | ? | N | ? |

### Shot list, storyboard and visuals

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Shot list | Y | Y | N | Y (Shot Tagger, setups) | N | N |
| Storyboard frames | Y (upload or link) | Y | N | Y (upload, no drawing) | N | N |
| Drawing tools in the storyboard | N | ? | N | N | N | N |
| Floor plan, blocking, 180° line | Y | ? | N | ? | N | N |

### Call sheets and production

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Call sheet from the schedule | Y | Y | N | Y | N | N |
| Weather, map, nearest hospital on the sheet | P (hospital and police on the recce card; no weather) | ? | N | Y | N | N |
| Send by email or SMS with RSVP tracking | N (print, PDF, WhatsApp text) | ? | N | Y | N | N |
| Contacts directory | Y | ? | N | Y | N | N |
| Phone-first shoot-day view, offline | Y | N | N | P (mobile-friendly web) | N | N |
| Production report (DPR) | Y | ? | N | ? | N | ? |

### Post and delivery

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Edit log from the shoot | Y | N | N | N | N | N |
| Deliverables and festival checklist | Y | N | N | N | N | N |
| Certification hint (CBFC) | Y (a hint, not advice) | N | N | N | N | N |

### Collaboration, platforms, formats and AI

| Feature | FilmMakerStudio | Celtx | Final Draft 13 | StudioBinder | WD / Arc / FI | Movie Magic |
|---|---|---|---|---|---|---|
| Real-time co-writing | P (merge by element id behind §49, presence warning; live two-account checks not run) | Y | Y | Y (third-party claim) | Y (WD, Arc); P (FI turn-based) | N |
| Comments and sharing | P (u) | ? | Y | Y | Y | ? |
| Read-only screening room | Y | ? | N | ? | Y (Arc feedback links) | N |
| Works offline | Y | N | Y (desktop); N (Go) | N | Y (FI); ? (others) | Y (desktop) |
| Native mobile app | P (PWA) | P | Y (Go, iOS) | P (web) | Y | N |
| Import .fdx, Fountain, PDF, Word | Y (text PDFs only) | Y | P (Word import is a complaint) | Y | Y (FI) | P (.fdx) |
| Export .fdx, Fountain, PDF, Word | Y | P (sources disagree) | Y | P (PDF) | Y (FI); ? (others) | ? |
| AI assistance | Y (u, bring your own key, Pro) | N (none found) | N (none found; Go has Grammarly) | ? (one unconfirmed mention) | ? | N (Saturation markets AI budgeting) |

---

## 3. Where we already lead

These are claims to make, each true of the repo today. Check the competitor
side again before printing any of them as "only us".

- **Breadth, one film model.** Story → script → breakdown → stripboard → budget
  → call sheet → shoot → edit → deliverables, all reading `scenes.js`. No
  researched competitor covers both story development and post.
- **Local-first and offline.** The work is in the user's browser, and an
  optional sync sits on top. The PWA and the shoot-day pack work with no
  signal. Final Draft Go needs a steady connection
  ([kb.finaldraft.com](https://kb.finaldraft.com/hc/en-us/articles/15893547109908-Do-I-need-to-be-online-when-I-use-FD-Go)).
  StudioBinder has no offline app
  ([Fitgap](https://us.fitgap.com/products/studiobinder)). Celtx needs a login
  ([Spotsaas](https://www.spotsaas.com/blog/celtx-software-master-art-of-scriptwriting)).
- **Tamil and Tanglish.** The screenplay font stack carries Tamil, and the app
  has a Tanglish helper and a Tamil/English film library. Nothing comparable
  was found elsewhere.
- **Indian production reality.** Chennai rate bands carry checked dates and are
  never inflated. The app also has the FEFSI wage table, GST, TDS and GSTIN
  lines, CBFC material, Batta, UPI labels and WhatsApp call-sheet text.
- **AI that cannot overwrite work.** About forty Desk tasks, from logline to
  shoot order to cert read. Nothing is written before Accept, blanks are filled
  first, and every apply has an exact undo. None of it has been run against a
  real provider yet, so demo it with that said.
- **Script lock that drives everything.** A held lock queues adds and omits in
  a change report, and extraction at lock seeds cast, recce cards, call sheets
  and budget lines. StudioBinder keeps scene numbers on re-import. Nothing
  found matches the full extraction.
- **Post and delivery.** The Edit log reads the set's marks, and the
  Deliverables catalogue includes festival formats.
- **Blocking studio.** It has a floor plan per scene, one diagram per shot and
  the 180° line. No competitor source mentions blocking.
- **Price.** See section 5.

---

## 4. Gaps, ranked for the next phases

**Key**
- **Impact** is the expected effect on sales to production companies: H, M or L.
- **Effort** is the build size: S (days), M (one to three weeks) or L (a month
  or more).

Rank 0 is not a feature. It is the set of live proofs a buyer will ask about
first.

| Rank | Gap | Who has it | Impact | Effort | Dependencies and notes |
|---|---|---|---|---|---|
| 0 | Run the live proofs: a two-account RLS check, a live Razorpay payment and refund, the receipt e-mail, every AI family against a real key, Drive-only storage (§66 plus `google-token`), the tour (§66) | (trust) | H | S–M | Owner steps. `RESEND_API_KEY` and `MAIL_FROM` must be set before any real payment. `docs/SECURITY-RLS.md` lists the two-account checks. No code needed unless a check fails. |
| 1 | Real-time co-writing: live cursors, a character-level merge, chat | WriterDuet, Arc, Final Draft, Celtx | H | L | Needs a server: a Realtime channel carrying operations (CRDT or OT), and conflict-free storage beyond last-write-wins blobs. Builds on §48 presence and §49 merge. It touches the storage contract, so it needs a migration plan. |
| 2 | Call-sheet delivery: email or SMS, RSVP and view tracking, reminders | StudioBinder, Yamdu | H | M | Needs a mail and SMS provider (Resend is already wired for receipts) and an edge function plus a table for confirmations. The SMS cost per message needs pricing. |
| 3 | Weather on the call sheet, plus a map link and nearest hospital on the sheet itself | StudioBinder, Yamdu | M | S–M | A weather API (`connect-src` in both host configs). Hospital and police already exist on the recce card, so they only need showing on the sheet. |
| 4 | TV and episodic templates: teaser, acts, episode numbering | Final Draft, Celtx | M–H | M | The act element type exists (2 Nov). It needs a project format and a title-page variant. New element types are appended last in `script.js`. |
| 5 | Budget fringes and globals: union fringe tables, percentages, a globals sheet | Movie Magic Budgeting, Saturation | M (higher for larger productions) | M | Fields inside the existing budget blob, no new key. FEFSI rates need sourcing (CLAUDE.md row 7: no union floor exists today). |
| 6 | Schedule conflict flags: actor availability and location windows | MMS (Red Flag Manager) | M | M | Builds on `readiness.js` (derived, stores nothing) and contact availability fields. |
| 7 | Native mobile app, or store-listed PWA wrappers | Final Draft Go, Fade In, Arc, Yamdu | M | M–L | A TWA or Capacitor wrapper of the PWA first. Touch drag on scenes is mouse-only today. |
| 8 | Writing stats: streaks and peak writing times | Final Draft 13 | L–M | S | Derive from writing goals. Must not write during idle (the verify idle-write check). |
| 9 | Night theme for the whole studio | Final Draft (Midnight Mode) | L–M | M | Reverses the one-palette rule (owner decision, 28 Oct). It needs a second token block and the AA walk across every theme. |
| 10 | Custom dictionary and autocorrect | Final Draft | L | S–M | The "check names" tool covers cast names today. |
| 11 | Storyboard drawing tools | (asked for by StudioBinder reviewers; not found in any competitor) | L–M | L | Canvas drawing. Upload-only is the norm in this market. |
| 12 | Expense capture and bill pay | Saturation | L | L | Payment rails. Out of scope for India first. |
| 13 | Scanned-PDF import (OCR) | none (Celtx also needs OCR first) | L | M | The refusal is deliberate (CLAUDE.md row 4). Keep it unless buyers ask. |

**Known parity holes to fix as bugs, not features.** These are from
`docs/FINAL-DRAFT-PARITY.md`, 2 Nov:
- The AI pages, the read-as view and the format rules do not know the new
  element types (centered, lyrics, act).
- Bookmarks are not carried into revision snapshots.
- Undo does not own changes made by an AI apply, scene sync or lock seeding.
- Split view rebuilds its second pane after structural edits.
- The `.docx` round trip for the new element types is untested.

**Suggested phases**
- **Phase 1, trust:** rank 0 and the parity holes.
- **Phase 2, production sell:** ranks 2, 3 and 4, then 6.
- **Phase 3, team sell:** rank 1 and rank 5.
- **Later:** ranks 7 to 13.

---

## 5. Pricing comparison

**Our prices, read from the repo.** All plans are yearly, 365 days, and a
renewal is buying again (§52).

| Plan | INR today (founding) | INR after the rise | USD display (checkout off) |
|---|---|---|---|
| Basic | ₹599 / yr | ₹999 / yr | $19 → $29 / yr |
| Intermediate | ₹799 / yr | ₹1,499 / yr | $29 → $39 / yr |
| Pro | ₹999 / yr | ₹1,999 / yr | $39 → $49 / yr |

- The rupee figures are `price_notice()` as read live on 9 Oct 2026.
- The rise date was 31 Oct 2026 18:29Z, and `LIVE-STEPS-2026-10-26` moves it to
  31 Dec. **Read `price_notice()` live before quoting either figure.**
- The USD figures are the §31 seed (`plan_prices`). They are display figures:
  `admin_set_usd_checkout` is off, and the console can change them.
- A paid launch pass also exists. Its price and length are server-owned and
  never typed into a page.

**Competitors.** Every figure is approximate and taken from secondary sources.
Verify before quoting.

| Product | Model | Approximate price | Source |
|---|---|---|---|
| Celtx | Subscription. Free tier (1 project, 1 seat); Writer, Writer Pro, Team; Enterprise custom | $10–15 per user per month at entry (sources conflict); Studio tier about $20 per month | [Capterra](https://www.capterra.com/p/235136/Celtx/), [Software Advice](https://www.softwareadvice.com/project-management/celtx-profile/), [subscribed.fyi](https://subscribed.fyi/?p=66308), [fitgap](https://us.fitgap.com/products/018098/celtx) |
| Final Draft 13 | One-time, 2 computers | $199.99 (list $249.99); upgrade $79.99–$99 | [Final Draft store](https://www.finaldraft.com/store), [fitgap](https://us.fitgap.com/products/018065/final-draft), [Videomaker](https://www.videomaker.com/news/final-draft-13-gets-major-update/) |
| Final Draft Go | Subscription (iOS) | $1.99 per month or $9.99 per year | [Final Draft Go](https://www.finaldraft.com/products/final-draft-iphone-ipad/) |
| StudioBinder | Subscription with seats | Indie about $85–99 per month (4 seats); Professional about $127–149 per month (6 seats); Studio custom or about $340–399 | [Fitgap](https://us.fitgap.com/products/018094/studiobinder), [SaaSworthy](https://www.saasworthy.com/product/studiobinder/pricing) |
| WriterDuet | Freemium | Free (about 3 projects); Plus $9.99 per month; Pro $11.99 per month ($107.88 per year), $19.99 in one listing | [FitGap](https://us.fitgap.com/products/writerduet), [Find AI List](https://www.findailist.com/tools/writerduet) |
| Arc Studio Pro | Freemium (exports watermarked) | Essentials $69 per year; Pro about $79–99 per year | [SpotSaaS](https://www.spotsaas.com/product/arc-studio-pro/pricing), [Tekpon](https://tekpon.com/reviews/arc-studio/) |
| Fade In | One-time | Desktop about $79.95 (or $99.95 list); mobile about $4.95 | [Techjockey](https://www.techjockey.com/detail/fade-in), [Linux Journal](https://www.linuxjournal.com/node/1032445) |
| Movie Magic Budgeting | Subscription per seat | About $42.99 per month or $299.88 per year | [Saturation (a competitor)](https://saturation.io/blog/is-movie-magic-budgeting-free), [EP store](https://www.ep.com/ep-store/movie-magic-budgeting-monthly/) |
| Movie Magic Scheduling | Subscription | No current figure found; MMS6 was a one-time $489 (dated) | [EP store](https://www.ep.com/ep-store/movie-magic-scheduling-monthly/) |
| Gorilla Scheduling | Subscription | About $34.99 per month (sources conflict) | [Capterra](https://www.capterra.com/p/10050235/Gorilla-Scheduling/) |
| Yamdu | Subscription | About €39 per month (Flex) to €179 per month (Core) | [GetApp](https://www.getapp.com/marketing-software/a/yamdu/), [Shade](https://shade.inc/blog/yamdu-for-post-production) |
| Saturation | Freemium, budgeting only | Free Creator; Pro $32 per month annual or $40 monthly | [Saturation](https://saturation.io/blog/best-film-budgeting-software) |

**What this means for selling.**
- Our whole-studio Pro year, at $39–49 display or ₹999–1,999, costs less than
  one month of StudioBinder Indie. It also costs less than a Final Draft
  upgrade, and Final Draft is a writing tool only.
- The weakness is seats. StudioBinder and Yamdu price for a team, while our
  plans are priced per account, with seats following the plan (§50).
- A production company will ask what a 10-person crew costs. Have that answer
  ready before the sales call. It is a pricing decision, not a build.

---

## Other sources

These come from the research inventories and support statements above:
- [G2: Celtx](https://www.g2.com/products/celtx/reviews)
- [Capterra: Celtx reviews](https://www.capterra.com/p/235136/Celtx/reviews/)
- [Celtx support: Import a Script](https://support.celtx.com/hc/en-us/articles/215946588-Import-a-Script)
- [glcoverage: Celtx](https://glcoverage.com/screenwriting-software-celtx/)
- [Final Draft quick start](https://www.finaldraft.com/learn/final-draft-quick-start/)
- [Final Draft 13 blog](https://www.finaldraft.com/blog/final-draft-13-is-here)
- [App Store: Final Draft 13](https://apps.apple.com/ec/app/final-draft-13/id6450966627)
- [G2: Final Draft](https://www.g2.com/products/final-draft/reviews)
- [StudioBinder call sheet app](https://www.studiobinder.com/call-sheet-app/)
- [StudioBinder production scheduling](https://www.studiobinder.com/blog/production-scheduling)
- [StudioBinder Shotlist app](https://www.studiobinder.com/shotlist-app/)
- [StudioBinder support: revised script import](https://support.studiobinder.com/en/articles/10952576-how-do-i-import-a-revised-script)
- [Capterra: WriterDuet](https://www.capterra.com/p/210780/WriterDuet/)
- [Capterra UK: Arc Studio](https://www.capterra.co.uk/software/1011901/arc-studio)
- [StoryFlow: Fade In alternatives](https://storyflow.so/blog/best-fade-in-alternatives-2026)
- [EP: Movie Magic Scheduling](https://www.ep.com/movie-magic-scheduling/)
- [EP: New Movie Magic Scheduling](https://www.ep.com/industry-news/new-movie-magic-scheduling-the-most-trusted-film-tv-scheduling-tool%E2%80%93reimagined/)
- [Storiara: production management software](https://storiara.com/blog/top-10-film-production-management-software)
