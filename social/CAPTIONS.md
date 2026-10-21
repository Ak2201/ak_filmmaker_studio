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

**Link:** `https://filmmakerstudio.in/start` — point at `/start`, **not** the
root. The root sits behind the invite gate and bounces a stranger straight
back out; `/start` is the page built to sell.

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
> Invite-only at launch. Link in bio.

### poster-2.png — what it is

> One desk, from idea to delivery.
>
> Story → Screenplay → Pre-production → Production → Post. 31 tools. Write the
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
> or plain text — and the whole studio opens around it. Scenes, characters,
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

### feature-09.png — Shot List, Storyboard, Lookbook · Pre-production

> See it before you shoot it. Plan the shots with how close the camera is and
> how it moves. Draw a frame for each. Collect the costume, set, colour and
> light you want — all attached to the scene it belongs to.

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

> Read a film, then take one apart. 122 terms in plain words, 22 films worth
> studying, a real feature dissected scene by scene, and fifty rules of thumb
> with the reasons behind them. Open from any page while you work.

---

## Notes before you post

**No call to action is baked into the captions.** Add "Link in bio" or
"Invite-only at launch 👇" per post, so you can tune it rather than repeat
the same line eighteen times.

**★ marks the two strongest.** Auto-tagging (06) and Chennai-rate budgeting
(10) are the two things nothing else in this market does. If you want the run
front-loaded, move those earlier than their stage order suggests.

**No hashtags here on purpose.** Generic ones (#filmmaking #shortfilm) bring
bots. The ones worth having are local and specific — #chennaifilmmakers,
#tamilcinema, #kollywood, #indiefilmindia — and you know that scene better
than the data does.

**No price appears on any poster.** Pay-once is true and durable; a rupee
figure is not, because the launch prices are scheduled to rise and a post is
forever. Add a price card separately once the offer is confirmed live.

**Invite-only is a real constraint, not a tactic.** If these land before you
have codes to hand out, you'll generate interest you cannot convert. Have the
invite flow ready first.

**Cadence:** 18 posts at 3–4 a week is roughly 4–5 weeks.
