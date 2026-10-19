# Part 01 — Entry, purchase and account-edge screens

Source: worktree `.claude/worktrees/admin-fixes` (read-only). Screens: Landing, Invite/doorway, Purchase (+ purchases stub), Screening room, Extension side panel, Legal (privacy, terms, refund), 404.

**Shared tokens, so each screen below can stay short.** Dark ink theme is default: ground ~`#120f1c`, card `--sk-card-bg` ~`#1b1727`, accent/brand violet ~`#9575f8`, primary button fill `--cta-fill` (violet) with `--brand-on` label, pill buttons (`--sk-btn-radius`), card radius `--sk-radius` 16px, hairline 1px card borders, Catamaran body/display (weights 400–800), JetBrains Mono for eyebrows/labels (uppercase, letter-spaced). A light theme ("paper", lavender-tinted page, white cards) exists and follows the reader's choice or the OS. Spacing scale `--s1…--s9`; page gutter `--gutter`. Reduced motion is honoured everywhere.

**Two page families.**
- *Landing family* (`start.html`): own sticky glass header `.st-top`, no app shell, words in markup.
- *App-shell family* (`invite.html`, `purchase.html`): the studio's `.sh-bar` band at the top (brand plate + breadcrumb "Studio · <page>" + toolbar with sign-in pill / Appearance menu), then `main#main` with a `.bd-head` header (mono eyebrow, h1 `.bd-title`, deck paragraph) and a single column body of `.st-sec` sections, each = eyebrow + `h2.bd-h2` + `p.bd-sub` + controls. Body measure `--measure-wide`, horizontal padding `--s5` (24px) at desk, `--s4` (16px) below 720px. Below 720px the band collapses to breadcrumb only and a bottom bar (Home · Go to · Search · Tools) appears.

---

## Landing page (file `start.html`)

**Purpose** The public entry and purchase page: one promise, plans, the free trial, proof, FAQ, e-mail capture, Google sign-in.
**Who sees it / when** Every signed-out visitor (it is outside the site gate and is where the gate sends strangers). Signed-in visitors also may open it (buttons change). Theme: reads `fms_studio_theme_v1` raw, else OS.
**Data source** All words are static markup, stamped at build from `src/lib/plans.js` (names Basic / Intermediate / Pro, list prices ₹599 / ₹799 / ₹999), `src/data/plan-matrix.json` (tier lines + feature rows), `sample.dragon.json` (Dragon figures), `short/feature steps`, `studies.count`, `glossary.count`. Runtime (plain fetch, no SDK): anon RPCs `trial_offer()` (trial on/off + length), `price_notice()` (scheduled price rise, seats), `purchases_required()`; `bump_event()` counters; `addLead` (e-mail capture); `testimonials.json` (empty, so Voices stays hidden). Storage read: Supabase session shape (signed-in detection), `fms_studio_theme_v1`. Session storage: `fms_invite_plan` (plan chosen, survives Google hop), the sign-in error key. Invite code arriving as `start.html#code=XXXX-XXXX` is held (`fms_invite_code_v1`) and stripped from the URL.

**Layout** (top to bottom)
1. **Sticky glass header `.st-top`** (z 20, blur glass, 1px bottom hairline). One row: brand name (left, 800 weight, ellipsis), `nav.st-nav` (hidden below 720px; links Plans · What you get · Samples · FAQ), primary small pill button (44px high) at right.
2. **Invite band `aside.st-invite#inviteBand`** — hidden unless arrived with a code. Card with eyebrow, h2, two lines, mono code.
3. **Hero `section.st-hero`** — 1280px: 2 columns 6fr / 5fr, vertically centred, soft violet radial glow ("aurora") behind headline, padding top s5. Left copy column; right figure `st-shot-hero` (1280×800 screenshot `shots/hub.webp`, tilt + slow parallax). 390px: single column, **screenshot is hidden** (display none below 720px) so plans are close.
4. **Plans `section#pricing.st-plans`** — eyebrow (gold-style), h2, lede, hidden price-rise note, then `ul.st-tiers`: 1280px = 3 columns (trial strip spans the full row above them as a horizontal strip: text left, button right); 390px = 1 column stack (trial card first, then Basic, Intermediate, Pro). Below: "Compare every feature" disclosure (full-width table, fixed layout, first column 46% desk / 36% phone), comparison sentence, small note.
5. **What you get `#features`** — eyebrow, h2, lede, 3-column grid of 6 cards (desk; auto-fit 15rem at 560–999px; 1 col below), then a full-width screenshot figure (stripboard) with caption.
6. **Everything it does `#everything`** — eyebrow, h2, lede, 3-col grid of 6 stage cards each with chip + h3 + tool list (title in bold, one-liner below), then sub-heading "And across the whole film" and another 3-col grid of 6 cards, then CTA row.
7. **Proof `#proof`** — eyebrow, h2, 2-col grid of sample-film cards, note, 16:9 video figure with poster, 4-col facts grid (numbers count up on scroll; prices never count).
8. **Voices `#voices`** — hidden (empty data). Would hold testimonial blockquotes and film list.
9. **FAQ `#faq`** — eyebrow, h2, 7 `details` accordions (height animates; 48px summary on touch).
10. **Close `#go`** — h2, lede, CTA row, legal line.
11. **Offers `#offers.st-lead`** — h3, e-mail form (label above input + button on one row at desk, stacked on phone), consent checkbox row, status line, tracking note with "Don't count this visit" text-button.
12. **Footer `.st-foot`** — © brand left; "Legal" label + 3 links right.
13. **Thumb rail `#startBar`** (fixed bottom, glass) — phone only (≤720px), appears after the hero scrolls out of view and hides while the plans section is on screen; one full-width primary button; height measured into `--st-bar-h`.
Sections use scroll-reveal fade (JS-added only; content visible without JS). Fragment jumps land under the sticky header (`--st-top-h` measured).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour on click/type | Variants/states |
|---|---|---|---|---|---|
| Header | Brand | link | `{brand name}` (FilmMakerStudio) | `#top` | — |
| Header | Nav | 4 links | `Plans` `What you get` `Samples` `FAQ` | anchors `#pricing #features #proof #faq` | hidden <720px |
| Header | Sign-in | primary pill, small | narrow (<560px): `Sign in`; wide: `Continue with Google` | no JS → `invite.html`; with a Supabase project → Google OAuth, status in `#authMsg` | Signed in: `Open the studio`, href `/` |
| Invite band | Eyebrow / h2 | text | `Your invite` / `You arrived with an invite code.` | — | shown only with `#code=` |
| Invite band | Body | text | `It is held in this browser and is worth a seven-day run of the whole studio, for your own films. Sign in to claim it — the code is spent against your account, not against this device.` | — | — |
| Invite band | Code | mono | formatted code, e.g. `K7QM-4TZP-82WD` | — | — |
| Hero | Eyebrow | text | `The film studio in your browser` | shimmer | — |
| Hero | H1 | heading | `Make your first film. Pay once.` | words animate in | — |
| Hero | Hook | paragraph | `Story → Screenplay → Pre-Production → Production → Post-Production, in one studio that teaches every step as you do it. No subscription — one payment, yours for good.` | — | — |
| Hero | Primary CTA `#ctaOpen` | primary pill (shine loop, glow) | `Start your free trial` | Google sign-in (`bumpEvent('signup')`, "Taking you to Google…") | Signed in: `Open the studio`; purchases OFF: `Sign in` |
| Hero | Secondary CTA | outlined pill | `See the plans` | `#pricing` | — |
| Hero | Trust list | 3 bullets | `No card for the trial` · `Your work stays in your browser` · `Sign in with Google` | — | purchases OFF: first becomes `No card needed` |
| Hero | Legal line | small | `Signing in means you accept the Terms of Service and the Privacy Policy.` | links to terms.html, privacy.html | — |
| Hero | Status `#authMsg` | live region | empty; `Taking you to Google…`; `Sign-in did not complete. {reason}`; `Could not open the Google sign-in just now. Try again, or use the invite page.` | — | error variant red-tinted |
| Hero | Screenshot | image | alt `The studio's home screen with the Dragon sample film open, showing where you left off.` | — | hidden <720px |
| Plans | Eyebrow / h2 | text | `Plans` / `One payment. Yours for good.` | — | — |
| Plans | Lede | text | `Pick the stage you need. Every plan is bought once, never renews and never lapses. Not sure yet? A free trial of the whole studio sits under the plans.` | — | purchases OFF: `Pick the stage you need. Every plan is bought once, never renews and never lapses.` |
| Plans | Launch-price note `#offer` | bordered note | eyebrow `Launch price`, h3 `The price goes up, and the date is already set.`, line (runtime) e.g. `₹799 today. ₹1,499 from 31 October — or once 100 people have joined, whichever comes first.`, chips `1 of 100 taken` and `18d 6h left`, fine print `Nothing here resets. The rise is scheduled on the server and fires by itself, so reloading this page shows you less time, never more.` | countdown updates per minute | **Hidden** unless `price_notice()` reports a real scheduled rise AND purchases are required |
| Plans | Trial strip `li[data-trial]` | card-strip | bold `Not sure yet? Try it free`; text `Every module, on the Dragon and The Dark Knight sample films, for {30 minutes | a limited time}. No card. Then keep the plan that fits.`; button `Start the free trial` | Google sign-in | Hidden when trials off or purchases off; length filled from `trial_offer()` (e.g. `30 minutes`, `2 hours`, `7 days`); signed in: button `Open the studio` |
| Plans | Plan card ×3 | card | name, one-line, price, `one payment`, feature list, Buy button, alt link | see below | Intermediate is "picked" |
| Plans | Compare disclosure | `details` | summary `Compare every feature` | opens table | — |
| Plans | Compare sentence / note | text | `Subscription tools charge every month for as long as you keep making films. Here you pay once and the desk is yours.` / `One-time list prices in Indian rupees, paid through Razorpay and confirmed at checkout. Move up a plan later by paying the difference. The learning library and your local work are on every plan.` | — | — |
| Features | 6 cards | chip + h3 + p | see Lists & tables | spotlight on hover | — |
| Features | Figure | image + caption | `The stripboard of the Dragon sample: scenes laid into shoot days, straight from the script.` | — | lazy |
| Everything | CTA row | primary + outlined | `Start your free trial` / `See the plans` | as above | — |
| Proof | Video | `video` controls | caption `The tour in 90 seconds: a screen recording, no narration, of the Dragon sample — the story, the script, the breakdown, the schedule, the call sheets and the dashboard.`; fallback `This browser cannot play the walkthrough. The same film is in the sample once you are in.` | preload none, poster `media/demo-poster.webp` | — |
| FAQ | 7 accordions | `details` | see Lists & tables | smooth height | — |
| Close | h2 / lede | text | `Your first film starts tonight.` / `Open the samples, try every module, then keep the plan that fits. One payment, yours for good.` | — | — |
| Close | CTAs + legal line | as hero | `Start your free trial` / `See the plans` | — | — |
| Offers | h3 | text | `Not ready yet? Get offers and new steps by e-mail` | — | — |
| Offers | E-mail | input type=email | label `E-mail` (no placeholder), max 254 | validated on submit | — |
| Offers | Submit | outlined pill | `Send me offers` | adds lead, disables while saving | — |
| Offers | Consent | checkbox + label | `I agree that {brand} may e-mail me about offers and new steps at this address. I can withdraw this at any time — see the Privacy Policy for how.` | required | — |
| Offers | Status `#leadMsg` | live | `Saving…` · `Thank you. You are on the list.` · errors below | — | red on error |
| Offers | Tracking line | text + link-button | `This page counts visits in aggregate (a number per day, nothing about you) and honours Do Not Track.` button `Don't count this visit` | opt out → button text `This visit is not counted`, disabled | — |
| Footer | Links | 3 | `Privacy Policy` `Terms of Service` `Refunds` | — | label `Legal` |
| Thumb rail | Button | primary pill | `Start your free trial` | Google sign-in | Signed in: `Open the studio`; purchases OFF: `Sign in` |

