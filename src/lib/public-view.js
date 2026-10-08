/* ============================================================
   PUBLIC VIEW — a read-only link to ONE rendered document
   ------------------------------------------------------------
   DESIGN, BEHIND A FLAG THAT IS OFF. Nothing here is reachable in a
   shipped build: screening.js only looks at `#view=` when the build
   sets VITE_PUBLIC_VIEW=on, and no page offers a way to create a link.
   The server half is a PROPOSAL handed to the coordinator (the billing
   agent owns every schema section); it is not in supabase-schema.sql.

   WHY A SNAPSHOT, NOT A WINDOW ONTO THE PROJECT. A screening pass
   (section 13.6) opens a project's live scopes for a named viewer. A
   public link has no viewer and may be forwarded anywhere, so it must
   expose exactly what the owner looked at when they made it and not
   one field more. The OWNER'S browser renders the document's data
   here — snapshotPitch() / snapshotCallSheet() — and that object is
   what the server stores and the anon RPC returns. The RPC never joins
   into project data, so there is no query to get wrong.

   WHAT A SNAPSHOT MAY CARRY
     pitch      the deck as collectFrom() derives it: title, genre,
                logline, synopsis, theme, beats, characters (name, role,
                one line), key scenes (number, slug, synopsis), the
                numbers. No budget figure is in a deck today; none is
                added.
     callsheet  title, date, general call, location, the sheet's own
                notes, its scenes (number, slug, pages, synopsis), and
                the calls as NAME · ROLE · DEPARTMENT · TIME.
   NEVER: a phone number, an e-mail, a contact's private notes, an
   account or user id, a project id. stripPrivate() removes those keys
   at any depth before upload, and the proposed SQL rejects a payload
   that still has one (defence in depth: two independent checks).

   Pure apart from render*(), which build DOM. Writes no storage.
   ============================================================ */
import { h } from './dom.js';
import { collectFrom, buildDeck } from './pitch-deck.js';
import { VIEW_KINDS, hasPrivate, tokenShaped } from './public-view-model.js';

export { VIEW_KINDS, PRIVATE_KEYS, stripPrivate, hasPrivate, snapshotPitch, snapshotCallSheet, tokenShaped } from './public-view-model.js';

const txt = (v) => String(v ?? '').trim();

/* ---- the anon RPC (proposal: public.public_view_open) ------------- */

export class ViewError extends Error {
  constructor(message, code) { super(message); this.code = code || ''; }
}

/** Ask the server for the document behind `token`. `client` is a
 *  supabase-js client with no session (the screening room's). */
export async function openPublicView(client, token) {
  if (!tokenShaped(token)) throw new ViewError('That link is not complete. Ask the sender for it again.', 'shape');
  if (!client) throw new ViewError('This copy of the studio is not connected to a cloud project, so it cannot open shared links.', 'nocloud');
  const { data, error } = await client.rpc('public_view_open', { p_token: token });
  if (error) throw new ViewError(/expired|revoked|not valid|no such/i.test(error.message || '') ? 'This link has expired or been switched off. Ask the sender for a new one.' : 'That link could not be opened.', 'server');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !VIEW_KINDS.includes(row.kind) || !row.payload) throw new ViewError('That link could not be opened.', 'empty');
  /* The server already refused private keys at write time; refuse them
     again at read time, so a bad row is not drawn either. */
  if (hasPrivate(row.payload)) throw new ViewError('That link could not be opened.', 'private');
  return { kind: row.kind, title: txt(row.title) || txt(row.payload.title), expiresAt: row.expires_at || null,
           branding: row.branding !== false, ref: txt(row.ref), payload: row.payload };
}

/* ---- drawing ------------------------------------------------------ */

function fmtEighths(n) {
  if (!n) return '';
  const whole = Math.floor(n / 8), rest = n % 8;
  return (whole ? whole + (rest ? ' ' : '') : '') + (rest ? rest + '/8' : '') + ' pp';
}

export function renderCallSheet(p) {
  const s = (p && p.sheet) || {};
  const wrap = h('div.pv-sheet');
  const facts = [['Date', s.date], ['General call', s.generalCall], ['Location', s.location]].filter(([, v]) => v);
  if (facts.length) {
    const dl = h('dl.pv-facts');
    facts.forEach(([k, v]) => dl.append(h('div', {}, [h('dt', { text: k }), h('dd', { text: v })])));
    wrap.append(dl);
  }
  if (Array.isArray(s.scenes) && s.scenes.length) {
    const ol = h('ol.pv-scenes', { 'aria-label': 'Scenes on this call sheet' });
    s.scenes.forEach((x) => ol.append(h('li', {}, [
      h('strong', { text: (x.number ? x.number + ' · ' : '') + x.slug }),
      x.eighths ? h('span.pv-pages', { text: fmtEighths(x.eighths) }) : null,
      x.synopsis ? h('p', { text: x.synopsis }) : null
    ].filter(Boolean))));
    wrap.append(h('h2.bd-h2', { text: 'Scenes' }), ol);
  }
  if (Array.isArray(s.calls) && s.calls.length) {
    const table = h('table.pv-calls');
    table.append(h('thead', {}, [h('tr', {}, ['Name', 'Role', 'Department', 'Call'].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    s.calls.forEach((c) => tb.append(h('tr', {}, [c.name, c.role, c.department, c.time].map((t) => h('td', { text: t || '—' })))));
    table.append(tb);
    wrap.append(h('h2.bd-h2', { text: 'Calls' }), h('div.pv-table-wrap', {}, [table]));
  }
  if (s.notes) wrap.append(h('h2.bd-h2', { text: 'Notes' }), h('p.pv-notes', { text: s.notes }));
  return wrap;
}

export function renderPitch(p) {
  const deck = buildDeck((p && p.deck) || collectFrom({}), { brand: false });
  deck.classList.add('sc-deck');
  return deck;
}

export default { openPublicView, renderCallSheet, renderPitch };
