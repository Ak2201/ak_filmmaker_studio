/* ============================================================
   LINKS — where the files live, never the files
   ------------------------------------------------------------
   This studio is local-first and stores no media (the quota, the
   backups and the sync column are all text — see the header of
   shots.js). Footage, proxies, dailies, cuts and masters live in
   somebody's cloud: Drive, Frame.io, LucidLink, Dropbox. What the
   studio can keep is the ADDRESS, so the person who needs a file
   can reach it from the row that asks for it.

   PURE, AND NO STORAGE OF ITS OWN. Callers keep a `links` array on
   a record they already own (a deliverable's state, a scene's edit
   note, a cut version) and run it through cleanLinks() on read, so
   an older record with no `links` reads back [].

   A LINK IS TEXT WE DID NOT WRITE. Only http and https are kept: a
   `javascript:` or `data:` address pasted into a row would otherwise
   become a live anchor on a page that holds months of work. The
   anchor is rendered with rel="noopener noreferrer" by the caller.
   ============================================================ */

export const LINK_KINDS = [
  { id: 'drive',    label: 'Google Drive', hosts: ['drive.google.com', 'docs.google.com'] },
  { id: 'frameio',  label: 'Frame.io',     hosts: ['frame.io', 'app.frame.io', 'f.io'] },
  { id: 'lucid',    label: 'LucidLink',    hosts: ['lucidlink.com'] },
  { id: 'dropbox',  label: 'Dropbox',      hosts: ['dropbox.com', 'dl.dropboxusercontent.com'] },
  { id: 'other',    label: 'Other',        hosts: [] }
];
export const MAX_LINKS = 6;
const MAX_URL = 600;

const kindIds = LINK_KINDS.map((k) => k.id);
export const kindLabel = (id) => (LINK_KINDS.find((k) => k.id === id) || LINK_KINDS[LINK_KINDS.length - 1]).label;

/** The address if it is an http(s) URL, else ''. Trimmed, length-capped. */
export function safeUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s || s.length > MAX_URL) return '';
  let u;
  try { u = new URL(s); } catch (e) { return ''; }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
}

/** Which service an address belongs to, by host; 'other' when unknown. */
export function guessKind(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return 'other'; }
  const hit = LINK_KINDS.find((k) => k.hosts.some((h) => host === h || host.endsWith('.' + h)));
  return hit ? hit.id : 'other';
}

let seq = 0;
const uid = () => 'ln' + Date.now().toString(36) + (seq++).toString(36);

/** One link, or null when the address is not a safe URL. */
export function cleanLink(l) {
  const url = safeUrl(l && l.url);
  if (!url) return null;
  const kind = kindIds.includes(l && l.kind) ? l.kind : guessKind(url);
  return { id: typeof (l && l.id) === 'string' && l.id ? l.id : uid(), kind, url, label: String((l && l.label) ?? '').trim().slice(0, 80) };
}

/** A stored `links` value as a clean array: unsafe entries dropped, the
    rest capped at MAX_LINKS, duplicates by address removed. */
export function cleanLinks(list) {
  const seen = new Set();
  const out = [];
  for (const l of Array.isArray(list) ? list : []) {
    const c = cleanLink(l);
    if (!c || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
    if (out.length === MAX_LINKS) break;
  }
  return out;
}

/** `links` with one more, or the same list when it is unsafe, a duplicate
    or the list is full. Returns { links, added: link|null, why }. */
export function withLink(list, { url, kind, label } = {}) {
  const cur = cleanLinks(list);
  const c = cleanLink({ url, kind, label });
  if (!c) return { links: cur, added: null, why: 'That is not a web address. Paste a full link starting with https://' };
  if (cur.some((x) => x.url === c.url)) return { links: cur, added: null, why: 'That link is already here.' };
  if (cur.length >= MAX_LINKS) return { links: cur, added: null, why: 'A row holds up to ' + MAX_LINKS + ' links.' };
  return { links: cur.concat([c]), added: c, why: '' };
}

export const withoutLink = (list, id) => cleanLinks(list).filter((l) => l.id !== id);

/** What an anchor shows: the label if there is one, else the service. */
export const linkText = (l) => l.label || kindLabel(l.kind);

export default { LINK_KINDS, MAX_LINKS, kindLabel, safeUrl, guessKind, cleanLink, cleanLinks, withLink, withoutLink, linkText };
