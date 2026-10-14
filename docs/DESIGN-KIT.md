# The design kit — Swiss Precision, dark only

Since 14 Oct 2026 the studio is one look: **Swiss Precision** on a layered
obsidian ground, one **violet** accent, **dark only**. This file is the
reference for the tokens and the component kit every page is built from.

- Tokens: `src/styles/tokens.css` (colour, type, space, radii, motion)
- Shapes: `src/styles/skins/studio.css` (the `--sk-*` contract in `skins/_contract.css`)
- Faces: `src/styles/fonts.css` (self-hosted, no Google Fonts host)
- Components: `src/styles/kit.css` + `src/ui/kit/*.js`, one import path `src/ui/kit/index.js`
- Showcase: `kit.html` — dev only (`npm run dev` → `/kit.html`, `/kit.html#modal`).
  Not a build input, so never built, precached or linked.

## How to change the look

**Edit `tokens.css` (and, for shapes, `skins/studio.css`). Nothing else.**
`kit.css`, `modules.css` and the ~90 page sheets read tokens and `--sk-*`
variables only; a raw colour outside `tokens.css` fails the grep in CLAUDE.md
invariant 4, and a literal radius in a rule is a shape nothing can override.
If a value you need is not a token, add the token.

## Tokens

### Surfaces (depth by luminance + hairline, never a soft shadow)

| token | value | use |
| --- | --- | --- |
| `--surface-canvas` (`--paper`) | `#0D0E13` | the page, dead gutters |
| `--surface-rail` (`--paper-sunk`, `--chrome`) | `#121318` | rail, band, dock, inset fields, table heads |
| `--surface-card` (`--paper-raised`) | `#1A1B21` | cards, panels, strips |
| `--surface-elevated` (`--panel`) | `#22232B` | modals, menus, popovers, toasts |
| `--surface-hover` / `--surface-active` | `#2A2B35` / `#343542` | interaction fills |
| `--border-hair` (`--rule-hair`) | white 8% | every hairline at rest |
| `--border-strong` (`--rule`) | white 16% | hover, focus, seams |
| `--border-focus` | `#8B5CF6` | focus rings, active outlines |

### Ink

`--ink` `#EDEDF2` (the thing itself) · `--ink-body` `#C7C4D7` (running text) ·
`--ink-muted` `#94A3B8` (secondary; 4.7:1 on the active fill). `--ink-faint` is
**not a text colour** (lines, swatches only — verify fails it as `color`).

### Accent

| token | value | use |
| --- | --- | --- |
| `--accent-primary` | `#8B5CF6` | the violet as a MARK: focus, selection bar, outlines, glows, dots, meters |
| `--brand` / `--cta-fill` | `#7C3AED` | a violet FILL that carries white text (5.7:1) |
| `--brand-hover` | `#6D28D9` | its hover |
| `--brand-deep` | `#B197FC` | violet as TEXT (eyebrows, links) |
| `--brand-wash` | `#1D1832` | selected row / info ground |
| `--accent-glow` | violet 25% | the CTA glow |

