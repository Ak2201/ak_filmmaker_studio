/* ============================================================
   BEAT BOARD — the write page's Outline tab
   ------------------------------------------------------------
   The Story page's beats as a board (columns are acts, cards are
   beats, scenes sit under the beat they serve), a coverage meter, a
   beat navigator into the screenplay, and the editor's margin
   markers. Every number and every placement is derived by
   src/lib/beat-outline.js at render time; the one stored fact is a
   scene row's `beatId`.

   WRITES ONLY ON A CLICK, A DROP OR A CHANGE. Rendering reads the
   story, the scene list and the page's in-memory script and writes
   nothing — the idle-write assertion in verify. Placeholder scenes
   exist only after "Draft a scene for this beat" is pressed (owner's
   decision on PRD 2.0 §4.3), and the toast that follows removes
   exactly the row and the two elements that click added.

   THE SCRIPT IS THE PAGE'S. write.js owns `doc` in memory and decides
   when it is saved; this module asks through the ctx it is wired
   with (getDoc / saveDoc / rerender) rather than calling saveScript()
   behind the page's back, which would race the page's own save and
   lose whichever landed second.

   No AI here, deliberately: draftSceneList() in ai.js is written for a
   whole film (at least eight scenes, a total near a hundred pages), so
   using it for one beat would mean a new prompt in ai.js; left for a
   change that can own that prompt.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Scenes from '../lib/scenes.js';
import { loadStory } from '../lib/story.js';
import Outline from '../lib/beat-outline.js';
import { revealTarget } from './tabs.js';
import StudioUI from './chrome.js';
import '../styles/beat-board.css';

/* Act hues, from the CATEGORY family (.hue-*), never a phase class:
   an act is a category here, not a stage of the studio. */
const ACT_HUE = { 1: 'hue-plan', 2: 'hue-feature', 3: 'hue-shoot' };
const hueOf = (act) => ACT_HUE[act] || 'hue-library';

let ctx = null;
const els = () => (ctx && ctx.getDoc() && ctx.getDoc().elements) || [];

function current() {
  const story = loadStory();
  const o = Outline.outline({ story, scenes: Scenes.listScenes(), elements: els() });
  return { story, o, cov: Outline.coverage(o) };
}

const pages = (n) => (Math.round(n * 10) / 10).toFixed(1);
const sceneTitle = (s) => {
  const where = [s.intExt, s.location || 'location not set', s.dayNight].filter(Boolean).join(' · ');
  return 'Sc ' + (s.number || '—') + ' — ' + where;
};

/* ---- pieces -------------------------------------------------- */

function beatSelect(o, sp) {
  const sel = h('select.bb-pick', {
    'data-bb-field': 'beat',
    'aria-label': 'Beat for scene ' + (sp.scene.number || sp.index + 1)
  });
  const none = h('option', { value: '', text: 'No beat' });
  sel.append(none);
  let picked = false;
  for (const a of o.acts) {
    const g = h('optgroup', { label: a.label });
    for (const b of a.beats) {
      const opt = h('option', { value: b.key, text: b.beat.label });
      if (!sp.inferred && sp.scene.beatId === b.key) { opt.selected = true; picked = true; }
      g.append(opt);
    }
    sel.append(g);
  }
  if (sp.inferred && sp.scene.beatId) {
    // The stored link is in another framework; keep it selectable as
    // itself so opening the menu and closing it changes nothing.
    const keep = h('option', {
      value: sp.scene.beatId,
      text: sp.from ? sp.from.fw.short + ': ' + sp.from.beat.label : sp.scene.beatId
    });
    keep.selected = true; picked = true;
    sel.append(keep);
  }
  if (!picked) none.selected = true;
  return h('label.bb-pick-wrap', {}, [h('span', { text: 'Beat' }), sel]);
}

function sceneCard(o, sp) {
  const s = sp.scene;
  return h('li.bb-scene', {
    draggable: 'true', 'data-bb-scene': s.id,
    'aria-label': sceneTitle(s)
  }, [
    h('span.bb-scene-head', { text: sceneTitle(s) }),
    s.synopsis ? h('span.bb-scene-syn', { text: s.synopsis }) : null,
    h('span.bb-scene-meta', {
      text: pages(sp.pages) + ' pp'
        + (sp.source === 'script' ? '' : ' (from its eighths — no matching heading in the script)')
        + (sp.inferred && sp.from
          ? ' · linked in ' + sp.from.fw.label + ' to ' + sp.from.beat.label
          : '')
    }),
    beatSelect(o, sp)
  ]);
}

