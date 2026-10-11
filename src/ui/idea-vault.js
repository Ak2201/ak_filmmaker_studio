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

export function renderVault(s) {
  const sec = h('div.st-vault');
  sec.append(h('p.bd-sub', { text: 'The Chrome extension’s “Send to ' + BRAND.name + '” lands here with the page it came from; you can also add one by hand.' }));
  const add = h('div.st-vault-add');
  add.append(h('label.st-label', { for: 'stClip', text: 'Add a clipping' }));
  add.append(h('textarea#stClip.st-text', { rows: 2 }));
  add.append(h('button.btn', { type: 'button', 'data-st': 'clip-add', text: 'ADD TO VAULT' }));
  sec.append(add);
  const items = Story.listVault();
  if (!items.length) { sec.append(h('p.st-muted', { text: 'Nothing clipped yet.' })); return sec; }
  const fw = Story.frameworkById(s.framework);
  const ul = h('ul.st-clips');
  for (const it of items) {
    const li = h('li.st-clip');
    li.append(h('p.st-clip-text', { text: it.snippet }));
    const meta = h('div.st-clip-meta');
    let host = '';
    try { host = it.url ? new URL(it.url).hostname : ''; } catch (e) { host = ''; }
    if (host) meta.append(h('a.st-clip-src', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: host }));
    meta.append(h('span.st-muted', { text: new Date(it.at).toLocaleDateString() }));
    const ps = h('select', { 'data-st-field': 'clip-beat', 'data-clip': it.id, 'aria-label': 'Pin this clipping to a beat' });
    ps.append(h('option', { value: '', text: 'Pin to a beat…' }));
    fw.beats.forEach((b) => ps.append(h('option', { value: fw.id + ':' + b.id, text: b.label })));
    ps.value = it.beat && it.beat.startsWith(fw.id + ':') ? it.beat : '';
    meta.append(ps);
    meta.append(h('button.btn', { type: 'button', 'data-st': 'clip-use', 'data-clip': it.id, text: 'ADD TO SYNOPSIS' }));
    meta.append(h('button.btn.st-x', { type: 'button', 'data-st': 'clip-del', 'data-clip': it.id, text: 'REMOVE' }));
    li.append(meta);
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

export default { renderVault };
