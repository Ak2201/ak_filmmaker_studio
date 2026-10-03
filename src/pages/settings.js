/* ============================================================
   SETTINGS — the things that belong to this DEVICE, not the film
   ------------------------------------------------------------
   Almost everything on this page is per-device and per-browser:
   nothing in the key, Drive or Appearance sections is part of a
   project, in a backup file, or synced. That is the line the page
   was drawn along — the hub owns projects and backups, and this owns
   the choices that follow the machine rather than the work.

   TWO SECTIONS NOW SIT OUTSIDE THAT LINE and the header has to say
   so rather than let the file assert something untrue. The admin
   console describes which Supabase project the BUILD talks to, and
   the account panel is about an account shared with other people —
   the only thing here that is neither this device nor this film.
   Both are here because they are settings and there is nowhere
   better; both render for nobody who is not entitled to see them.

   WHY IT EXISTS. The Anthropic API key could only be set from
   inside whichever AI panel a page happened to show — the shot
   division on visualize.html, the dialogue pass and the script
   draft on write.html, the step critique on feature.html. One key
   serves all four, so reaching it through one of them made a
   studio-wide setting look like a per-feature one.

   IT ADDS NO STORAGE AND NO BEHAVIOUR. Three modules already own
   everything on this page and each is called rather than copied:

     src/ui/ai-panel.js   the key bar, the key form, the gate and
                          the disclosure. keySection() is the
                          full-page arrangement of those four and it
                          lives THERE, not here — a key form written
                          on this page would be the fourth copy of
                          the one thing in the studio that must not
                          be copied, and CLAUDE.md records
                          visualize.js carrying the third and losing
                          it for exactly that reason.
     src/ui/chrome.js     applyTheme / themeOrder / currentTheme,
                          plus the document-level listener that is
                          already wired for [data-theme-choice].
     src/lib/skin.js      listSkins() reads the CSSOM, so the design
                          list is discovered here exactly as it is in
                          the Appearance menu — no second registry.

   So the only NEW thing on this page is markup. The buttons below
   carry the same `data-theme-choice` / `data-skin-choice`
   attributes the toolbar menu uses; the listener at the bottom of
   this file applies nothing and only repaints the checked state.

   NO PAGE-LOCAL MIRROR OF "IS THERE A KEY". Every render asks
   ai.js, through the panel module, and the page redraws on
   `onAIChange` — which is what makes Forget and Replace land here
   the same way they land in a panel.

   WHY ai-panel IS A STATIC IMPORT HERE. The three job pages reach
   it with `import()` at a click, because a page about shots should
   not pay for the model code on a visit that never drafts. On this
   page the key IS the content, so a lazy import would buy nothing
   but a flash of "checking this device…" over the main thing the
   page is for.
   ============================================================ */
import '../lib/store.js';          /* FIRST — it patches Storage.prototype,
                                      and the order is load-bearing. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/ai.css';
import '../styles/settings.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
/* The provider table. The key area is composed by ai-panel.js; this
   page only needs to name the host in its own prose. */
import { apiHost, apiName, providerLabel } from '../lib/ai-providers.js';
import Panel from '../ui/ai-panel.js';
import { listSkins, currentSkin } from '../lib/skin.js';
import DriveSync, { DRIVE_STATES } from '../lib/drive-sync.js';
/* The admin console reuses the sign-in modal's own config form rather
   than growing a second copy of it. Two forms writing one storage key
   is two things to keep in step, and setCfg() has exactly one caller
   for a reason. */
import { openCloudAuthModal, mayConfigure } from '../ui/auth.js';
/* The account section builds and refreshes itself; this page only
   says where it goes. It returns null when signed out, like
   renderAdmin(), so append stays branchless. */
import { accountSection } from '../ui/account-panel.js';

const app = document.getElementById('app');

/* A label from an id, derived the same way chrome.js's
   appearanceMenu() derives its theme labels. Derived rather than
   listed, so dropping or adding a theme needs no edit here. */
const titleCase = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/* ---- a section ---------------------------------------------- */
function section(id, eyebrow, title, deck) {
  const sec = h('section.st-sec', { id });
  sec.append(
    h('p.bd-eyebrow', { text: eyebrow }),
    h('h2.bd-h2', { text: title }),
    h('p.bd-sub', { text: deck })
  );
  return sec;
}

