# Audience test — plan

Drafted 21 Oct 2026. Status: **plan only, nothing built.**

A new AI Desk task. A panel of simulated viewers reads the screenplay
(or, in quick mode, the synopsis and beat sheet) and says, scene by
scene, where each of them was hooked, lost, bored or ready to walk out.
The panel's scores become an engagement curve drawn beside the rules'
tension curve on the Script analysis tab.

The idea comes from MiroFish (github.com/666ghj/MiroFish), which runs
thousands of LLM agents in a simulated social network. **No MiroFish
code is used or adapted.** It is AGPL-3.0, and copying any of it into a
paid product would oblige us to publish the studio's source. Only the
idea crosses over: personas that react independently, a combined
result, and a viewer you can question afterwards.

---

## 1. What the writer sees

1. On `screenplay.html` → Script analysis, the AI pill gains
   **Audience test**, beside Notes on tension, Coverage and Scene notes.
2. The Desk opens on the input view:
   - the panel: 8 viewers by default, chosen from presets (§3), each
     can be removed, and the writer can add one in a sentence
     ("a 55-year-old who only watches Rajinikanth films");
   - the cost line, worked out the way coverage does it: "The whole
     screenplay — 112 scenes — in 6 parts, then one request for the
     panel's verdict. About 7 requests, roughly 70,000 tokens";
   - the first part's prompt, cut off at 6,000 characters, as coverage
     shows it.
3. **Run** streams progress: "Part 3 of 6 — the panel has read 58
   scenes". **Stop** leaves a checkpoint, and **Resume** does not send
   finished parts again. This is coverage's checkpoint mechanism.
4. The answer is a list (`kind: 'list'`):
   - one row per viewer: verdict (*would recommend* / *mixed* /
     *walked out at Sc 41*), the moment that hooked them, the moment
     they were lost, one line in their own voice;
   - a few panel-wide rows: "6 of 8 lost interest between Sc 38 and
     Sc 47", "Only the festival programmer stayed for the ending", and
     "The panel split on Sc 72";
   - the note says **"Simulated by a model, not by real viewers"**,
     plus any scenes or quotes that were dropped (§5).
5. **Accept** keeps the ticked rows as a document in the script's
   Documents tab, which is how coverage keeps its report. The
   engagement curve is drawn from that document (§6). Undo removes it.

Quick mode (phase 4) runs the same task from `story.html` on the
synopsis and the beat sheet. It costs one request, so the writer can
test the story before a page of screenplay exists.

---

## 2. What it is not, and must say so

- A model playing eight people is **not** audience research. Every
  surface that shows a result carries the "simulated" line, as coverage
  carries "Written by a model, not by a person". The result is never
  called a prediction or a score of the film.
- Personas are defined by **viewing habits and taste**: what they
  watch, where, how often, what bores them, which languages. They are
  never defined by religion, caste, ethnicity or politics. They are
  never real people, and they are never named after a real critic or
  star. The writer's own sentence persona is sent as written.
- Models tend to make every persona agree. The prompt asks each viewer
  to judge by their own tastes and not to agree for its own sake. The
  reader then measures the spread of scores (§5). If the spread is
  under a threshold, the note says **"The panel barely disagreed, so
  treat this as one reader's view"** and does not dress it up as
  eight.

---

## 3. The panel

The presets go in a new file, `src/data/audience-personas.json`,
because content lives in JSON (invariant 2). Each entry has an `id`, a
`label`, a `who` sentence (viewing habits only) and `cares` (what they
reward and punish). These ids never become storage keys, but they are
written into saved documents, so they must never be renamed once
shipped.

Proposed presets. The owner approves the list.

| id | label | who |
| --- | --- | --- |
| `family-theatre` | Family weekend viewer | Goes to a Tamil theatrical release with family twice a month |
| `mass-fan` | Mass-film fan | First-day-first-show for star vehicles; wants elevation moments |
| `ott-binger` | OTT binger | Watches on a phone at 1.25×, skips slow openings |
| `genre-fan` | Genre fan | Follows the project's `genre` closely and knows its conventions |
| `festival` | Festival programmer | Watches 300 films a year; rewards a distinct voice |
| `distributor` | Distributor | Thinks about who buys a ticket and what the trailer is |
| `teen` | 17-year-old | Watches clips more than films; quick to call something cringe |
| `non-tamil` | Subtitle viewer | Watches Tamil films with English subtitles; context must carry |
| `parent` | Parent of young kids | Watches after 10 pm, tired; leaves when confused |
| `critic` | Film-society regular | Reads screenplays; punishes convenience and cliché |