Plan card anatomy (`li[data-tier]`): name (display, large) · tier line (`Write the film.` / `Prepare it.` / `Shoot it and finish it: everything.`) · price (bold, large; `₹599` / `₹799` / `₹999`; a scheduled rise appends a small `₹1,499 from 31 October`) · `one payment` · bullet list · primary button · text link `or start the free trial first` (alt link, same Google sign-in; signed in: `or open the studio`; hidden when trial off). Intermediate card carries flag `Recommended for a first film` and an even violet 2–3px border with glow. Buy button label `Buy {Plan}` → `purchase.html?plan=<id>`; signed out and Supabase configured it first stashes the plan and goes to Google; purchases OFF: label `Sign in`.

**Lists & tables**
- **Plan cards (stamped):**
  - Basic ₹599 — `Write the film.` bullets: Screenplay Writer · Beats & Pacing · Drafts · Import Screenplay · PDF exports · Case Studies · `+ 9 more in the comparison`.
  - Intermediate ₹799 (recommended) — `Prepare it.` bullets: `Everything in Basic` · Scene Breakdown · Stripboard · Budget · Locations · Storyboard · Google Drive backup · `+ N more in the comparison` (N is derived from the matrix).
  - Pro ₹999 — `Shoot it and finish it: everything.` bullets: `Everything in Intermediate` · Shoot Day · Call Sheets · Edit Log · Deliverables · AI tools (your own key) · Remove branding.
- **Comparison table** columns: `What you get` | Basic | Intermediate | Pro; rows grouped by the plan that first adds them, each cell ✓ ("Included") or — ("Not included"). Example rows: `New projects | ✓ ✓ ✓`, `Google Drive backup | — ✓ ✓`, `Shoot Day | — — ✓`, `AI tools (your own key) | — — ✓`.
- **What you get cards (chip → h3 → p):** `Story` From an idea to a story that holds · `Screenplay` A screenplay that formats itself · `Pre-Production` Breakdown, stripboard and budget · `Production` The day on your phone · `Post` What is in the can, and what leaves · `Made here` Built for a first film in Tamil Nadu. Body copy as in the markup (e.g. Story: "Logline, character, conflict and beats, one step at a time — each with the formula, a worked example and a check that it is done.").
- **Everything it does** (6 stage cards, chip → h3 → bold tool name + one line): `1 · Story` "Find the film" (Guided story path, Beats & Pacing, Idea Vault, Pitch Deck); `2 · Screenplay` "Write it properly" (Screenplay Writer, Drafts, Title Page, Import Screenplay); `3 · Pre-Production, the script` "Understand what you wrote" (Screenplay Analysis, Scene List, Screen Time, Cast Matrix, Auto-Tag, Scene Breakdown & Elements); `3 · Pre-Production, the look` "See it before you shoot it" (Shot List, Storyboard, Blocking, Scene Board, Lookbook, Reference Media, Songs, Locations); `3 · Pre-Production, the plan` "Schedule it and cost it" (Shoot Calendar, Stripboard, Day Out of Days, Sides, Budget, Schedule Impact, Budget Versions, Cast & Crew, Production Reports); `4 · Production & 5 · Post` "Shoot it and finish it" (Shoot Day, Call Sheets, Edit Log, Cut Versions, Deliverables, Cloud Workflow). Then 6 cross-cutting cards: Learn · AI Desk · Your work · Anywhere · Share · Made here.
- **Proof:** sample cards `Dragon (2025)` — "A full {n}-scene screenplay of {n} pages, broken down into {n} shoot days across {n} locations, a {n}-person unit, a budget and {word} call sheets." and `The Dark Knight (2008)` — "The same desk, worked through as a Chennai production priced in rupees — so you can see a much larger film laid out stage by stage." Note: "Both are reconstructions for teaching. …invented for the demonstration and says so wherever it appears." Facts row (big number + caption): `guided steps to a finished short` · `steps in the feature blueprint` · `Tamil films taken apart, beat by beat` · `craft terms in plain words`.
- **FAQ questions:** `What do I get in the free trial?` (signed-in/off variant: `What do I get when I sign in?`) · `Which plan is right for me?` · `Is it really one payment? No subscription?` · `I have never made a film. Is this actually for me?` · `Can I write in Tamil?` · `Where is my data, and who can read it?` · `What if I want my money back?`

