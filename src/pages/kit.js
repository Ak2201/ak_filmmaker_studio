/* ============================================================
   KIT SHOWCASE — dev only (kit.html is not a build input)
   ------------------------------------------------------------
   Renders every kit component in every state, in the order of the
   Swiss Precision component showcase, so a change to tokens.css or
   kit.css can be eyeballed in one place. Touches no storage, so no
   store.js; loads no chrome.js (no site gate, no shell) — just the
   design sheets and the kit. The dialogs it opens are the real
   dialog.js.

   #modal opens the typed-confirmation dialog on load, pre-filled to
   its VERIFIED state, for a screenshot.
   ============================================================ */
import '../styles/base.css';
import '../styles/skins/studio.css';
import '../styles/chrome.css';
import '../styles/kit.css';
import { h, delegate } from '../lib/dom.js';
import * as K from '../ui/kit/index.js';

try { document.fonts.ready.then(() => document.documentElement.classList.add('sym-ready')); } catch (e) { document.documentElement.classList.add('sym-ready'); }
document.documentElement.setAttribute('data-theme', 'studio');

const app = document.getElementById('app');
const sec = (n, title, meta, ...body) => h('section.kit-sec', { id: 's' + n }, [
  h('div.kit-sec-head', {}, [h('h2.kit-sec-title', { text: 'Section ' + n + ': ' + title }), meta ? h('span.k-badge.k-badge--tag', { text: meta }) : null]),
  ...body
]);
const row = (...kids) => h('div.kit-row', {}, kids);
const grid = (...kids) => h('div.kit-grid', {}, kids);

const main = h('main.kit');
main.append(K.pageHeader({
  eyebrow: ['Specification & component rig', 'v2.4.0-prod'],
  title: 'Swiss Precision Suite.',
  sub: 'High-density workstation design language for film production: every kit component, in every state, on the tokens in src/styles/tokens.css.',
  meta: [K.badge({ label: 'Grid: 4px strict', tone: 'ok', dot: true }), K.badge({ label: 'Theme: dark only', tag: true })],
  actions: [K.button({ label: 'Secondary', icon: 'content_copy' }), K.button({ label: 'New project', variant: 'primary', icon: 'add', pill: true })]
}));

/* 1 — modal */
main.append(sec(1, 'Modal dialogs', 'dialog.js', K.panel({
  eyebrow: 'Open the real dialog', meta: '4 kinds',
  body: row(
    K.button({ label: 'Lock draft (typed)', variant: 'primary', icon: 'lock', action: 'kit-lock' }),
    K.button({ label: 'Delete (danger)', variant: 'danger', icon: 'delete', action: 'kit-danger' }),
    K.button({ label: 'Tell', action: 'kit-tell' }),
    K.button({ label: 'Ask text', variant: 'ghost', action: 'kit-text' })
  )
})));

/* 2 — buttons + segmented */
const variants = ['primary', 'secondary', 'ghost', 'danger'];
main.append(sec(2, 'Button system & controls', null, grid(
  K.panel({ eyebrow: 'Standard action controls', meta: '4 spec variants', body: h('div.kit-stack', {}, [
    row(...variants.map((v) => K.button({ label: v[0].toUpperCase() + v.slice(1), variant: v }))),
    row(...variants.map((v) => K.button({ label: v, variant: v, size: 'sm' }))),
    row(...variants.map((v) => K.button({ label: v, variant: v, size: 'lg', icon: 'bolt' }))),
    row(...variants.map((v) => K.button({ label: v, variant: v, disabled: true }))),
    row(h('span.k-eyebrow.k-eyebrow-muted', { text: 'Precision action grips:' }),
      K.buttonGroup([K.button({ iconOnly: true, icon: 'drag_indicator', label: 'Drag', variant: 'ghost' }), K.button({ iconOnly: true, icon: 'content_copy', label: 'Copy', variant: 'ghost' }), K.button({ iconOnly: true, icon: 'close', label: 'Close', variant: 'ghost' }), K.button({ iconOnly: true, icon: 'tune', label: 'Tune', variant: 'ghost' })], { label: 'Grips' }),
      K.button({ label: 'Primary pill', variant: 'primary', pill: true }))
  ]) }),
  K.panel({ eyebrow: 'Segmented view switcher', meta: K.badge({ label: 'Live dock', tone: 'ok', dot: true }), body: h('div.kit-stack', {}, [
    K.segmented({ label: 'Sort strips', name: 'sort', value: 'shoot', options: [{ value: 'script', label: 'Script order' }, { value: 'location', label: 'Location' }, { value: 'shoot', label: 'Shoot day' }, { value: 'song', label: 'Song' }] }),
    K.segmented({ label: 'Quiet', name: 'quiet', quiet: true, value: 'w', options: [{ value: 'd', label: 'Day' }, { value: 'w', label: 'Week' }, { value: 'm', label: 'Month' }] })
  ]) })
)));