function beatCard(o, a, b) {
  const tagged = b.marks.filter((m) => !m.inferred);
  const shown = (tagged.length ? tagged : b.marks).slice(0, 2);
  const more = (tagged.length ? tagged : b.marks).length - shown.length;
  return h('article.bb-beat', { 'data-bb-beat': b.key, id: 'bb-' + b.key.replace(':', '-') }, [
    h('header.bb-beat-head', {}, [
      h('h4.bb-beat-name', { text: b.beat.label }),
      h('span.bb-tension', {
        title: 'Tension on the Story page, 1 to 10',
        text: 'Tension ' + b.tension + '/10'
      })
    ]),
    shown.length
      ? h('div.bb-marks', {}, shown.map((m) => h('blockquote.bb-mark', {
        text: m.text.length > 220 ? m.text.slice(0, 217).trimEnd() + '…' : m.text,
        title: m.inferred ? 'Nearest by position — not tagged on the Story page' : 'Tagged on the Story page'
      })).concat(more > 0 ? [h('p.bb-more', { text: '+ ' + more + ' more on the Story page' })] : []))
      : h('p.bb-prompt', { text: b.beat.prompt || '' }),
    h('ul.bb-scenes.bb-drop', {
      'data-bb-drop': b.key,
      'aria-label': 'Scenes for ' + b.beat.label
    }, b.scenes.length
      ? b.scenes.map((sp) => sceneCard(o, sp))
      : [h('li.bb-empty', { text: 'No scene yet. Drag one here, pick this beat on a scene, or draft one.' })]),
    h('button.btn.bb-draft', {
      type: 'button', 'data-action': 'bb-draft', 'data-bb-key': b.key,
      text: '+  Draft a scene for this beat'
    })
  ]);
}

function meter(o, cov) {
  const ratio = cov.beatsTotal ? cov.beatsCovered / cov.beatsTotal : 0;
  return h('div.bb-meter', { 'aria-label': 'Coverage' }, [
    h('div.bd-stats', {}, [
      h('div.bd-stat', {}, [h('strong', { text: cov.beatsCovered + '/' + cov.beatsTotal }), h('span', { text: 'beats with a scene' })]),
      h('div.bd-stat', {}, [h('strong', { text: pages(cov.linkedPages) }), h('span', { text: 'of ' + pages(cov.totalPages) + ' scene pages linked' })]),
      h('div.bd-stat', {}, [h('strong', { text: String(cov.unassigned) }), h('span', { text: cov.unassigned === 1 ? 'scene with no beat' : 'scenes with no beat' })])
    ]),
    h('div.bb-bar', {
      role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(cov.beatsTotal),
      'aria-valuenow': String(cov.beatsCovered), 'aria-label': 'Beats with a scene'
    }, [h('span.bb-bar-fill', { style: '--bb-fill:' + ratio })]),
    h('div.bb-acts-pace', {}, cov.acts.map((a) => h('div.bb-pace.' + hueOf(a.act), {}, [
      h('span.bb-pace-label', { text: a.label }),
      h('span.bb-pace-track', { 'aria-hidden': 'true' }, [
        h('span.bb-pace-expected', { style: '--bb-at:' + a.expected }),
        h('span.bb-pace-actual', { style: '--bb-fill:' + a.actual })
      ]),
      h('span.bb-pace-num', {
        text: a.status === 'none' ? '—' : Math.round(a.actual * 100) + '% / ' + Math.round(a.expected * 100) + '%'
      })
    ]))),
    h('ul.bb-checks', {}, cov.checks.map((c) => h('li.bb-check' + (c.ok ? '.is-ok' : '.is-todo'), {}, [
      h('span.bb-check-mark', { 'aria-hidden': 'true', text: c.ok ? '✓' : (c.status === 'none' ? '·' : '!') }),
      h('span', { text: (c.ok ? 'Passed: ' : '') + c.text })
    ])))
  ]);
}

