/* ============================================================
   THE FOUR BLUEPRINT TABLES' ROWS — scene list (step 11), shot list
   (16), cast list (20), location list (21)
   ------------------------------------------------------------
   Moved out of src/pages/feature.js unchanged when a second renderer
   appeared: the guide drawer (src/ui/blueprint-drawer.js) shows a
   blueprint step inside the module that does its work, and the rows
   it draws have to carry the SAME data-keys the blueprint saves
   (`sl_N_slug`, `shot_N_lens`, ...). A second copy of this markup is
   how the two would come apart — a column renamed here and not there
   is a field the drawer writes and the blueprint never reads back.

   Pure markup builders: no state, no listeners, no storage. The page
   that appends a row wires it.
   ============================================================ */

export function rowCtrls() {
  return `<td class="row-ctrl">
      <button type="button" class="row-ctrl-btn" data-action="duplicateRow" title="Duplicate row">⎘</button>
      <button type="button" class="row-ctrl-btn del" data-action="deleteRow" title="Delete row">✕</button>
    </td>`;
}

// VOL I — Scene list (Step 11)
export function buildSceneRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="sl_${idx}_slug" placeholder="INT. LOCATION – DAY"></td>
      <td><input type="text" data-key="sl_${idx}_pov" placeholder="POV"></td>
      <td><textarea data-key="sl_${idx}_want" placeholder="Wants..."></textarea></td>
      <td><textarea data-key="sl_${idx}_conf" placeholder="What blocks it..."></textarea></td>
      <td>
        <select data-key="sl_${idx}_charge">
          <option value="">—</option>
          <option value="pos">+ → −</option>
          <option value="neg">− → +</option>
          <option value="dbl-pos">+ → ++</option>
          <option value="dbl-neg">− → −−</option>
        </select>
      </td>
      ${rowCtrls()}
    `;
  return tr;
}

// VOL II — Shot list (Step 16)
export function buildShotRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="shot_${idx}_scene" placeholder="Sc#"></td>
      <td><textarea data-key="shot_${idx}_desc" placeholder="Action / blocking"></textarea></td>
      <td>
        <select data-key="shot_${idx}_lens">
          <option value="">Lens...</option>
          <optgroup label="Wide"><option>12mm</option><option>14mm</option><option>16mm</option><option>18mm</option><option>21mm</option><option>24mm</option></optgroup>
          <optgroup label="Normal"><option>28mm</option><option>32mm</option><option>35mm</option><option>40mm</option><option>50mm</option></optgroup>
          <optgroup label="Tele"><option>65mm</option><option>75mm</option><option>85mm</option><option>100mm</option><option>135mm</option><option>200mm</option></optgroup>
          <optgroup label="Anamorphic"><option>32mm Ana</option><option>40mm Ana</option><option>50mm Ana</option><option>75mm Ana</option></optgroup>
          <optgroup label="Other"><option>Zoom 24-70</option><option>Zoom 70-200</option><option>Macro</option><option>Probe lens</option></optgroup>
        </select>
      </td>
      <td>
        <select data-key="shot_${idx}_move">
          <option value="">Move...</option>
          <option>Static</option><option>Pan</option><option>Tilt</option>
          <option>Dolly in</option><option>Dolly out</option><option>Dolly with</option>
          <option>Push in</option><option>Pull out</option>
          <option>Handheld</option><option>Steadicam</option><option>Gimbal</option>
          <option>Slider</option><option>Crane / Jib</option><option>Drone / Aerial</option>
          <option>Whip pan</option><option>Tracking</option><option>Snap zoom</option>
        </select>
      </td>
      <td>
        <select data-key="shot_${idx}_coverage">
          <option value="">Coverage...</option>
          <option>Master</option><option>Establishing</option>
          <option>EWS — Extreme Wide</option><option>WS — Wide Shot</option>
          <option>MS — Medium</option><option>MCU — Medium CU</option>
          <option>CU — Close Up</option><option>ECU — Extreme CU</option>
          <option>OS — Over Shoulder</option><option>2-Shot</option>
          <option>POV</option><option>Insert</option><option>Cutaway</option>
        </select>
      </td>
      <td><textarea data-key="shot_${idx}_notes" placeholder="Lighting / notes"></textarea></td>
      ${rowCtrls()}
    `;
  return tr;
}

// VOL II — Cast list (Step 20)
export function buildCastRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="cast_${idx}_role" placeholder="Character name"></td>
      <td><input type="text" data-key="cast_${idx}_actor" placeholder="Actor"></td>
      <td>
        <select data-key="cast_${idx}_status">
          <option value="">Status...</option>
          <option>Not contacted</option><option>Audition scheduled</option>
          <option>Auditioned</option><option>Callback</option>
          <option>Look test</option><option>Chemistry read done</option>
          <option>Verbally confirmed</option><option>Contract signed</option>
          <option>Fully locked</option><option>Declined / withdrawn</option>
        </select>
      </td>
      <td><textarea data-key="cast_${idx}_notes" placeholder="Notes, dates, conflicts"></textarea></td>
      ${rowCtrls()}
    `;
  return tr;
}

// VOL II — Location list (Step 21)
export function buildLocRow(idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
      <td class="num">${String(idx).padStart(2, '0')}</td>
      <td><input type="text" data-key="loc_${idx}_scene" placeholder="Sc#"></td>
      <td><textarea data-key="loc_${idx}_name" placeholder="Location name + address"></textarea></td>
      <td>
        <select data-key="loc_${idx}_type">
          <option value="">Type...</option>
          <option>Real (as-is)</option><option>Real (dressed)</option>
          <option>Built set</option><option>Partial build</option>
          <option>Hybrid (real + build)</option><option>Studio</option>
          <option>Green screen</option>
        </select>
      </td>
      <td>
        <select data-key="loc_${idx}_permit">
          <option value="">Permit...</option>
          <option>Not required</option><option>Researching</option>
          <option>Application pending</option><option>Application filed</option>
          <option>Approved</option><option>Denied — need backup</option>
        </select>
      </td>
      <td><input type="text" data-key="loc_${idx}_recce" placeholder="DD / MM"></td>
      ${rowCtrls()}
    `;
  return tr;
}

/** tbody id → its row builder. The drawer and the blueprint both look
    a table up by the id its markup already carries. */
export const ROW_BUILDERS = {
  sceneListBody: buildSceneRow,
  shotListBody: buildShotRow,
  castListBody: buildCastRow,
  locListBody: buildLocRow
};

/** The row prefix each table's keys carry (`sl_3_slug` → 'sl'). */
export const ROW_PREFIX = { sceneListBody: 'sl', shotListBody: 'shot', castListBody: 'cast', locListBody: 'loc' };

export default { rowCtrls, buildSceneRow, buildShotRow, buildCastRow, buildLocRow, ROW_BUILDERS, ROW_PREFIX };
