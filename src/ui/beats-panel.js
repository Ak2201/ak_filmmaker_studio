/* STUB — replaced by the real beats panel at merge (S3).
   Contract: mountBeats(host, { getElements, scrollToEl, onJump }). */
import { h } from '../lib/dom.js';

export function mountBeats(host /* , { getElements, scrollToEl, onJump } */) {
  if (!host) return;
  host.replaceChildren(h('h2.sc-beats-h', { text: 'Beats' }));
}

export default { mountBeats };