function navigator(o) {
  const firsts = Outline.firstScenes(o);
  const sel = h('select#bb-nav-pick.bb-nav-pick', { 'aria-label': 'Beat to jump to' });
  if (!firsts.length) {
    sel.append(h('option', { value: '', text: 'No beat has a scene yet' }));
    sel.disabled = true;
  }
  for (const f of firsts) {
    const opt = h('option', {
      value: f.headingId,
      text: f.beat.label + ' — Sc ' + (f.scene.number || '?')
        + (f.headingId ? '' : ' (no heading in the script)')
    });
    if (!f.headingId) opt.disabled = true;
    sel.append(opt);
  }
  return h('div.bb-nav', {}, [
    h('label.bb-nav-label', { for: 'bb-nav-pick', text: 'Jump to the first scene of a beat' }),
    h('div.bb-nav-row', {}, [
      sel,
      h('button.btn', { type: 'button', 'data-action': 'bb-jump', disabled: firsts.some((f) => f.headingId) ? false : true, text: 'Go to the page' })
    ])
  ]);
}

/* ---- the section ---------------------------------------------
   ALWAYS RENDERS, with its id, whatever exists: no project, no
   story, no scenes. write.html#outline is a link somebody may follow
   before any of those exist, and a fragment that resolves only on a
   populated page is the nav-target trap in CLAUDE.md. */
export function renderOutline() {
  const section = h('section.wr-section.bb', { id: 'outline', 'data-tab-label': 'Outline' });
  const { story, o, cov } = current();
  section.append(
    h('h2.bd-h2', { text: 'Outline' }),
    h('p.bd-sub', {
      text: 'The beats of ' + o.fw.label + ', from the Story page, with the scenes that serve each one. '
        + 'Drag a scene to another beat, or pick its beat from the menu on the card. '
        + 'Nothing is added to the script until you ask for it.'
    }),
    h('p.bb-src', {}, [
      (story.source || '').trim()
        ? 'Passages are the ones tagged on the Story page. '
        : 'No synopsis on the Story page yet, so each beat shows what it is for. ',
      h('a', { href: 'story.html', text: 'Change the framework or tag passages on the Story page' }),
      '.'
    ]),
    meter(o, cov),
    navigator(o)
  );

  const board = h('div.bb-board', {});
  for (const a of o.acts) {
    board.append(h('div.bb-act.' + hueOf(a.act), { 'data-bb-act': String(a.act) }, [
      h('h3.bb-act-name', {}, [
        a.label,
        h('span.bb-act-share', { text: ' · about ' + Math.round(a.share * 100) + '% of the pages' })
      ]),
      ...a.beats.map((b) => beatCard(o, a, b))
    ]));
  }
  section.append(board);

  section.append(h('div.bb-tray', {}, [
    h('h3.bb-act-name', { text: 'Not linked to a beat' }),
    h('ul.bb-scenes.bb-drop', { 'data-bb-drop': '', 'aria-label': 'Scenes not linked to a beat' },
      o.unassigned.length
        ? o.unassigned.map((sp) => sceneCard(o, sp))
        : [h('li.bb-empty', {
          text: Scenes.listScenes().length
            ? 'Every scene is linked to a beat.'
            : 'No scenes yet. Draft one from a beat, write a scene heading, or import a script.'
        })])
  ]));
  return section;
}

/** Re-render the tab in place (the screenplay is untouched). */
function refresh() {
  const old = document.getElementById('outline');
  if (!old) return;
  const fresh = renderOutline();
  fresh.hidden = old.hidden;
  for (const a of ['role', 'aria-labelledby', 'tabindex']) {
    if (old.hasAttribute(a)) fresh.setAttribute(a, old.getAttribute(a));
  }
  old.replaceWith(fresh);
  decorateEditor();
}

/* ---- the margin markers ----------------------------------------
   A small label above the heading row of each beat's first scene.
   Built after a render, keyed only off [data-el], so it does not
   depend on how the row itself is drawn. DOM only. */
export function decorateEditor() {
  const page = document.getElementById('wr-page');
  if (!page) return;
  page.querySelectorAll('.bb-marker').forEach((n) => n.remove());
  page.querySelectorAll('.bb-has-marker').forEach((n) => n.classList.remove('bb-has-marker'));
  const { o } = current();
  for (const f of Outline.firstScenes(o)) {
    if (!f.headingId) continue;
    const row = page.querySelector(`[data-el="${CSS.escape(f.headingId)}"]`);
    if (!row) continue;
    row.classList.add('bb-has-marker');
    row.prepend(h('span.bb-marker.' + hueOf(f.act), {
      title: 'Beat: ' + f.beat.label + ' (' + Outline.actLabel(f.act) + ')',
      text: f.beat.label
    }));
  }
}

/* ---- actions ---------------------------------------------------- */

