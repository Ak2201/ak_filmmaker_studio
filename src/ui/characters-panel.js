/* ============================================================
   CHARACTERS — write.html's Characters tab, and the table read
   ------------------------------------------------------------
   A VIEW of two models: the script's cues (the page's in-memory
   `doc`, through getDoc) and what the writer says about each person
   (src/lib/characters.js, `fms_characters_v1`). The list is merged at
   render time; a character no card has been typed into is a reading
   of the cues and is never stored.

   WRITES, and only on a user event:
     - typing into a card saves that character (debounced), adopting a
       derived row into the stored list the first time;
     - "Remove notes" deletes a stored character's notes, and only
       those — the cues stay, so the row comes straight back as derived;
     - RENAME changes the script's cues. It shows its count before it
       runs ("Renames 254 cues in 32 scenes"), patches the cue rows in
       place (no full render: 2,361 rows is a long way to rebuild for
       one name), saves through the page's own path, and offers one
       Undo that puts every cue and the character's name back.

   THE TABLE READ is derived on render: per character, speeches, lines,
   words, an estimate of speaking minutes at DIALOGUE_WPS, and scenes.
   "Print the table read" typesets it and every character's sides —
   each speech with the scene it is in and the line it answers — through
   src/lib/pdf.js, the same one print path every other document uses,
   and throws the typeset copy away again after the dialog.

   THE CARD IS SHARED. Each person's sections (Who, Drive, Make-up,
   Change, Ties) are src/ui/character-card.js, the same card the Story
   Bible draws, and for the protagonist, antagonist, ally, love interest
   and mentor the answers the blueprint already holds are read and
   written THERE, not copied here (src/lib/characters.js viewOf).

   STALE BY DESIGN WHILE YOU TYPE. The tab is rebuilt when it is shown
   (its hash), not on every keystroke in the screenplay: a cue typed
   on the Screenplay tab is on this list the next time you look.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import StudioUI from './chrome.js';
import PDF from '../lib/pdf.js';
import { listContacts } from '../lib/contacts.js';
import C, {
  CHARACTER_FIELDS, loadCharacters, saveCharacters, buildRoster, rosterStats, viewFor, setField, characterViews,
  renamePlan, applyPlan, renameCharacter, tableRead, tableReadCSV, speakingMinutes, normName
} from '../lib/characters.js';
import { renderCharacterSections, onCardInput, onCardChange, onCardClick, flushCardEdits, displayName, statsText } from './character-card.js';

let hooks = {
  getDoc: () => ({ elements: [] }),
  scriptChanged: () => {}
};
let stored = null;                 // the stored list, read once and kept current
let names = [];                    // stored names, for SmartType
const list = () => (stored || (stored = loadCharacters()));
const refreshNames = () => { names = characterViews(list()).map((c) => c.name).filter(Boolean); };

/** Names SmartType may offer that the cues may not say yet. */
export const characterNames = () => { if (!stored) { list(); refreshNames(); } return names; };

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/* ---- render ---------------------------------------------------- */

function statTable(read) {
  if (!read.rows.length) return null;
  const table = h('table.wr-tr-table');
  table.append(h('thead', {}, [h('tr', {}, [
    h('th', { scope: 'col', text: 'Character' }),
    h('th', { scope: 'col', text: 'Speeches' }),
    h('th', { scope: 'col', text: 'Lines' }),
    h('th', { scope: 'col', text: 'Words' }),
    h('th', { scope: 'col', text: 'Minutes' }),
    h('th', { scope: 'col', text: 'Scenes' })
  ])]));
  const body = h('tbody');
  for (const r of read.rows) {
    body.append(h('tr', {}, [
      h('th', { scope: 'row', text: r.name }),
      h('td', { text: String(r.speeches) }),
      h('td', { text: String(r.lines) }),
      h('td', { text: String(r.words) }),
      h('td', { text: speakingMinutes(r.seconds) }),
      h('td', { text: String(r.scenes) })
    ]));
  }
  table.append(body);
  return h('div.wr-tr-scroll', {}, [table]);
}