/* 3 — badges + chips */
main.append(sec(3, 'Iconography & chromatic badges', null, grid(
  K.panel({ eyebrow: 'Status badges', body: h('div.kit-stack', {}, [
    row(K.badge({ label: 'Neutral' }), K.badge({ label: 'Synced', tone: 'ok', dot: true }), K.badge({ label: 'Pending', tone: 'warn', dot: true }), K.badge({ label: 'Conflict', tone: 'danger', dot: true }), K.badge({ label: 'Locked', tone: 'info', icon: 'lock' }), K.badge({ label: 'Pro', solid: true })),
    row(K.intExtBadge('INT'), K.intExtBadge('EXT'), K.intExtBadge('INT/EXT'), K.badge({ label: 'SC 42A', tag: true }))
  ]) }),
  K.panel({ eyebrow: 'Stripboard chromatic badges', meta: 'SMPTE standard', body: h('div.kit-stack', {}, [
    row(K.todBadge('DAY', { label: 'Day ext' }), K.todBadge('NIGHT', { label: 'Night ext' }), K.todBadge('DUSK', { label: 'Dusk' }), K.todBadge('DAWN', { label: 'Dawn' }), K.todBadge('CONTINUOUS')),
    h('p.k-eyebrow.k-eyebrow-muted', { text: 'DOOD talent codes:' }),
    row(...['SW', 'W', 'H', 'WF', 'D', ''].map((c) => K.doodCode(c)))
  ]) }),
  K.panel({ eyebrow: 'Element chips', meta: K.CATEGORIES.length + ' categories', body: h('div.kit-stack', {}, [
    row(...K.CATEGORIES.map((c, i) => K.chip({ label: c[0].toUpperCase() + c.slice(1), category: c, count: i + 1 }))),
    row(K.chip({ label: 'Thorne', category: 'cast', showCategory: true, removable: true, value: 'thorne' }), K.chip({ label: 'Radar dish', category: 'props', removable: true }), K.chip({ label: 'Uncategorised' }))
  ]) })
)));

/* 4 — fields */
main.append(sec(4, 'Form fields & monospace inputs', null, K.panel({ body: h('div.kit-fields', {}, [
  K.field({ label: 'Scene designation', meta: '#ID: 42A', kind: 'mono', value: 'SC 42A', trail: K.badge({ label: 'Approved', tone: 'ok' }) }),
  K.field({ label: 'Script fraction', meta: 'Eighths', metaAccent: true, kind: 'eighths', value: 11, addon: 'Pages' }),
  K.field({ label: 'Lighting setup', meta: 'Filter', kind: 'select', value: 'golden', options: [{ value: 'golden', label: 'DAY EXT (Golden Hour) — 3200K' }, { value: 'night', label: 'NIGHT INT — practicals' }] }),
  K.field({ label: 'Time estimate', meta: 'SMPTE TC', metaAccent: true, kind: 'timecode', value: '00:02:45:12', trail: '24.00 FPS' }),
  K.field({ label: 'Location', placeholder: 'Black Sea cliffs', hint: 'As the slug line names it.' }),
  K.field({ label: 'Day count', kind: 'mono', value: 'twelve', error: 'Not a number of days.' }),
  K.field({ label: 'Notes', kind: 'textarea', placeholder: 'What the 1st AD needs to know…' }),
  h('div.kit-stack', {}, [K.check({ label: 'Company move', checked: true }), K.check({ label: 'Second unit' })])
]) })));

