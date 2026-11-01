# social/ — the Instagram launch kit

Last reviewed: 2026-10-19

Generated images and copy for announcing FilmMakerStudio on Instagram. This
folder is OUTSIDE `public/` on purpose, so none of it ships with the site.

| File | What it is |
| --- | --- |
| `poster-1.png`, `poster-2.png`, `poster-3.png` | The three announcement posters (announcement, what it is, who it is for). 1080x1350 (4:5). |
| `feature-01.png` to `feature-15.png` | Fifteen feature posters, one per area (Story, Screenplay, Pre-production, Production, Post-production, Library). 1080x1350. |
| `instagram-dp.png` | Profile picture, 1080x1080. |
| `instagram-dp-preview.png` | Proof of the circular crop at 320 / 150 / 56 / 40px. |
| `CAPTIONS.md` | The copy: profile name and bio, a caption for each poster, notes before posting. |

## Regenerating

```bash
node scripts/make-posters.mjs
```

There is no npm script for it. It needs the `sharp` dependency. It rewrites
every PNG above, and also writes matching `.svg` sources next to them, which
are gitignored (`social/*.svg`). Colours are read from
`src/styles/tokens.css`, the name and tagline from `src/data/brand.json`.
Every number on a poster is counted from `src/data` at draw time, and every
feature named must be a real module id in `navigation.json`; the script throws
on `undefined`/`NaN` or an unknown module. If a figure is wrong, fix the data,
not the poster. After a palette or brand change, regenerate.

Related generators that are NOT part of this kit: `npm run og` (the link
preview image, `public/og.png`), `npm run icons` (PWA icons). The kit's posters contain
no screenshots and no invented social proof.

## Editing the copy

`CAPTIONS.md` is hand-written and is not regenerated. If a poster's wording
changes in `scripts/make-posters.mjs`, update its caption by hand. The star on two feature headings in `CAPTIONS.md` marks the two strongest
features (auto-tagging and Chennai-rate budgeting); it is editorial, not in the script.
