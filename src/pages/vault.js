/* ============================================================
   IDEA VAULT — its own page, one click from the Story stage
   ------------------------------------------------------------
   The vault used to be a tab under the Story editor. The owner asked
   for it to be a section of its own, easy to reach and not inside the
   story space. The data did not move: clippings are still
   `fms_idea_vault_v1`, read and written through src/lib/story.js, and
   "pin to a beat" still reads the story's chosen framework from
   `fms_story_v1`. This page WRITES a story only for "ADD TO SYNOPSIS",
   which appends the clipping to the synopsis exactly as the Story
   page's own button does.
   ============================================================ */
import '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/story.css';
import '../styles/vault.css';
import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import * as Story from '../lib/story.js';
import { drainClipQueue, onClipQueued } from '../lib/extension-bridge.js';
import { renderVault } from '../ui/idea-vault.js';
import { appendClipToSynopsis, removeClip, restoreClip } from '../lib/vault-model.js';
import { pageHeader } from '../ui/kit/index.js';

const app = document.getElementById('app');

function render() {
  const s = Story.loadStory();
  const main = h('main#main');
  main.append(pageHeader({
    class: 'bd-head vault-head',
    eyebrow: ['Story', 'Idea Vault'],
    title: 'Idea Vault.',
    sub: 'Everything you collect for this film, in one place. Pin a clipping to a beat, or add it to the synopsis when it earns its place.'
  }));
  const sec = h('section.st-sec', { id: 'vault', 'data-tab-label': 'Idea Vault' });
  sec.append(renderVault(s));
  main.append(sec);
  app.replaceChildren(main);
  mountShell();
  try { StudioUI.autoAriaLabels(); StudioUI.polishEmptyStates(); } catch (e) { console.warn('[vault] chrome', e); }
}

delegate(document, 'click', '[data-st]', (e, el) => {
  const act = el.getAttribute('data-st');
  if (act === 'clip-add') {
    const ta = document.getElementById('stClip');
    if (Story.addToVault({ snippet: ta && ta.value })) render();
  } else if (act === 'clip-use') {
    if (!appendClipToSynopsis(el.getAttribute('data-clip'))) return;
    StudioUI.toast('Added to the end of the synopsis.');
  } else if (act === 'clip-del') {
    const gone = removeClip(el.getAttribute('data-clip'));
    render();
    if (gone) {
      StudioUI.toast('Clipping removed.', {
        action: 'UNDO',
        onAction: () => { if (restoreClip(gone)) render(); }
      });
    }
  }
});
delegate(document, 'change', '[data-st-field="clip-beat"]', (e, el) => {
  Story.updateVault(el.getAttribute('data-clip'), { beat: el.value });
});

/* Clips sent from the extension: those queued while this page was
   closed, and any that arrive while it is open (the side panel). */
const drain = () => drainClipQueue().then((n) => {
  if (n) {
    render();
    StudioUI.toast(`${n} clipping${n === 1 ? '' : 's'} arrived in the Idea Vault.`, { type: 'success' });
  }
});

render();
drain();
onClipQueued(drain);
