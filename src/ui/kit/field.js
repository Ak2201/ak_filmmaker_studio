/* KIT · FIELD — label row, control, trailing slot
   field({ kind, label, meta, metaAccent, hint, error, id, name, value,
           placeholder, options, addon, trail, rows, attrs })
     kind     'text' (default) | 'mono' | 'select' | 'eighths' |
              'timecode' | 'textarea' | 'number'
     meta     right-hand text on the label row (#ID: 42A, EIGHTHS, SMPTE TC)
     addon    a suffix cell with a hairline (PAGES)
     trail    a trailing node inside the control (a status badge, "24.00 FPS")
     options  for 'select': [{ value, label }] or strings
     attrs    copied onto the INPUT — this is where a `data-key` goes, and
              it is passed through untouched (data-key strings are the
              storage contract; the kit never invents one)
   'eighths' prints the value through formatEighths (1 3/8) when it is a
   number; read it back with parseEighths. 'timecode' is a mono field
   with the HH:MM:SS:FF shape; editlog.js parses it.
   check({ label, checked, attrs }) — the 14px square checkbox. */
import { h, cx, kids, attrs as copy } from './util.js';
import { formatEighths, parseEighths } from '../../lib/sample-figures.js';

let seq = 0;
const uid = () => 'kf-' + (++seq).toString(36);

export function field(o = {}) {
  const kind = o.kind || 'text';
  const id = o.id || uid();
  const wrap = h('div', { class: cx('k-field', o.class) });
  if (o.label || o.meta) {
    const lab = h('label.k-field-label', { for: id });
    kids(lab, [h('span', { text: o.label || '' }),
      o.meta ? h('span', { class: cx('k-field-meta', o.metaAccent && 'is-accent'), text: o.meta }) : null]);
    wrap.append(lab);
  }
  const mono = kind === 'mono' || kind === 'eighths' || kind === 'timecode' || kind === 'number';
  const ctl = h('div', { class: cx('k-control', mono && 'k-control--mono', kind === 'select' && 'k-select', kind === 'textarea' && 'k-control--textarea', o.error && 'is-invalid') });
  let input;
  if (kind === 'select') {
    input = h('select', { id, name: o.name });
    for (const opt of o.options || []) {
      const v = typeof opt === 'object' ? opt : { value: opt, label: opt };
      const op = h('option', { value: String(v.value), text: v.label != null ? String(v.label) : String(v.value) });
      if (String(v.value) === String(o.value)) op.selected = true;
      input.append(op);
    }
  } else if (kind === 'textarea') {
    input = h('textarea.k-textarea', { id, name: o.name, rows: o.rows || 4, placeholder: o.placeholder });
    if (o.value != null) input.value = String(o.value);
  } else {
    input = h('input.k-input', { id, name: o.name, type: kind === 'number' ? 'number' : 'text', placeholder: o.placeholder, autocomplete: 'off' });
    if (kind === 'eighths') {
      input.setAttribute('inputmode', 'text');
      input.setAttribute('spellcheck', 'false');
      if (!o.placeholder) input.placeholder = '1 3/8';
    }
    if (kind === 'timecode') {
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('pattern', '\\d{1,2}(:\\d{2}){1,3}');
      input.setAttribute('spellcheck', 'false');
      if (!o.placeholder) input.placeholder = '00:00:00:00';
    }
    const v = kind === 'eighths' && typeof o.value === 'number' ? formatEighths(o.value) : o.value;
    if (v != null) input.value = String(v);
  }
  if (o.error || o.hint) input.setAttribute('aria-describedby', id + '-hint');
  if (o.error) input.setAttribute('aria-invalid', 'true');
  copy(input, o.attrs);
  ctl.append(input);
  if (o.trail) ctl.append(kids(h('span.k-trail'), o.trail));
  if (o.addon) ctl.append(h('span.k-addon', { text: o.addon }));
  wrap.append(ctl);
  if (o.error || o.hint) wrap.append(h('p', { id: id + '-hint', class: cx('k-field-hint', o.error && 'is-error'), text: o.error || o.hint }));
  return wrap;
}

/** The control inside a field (for reading .value in a handler). */
export function fieldInput(fieldEl) {
  return fieldEl ? fieldEl.querySelector('input, select, textarea') : null;
}

export function check(o = {}) {
  const box = h('input', { type: 'checkbox' });
  box.checked = !!o.checked;
  copy(box, o.attrs);
  return kids(h('label', { class: cx('k-check', o.class) }), [box, h('span', { text: o.label || '' })]);
}

export { formatEighths, parseEighths };