/* ---- a radio row -------------------------------------------
   `attr` is the attribute chrome.js's own listener reads, so these
   buttons are wired by code that already exists and this function
   describes a choice rather than implementing one. */
function choices(label, attr, current, options) {
  const grp = h('div.st-group', { role: 'radiogroup', 'aria-label': label });
  grp.append(h('span.st-group-label', { text: label }));
  const row = h('div.st-choices');
  options.forEach((o) => {
    const on = o.value === current;
    /* `.btn` as well as `.st-choice`: this is the studio's button,
       not a new control, so the padding, the pill radius, the mono
       label and the focus ring all come from chrome.css. `.st-choice`
       only adds which of them is live. */
    const b = h('button.btn.st-choice' + (on ? '.is-on' : ''), {
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      title: o.title || o.label
    });
    b.setAttribute(attr, o.value);
    b.append(h('span', { text: o.label }));
    row.append(b);
  });
  grp.append(row);
  return grp;
}

/* ---- the key ------------------------------------------------ */
function renderKey() {
  /* Titled after the provider in use rather than after one of them.
     A page headed "The Anthropic API key" above a Gemini key bar is
     a page that is wrong about the only thing it is for. */
  const sec = section('ai', 'This device · never synced',
    'The ' + providerLabel() + ' API key.',
    'The model-backed tools in this studio run against ' + apiName() + '. There is '
      + 'no server here to run them for you, so they use a key of your own — one '
      + 'key, every tool, this browser. Each of them says what it will send and '
      + 'waits for a click before it sends it. Provider, below, switches which API '
      + 'they run against; each one keeps its own key, so switching loses neither.');

  /* The module's own arrangement of the bar, the gate, the form and
     the disclosure. The disclosure body is this page's, because what
     a tool sends depends on the tool — on a settings page the honest
     answer is the key itself and nothing else. */
  sec.append(Panel.keySection(
    'Every model-backed tool in the studio',
    'The key is kept in this browser’s storage, on this device, and nowhere '
    + 'else. It is not written into a backup file, not synced to the cloud, not '
    + 'attached to a project, and nothing on this page sends it anywhere. The '
    + 'only thing that ever sends it is a tool you have clicked, and the only '
    + 'place it is ever sent is ' + apiHost() + '. Every call is billed to your '
    + 'own account. Forget key removes it from this device; nothing you have '
    + 'written is touched.'
  ));

  return sec;
}

/* ---- appearance --------------------------------------------- */
function renderAppearance() {
  const sec = section('appearance', 'This device · not part of the film',
    'Appearance.',
    'Theme picks the palette, design picks the shapes, and the two are '
      + 'independent. Both are remembered for this browser, and neither travels '
      + 'with a project or with a backup.');

  sec.append(choices('Theme', 'data-theme-choice', StudioUI.currentTheme(),
    StudioUI.themeOrder().map((t) => ({ value: t, label: titleCase(t) }))));

  /* A second skin file is what makes this a choice; with one, a radio
     row is a control that cannot do anything — the same mistake as a
     theme button with no [data-theme] block behind it. So it renders
     as a statement until there are two, and it counts rather than
     asserting, because skin.js discovers them from the CSSOM. */
  const skins = listSkins();
  if (skins.length > 1) {
    sec.append(choices('Design', 'data-skin-choice', currentSkin(),
      skins.map((sk) => ({ value: sk.id, label: sk.label }))));
  } else {
    const only = skins[0] || { label: 'Studio' };
    sec.append(h('p.st-note', {
      text: 'One design ships today — ' + only.label + '. The shapes are a '
          + 'swappable layer rather than a fixed one, so a second design would '
          + 'appear here on its own.'
    }));
  }

  return sec;
}

/* ---- Google Drive -------------------------------------------
   The ONE place in the app where Drive backup is configured, for
   the reason settings.html exists at all: which cloud folder this
   browser copies itself into is a property of the browser, not of
   a film.

   NOTHING ABOUT THE BACKUP FORMAT OR THE SYNC RULES IS DECIDED
   HERE. src/lib/backup.js owns what a backup is, src/lib/drive.js
   owns Drive, src/lib/drive-sync.js owns when to push and when to
   stop and ask. This renders their status and forwards clicks.
   The same discipline as the API key above: a page that
   re-implements half of a module is how the studio ended up with
   four rupee parsers.

   THE EXPORT FILE IS STILL THE HUB'S. No Export / Import buttons
   are mirrored here — see renderElsewhere(). */

