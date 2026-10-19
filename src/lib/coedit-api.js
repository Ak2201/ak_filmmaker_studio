/* ============================================================
   THE CO-EDITING SWITCH — the console's calls (schema §49)
   ------------------------------------------------------------
   The view (src/ui/coedit-admin.js) asks; this calls, through
   cloud-api.js, as docs/ARCHITECTURE.md V2 requires.
     readCoEditSwitch()    → { on, missing }  missing: §49 has not run
     setCoEditSwitch(on)   → the switch as the server now holds it
   ============================================================ */
import { rpc } from './cloud-api.js';

const isMissing = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /Could not find|does not exist/i.test(String(e.message || '')));

export async function readCoEditSwitch() {
  const { data, error } = await rpc('co_editing_enabled');
  if (error) {
    if (isMissing(error)) return { on: false, missing: true };
    throw new Error(error.message || 'The co-editing switch could not be read.');
  }
  return { on: data === true, missing: false };
}

export async function setCoEditSwitch(on) {
  const { data, error } = await rpc('admin_set_co_editing_enabled', { p_enabled: !!on });
  if (error) throw new Error(error.message || 'The switch was not changed.');
  return data === true;
}

export default { readCoEditSwitch, setCoEditSwitch };
