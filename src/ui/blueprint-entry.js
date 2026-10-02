/* ============================================================
   TWO WAYS INTO A BLUEPRINT
   ------------------------------------------------------------
   A new feature project opens on a wall of 24 blank steps with
   nothing saying that typing into step 01 is only one of the ways
   in. Somebody who already has a synopsis, a treatment or a
   screenplay should not have to retype it into a form before the
   rest of the studio will do anything.

   So, above the wall and below the master cover — the same slot
   .st-path occupies, because both answer "where do I start" — an
   explicit choice:

     IMPORT       a screenplay, in any format the parser reads
     DRAFT        a synopsis becomes a beat sheet becomes pages
     SCRATCH      go to step 01 and write

   IT WIRES, IT DOES NOT REIMPLEMENT. The importer and the
   synopsis route are both already built, on write.html, each with
   its own preview, its own revision-before-replace, and — for the
   AI one — the two gates (no key, no synopsis) and the key bar
   that src/ui/ai-panel.js owns. A second file picker and a second
   preview here would be a second place for "nothing is written
   before a preview" to stop being true, and a second key form is
   precisely the fourth copy ai-panel.js exists to prevent. So the
   two cards are links to the real thing, and write.js now opens
   its importer when it is arrived at by that fragment — otherwise
   the link lands on a closed panel and a button to find.

   WHAT IS DERIVED, AND WHY EACH ONE HAS TO BE.

     "not started"    src/lib/blueprint-fields.js. featureKeys()
                      is every field all 32 steps declare,
                      including the 145 inside `raw` blocks, and
                      progressAgainst() is the same arithmetic the
                      hub and the dashboard already use. A
                      `started` flag of our own would be a third
                      answer to a question two callers agree
                      about — and a new key in a contract holding
                      months of people's work.
     the formats      FORMATS in src/lib/script-import.js. A
                      hand-written "Fountain, FDX, text" went
                      stale the day the PDF reader landed, and a
                      panel naming a format the parser cannot read
                      is worse than one naming none.
     the draft's state scriptgen.js's cursor. A run that died at
                      scene forty is resumable, and offering
                      "draft from a synopsis" to somebody who is
                      mid-draft is offering to start over.

   NO NEW STORAGE KEY, DELIBERATELY. The obvious design wants a
   `fms_..._entry_dismissed_v1` and does not need one: the panel's
   condition is already "this blueprint has nothing in it", so the
   first field anybody fills retires it for good, and a writer who
   dismisses it and then types never sees it again. Dismissal is a
   page-view fact, held in a variable here. What that costs is one
   case — dismiss, type nothing, reload — where it comes back, and
   in that case it is telling the truth. Invariant 1 is the reason
   to prefer that: a key is a contract with saved work, and this
   one would have been bought for a hidden panel.

   FIRST PAINT IS KEPT CLEAN. The panel renders from nothing but
   the step data feature.js already has. script-import.js (the
   PDF reader behind it) and scriptgen.js (the script and scene
   models) are reached with import() AFTER the panel is in the
   DOM, and each card is written so the version before the chunk
   lands is true as it stands — the same posture write.js takes
   with its own `accept` attribute.

   NO COLOURS AND TWO NEW SHAPES. The wrapper reads the same
   --sk-card-* family .st-path does and the two choice cards are
   the hub's own .eps-tour-item / -label / -note, so the two
   first-run experiences are the same object rather than two
   objects that resemble each other. The rules are in widgets.css.
   ============================================================ */

import { h } from '../lib/dom.js';
import { featureKeys, progressAgainst } from '../lib/blueprint-fields.js';

/* Dismissed for this page view only — see the header. Not a flag in
   storage, and not a class on <body> either: nothing else reads it. */
let dismissed = false;

/**
 * Has anybody written anything in this blueprint?
 *
 * @param {object} data the blueprint blob, field name → value
 * @returns {boolean} true once ONE declared field is non-empty. Not a
 *          percentage threshold: the question is "is this a blank
 *          desk", and one filled field means it is not.
 */
export function blueprintStarted(data) {
  return progressAgainst(featureKeys(), data || {}).done > 0;
}

/* ---- the two routes, enriched after the chunks land --------- */

/** The formats, from the parser rather than from a list here. */
async function paintFormats(noteEl) {
  if (!noteEl) return;
  try {
    const { FORMATS } = await import('../lib/script-import.js');
    /* Checked HERE and not before the await. The panel is built and
       then appended, so at call time the node is still detached and an
       isConnected guard at the top of this function returns before the
       import is even started — which is what it did, silently, and the
       card kept its first-guess copy for good. */
    if (!noteEl.isConnected) return;
    const names = (FORMATS || []).map((f) => f.label + ' ' + f.ext.join('/'));
    if (!names.length) return;
    noteEl.textContent = names.join(', ')
      + '. Read in this browser, never uploaded, and shown to you before a word '
      + 'is stored. It fills the screenplay AND the scene list, so the breakdown, '
      + 'stripboard, budget and reports have something to read.';
  } catch (e) {
    /* The short form already on the card is true, so a chunk that
       fails to load leaves a correct card rather than an empty one. */
    console.warn('[entry] formats', e);
  }
}