let versions = null;     // null until EARLIER VERSIONS is opened
let busy = '';           // which control is mid-flight, for the label

const when = (iso) => {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d)) return 'unknown';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
};

function driveButton(action, label, opts) {
  opts = opts || {};
  const b = h('button.btn' + (opts.primary ? '.primary' : ''), {
    type: 'button',
    'data-action': action,
    disabled: !!busy
  });
  b.append(h('span', { text: busy === action ? opts.busyLabel || 'Working…' : label }));
  return b;
}

/* The conflict, named on both sides with their times. Two buttons
   and no default: an app that picks one has decided whose month of
   writing matters less. */
function conflictCard(st) {
  const c = st.conflict || {};
  const card = h('div.st-conflict', { role: 'group', 'aria-label': 'Backup conflict' });
  card.append(h('p.st-conflict-h', { text: 'Both copies changed.' }));
  card.append(h('p.st-conflict-p', {
    text: 'The file in Drive has moved on since this browser last saw it, and this '
        + 'browser has unsaved-to-Drive changes of its own. Nothing was uploaded and '
        + 'nothing was overwritten. Drive keeps the earlier version either way, so '
        + 'neither answer below destroys anything — but only you know which is which.'
  }));
  const rows = h('ul.st-conflict-rows');
  rows.append(h('li', {}, [
    h('span.st-conflict-side', { text: 'This browser' }),
    h('span.st-conflict-at', { text: 'last edited ' + when(c.localAt) })
  ]));
  rows.append(h('li', {}, [
    h('span.st-conflict-side', { text: 'In Drive' }),
    h('span.st-conflict-at', { text: 'last changed ' + when(c.remote && c.remote.modifiedTime) })
  ]));
  card.append(rows);
  card.append(h('div.st-drive-actions', {}, [
    driveButton('drive-keep-mine', 'Keep mine — upload over Drive', { busyLabel: 'Uploading…' }),
    driveButton('drive-take-theirs', 'Take theirs — replace this browser', { busyLabel: 'Restoring…' })
  ]));
  return card;
}

function versionList() {
  const wrap = h('div.st-versions');
  if (!versions) return wrap;
  if (!versions.length) {
    wrap.append(h('p.st-note', { text: 'Drive is not holding any earlier versions of this file yet.' }));
    return wrap;
  }
  const ul = h('ul.st-version-rows');
  versions.forEach((r) => {
    ul.append(h('li', {}, [
      h('span.st-version-at', { text: when(r.modifiedTime) }),
      h('button.btn.st-version-btn', {
        type: 'button',
        'data-action': 'drive-restore-version',
        'data-rev': r.id,
        disabled: !!busy
      }, [h('span', { text: 'Restore this one' })])
    ]));
  });
  wrap.append(ul);
  return wrap;
}

