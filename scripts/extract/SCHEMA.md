# Extraction schema — contract between extractors

All extractors are **deterministic node scripts** in `scripts/extract/`, run with
`node scripts/extract/<name>.mjs`, parsing the untouched originals in `legacy/`
with `linkedom` and writing JSON to `src/data/`.

Two hard rules:

1. **Nothing is lost.** Any element an extractor does not recognise is emitted as
   `{ "type": "raw", "html": "<the element's outerHTML>" }` in document order.
   Raw blocks are a valid, permanent part of the format — bespoke widgets stay raw
   until someone promotes them to a real component. An extractor must never drop
   an element silently.
2. **Order is preserved.** `blocks` is one flat array in DOM order. Prose, inputs
   and widgets interleave in the original and must interleave in the output.

## Text values

Inline markup inside prose (`<em>`, `<strong>`, `<code>`, `<br>`) is **kept as an
HTML string**; the renderer inserts it as HTML. Strip only the Tanglish spans,
which are lifted to their own field.

Tanglish appears as `<span class="tn">` or `<span class="tanglish">` nested inside
the prose element. Remove it from the parent's HTML and emit it as `tanglish`.
A block with no Tanglish omits the key entirely (do not emit `null` or `""`).

Normalise whitespace: collapse runs of space/newline to one space, then trim.

## Block types

```jsonc
{ "type": "formula", "label": "FORMULA", "eq": "<html>", "tanglish": "..." }
{ "type": "craft",   "label": "POR THOZHIL · CRAFT LESSON",
  "trade": "plain text headline", "body": "<html>", "tanglish": "..." }
{ "type": "why",     "label": "WHY THIS MATTERS", "body": "<html>", "tanglish": "..." }
{ "type": "examples", "items": [
    { "label": "VIKRAM VEDHA", "body": "<html>", "tanglish": "...", "alt": true } ] }
{ "type": "hint", "body": "<html>", "tanglish": "..." }
{ "type": "asks", "items": [
    { "key": "s1_whatif",            // the data-key, VERBATIM — never renamed
      "label": "A · The \"What If\"…",
      "placeholder": "What if...",
      "kind": "textarea" | "input" | "select",
      "size": "lg" | null,           // the existing class, if any
      "options": ["…"]               // select only
    } ] }
{ "type": "check", "heading": "BEFORE MOVING ON", "items": [
    { "key": "ck_s1_a", "text": "<html>" } ] }
{ "type": "raw", "html": "<div class=\"dept-grid\">…</div>" }
```

`data-key` values are the storage contract with every user's existing saved work.
**Copy them byte-for-byte. Never normalise, renumber or rename one.**

## Step object

```jsonc
{ "id": "step-01",        // matches the existing anchor id if the original has one
  "vol": 1,               // 1 | 2 for the feature; omit for the short film
  "num": "01",
  "title": "The <em>Spark.</em>",   // inline markup kept
  "titlePlain": "The Spark.",
  "time": "~ 1 EVENING",
  "deck": "<html>",
  "blocks": [ … ] }
```

## Files to produce

| Script | Output |
|---|---|
| `feature-steps.mjs` | `src/data/steps.feature.json` — `{ "vol1": [...], "vol2": [...] }` |
| `short-steps.mjs` | `src/data/steps.short.json` — `{ "steps": [...], "beats": [...] }` |
| `library.mjs` | `films.json`, `directors.json`, `rules.json`, `watchlist.json`, `rates.chennai.2024.json` |
| `festivals.mjs` | `src/data/festivals.json` |
| `glossary.mjs` | `src/data/glossary.json` |

## Self-check every extractor must run and print

After writing, re-read the JSON and compare **normalised visible text** (all HTML
tags stripped, whitespace collapsed) against the same region of the original
document. Print:

```
steps: 24/24   asks: 38/38   checks: 24/24   raw blocks: 9
text coverage: 99.4%  (missing: "…first 120 chars of anything dropped…")
```

Coverage below 99% means the extractor is losing content — fix it, don't ship it.
