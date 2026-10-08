/* ============================================================
   PITCH DECK — one click, a landscape PDF (PRD 2.0 FR-605)
   ------------------------------------------------------------
   Compiles what the studio already holds into slides: the title, the
   logline, the synopsis, the active beat structure, the characters,
   the key scenes and the numbers. Nothing here is typed again and
   nothing is stored — every slide is read from its model at the
   moment of export:

     logline, theme, characters  the feature blueprint's own fields
                                 (s2_log_final, s3_theme, s4_*, s5_*, s6_*)
     synopsis, beats             src/lib/story.js — the active framework,
                                 with the passage tagged to each beat
     characters (fallback)       the cast matrix, when the blueprint has
                                 no character pages yet
     key scenes, the numbers     the scene model and the screen-time
                                 estimate

   A slide with nothing to say is LEFT OUT rather than printed empty:
   an investor reading "Characters: —" learns only that the deck was
   generated. The feature page's PPTX export still exists for a deck
   somebody wants to edit; this is the one that goes in an email.

   PRINTED THROUGH src/lib/pdf.js, like every other document here, so
   Tamil shapes correctly and the text stays selectable. The deck is
   built into #main for the length of the print job and removed after.

   THE LAST SLIDE CARRIES "Made with FilmMakerStudio" (src/ui/footer.js
   brandLine), with the member's ?ref= code when billing knows one —
   unless a paid plan allowed it off and the user switched it off.
   buildDeck() takes it as `opts.brand` so the screening room, which
   prints its own line for the room, can build the deck without it.
   ============================================================ */
import Store from './store.js';   // must evaluate before anything reads localStorage
import PDF from './pdf.js';
import { h } from './dom.js';
import { listScenes } from './scenes.js';
import { loadScript } from './script.js';
import { loadStory, matrix, frameworkById } from './story.js';
import { castMatrix, screenTime, formatDuration } from './screenplay-analysis.js';
import { brandLine, brandingOn } from '../ui/footer.js';

const FEATURE_KEY = 'fms_filmmaker_combined_v1';