function renderDrive() {
  const st = DriveSync.getDriveStatus();
  const sec = section('drive', 'This device · your own Drive',
    'Back up to Google Drive.',
    'One file in your Drive, written to the same place every time, so Drive’s own '
      + 'version history is the history of your studio. It holds every project this '
      + 'browser has — the same file the hub’s Export button writes — and it never '
      + 'holds the API key above.');

  if (!st.configured) {
    sec.append(h('p.st-note', {
      text: 'This build was made without a Google client id, so there is nothing to '
          + 'connect to. A build that sets VITE_GOOGLE_CLIENT_ID offers the button '
          + 'here. The hub’s Export still writes the same backup to a file you keep '
          + 'yourself, and that needs no account at all.'
    }));
    return sec;
  }

  const pill = h('p.st-drive-status', {}, [
    h('span.st-dot' + (
      st.state === DRIVE_STATES.SYNCED ? '.is-ok'
      : st.state === DRIVE_STATES.CONFLICT ? '.is-warn'
      : st.state === DRIVE_STATES.ERROR ? '.is-bad' : ''), { 'aria-hidden': 'true' }),
    h('span', { text: st.detail })
  ]);
  sec.append(pill);

  if (!st.connected) {
    sec.append(h('p.st-note', {
      text: 'Connecting asks Google for permission to one file — the one this app '
          + 'creates. It cannot see anything else in your Drive. The permission is '
          + 'held in memory for this tab only and is never written to disk, so '
          + 'closing the browser ends it and opening it again renews it without '
          + 'asking you anything.'
    }));
    sec.append(h('div.st-drive-actions', {}, [
      driveButton('drive-connect', 'Connect Google Drive', { primary: true, busyLabel: 'Asking Google…' })
    ]));
    return sec;
  }

  sec.append(h('p.st-note', {
    text: 'Last synced ' + when(st.syncedAt) + '.'
        + (st.live
            ? ' Changes go up a few seconds after you stop typing.'
            : '')
  }));

  if (!st.live) {
    /* Supabase is signed in. Said plainly rather than left as a
       switch that quietly does nothing. */
    sec.append(h('p.st-note', {
      text: 'Cloud sync is signed in on this browser, and two live syncs writing the '
          + 'same storage would keep waking each other up. So Drive stays a manual '
          + 'backup while you are signed in: the buttons below still work, and '
          + 'nothing uploads on its own. Cloud sync also carries comments, share '
          + 'links and roles, which a Drive file cannot.'
    }));
  }

  if (st.state === DRIVE_STATES.CONFLICT) sec.append(conflictCard(st));

  const actions = h('div.st-drive-actions');
  actions.append(driveButton('drive-backup', 'Back up now', { primary: true, busyLabel: 'Uploading…' }));
  actions.append(driveButton('drive-restore', 'Restore from Drive', { busyLabel: 'Restoring…' }));
  actions.append(driveButton('drive-versions', versions ? 'Hide earlier versions' : 'Earlier versions', { busyLabel: 'Reading…' }));
  actions.append(driveButton('drive-disconnect', 'Disconnect'));
  sec.append(actions);

  if (versions) sec.append(versionList());

  if (st.link) {
    sec.append(h('p.st-note', {}, [
      'The file is yours to open, copy or download: ',
      h('a', { href: st.link, target: '_blank', rel: 'noopener', text: 'open it in Drive' }),
      '. Disconnecting here never deletes it.'
    ]));
  }

  return sec;
}

/* ---- the settings that are NOT here -------------------------
   Said out loud, with a route, rather than left as a hole: a page
   called Settings that silently omits backups is a page that makes
   somebody hunt. No fragment on the link — the hub's sections carry
   no ids, and a fragment that resolves to nothing looks like a
   broken page to exactly the person who followed it. */
function renderElsewhere() {
  const sec = h('section.st-sec.st-elsewhere');
  sec.append(h('h2.bd-h2', { text: 'What is not on this page' }));
  sec.append(h('p', {}, [
    'Projects, the backup file you keep yourself and Reset everything are on ',
    h('a', { href: 'index.html', text: 'Home' }),
    ', because all three are about the work rather than about this device — and '
    + 'the Drive section above uploads the very same file rather than a second '
    + 'kind of one. Signing in for cloud sync is the pill in the bar at the top '
    + 'of every page, this one included.'
  ]));
  return sec;
}

/* ---- render -------------------------------------------------- */
/* ---- the admin console -------------------------------------
   Rendered for nobody unless mayConfigure() says so, which means an
   address in VITE_ADMIN_EMAILS or a build that carries no project of
   its own. See mayConfigure() in ui/auth.js for both cases and for
   why this is tidiness rather than security — the bundle is public,
   so a panel that is merely NOT DRAWN is not a panel that cannot be
   reached. RLS is the boundary.

   What it is actually for: the hosted build now carries its own
   Supabase project, so this exists to say WHICH, and to let somebody
   running their own copy point it elsewhere without the two fields
   being in every visitor's face. */