**States**
- *Loading:* page is fully readable instantly; runtime-only parts (trial length, price rise, purchases flag) fill in late. Trial length reads `a limited time` until the server answers.
- *Empty:* Voices section hidden (no consented testimonials); price-rise note hidden.
- *Error:* sign-in failure line in `#authMsg` (see Elements); lead form `Please enter a valid e-mail address.` / `Please tick the box to say you agree.` / server message.
- *Signed out (default):* CTAs say Start your free trial / Continue with Google. *Signed in:* every Google CTA becomes `Open the studio` (to `/`); Buy buttons go straight to `purchase.html?plan=…` and read `Buy {Plan}`; FAQ #1 swaps.
- *Trial running:* no distinct variant on this page.
- *Purchases OFF (server says `purchases_required()` false):* plans remain; trial strip and per-card "or start the free trial first" hide; hero CTA `Sign in`; trust bullet `No card needed`; lede shortened; FAQ #1 `What do I get when I sign in?` with answer "Sign in with Google and every module in the studio is open, with the Dragon and The Dark Knight sample films to look at — nothing to install. Your work is saved in your browser, and you can choose a plan whenever you like."; price-rise band never drawn. *Purchases ON:* as default.
- *Trials off:* trial strip and alt links hide.

**Dialogs & overlays** None. Transient: invite band; thumb rail; price-rise note.

**Sample data** Invite band code `K7QM-4TZP-82WD`; price-rise line `₹799 today. ₹1,499 from 31 October — or once 100 people have joined, whichever comes first.` with chips `1 of 100 taken`, `18d 6h left`; trial length `30 minutes`; lead e-mail `anita.r@example.com`; Dragon figures illustrative `62 scenes · 118 pages · 24 shoot days · 14 locations · 38-person unit`.

**Mobile (390px)** Header shows brand + `Sign in` (short label) only; nav hidden. Hero single column, screenshot removed, CTAs full-width stacked (48px), trust list stacked. Trial card first then plan cards in one column; comparison table shrinks to three equal columns, first column 36%, small header type. Grids 1 column. Lead form stacks. Fixed thumb rail with one full-width primary button appears after the hero and disappears over the plans.

**Stitch prompt**
Design a dark violet landing and pricing page for "FilmMakerStudio", a browser filmmaking toolkit. Ground #120f1c, cards #1b1727 with 1px hairline borders and 16px radius, accent #9575f8, pill buttons, Catamaran type with mono uppercase eyebrows. Sections: sticky glass header (brand left, links Plans / What you get / Samples / FAQ, small violet pill "Continue with Google"); hero in two columns — eyebrow, H1 "Make your first film. Pay once.", hook line with five stages, primary "Start your free trial", outlined "See the plans", three trust bullets, a terms line, and a studio screenshot at right with soft violet glow. Plans: full-width trial strip ("Not sure yet? Try it free" + button), then three cards Basic ₹599, Intermediate ₹799 (violet border, flag "Recommended for a first film"), Pro ₹999, each with tier line, "one payment", bullet list, Buy button, text link; collapsible comparison table with ticks. Then six feature cards, six stage tool-list cards, two sample-film cards, video with poster, four big stats, FAQ accordions, closing CTA, e-mail offers form with consent checkbox, footer. Mobile: single column and a fixed bottom CTA bar.

---

## Invite / doorway (file `invite.html`)

**Purpose** "Come in." The offer page: where a closed site gate lands anybody not yet through. Trial first, plans second, invite-code box third; request-an-invite only behind `#request`.
**Who sees it / when** Anyone refused by the site gate (signed out → they usually hit `start.html` first; every other refusal lands here), a fresh Google sign-in that is not a member, a lapsed trial, a code link (`invite.html#code=…`), and a demo link (`…&demo=1`, anonymous landing). It is exempt from the gate and never blocks local work.
**Data source** `window.StudioCloud` (session, gate state, user e-mail), `Billing.status()` (billing_status: `trial_enabled`, `trial_used`, `trial_active`, `trial_minutes`, `entitled`, `granted`, `payments`), anon `trial_offer()` and `purchases_required()`, `LIST_PRICE` + lazy `plan-matrix.json` lines (price block), `getCodePass()` (`fms_invite_code_v1`), session keys `fms_sitegate_why`, `fms_invite_view`, `fms_invite_plan`, `fms_purchases_req`, return-to page (`return-to.js`). RPCs: start_trial, verify/redeem code, request invite.

**Layout** App-shell family. Band (global mode, crumb "Studio · Come in"), then `main#main`: `.bd-head` (eyebrow `Studio · Come in`, h1 `Come in.`, deck sentence that changes by state), then `.iv-body` single column (max `--measure-wide`, gap `--sk-grid-gap`) of `section.iv-sec` blocks, each a vertical stack gap s4. Action rows are `.iv-actions` (flex wrap, gap s2). 1280px and 390px are the same single column; side padding 24px → 16px. Whole `main` is redrawn on every gate/auth/plan event (the request note textarea is preserved).

**Elements** (signed-out default; other states below)

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Head | Eyebrow / H1 | text | `Studio · Come in` / `Come in.` | — | — |
| Head | Deck | text | signed-out: `Start a free trial of the whole studio, buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.` | — | other decks in States |
| Why line | status paragraph | text | e.g. `You were sent here from dashboard.html because you are not signed in.` | — | only when the gate left a reason |
| Trial section `#trial` | eyebrow / h2 | text | `Free trial` / `Start your free trial.` | — | hidden when server says trials off |
| Trial | Body | text | `The whole studio, on the Dragon and The Dark Knight sample films, for 30 minutes. No card, nothing to install. Sign in and it begins.` (`, for N` omitted until length known) | — | — |
| Trial | Button | primary | `CONTINUE WITH GOOGLE` | Google sign-in | — |
| Trial | Legal | small | `By continuing you agree to the Terms of Service and the Privacy Policy.` | links | — |
| Buy `#buy` | eyebrow / h2 / deck | text | `Or` / `Buy a plan and come straight in.` / `One payment, access for good — no trial first if you already know you want it.` | — | — |
| Buy | Price block | list | 3 rows: bold name, price, one-line (e.g. `Basic` `₹599` `Write the film.`); `aria-label="Plans and prices"` | — | line arrives lazily |
| Buy | Note | small | `One payment each, in Indian rupees, confirmed at checkout. Nothing renews. Each plan includes everything in the one before it.` | — | — |
| Buy | Buttons | primary + outlined | `SEE PLANS AND BUY` → `purchase.html`; `COMPARE EVERY FEATURE` → `start.html#pricing` | — | — |
| Code `#invite` | eyebrow / h2 / deck | text | `With a code` / `Have an invite code?` / `Enter the code you were given and sign in with Google in one go: the code is spent on your account, and the trial it carries starts there.` | — | signed in: eyebrow `Invite`, deck `If somebody handed you a code, enter it and you are through, with the free trial it carries.` |
| Code | Label / input | text input | label `Invite or screening pass code`; placeholder `XXXX-XXXX-XXXX`; mono, uppercase, auto-formats; hint `Spaces and dashes are ignored. A screening pass opens the screening room instead.` | — | prefilled from `#code=` link |
| Code | Submit | primary | `CONTINUE WITH GOOGLE` (signed in: `REDEEM CODE`; busy: `CHECKING…`) | holds code then Google; a screening pass goes to `screening.html?pass=…` | — |
| Code | Error | alert | `Enter the code you were given. With no code, sign in with Google and choose a plan or a free trial.` (signed in: `Enter the code you were given, or choose a plan or the free trial above.`) | — | server errors verbatim |
| Code | Link | text link | `What is this? About FilmMakerStudio →` → `start.html` | — | — |
| Request `#request` | eyebrow / h2 | text | `Or` / `Ask for an invite.` | — | only for signed-in non-members when `#request`, an existing request, or backend not deployed |
| Request | Block | form | see Lists & tables | — | — |
| Meanwhile | h2 etc. | text | `Meanwhile` / `Your work is safe.` / `Anything already saved on this device stays exactly as it is. Once you are in, everything opens again and sync starts by itself.` | — | signed-in closed only |
| Meanwhile | Buttons | pills | `TRY AGAIN` (primary, only if the check could not be made) · `SIGN OUT` · `ABOUT THE STUDIO` → `start.html` | retry re-runs the gate (`CHECKING…`) | — |