function card(c, read, contacts, stats, names) {
  const r = read.rows.find((x) => x.name === c.name);
  const actor = c.contactId && contacts.find((p) => p.id === c.contactId);
  const first = stats.get(c.id);
  const meta = [
    c.cues ? plural(c.cues, 'cue') : 'no lines yet',
    r ? speakingMinutes(r.seconds) + ' spoken' : '',
    actor ? 'played by ' + actor.name : '',
    first && first.first ? 'first in ' + (first.first.heading || 'the script') : ''
  ].filter(Boolean).join(' · ');
  const box = h('details.wr-ch' + (c.derived ? '.is-derived' : ''), { 'data-ch': c.id, 'data-ch-name': c.name });
  box.append(
    h('summary.wr-ch-sum', {}, [
      h('strong.wr-ch-name', { text: displayName(c) }),
      c.role ? h('span.wr-ch-tag', { text: C.roleLabel(c.role) }) : null,
      c.derived ? h('span.wr-ch-tag', { text: 'from the cues' }) : null,
      c.virtual ? h('span.wr-ch-tag', { text: 'from your blueprint' }) : null,
      h('span.wr-ch-meta', { text: meta })
    ]),
    h('div.wr-ch-body', {}, [
      renderCharacterSections(c, { contacts, names, open: false, nameEditable: false }),
      statsText(first) ? h('p.wr-ch-preview', { text: statsText(first) }) : null,
      h('div.wr-ch-rename', { role: 'group', 'aria-label': 'Rename ' + displayName(c) }, [
        h('label.wr-ch-field', {}, [
          h('span.wr-ch-lab', { text: 'Rename everywhere in the script' }),
          h('input.wr-ch-input', {
            type: 'text', 'data-ch-rename': '', placeholder: c.name, autocomplete: 'off',
            'aria-label': 'New name for ' + displayName(c)
          })
        ]),
        h('p.wr-ch-preview', { 'data-ch-preview': '', 'aria-live': 'polite', text: 'Type the new name to see how many cues change.' }),
        h('div.wr-ch-acts', {}, [
          h('button.btn', { type: 'button', 'data-action': 'ch-rename', disabled: true, text: 'Rename' }),
          c.derived || c.virtual ? null : h('button.btn.wr-ch-quiet', { type: 'button', 'data-action': 'ch-forget', text: 'Remove notes' })
        ])
      ])
    ])
  );
  return box;
}

function fill(section) {
  const doc = hooks.getDoc();
  const elements = (doc && doc.elements) || [];
  const merged = buildRoster(list(), elements);
  const read = tableRead(elements, merged);
  const stats = rosterStats(merged, elements);
  const names = merged.map((c) => c.name).filter(Boolean);
  let contacts = [];
  try { contacts = listContacts(); } catch (e) { contacts = []; }

  const kids = [
    h('h2.bd-h2', { text: 'Characters' }),
    h('p.bd-sub', {
      text: 'Everyone the cues name is here already. Write down what each of them wants, '
          + 'needs and sounds like, cast them from your contacts, and rename one everywhere '
          + 'in the script at once.'
    })
  ];
  if (!merged.length) {
    kids.push(h('div.bd-empty', {}, [
      h('div.bd-empty-mark', { text: '☺', 'aria-hidden': 'true' }),
      h('h2', { text: 'Nobody has spoken yet' }),
      h('p', { text: 'Write a character cue on the Screenplay tab and the person appears here, with their lines counted for the table read.' })
    ]));
    section.replaceChildren(...kids);
    return;
  }

  const sideSel = h('select', { 'data-tr-who': '', 'aria-label': 'Whose sides to print' });
  sideSel.append(h('option', { value: '', text: 'Everyone' }));
  read.rows.forEach((r) => sideSel.append(h('option', { value: r.name, text: r.name })));

  kids.push(
    h('div.wr-tr', { id: 'wr-table-read' }, [
      h('div.wr-tr-head', {}, [
        h('h3.wr-tr-h', { text: 'Table read' }),
        h('span.wr-tr-total', {
          text: read.rows.length
            ? plural(read.rows.length, 'speaking part') + ' · ' + plural(read.totalWords, 'word')
              + ' · about ' + speakingMinutes(read.rows.reduce((n, r) => n + r.seconds, 0)) + ' of dialogue'
            : 'No dialogue yet'
        })
      ]),
      statTable(read),
      h('p.wr-tr-note', { text: 'Minutes are an estimate: dialogue spoken at about 2.6 words a second, before any pause an actor takes.' }),
      read.rows.length ? h('div.wr-tr-acts', {}, [
        h('label.wr-ch-field.wr-tr-who', {}, [h('span.wr-ch-lab', { text: 'Read sides for' }), sideSel]),
        h('button.btn', { type: 'button', 'data-action': 'tr-print', text: 'Print the table read' }),
        h('button.btn', { type: 'button', 'data-action': 'tr-csv', text: 'Download as CSV' })
      ]) : null
    ]),
    h('div.wr-ch-list', {}, merged.map((c) => card(c, read, contacts, stats, names)))
  );
  section.replaceChildren(...kids);
}

