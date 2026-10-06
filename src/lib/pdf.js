/* ============================================================
   PDF — the browser's own print pipeline, aimed at one document
   ------------------------------------------------------------
   There is no PDF library here and that is the design, not a
   shortcut. A canvas generator rasterises: the screenplay stops
   being selectable, Tamil conjuncts come out wrong, page breaks
   land wherever the bitmap ran out, and 359 fields of somebody's
   writing become an image of themselves. The print pipeline gives
   real pagination, embedded fonts, live text, widows/orphans and
   correct complex-script shaping for free — and this app has
   screenplay and call-sheet output where the typography IS the
   product.

   styles/print.css already does the hard half: it flattens the
   panels, inverts every theme to print ink and sets one page.
   This module adds the three things a *document* needs that a
   printed *page* does not:

     1. A PAGE SETUP per document kind. `@page` cannot be selected
        by a body class, so the size and margins are injected as a
        one-off <style> for the duration of the job and removed
        again. Landscape for a stripboard, US Letter with a 1.5in
        gutter for a screenplay, A4 for everything else.
     2. A MASTHEAD. What a document needs and a web page does not:
        which film, which document, how big, as of when.

        It is in the flow, on the first page, and NOT a running
        band — that was the first design and it does not work in
        Chrome. Blink implements neither the `@page` margin boxes
        (`@top-center` and friends) nor `counter(page)` outside
        them, and it clamps a `position: fixed` element to the
        page AREA: measured here, a band offset into the margin by
        a negative `top`, a negative margin, a transform or an
        absolutely-positioned child of a fixed layer comes out at
        the OPPOSITE edge, inside the text, on every page. Only
        `top: 0` places it predictably, and there it sits on top
        of the first line. A repeated band that eats a line of
        someone's screenplay per page is worse than no band.
        Per-page running heads and page numbers are what the print
        dialog's own header/footer option is for, and it reads
        document.title — which is why point 3 matters.
     3. A DOCUMENT TITLE. Every browser seeds the "Save as PDF"
        filename from document.title, so a call sheet saved from
        this page must not arrive on a producer's desk as
        "contacts". The title is set before print() and restored
        after.

   CLEAN-UP is on `afterprint` with a timeout fallback, the same
   belt-and-braces src/pages/reports.js already uses — Safari has
   never fired afterprint reliably, and a body class left behind
   would leave the screen showing a document instead of a tool.

   No inline handlers, no raw colours: the rules live in
   styles/pdf.css and the only literals here are page dimensions.
   ============================================================ */
import Store from './store.js';
import { h } from './dom.js';

/* ------------------------------------------------------------
   PAGE SETUPS
   ------------------------------------------------------------ */
export const SETUPS = {
  a4:         { size: 'A4',           margin: '18mm 14mm' },
  landscape:  { size: 'A4 landscape', margin: '13mm 12mm' },
  /* US Letter, 1in top/right/bottom and a 1.5in left gutter — the
     geometry a script is read and punched in, everywhere. */
  screenplay: { size: 'Letter',       margin: '25.4mm 25.4mm 22mm 38.1mm' },
  /* The same sheet for a shooting script, whose scene numbers sit IN
     the margins — and Chrome clips whatever a PDF page paints there.
     So the page margins shrink to 0.75in and 0.4in and write.css pads
     the document back out by the difference (`pdf-sn`): the text block
     lands on exactly the same 1.5in gutter, and the numbers are
     inside the printable area instead of cut off. */
  'screenplay-wide': { size: 'Letter', margin: '25.4mm 10.16mm 22mm 19.05mm' },
  sheet:      { size: 'A4',           margin: '15mm 13mm' }
};

/* ------------------------------------------------------------
   THE DOCUMENTS
   ------------------------------------------------------------
   One entry per document-shaped output in the studio. `scope` is
   the key; it becomes a `pdf-<scope>` body class that pdf.css
   keys its rules off. `classes` are body classes a page already
   owns and already styles — reports.css and contacts.css wrote
   theirs long before this module existed, and re-implementing
   them here would be two representations of one thing.
   ------------------------------------------------------------ */
export const DOCUMENTS = {
  blueprint:  { setup: 'a4',         label: 'Blueprint' },
  overview:   { setup: 'a4',         label: 'Studio overview' },
  // The screenplay carries its own title page, which is the masthead
  // a script is allowed to have. A second one above it is not.
  screenplay: { setup: 'screenplay', label: 'Screenplay', masthead: false },
  callsheet:  { setup: 'sheet',      label: 'Call sheet' },
  sides:      { setup: 'a4',         label: 'Sides',    classes: ['rp-print-sides'] },
  reports:    { setup: 'a4',         label: 'Production reports', classes: ['rp-print-reports'] },
  board:      { setup: 'landscape',  label: 'Stripboard' },
  dood:       { setup: 'landscape',  label: 'Day Out of Days' },
  // The deck is its own cover, so no masthead above it.
  pitch:      { setup: 'landscape',  label: 'Pitch deck', masthead: false }
};

