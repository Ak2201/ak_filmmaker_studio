/* Settings > Appearance > Reduce motion radio row. Kept out of motion-pref.js,
   which every page loads, so only settings pays for it. */
const KEY = 'fms_studio_prefs_v1';
const read = () => { try { const p = JSON.parse(localStorage.getItem(KEY) || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch (e) { return {}; } };
const motionReduced = () => read().reduceMotion === true;
/* Same merge-not-replace write as motion-pref.js; kept local so this file
   shares no module with the core chunk (a shared module re-chunks pages). */
function setMotionPref(mode) {
  const p = read();
  if (mode === 'reduced') p.reduceMotion = true; else delete p.reduceMotion;
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
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

