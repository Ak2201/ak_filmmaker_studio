/* Settings > Appearance > Reduce motion radio row. Kept out of motion-pref.js,
   which every page loads, so only settings pays for it. */
/* The blob (fms_studio_prefs_v1) is src/lib/chrome-prefs.js's: a
   merge-not-replace write, the same one motion-pref.js reads. */
import { motionReduced, saveMotionPref } from '../lib/chrome-prefs.js';

function setMotionPref(mode) {
  saveMotionPref(mode);   // private mode: false, and the page still follows the click
  const root = document.documentElement;
  root.classList.toggle('ma-off', mode === 'reduced');
  if (mode === 'reduced') root.style.setProperty('--motion', '0'); else root.style.removeProperty('--motion');
}

/** Appends the Auto / Reduced radio row to a settings section. */
export function mountMotionChoice(sec) {
  const cur = motionReduced() ? 'reduced' : 'auto';
  const grp = document.createElement('div');
  grp.className = 'st-group';
  grp.setAttribute('role', 'radiogroup');
  grp.setAttribute('aria-label', 'Reduce motion');
  const lab = document.createElement('span');
  lab.className = 'st-group-label';
  lab.textContent = 'Reduce motion';
  const row = document.createElement('div');
  row.className = 'st-choices';
  [['auto', 'Auto (follow system)'], ['reduced', 'Reduced']].forEach(([v, text]) => {
    const on = v === cur;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn st-choice' + (on ? ' is-on' : '');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('data-motion-choice', v);
    const s = document.createElement('span');
    s.textContent = text;
    b.append(s);
    b.addEventListener('click', () => {
      setMotionPref(v);
      row.querySelectorAll('[data-motion-choice]').forEach((x) => {
        const m = x.getAttribute('data-motion-choice') === v;
        x.classList.toggle('is-on', m);
        x.setAttribute('aria-checked', String(m));
      });
    });
    row.append(b);
  });
  grp.append(lab, row);
  sec.append(grp);
}