/** The section, built from the models as they are now. */
export function renderCharacters() {
  const section = h('section.wr-section', { id: 'characters', 'data-tab-label': 'Characters' });
  try { fill(section); } catch (e) { console.warn('[write] characters', e); }
  return section;
}

/** Rebuild the tab's contents in place (the section node stays, so the
    tab strip's hidden/role attributes on it are untouched). */
export function refreshCharacters() {
  const section = document.getElementById('characters');
  if (!section) return;
  // Keep whatever card was open, so a refresh is not a collapse.
  flushCardEdits();
  const open = [...section.querySelectorAll('details.wr-ch[open]')].map((d) => [d.dataset.ch, d.dataset.chName]);
  fill(section);
  open.forEach(([id, n]) => {
    const d = section.querySelector(`details.wr-ch[data-ch="${CSS.escape(id)}"]`)
      || (n && section.querySelector(`details.wr-ch[data-ch-name="${CSS.escape(n)}"]`));
    if (d) d.open = true;
  });
}

/* The people the table read folds aliases into: the roster as the card
   shows it (a protagonist whose name lives in the blueprint included). */
const rosterOf = (doc) => buildRoster(list(), (doc && doc.elements) || []);

/* ---- the table read, typeset for paper ------------------------ */

function printNode(read, who) {
  const root = h('div.wr-tr-print');
  root.append(h('h2.wr-trp-h', { text: 'Table read' }));
  const t = statTable(read);
  if (t) root.append(t);
  root.append(h('p.wr-trp-note', { text: 'Minutes are estimated at about 2.6 spoken words a second.' }));
  const rows = who ? read.rows.filter((r) => r.name === who) : read.rows;
  for (const r of rows) {
    const part = h('section.wr-trp-part');
    part.append(h('h3.wr-trp-name', { text: r.name + ' — sides' }),
      h('p.wr-trp-meta', { text: [plural(r.speeches, 'speech', 'speeches'), plural(r.words, 'word'),
        speakingMinutes(r.seconds), plural(r.scenes, 'scene')].join(' · ') }));
    let scene = null;
    for (const s of r.sides) {
      if (s.scene !== scene) {
        scene = s.scene;
        part.append(h('p.wr-trp-scene', { text: (s.heading || 'Before the first scene') }));
      }
      const block = h('div.wr-trp-side');
      if (s.prevCue) {
        const prev = s.prevText.length > 140 ? s.prevText.slice(0, 137).trimEnd() + '…' : s.prevText;
        block.append(h('p.wr-trp-cue-ctx', { text: 'After ' + s.prevCue + ': “' + prev.replace(/\s*\n\s*/g, ' ') + '”' }));
      }
      block.append(h('p.wr-trp-cue', { text: s.cue }));
      if (s.paren) block.append(h('p.wr-trp-paren', { text: s.paren }));
      block.append(h('p.wr-trp-line', { text: s.text }));
      part.append(block);
    }
    root.append(part);
  }
  return root;
}