**Lists & tables** *Request block (`.ir`)*: mono label `What the administrator will see`; definition list `Name` `Asha Venkat` / `Google account` `asha.v@example.com` / `Asked from` `Chrome on macOS`; meta `These details come from your Google sign-in.`; label `A line for them (optional)`; textarea (3 rows, 1000 max) placeholder `Who you are, which film this is for, who told you about the studio.`; primary `REQUEST AN INVITE` (declined: `ASK AGAIN`; busy `SENDING…`). Status variants: `Requested · 14 Oct 2026, 10:42` + `An administrator will see this request the next time they open the console. Once it is approved you are through on your next visit — nothing else to do. Until then, everything you write is saved on this device as usual.` + `CHECK AGAIN`; `Declined · {date}` + italic quote of the administrator's note + `You can ask again from {date+7d}. Your work on this device is unaffected.`; unreachable: `The studio could not be reached to check your invite. Sync is paused until it can; everything you write stays on this device meanwhile.` + `TRY AGAIN`; not deployed: `Invites are not open yet, so there is nothing to request right now. Please check back soon — your work on this device is safe meanwhile.` + `CHECK AGAIN`; disabled account: `This account was disabled by an administrator, so it no longer syncs. Nothing on this device has been touched. If you think that is a mistake, ask them to re-enable it — approving a new request below does that.`

**States** (by who is looking; each replaces the body)
- *Cloud not configured:* section `Local only` / `Nothing to redeem.` / `Cloud sync is not available right now. Your work lives in this browser; you can back it up from Settings.` Deck: `Invites are not available right now. Everything you write is saved in this browser.`
- *Signed out, holding a code (from link/box):* deck `This browser is holding an invite code. Sign in with Google to spend it on your account and start the trial it carries.`; section `Your code` / `Sign in to spend your code.` / `Code {XXXX-XXXX-XXXX} is held in this browser. Sign in with Google and it is redeemed on your account, with the free trial it carries. Nothing on this device changes.`; buttons `CONTINUE WITH GOOGLE`, `FORGET THIS CODE`; legal line.
- *Demo pass:* section `Through` / `You're in, with a code.` / `Code … opened this browser. Your work is saved here; an account would back it up and let you pick it up elsewhere.` Buttons `GO TO THE STUDIO`, `SIGN IN WITH GOOGLE`, `FORGET THIS CODE`.
- *Signed out, trials off:* deck `Buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.`; trial section absent.
- *Checking:* `One moment` / `Checking your invite…` / `Checking the invite for {email}.`
- *Signed in, closed (new signup lands here):* deck `Start a free trial, buy a plan, or enter the code you were given. Everything on this device is still here, exactly as you left it.` Sections: Trial (if offered: h2 `Start your free trial.`, body `Open the Dragon and The Dark Knight samples — two whole films, each with its script, its breakdown, its schedule and its call sheets — and read them from the inside, for 30 minutes. No card, nothing to fill in.`, primary `START MY 30 MINUTES`, live status line); Buy (`Or` / `Buy a plan and come straight in.` / `One payment, access for good — and the only thing that keeps the studio open once a trial has run out.` + price block + outlined `SEE PLANS AND BUY`); code box; optional request; Meanwhile. If no trial available: eyebrow `Plans` / h2 `Choose a plan to come in.` (after a used trial: eyebrow `Your trial` / `Your free trial is over.`) with deck `Signed in as {email}. Everything you wrote is still saved on this device, exactly as it is. One payment, access for good.` and the buy button is primary.
- *Trial start errors (status line):* `You have already had your trial on this account. A plan opens the studio for good.` · `You have already bought a plan — you should be in. Try reloading.` · `Trials are not open at the moment.` · `That did not start. Please try again.`; success `You are in. Opening the studio…` then redirect to the Dragon sample.
- *Through but trial over / not entitled:* section `Your trial` / `Your free trial is over.` (never had one: `The studio` / `Choose a plan to come in.`) / `Signed in as {email}. Everything you wrote is still saved on this device; a plan opens the studio for good.` + price block + `SEE PLANS AND BUY`, `SIGN OUT` + code box.
- *Through (open):* deck `You are in. Your projects sync to this account.` Section `Through` / `You're in.` / `Signed in as {email}. {Access given by the studio — the whole studio is open to you. }Projects you open sync to this account, and the Chrome extension signs in with it too.` Buttons `GO TO THE STUDIO` (primary, goes to the page they came from), `ACCOUNT SETTINGS`, `SIGN OUT`. Purchases-off variant body: `The studio is open to everyone who signs in. Your work is saved on this device; syncing it to your account needs an invite or a plan.`
- *Lost session:* deck `This account is active on another device, so sync is paused here.`; section `Elsewhere` / `Active on another device.` / `Take the session back to sync here; the other window pauses. Or leave it — this device keeps saving locally.` button `TAKE OVER SESSION`.
- *Why-lines:* `…because this site is not connected to its server just now. Everything on this device is still here.` / `…because your invite could not be checked just then. Everything on this device is still here.` / `…because this account has no trial running and no plan yet.`

**Dialogs & overlays** None (all inline sections). Toast on code accept: `Invite code accepted — sync is on.`

**Sample data** Signed in as `asha.v@example.com`; code `K7QM-4TZP-82WD`; trial `30 minutes`; prices Basic ₹599 / Intermediate ₹799 / Pro ₹999.

**Mobile (390px)** Same single column; side padding 16px; band reduces to crumb with bottom nav bar; action buttons wrap, each ≥44px; input full-width.

**Stitch prompt**
Design the "Come in." doorway screen for FilmMakerStudio in a dark violet product UI (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase eyebrows). App shell band on top with breadcrumb "Studio · Come in". Page header: eyebrow "Studio · Come in", big H1 "Come in.", one-sentence deck. Below, a single centred column of stacked sections, each with a mono eyebrow, an H2, a sub line and actions: 1) "Free trial — Start your free trial." with body and a primary "CONTINUE WITH GOOGLE" button plus a small legal line; 2) "Or — Buy a plan and come straight in." with a three-row price list (Basic ₹599 Write the film., Intermediate ₹799 Prepare it., Pro ₹999 Shoot it and finish it: everything.), a note, primary "SEE PLANS AND BUY" and outlined "COMPARE EVERY FEATURE"; 3) "With a code — Have an invite code?" with a mono code input (XXXX-XXXX-XXXX), hint text, primary "CONTINUE WITH GOOGLE" and a text link. Include a signed-in variant with "You're in." and GO TO THE STUDIO / ACCOUNT SETTINGS / SIGN OUT.

---

## Purchase (file `purchase.html`, plus stub `purchases.html`)

**Purpose** The single buying space: plan cards, promo code, checkout (Razorpay), referral code, refund request, invoices. Prices, promo codes, checkout and upgrade credit live nowhere else.
**Who sees it / when** Everybody (exempt from the site gate and from the paywall, never walled): signed out (sign-in prompt + list prices), signed in free/no-plan, in a trial, lapsed, paid buyer, access-granted account, purchases-off studio. `?plan=<id>` marks and (once signed in) opens that card's checkout; `?for=<id>` adds a "Opens X, the part of the studio you just tried." line; `?ref=` / `?code=` pre-fills the promo box. `purchases.html` is only an admin redirect stub: page body `Purchases moved into the console.` (link to `admin.html#purchases`), refreshes there.
**Data source** `Billing.listPlans()` (plans table: name, blurb, price, limits, features), `Billing.status()` (plan, plan_name, account_name, trial_active, trial_ends_at, trial_used, entitled, granted, lapsed, bought_plan, plan_until, purchase_required, usage, limits, payments, disabled), `Billing.quote()` (promo + upgrade-difference quotes), `Billing.buy()` (Razorpay checkout via edge functions), `my_referral()`, `my_refund_status()`, `my_invoices()`, `plan-matrix.json` (lazy), `LIST_PRICE` for signed-out. Nothing stored locally; session key `fms_purchase_plan` carries `?plan=` across Google.