function blueprint() {
  try {
    const v = JSON.parse(localStorage.getItem(FEATURE_KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch (e) { return {}; }
}
const txt = (v) => String(v ?? '').trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);

/** Everything the deck needs, from this browser's open project. */
export function collectPitch() {
  return collectFrom({
    bp: blueprint(), story: loadStory(), scenes: listScenes(), script: loadScript(),
    title: txt(Store.currentProject && Store.currentProject() && Store.currentProject().title)
  });
}

/** The same, from data handed in — the screening room builds a deck
 *  from a pass's snapshot, which never touches this browser's storage.
 *  `story` may be a raw stored row; it is normalised here. */
export function collectFrom({ bp = {}, story = null, scenes = [], script = null, title = '' } = {}) {
  story = { marks: [], tension: {}, source: '', framework: 'three_act', ...(story || {}) };
  if (!Array.isArray(story.marks)) story.marks = [];
  script = script && Array.isArray(script.elements) ? script : { elements: [] };
  const fw = frameworkById(story.framework);

  const logline = txt(bp.s2_log_final) || txt(bp.s2_log2) || txt(bp.s2_log1) || txt(story.logline);
  const synopsis = txt(story.source) || txt(bp.lad_2_synopsis);

  const beats = matrix(story).filter((r) => r.marks.length).map((r) => ({
    label: r.beat.label,
    text: clip(r.marks.map((m) => m.text).join(' '), 260),
    tension: r.tension
  }));

  // Characters: the blueprint's character pages if they exist, otherwise
  // the most present people in the cast matrix.
  const people = [
    { name: bp.s4_name, role: 'Protagonist', line: bp.s4_want ? 'Wants: ' + txt(bp.s4_want) + (bp.s4_need ? ' Needs: ' + txt(bp.s4_need) : '') : bp.s4_arc },
    { name: bp.s5_name, role: 'Antagonist', line: bp.s5_want ? 'Wants: ' + txt(bp.s5_want) : bp.s5_philosophy },
    { name: bp.s6_ally_name, role: 'Ally', line: bp.s6_ally_reflect },
    { name: bp.s6_lover_name, role: 'Love interest', line: bp.s6_lover_sees },
    { name: bp.s6_mentor_name, role: 'Mentor', line: bp.s6_mentor_tool }
  ].filter((p) => txt(p.name)).map((p) => ({ name: txt(p.name), role: p.role, line: clip(txt(p.line), 220) }));
  let characters = people;
  if (!characters.length && scenes.length) {
    characters = castMatrix(scenes, script.elements).characters.slice(0, 6)
      .map((c) => ({ name: c.name, role: `${c.scenes.size} scene${c.scenes.size === 1 ? '' : 's'}`, line: '' }));
  }

  // Key scenes: the ones with something written about them, spread
  // across the film rather than the first six.
  const written = scenes.filter((s) => txt(s.synopsis));
  const pick = [];
  const want = Math.min(6, written.length);
  for (let i = 0; i < want; i++) pick.push(written[Math.round((i * (written.length - 1)) / Math.max(1, want - 1))]);
  const keyScenes = [...new Set(pick)].map((s) => ({
    number: txt(s.number), slug: [s.intExt, txt(s.location) || 'LOCATION TBD', s.dayNight].filter(Boolean).join(' · '),
    synopsis: clip(txt(s.synopsis), 200)
  }));

  const st = scenes.length ? screenTime(scenes, script.elements) : null;
  const numbers = [];
  if (scenes.length) numbers.push([String(scenes.length), 'scenes']);
  if (st && st.total) numbers.push([formatDuration(st.total), 'estimated running time']);
  const days = new Set(scenes.map((s) => parseInt(s.shootDay, 10)).filter((n) => n > 0));
  if (days.size) numbers.push([String(days.size), 'shoot days']);
  const locs = new Set(scenes.map((s) => txt(s.location).toLowerCase()).filter(Boolean));
  if (locs.size) numbers.push([String(locs.size), 'locations']);

  return {
    // Never the app's own name, which is what pdf.js falls back to for a
    // running header and is wrong on a cover.
    title: txt(title) || 'Untitled film',
    genre: txt(bp.v1_genre),
    logline, synopsis,
    theme: txt(bp.s3_theme),
    framework: fw.label, beats,
    characters, keyScenes, numbers,
    world: [txt(bp.s7_era), txt(bp.s7_location)].filter(Boolean).join(' · ')
  };
}

const slide = (eyebrow, title, body) =>
  h('section.pd-slide', {}, [h('p.pd-eyebrow', { text: eyebrow }), title ? h('h2.pd-title', { text: title }) : null, ...[].concat(body)].filter(Boolean));

/** The deck as DOM. Slides with nothing to say are omitted.
 *  `opts.brand`: true (the default) adds the growth line to the last
 *  slide when brandingOn() says so; false leaves it off; an element
 *  is used as given. */
export function buildDeck(d, opts = {}) {
  const deck = h('div#pitchDeck.pd-deck');
  deck.append(h('section.pd-slide.pd-cover', {}, [
    h('p.pd-eyebrow', { text: d.genre || 'A film' }),
    h('h1.pd-cover-title', { text: d.title }),
    d.logline ? h('p.pd-logline', { text: d.logline }) : null,
    d.world ? h('p.pd-world', { text: d.world }) : null
  ].filter(Boolean)));
  if (d.synopsis) {
    deck.append(slide('Synopsis', '', [
      ...d.synopsis.split(/\n\s*\n/).slice(0, 6).map((p) => h('p.pd-body', { text: clip(p.trim(), 900) })),
      d.theme ? h('p.pd-theme', { text: d.theme }) : null
    ].filter(Boolean)));
  }
  if (d.beats.length) {
    const ol = h('ol.pd-beats');
    d.beats.forEach((b) => ol.append(h('li', {}, [h('strong', { text: b.label }), h('span', { text: b.text })])));
    deck.append(slide('Structure', d.framework, ol));
  }
  if (d.characters.length) {
    const grid = h('div.pd-grid');
    d.characters.forEach((c) => grid.append(h('div.pd-card', {}, [
      h('p.pd-role', { text: c.role }), h('h3.pd-name', { text: c.name }), c.line ? h('p.pd-body', { text: c.line }) : null
    ].filter(Boolean))));
    deck.append(slide('Characters', '', grid));
  }
  if (d.keyScenes.length) {
    const ol = h('ol.pd-scenes');
    d.keyScenes.forEach((s) => ol.append(h('li', {}, [
      h('span.pd-num', { text: s.number || '—' }), h('div', {}, [h('strong', { text: s.slug }), h('p.pd-body', { text: s.synopsis })])
    ])));
    deck.append(slide('Key scenes', '', ol));
  }
  if (d.numbers.length) {
    const row = h('div.pd-numbers');
    d.numbers.forEach(([v, l]) => row.append(h('div', {}, [h('strong', { text: v }), h('span', { text: l })])));
    deck.append(slide('The production', '', row));
  }
  const brand = opts.brand === undefined ? true : opts.brand;
  const line = brand === true ? (brandingOn() ? brandLine({ className: 'made-with pd-made' }) : null)
             : (brand && brand.nodeType === 1 ? brand : null);
  if (line && deck.lastElementChild) deck.lastElementChild.append(line);
  return deck;
}

/** How many slides the deck would have — for the button's label. */
export const slideCount = (d = collectPitch()) => buildDeck(d, { brand: false }).children.length;

/** One click: build, print, remove. Returns false if a print job is
 *  already running or there is nothing to put in the deck. */
export function exportPitchPDF() {
  const d = collectPitch();
  if (!d.logline && !d.synopsis && !d.beats.length && !d.characters.length && !d.keyScenes.length) return false;
  let deck = null;
  return PDF.exportPDF({
    scope: 'pitch',
    masthead: false,
    subtitle: d.logline,
    before: () => {
      deck = buildDeck(d);
      (document.getElementById('main') || document.body).append(deck);
    },
    after: () => { if (deck) deck.remove(); }
  });
}

export default { collectPitch, collectFrom, buildDeck, slideCount, exportPitchPDF };
