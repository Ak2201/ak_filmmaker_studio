# The Filmmaker's Studio

> *A working desk for screenwriting, pre-production, and craft study.*

A self-contained suite of HTML tools for filmmakers — three companion blueprints, one reference library, all browser-based, no backend, no signup.

**[Open the Studio →](./index.html)**

---

## What's inside

### 📕 Feature Film Blueprint — `arunak-filmmaker-blueprint.html`
Vols I & II · 24 steps from "what if?" to "ROLL CAMERA."

- **Vol I — Story** (12 steps): Spark, logline, theme, protagonist, antagonist, supporting cast, world, 15 beats, timeline, setups & payoffs, scene list, final check.
- **Vol II — Pre-Production** (12 steps): Script lock, director's vision, lookbook, storyboard, cinematography, production design, costume, casting, locations, sound, schedule/budget, tech recce.
- **Treatment Ladder** — five rungs from logline to step outline.
- **Auto Pitch Deck** — 10 slides built from your filled fields, exports as `.pptx`.
- **Real-time Sync** — optional Supabase backend for syncing across devices.
- **HOD Sign-off Block** — countersignature checklist for every department head.
- **Tanglish glosses, formula boxes, Por Thozhil craft lessons throughout.**

### 📘 Short Film Blueprint — `arunak-shortfilm-blueprint.html`
11 steps · with structured script editor.

- **5-Beat Structure** — Setup → Disturbance → Escalation → Turn → Image, with SVG visualizer.
- **Scene Map** — 5–12 scenes with beat tagging and pages estimate.
- **Live Screenplay Editor** — slug, action, character, dialogue, parentheticals.
- **Auto Page Counter** — 210 words/page industry standard, with runtime estimate.
- **Fountain Export** — `.fountain` files open in Final Draft, Highland, WriterDuet, Fade In.
- **AI Prompt Generator** — three modes: write a scene, write dialogue, get script feedback. Builds the prompt from your blueprint data; you paste into Claude / ChatGPT.
- **Festival Strategy** — 18 festivals across 3 tiers (Cannes, Sundance, MAMI, IFFI, etc.) with deadlines and premiere rules.

### 📗 The Filmmaker's Library — `arunak-filmmaker-library.html`
Reference companion · 5 sections.

- **22 films** analyzed for one extractable craft lesson each (Tamil + Indian cinema).
- **10 director archetypes** — Mani Ratnam, Vetrimaaran, Mysskin, Pa. Ranjith, Selvaraghavan, Lokesh Kanagaraj, Karthik Subbaraj, Bala, Thiagarajan Kumararaja, Pushkar–Gayathri.
- **50 craft rules of thumb**, attributed where source is known.
- **Equipment & Cost Estimator** — Chennai 2024–25 indicative ranges for camera, lens, lighting, sound, crew, post, with a working calculator.
- **72-film watch list** — three films per blueprint step, deep-linked to the matching step.

### 🏛️ The Studio — `index.html`
Central hub with:

- Live progress for each blueprint (read from your local browser data)
- "Pick up where you left off" resume card
- Global search across all steps, films, directors, glossary terms
- Master index with ✓ / ◐ completion markers
- Activity log of recent edits
- Cross-blueprint export / import / reset

---

## How it works

- **No backend.** Everything saves to your browser's `localStorage`.
- **No tracking.** No analytics, no cookies, no servers.
- **Cross-device** via Export → Import. Or set up the optional Supabase sync inside the Feature Blueprint.
- **Works offline** once the page is loaded.

### Data location
Each blueprint stores under its own key. Open the browser dev tools → Application → Local Storage → your domain to inspect.

```
arunak_filmmaker_combined_v1   // feature blueprint
arunak_shortfilm_blueprint_v1  // short blueprint
arunak_library_calc_v1         // equipment calculator
arunak_studio_activity_v1      // activity log
arunak_studio_prefs_v1         // hub preferences (dark mode, etc.)
arunak_note_*                  // per-field private notes
```

---

## Setup — local

1. Download all the files into one folder (keep them together — the cross-links are relative).
2. Double-click `index.html`.
3. That's it.

## Setup — GitHub Pages

This repo is already set up to publish via GitHub Pages. The live site is at the URL shown in **Settings → Pages**.

To enable Pages on a fork or your own copy:
1. Settings → Pages → Source: **Deploy from a branch**, Branch: `main`, Folder: `/ (root)`.
2. Save. Wait ~1 minute.
3. Open `https://YOUR-USERNAME.github.io/REPO-NAME/`.

---

## File structure

```
filmmaker-studio/
├── index.html                              # the hub — start here
├── arunak-filmmaker-blueprint.html         # feature, Vols I & II
├── arunak-shortfilm-blueprint.html         # short film blueprint
├── arunak-filmmaker-library.html           # reference companion
├── arunak-portothozhil-sample.json         # pre-filled sample (Por Thozhil 2023)
└── README.md                               # this file
```

Open the Feature Blueprint and click the **SAMPLE** button in the toolbar to load the Por Thozhil sample — it shows what a fully filled-in project looks like.

---

## Keyboard shortcuts

| Shortcut          | Action                              |
|-------------------|-------------------------------------|
| `⌘ / Ctrl + K`    | Focus the global search             |
| `⌘ / Ctrl + D`    | Toggle dark mode                    |
| `⌘ / Ctrl + S`    | Save (in any blueprint)             |
| `↑ ↓`             | Navigate search results             |
| `Enter`           | Open the highlighted search result  |
| `Esc`             | Clear search                        |

---

## Design system

- **Fonts:** Fraunces (serif, headlines & body), JetBrains Mono (code, labels), Courier Prime (screenplay).
- **Palette:**
  - Paper: `#f5ecd6`
  - Ink: `#1a1815`
  - Feature accent: `#b03a1f` (red)
  - Shorts accent: `#2c5d99` (cobalt)
  - Library / Vol II accent: `#a87a32` / `#1f5d4a` (gold / green)
- **Layout:** Magazine-cover hero, working-tool body, editorial section heads.
- Dark mode for every page.
- Print stylesheets — every blueprint has a "PRINT" mode for hard copies.

---

## A note on privacy & permanence

This is a local-first, browser-based tool. Your scripts and notes never leave your device unless you (a) export the JSON, or (b) opt into the Supabase sync.

That also means: **clearing your browser data will delete your work**. Export regularly. The hub's `↓ EXPORT` button in the top-right backs up everything in one file.

---

## Credits

**Curated by Arunak.** Tamil cinema lessons drawn from the work of the directors profiled in the Library — among them Mani Ratnam, Vetrimaaran, Mysskin, Pa. Ranjith, Selvaraghavan, Lokesh Kanagaraj, Karthik Subbaraj, Bala, Thiagarajan Kumararaja, and Pushkar–Gayathri.

Por Thozhil (2023, dir. Vignesh Raja) is referenced throughout as a craft case study.

Tanglish glosses are conversational Tamil–English written in Roman script — not formal Tamil. They're meant to feel like a friend explaining the idea on a chai break, not a textbook.

---

## License

Personal-use, non-commercial. If you build something with it, share back.

> *"A studio is not a building. It is the pattern of attention, decisions, and study a working filmmaker keeps."*