**Layout** App-shell family. Band (crumb "Studio · Purchase") → `.bd-head` (eyebrow `Studio · Purchase`, h1 `Purchase.`, deck) → `.pu-body` (max `--measure-wide`, centred) containing ONE section `#plan` (eyebrow `Plan`, h2, deck) then, top to bottom: trial/status line → usage list (buyers only) → lapsed note → **plan card row** (`.pl-row`: 3 columns at 1280px — auto-fit min 14rem; 1 column at 390px; cards equal height, button pinned to the bottom) → "Compare every feature" disclosure table → "Have a code?" disclosure → payment notes → referral panel → refund-request panel → invoices table → optional plan extras (branding toggle, WhatsApp help line).

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Head | Deck | text | `Choose a plan, pay once, and find your invoices and refund requests in the same place.` | — | purchases OFF: `Nothing is for sale at the moment, and every part of the studio is open.` |
| Section | Eyebrow / h2 | text | `Plan` / `Choose a plan.` | — | buyer: `{Plan name} · {account name}`; granted: `Access given by the studio.` |
| Section | Deck | text | `A plan opens the stages of your own film — Basic to write it, Intermediate to prepare it, Pro to shoot and finish it — and sets how much syncs to the cloud. One payment, yours for good. Nothing you write is ever deleted, on any plan or none.` | — | signed out: plus ` A plan belongs to an account, so you sign in with Google first — you come straight back to this page.` |
| Trial line | status | text | active: `Your free trial has 24 minutes left. A plan keeps the studio open after it ends.`; over: `Your free trial ended on 14 Oct 2026, 10:30 am. Choose a plan to keep using the studio. Everything you wrote is still saved on this device.` + outlined `SIGN OUT`; granted: `Access given by the studio. An administrator has opened the whole studio to you — there is nothing to buy while this access stands. A plan is here if you want one of your own.` | — | only when plan is none and purchases required |
| Usage | h3 + list | text | `Your usage`; lines `Cloud projects: 1 of 3`, `Live share links: 0 of 5`, `Most collaborators on one film: 2 of 5`, `Organisation seats used: 1 of 1` (` — at the limit` marks full) | — | buyers only |
| Lapsed | note | text | `Your Basic plan ended on 14 Oct 2026 (refunded). Choose a plan to keep using the studio.` | — | refunded buyers |
| Cards | Plan card ×3 | `article.pl-card` | eyebrow `Your plan` (current, else blank) · name · blurb · price line `₹799 once · yours for good` · adds block · limits list · feature count + "What's included" disclosure · button | see below | current / picked / promo / upgrade |
| Card | Buy button | button | `BUY` (primary when no plan) / `UPGRADE` (when you already hold a lower plan) / `OPENING…` | opens Razorpay | only on tiers higher than yours; disabled if payments not configured or account disabled |
| Card | Current note | text | `Yours, for good. Nothing to renew.` | — | on your tier |
| Card | Picked flag | text | `Opens {feature}, the part of the studio you just tried.` | — | `?for=` link |
| Compare | Disclosure | `details` | summary `Compare every feature`; table `Feature` + one column per paid plan; stage group rows then `Capabilities` | — | — |
| Promo | Disclosure | `details` | summary `Have a code?`; label `Promo code`; input placeholder `e.g. LAUNCH10`; buttons `APPLY` (→ `RE-CHECK`, `CHECKING…`) and `REMOVE`; hint `Spaces and case do not matter. The discount shows on the card before you pay.`; success `LAUNCH10 applied to Basic, Intermediate. The price above is what you will pay.` | quote asked per plan; opens automatically for a `?ref=` link | shown only when something is buyable and payments configured |
| Notes | Payment line | small | `One payment, full access for good — nothing recurs and nothing expires. Paid through Razorpay in INR; an invoice arrives from Razorpay by e-mail.` | — | — |
| Notes | Promise | small | `Refunded in full if you are charged twice or by mistake, or if the plan is not activated on your account. Otherwise a plan is final — which is why the trial comes first. Move up later and pay only the difference.` | — | — |
| Notes | Legal | small | `By paying you agree to the Terms of Service and the Refund & Cancellation Policy. See also our Privacy Policy.` | links | — |
| Notes | Status | live | `Preparing your order…` → `Opening the payment form…` → `Confirming with the studio…` or the failure message (default `The payment did not complete.`) | — | — |
| Notes | Unavailable | small | `Payments are not available yet. Please check back soon.` / `This account has been disabled by an administrator, so it cannot buy a plan.` | — | conditional |
| Success | Card above row | status card | eyebrow `Payment received`, h3 `You're on Intermediate.`, `Just unlocked:` bullet list (up to 8), `Your invoice is on its way from Razorpay by e-mail, and listed under Invoices on the Purchase page.`, primary `START YOUR FILM` → `index.html?welcome=plan` | — | after a purchase |
| Referral | Panel (paid) | card | h3 `Your referral code`; lead `Share it with a friend. They get 10% off any plan, and you earn 10% of what they pay once their payment is confirmed.`; mono code `REF-4D9K2X` + buttons `COPY`, `COPY LINK`; meta `The link opens this page with your code already in the “Have a code?” box. Credits are paid out by hand by the studio; your own purchases cannot use your code.`; three stat tiles `Owed to you ₹80` / `Paid out ₹0` / `Used by friends 1 time`; credit list `14 Oct 2026 — ₹80 · owed` | toast `Copied REF-4D9K2X.` | switched-off: `This code is switched off at the moment, so a friend cannot use it.` |
| Referral | Panel (unpaid) | card | h3 `Refer a friend`; `Once you have bought a plan you get a referral code of your own. A friend who buys with it gets 10% off, and you earn a credit when their payment is confirmed.` | — | — |
| Refund | Panel | card | h3 `Request a refund`; state line `Your Intermediate plan, ₹799, paid 14 Oct 2026. Purchases are final, except a duplicate charge, a charge where you did not receive what you paid for, or where the law requires. This sends a request; the studio decides, and a refund ends the plan.`; select `Reason`; textarea `Tell us more` placeholder `What happened? Include the date and anything that helps us find it.`; primary `SEND REQUEST` (`SENDING…`); link `Read the refund policy` | toast `Request sent. We will answer on this page.` | only when admin switched it on and a captured payment exists |
| Invoices | Table | table | h3 `Invoices`; columns `Number` `Date` `Plan` `Amount` and an action column with `DOWNLOAD PDF` | PDF drawn in browser | empty: `Your invoice appears here when a payment goes through.` |
| Extras | Branding toggle | checkbox | `Show “Made with FilmMakerStudio” on pitch decks, call sheets and the screening room` + hint `Your plan lets you remove the line. The choice is kept on this device.` | — | Pro only |
| Extras | Help | text | `Stuck, or deciding on a plan? ` + WhatsApp link | — | only if configured |

**Lists & tables**
- Plan card content example (Intermediate, signed in, no plan): eyebrow blank · `Intermediate` · blurb · `₹799` bold + ` once · yours for good` · "Everything in Basic, plus:" list (Scene Breakdown, Stripboard, Budget…) · limits list (`3 cloud projects`, `5 collaborators per film`, `5 live share links`, `1 organisation seat`, `Chrome extension included`, `Local work, Drive backup and AI tools (your own key) are included`) · `19 of 40 features` + disclosure `What's included` with per-stage lists (`Pre-Production · 18 of 20`, struck/dim items when off) · button `BUY`.
- Promo variant: price shows discounted figure large, list price struck beside it, and `₹80 off with LAUNCH10`. Upgrade variant: `Upgrade to Pro — ₹200 (you paid ₹799 for Intermediate)`.
- Refund categories: `I was charged twice` · `I was charged but my plan did not arrive` · `Another ground the law gives me` · `Something else`. Request states: `Waiting for the studio to look at it` · `Approved — your refund is on its way` · `Declined` · `Refunded`; line `Your last request, 14 Oct 2026:` + pill; `The studio wrote: {note}`; pending: `You do not need to do anything else. We will answer here.`; empty "other" error `Tell us what happened, in a sentence or two.`