function renderAdmin() {
  if (!mayConfigure()) return null;

  const c = window.StudioCloud;
  const built    = (c && c.builtInCfg && c.builtInCfg()) || null;
  const override = !!(c && c.isCfgOverridden && c.isCfgOverridden());
  const live     = (c && c.getCfg && c.getCfg()) || null;

  const sec = section('admin', 'Admin · not shown to other people',
    'The database this build talks to.',
    'Everyone else signs in without ever meeting these two values, which is the '
      + 'point of them being here. The anon key is public by design — what keeps '
      + 'one account out of another\u2019s projects is the row-level policy on the '
      + 'database, not the secrecy of this string.');

  sec.append(h('p.st-note', {
    text: built
      ? 'This build ships with ' + built.url + ', so a new visitor can sign in '
        + 'with no setup at all.'
      : 'This build ships with NO Supabase project, so the form below is the only '
        + 'way anybody on this browser can sign in. That is why it is visible to '
        + 'you even though you are not on the admin list.'
  }));

  sec.append(h('p.st-drive-status', {}, [
    h('span.st-dot' + (override ? '.is-warn' : '.is-ok'), { 'aria-hidden': 'true' }),
    h('span', {
      text: override
        ? 'THIS BROWSER IS OVERRIDING THE BUILD'
        : 'USING THE BUILD\u2019S OWN PROJECT'
    })
  ]));

  if (live) sec.append(h('p.st-note', { text: 'In use right now: ' + live.url }));

  const row = h('div.st-row');
  row.append(h('button.btn', {
    type: 'button', 'data-action': 'admin-configure',
    text: override ? 'Change the project' : 'Point at another project'
  }));
  /* Only offered when there is something to fall back TO. Clearing an
     override on a build with no project of its own would leave the app
     unable to sign anybody in, with the form that fixes it now hidden
     behind an admin check that needs a sign-in. */
  if (override && built) {
    row.append(h('button.btn', {
      type: 'button', 'data-action': 'admin-use-built-in',
      text: 'Use the build\u2019s project'
    }));
  }
  sec.append(row);

  sec.append(h('p.st-note', {
    text: 'Reset everything on Home no longer clears this, so a wipe does not cost '
        + 'you a trip to the Supabase dashboard. It does sign you out.'
  }));

  return sec;
}

function render() {
  const main = h('main#main');

  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio' }),
    h('h1.bd-title', { text: 'Settings.' }),
    h('p.bd-deck', {
      text: 'Three things belong to this browser rather than to any film: the API '
          + 'key the model-backed tools use, where this browser copies itself for '
          + 'safe keeping, and how the studio looks. None of the three is part of a '
          + 'project, and the first and the last are in no backup and no cloud.'
    })
  ]));

  const body = h('div.st-body');
  /* renderAdmin() returns null for everybody else; append ignores a
     null, so there is no branch here and no empty section either. */
  body.append(renderKey(), renderDrive(), renderAppearance(),
              accountSection(section), renderAdmin(), renderElsewhere());
  main.append(body);

  app.replaceChildren(main);
  mountShell();

  /* Chrome initialises at import time, when #app is still empty, so
     every page re-inits after its own render. Without this the
     controls here would be unlabelled and the glossary terms in the
     prose inert — the bug short.js carried for a long time. */
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[settings] chrome', e); }
}

/* ---- events — delegated, no inline handlers ------------------ */

/* The key form, the model select, Replace and Forget are all bound by
   the panel module. This page only has to be redrawn when one of them
   lands, which is what the subscription is for — and it is why there
   is no page-local "does a key exist" flag here to go stale. */
Panel.wireAIPanel();
Panel.onAIChange(() => render());

/* Theme and design are APPLIED by chrome.js's own document listener,
   which is already wired for these two attributes. It was registered
   when chrome.js was imported, so it has run by the time this one
   does and currentTheme() / currentSkin() already report the new
   value. This handler repaints the checked state and nothing else;
   applying the choice here as well would be two owners for one
   setting, which is the shape of the money-parser trap. */
delegate(document, 'click', '[data-theme-choice], [data-skin-choice]', () => {
  render();
});

/* ---- Drive --------------------------------------------------
   Delegated, with `data-action`, because a strict CSP ships and an
   inline handler breaks the page under it. Every one of these
   forwards to drive-sync.js and then redraws; none of them decides
   anything. `busy` is a render flag, not state — it exists so a
   second click during a five-second upload cannot start a second
   one. */
function run(action, fn) {
  if (busy) return;
  busy = action;
  render();
  Promise.resolve()
    .then(fn)
    .catch((e) => {
      StudioUI.toastError((e && e.message) || 'Drive did not answer.', { duration: 6000 });
    })
    .finally(() => { busy = ''; render(); });
}

