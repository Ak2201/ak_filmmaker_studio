/* ============================================================
   PAPER SETUPS — which page a document prints on, as pure data
   ------------------------------------------------------------
   Split out of src/lib/pdf.js (which re-exports all of it) so the
   choice can be held in Node without a page or a store:
   scripts/test-paperwork.mjs. pdf.js asks the open film for its
   prefs (region.js currentProjectPrefs()) and passes them in.

   The paperwork families — a4, landscape, sheet — each have a US
   Letter twin, used for a film whose paper is Letter (region INT, or
   an entry with paper: 'Letter'; docs/US-MARKET-PLAN.md §A4). The
   screenplay setups are Letter already and never change. A document
   marked `fixedPaper` (the invoice, the pitch deck) is not the film's
   paperwork and keeps its own page whatever the film says.
   ============================================================ */

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
  sheet:      { size: 'A4',           margin: '15mm 13mm' },
  /* The same three on US Letter (215.9 x 279.4mm), for a film whose
     region is INT (or whose entry says paper: 'Letter'). Letter is
     6mm wider and 18mm SHORTER than A4, so the side margins are A4's
     and the call sheet's top and bottom come in to 0.5in: a sheet that
     fitted one A4 page has 12mm less height to fit in, not 18. */
  letter:             { size: 'Letter',           margin: '18mm 14mm' },
  'letter-landscape': { size: 'Letter landscape', margin: '13mm 12mm' },
  'sheet-letter':     { size: 'Letter',           margin: '12.7mm 13mm' }
};

/* Which setup prints a document on Letter. Only the paperwork families
   have a twin; the screenplay setups are Letter already, and any setup
   not named here prints as it is on either paper. */
export const LETTER_OF = { a4: 'letter', landscape: 'letter-landscape', sheet: 'sheet-letter' };

/** The setup NAME a document prints with on this paper ('A4' | 'Letter').
 *  Pure, so scripts/test-paperwork.mjs can hold it without a page. */
export function paperSetupName(name, paper) {
  const n = SETUPS[name] ? name : 'a4';
  return paper === 'Letter' && LETTER_OF[n] ? LETTER_OF[n] : n;
}

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
  // One industry breakdown sheet per scene; each sheet is its own heading.
  bdsheets:   { setup: 'a4',         label: 'Breakdown sheets', masthead: false },
  dood:       { setup: 'landscape',  label: 'Day Out of Days' },
  // An invoice is its own letterhead. Its paper is the billing's own
  // decision (PRICING-CLIENT), not the film's, so it never follows the
  // project: `fixedPaper`.
  invoice:    { setup: 'a4',         label: 'Invoice', masthead: false, fixedPaper: true },
  // The deck is its own cover, so no masthead above it. A slide is
  // not paperwork; it keeps its A4 landscape on every film.
  pitch:      { setup: 'landscape',  label: 'Pitch deck', masthead: false, fixedPaper: true }
};

/** The page setup a print job uses. `opts.setup` (or the document's)
 *  names the FAMILY; the paper comes from `opts.paper`, else the film's
 *  prefs. A fixed-paper document (invoice, deck) ignores both. */
export function resolveSetup(opts = {}, prefs = null) {
  const doc = DOCUMENTS[opts.scope] || DOCUMENTS.blueprint;
  const name = opts.setup || doc.setup;
  if (doc.fixedPaper) return { name: SETUPS[name] ? name : 'a4', setup: SETUPS[name] || SETUPS.a4 };
  const paper = opts.paper === 'Letter' || opts.paper === 'A4' ? opts.paper : ((prefs && prefs.paper) || 'A4');
  const resolved = paperSetupName(name, paper);
  return { name: resolved, setup: SETUPS[resolved] };
}