**States**
- *Loading:* h2 `Loading the plans…`, outlined button `LOADING…` (disabled).
- *Error:* h2 `The plans did not load.` + red alert with message + `TRY AGAIN`. Missing schema: h2 `Plans are not set up on this project yet.` + `TRY AGAIN`.
- *No cloud build:* h2 `No cloud, no plan.` + hint `This build is not connected to a cloud project, so there is no account to put a plan on.`
- *Signed out:* h2 `Sign in to buy a plan.`; price block (3 rows + note); if arrived by referral: `You arrived with the referral code REF-4D9K2X. Sign in, then enter it under “Have a code?” below the plan cards to see your discount.`; buttons primary `SIGN IN TO BUY`, outlined `COMPARE EVERY FEATURE` (→ `start.html#pricing`).
- *Trial running:* trial line above cards (no cards hidden). *Lapsed trial:* over-line with SIGN OUT.
- *Paid buyer:* h2 shows plan name; usage; current card says "Your plan" and "Yours, for good. Nothing to renew."; only higher tiers show UPGRADE; referral, refund, invoices appear.
- *Purchases OFF:* h2 `Free to use.` with one line `The studio is free to use right now — nothing to buy.` and invoices only (no cards, promo, checkout). *Purchases ON:* everything above.

**Dialogs & overlays** Razorpay's hosted checkout modal (external; plan, amount in ₹, UPI/card). Toasts: copy confirmations, `Request sent. We will answer on this page.` No in-app confirm dialog on this page.

**Sample data** Signed in `asha.v@example.com`, Intermediate buyer: invoice `FMS/2026-27/000012 | 14 Oct 2026 | Intermediate | ₹799 | DOWNLOAD PDF`; promo `LAUNCH10`; referral `REF-4D9K2X`; trial line `Your free trial has 24 minutes left.`

**Mobile (390px)** Plan cards stack one per row, full width, each with its own disclosure; comparison table scrolls within its own focusable region (`role=region`, tabindex 0); promo and refund forms are single column; invoice table wraps into the card width; band reduced + bottom bar.

**Stitch prompt**
Design the Purchase screen for FilmMakerStudio, dark violet product UI (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase eyebrows) inside the app shell with breadcrumb "Studio · Purchase". Header: eyebrow, H1 "Purchase.", deck "Choose a plan, pay once, and find your invoices and refund requests in the same place." One section "Plan — Choose a plan." with a trial status line ("Your free trial has 24 minutes left…"), then three equal plan cards: Basic ₹599, Intermediate ₹799, Pro ₹999, each showing "once · yours for good", "Everything in the plan below, plus:" list, limits list (cloud projects, collaborators, share links, seats, Chrome extension), "19 of 40 features" with a "What's included" disclosure and a BUY button (the current plan says "Yours, for good. Nothing to renew."). Under the row: "Compare every feature" table, "Have a code?" disclosure with promo input and APPLY, three small policy notes, a "Your referral code" card with COPY / COPY LINK and three stat tiles, a "Request a refund" form, and an Invoices table with DOWNLOAD PDF. Add signed-out and purchases-off variants.

---

## Screening room (file `screening.html`)

