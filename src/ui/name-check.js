/* ============================================================
   CHECK NAMES — the script's own spelling of its names
   ------------------------------------------------------------
   The logic is src/lib/name-spell.js (pure); that file says why a
   textarea cannot be told to skip a known name and what the editor does
   instead. This is the sheet that lists what the script itself suggests:

     "preethy" -> Preethi   (3 places)   [Fix every instance] [Ignore]

   Fix every instance is the Find and replace's own replaceAll (whole
   word, case kept: a cue in capitals stays in capitals), applied as ONE
   step in the editor's undo history — Ctrl+Z in the script puts every
   line back. Ignore is held in memory for the visit; nothing here is
   stored and nothing is applied without a press.
   ============================================================ */
import { h } from '../lib/dom.js';
import { button, sheet } from './kit/index.js';
import { nameSuspects, fixInstances, knownWords } from '../lib/name-spell.js';

const ignored = new Set();

/**
 * o = {
 *   getDoc, editor (checkpoint, patchRow), persistNow, afterChange,
 *   extraNames,   () => names the Characters page knows
 *   say, returnTo
 * }
 */
export function openNameCheck(o) {
  const els = () => (o.getDoc() || {}).elements || [];
  const extra = () => { try { return (o.extraNames && o.extraNames()) || []; } catch (e) { return []; } };
  const body = h('div.sc-names', {});

  function fix(s) {
    const { changes, count } = fixInstances(els(), s.wrong, s.right);
    if (!count) { render(); return; }
    // One step: Ctrl+Z in the script undoes the whole fix.
    o.editor.checkpoint('replace');
    const list = els();
    for (const c of changes) {
      const el = list.find((e) => e.id === c.id);
      if (!el) continue;
      el.text = c.after;
      o.editor.patchRow(c.id);
    }
    o.persistNow();
    o.afterChange();
    o.say('Fixed ' + count + (count === 1 ? ' place' : ' places') + ': ' + s.wrong + ' is now ' + s.right + '. Ctrl+Z undoes it.');
    render();
  }

  function render() {
    const suspects = nameSuspects(els(), extra(), ignored);
    const known = [...knownWords(els(), extra())].sort();
    body.replaceChildren(...[
      h('p.sc-names-lede', {
        text: 'The script’s own cues are the spelling of its names. A word close to one of them and used far less often may be a slip. Each is only a suggestion.'
      }),
      suspects.length
        ? h('ul.sc-names-list', {}, suspects.map((s) => h('li.sc-names-row', {}, [
          h('span.sc-names-what', {}, [
            h('strong', { text: s.wrong }), ' → ', h('strong', { text: s.right }),
            h('span.sc-names-n', { text: ' · ' + s.count + (s.count === 1 ? ' place' : ' places') })
          ]),
          button({ label: 'Fix every instance', variant: 'secondary', size: 'sm', attrs: { 'data-nc-fix': s.wrong } }),
          button({ label: 'Ignore', variant: 'ghost', size: 'sm', attrs: { 'data-nc-ignore': s.wrong } })
        ])))
        : h('p.sc-names-none', { role: 'status', text: 'No likely misspellings of a name found.' }),
      known.length ? h('p.sc-names-known', { text: 'Names this script knows: ' + known.join(', ') + '.' }) : null
    ].filter(Boolean));   // replaceChildren(null) would print "null"
    body._suspects = suspects;
  }
  body.addEventListener('click', (e) => {
    const f = e.target.closest && e.target.closest('[data-nc-fix]');
    const g = e.target.closest && e.target.closest('[data-nc-ignore]');
    if (f) { const s = (body._suspects || []).find((x) => x.wrong === f.dataset.ncFix); if (s) fix(s); }
    else if (g) { ignored.add(g.dataset.ncIgnore); render(); }
  });
  render();
  return sheet({ title: 'Check names', body, kind: 'names', returnTo: o.returnTo });
}

export default { openNameCheck };
