# Admin console — Stitch hand-off pack

Scope: the **admin console** (`admin.html`) — 11 tabs, a customer drawer, a banner, shared dialogs.
The other 20-odd pages of the app (hub, blueprints, stage pages) are not in this pack.

Files (give Stitch the screen files one at a time, plus this one first):
- `00-README-and-design-system.md` — this: workflow, brand, tokens, shared components
- `10-run-and-product-screens.md` — shell + status bar, Overview, Launch & health, Audit log, Usage, Sync & storage
- `20-people-screens.md` — People, Customer 360 drawer, Support, Access & sharing
- `30-money-controls-global.md` — Purchases, Growth, Controls, banner, full-page states, dialogs

## 1. What you should do (the workflow)

1. **Open Google Stitch** (stitch.withgoogle.com, a Google Labs tool; menus change, so treat the
   exact button names below as approximate).
2. **Set the style once.** Start a project, choose *Web / Desktop*, and paste the "Design system prompt"
   (section 3 below) as the first prompt so every screen shares the look. Re-use it as the preamble of
   every later prompt.
3. **One screen per generation.** For each screen, paste its **Stitch prompt** from the screen files,
   then paste the **Elements** table under it if Stitch accepts long prompts (otherwise attach it as
   notes and refine with short follow-up prompts: "add the density toggle", "show the error state").
   Generate **desktop (1280)** first, then ask for the **mobile (390)** variant of the same screen.
4. **Generate the states too**, not just the happy path: loading (skeleton), empty, error, and the
   role-limited view. Those are all in the spec; designers usually skip them and that is where the
   build breaks.
5. **Export each screen**: Stitch lets you copy the generated HTML/CSS and/or paste to Figma. Do both if
   you can: **Paste to Figma** (so Claude can read it through the Figma connection) and **save the
   HTML+CSS** and a **PNG screenshot** of every screen and state.
6. **Give it back to Claude** in one message per batch: the Figma link(s) *or* the HTML/CSS files +
   PNGs, and say which screens they are. Say "match the spec files in docs/stitch/ for behaviour".
   Claude will rebuild them in the real code (see section 5 for what it will and will not change).

### What to hand back (checklist)
- [ ] a PNG per screen at 1280px and at 390px, light **and** dark if you generate both
- [ ] the Figma frame URL or the exported HTML/CSS for each screen
- [ ] one line of anything you changed from the spec on purpose (a new colour, a moved region)
- [ ] the screens you did NOT redesign, so Claude leaves them alone

## 2. Product and brand facts

- Product: **FilmMakerStudio** — local-first browser tools for filmmakers (scripts, breakdown,
  stripboard, budgets). The admin console is for the owner/staff only; it is dense, calm, operational.
- Voice: plain sentences, no exclamation marks, no jargon. A failure says what was observed, never
  guesses a cause. Empty states say *what* is empty and *when it was checked*.
- Default theme is **dark ("ink")**: near-black ground with a violet cast. A **light ("paper")** theme
  exists: lavender-tinted white. Design both; they swap tokens only.
- Shapes: cards 16px radius with a 1px hairline border and a soft shadow; **buttons are pills**
  (fully rounded); fields 10px radius; focus ring 2px in the brand colour.
- Roles seen in the console: **owner**, **finance**, **support** (a member who is not an admin sees
  only "Administrators only"). Screens say which role can do what.

## 3. Design system prompt (paste first into Stitch)

