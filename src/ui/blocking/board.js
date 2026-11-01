/* ============================================================
   THE SCENE BOARD (src/ui/blocking/board.js)
   ------------------------------------------------------------
   One scene on one surface: the script text, the shots, the storyboard
   frames and the blocking maps side by side, read-only, printable.
   Nothing is copied: every word on it is read from the model it came
   from, and the maps are drawn by the same draw.js as the editor — set,
   walks, beats and the 180-degree line included.
   ============================================================ */
import { h, delegate } from '../../lib/dom.js';
import { formatEighths } from '../../lib/scenes.js';
import Shots from '../../lib/shots.js';
import { button, badge, intExtBadge, todBadge } from '../kit/index.js';
import { S } from './state.js';
import { pickScene, scenePicker, slugOf, drawReadOnly } from './editor.js';

/* ---- the scene board ------------------------------------------- */
const EL_LABEL = { scene: 'scene', action: 'action', character: 'character', dialogue: 'dialogue', paren: 'paren', transition: 'transition', shot: 'shot' };

/** One column of the board: a kit panel whose head is the column's
    name and count. */
function sbCol(title, body, cls) {
  return h('div.vz-sb-col.k-panel' + (cls ? '.' + cls : ''), {}, [
    h('div.k-panel-head', {}, [h('h3.vz-sb-h.k-panel-title', { text: title })]),
    h('div.k-panel-body', {}, [].concat(body))
  ]);
}

export function renderSceneBoard(scenes, shots, frames, scriptElements, pairs, redraw) {
  S.rerender = redraw;
  const wrap = h('section.vz-sceneboard', { id: 'scene-board', 'data-tab-icon': 'article' });
  wrap.append(
    h('h2.bd-h2', { text: 'Scene board' }),
    h('p.bd-sub', {
      text: 'One scene on one page: the script, the shots, the storyboard frames and the maps, '
          + 'read from the places they live. Print it for the director, the DP and the first AD.'
    })
  );
  if (!scenes.length) {
    wrap.append(h('p.bd-none', { text: 'The scene board needs a scene. Break the script into scenes in the breakdown.' }));
    return wrap;
  }
  const scene = pickScene(scenes);
  wrap.append(h('div.vz-blk-pick', {}, [
    scenePicker(scenes, 'board'),
    button({ label: 'Print this board', icon: 'picture_as_pdf', action: 'board-print' })
  ]));

  const sheet = h('div.vz-sb');
  sheet.append(h('header.vz-sb-head', {}, [
    badge({ label: scene.number || '—', tag: true, class: 'vz-scene-no' }),
    h('span.vz-scene-slug', { text: slugOf(scene) }),
    h('span.vz-scene-badges', {}, [intExtBadge(scene.intExt), todBadge(scene.dayNight)]),
    // The length as every other view prints it ("2 2/8 pgs"), never raw eighths.
    h('span.vz-scene-count', { text: formatEighths(Number(scene.eighths) || 0) + ' pgs' })
  ]));
  if (scene.synopsis) sheet.append(h('p.vz-sb-syn', { text: scene.synopsis }));
  if (scene.readerNote) sheet.append(h('p.vz-sb-syn', { text: 'Reader note: ' + scene.readerNote }));

  // The script, as the model has it.
  const pair = (pairs || []).find((p) => p.scene.id === scene.id && p.slice);
  let scriptBody;
  if (pair && pair.slice.elements.length) {
    scriptBody = h('div.vz-sb-script');
    pair.slice.elements.slice(0, 60).forEach((el) => {
      const t = String(el.text || '').trim();
      if (t) scriptBody.append(h('p.vz-sb-el.vz-sb-' + (EL_LABEL[el.type] || 'action'), { text: t }));
    });
    if (pair.slice.elements.length > 60) scriptBody.append(h('p.vz-sb-more', { text: '…' }));
  } else {
    scriptBody = h('p.bd-none', { text: 'No script text is matched to this scene.' });
  }
  sheet.append(sbCol('Script', scriptBody));

  // The shots.
  const mine = shots.filter((s) => s.sceneId === scene.id);
  let shotBody;
  if (mine.length) {
    const t = h('table.k-table.vz-sb-table');
    t.append(h('thead', {}, [h('tr', {}, ['#', 'Size', 'Angle', 'Move', 'Lens', 'What we see', 'Status'].map((x) => h('th', { scope: 'col', text: x })))]));
    t.append(h('tbody', {}, mine.map((s, i) => {
      const st = Shots.shotStatus(s);
      const tr = h('tr' + (s.done ? '.is-done' : ''), {}, [
        s.number || String(i + 1), s.size, s.angle, s.movement, s.lens || '—', s.description || ''
      ].map((x) => h('td', { text: x })));
      tr.append(h('td', {}, [badge({ label: st.label, tone: st.tone, dot: true })]));
      return tr;
    })));
    shotBody = h('div.k-table-wrap', { role: 'region', tabindex: '0', 'aria-label': 'Shots in this scene' }, [t]);
  } else shotBody = h('p.bd-none', { text: 'No shots yet for this scene. Add them in the Shot list tab.' });
  sheet.append(sbCol('Shots · ' + mine.length, shotBody, 'vz-sb-shots'));

  // The storyboard frames, in shot order.
  const byShot = Shots.framesByShot();
  const fr = mine.flatMap((s) => (byShot.get(s.id) || []).map((f) => ({ f, s })));
  sheet.append(sbCol('Frames · ' + fr.length, fr.length
    ? h('ol.vz-sb-frames', {}, fr.map(({ f, s }) =>
      h('li', {}, [h('strong', { text: 'Shot ' + (s.number || '?') + ' ' }), h('span', { text: Shots.frameAction(f) || f.ref || 'untitled frame' })])))
    : h('p.bd-none', { text: 'No frames drawn for this scene. Draw them in the Storyboard tab.' })));

  // The maps, read-only.
  const blocks = Shots.blocksOfScene(scene.id);
  sheet.append(sbCol('Blocking · ' + blocks.length, blocks.length
    ? h('div.vz-sb-mapgrid', {}, blocks.map((b) => h('figure.vz-sb-map', {}, [
      drawReadOnly(b), h('figcaption', { text: [b.name, b.note].filter(Boolean).join(' — ') })
    ])))
    : h('p.bd-none', { text: 'No maps for this scene. Add one under Blocking.' }), 'vz-sb-maps'));

  wrap.append(sheet);
  return wrap;
}


delegate(document, 'click', '[data-action="board-print"]', () => { window.print(); });
