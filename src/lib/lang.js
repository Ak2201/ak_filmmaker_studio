/* ============================================================
   LANGUAGE — English / Tanglish, for explanation prose only
   ------------------------------------------------------------
   WHAT SWITCHES AND WHAT DOES NOT.

   Only explanation switches: the prose that teaches. Interface
   labels, beat names, section headings, field labels, page numbers
   and film titles stay in English in both modes, deliberately.

   Two reasons. A filmmaker working in Tanglish still calls a logline
   a logline and a midpoint a midpoint — those are the working
   vocabulary of the trade here, and translating them would make the
   page harder to use, not easier. And an interface that half-changes
   under you is worse than one that does not change at all.

   TANGLISH, NOT TAMIL SCRIPT. Romanised Tamil in the spoken register,
   with English craft terms left inline, exactly as src/data/
   glossary.json has always written it:

     "Thotta enna poidum. Podhuvaa 'ooru azhiyum' illa -
      ivanukku personal-aa enna poidum."

   That is how people in this industry actually talk and type. It is
   also plain ASCII, so it survives every font on every device, which
   Tamil script does not.

   THE FIELD CONVENTION. A translatable string `foo` carries its
   Tanglish as `fooTanglish`, alongside. Missing translations fall
   back to English rather than rendering empty — a page with one
   untranslated sentence is usable; a page with one blank card is not.

   The preference is global, not project-scoped: which language you
   read in is a property of you, not of the film you have open.
   ============================================================ */

export const LANG_KEY = 'fms_studio_lang_v1';

export const LANGS = [
  { id: 'en', label: 'English' },
  { id: 'tl', label: 'Tanglish' }
];

const listeners = new Set();
let current = null;

/** @returns {'en'|'tl'} */
export function currentLang() {
  if (current) return current;
  let v = null;
  try { v = localStorage.getItem(LANG_KEY); } catch (e) { /* private mode */ }
  current = v === 'tl' ? 'tl' : 'en';
  return current;
}

export function setLang(next) {
  const v = next === 'tl' ? 'tl' : 'en';
  if (v === currentLang()) return v;
  current = v;
  try { localStorage.setItem(LANG_KEY, v); } catch (e) { /* private mode */ }
  document.documentElement.setAttribute('data-lang', v);
  listeners.forEach((cb) => { try { cb(v); } catch (e) { console.warn('[lang]', e); } });
  return v;
}

export function onLangChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Read a translatable field off an object.
 * `t(beat, 'inFilm')` returns beat.inFilmTanglish in Tanglish mode
 * when it exists, and beat.inFilm otherwise.
 */
export function t(obj, key) {
  if (!obj) return '';
  if (currentLang() === 'tl') {
    const alt = obj[key + 'Tanglish'];
    if (typeof alt === 'string' && alt.trim()) return alt;
  }
  return obj[key] || '';
}

/**
 * The switch itself. Built here rather than per page so every page
 * gets the same control, the same keys and the same behaviour.
 * Pages bind [data-action="set-lang"] through their own delegate().
 */
export function langToggle(opts) {
  const o = opts || {};
  const wrap = document.createElement('div');
  wrap.className = 'lang-switch' + (o.className ? ' ' + o.className : '');
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', 'Reading language');
  LANGS.forEach((l) => {
    const on = currentLang() === l.id;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lang-btn' + (on ? ' is-on' : '');
    b.dataset.action = 'set-lang';
    b.dataset.lang = l.id;
    b.setAttribute('aria-pressed', String(on));
    b.textContent = l.label;
    wrap.append(b);
  });
  if (o.hint) {
    const h = document.createElement('span');
    h.className = 'lang-hint';
    h.textContent = o.hint;
    wrap.append(h);
  }
  return wrap;
}

/** Stamp the attribute early so CSS can key off it before first paint. */
export function initLang() {
  document.documentElement.setAttribute('data-lang', currentLang());
  return currentLang();
}

if (typeof window !== 'undefined') {
  window.StudioLang = { currentLang, setLang, onLangChange, t, langToggle, initLang, LANGS };
}

export default { currentLang, setLang, onLangChange, t, langToggle, initLang, LANGS, LANG_KEY };
