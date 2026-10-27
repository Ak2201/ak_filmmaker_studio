/* ============================================================
   CO-EDITING ADMIN — the switch, in the console's People tab
   ------------------------------------------------------------
   Schema §49. One block: "Merge collaborators' edits line by line".
   Off (the default) is how the studio has always worked: the newer
   whole script wins, and the Screenplay Writer keeps the other copy as
   a draft. On: a collaborator's save is merged into yours line by line
   (src/lib/script-merge.js). The owner turns it on after two real
   accounts have tried it (docs/LIVE-STEPS-2026-10-19.md).

   The server decides: co_editing_enabled() reads it for anyone, and
   admin_set_co_editing_enabled() refuses everyone but the owner. A
   database where §49 has not run says so instead of drawing a switch.
   No inline handlers (CSP): delegate() on [data-coedit-action].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { ask } from './dialog.js';
import { readCoEditSwitch, setCoEditSwitch } from '../lib/coedit-api.js';
import { studioRole } from './admin-customer.js';

const S = { state: 'idle', on: false, missing: false, busy: false, error: '', owner: false };
let rerender = () => {};

const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };
async function load() {
  S.state = 'loading'; rerender();
  try {
    const [r, role] = await Promise.all([readCoEditSwitch(), studioRole().catch(() => null)]);
    S.on = r.on; S.missing = r.missing;
    /* Only the owner may change it (the server refuses anyone else);
       everyone else sees the state as text. */
    S.owner = role === 'owner';
    S.error = '';
    S.state = 'ready';
  } catch (e) {
    S.error = e.message || 'The switch could not be read.'; S.state = 'error';
  } finally { rerender(); }
}

export const COEDIT_ON = 'On: when two people write the same screenplay at once, their changes are merged line by line. A line both of them changed keeps the later edit.';
export const COEDIT_OFF = 'Off: the newer copy of the whole script wins, and the Screenplay Writer keeps the other copy as a draft.';

export function coEditSwitchBlock(onChange) {
  if (onChange) rerender = onChange;
  if (S.state === 'idle') load();
  const box = h('div.gr-panel.acc-switch', { id: 'coEditing' });
  box.append(h('h3.gt-h3', { text: 'Co-editing' }));
  if (S.state === 'error') {
    box.append(h('p.gt-meta', { text: S.error }),
      h('div.gr-row', {}, [h('button.btn', { type: 'button', 'data-coedit-action': 'retry', text: 'Try again' })]));
    return box;
  }
  if (S.state !== 'ready') { box.append(h('p.gt-meta', { text: 'Loading…' })); return box; }
  if (S.missing) {
    box.append(h('p.gt-meta', { text: 'This switch is not available on this database yet (schema section 49 has not run). Until it runs, the newer copy of a script wins, as it always has.' }));
    return box;
  }
  if (S.owner) {
    const sw = h('input', { id: 'coEditOn', type: 'checkbox', 'data-coedit-action': 'switch' });
    sw.checked = S.on;
    sw.disabled = S.busy;
    box.append(h('div.gr-row', {}, [h('label.gr-check', { for: 'coEditOn' }, [sw, h('span', { text: 'Merge collaborators’ edits line by line' })])]));
  }
  box.append(h('p.gr-meta', { 'data-coedit-state': S.on ? 'on' : 'off', text: S.on ? COEDIT_ON : COEDIT_OFF }));
  if (!S.owner) box.append(h('p.gt-meta', { text: 'Only the owner can change this.' }));
  return box;
}

delegate(document, 'click', '[data-coedit-action="retry"]', () => { S.state = 'idle'; load(); });

delegate(document, 'change', '[data-coedit-action="switch"]', async (e, el) => {
  const want = el.checked;
  if (want && !(await ask('Turn co-editing on?\n\n' + COEDIT_ON + '\n\nIt applies to every project, from each page\'s next load. You can turn it off again here.', { confirm: 'Turn on' }))) {
    el.checked = false; return;
  }
  S.busy = true; rerender();
  try {
    S.on = await setCoEditSwitch(want);
    toast(S.on ? 'Co-editing is on. Pages pick it up on their next load.' : 'Co-editing is off. The newer copy wins again.', 'success');
  } catch (err) {
    toast(err.message || 'The switch was not changed.', 'error');
  }
  S.busy = false; rerender();
});

export default { coEditSwitchBlock };