function downloadTableReadCSV() {
  const doc = hooks.getDoc();
  const read = tableRead((doc && doc.elements) || [], rosterOf(doc));
  if (!read.rows.length) { StudioUI.toast('Nobody speaks yet — there is nothing to export.', { type: 'info' }); return; }
  const base = (PDF.projectTitle() || 'film').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film';
  const url = URL.createObjectURL(new Blob([tableReadCSV(read)], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: base + '-table-read.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function printTableRead() {
  const doc = hooks.getDoc();
  const read = tableRead((doc && doc.elements) || [], rosterOf(doc));
  if (!read.rows.length) { StudioUI.toast('Nobody speaks yet — there is nothing to read.', { type: 'info' }); return; }
  const who = document.querySelector('[data-tr-who]')?.value || '';
  const main = document.getElementById('main');
  if (!main) return;
  let node = null;
  PDF.exportPDF({
    scope: 'tableread',
    setup: 'a4',
    label: who ? 'Sides — ' + who : 'Table read',
    title: PDF.projectTitle() + ' — ' + (who ? who + ' sides' : 'Table read'),
    subtitle: plural(read.rows.length, 'speaking part') + ' · ' + plural(read.totalWords, 'word'),
    classes: ['pdf-tableread'],
    before: () => { node = printNode(read, who); main.append(node); },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}

/* ---- edits ------------------------------------------------------ */

function charOfCard(box) {
  const name = box.dataset.chName;
  return list().find((c) => c.id === box.dataset.ch) || (name ? C.ownerOf(list(), name) : null);
}

let saveTimer = 0;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = 0; saveCharacters(list()); refreshNames(); }, 400);
}
function saveNow() { clearTimeout(saveTimer); saveTimer = 0; saveCharacters(list()); refreshNames(); }
addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

/* One shared card: its writes go where each field lives (the blueprint
   for a linked role's answers, else the stored list). */
const cardCtx = {
  list,
  save: (now) => { if (now) saveNow(); else saveSoon(); },
  rerender: () => refreshCharacters()
};

/* The names a rename moves: this card's name, the speakers its
   aliases already claim, and its aliases. */
function namesOf(box) {
  const v = viewFor(list(), box.dataset.ch, box.dataset.chName);
  const out = new Set([box.dataset.chName, v.name]);
  (v.aliases || []).forEach((a) => out.add(a));
  return [...out].filter(Boolean);
}

function previewRename(input) {
  const box = input.closest('details.wr-ch');
  const out = box && box.querySelector('[data-ch-preview]');
  const btn = box && box.querySelector('[data-action="ch-rename"]');
  if (!out || !btn) return null;
  const to = normName(input.value);
  if (!to) {
    out.textContent = 'Type the new name to see how many cues change.';
    btn.disabled = true;
    btn.textContent = 'Rename';
    return null;
  }
  const plan = renamePlan(hooks.getDoc().elements, namesOf(box), to);
  if (!plan.cues) {
    out.textContent = to === box.dataset.chName ? 'That is the name already.' : 'No cue would change.';
    btn.disabled = true;
    btn.textContent = 'Rename';
    return plan;
  }
  out.textContent = 'Renames ' + plural(plan.cues, 'cue') + ' in ' + plural(plan.scenes, 'scene') + ' to ' + to + '.'
    + (plan.merges ? ' ' + to + ' already speaks in this script, so the two become one character.' : '')
    + ' Extensions like (V.O.) and (CONT\'D) stay.';
  btn.disabled = false;
  btn.textContent = 'Rename ' + plural(plan.cues, 'cue');
  return plan;
}

/** Put cue texts on screen without a render: the rows that changed. */
function patchRows(changes) {
  const ids = [];
  for (const c of changes) {
    const ta = document.querySelector(`[data-el="${CSS.escape(String(c.id))}"] .wr-text`);
    if (ta && ta.value !== c.after) ta.value = c.after;
    ids.push(c.id);
  }
  hooks.scriptChanged(ids);
}

function doRename(btn) {
  const box = btn.closest('details.wr-ch');
  const input = box && box.querySelector('[data-ch-rename]');
  if (!input) return;
  const plan = previewRename(input);
  if (!plan || !plan.cues) return;
  const doc = hooks.getDoc();
  const from = box.dataset.chName;
  const c = charOfCard(box);
  const view = viewFor(list(), box.dataset.ch, box.dataset.chName);
  const linked = !!(view.backed && view.backed.name);
  const before = (c || linked) ? { name: linked ? (view.nameRaw || '') : (c ? c.name : ''), aliases: c ? c.aliases.slice() : [] } : null;
  const undo = applyPlan(doc.elements, plan);
  if (linked) setField(list(), view, 'name', plan.to);
  else if (c) { renameCharacter(c, plan.to); saveNow(); }
  patchRows(plan.changes);
  refreshCharacters();
  const again = document.querySelector(`details.wr-ch[data-ch-name="${CSS.escape(plan.to)}"]`);
  if (again) { again.open = true; again.querySelector('summary')?.focus(); }
  StudioUI.toast('Renamed ' + plural(undo.cues, 'cue') + ' from ' + from + ' to ' + plan.to + '.', {
    type: 'info', action: 'Undo',
    onAction: () => {
      const back = applyPlan(hooks.getDoc().elements, undo);
      if (before) {
        if (linked) setField(list(), viewFor(list(), box.dataset.ch, plan.to), 'name', before.name);
        else if (c) { c.name = before.name; c.aliases = before.aliases; saveNow(); }
      }
      patchRows(undo.changes);
      refreshCharacters();
      StudioUI.toast('Rename undone: ' + plural(back.cues, 'cue') + ' say ' + from + ' again.', { type: 'info' });
    }
  });
}

function forget(btn) {
  const box = btn.closest('details.wr-ch');
  const c = box && charOfCard(box);
  if (!c) return;
  const filled = CHARACTER_FIELDS.some((f) => c[f].trim()) || c.aliases.length || c.contactId || c.relationships.length;
  if (filled && !confirm(`Remove your notes on ${c.name}?\n\nThe script is not touched — if ${c.name} has cues, they stay on the list without notes.`)) return;
  const all = list();
  const at = all.indexOf(c);
  all.splice(at, 1);
  saveNow();
  refreshCharacters();
  StudioUI.toast('Notes on ' + c.name + ' removed.', {
    type: 'info', action: 'Undo',
    onAction: () => { list().splice(Math.min(at, list().length), 0, c); saveNow(); refreshCharacters(); }
  });
}

/** `opts.getDoc` returns the page's in-memory script; `opts.scriptChanged(ids)`
    runs the page's own save path after cues were changed in place. */
export function wireCharacters(opts = {}) {
  if (typeof opts.getDoc === 'function') hooks.getDoc = opts.getDoc;
  if (typeof opts.scriptChanged === 'function') hooks.scriptChanged = opts.scriptChanged;
  delegate(document, 'input', '#characters [data-ch-field], #characters [data-ch-extra], #characters [data-ch-rel]',
    (e, el) => { onCardInput(el, cardCtx); });
  delegate(document, 'change', '#characters [data-ch-field], #characters [data-ch-extra], #characters [data-ch-rel]',
    (e, el) => { onCardChange(el, cardCtx); });
  delegate(document, 'click', '#characters [data-ch-action]', (e, el) => { onCardClick(el, cardCtx); });
  delegate(document, 'input', '#characters [data-ch-rename]', (e, input) => previewRename(input));
  delegate(document, 'keydown', '#characters [data-ch-rename]', (e, input) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    const btn = input.closest('details.wr-ch')?.querySelector('[data-action="ch-rename"]');
    if (btn && !btn.disabled) doRename(btn);
  });
  delegate(document, 'click', '#characters [data-action="ch-rename"]', (e, btn) => doRename(btn));
  delegate(document, 'click', '#characters [data-action="ch-forget"]', (e, btn) => forget(btn));
  delegate(document, 'click', '#characters [data-action="tr-print"]', () => printTableRead());
  delegate(document, 'click', '#characters [data-action="tr-csv"]', () => downloadTableReadCSV());
  // Shown again: the cues may have changed on the Screenplay tab.
  addEventListener('hashchange', () => { if (location.hash === '#characters') refreshCharacters(); });
  // Another tab wrote the list (or a backup was restored there).
  addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(C.CHARACTERS_KEY)) { stored = null; refreshNames(); refreshCharacters(); }
  });
}

export default { renderCharacters, refreshCharacters, wireCharacters, characterNames };