function setBeat(sceneId, key) {
  const s = Scenes.listScenes().find((x) => x.id === sceneId);
  if (!s || s.beatId === key) return;
  Scenes.updateScene(sceneId, { beatId: key });
  refresh();
}

function say(msg, opts) {
  try { StudioUI.toast(msg, Object.assign({ type: 'info' }, opts || {})); }
  catch (e) { /* chrome not up */ }
}

function draft(key) {
  const doc = ctx && ctx.getDoc();
  if (!doc) return;
  const scenes = Scenes.listScenes();
  const o = Outline.outline({ story: loadStory(), scenes, elements: doc.elements });
  const plan = Outline.draftPlan(o, key, scenes);
  if (!plan) return;

  const row = Scenes.blankScene(plan.scene);
  const next = scenes.slice();
  next.splice(Math.min(plan.sceneIndex, next.length), 0, row);
  Scenes.saveScenes(next);

  const added = plan.elements.map((e) => ctx.blankElement({ type: e.type, text: e.text }));
  const at = plan.elementIndex < 0 ? doc.elements.length : Math.min(plan.elementIndex, doc.elements.length);
  doc.elements.splice(at, 0, ...added);
  ctx.saveDoc();
  ctx.rerender();

  const ids = new Set(added.map((e) => e.id));
  const prev = next[next.indexOf(row) - 1];
  say('Drafted scene ' + row.number + ' for ' + plan.beat.label
    + (prev ? ', after scene ' + (prev.number || '?') : ', at the top')
    + ': a heading to fill in and one action line.', {
    action: 'Undo',
    onAction: () => {
      const d = ctx.getDoc();
      d.elements = d.elements.filter((e) => !ids.has(e.id));
      ctx.saveDoc();
      if (Scenes.listScenes().some((s) => s.id === row.id)) Scenes.removeScene(row.id);
      ctx.rerender();
      say('Removed the drafted scene and its two lines.');
    }
  });
}

function jump(headingId) {
  if (!headingId) return;
  revealTarget('screenplay');
  try {
    history.replaceState(history.state, '', location.pathname + location.search + '#screenplay');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } catch (e) { /* ignore */ }
  const row = document.querySelector(`#wr-page [data-el="${CSS.escape(headingId)}"]`);
  if (!row) return;
  row.scrollIntoView({ block: 'center', behavior: 'instant' });
  const ta = row.querySelector('textarea');
  if (ta) ta.focus({ preventScroll: true });
}

let dragId = '';

/** Called once by write.js. ctx = { getDoc, saveDoc, rerender, blankElement }. */
export function wireBeatBoard(c) {
  ctx = c;
  delegate(document, 'click', '[data-action="bb-draft"]', (e, btn) => draft(btn.dataset.bbKey));
  delegate(document, 'click', '[data-action="bb-jump"]', () => {
    const sel = document.getElementById('bb-nav-pick');
    if (sel) jump(sel.value);
  });
  delegate(document, 'change', 'select[data-bb-field="beat"]', (e, sel) => {
    const card = sel.closest('[data-bb-scene]');
    if (card) setBeat(card.dataset.bbScene, sel.value);
  });
  /* Opening the tab re-derives it, so pages typed on the screenplay
     tab a minute ago are counted. DOM only. */
  delegate(document, 'click', '.tabs [data-tab="outline"]', () => refresh());

  delegate(document, 'dragstart', '[data-bb-scene]', (e, card) => {
    dragId = card.dataset.bbScene;
    try { e.dataTransfer.setData('text/plain', dragId); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* */ }
    card.classList.add('is-dragging');
  });
  delegate(document, 'dragend', '[data-bb-scene]', (e, card) => {
    card.classList.remove('is-dragging');
    dragId = '';
    document.querySelectorAll('.bb-drop.is-over').forEach((n) => n.classList.remove('is-over'));
  });
  delegate(document, 'dragover', '.bb-drop', (e, zone) => {
    if (!dragId) return;
    e.preventDefault();
    zone.classList.add('is-over');
  });
  delegate(document, 'dragleave', '.bb-drop', (e, zone) => {
    if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
  });
  delegate(document, 'drop', '.bb-drop', (e, zone) => {
    if (!dragId) return;
    e.preventDefault();
    const id = dragId;
    dragId = '';
    setBeat(id, zone.dataset.bbDrop || '');
  });
}

export default { renderOutline, decorateEditor, wireBeatBoard };
