/* ============================================================
   THE IDEA VAULT — clippings for a film, drawn on vault.html
   ------------------------------------------------------------
   A verbatim move of story.js's renderVault(): same markup, same
   data-st attributes, same key (fms_idea_vault_v1, through
   src/lib/story.js). It is a section of its own now, not a tab
   under the Story editor, so it is reachable in one click.
   ============================================================ */
import { h } from '../lib/dom.js';
import { BRAND } from '../lib/brand.js';
import * as Story from '../lib/story.js';
import { button, badge, emptyState, panel } from './kit/index.js';

/* "11 Oct 2026": the same unambiguous form the Drafts page prints, never
   the locale's 10/11/2026, which reads two ways. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (at) => { const d = new Date(at); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };

export function renderVault(s) {
  const sec = h('div.st-vault');
  sec.append(h('p.bd-sub', { text: 'The Chrome extension’s “Send to ' + BRAND.name + '” lands here with the page it came from; you can also add one by hand.' }));
  const add = h('div.st-vault-add');
  add.append(h('label.st-label', { for: 'stClip', text: 'Add a clipping' }));
  add.append(h('textarea#stClip.st-text.k-textarea', { rows: 3 }));
  add.append(button({ label: 'Add to vault', variant: 'primary', icon: 'add', attrs: { 'data-st': 'clip-add' } }));
  sec.append(panel({ class: 'st-vault-panel', body: [add] }));
  const items = Story.listVault();
  if (!items.length) { sec.append(emptyState({ icon: 'lightbulb', title: 'Nothing clipped yet.', body: 'Add one above, or send a page from the Chrome extension.' })); return sec; }
  const fw = Story.frameworkById(s.framework);
  const ul = h('ul.st-clips');
  for (const it of items) {
    const li = h('li.st-clip');
    li.append(h('p.st-clip-text', { text: it.snippet }));
    const meta = h('div.st-clip-meta');
    let host = '';
    try { host = it.url ? new URL(it.url).hostname : ''; } catch (e) { host = ''; }
    if (host) meta.append(h('a.st-clip-src', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: host }));
    meta.append(badge({ label: dayLabel(it.at), tag: true }));
    const ps = h('select', { 'data-st-field': 'clip-beat', 'data-clip': it.id, 'aria-label': 'Pin this clipping to a beat' });
    ps.append(h('option', { value: '', text: 'Pin to a beat…' }));
    fw.beats.forEach((b) => ps.append(h('option', { value: fw.id + ':' + b.id, text: b.label })));
    ps.value = it.beat && it.beat.startsWith(fw.id + ':') ? it.beat : '';
    meta.append(ps);
    meta.append(button({ label: 'Add to synopsis', size: 'sm', attrs: { 'data-st': 'clip-use', 'data-clip': it.id } }));
    meta.append(button({ label: 'Remove', size: 'sm', variant: 'ghost', icon: 'delete', class: 'st-x', attrs: { 'data-st': 'clip-del', 'data-clip': it.id } }));
    li.append(meta);
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

export default { renderVault };
