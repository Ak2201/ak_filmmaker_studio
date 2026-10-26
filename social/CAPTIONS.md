# FilmMakerStudio — Instagram launch kit

Everything here is 1080×1350 (4:5), the tallest ratio the feed renders,
except the profile picture which is 1080×1080.

Regenerate the whole set with:

```bash
node scripts/make-posters.mjs
```

Every number on every poster is **counted from `src/data` at draw time**,
and every feature named is a real module id checked against
`navigation.json`. If a count is wrong, the data is wrong — the script
refuses to draw `undefined` or `NaN`, and throws if a poster cites a
module that does not exist.

---

## Profile

**Upload:** `instagram-dp.png` (1080×1080)
**Proof:** `instagram-dp-preview.png` — the real circle crop at 320 / 150 / 56 / 40px.
The 40px one is what people actually see in feed.

**Name field** (this one is searchable — don't waste it on the brand alone):

```
FilmMakerStudio · Filmmaking
```

**Bio** (138 characters; Instagram allows 150):

```
Learn filmmaking by making one.
Script · schedule · budget · call sheets — one desk, in your browser.
Chennai-made. Less than a tea a day.
```

Alternates:

- *Beginner-first:* You have never made a film. Start one tonight. 11 steps from an idea to a short that's ready to submit. Made in Chennai.
- *Tool-first:* A working desk for independent filmmakers. Story → screenplay → schedule → set → delivery. Works offline. A year for less than a cup of tea a day, nothing renews by itself.

**Link:** `https://filmmakerstudio.in/start?src=ig-bio&utm_campaign=profile`
— point at `/start`, **not** the root. The root sits behind the site gate and
bounces a stranger straight back out; `/start` is the page built to sell. The
`src` tag is how the console's per-source funnel counts the bio
(`docs/MARKETING-PLAYBOOK.md` §3); a post or story link uses `ig-post`,
`ig-reel` or `ig-story` instead.

**Category:** Software, or Education. Not "Film".

---

## The three announcement posters

Post these first, in this order: announce → explain → convert.

### poster-1.png — the announcement

> You have never made a film. Start one tonight.
>
> A desk that walks you through it: every step explains the craft, shows a
> worked example, asks you the questions, and checks what you wrote. 11 steps
> from the idea in your head to a short film that's ready to submit.
>
> Try it free for {TRIAL_DAYS} days on the sample films. No card. Link in bio.

### poster-2.png — what it is

> One desk, from idea to delivery.
>
> Story → Screenplay → Pre-production → Production → Post. Write the
> script, break it down, schedule the shoot, budget it, print call sheets, run
> the set, track the cut.
>
> Nothing to install. Works offline. Your work stays in your browser.

### poster-3.png — who it's for

> Not a course to watch. A desk that walks you through it.
>
> Made for a first film in Tamil Nadu — Chennai rates, crew terms, CBFC rules,
> festival deadlines. Tamil dialogue, English slugs.
>
> A year for less than a cup of tea a day. Nothing renews by itself.

---

## The fifteen feature posters

Each carries its stage's own hue from the app: Story violet, Screenplay gold,
Pre-production teal, Production pink, Post magenta.

### feature-01.png — Beats & Pacing · Story

> Write the story, then see its shape. Where it rises. Where it sags. Shown
> back to you scene by scene, so you find the slow middle before a crew does.
> Logline, synopsis, and a story bible that keeps character, conflict, stakes
> and theme in one place.

### feature-02.png — Idea Vault · Story

> Every film starts as links and screenshots in fourteen browser tabs. Clip
> them as you browse and they land in this film's vault — pictures, links,
> half-thoughts — kept with the project instead of lost in your history.

### feature-03.png — Script · Screenplay

> Just write. Slug lines, action, character, dialogue — the layout happens as
> you type. Tamil dialogue with English slug lines, the way scripts here are
> actually written. Export to PDF, Fountain or Final Draft.

### feature-04.png — Drafts & revisions · Screenplay

> Numbered drafts you can compare, restore and print. Nothing is ever written
> over. See exactly what changed between Draft 3 and Draft 4, and go back if
> Draft 3 was right.

### feature-05.png — Import a script · Screenplay

> Already written it somewhere else? Bring it in — Fountain, Final Draft, PDF
> or plain text — and every stage reads from it. Scenes, characters,
> locations, all read out of your pages. No retyping.

### feature-06.png — Auto-Tagging · Pre-production ★

> It reads your script and suggests what each scene needs: actors, props,
> vehicles, stunts, sounds. You confirm or correct. The tedious half of a
> breakdown, done in a pass.

### feature-07.png — Scene Breakdowns & Elements · Pre-production

> Mark what a scene needs once, and the film-wide list builds itself
> underneath you. Every prop, costume, vehicle and effect, listed once, with
> the scenes that need it. Nothing counted twice.

### feature-08.png — Cast Matrix & Screen Time · Pre-production

> Which character is in which scene, and who shares the most scenes with whom
> — the thing that decides who you can release early. Screen time worked out
> from the pages, not guessed.

### feature-09.png — Shot List, Storyboard · Pre-production

> See it before you shoot it. Plan the shots with how close the camera is and
> how it moves. Draw a frame for each, attached to the scene it belongs to.
> (Intermediate and up.)

### feature-10.png — Budget · Pre-production ★

> What the film will cost, line by line, starting from Chennai rates instead
> of a blank page. Every figure shows where it came from and when it was last
> checked. No invented numbers.

### feature-11.png — Stripboard, Day Out of Days, Calendar · Pre-production

> Drag your scenes into the order you'll actually shoot and group them into
> days. Day Out of Days then shows which actor works which day, so nobody is
> called in for nothing.

### feature-12.png — Contacts, Sides, Reports · Pre-production

> The unit list by department with phone and e-mail. The script pages each
> actor needs for the day, ready to print. Printable reports for what every
> scene and every shoot day requires.

### feature-13.png — Shoot Day · Production

> Today's scenes on one screen, big enough to read on set, with a mark for
> what you actually got. Shot · part · dropped — because "we got some of it"
> is the commonest outcome of a day, and a tool that can't say so gets lied to.

### feature-14.png — Edit Log & Deliverables · Post-production

> What the cut still needs, against what the shoot says it got, scene by
> scene. Then the checklist of what leaves the building: censor certificate,
> subtitles, cinema copy, festival files, with their deadlines.

### feature-15.png — The Library

> Read before you write. Films worth studying and the directors behind them,
> rules of thumb with the reasons, and craft notes on writing for emotional
> impact and on story beats. Open from any page while you work.

---

## Notes before you post

**No call to action is baked into the captions** (poster-1 aside). Add
"Link in bio" or "Free trial, link in bio" per post, so you can tune it
rather than repeat the same line eighteen times.

**★ marks the two strongest.** Auto-tagging (06) and Chennai-rate budgeting
(10) are the two things nothing else in this market does. If you want the run
front-loaded, move those earlier than their stage order suggests.

**No hashtags here on purpose.** Generic ones (#filmmaking #shortfilm) bring
bots. The ones worth having are local and specific — #chennaifilmmakers,
#tamilcinema, #kollywood, #indiefilmindia — and you know that scene better
than the data does.

**No price appears on any poster.** A rupee figure is not durable: the
founding prices are scheduled to rise (the date is the server's, read from
`price_notice()`; the owner moved it to 31 Dec 2026), and a post is forever.
What IS durable, and may go in any caption: **a plan is one payment for one
year, nothing renews by itself**, and "less than a cup of tea a day", which
holds at every tier before and after the rise. Never write "pay once",
"lifetime" or "own it forever" — plans have been yearly since 21 Oct 2026.
A price card, if you make one, is a separate story or post with the figures
read from `price_notice()` that day.

**The door is the trial now, not an invite.** Since 26 Oct 2026 the offer
is a free trial on the two sample films (3 days once the owner sets
`trial_minutes` 4320; playbook §6.1). A trial somebody starts with the
button cannot open their own film, whatever the console's scope says
(`start_trial()` stores `sample` for every signup trial), so no caption says
"whole studio" or "your own film" about the trial. Fill
`{TRIAL_DAYS}` from `trial_offer()` the day you post, and do not post
poster-1 until the trial is live. **`poster-1.png` itself still draws
"Invite-only at launch."** (`scripts/make-posters.mjs`, line ~152): change
that line to the trial and regenerate before posting it, or post poster-2
first.

**Say which plan a feature is on.** Call sheets, Shoot Day (13), Edit Log and
Deliverables (14) and the AI tools are Pro; breakdown, auto-tagging (06),
cast matrix (08), shot list and storyboard (09), budget (10), stripboard (11)
and contacts/sides/reports (12) are Intermediate; writing, drafts and import
(03–05), story (01) and the Idea Vault (02) are Basic. Add "(Pro)" or
"(Intermediate and up)" to the caption for those posters.

**Why feature-09, feature-15 and poster-2 were reworded (26 Oct 2026).**
The Lookbook, the glossary, the dissected feature and the case studies are
switched off on every plan (`plans: []` in `src/data/plan-matrix.json`, so
`isDisabledEverywhere()` hides them), so their phrases came out of the
captions; the Library still opens with its other shelves. Poster-2's caption
lost "31 tools" because that count includes switched-off modules; it names
no number now. **The poster IMAGES still carry the old wording**:
`feature-09.png` is titled with the Lookbook, `feature-15.png` and
`poster-2.png` may show the old counts. Regenerate them
(`scripts/make-posters.mjs`) or skip them until they match. Do not mention
the pitch deck, songs or media modules either.

**Cadence:** 18 posts at 3–4 a week is roughly 4–5 weeks.
