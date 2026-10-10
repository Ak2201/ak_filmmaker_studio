/* ============================================================
   SCRIPT COMMIT — taking a parsed import into the studio
   ------------------------------------------------------------
   One path for the two doors a script comes in by: the Write page's
   import panel and the Breakdown's "Upload a script". It was inline in
   write.js; extracted so the two cannot drift.

   `plan` is parseScript()'s result (src/lib/script-import.js).
   Options:
     mode           'replace' | 'append' — sets both halves; or give
                    replaceScript / replaceScenes separately (the
                    Write page lets them differ).
     doc            the document the caller already holds in memory
                    (write.js's `doc`). Mutated in place and saved
                    through `persist`. Omitted: loaded from storage and
                    saved here.
     persist        () => void — the caller's save. Default: saveScript.
     importName     for the revision label.

   Replacing the script takes a revision first. Replacing the scene list
   sends the old rows to the bin WITH their dependants
   (src/lib/scene-bin.js), so nothing is lost. Returns
   { elements, scenes, renumbered, doc }.
   ============================================================ */
import Script, { blankElement, hasTitlePage, normaliseTitlePage } from './script.js';
import Scenes from './scenes.js';
import { binScene } from './scene-bin.js';

export function commitImportedScript(plan, opts = {}) {
  const both = opts.mode !== 'append';
  const replaceScript = opts.replaceScript !== undefined ? !!opts.replaceScript : both;
  const replaceScenes = opts.replaceScenes !== undefined ? !!opts.replaceScenes : both;
  const importName = opts.importName || '';
  const doc = opts.doc || Script.loadScript();
  const persist = opts.persist || (() => Script.saveScript(doc));

  // 1. the screenplay
  if (replaceScript && doc.elements.length) {
    doc.revisions.push(Script.makeRevision(doc.elements, 'Before importing ' + (importName || 'a script')));
  }
  /* Type, text and the dual-dialogue flag — the three things an
     element is. Anything else a parser hung on it (a scene number)
     belongs to the scene model, below. */
  const incoming = plan.elements.map((el) => blankElement(el.dual === true
    ? { type: el.type, text: el.text, dual: true }
    : { type: el.type, text: el.text }));
  doc.elements = replaceScript ? incoming : doc.elements.concat(incoming);
  /* The file's title page is taken when it had one and this script
     does not — or when the script is being replaced. A title page the
     writer already filled in is theirs and an import does not
     overwrite it. */
  if (plan.titlePage && (replaceScript || !hasTitlePage(doc.titlePage))) {
    doc.titlePage = normaliseTitlePage(plan.titlePage);
  }
  persist();

  // 2. the scene list
  const existingScenes = Scenes.listScenes();
  let renumbered = 0;
  const taken = new Set(replaceScenes ? [] : existingScenes.map((s) => String(s.number)));
  const base = replaceScenes ? 0 : existingScenes.length;
  const rows = plan.scenes.map((s, i) => {
    let number = String(s.number || '');
    if (!number || taken.has(number)) { number = String(base + i + 1); renumbered++; }
    taken.add(number);
    return { ...s, number };
  });
  /* Replacing the scene list sends the old rows to the bin WITH their
     shots, frames, call-sheet rows and edit-log state, rather than
     dropping the rows and stranding everything that pointed at them
     (BLUEPRINT-REALIGN-PLAN §1d). */
  if (replaceScenes) {
    for (const s of existingScenes) {
      binScene(s.id, { reason: 'hand', heading: [s.intExt, s.location, s.dayNight].filter(Boolean).join(' ') });
    }
  }
  Scenes.saveScenes(replaceScenes ? rows : Scenes.listScenes().concat(rows));
  return { elements: incoming.length, scenes: rows.length, renumbered, doc };
}

export default { commitImportedScript };
