/* ============================================================
   A NAMED BEAT SHEET, AS A WORKED EXAMPLE
   ------------------------------------------------------------
   Step 08 of the feature blueprint asks the writer for fifteen
   beats and, until now, showed them none. Its own copy said
   "Examples from VV and 96 included as compasses" — a promise the
   page did not keep, because the examples were never rendered.

   The content for keeping it already existed. src/data/studies.json
   carries four films' Save the Cat sheets, split in two halves on
   purpose:

     THE METHOD   beat names, page targets and the structural job
                  each beat does. Facts about the sheet, written
                  once, not per film.
     THE FILM     how this picture discharges that beat, and what to
                  steal from it. Keyed by beat id.

   study.html already renders both halves at length. THIS IS A
   SECOND VIEW OF THE SAME MODEL, not a second copy of it — the rule
   at the top of CLAUDE.md, and the reason this module takes a slug
   and reads through src/lib/studies.js rather than being handed any
   prose.

   WHY IT IS ONE CARD AND NOT FIFTEEN. The obvious shape is fifteen
   .example blocks, one per beat. It is the wrong one: the reader is
   filling in a fifteen-row table directly below, and fifteen cards
   between the instruction and the table pushes the work off the
   screen. One card holding an ordered list reads as "here is how a
   film did it" and costs about a screen.

   IT IS NOT AN .example, AND THAT WAS A CORRECTION. The first
   version rendered into the step language's own .examples /
   .example pair, on the reasoning that an existing surface is an
   already-measured surface. The gate disagreed, correctly:

     ✗ feature -> worked examples: colour no longer distinguishes
       them (3 distinct hue(s), thinnest rule 1px)

   .example is the class for a card whose LEFT RULE CARRIES DATA —
   which of two films this one is — and modules.css gives a group
   with nothing to contrast (`.examples:not(:has(.alt))`) a 1px
   hairline instead, because a hue that is always the same hue is
   decoration. That rule is right and this card legitimately
   matched it. But the hue assertion is PAGE-scoped where the CSS
   rule is GROUP-scoped: it collects every .example on the page and
   wants the thinnest left rule at 3px or more. So one honestly
   uniform group dragged down a page whose other pairs contrast
   properly.

   Neither way of silencing that is allowed. A fake `.alt` sibling
   invents a second film; widening this border to 3px puts a
   data-carrying rule on a card that carries none, which is the
   exact collapse the assertion exists to catch, arrived at from
   the other side. The class was simply wrong: this is ONE worked
   example, never a contrasting pair, so it leaves the family.

   NO NEW COLOURS AND ONE NEW SURFACE. .beat-eg-card takes the same
   --sk-card-* variables .example does, so a skin still owns its
   shape and the AA walk still sees it; .ex-label stays, because
   that is the studio-wide label family rather than anything
   .example owns, and so does the global .tanglish gloss. The rules
   are in widgets.css beside the other beat widgets, and every
   value in them is a token.
   ============================================================ */

import { h } from '../lib/dom.js';
import { getStudy, getBeatSheetMethod } from '../lib/studies.js';

/* The gloss is shown in BOTH languages, always — src/ui/steps.js
   explains the distinction: a GLOSS accompanies, a FULL TRANSLATION
   replaces and is only reached in Tanglish mode. These lines are
   glosses, so they need no toggle and no data-tl-* marker, and the
   stylesheet already knows what .tanglish looks like. */
function withGloss(tag, text, tanglish) {
  const el = h(tag, { text });
  if (tanglish) el.append(h('span.tanglish', { text: tanglish }));
  return el;
}

/**
 * One film's named beat sheet, as a single worked-example card.
 *
 * @param {string} slug     a film in studies.json — 'dragon', '96', …
 * @param {string} methodId a beat-sheet method — 'save-the-cat'
 * @returns {HTMLElement|null} null when either half is missing, so a
 *          caller can append unconditionally. A film that has not
 *          written its sheet yet renders nothing rather than a card
 *          full of holes.
 */
export function beatExample(slug, methodId = 'save-the-cat') {
  const study = getStudy(slug);
  if (!study) return null;

  const sheet = (study.beatSheets || []).find((s) => s && s.method === methodId);
  const method = getBeatSheetMethod(methodId);
  if (!sheet || !method || !Array.isArray(method.beats)) return null;

  const written = sheet.beats || {};
  /* Driven by the METHOD's beat list, not by the keys the film
     happens to have filled in. That is what makes an unwritten beat
     show up as a named hole instead of silently shortening the
     sheet — the same choice study.js makes, and the reason the count
     in the label can be trusted. */
  const rows = method.beats.filter((b) => written[b.id]);
  if (!rows.length) return null;

  const card = h('div.beat-eg-card');
  card.append(h('h5.beat-eg-title', {
    text: `${study.meta.title} \u00b7 the ${method.beats.length} beats`
  }));

  const credit = [study.meta.director, study.meta.year, method.name]
    .filter(Boolean).join(' \u00b7 ');
  card.append(h('div.ex-label', { text: credit }));

  /* The sheet's own note, where it has one. Dragon's explains that
     155 minutes against a sheet written for 110 pages makes the page
     targets a ruler the film does not use — which is the first thing
     a reader comparing the two columns needs to know. */
  if (sheet.note) card.append(h('p.beat-eg-note', { text: sheet.note }));

  const list = h('ol.beat-eg');
  for (const beat of rows) {
    const got = written[beat.id];
    const li = h('li.beat-eg-row');

    const head = h('div.beat-eg-head');
    head.append(h('strong', { text: `${String(beat.n).padStart(2, '0')} · ${beat.label}` }));
    /* The page target comes from the method and stays in English,
       like the beat name: it is a number on a ruler, not prose. */
    if (beat.pages) head.append(h('span.beat-eg-pg', { text: beat.pages }));
    li.append(head);

    if (got.inFilm) li.append(withGloss('p.beat-eg-in', got.inFilm, got.inFilmTanglish));
    if (got.craft) {
      const steal = withGloss('p.beat-eg-craft', got.craft, got.craftTanglish);
      steal.insertBefore(h('span.beat-eg-steal', { text: 'Steal' }), steal.firstChild);
      li.append(steal);
    }
    list.append(li);
  }
  card.append(list);

  /* Returned bare. The old wrapper was .examples, which is a GRID of
     two-up cards; one card in it is a grid of one, and the class now
     carries a meaning this card has opted out of. */
  return card;
}

export default { beatExample };
