/* ============================================================
   THE CONTACT MODEL
   ------------------------------------------------------------
   One representation of a person, which every downstream module is
   a view of: the department list, the call sheet, and eventually the
   day out of days and the cast IDs a scene points at. Same argument
   as src/lib/scenes.js — build it once or build ten islands.

   STORAGE CONTRACT. `arunak_contacts_v1` is a new key, and a new key
   has to be registered in four places or it silently misbehaves:
     1. SCOPED_KEYS in src/lib/store.js  — namespaced per project
     2. PROJECT_KEYS in src/pages/hub.js — included in backups
     3. ALL_KEYS in src/pages/hub.js     — cleared by reset
     4. the scope check in supabase-schema.sql — allowed to sync
   All four are already done for this key. Miss #2 and a user's crew
   list is absent from the file that calls itself a full studio
   backup; that bug has already happened here once.

   ONE KEY, TWO COLLECTIONS. Call sheets live under this same key,
   beside the people, because a call sheet is a *view* of contacts
   plus scenes and has no life without them. It stores ids, never
   copies: a sheet holds `sceneIds` and a `calls` map keyed by
   contact id. Copying a name or a phone number onto the sheet would
   be the second representation the trap list warns about — rename
   the person and the sheet would quietly keep the old spelling.

   Times are stored as the plain "HH:MM" an `<input type="time">`
   gives back. No Date objects: a call time is a wall clock on a
   location, not an instant, and round-tripping it through a
   timezone is how it ends up an hour out.
   ============================================================ */
import Store from './store.js';

export const CONTACTS_KEY = 'arunak_contacts_v1';

/* The departments a unit list is read in, top to bottom: the people
   in front of the camera, then the ones behind it, then the ones who
   come after. Order is the order they appear on the page. */
export const DEPARTMENTS = [
  'Cast', 'Direction', 'Camera', 'Sound', 'Art',
  'Costume', 'Makeup', 'Production', 'Post'
];

const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/** A contact with every field present, so callers never guard for undefined. */
export function blankContact(patch = {}) {
  return {
    id: uid(),
    name: '',
    role: '',
    department: DEPARTMENTS[0],
    phone: '',
    email: '',
    notes: '',
    ...patch
  };
}

/** A call sheet with every field present. `calls` is { contactId: 'HH:MM' };
    an empty string means "the general call", not "no call". */
export function blankCallSheet(patch = {}) {
  return {
    id: uid(),
    title: '',
    date: '',
    generalCall: '',
    location: '',
    notes: '',
    sceneIds: [],
    calls: {},
    ...patch
  };
}

/** Everything persisted under the contacts key, shape-guaranteed. */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(CONTACTS_KEY); } catch (e) { /* private mode */ }
  if (!raw) return { contacts: [], callSheets: [] };
  try {
    const parsed = JSON.parse(raw) || {};
    // An empty array is truthy — the trap that once gave returning users
    // a table with no rows and no way to add one. Check Array.isArray.
    return {
      contacts:   Array.isArray(parsed.contacts)   ? parsed.contacts   : [],
      callSheets: Array.isArray(parsed.callSheets) ? parsed.callSheets : []
    };
  } catch (e) {
    return { contacts: [], callSheets: [] };
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(CONTACTS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---- people ------------------------------------------------- */

export function listContacts() {
  return readAll().contacts.map((c) => ({ ...blankContact(), ...c }));
}

/** Writes the people and leaves the call sheets alone. Read-modify-write
    rather than replacing the whole blob: the two collections share one
    key and a naive write drops whichever one the caller wasn't holding. */
export function saveContacts(contacts) {
  const all = readAll();
  return writeAll({ ...all, contacts });
}

export function addContact(patch) {
  const contacts = listContacts();
  const contact = blankContact(patch);
  contacts.push(contact);
  saveContacts(contacts);
  return contact;
}

export function updateContact(id, patch) {
  const contacts = listContacts();
  const i = contacts.findIndex((c) => c.id === id);
  if (i < 0) return null;
  contacts[i] = { ...contacts[i], ...patch, id };   // id is not patchable
  saveContacts(contacts);
  return contacts[i];
}

/** Removing a person also removes them from every call sheet. A `calls`
    entry pointing at a deleted id is a stranded key — the same defect
    that once inflated the progress denominator forever. */
export function removeContact(id) {
  const all = readAll();
  const contacts = listContacts().filter((c) => c.id !== id);
  const callSheets = all.callSheets.map((sheet) => {
    if (!sheet || !sheet.calls || !(id in sheet.calls)) return sheet;
    const calls = { ...sheet.calls };
    delete calls[id];
    return { ...sheet, calls };
  });
  writeAll({ contacts, callSheets });
  return contacts;
}

/** The unit list: every department that has somebody in it, in reading
    order, each with its people. Derived on every call, never stored —
    two copies of this would drift within a day. */
export function byDepartment() {
  const contacts = listContacts();
  const known = DEPARTMENTS.filter((d) => contacts.some((c) => c.department === d));
  const extra = [...new Set(contacts.map((c) => c.department))]
    .filter((d) => d && !DEPARTMENTS.includes(d));
  return [...known, ...extra].map((department) => ({
    department,
    people: contacts.filter((c) => c.department === department)
  }));
}

/* ---- call sheets --------------------------------------------- */

export function listCallSheets() {
  return readAll().callSheets.map((s) => ({ ...blankCallSheet(), ...s }));
}

export function saveCallSheets(callSheets) {
  const all = readAll();
  return writeAll({ ...all, callSheets });
}

export function addCallSheet(patch) {
  const sheets = listCallSheets();
  const sheet = blankCallSheet({ title: 'Shoot day ' + (sheets.length + 1), ...patch });
  sheets.push(sheet);
  saveCallSheets(sheets);
  return sheet;
}

export function updateCallSheet(id, patch) {
  const sheets = listCallSheets();
  const i = sheets.findIndex((s) => s.id === id);
  if (i < 0) return null;
  sheets[i] = { ...sheets[i], ...patch, id };
  saveCallSheets(sheets);
  return sheets[i];
}

export function removeCallSheet(id) {
  const sheets = listCallSheets().filter((s) => s.id !== id);
  saveCallSheets(sheets);
  return sheets;
}

/** Put a scene on a day, or take it off. The sheet holds scene ids only;
    the scene itself stays the scene model's business. */
export function toggleSheetScene(sheetId, sceneId, on) {
  const sheet = listCallSheets().find((s) => s.id === sheetId);
  if (!sheet) return null;
  const ids = sheet.sceneIds.filter((id) => id !== sceneId);
  if (on) ids.push(sceneId);
  return updateCallSheet(sheetId, { sceneIds: ids });
}

/** Put a person on a day (`on`), take them off (`on` false), or set their
    time (`time`). An empty string is a real value — it means the person is
    called, at the general call. */
export function setSheetCall(sheetId, contactId, on, time) {
  const sheet = listCallSheets().find((s) => s.id === sheetId);
  if (!sheet) return null;
  const calls = { ...sheet.calls };
  if (on) calls[contactId] = time === undefined ? (calls[contactId] || '') : time;
  else delete calls[contactId];
  return updateCallSheet(sheetId, { calls });
}

export default {
  CONTACTS_KEY, DEPARTMENTS,
  blankContact, listContacts, saveContacts, addContact, updateContact, removeContact,
  byDepartment,
  blankCallSheet, listCallSheets, saveCallSheets, addCallSheet, updateCallSheet,
  removeCallSheet, toggleSheetScene, setSheetCall
};