/**
 * Whether there is a part-written draft to pick up.
 *
 * The KEY gate is not asked here and that is deliberate: it lives on
 * write.html#generate, where ai-panel.js owns the form, the bar and
 * both gates. This card states the requirement unconditionally,
 * word for word as the panel it links to states it before its own
 * model code has loaded — one sentence, no mirror of "is there a key"
 * to go stale. visualize.js keeping such a mirror is why that module
 * exists at all.
 */
async function paintDraft(noteEl) {
  if (!noteEl) return;
  try {
    const Scriptgen = await import('../lib/scriptgen.js');
    if (!noteEl.isConnected) return;   // see paintFormats
    const job = Scriptgen.load();
    const p = Scriptgen.progress(job);
    if (Scriptgen.inFlight(job)) {
      noteEl.textContent = 'A draft is already part written — ' + p.done + ' of '
        + p.total + ' scenes on the page. Pick it up where it stopped rather than '
        + 'starting over; nothing already written is re-run.';
      return;
    }
    if (job.stage === 'beats' || job.stage === 'scenes') {
      noteEl.textContent = 'A draft is already under way and waiting at the '
        + job.stage + ' stage. Carry on from there.';
    }
  } catch (e) {
    console.warn('[entry] draft state', e);
  }
}

/**
 * The panel, or null when there is nothing to offer.
 *
 * @param {object} data the blueprint blob as it was last saved
 * @returns {HTMLElement|null} null once the blueprint has been started
 *          or the panel dismissed, so a caller can append
 *          unconditionally.
 */
export function blueprintEntry(data) {
  if (dismissed || blueprintStarted(data)) return null;

  const panel = h('section.bp-entry', {
    id: 'two-ways-in', 'aria-labelledby': 'bp-entry-title'
  });

  /* Why this and the button below are not one control: one of them
     moves you to step 01 and the other leaves you where you are. A
     reader who wants the panel gone without being scrolled somewhere
     has no other route to that. */
  panel.append(h('button.bp-entry-x', {
    type: 'button', 'data-action': 'dismissEntry',
    title: 'Hide this', 'aria-label': 'Hide the ways-in panel', text: '✕'
  }));

  panel.append(
    h('p.bp-entry-eyebrow', { text: 'BEFORE STEP 01' }),
    h('h2.bp-entry-title', { id: 'bp-entry-title', text: 'Two ways in.' }),
    h('p.bp-entry-deck', {
      text: 'This blueprint is 32 steps and nothing has been written in it yet. '
          + 'Typing into step 01 is one way to fill it. If the film already exists '
          + 'on paper — a synopsis, a treatment, a screenplay — bring that in '
          + 'instead, and the steps downstream of it start with something to read.'
    })
  );

  const ways = h('div.bp-entry-ways');

  const importNote = h('span.eps-tour-note', {
    text: 'Read in this browser, never uploaded, and shown to you before a word is '
        + 'stored. It fills the screenplay AND the scene list, so the breakdown, '
        + 'stripboard, budget and reports have something to read.'
  });
  ways.append(h('a.eps-tour-item', { href: 'write.html#wr-import' }, [
    h('span.eps-tour-label', { text: 'I already have a script' }),
    importNote
  ]));

  const draftNote = h('span.eps-tour-note', {
    text: 'A synopsis becomes a beat sheet, the beat sheet becomes scenes, and the '
        + 'scenes become pages — you read each one before the next one runs. Needs '
        + 'your own Anthropic API key, kept on this device and sent to nobody but '
        + 'api.anthropic.com.'
  });
  ways.append(h('a.eps-tour-item', { href: 'write.html#generate' }, [
    h('span.eps-tour-label', { text: 'I have a synopsis' }),
    draftNote
  ]));

  panel.append(ways);

  panel.append(h('div.bp-entry-acts', {}, [
    h('button.btn.primary', {
      type: 'button', 'data-action': 'startFromScratch',
      text: 'START FROM SCRATCH'
    })
  ]));

  panel.append(h('p.bp-entry-fine', {
    text: 'Nothing on this panel writes anything. Both routes show you what they '
        + 'understood before they store a word, and neither replaces writing you '
        + 'already have without taking a revision first. This panel goes for good '
        + 'as soon as one field in the blueprint has something in it.'
  }));

  /* After the element exists, so a failed chunk cannot stop the panel
     rendering and a slow one cannot delay it. */
  paintFormats(importNote);
  paintDraft(draftNote);

  return panel;
}

/** Remove the panel for this page view. */
export function dismissEntry() {
  dismissed = true;
  const el = document.getElementById('two-ways-in');
  if (el) el.remove();
}

export default { blueprintEntry, blueprintStarted, dismissEntry };