**Purpose** A time-limited, read-only, watermarked view of one film for an investor / festival programmer / producer. No studio navigation, no account.
**Who sees it / when** Anyone holding a screening pass code (arrives from the sender's message, or from the invite code box which forwards `screening.html?pass=CODE`). Exempt from the gate. Nothing is written to storage; its Supabase client keeps no session. Theme follows the OS only.
**Data source** RPC `screening_open()` (title, expiry, access id, `scopes`: `feature` blueprint, `story`, `scenes`; never contacts or money; optional `branding`, `ref`), `story.js` (beat matrix), `pitch-deck.js` (`collectFrom`, `buildDeck`), `watermark.js`. Flagged-off feature: `screening.html#view=<token>` shared pitch deck / call sheet (not live).

**Layout** No shell or rail. Centred `main.sc-main` (max `--measure-wide`, padding s6 / gutter). *Enter stage:* `.bd-head` then a narrow form (max 28rem). *Room stage:* head (eyebrow, h1 = film title, deck = logline, expiry line in mono), then stacked bordered blocks (`section.sc-block`, paper-raised, 1px rule, 16px radius): Beat sheet, Character map, Pitch deck; then the brand line and "About the studio" link, centred. A fixed forensic watermark overlays the content. Text selection and right-click are disabled in the room; printing replaces the page with a message.

**Elements**

| Region | Element | Type | Exact label/text | Behaviour | Variants/states |
|---|---|---|---|---|---|
| Enter | Eyebrow / h1 / deck | text | `Screening room` / `You have been sent a film.` / `Enter the screening pass you were given. It opens one project, read-only, for a limited time — no account needed.` | — | — |
| Enter | Pass | text input (mono, large, uppercase) | label `Screening pass`; placeholder `XXXX-XXXX-XXXX` | auto-formats; prefilled from `?pass=` | — |
| Enter | E-mail | email input | label `Your e-mail (optional)`; placeholder `you@example.com` | not verified | — |
| Enter | Note | small | `Whatever you open here is watermarked with this pass, the e-mail above and the time. The e-mail is not checked; it is printed on the page so the sender knows who is watching.` | — | — |
| Enter | Submit | primary | `OPEN THE SCREENING` | `OPENING…` while busy | — |
| Enter | Error | alert (red wash, left rule) | see States | — | — |
| Room | Eyebrow | mono | `Screening room · read-only` | — | — |
| Room | H1 | heading | film title (or `Untitled film`) | — | — |
| Room | Deck | text | logline | — | omitted if none |
| Room | Expiry | mono | `This pass closes in 3 hours.` | refreshes every 30 s | `…closes in 12 minutes.` / `…in 2 days.` / `This pass has expired.` |
| Room | Beat sheet block | section | h2 `Beat sheet · Three-act structure` (framework label), synopsis paragraph, ordered list: bold beat label + the passages tagged to it joined by ` … ` or `—` | — | only if a synopsis exists; empty beats dimmed |
| Room | Character map | section | h2 `Character map`; auto-fit grid (14rem) of cards: mono role, name h3, one line | — | only if characters |
| Room | Pitch deck | section | h2 `Pitch deck`; stacked slides | — | always |
| Room | Brand line | text | `Made with FilmMakerStudio — {link text}` | link | hidden if pass says `branding: false` |
| Room | About link | text link | `About the studio` → `start.html` | — | always |

**Lists & tables** Deck slides (`.pd-slide` cards with mono eyebrow): cover (eyebrow = genre or `A film`, display title, logline); `Synopsis`; `Structure` (title = framework, numbered beats); `Characters` (grid); `Key scenes` (numbered); `The production` (big numbers row: label under each figure). Example: Beat `Opening Image` → `Kavya sells her last gold bangle to buy a second-hand camera … The tailor's shutter rolls up.`; Character card `PROTAGONIST · Kavya` `A tailor's daughter who films weddings and wants to shoot a feature.`

**States**
- *Loading:* button `OPENING…`. Shared-link flow: `Opening the shared link…` status.
- *Errors (red alert):* `Enter the screening pass you were given — the code in the message from the sender.` · `This copy of the studio is not connected to a cloud project, so it cannot open passes.` · `That screening pass could not be opened.` / server sentence · offline `This device is offline. Connect to the internet and try again.` · `The studio could not reach its server. Check the connection and try again.` · expiry `This screening pass has expired. Ask the sender for a new one.` · tamper `The screening was closed because its watermark was removed. Open the pass again to continue.`
- *Empty room:* `This project has nothing shared in it yet.`
- *Signed-out only:* there is no signed-in variant; no purchases/trial variants.
- *Print:* page hidden, message `Printing is turned off for screening passes.`

**Dialogs & overlays** Watermark layer: three lines repeated across the page in faint ink — `SCREENING PASS · ACCESS {id}`, viewer e-mail (or `viewer not named`), `2026-10-14 10:42 UTC`.

**Sample data** Pass `QX7M-D2LA-9HRT`, e-mail `programmer@example.com`, film `Kodai Mazhai` (mystery short, 3-act), expires in 2 days; watermark `SCREENING PASS · ACCESS 4F2A91` / `programmer@example.com` / `2026-10-14 10:42 UTC`.

**Mobile (390px)** Single column; form full width; blocks keep padding; character grid 1 column; deck slides stack; deck numbers wrap.

**Stitch prompt**
Design a minimal "Screening room" for FilmMakerStudio in dark violet (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase labels), with no navigation. Screen 1: centred narrow column — eyebrow "Screening room", H1 "You have been sent a film.", deck, a large monospace uppercase input labelled "Screening pass" (XXXX-XXXX-XXXX), an optional e-mail input, a small note about watermarking, primary pill "OPEN THE SCREENING", and a red-tinted error strip. Screen 2 (room): header with eyebrow "Screening room · read-only", film title H1, logline deck and a mono line "This pass closes in 3 hours."; then bordered blocks: "Beat sheet · Three-act structure" (synopsis plus numbered beats with tagged passages), "Character map" (card grid: role, name, line), "Pitch deck" (stacked slides: cover, Synopsis, Structure, Characters, Key scenes, The production with big numbers); footer "Made with FilmMakerStudio —" and "About the studio". Overlay a faint diagonal watermark: pass access id, viewer e-mail, UTC time.

---

## Chrome-extension side panel (file `extension/panel.html`, script `src/pages/panel.js`)

**Purpose** The extension's front door, docked beside any tab (~360px wide): gatekeeper, sign-in, and the five-stage pipeline launcher; also queues web clippings for the Idea Vault.
**Who sees it / when** Only inside the Chrome extension. Outside it: a "not the extension" notice. Flow: no session → gatekeeper (step 1) → code held → Google (step 2) → gate closed → request/redeem → session on another device → takeover → plan lacks extension → upsell → pipeline.
**Data source** `window.StudioCloud` (session, gate state, user e-mail), `chrome.storage.local` clip queue (`CLIP_QUEUE_KEY`), `Billing.status()` (`limits.extension`), `plan-matrix.json` (`extension` row: plans Intermediate, Pro), `navmodel.moduleGroups()` (stages and shelves with blurbs and modules), `Store.currentProject()`.

**Layout** Single column `main.pn-main` (padding s4, gap s3, max 40rem, left-aligned; designed at ~360px). Each screen: `header.pn-head` (mono eyebrow, h1 `pn-title` display xl, optional deck small) then controls stacked, all buttons `justify-self: start`. Pipeline: an ordered list of 5 + shelf cards (1px rule border, 16px radius, paper-raised); each card header is a full-width button with a 10px hue dot, bold stage name and muted blurb beneath; open card gets a hue-coloured border and a body.

**Elements**

| Screen | Element | Type | Exact label/text | Behaviour | Variants |
|---|---|---|---|---|---|
| Not extension | head | text | eyebrow `FilmMakerStudio` · h1 `This is the extension panel.` · deck `Open it from the FilmMakerStudio button in Chrome’s toolbar. On the website, everything here is on the hub.` | — | — |
| Not extension | button | outlined | `GO TO THE HUB` | link | — |
| Gatekeeper | head | text | eyebrow `Step 1 of 3` · h1 `Enter Invite / Screening Pass Code` · deck `FilmMakerStudio is invite-only. A screening pass opens one film read-only, without an account. No code? Sign in with Google and ask for an invite.` | — | — |
| Gatekeeper | code input | mono input | label `Code`, placeholder `XXXX-XXXX-XXXX` | auto-format | — |
| Gatekeeper | submit | primary | `CONTINUE` (`CHECKING…`) | verifies; screening pass opens `screening.html` in a new tab | — |
| Gatekeeper | not-deployed | meta | `Invite codes are not switched on for this studio yet; an administrator has to enable them before anybody can be let in.` | — | conditional |
| Gatekeeper | alt | outlined | `NO CODE? SIGN IN TO REQUEST ONE` | Google sign-in | — |
| Gatekeeper | error | alert | verbatim server/gate message | — | — |
| Gatekeeper / Pipeline | clip line | small | `Select text on any page and choose “Send to FilmMakerStudio” to keep it in the Idea Vault.` — or with queue: `2 clippings waiting for the Idea Vault — they arrive when you open a page.` | — | — |
| Sign-in | head | text | eyebrow `Step 2 of 3` · h1 `Sign in with Google.` · deck `Your code is held for ten minutes and spent only once Google has said who you are.` | — | — |
| Sign-in | buttons | primary + outlined | `SIGN IN WITH GOOGLE` (`WAITING FOR GOOGLE…`) · `USE A DIFFERENT CODE` | — | error `Google sign-in did not complete.` |
| Closed | head | text | eyebrow `Invite needed` · h1 `Ask for an invite, or redeem a code.` (pending: `Your request is in.`) · deck `Signed in as asha.v@example.com, which is not a member yet.` | — | — |
| Closed | request block | form | same block as invite.html (Name / Google account / Asked from, note textarea, `REQUEST AN INVITE`) | — | — |
| Closed | redeem | form | label `Or an invite code, if you were given one`; primary `REDEEM` | — | only when backend deployed |
| Closed | out | outlined | `SIGN OUT` | — | — |
| Lost | head | text | eyebrow `Session elsewhere` · h1 `Active on another device.` · deck `Your account is open in another Chrome window. Take the session back to continue here; the other window pauses.` | — | — |
| Lost | buttons | primary + outlined | `TAKE OVER SESSION` · `SIGN OUT` | — | — |
| Checking | head | text | `One moment` · `Checking your invite…` · `Asking the studio whether this account is through the gate and free to open here.` | — | — |
| No extension | head | text | eyebrow `Your plan` · h1 `The extension is not in your plan.` · deck `Your plan covers the website and local work. Intermediate and Pro include the Chrome extension — the side panel, the web clipper and the device lock.` | — | — |
| No extension | buttons | primary + 2 outlined | `SEE PLANS` (new tab → purchase) · `I HAVE UPGRADED` · `SIGN OUT` | recheck | — |
| Pipeline | head | text | eyebrow `Pipeline` · h1 = open project title (e.g. `Kodai Mazhai`) or `FilmMakerStudio` · deck `No project open — pick one on the hub, or start in Story.` | — | deck only if none open |
| Pipeline | stage rows | accordion buttons | name + blurb, `aria-expanded` | toggles one open | open = hue border |
| Pipeline | foot | row | e-mail (muted) left, outlined `SIGN OUT` right | — | — |

**Lists & tables** Stage cards in order: `Story` — Idea, logline, beats · `Screenplay` — Write it, version it, bring one in · `Pre-Production` — Break it down, see it, plan it, cost it · `Production` — The shoot day · `Post-Production` — The cut, and what leaves the building · then shelf `Library` — The reference shelf: read a film, then take one apart. Opened body: for Story and Screenplay, three "way in" tiles (bold label + muted sub): Story → `Sample` The sample synopsis, ready to tag. / `New` A blank synopsis and a beat framework. / `Import` .docx, .pdf or .txt — or drag it onto the page.; Screenplay → `Sample` Open the sample project, a whole feature filled in. / `New` A blank screenplay. / `Import` Fountain, Final Draft (.fdx), PDF or plain text. Then a module list: link (hue-deep, 600) + muted purpose line, e.g. `Beats & Pacing` — "Write the story and check its shape: where it rises, where it sags."; planned modules show a dim label + `in development`.

**States** Loading = `One moment` screen. Error lines: `Your account was opened on another device, so this panel signed out.` · `Your invite was revoked by an administrator.` · `That code could not be checked.` Request block variants as on invite.html. No trial or purchases-off variants beyond the "not in your plan" screen.

**Dialogs & overlays** None; Google sign-in via Chrome identity popup; a screening pass opens a new browser tab.

**Sample data** Open project `Kodai Mazhai`; signed in `asha.v@example.com`; 2 queued clippings; Story stage open.

**Mobile (390px)** The panel is already narrow; at 390px it is identical (full width, left aligned, buttons ≥44px). Wide windows cap at 40rem.

**Stitch prompt**
Design a narrow (360px) Chrome side-panel UI for FilmMakerStudio, dark violet (ground #120f1c, cards #1b1727, accent #9575f8, pill buttons, 16px radius, Catamaran, mono uppercase eyebrows). Produce three states. 1) Gatekeeper: eyebrow "Step 1 of 3", title "Enter Invite / Screening Pass Code", short deck, mono code input labelled "Code" (XXXX-XXXX-XXXX), primary "CONTINUE", outlined "NO CODE? SIGN IN TO REQUEST ONE", and a muted line about sending selected text to the Idea Vault. 2) Pipeline: eyebrow "Pipeline", project title "Kodai Mazhai", then stacked accordion cards for Story, Screenplay, Pre-Production, Production, Post-Production and Library, each with a coloured hue dot, bold name and muted blurb; the open Story card shows three tiles (Sample, New, Import with one-line subtitles) and a list of module links with purpose lines; footer with e-mail and outlined "SIGN OUT". 3) Closed: "Ask for an invite, or redeem a code." with request details list, note textarea and "REQUEST AN INVITE".

---

## Legal pages (files `privacy.html`, `terms.html`, `refund.html`)

**Purpose** Public policy documents (required for the Google consent screen and Razorpay). Words are in markup, readable with scripts off.
**Who sees it / when** Everybody, signed in or out; outside the site gate; linked from sign-in lines, footers, checkout notes. No app chrome, no shell, no skin, no storage; follows OS light/dark only. **Not** in the verify gate, so check at 390px by eye.
**Data source** Static copy; `{brand:name}` and `{brand:email}` stamped at build; "Last updated 12 October 2026".

**Layout** One column `main.legal`, max `--measure-wide`, padding s7 top / gutter sides / s9 bottom; paragraphs capped at `--measure`. Top to bottom: back link (mono uppercase violet-deep `← FilmMakerStudio`, → `/`), h1 (display, 4xl), sub-line (large muted), date line (mono uppercase muted with hairline below), a key box `.legal-key` (accent wash, 1px rule, 3px brand left rule, radius-lg, bold lead sentence), numbered h2 sections (display xl) with h3 subsections, bullet lists, footer line `.legal-foot` (top rule, small muted: brand · other two legal links · `Back to the studio`). No sticky parts, no table of contents. Placeholders needing owner input render as dashed amber `.legal-ph` chips.

**Elements / heading outlines**

| Page | H1 | Sub-line | Key box (bold leads) | H2 outline |
|---|---|---|---|---|
| `privacy.html` | `Privacy Policy` | `What we collect, why we collect it, who helps us process it, and the rights you have over it.` | `Your work stays on your device unless you choose otherwise.` + no-sale / no-ads / no-AI-training paragraph | 1 Who we are · 2 What we collect (h3: When you use the studio without signing in · When you sign in with Google · When you buy a plan · When you use AI features · Technical data · Counts of which tools are used (signed in) · Launch-offer e-mails and visit counts) · 3 Why we use it · 4 Who processes it for us · 5 Google Drive backup · 6 Cookies and browser storage · 7 How long we keep it · 8 Your rights · 9 Security · 10 Children · 11 Changes to this policy · 12 Contact and grievances |
| `terms.html` | `Terms of Service` | `The agreement between you and FilmMakerStudio when you use the studio.` | `Your work is yours.` / `Keep your own backups.` | 1 About these terms · 2 Eligibility and accounts · 3 Invite-only access · 4 Plans and payments · 5 Refunds and cancellation · 6 Your content · 7 AI features · 8 Third-party services · 9 Reference material is not professional advice · 10 Acceptable use · 11 Our content · 12 Availability and changes to the Service · 13 Disclaimer · 14 Limitation of liability · 15 Indemnity · 16 Ending your use · 17 Governing law and disputes · 18 Changes to these Terms · 19 Contact |
| `refund.html` | `Refund & Cancellation Policy` | `Plans are a one-time purchase. Purchases are final, with the exceptions below.` | `Plans are a one-time purchase.` / `Purchases are final and not refundable` (except duplicate charge etc.) | 1 Who sells the plans, and what this policy covers · 2 Cancellation · 3 Purchases are final · 4 The exceptions · 5 How to ask · 6 How refunds are paid · 7 What happens to your account · 8 Governing law · 9 Contact |

Footer links: privacy → `Terms of Service · Refund & Cancellation · Back to the studio`; terms → `Privacy Policy · Refund & Cancellation · Back to the studio`; refund → `Terms of Service · Privacy Policy · Back to the studio`. Contact is a `mailto:` of the brand support address (e.g. `support@example.com` as sample).

**Lists & tables** Bullet lists only (indent s4, items margin s2); inline `code` chips (mono, sunken bg, hairline); no tables.
**States** Static. No loading, empty, error, signed-in or purchase variants.
**Dialogs & overlays** None.
**Sample data** Date line `Last updated 12 October 2026`; contact `support@example.com`.
**Mobile (390px)** Same single column with 16px gutter; h1 shrinks via tokens; back link has ≥35px tap height; lists indent keeps.

**Stitch prompt**
Design a long-form legal document page for FilmMakerStudio in dark violet (ground #120f1c, cards #1b1727, accent #9575f8, Catamaran, mono uppercase small labels, 16px radius). No navigation chrome. Single readable column with comfortable measure: a mono uppercase violet back link "← FilmMakerStudio"; large display H1 "Privacy Policy"; muted large sub-line; mono date line "Last updated 12 October 2026" with a hairline rule under it; a highlighted key-points box (soft violet wash, 1px border, thick violet left edge, bold first sentence "Your work stays on your device unless you choose otherwise."); then numbered H2 sections ("1. Who we are", "2. What we collect" with H3 subsections, … "12. Contact and grievances"), body paragraphs, bullet lists, inline code chips; and a footer line with links to Terms of Service, Refund & Cancellation, Back to the studio above a top rule. Provide the same template for Terms and Refund. Mobile: same column, 16px gutters.

---

## 404 page (file `404.html`)

**Purpose** Friendly dead-end for any unknown URL, reassuring that local work is safe.
**Who sees it / when** Anyone following a bad link (served at any unknown path; `<base href="/">` keeps assets loading). Outside the gate; legal-page styling (no shell, no skin, no storage).
**Data source** Static markup only; brand name stamped.

**Layout** Same `main.legal` single column as the legal pages: back link, h1, sub-line, two link lines. Nothing sticky. Plain violet-dark ground.

**Elements**

| Region | Element | Type | Exact text | Behaviour |
|---|---|---|---|---|
| Top | Back link | mono violet link | `← FilmMakerStudio` | `/` |
| Body | H1 | heading | `That page is not here.` | — |
| Body | Sub-line | muted large | `The link may be old, or the address mistyped. Your work is untouched — it lives in your browser.` | — |
| Body | Link 1 | mono violet link | `Go to the studio` | `/` |
| Body | Link 2 | mono violet link | `About FilmMakerStudio` | `/start` |

**Lists & tables** None. **States** Static; no variants. **Dialogs & overlays** None. **Sample data** n/a.
**Mobile (390px)** Same column, 16px gutters, large display heading wraps.

**Stitch prompt**
Design a calm 404 screen for FilmMakerStudio, dark violet product UI (ground #120f1c, accent #9575f8, Catamaran, mono uppercase links, no navigation chrome). Left-aligned single readable column near the top: a small mono uppercase violet back link "← FilmMakerStudio", a large display heading "That page is not here.", a muted large sub-line "The link may be old, or the address mistyped. Your work is untouched — it lives in your browser.", then two stacked mono uppercase violet text links, "Go to the studio" and "About FilmMakerStudio". Optionally add a subtle violet radial glow and a small film-slate glyph, but keep copy exactly as given. Generous whitespace, 16px gutters on mobile.