White on `#8B5CF6` is 4.23:1 — under the 4.5 the gate holds — which is why a
text-bearing fill is one step deeper. Page accents still follow
`<html data-phase|data-volume>`: `--accent`, `--accent-deep` (text),
`--accent-on` (text on the fill), `--accent-hover` (the fill's hover).

### Data colour

| family | tokens |
| --- | --- |
| Time of day | `--strip-day` `#D6A44A`, `--strip-night` `#60A5FA`, `--strip-dusk` `#F472B6`, `--strip-dawn` `#A78BFA`, each with `-bg` (12% wash) and `-ink` (badge text); classes `.hue-day/-night/-dusk/-dawn` |
| Company move | `--strip-move`, `-bg`, `-ink` |
| DOOD | `--dood-sw` (emerald), `--dood-w` (violet), `--dood-h` (amber), `--dood-wf` (crimson), each `-bg` / `-ink`; `--dood-d-ink`, `--dood-empty` |
| Status | fills `--status-success` `#10B981` / `--status-warning` `#F59E0B` / `--status-danger` `#EF4444`; text `--ok-deep`, `--warn-deep`, `--danger`; washes `--ok-wash` …; hairlines `--ok-line`, `--warn-line`, `--danger-line`, `--info-line` |
| Elements | `--el-*` via `.hue-el-cast` … `.hue-el-dressing` (`--hue`, `--hue-deep`, `--hue-wash`) |
| Phases | `--feature/--library/--plan/--shoot/--visualize/--shorts` via `.sh-ph-*` / `.hue-*` |

A fill is never a text colour: text takes `-deep` / `-ink` / `-on`.

### Type

| token | face | use |
| --- | --- | --- |
| `--f-display` (`--face-display`) | Space Grotesk | page titles, headings, panel titles |
| `--f-body` / `--f-sans` (`--face-sans`) | Inter | interface and running text |
| `--f-mono` | JetBrains Mono | eyebrows, labels, table heads, eighths, timecodes, DOOD codes |
| `--f-editorial` | Playfair Display *italic* | ONLY the project title / cover preview and the landing tagline |
| `--f-script` | Courier Prime (Noto Sans Tamil LAST) | screenplay text |

Catamaran (Tamil subset only) follows every UI face for Tamil glyphs. Page
titles are upright (`--face-accent-style: normal`). Figures that must align
use `.k-mono` / `.k-num` (tabular-nums). Scale: `--t-nano` 9 · `--t-micro` 11 ·
`--t-tiny` 12 · `--t-ui` 13 · `--t-small` 14 · `--t-base` 16 · `--t-lg` 18 ·
`--t-xl` 22 · `--t-2xl` 28 · `--t-3xl` 36.

Fonts are self-hosted from `@fontsource` (latin + latin-ext). Inter, Space
Grotesk and JetBrains Mono (latin) are preloaded by the `fms-font-preloads`
plugin; the rest load on demand. The Material Symbols icon font is cut at
build time from `navigation.json` + `section-icons.json`
(`scripts/lib/icon-font.mjs`, HarfBuzz): **a kit icon must be listed in
`section-icons.json` `icons`**, and a misspelt name fails the build.

### Shape, space, height

Radii: `--radius-sm` 4 (micro controls, tags, DOOD cells) · `--radius` 6
(fields, buttons) · `--radius-lg` 8 (cards, panels) · `--radius-xl` 12 (modals)
· `--radius-pill` (status badges and the one primary CTA only). Skin:
`--sk-radius` 8, `--sk-btn-radius` 6, `--sk-field-radius` 6, `--sk-modal-radius`
12, `--sk-card-pad` 12/16, `--sk-hue-rule-w` 3px. Heights: `--h-compact` 28,
`--h-control` 32, `--h-field` 36, `--h-badge` 18. Space: 4px base (`--s1`…`--s10`,
plus `--s-half` 2, `--s1h` 6).

### Light surfaces (the only three)

`--print-*` (print / PDF), `[data-surface="paper"]` (the legal pages carry it on
`<html>`; any element can), and `--paper-page*` (the screenplay's paper page).

## Components

All builders are pure functions over `h()` returning DOM. No inline handlers:
pass `action` (→ `data-action`) and handle it with the page's `delegate()`.
Null children are skipped. `attrs` copies extra attributes (a `data-key` goes
here, untouched — the kit never invents a storage key).

```js
import { button, badge, pageHeader /* … */ } from '../ui/kit/index.js';
```

| component | API | example |
| --- | --- | --- |
| Button | `button({label, variant:'primary'\|'secondary'\|'ghost'\|'danger', size:'sm'\|'md'\|'lg', icon, iconOnly, pill, block, action, href, disabled})`, `buttonGroup(btns)` | `button({ label: 'Lock draft', variant: 'primary', icon: 'lock', action: 'lock' })` |
| Badge | `badge({label, tone:'ok'\|'warn'\|'danger'\|'info', dot, icon, tag, solid})` | `badge({ label: 'Synced', tone: 'ok', dot: true })` |
| Time of day | `todBadge(tod, {label})`, `todKey(tod)` | `todBadge('NIGHT', { label: 'Night ext' })` |
| INT/EXT | `intExtBadge(v)` | `intExtBadge('EXT')` |
| DOOD | `doodCode(code)` — SW / W / H / WF / D / '' | `doodCode('SW')` |
| Chip | `chip({label, category, count, showCategory, removable, action, value})` | `chip({ label: 'Thorne', category: 'cast', removable: true })` |
| Page header | `pageHeader({eyebrow, title, sub, actions, meta, level})`, `eyebrow(parts)`, `projectTitle(text)` | `pageHeader({ eyebrow: ['Breakdown', 'Scenes'], title: 'Breakdown.', actions: [btn] })` |
| Stat | `statCard({label, value, unit, note, noteTone, hue})`, `statStrip(items)` | `statStrip([{ label: 'Scenes', value: 36 }])` |
| Panel | `panel({eyebrow, title, meta, actions, body, foot, flush})` | `panel({ eyebrow: 'Cast', meta: '12', body: list })` |
| Segmented | `segmented({label, name, options, value, quiet, action})`, `selectSegment(seg, v)`, `wireSegmented(root, onChange)` | `segmented({ name: 'sort', value: 'day', options: [...] })` |
| Field | `field({kind:'text'\|'mono'\|'select'\|'eighths'\|'timecode'\|'textarea'\|'number', label, meta, hint, error, value, options, addon, trail, attrs})`, `fieldInput(el)`, `check({label, checked})`, `formatEighths`, `parseEighths` | `field({ kind: 'eighths', label: 'Script fraction', value: 11, addon: 'Pages' })` |
| Table | `table({columns:[{key,label,num,render}], rows, stickyFirst, center, todayCol, maxHeight, empty, label})` | `table({ columns, rows, stickyFirst: true, todayCol: 'd4' })` |
| Strip | `strip({tod, intExt, scene, slug, pages (eighths), cast, day, selected, action, menuAction})`, `stripBanner({label, icon})`, `stripList(items)` | `strip({ tod: 'DAY', intExt: 'EXT', scene: '42A', slug: 'EXT. CLIFFS - DAY', pages: 11 })` |
| Modal | `ask`, `askDanger`, `tell`, `askText` (= `src/ui/dialog.js`) with `eyebrow, icon, tone, notice, typeToConfirm` | `ask({ eyebrow: 'Security protocol', icon: 'lock', title: 'Lock draft', typeToConfirm: 'LOCK' })` |
| Toast | `toast(msg, {type, action, onAction})`, `toastSuccess/Error/Info` (= `StudioUI.toast`, restyled) | `toastSuccess('Saved')` |
| Empty state | `emptyState({icon, title, body, actions})` | `emptyState({ title: 'No scenes yet', actions: [btn] })` |
| Meter | `meter({label, value, max, tone, hue, show:'pct'\|'ratio'\|false, size})`, `setMeter(el, v, max)` | `meter({ label: 'Scheduled', value: 30, max: 36, show: 'ratio' })` |
| Stage card | `stageCard({num, phase, title, body, status, progress, next, href, current})` | `stageCard({ num: 2, phase: 'screenplay', title: 'Screenplay', progress: { value: 80 } })` |
| Notice | `notice({tone:'info'\|'warn'\|'danger'\|'ok', title, body, icon, action, banner, live})` | `notice({ tone: 'warn', title: 'Note', body: '…' })` |

CSS-only pieces: `.k-eyebrow`, `.k-mono`, `.k-num`, `.k-project-title`,
`.k-btn--pill`, `.k-badge--tag`.

Two deliberate **takeovers** live in `kit.css`: the toast (`.toast-host .toast`)
and the dialog (`.dlg.k-modal`, built by `dialog.js`). Both use doubled-class
selectors so the result never depends on stylesheet order. The dialog keeps
every class the proofs read (`.dlg`, `.dlg-overlay`, `.modal-actions`,
`.mbtn(.primary)`, `.dlg-field`, `.dlg h3`); its × close is not an `.mbtn`.