const DRIVE_ACTIONS = {
  'drive-connect':  () => run('drive-connect', () => DriveSync.connect()),
  'drive-backup':   () => run('drive-backup', () => DriveSync.push()),
  'drive-restore':  () => run('drive-restore', async () => {
    /* A restore REPLACES the projects this browser shares with the
       file. Asked out loud, every time, because the one thing this
       app refuses is deciding that silently. */
    if (!confirm('Replace this browser’s copy of every project that is also in the ' +
                 'Drive backup?\n\nProjects the backup has never heard of are left ' +
                 'alone. Drive keeps the current version either way.')) return;
    const r = await DriveSync.pull();
    if (r && r.ok) location.reload();
  }),
  'drive-versions': () => run('drive-versions', async () => {
    if (versions) { versions = null; return; }
    versions = await DriveSync.listVersions();
  }),
  'drive-disconnect': () => {
    if (!confirm('Stop syncing to Drive from this browser?\n\nThe file in your Drive ' +
                 'is not deleted and nothing you have written is touched.')) return;
    DriveSync.disconnect();
    versions = null;
    render();
  },
  'drive-keep-mine':   () => run('drive-keep-mine', () => DriveSync.resolveConflict('mine')),
  'drive-take-theirs': () => run('drive-take-theirs', async () => {
    const r = await DriveSync.resolveConflict('theirs');
    if (r && r.ok) location.reload();
  })
};

/* ---- the admin console's two buttons ------------------------
   Both delegate to code that already exists: the modal owns the form,
   cloud.js owns the key. Nothing here writes storage directly, which
   is what keeps setCfg() a single caller. */
delegate(document, 'click', '[data-action="admin-configure"]', () => {
  openCloudAuthModal({ mode: 'settings' });
});

delegate(document, 'click', '[data-action="admin-use-built-in"]', () => {
  const c = window.StudioCloud;
  if (!c || !c.setCfg) return;
  if (!confirm('Drop this browser\u2019s own Supabase project and go back to the one '
             + 'this build ships with?\n\nNothing you have written is touched. You '
             + 'will be signed out of the current project.')) return;
  /* setCfg(null) CLEARS THE OVERRIDE, it does not un-configure the app
     — getCfg() falls through to the build's own. That is only true
     since the build carries one; before, this call was how you broke
     sign-in. */
  c.setCfg(null);
  location.reload();
});

delegate(document, 'click', '[data-action^="drive-"]', (e, el) => {
  const act = el.getAttribute('data-action');
  if (act === 'drive-restore-version') {
    const rev = el.getAttribute('data-rev');
    if (!confirm('Restore the studio from the version saved ' +
                 'on ' + when((versions || []).find((v) => v.id === rev)?.modifiedTime) +
                 '?\n\nThis replaces the projects that version contains. Drive keeps ' +
                 'the current version too, so this is reversible.')) return;
    return run('drive-restore-version', async () => {
      const r = await DriveSync.restoreVersion(rev);
      if (r && r.ok) location.reload();
    });
  }
  const fn = DRIVE_ACTIONS[act];
  if (fn) fn();
});

/* Drive reports its own progress — a reconcile that finishes
   thirty seconds after load has to reach the page without the page
   polling for it. */
DriveSync.onDriveStatus(() => { if (!busy) render(); });

/* AND SO DOES AUTH, FOR THE SAME REASON AND A SHARPER ONE.
   ------------------------------------------------------------
   renderAdmin() asks mayConfigure(), which asks isAdmin(), which
   reads the SIGNED-IN e-mail. At first paint there is no session
   yet — supabase-js restores it asynchronously — so isAdmin() is
   false for everybody, including an admin, and the panel never
   renders. It was measured false on the live page while isAdmin()
   answered true in the console a second later: the state was right
   and the DOM was a second too old.

   This is the trap the modal's own cfgLink comment already names —
   "a value decided at render time would be stale for exactly the
   person it is meant for" — reintroduced one file away, which is
   how these go. Anything whose VISIBILITY depends on who is signed
   in has to redraw when that answer arrives. */
if (window.StudioCloud && window.StudioCloud.onAuth) {
  window.StudioCloud.onAuth(() => { if (!busy) render(); });
}

render();
