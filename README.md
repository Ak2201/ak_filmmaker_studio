# FilmMakerStudio

> *A working desk for screenwriting, pre-production, and craft study.*

Four browser-based tools for filmmakers — three companion blueprints and a
reference library. Your work stays in your browser unless you opt into sync.

**[Open the Studio →](./index.html)**

---

## What's inside

### 📕 Feature Film Blueprint — `feature.html`
Vols I & II · 24 steps from "what if?" to "ROLL CAMERA."

- **Vol I — Story** (12 steps): spark, logline, theme, protagonist, antagonist,
  supporting cast, world, 15 beats, timeline, setups & payoffs, scene list, final check.
- **Vol II — Pre-Production** (12 steps): script lock, director's vision, lookbook,
  storyboard, cinematography, production design, costume, casting, locations, sound,
  schedule/budget, tech recce.
- **Treatment Ladder** — five rungs from logline to step outline.
- **Auto Pitch Deck** — 10 slides built from your filled fields, exports as `.pptx`.
- **HOD Sign-off Block** — countersignature checklist for every department head.
- Tanglish glosses, formula boxes and Por Thozhil craft lessons throughout.

### 📘 Short Film Blueprint — `short.html`
11 steps, with a structured script editor.

- **5-Beat Structure** — Setup → Disturbance → Escalation → Turn → Image, with an SVG visualiser.
- **Scene Map** — 5–12 scenes with beat tagging and a pages estimate.
- **Live Screenplay Editor** — slug, action, character, dialogue, parentheticals.
- **Auto Page Counter** — 210 words/page industry standard, with a runtime estimate.
- **Fountain Export** — `.fountain` opens in Final Draft, Highland, WriterDuet, Fade In.
- **AI Prompt Generator** — builds a prompt from your blueprint data to paste into a model.
- **Festival Strategy** — 18 festivals across 3 tiers, with deadlines and premiere rules.

### 📗 The Filmmaker's Library — `library.html`
Reference companion · 5 sections.

- **22 films** analysed for one extractable craft lesson each.
- **10 director archetypes** — Mani Ratnam, Vetrimaaran, Mysskin, Pa. Ranjith,
  Selvaraghavan, Lokesh Kanagaraj, Karthik Subbaraj, Bala, Thiagarajan Kumararaja, Pushkar–Gayathri.
- **50 craft rules of thumb**, attributed where the source is known.
- **Equipment & Cost Estimator** — with a working calculator.
- **72-film watch list** — three films per blueprint step, deep-linked to the matching step.

### 🏛️ The Studio — `index.html`
The hub: live progress per blueprint, a resume card, global search across every
step / film / director / rule, the master index, an activity log, and
cross-blueprint export / import / reset.

---

## How it works

- **Local-first.** Everything saves to your browser's `localStorage`.
- **Installable.** It's a PWA — install it and it works offline.
- **Cross-device** via Export → Import, or the optional Supabase sync.
- **No tracking.** No analytics, no third-party scripts.

> **The rates are dated.** The Chennai equipment and crew figures are from
> **2024–25** and have not been revised. The Library shows that date next to
> every table. Re-quote before you budget against them.

### Where your work lives

```
arunak_studio_projects_v1           // the project list
arunak_filmmaker_combined_v1__<id>  // feature blueprint, per project
arunak_shortfilm_blueprint_v1__<id> // short blueprint, per project
arunak_library_calc_v1__<id>        // equipment calculator
arunak_studio_activity_v1__<id>     // activity log
arunak_studio_theme_v1              // theme (global)
```

The `arunak_` prefix is historical. It is the storage contract with anyone who
already has work saved, so renaming it needs a migration — see *Roadmap*.

---

## Development

```bash
npm install
npm run dev       # vite dev server
npm run build     # static output in dist/
npm run preview   # serve the build
npm run verify    # load every page in Chromium and check nothing was lost
```

### Project layout

```
├── index.html feature.html short.html library.html   # page entries
├── src/
│   ├── data/        # ALL content as JSON — the asset
│   ├── lib/         # store, cloud, dom, pwa
│   ├── ui/          # chrome, step renderer
│   ├── styles/      # tokens + base + component sheets
│   └── pages/       # one entry module per page
├── scripts/extract/ # the parsers that produced src/data — re-runnable
├── legacy/          # the original hand-written pages, kept for verification
└── public/          # manifest, icons, service worker assets
```

**The content is the asset.** The 24 feature steps, 11 short steps, 22 films,
10 directors, 50 rules, 72 watch-list entries, 18 festivals and every Tanglish
gloss live in `src/data/*.json`. Pages render from it. Nothing is hand-written
markup any more, so the step list cannot disagree with the jump menu, the
search index, or the Markdown export — all four derive from the same file.

`npm run extract` regenerates the JSON from `legacy/` and self-checks text
coverage. `npm run verify` loads the built pages in a browser and asserts
against the originals: every `data-key` present, no lost copy, no inline
handlers, no runaway writes, no horizontal overflow on a phone.

---

## Keyboard shortcuts

| Shortcut       | Action                             |
|----------------|------------------------------------|
| `⌘ / Ctrl + K` | Focus the global search            |
| `⌘ / Ctrl + D` | Cycle theme — paper / sepia / ink  |
| `⌘ / Ctrl + S` | Save (in any blueprint)            |
| `↑ ↓`          | Navigate search results            |
| `Enter`        | Open the highlighted result        |
| `Esc`          | Clear search                       |

---

## Design system

- **Type:** Fraunces (display & body), JetBrains Mono (labels & data), Courier Prime (screenplay).
- **Colour:** one token set in `src/styles/tokens.css`. Each blueprint owns a hue —
  feature red, shorts cobalt, library gold — applied through a single `--accent`.
  Semantic colours are deliberately never a volume hue.
- **Themes:** paper, sepia, ink. All three are token swaps; no component reads a raw hex.
- **Print:** every blueprint has a PRINT mode, plus a zine layout and a pitch-deck-only mode.

---

## Roadmap

Tracked in the revamp plan. Next up:

1. **Rename the storage keys** off the `arunak_` prefix, with a migration — blocked on a product name.
2. Close the chain: scene → shot → stripboard → day-out-of-days → call sheet.
3. AI with your own key: in-place dialogue passes and beat critique, not copy-paste prompts.
4. Script import (`.fountain`, `.fdx`) and a proper screenplay PDF.
5. Finish the collaboration UI — the comments API is already written.
6. Refresh the Chennai rates and turn the festival list into a submission tracker.

---

## Credits

**Curated by Arunak.** Tamil cinema lessons drawn from the work of the directors
profiled in the Library. Por Thozhil (2023, dir. Vignesh Raja) is referenced
throughout as a craft case study.

Tanglish glosses are conversational Tamil–English in Roman script — meant to feel
like a friend explaining the idea on a chai break, not a textbook.

## License

Personal-use, non-commercial. If you build something with it, share back.

> *"A studio is not a building. It is the pattern of attention, decisions, and study a working filmmaker keeps."*
