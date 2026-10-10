/* "How this works" — a shell-band button + modal player, only where the
   page's module(s) have an approved video. Loaded on idle by shell.js. */
import '../styles/video.css';
import { h, delegate } from '../lib/dom.js';
import { approvedFor } from '../lib/videos.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import { facade } from './video.js';

let overlay = null;

function close() {
  if (!overlay) return;
  overlay.classList.remove('show');
  const o = overlay; overlay = null;
  releaseFocus(o);
  o.remove();
}

function open(videos) {
  close();
  const title = h('h3', { id: 'vidHelpTitle', text: 'How this works' });
  overlay = h('div.modal-overlay.show.vid-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'vidHelpTitle' }, [
    h('div.modal', {}, [
      h('button.modal-close', { type: 'button', 'data-action': 'video-help-close', 'aria-label': 'Close' , text: '×' }),
      title,
      ...videos.map((v) => h('div.vid-item', {}, [facade(v), v.why ? h('p.vid-why', { text: v.why }) : null]))
    ])
  ]);
  document.body.append(overlay);
  holdFocus(overlay);
  const first = overlay.querySelector('.vid-play');
  if (first) first.focus();
}

export function mountHelp(bar, moduleIds) {
  if (!bar || bar.querySelector('.vid-help-btn')) return;
  const seen = new Set();
  const videos = [];
  for (const id of moduleIds) for (const v of approvedFor('module:' + id)) {
    if (!seen.has(v.id)) { seen.add(v.id); videos.push(v); }
  }
  if (!videos.length) return;
  const host = bar.querySelector(':scope > .toolbar, :scope > .sh-tools') || bar;
  host.prepend(h('button.btn.vid-help-btn', {
    type: 'button', 'data-action': 'video-help-open', text: '▶ How this works'
  }));
  delegate(document, 'click', '[data-action="video-help-open"]', () => open(videos));
}

delegate(document, 'click', '[data-action="video-help-close"]', close);
document.addEventListener('click', (e) => { if (overlay && e.target === overlay) close(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay) { e.stopPropagation(); close(); } }, true);