/* 5 — tables + strips */
const DAYS = ['d1', 'd2', 'd3', 'd4', 'd5'];
const cast = [
  { name: 'Capt. Thorne', no: '#01', d1: 'SW', d2: 'W', d3: 'W', d4: 'W', d5: 'W', total: 22 },
  { name: 'Dr. Aris', no: '#02', d1: '', d2: 'SW', d3: 'W', d4: 'W', d5: 'H', total: 14 },
  { name: 'The Handler', no: '#04', d1: 'H', d2: 'H', d3: 'SW', d4: 'W', d5: 'WF', total: 3 }
];
main.append(sec(5, 'Data tables & stripboard racks', null,
  h('p.k-eyebrow.k-eyebrow-muted', { text: 'Active stripboard production rack' }),
  K.stripList([
    K.strip({ tod: 'DAWN', intExt: 'EXT', scene: '42A', slug: 'EXT. BLACK SEA CLIFFS - DAWN', pages: 11, cast: '1, 4, 7 (SW)', day: 'DAY 4', menuAction: 'kit-strip-menu' }),
    K.strip({ tod: 'NIGHT', intExt: 'EXT', scene: '43', slug: 'EXT. BUNKER PERIMETER - NIGHT', pages: 20, cast: '1, 2 (W)', day: 'DAY 4', selected: true, menuAction: 'kit-strip-menu' }),
    K.stripBanner({ label: 'End of shoot day 04 — estimated runtime: 08h 15m' }),
    K.strip({ tod: 'DUSK', intExt: 'INT', scene: '44', slug: 'INT. ABANDONED RADAR DECK - MAGIC HOUR', pages: 5, cast: '4 (WF)', day: 'DAY 5', menuAction: 'kit-strip-menu' }),
    K.strip({ tod: 'DAY', intExt: 'INT', scene: '45', slug: 'INT. CONTROL ROOM - DAY', pages: 8, cast: '2', day: 'DAY 5' })
  ], { label: 'Strips' }),
  h('p.k-eyebrow.k-eyebrow-muted', { text: 'Day-out-of-days (DOOD) talent matrix' }),
  K.table({
    label: 'DOOD matrix', stickyFirst: true, center: true, todayCol: 'd4',
    columns: [{ key: 'name', label: 'Actor / character' }, { key: 'no', label: 'Cast #' },
      ...DAYS.map((d, i) => ({ key: d, label: 'Day 0' + (i + 1) + (d === 'd4' ? ' (today)' : ''), render: (r) => K.doodCode(r[d]) })),
      { key: 'total', label: 'Total days', num: true }],
    rows: cast
  }),
  K.table({ label: 'Empty', columns: [{ key: 'a', label: 'Scene' }, { key: 'b', label: 'Pages', num: true }], rows: [], empty: 'No scenes yet.' })
));

/* 6 — stats, panels, meters, stages */
main.append(sec(6, 'Stats, meters & stage cards', null,
  K.statStrip([
    { label: 'Scenes', value: 36 }, { label: 'Pages', value: K.formatEighths(843) },
    { label: 'Shoot days', value: 24, note: '+2 vs plan', noteTone: 'warn' },
    { label: 'Budget', value: '₹42.6L', note: 'on plan', noteTone: 'ok' },
    { label: 'Runtime', value: '01:54:20', unit: 'TC', hue: 'hue-plan' }, { label: 'Cast', value: '' }
  ], { label: 'Production stats' }),
  grid(
    K.panel({ eyebrow: 'Meters', body: h('div.kit-stack', {}, [
      K.meter({ label: 'Breakdown', value: 64 }), K.meter({ label: 'Scheduled', value: 30, max: 36, show: 'ratio', tone: 'ok' }),
      K.meter({ label: 'Over budget', value: 92, tone: 'danger', size: 'lg' }), K.meter({ label: 'Hold days', value: 40, tone: 'warn' })
    ]) }),
    K.panel({ eyebrow: 'Panel', title: 'Compact header', meta: 'Index: 18', foot: [K.button({ label: 'Cancel', size: 'sm' }), K.button({ label: 'Save', variant: 'primary', size: 'sm' })], body: h('p.k-page-sub', { text: 'A panel body sits on the card surface with the skin\'s card padding.' }) })
  ),
  h('div.kit-stages', {}, [
    K.stageCard({ num: 1, phase: 'story', title: 'Story', body: 'Synopsis, characters, beats.', status: { label: 'Done', tone: 'ok' }, progress: { value: 100 }, href: '#s6' }),
    K.stageCard({ num: 2, phase: 'screenplay', title: 'Screenplay', body: '105 pages, draft 3.', status: { label: 'Draft 3', tone: 'info' }, progress: { value: 80 }, next: 'Lock the draft', href: '#s6', current: true }),
    K.stageCard({ num: 3, phase: 'preprod', title: 'Pre-Production', body: 'Breakdown, stripboard, budget.', status: { label: 'In progress', tone: 'warn' }, progress: { value: 35 }, next: 'Schedule 6 scenes' }),
    K.stageCard({ num: 4, phase: 'production', title: 'Production', body: 'Shoot days and call sheets.', progress: { value: 0 } }),
    K.stageCard({ num: 5, phase: 'post', title: 'Post-Production', body: 'Edit log and deliverables.' })
  ])
));