/** The open project's title, for the band and the filename. */
export function projectTitle() {
  try {
    const p = Store && Store.currentProject && Store.currentProject();
    if (p && p.title) return p.title;
  } catch (e) { /* no project yet — the hub may be the first page seen */ }
  return "FilmMakerStudio";
}

/* A filename, not a sentence. Browsers replace what they cannot use
   and some of them replace it with nothing, so the slashes and colons
   come out here rather than turning into a run of underscores. */
function cleanTitle(s) {
  return String(s || 'Document')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'Document';
}

const today = () => new Date().toLocaleDateString(undefined, {
  year: 'numeric', month: 'short', day: 'numeric'
});

function pageStyle(setup) {
  return `@page { size: ${setup.size}; margin: ${setup.margin}; }\n`;
}

/* The masthead. In the flow, first page, above everything else the
   document shows — which is where a reader looks for it and, unlike a
   fixed band, where Chrome will actually put it. */
function masthead(parts) {
  const head = h('div#pdf-masthead.pdf-masthead', { role: 'doc-pageheader' });
  head.append(h('div.pdf-mh-top', {}, [
    h('span.pdf-mh-project', { text: parts.project }),
    h('span.pdf-mh-kind', { text: parts.label })
  ]));
  const foot = [parts.subtitle, parts.date].filter(Boolean).join('  ·  ');
  if (foot) head.append(h('div.pdf-mh-meta', { text: foot }));
  return head;
}

/* ------------------------------------------------------------
   STAGE / UNSTAGE
   ------------------------------------------------------------
   Separated from exportPDF() on purpose: the verification harness
   drives Playwright's page.pdf(), which renders the print
   stylesheet but never calls window.print(), so there has to be a
   way to put the page into its printing state and read the real
   paginated output back.
   ------------------------------------------------------------ */
let active = null;

export function stage(opts = {}) {
  if (active) unstage();

  const doc = DOCUMENTS[opts.scope] || DOCUMENTS.blueprint;
  const setup = SETUPS[opts.setup || doc.setup] || SETUPS.a4;
  const project = opts.project || projectTitle();
  const label = opts.label || doc.label;
  const title = cleanTitle(opts.title || (project + ' — ' + label));

  const classes = ['pdf-print', 'pdf-' + (opts.scope || 'blueprint')]
    .concat(doc.classes || [])
    .concat(opts.classes || []);

  const state = {
    scope: opts.scope || 'blueprint',
    classes,
    prevTitle: document.title,
    after: typeof opts.after === 'function' ? opts.after : null,
    style: null,
    band: null
  };

  // The page's own preparation (contacts marks one sheet, write builds
  // the screenplay document) runs before anything is stamped, so a hook
  // that throws leaves the page untouched rather than half-printing.
  if (typeof opts.before === 'function') opts.before();

  state.style = document.createElement('style');
  state.style.id = 'pdf-page-setup';
  state.style.textContent = pageStyle(setup);
  document.head.append(state.style);

  const wantsMasthead = opts.masthead !== undefined
    ? opts.masthead
    : (doc.masthead !== false);
  if (wantsMasthead) {
    const host = document.getElementById('main') || document.body;
    state.band = masthead({ project, label, subtitle: opts.subtitle || '', date: today() });
    host.insertBefore(state.band, host.firstChild);
  }

  classes.forEach((c) => document.body.classList.add(c));
  document.title = title;

  active = state;
  return state;
}

export function unstage() {
  if (!active) return;
  const state = active;
  active = null;
  state.classes.forEach((c) => document.body.classList.remove(c));
  if (state.style) state.style.remove();
  if (state.band) state.band.remove();
  document.title = state.prevTitle;
  if (state.after) {
    try { state.after(); } catch (e) { console.warn('[pdf] after', e); }
  }
}

/* ------------------------------------------------------------
   THE ONE PATH
   ------------------------------------------------------------
   exportPDF({ title, scope }) — plus the optional trimmings:
     label     what the running header calls this document
     subtitle  a line for the footer (which scenes, which day)
     project   override the project name in the header
     classes   extra body classes for a page's own print rules
     before()  build or mark whatever this document needs
     after()   put it back
   ------------------------------------------------------------ */
export function exportPDF(opts = {}) {
  if (active) return false;             // one job at a time
  try {
    stage(opts);
  } catch (e) {
    console.warn('[pdf] could not stage', e);
    unstage();
    return false;
  }

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    window.removeEventListener('afterprint', finish);
    unstage();
  };
  window.addEventListener('afterprint', finish);

  try {
    window.print();
  } catch (e) {
    console.warn('[pdf] print failed', e);
    finish();
    return false;
  }
  /* Chrome and Firefox block inside print(), so this timer only starts
     once the dialog is gone. Safari has historically never fired
     afterprint at all, and a page stuck in its printing state is worse
     than a PDF that lost its last half second. */
  setTimeout(finish, 2000);
  return true;
}

const StudioPDF = { exportPDF, stage, unstage, projectTitle, DOCUMENTS, SETUPS };
if (typeof window !== 'undefined') window.StudioPDF = StudioPDF;

export default StudioPDF;