The default panel of 8 is derived, not fixed:

- `format === 'short'` → festival, critic, genre fan and subtitle
  viewer come first (a short film's audience is a jury);
- `story.audience` (already typed, or set by the genre-comps task) is
  added as a persona sentence of its own;
- `story.genre` fills in the genre fan's `who`.

Custom personas are **not saved** between visits. They exist in the
Desk input, and in the saved document if the run is kept. No new
storage key is needed for them.

---

## 4. How a run works

The cost follows coverage, not MiroFish: **one request per part, not
one per viewer.** Each part's request sends the whole panel and the
scenes together and asks for every viewer's reaction in one structured
reply. A feature therefore costs what coverage costs, plus one
request, instead of eight times as much.

- **Parts:** `AI.planCoverage(elements)`, the same 36,000-character
  scene-aligned batching. No second slicer (open item 4 fixed exactly
  that).
- **Carrying memory between parts:** each part's reply includes a
  one-line state per viewer ("bored since Sc 31, still hoping for the
  brother"). That line is sent with the next part. It is the only
  memory the panel has. A viewer who walked out stops scoring, and the
  prompt says so.
- **The reply per part, kept small:**
  - `scores`: for each viewer, one integer from −2 to +2 per scene
    (compact arrays, not prose per scene);
  - `moments`: at most 3 per viewer per part, each with
    `{ scene, kind: hooked|lost|bored|walkout|moved, quote?, note }`;
  - `state`: one line per viewer.
- **Final request:** the per-viewer states and the score curves (not
  the pages) go in, and each viewer's verdict and the panel-wide rows
  come out.
- **Quick mode:** synopsis plus beat-sheet steps in one request, with
  scores per *beat* instead of per scene.
- **Effort:** `'medium'` for the parts, as tension-notes uses.
  `maxTokens` is sized from the panel × scenes in the part.
- **Dialogue language:** the same `scriptLang` handling coverage uses,
  so Tanglish dialogue is read as dialogue and not flagged as errors.

---

## 5. Checks on the reply (the reader)

These are pure functions in `src/lib/audience-model.js`, each tested:

- a moment naming a scene that is not in this part is **dropped and
  counted**;
- a `quote` that is not word for word in the script is **stripped and
  counted**, using `AI.quoteChecker`, the same check as coverage.
  "N quotes were removed because they were not in your script" goes in
  the note;
- scores are clamped to −2..+2, a missing score is `null` (never 0),
  and a viewer's scores after their walkout are `null`;
- an unknown persona id in the reply is dropped;
- spread: the mean pairwise distance between viewers' curves. Under
  the threshold, the "barely disagreed" note from §2 is added;
- an empty or unusable reply fails with a sentence. It never leaves an
  empty list that reads like a clean result.

---

## 6. Storage — no new key

- Accept writes **one document** into the script blob's `documents`
  array, which is the array the coverage report uses. It holds
  `{ kind: 'Notes', title: 'Audience test — 8 viewers', body: <prose>,
  audience: { sig, panel, curves, moments, verdicts, model, at } }`.
  The prose `body` makes it readable in the Documents tab and in a
  backup. The `audience` field is what the curve is drawn from.
- The script blob already syncs and is already in the backup, so there
  is **no new `localStorage` key, no registry change, no schema
  section, and no new `project_data` scope.**
- An interrupted run's checkpoint is kept the way coverage keeps its
  own: a partial document with `audience.checkpoint`, replaced on
  completion. Undo restores the partial exactly. This logic goes in a
  small `src/lib/audience-store.js`, modelled on `coverage-store.js`
  rather than added to it, so coverage's store is left alone.
- `sig` is `AI.scriptSignature(elements)`. When the script changes
  after a run, the curve is drawn with "from an earlier draft" on it,
  and is never hidden or deleted.

---

## 7. The curve on Script analysis

- If the newest audience document exists, the tension panel draws the
  panel's mean score per scene as a second line over the rules'
  tension curve. Each viewer can be toggled on as a thin line.
- Colours come from tokens only: the existing chart and phase tokens,
  never a new hex (invariant 4). If text sits on a fill, it uses
  `--brand` and never `#8B5CF6`.
- Walkouts are marked on the axis. Hovering or focusing a scene shows
  each viewer's moment for it.
- Nothing is computed on save. The curve is derived at render time
  from the stored document, the same way the analysis tab treats
  everything else.

---

## 8. Plan tier

Audience test runs under the existing **`ai_tools`** capability
(Pro, plus the trial), like every other Desk task. That means **no
`plan-matrix.json` row, no §36 regeneration and nothing to run live.**
A separate row could be added later, but it costs a regeneration of
`plans.features` and a live run of §36. That is a bad trade for one
task.

---

## 9. Files

| File | Change |
| --- | --- |
| `src/data/audience-personas.json` | new: the presets (§3) |
| `src/lib/audience-model.js` | new, pure: default panel, prompts, schemas, reader and checks, curves, spread, prose for the document |
| `src/lib/ai.js` | `runAudienceTest(job, { onStatus, onCheckpoint, signal })` beside `runCoverage`, through the one `callModel()`; and `buildAudiencePartPrompt` / `buildAudienceSynthPrompt` re-exported for the Desk's input view |
| `src/lib/audience-store.js` | new: partial/finished document in `documents`, exact undo |
| `src/lib/ai-tasks.js` | `audienceTask` (`kind: 'list'`, `identity` = `'audience:' + sig`), added to `ALL_TASKS` and to the header's WRITES list; loads the two new modules in `loadAll()` |
| `src/ui/script-analysis.js` | the pill entry and the curve overlay |
| `src/pages/story.js` | phase 4 only: quick mode on the Story pill |
| `src/data/section-icons.json` | only if a new icon is used (`groups` is a candidate); a missing name prints as a word |
| `scripts/test-audience.mjs` | new, Node, against `scripts/fake-ai.mjs` for both providers |
| `scripts/prove-ai-coverage.mjs` | one more scenario: run, Stop, Resume, Accept, Undo in a real page |
| `package.json` | `test:audience`, added to `test:all` |
| `CLAUDE.md`, `docs/HISTORY.md` | one row and one item when it lands |

`connect-src` is unchanged, because there is no new host.

---

## 10. Phases

Each phase ends with the gate: `npm run test:all`, `npm run
build:open`, `npm run verify`, and `prove:ai-coverage` from phase 2
on. Work goes on `develop`, per `docs/BRANCHING.md`.

1. **Model, no UI.** `audience-personas.json`, `audience-model.js` and
   `test:audience` covering the default panel per format, prompt
   shape, every check in §5, spread and the document prose.
2. **Runner and task.** `runAudienceTest`, `audience-store.js` and
   `audienceTask`. Tests against faked Anthropic (LF frames) and
   Gemini (CRLF and a `thought` part): batching above one part, Stop
   leaves a checkpoint, Resume does not re-send, the key is in a
   header, and nothing in `ai.js` writes storage.
3. **Script analysis UI.** The pill entry, the curve and the
   "earlier draft" state. Check the tab at 1440, 1100 and 390 in a
   browser, because verify cannot see the Desk's open states. If the
   tab's visible words change, add `EXPECTED` rows, or re-baseline if
   there are more than two or three.
4. **Quick mode and Ask a viewer.** Story-page quick mode, and a
   follow-up question to one viewer through the Desk's existing refine
   path (`refineBlock`, same schema, the viewer named in the
   instruction). No new wire format.

Like every Desk task so far, it will have run only against the fake
until somebody runs it with a real key. The first real run should be
on the Dragon sample, with the owner reading the result.

---

## 11. Decisions for the owner

1. The preset list in §3: keep, cut or add.
2. Default panel size: **8** proposed (3 to 12 allowed; the presets cap a default panel at 10). More viewers
   means bigger replies, not more requests.
3. Tier: under `ai_tools` (proposed), or its own row (§8).
4. Whether quick mode (phase 4) should ship with phases 1–3 or after
   them.