/* 7 — notices, empty, toasts, page header, project title */
const toastHost = h('div.kit-toasts', {}, ['info', 'success', 'error'].map((t) => {
  const el = h('div.toast.show.' + t, {}, [h('span.toast-msg', { text: t === 'error' ? 'Sync failed — retrying in 30s.' : t === 'success' ? 'Saved to this device.' : 'Scene 43 moved to day 4.' })]);
  if (t === 'info') el.append(h('button.toast-action', { type: 'button', text: 'Undo' }));
  return el;
}));
toastHost.classList.add('toast-host');
main.append(sec(7, 'Notices, empty states & toasts', null,
  h('div.kit-stack', {}, [
    K.notice({ title: 'Info', body: 'Scenes, stripboard and call sheet all read one scene model.' }),
    K.notice({ tone: 'warn', title: 'Safety verification note:', body: 'Ensure all pending slate takes are synchronised before freezing slate tables.', action: K.button({ label: 'Review', size: 'sm' }) }),
    K.notice({ tone: 'danger', title: 'Collision', body: 'Cast #02 is booked on two units on day 5.' }),
    K.notice({ tone: 'ok', title: 'Synced', body: 'Everything on this device is backed up.' })
  ]),
  grid(
    K.emptyState({ title: 'No scenes yet', body: 'Import a screenplay or write one, and the breakdown fills in from its headings.', actions: [K.button({ label: 'Import screenplay', variant: 'primary', icon: 'upload_file' }), K.button({ label: 'Open the writer' })] }),
    h('div.kit-stack', {}, [h('p.k-eyebrow.k-eyebrow-muted', { text: 'Toasts (static)' }), toastHost, h('p.k-eyebrow.k-eyebrow-muted', { text: 'Project title (editorial serif)' }), K.projectTitle('Dragon')])
  )
));

/* 8 — the phone variants (resize below 720px to see them change) */
const SHOTS = [
  { shot: '1A', size: 'WS', lens: '24mm', move: 'Static', state: 'Done' },
  { shot: '1B', size: 'MCU', lens: '50mm', move: 'Dolly in', state: 'To shoot' },
  { shot: '1C', size: 'CU', lens: '85mm', move: '', state: 'To shoot' }
];
main.append(sec(8, 'Phone variants', 'below 720px',
  K.segmented({ name: 'kit-view', value: 'strips', sticky: true, label: 'View', options: [
    { value: 'strips', label: 'Stripboard' }, { value: 'dood', label: 'Day out of days' }, { value: 'list', label: 'Scene list' }] }),
  h('div.k-chip-row', {}, ['cast', 'props', 'vehicles', 'sound', 'stunts', 'vfx', 'animals', 'sfx', 'dressing']
    .map((c) => K.chip({ label: c[0].toUpperCase() + c.slice(1), category: c, count: 3 }))),
  K.table({
    label: 'Shot list', responsive: 'stack',
    columns: [{ key: 'shot', label: 'Shot' }, { key: 'size', label: 'Size' }, { key: 'lens', label: 'Lens', num: true },
      { key: 'move', label: 'Movement' }, { key: 'state', label: 'Status', render: (r) => K.badge({ label: r.state, tone: r.state === 'Done' ? 'ok' : 'warn', dot: true }) }],
    rows: SHOTS
  }),
  K.stripList([
    K.strip({ compact: true, tod: 'DAWN', intExt: 'EXT', scene: '42A', slug: 'EXT. BLACK SEA CLIFFS - DAWN', pages: 11, cast: '1, 4, 7', day: 'DAY 4' }),
    K.strip({ compact: true, tod: 'NIGHT', intExt: 'INT', scene: '43', slug: 'INT. BUNKER - NIGHT', pages: 20, cast: '1, 2', day: 'DAY 4', menuAction: 'kit-strip-menu' })
  ], { label: 'Compact strips' }),
  h('div.kit-stack', {}, [
    K.stageCard({ stacked: true, num: 1, phase: 'story', title: 'Story', body: '4 modules · 8 beats tagged', status: { label: 'Done', tone: 'ok' } }),
    K.stageCard({ stacked: true, num: 3, phase: 'preprod', title: 'Pre-Production', body: '6 modules · 18 days set', status: { label: 'In progress', tone: 'warn' }, progress: { value: 62 }, next: 'Open Pre-Production', href: '#s8', current: true })
  ]),
  K.panel({ collapsible: true, eyebrow: 'Collapsible panel', meta: '3 items', actions: [K.button({ label: 'Add', size: 'sm', icon: 'add' })],
    body: h('p.k-page-sub', { text: 'A native details element: the head is the summary, so it folds by tap or keyboard with no script.' }) }),
  K.panel({ collapsible: true, open: false, eyebrow: 'Closed by default', body: h('p.k-page-sub', { text: 'Still in the DOM while closed.' }) }),
  row(K.button({ label: 'Open a bottom sheet', action: 'kit-sheet' }), K.button({ label: 'Dialog (a sheet on a phone)', action: 'kit-tell' })),
  h('div.k-sticky-foot', {}, [K.button({ label: 'Cancel' }), K.button({ label: 'Save', variant: 'primary' })])
));

