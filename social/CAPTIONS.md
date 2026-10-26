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
refuses to draw `undefined` or `NaN`, throws if a poster cites a module that
does not exist, and throws if it cites one that is switched off on every
plan (`plans: []` in `src/data/plan-matrix.json`).

**Before posting anything here**, fill every `{PLACEHOLDER}` from the console
that day: `{TRIAL_LENGTH}` and `{TRIAL_OPENS}` from `trial_offer()`,
`{RISE_DATE}` from `price_notice()` (`docs/MARKETING-PLAYBOOK.md` §0 rules 3
and 6). No date and no trial length is ever typed from this file.

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
Built for Tamil units. Less than a tea a day.
```

Alternates:

- *Beginner-first:* You have never made a film. Here is the desk: story, screenplay, schedule, budget and call sheets, in your browser. Built for Tamil units.
- *Tool-first:* A working desk for independent filmmakers. Story → screenplay → schedule → set → delivery. Works offline. A year for less than a cup of tea a day, nothing renews by itself.

**Link:** `https://filmmakerstudio.in/start?src=ig-bio&utm_campaign=profile`
— point at `/start`, **not** the root. The root sits behind the site gate and
bounces a stranger straight back out; `/start` is the page built to sell. The
`src` tag is how the console's per-source funnel counts the bio
(`docs/MARKETING-PLAYBOOK.md` §3); a post or story link uses `ig-post`,
`ig-reel` or `ig-story` instead. Every `ig-*` tag shows in the console as
ONE `instagram` row: the tag is for your own link notes, and the console
does not split bio from post from story.

**Category:** Software, or Education. Not "Film".

---

## The three announcement posters

Post these first, in this order: announce → explain → convert.

### poster-1.png — the announcement

> You have never made a film. Here is the desk.
>
> Story, screenplay, breakdown, schedule, budget and call sheets, in your
> browser, each reading the same scenes. Tamil dialogue with English slug
> lines, budgets in rupees from Chennai rates.
>
> Try {TRIAL_OPENS} free for {TRIAL_LENGTH}. No card. Link in bio.

### poster-2.png — what it is

> One desk, from idea to delivery.
>
> Story → Screenplay → Pre-production → Production → Post. Write the
> script, break it down, schedule the shoot, budget it, print call sheets, run
> the set, track the cut.
>
> Nothing to install. Works offline. Your work lives in your browser first;
> signed in, it syncs.

### poster-3.png — who it's for

> Not a course to watch. A desk that walks you through it.
>
> Import the screenplay once and the breakdown, the stripboard and the call
> sheet read the same scenes. A library of films, directors and rules of
> thumb open beside you. Made for a first film in Tamil Nadu — Chennai rates
> with sources, CBFC checklists, festival deadlines. Tamil dialogue, English
> slugs.
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

> Every film starts as half-thoughts scattered across fourteen browser tabs.
> Put them on sticky notes in this film's vault, pin each to a beat or a
> scene, and drag them into order — kept with the project instead of lost
> in your history. (With the Chrome extension, on Intermediate and up,
> clippings from the web land here too.)

### feature-03.png — Script · Screenplay

> Just write. Slug lines, action, character, dialogue — the layout happens as
> you type. Tamil dialogue with English slug lines, the way scripts here are
> actually written. Export to PDF, Fountain or Final Draft.

### feature-04.png — Drafts & revisions · Screenplay

> Numbered drafts you can compare, restore and print. Nothing is ever written
> over. See exactly what changed between Draft 3 and Draft 4, and go back if
> Draft 3 was right.

### feature-05.png — Import a script · Screenplay

> Already written it somewhere else? Bring it in — Fountain, Final Draft,
> Word, PDF or plain text — and every stage reads from it. Scenes, characters,
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

> Read a film, then write your own. Films worth studying and the directors
> behind them, rules of thumb with the reasons, and craft notes on writing
> for emotional impact and on story beats. Open from any page while you work.

---

## Notes before you post

**No call to action is baked into the captions** (poster-1 aside). Add
"Link in bio" or "Free trial, link in bio" per post, so you can tune it
rather than repeat the same line eighteen times.

**★ marks the two to lead with.** Auto-tagging (06) suggests a scene's
elements from its own text, and the budget (10) starts from indicative Chennai
rate bands, and the few figures re-read against a public page show that
page and the day it was read; both are checkable in the product. Say what they do, never that nothing else does it: no competitor
claim goes in a caption unless the owner has read the source that day
(playbook §4.8). If you want the run front-loaded, move those two earlier
than their stage order suggests.

**No hashtags here on purpose.** Generic ones (#filmmaking #shortfilm) bring
bots. The ones worth having are local and specific — #chennaifilmmakers,
#tamilcinema, #kollywood, #indiefilmindia — and you know that scene better
than the data does.

**No price appears on any poster.** A rupee figure is not durable: the
founding prices are scheduled to rise on `{RISE_DATE}` (the server's date,
read from `price_notice()` the day you post; the owner is moving it to the
end of 2026, playbook §6 step 2), and a post is forever.
What IS durable, and may go in any caption: **a plan is one payment for one
year, nothing renews by itself**, and "less than a cup of tea a day", which
holds at every tier before and after the rise. Never write "pay once",
"lifetime" or "own it forever" — plans have been yearly since 21 Oct 2026.
A price card, if you make one, is a separate story or post with the figures
read from `price_notice()` that day.

**The door is the trial now, not an invite.** The offer is a free trial,
no card, starting only when the visitor presses start. The owner decided
(26 Oct 2026) on 3 days of the whole studio; a caption says so only once
`trial_offer()` reads it (`trial_scope` full, after schema §60, with the
Pro trial plan; playbook §6.1). Otherwise `{TRIAL_OPENS}` is "the tools on
two sample films". A whole-studio trial keeps the no-plan limits (one film
in the cloud, no share links, no collaborators), so no caption promises
sharing or a team on the trial. `poster-1.png` was regenerated on 26 Oct
2026: it reads "Now open" and "Free trial · No card · Nothing renews by
itself", with no length and no "invite-only".

**Say which plan a feature is on.** Call sheets, Shoot Day (13), Edit Log and
Deliverables (14) and the AI tools are Pro; breakdown, auto-tagging (06),
cast matrix (08), shot list and storyboard (09), budget (10), stripboard (11),
contacts/sides/reports (12) and the Chrome extension are Intermediate and up;
writing, drafts and import (03–05), story (01) and the Idea Vault (02) are
on every plan. Add "(Pro)" or
"(Intermediate and up)" to the caption for those posters.

**Switched-off modules are never named (26 Oct 2026).** The Lookbook, the
glossary, the dissected feature, the case studies, the pitch deck, songs and
media are switched off on every plan (`plans: []` in
`src/data/plan-matrix.json`, so `isDisabledEverywhere()` hides them). Their
phrases are out of the captions AND the images: `feature-09.png` (no
Lookbook), `feature-15.png` (the open Library shelves only), `poster-2.png`
(no tool count, which included switched-off modules), `poster-3.png` (no
glossary, dissection or guided-steps count; the stage guides those counted
are retired) and `poster-1.png` were regenerated from
`scripts/make-posters.mjs`, which now refuses to cite a switched-off module.
The other feature images were not redrawn: their wording did not change.
The script draws in whatever sans the machine has (see its header), so
look at a redraw before posting it.

**Cadence:** 18 posts at 3–4 a week is roughly 4–5 weeks.
