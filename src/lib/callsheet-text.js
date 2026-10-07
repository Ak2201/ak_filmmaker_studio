/* ============================================================
   THE CALL SHEET AS A MESSAGE — WhatsApp, share, copy
   ------------------------------------------------------------
   A Tamil indie unit does not read a PDF at 5am; it reads the
   production group on WhatsApp. So the call sheet has a second form:
   one plain-text message, for the whole unit or for one person with
   their own call time on the first line.

   PURE. It takes the sheet's facts already looked up (the page does
   that from the contact, scene and recce models, at the moment of
   sending) and returns strings. Nothing is stored: a message is a
   view of the sheet, and keeping a copy would be a second call time
   that disagrees with the first the day somebody's call moves.

   THE LINK IS A NAVIGATION, NOT A REQUEST. `https://wa.me/<digits>
   ?text=…` is an ordinary link the browser opens, and WhatsApp (app
   or web) takes it from there. No script is loaded and nothing is
   fetched, so connect-src in the CSP has nothing to say about it.

   THE LIMIT. WhatsApp accepts long messages, but a wa.me link carrying
   one does not survive every phone's hand-off, and a unit message is
   read on a lock screen. WA_LIMIT keeps the text under ~4000
   characters: the scene list is cut first, with "+N more" saying how
   many went; then the notes, with an ellipsis; nothing else is cut.
   ============================================================ */

export const WA_LIMIT = 3800;

/**
 * A phone number as wa.me wants it: country code and number, digits
 * only. A bare 10-digit Indian mobile (6–9 first) gains 91; a number
 * written with India's trunk 0 (0 + 10 digits, mobile or STD landline)
 * swaps the 0 for 91. Anything with its own country code is
 * left alone. '' when there are too few digits to be a number.
 */
export function waDigits(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (/^00\d/.test(d)) d = d.slice(2);                   // 0091 98…
  if (/^0\d{10}$/.test(d)) d = '91' + d.slice(1);         // 098… or 044…: India's trunk 0
  else if (/^[6-9]\d{9}$/.test(d)) d = '91' + d;           // a bare mobile
  return d.length >= 8 && d.length <= 15 ? d : '';
}

/** The wa.me link. With no digits it opens WhatsApp's chat picker,
    which is how a message reaches a group. */
export function waLink(digits, text) {
  return 'https://wa.me/' + (digits || '') + '?text=' + encodeURIComponent(String(text || ''));
}

/* ---- building the message ------------------------------------- */

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

function headLines(f) {
  const lines = [];
  const title = [clean(f.film), clean(f.title)].filter(Boolean);
  // "Dragon — Dragon — Day 1" when the title already leads with the film
  if (title.length === 2 && title[1].toLowerCase().startsWith(title[0].toLowerCase())) title.shift();
  lines.push('*' + (title.join(' — ') || 'Call sheet') + '*');
  const when = [f.dayNumber ? 'Day ' + f.dayNumber : '', clean(f.date)].filter(Boolean).join(' · ');
  if (when) lines.push(when);
  return lines;
}

function factLines(f) {
  const lines = [];
  lines.push('General call: ' + (clean(f.generalCall) || 'not set'));
  if (clean(f.wrap)) lines.push('Planned wrap: ' + clean(f.wrap));
  if (clean(f.location)) lines.push('Location: ' + clean(f.location));
  if (f.mapUrl) lines.push('Map: ' + f.mapUrl);
  if (f.light && f.light.sunrise) {
    lines.push('Sunrise ' + f.light.sunrise + ' · Sunset ' + f.light.sunset
      + (f.light.zone ? ' (' + f.light.zone + ')' : '')
      + (f.light.fallback ? ' — for Chennai; the location has no pin yet' : ''));
  }
  return lines;
}

function sceneLine(s) {
  const no = clean(s.number) || '—';
  return no + ' · ' + (clean(s.slug) || 'Scene') + (clean(s.pages) ? ' · ' + clean(s.pages) + ' pp' : '');
}

function assemble(top, f, sceneCount, notes) {
  const scenes = f.scenes || [];
  const out = top.slice();
  if (scenes.length) {
    out.push('', '*Scenes (' + scenes.length + (clean(f.pagesTotal) ? ' · ' + clean(f.pagesTotal) + ' pages' : '') + ')*');
    scenes.slice(0, sceneCount).forEach((s) => out.push(sceneLine(s)));
    const rest = scenes.length - sceneCount;
    if (rest > 0) out.push('+' + rest + ' more');
  }
  if (notes) out.push('', '*Notes*', notes);
  return out.join('\n');
}

/* Cut the scene list, then the notes, until the whole thing fits. */
function fit(top, f, limit) {
  const scenes = f.scenes || [];
  const notes = String(f.notes || '').trim();
  let text = assemble(top, f, scenes.length, notes);
  if (text.length <= limit) return text;
  for (let n = scenes.length - 1; n >= 0; n--) {
    text = assemble(top, f, n, notes);
    if (text.length <= limit) return text;
  }
  const room = limit - assemble(top, f, 0, ' ').length;
  const cut = room > 1 ? notes.slice(0, room - 1).trimEnd() + '…' : '';
  text = assemble(top, f, 0, cut);
  return text.length <= limit ? text : text.slice(0, limit - 1) + '…';
}

/**
 * The whole unit's message.
 *
 *   facts = { film, title, dayNumber, date, generalCall, wrap, location,
 *             mapUrl, light: { sunrise, sunset, zone, fallback } | null,
 *             scenes: [{ number, slug, pages }], pagesTotal, notes }
 */
export function unitMessage(facts, limit = WA_LIMIT) {
  const f = facts || {};
  return fit([...headLines(f), ...factLines(f)], f, limit);
}

/**
 * One person's message: their own call first, then the same essentials.
 *   person = { name, role, department, call }   call '' = the general call
 */
export function personMessage(facts, person, limit = WA_LIMIT) {
  const f = facts || {};
  const p = person || {};
  const first = clean(p.name).split(' ')[0];
  const job = [clean(p.department), clean(p.role)].filter(Boolean).join(' · ');
  const call = clean(p.call) || clean(f.generalCall);
  const top = headLines(f);
  top.push('', (first ? first + ', your call: ' : 'Your call: ')
    + (call ? '*' + call + '*' : 'the general call (time not set)')
    + (!clean(p.call) && call ? ' (general call)' : '')
    + (job ? '\n' + job : ''));
  top.push('', ...factLines(f));
  return fit(top, f, limit);
}

export default { WA_LIMIT, waDigits, waLink, unitMessage, personMessage };