app.append(main);
K.wireSegmented(app);

/* ---- the dialogs ---- */
const lock = () => K.ask({
  eyebrow: 'Security protocol', icon: 'lock', tone: 'danger',
  title: 'Lock production draft (Day 04)',
  body: 'Locking will freeze scene numbering, re-index coloured revisions and notify every head of department. This cannot be reverted.',
  notice: { tone: 'warn', title: 'Safety verification note:', body: 'Ensure all pending slate takes are synchronised before freezing slate tables.' },
  typeToConfirm: 'LOCK', confirm: 'Lock draft'
});
const ACT = {
  'kit-lock': lock,
  'kit-danger': () => K.askDanger({ title: 'Delete project “Dragon”?', body: 'Every scene, schedule and budget line in it goes. Backups are not touched.', confirm: 'Delete' }),
  'kit-tell': () => K.tell({ title: 'Backup written', body: 'The file is in your downloads.' }),
  'kit-text': () => K.askText({ title: 'Rename the project', value: 'Dragon', confirm: 'Rename' }),
  'kit-sheet': () => K.sheet({ title: 'Scene 42A', body: h('div.kit-stack', {}, [
    K.notice({ title: 'The phone sheet', body: 'Go to and Tools use this frame; a page reaches it through the kit.' })]) })
};
delegate(app, 'click', '[data-action]', (e, el) => { const f = ACT[el.dataset.action]; if (f) f(); });

if (location.hash === '#modal') {
  lock();
  requestAnimationFrame(() => {
    const f = document.querySelector('.dlg .dlg-field');
    if (f) { f.value = 'LOCK'; f.dispatchEvent(new Event('input')); }
  });
}

/* ---- the showcase page's own layout (not part of the kit) ---- */
const css = `
.kit { max-width: 1240px; margin: 0 auto; padding: var(--s6) var(--gutter) var(--s9); display: grid; gap: var(--s7); }
.kit-sec { display: grid; gap: var(--s3); }
.kit-sec-head { display: flex; align-items: center; justify-content: space-between; gap: var(--s3); }
.kit-sec-title { margin: 0; font-family: var(--f-display); font-size: var(--t-xl); font-weight: 600; letter-spacing: var(--track-tight); color: var(--ink); }
.kit-row { display: flex; flex-wrap: wrap; gap: var(--s2); align-items: center; }
.kit-stack { display: grid; gap: var(--s3); }
.kit-grid { display: grid; gap: var(--s3); grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); align-items: start; }
.kit-fields { display: grid; gap: var(--s4); grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
.kit-stages { display: grid; gap: var(--s3); grid-template-columns: repeat(auto-fit, minmax(min(200px, 100%), 1fr)); }
.kit-toasts.toast-host { position: static; max-width: 360px; pointer-events: auto; }
`;
document.head.append(h('style', { text: css }));