> Design a desktop web admin console for a film-production software product. Dark theme by default:
> background #120f1c, raised cards #1b1727 with a 1px #2a2440 border and 16px corners, text #ece9f6
> with secondary text #c9c4db and muted #9a94b0. One accent: violet #9575f8 (lighter text variant
> #b69bfb, tint #241a3d). Status colours: success #34d399, warning #d6a44a, danger #f87171, each with
> a dark tinted wash for pill backgrounds (#102b22, #2e2415, #341a1c). Typeface Catamaran throughout,
> 14px body, 11–12px uppercase tracking-wide labels, 22–28px page headings. Buttons are fully rounded
> pills: primary violet fill with dark text, secondary outlined. Tables are dense with a sticky header
> and subtle row hover. Small pills for status. Calm and operational, generous spacing on an 8px
> grid, no gradients, no illustrations. Provide a matching light theme: background #f7f5fc, cards
> #ffffff with border #e4dff3, text #171233, accent #6d28d9.

## 4. Tokens (the real values; use these, do not invent new colours)

| Role | Dark (default) | Light |
| --- | --- | --- |
| Page background `--paper` | `#120f1c` | `#f7f5fc` |
| Card surface `--paper-raised` | `#1b1727` | `#ffffff` |
| Sunk/inset `--paper-sunk` | `#0d0b15` | `#f1eefa` |
| Border/edge `--paper-edge` | `#2a2440` | `#e4dff3` |
| Text `--ink` | `#ece9f6` | `#171233` |
| Body text `--ink-body` | `#c9c4db` | `#3f3960` |
| Muted text `--ink-muted` | `#9a94b0` | `#615a7d` |
| Faint text `--ink-faint` | `#6d6785` | `#9a93b0` |
| Brand `--brand` | `#9575f8` | `#6d28d9` |
| Brand as text `--brand-deep` | `#b69bfb` | `#5b21b6` |
| Brand tint `--brand-wash` | `#241a3d` | `#ede9fe` |
| OK / text / wash | `#34d399` / `#6ee7b7` / `#102b22` | `#15803d` / `#166534` / `#dcf5e4` |
| Warn / text / wash | `#d6a44a` / `#e8c384` / `#2e2415` | `#a04c08` / `#7f3c06` / `#fdf0d9` |
| Danger / wash | `#f87171` / `#341a1c` | `#c62828` / `#fde4e2` |
| Top band `--chrome` | `#16121f` (text `#f3f0fb`) | `#ffffff` (text `#171233`) |
| Floating surfaces (toast, tooltip, popover) `--panel` | `#1a1430`, text `#f1eefb` — dark in BOTH themes | |

Rules that matter: a status colour is a **fill**, never body text — text uses the "deep" variant on
a wash (otherwise contrast fails AA 4.5:1). Status colours are never the six phase hues. Text on a
brand-filled button is the dark on-fill colour, never the page background.

Type scale (px): 11 micro labels · 12 tiny · 14 small/body · 16 base · 18 lg · 22 xl · 28 2xl · 36 3xl.
Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Radii: field 10 · card 16 · large 18 · pill 999.
Shadows: sm `0 1px 2px rgba(0,0,0,.40)` · md `0 4px 16px rgba(0,0,0,.46)` · lg `0 18px 48px rgba(0,0,0,.54)`.
Font: **Catamaran** (display and body); code/ids in **JetBrains Mono**.
Breakpoints: ≥1100px = desktop (tab groups as a vertical sub-nav inside the content); <1100px = a
horizontally scrolling tab strip; <720px = phone (the app's own bottom bar appears).

## 5. Shared components (appear on many screens)

- **KPI tile** — label (11px caps, muted) over a large value (28px), optional delta chip (▲/▼ with
  good/bad tone), optional 14-day sparkline, optional "needs attention" tone; the whole tile is a link
  to where it is acted on.
- **Pill** — small rounded label; tones ok / warn / danger / neutral / accent; optional leading dot;
  always text on a wash.
- **Meter** — thin bar with a value/max label; tone from fill level.
- **Checklist** — rows with a state icon (✓ pass, ✕ fail, … waiting, – skipped) + title + muted note
  + optional link. A step that cannot be seen is "Not checked", never a pass.
- **Timeline** — rows of (time ago, title, sub-line with a mono target id, optional tone); absolute
  time on hover.
- **Diff** — two columns Before / After of key: value, changed keys highlighted.
- **Data table** — sticky header, hover row, keyboard-focusable rows (Enter opens), density toggle
  (comfortable / compact), caption for screen readers, designed empty row.
- **Drawer** — 520px right sheet over a scrim; sticky header; collapsible sections; Esc closes.
- **Empty state** — title, one-sentence body, optional action, and a "checked hh:mm" stamp.
- **Error state** — title, a sentence saying *why*, a Retry button.
- **Skeleton** — kpi / rows / block placeholders while loading.
- **Charts (all hand-drawn SVG)** — sparkline, bar, stepped funnel (with drop-off %), heat-grid
  (module × week), retention/conversion table; each has a hidden data table for screen readers and a
  tooltip on hover **and** keyboard focus.
- **Dialog** — confirm / danger-confirm / typed-confirmation (type a word or an e-mail to enable the
  button); states the consequence in a sentence.
- **Toast** — floating dark panel; success/error; an actionable toast ("View in audit log") stays until
  dismissed.
- **Shell** — top band (brand, project switcher hidden on admin, theme menu), the studio rail on the
  left (shared with the whole app — do not redesign it), then the console page: title "Console",
  status bar (TEST/LIVE pill, purchases-required pill, "Refreshed hh:mm · Refresh"), tab sub-nav
  grouped Run / People / Money / Product, then the tab content.
