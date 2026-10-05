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
import Store, { storageUsage } from '../lib/store.js';
                                   /* FIRST — it patches Storage.prototype,
                                      and the order is load-bearing. Adding a
                                      named import alongside the default
                                      changes nothing about that: the module
                                      still evaluates before anything below
                                      it, which is the whole guarantee. */
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
/* The backup FILE is backup.js's, exactly as it is for the hub's
   Export and for Drive's upload. This page calls it; it does not
   know what a backup looks like. Already a static import here
   through drive-sync.js, so naming it costs nothing. */
import { downloadBackup } from '../lib/backup.js';
/* The admin console reuses the sign-in modal's own config form rather
   than growing a second copy of it. Two forms writing one storage key
   is two things to keep in step, and setCfg() has exactly one caller
   for a reason. */
import { openCloudAuthModal, mayConfigure } from '../ui/auth.js';
/* The account section builds and refreshes itself; this page only
   says where it goes. It returns null when signed out, like
   renderAdmin(), so append stays branchless. */
import { accountSection } from '../ui/account-panel.js';
import { inviteSection, wireGateUI } from '../ui/gate-ui.js';
import Billing from '../lib/billing.js';
import { planCards, usageList } from '../ui/plan-cards.js';

const app = document.getElementById('app');

/* A label from an id, derived the same way chrome.js's
   appearanceMenu() derives its theme labels. Derived rather than
   listed, so dropping or adding a theme needs no edit here. */
const titleCase = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/* ---- the plan (schema section 16) ----------------------------
   The organisation's tier, its usage against the caps, and the cards
   to buy or change. Everything shown is read from the server each time
   (billing_status and the plans table); nothing about a plan is
   remembered in this browser. Rendered for a signed-in account only —
   a signed-out visitor has no organisation to put a plan on. */
let billing = { plans: null, st: null, error: '' };
async function refreshBilling() {
  const c = window.StudioCloud;
  if (!c || !c.isConfigured() || !c.getSession()) { billing = { plans: null, st: null, error: '' }; return; }
  try {
    const [plans, st] = await Promise.all([Billing.listPlans(), Billing.status()]);
    billing = { plans, st, error: '' };
  } catch (e) {
    // The table or the RPC missing means section 16 has not run: no section, no noise.
    billing = { plans: null, st: null, error: /does not exist|Could not find|PGRST/i.test(e.message || '') ? '' : (e.message || '') };
  }
  if (!busy) render();
}
function renderPlan() {
  const c = window.StudioCloud;
  if (!c || !c.isConfigured() || !c.getSession() || !billing.plans) return null;
  const st = billing.st;
  const sec = section('plan', 'Plan', st && st.plan !== 'free' ? `${st.plan_name || Billing.planName(st.plan)}${st.account_name ? ' \u00b7 ' + st.account_name : ''}` : 'Choose a plan.',
    'What a plan caps is the cloud \u2014 projects synced, share links, collaborators, organisation seats \u2014 and the Chrome extension. Work on this device is never limited.');
  if (billing.error) sec.append(h('p.gt-error', { role: 'alert', text: billing.error }));
  if (st) {
    const u = usageList(st);
    if (u) sec.append(h('h3.gt-h3', { text: 'Your usage' }), u);
    if (st.lapsed) sec.append(h('p.pl-status', { text: `Your ${Billing.planName(st.bought_plan)} plan lapsed on ${new Date(st.plan_until).toLocaleDateString(undefined, { dateStyle: 'medium' })}. The caps below are the free tier\u2019s until you renew.` }));
  }
  sec.append(planCards(billing.plans, st, {
    onBuy: (planId, period, onStatus) => Billing.buy(planId, period, { accountId: st && st.account_id, onStatus }).then(() => refreshBilling()),
    rerender: () => { if (!busy) render(); }
  }));
  return sec;
}

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

/* ---- where the work physically is ---------------------------
   TWO TIERS, ONE OF WHICH HAS A WALL.

   src/lib/overflow.js's header makes the case and this section is
   the user-facing half of it: one feature project measures ~302 KB
   of JSON, localStorage is billed in UTF-16 code units against
   roughly 5 MB, and that arithmetic is eight films before a save
   starts failing. The way it fails is the reason this readout
   exists at all — `setItem` throws, almost nobody reads the return,
   and the first symptom is a field that saves and never comes back.
   A meter is how somebody sees the wall before they hit it.

   THE SMALL TIER IS THE HEADLINE AND THE ONLY ONE WITH A BAR. The
   big tier is IndexedDB, which browsers allow hundreds of
   megabytes; drawing a proportion of a ceiling nobody here has
   measured would be a made-up number next to a real one.

   NOTHING ON THIS PAGE CALLS navigator.storage.estimate(). It
   reports the whole ORIGIN, service-worker precache included, which
   is about 2 MB of this app's own assets and none of anybody's
   work — a headline figure that is mostly us would say the studio
   is nearly full on the day it is empty. storageUsage() walks the
   keys instead, which is the same decision for the same reason;
   see the comment above it in store.js.

   AND IT MEASURES RATHER THAN ASSERTS. Every number below comes
   out of storageUsage(); the one figure that is not a measurement
   — the ceiling — says so in its own line of copy rather than
   being printed to three decimal places and believed. */

/* Chars in, quota bytes out. storageUsage() counts UTF-16 code
   units because that is the unit browsers bill, and `smallLimit`
   is quoted in the same unit, so the proportion of the two is
   sound. Printing "characters" at somebody would be accurate and
   useless; two bytes per unit is the conversion, and the page says
   so out loud rather than leaving it in here. */
function fmtQuota(chars) {
  const kb = (Number(chars) || 0) * 2 / 1024;
  if (kb < 1) return 'under 1 KB';
  if (kb < 1024) return Math.round(kb) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* The one state worth saying loudly, and it is said before any
   figure: a tier that did not open is not a tier that is empty. */
function tierDownCard() {
  const card = h('div.st-alarm', { role: 'group', 'aria-label': 'Storage warning' });
  card.append(h('p.st-alarm-h', { text: 'The second tier did not open.' }));
  card.append(h('p.st-alarm-p', {
    text: 'This browser did not open the database that holds anything over 64 KB, '
        + 'and two things follow while that is true. A value that large cannot be '
        + 'stored. One that is already out there cannot be read, so a script may '
        + 'be showing as empty when it is not. Nothing has been lost: writing to '
        + 'exactly those values is blocked rather than allowed to save an empty '
        + 'page over them. Reload before you type anything. If it keeps '
        + 'happening, the usual cause is a private window, where this database '
        + 'does not exist at all — and the figure below counts only what is in '
        + 'the key store, because what is on the other tier could not be counted.'
  }));
  return card;
}

function nearlyFullCard() {
  const card = h('div.st-alarm', { role: 'group', 'aria-label': 'Storage warning' });
  card.append(h('p.st-alarm-h', { text: 'The key store is nearly full.' }));
  card.append(h('p.st-alarm-p', {
    text: 'From here a save can start failing, and it fails quietly: the field '
        + 'takes what you typed and the value never comes back. Download the '
        + 'backup below, then delete a film you have finished with from Home. '
        + 'Anything over 64 KB has already moved to the database beside this, so '
        + 'what is left in here is the blueprint answers, the scenes, the '
        + 'contacts and the schedule.'
  }));
  return card;
}

function renderStorage() {
  const u = storageUsage();
  const limit = u.smallLimit > 0 ? u.smallLimit : 0;
  const share = limit ? u.small / limit : 0;
  const pct   = Math.max(0, Math.min(100, Math.round(share * 100)));
  /* Three bands, and the first of them is the whole point. A studio
     with room to spare is drawn in the accent, not in a warning
     hue: colouring a healthy number amber is how people learn to
     ignore amber. */
  const band  = share >= 0.9 ? 'bad' : share >= 0.75 ? 'warn' : 'ok';
  /* 0% on a studio that has written something is a lie by rounding. */
  const shown = (u.small > 0 && pct < 1) ? 'under 1%' : pct + '%';

  const sec = section('storage', 'This device \u00b7 where the work actually sits',
    'Storage.',
    'Everything written in this studio is kept by this browser, in two places at '
      + 'once. The small things \u2014 the blueprint answers, the scenes, the '
      + 'contacts, the schedule \u2014 stay in the browser\u2019s own key store, '
      + 'which is the one with a hard wall at the end of it. Anything over 64 KB, '
      + 'which in practice means a screenplay, is moved to a database beside it '
      + 'that is measured in hundreds of megabytes. Nobody chooses between them: '
      + 'the size of the value decides, every time.');

  if (u.tier === 'unavailable') sec.append(tierDownCard());
  else if (u.tier !== 'ready') {
    sec.append(h('p.st-note', {
      text: 'The database beside the key store has not been opened yet, so what is '
          + 'on it has not been counted and the second figure below is missing '
          + 'rather than zero.'
    }));
  }

  const tiers = h('div.st-tiers');

  /* --- the small tier: the only one with a proportion --- */
  const smallM = h('div.st-meter');
  smallM.append(h('p.st-meter-head', {}, [
    h('span.st-meter-label', { text: 'The browser\u2019s key store' }),
    h('span.st-meter-figure', { text: fmtQuota(u.small) + ' of about ' + fmtQuota(limit) })
  ]));
  smallM.append(h('div.st-bar', {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(pct),
    'aria-valuetext': shown + ' of the room this browser is likely to allow',
    'aria-label': 'The browser\u2019s key store'
  }, [
    /* A custom property rather than `style="width:…"`, so the one
       inline style on this page carries a MEASUREMENT and never a
       colour. An inline style beats every stylesheet, which is why
       the band below is a class and not a second declaration. */
    h('span.st-bar-fill' + (band === 'ok' ? '' : '.is-' + band),
      { style: '--st-fill: ' + pct + '%' })
  ]));
  smallM.append(h('p.st-meter-note' + (band === 'warn' ? '.is-warn' : ''), {
    text: shown + ' full, across ' + plural(u.keys, 'key', 'keys')
        + ' \u2014 every project this browser holds, not only the open one.'
        + (band === 'warn'
            ? ' There is room yet, but this is the point to take a backup rather '
              + 'than the point after it.'
            : '')
  }));
  tiers.append(smallM);

  /* --- the big tier: counted, never proportioned --- */
  const bigM = h('div.st-meter');
  bigM.append(h('p.st-meter-head', {}, [
    h('span.st-meter-label', { text: 'The database beside it' }),
    h('span.st-meter-figure', {
      text: u.tier === 'unavailable' ? 'could not be counted'
          : u.overflowed ? fmtQuota(u.big) + ' across ' + plural(u.overflowed, 'value', 'values')
          : 'nothing out here yet'
    })
  ]));
  bigM.append(h('p.st-meter-note', {
    text: u.tier === 'unavailable'
      ? 'The database did not open, so this figure is unknown rather than zero. '
        + 'Whatever is out there is still out there.'
      : u.overflowed
        ? 'No bar for this one, because there is no honest proportion to draw: '
          + 'browsers allow this tier hundreds of megabytes and nothing here has '
          + 'measured yours. The screenplay is almost certainly the largest thing '
          + 'in it.'
        : 'Nothing has outgrown the key store yet. The first thing that does will '
          + 'almost certainly be a screenplay.'
  }));
  tiers.append(bigM);

  sec.append(tiers);

  if (band === 'bad' && u.tier !== 'unavailable') sec.append(nearlyFullCard());

  /* The ceiling is the one figure above that is not a measurement,
     so it is the one that has to admit it. */
  sec.append(h('p.st-note', {
    text: 'About, rather than exactly. Browsers bill the key store two bytes for '
        + 'every character stored and most of them stop somewhere near 5 MB, but '
        + 'that is a convention rather than a rule and no browser publishes its '
        + 'own figure. The ceiling above is a deliberately low estimate, so read '
        + 'the bar as the shape of the wall rather than its exact position. Both '
        + 'figures count your work and nothing else: the copy of the app itself '
        + 'that lets this studio open without a network is held somewhere else '
        + 'again, and it is in no number on this page.'
  }));

  sec.append(h('div.st-drive-actions', {}, [
    h('button.btn.primary', { type: 'button', 'data-action': 'storage-backup' },
      [h('span', { text: 'Download a backup' })])
  ]));
  sec.append(h('p.st-note', {
    text: 'One file holding every project this browser has \u2014 the same file the '
        + 'hub\u2019s Export writes and the same one Drive uploads above. It is '
        + 'the only copy that survives a browser clearing its own storage, which '
        + 'browsers do without asking.'
  }));

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

   THE EXPORT FILE IS STILL THE HUB'S, and so is IMPORT. The
   storage section above now offers the download half of it, which
   reads like a contradiction and is not: a meter that tells
   somebody they are nearly out of room and offers no way out is a
   dead end, and chrome.js's quota toast already puts the same
   button in front of them at the worse moment. Reading the file
   back — the picker, the merge, the collisions — stays on the hub.
   See renderElsewhere(). */

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

/* The gate's console used to render here. It lives on admin.html now,
   beside the application-wide numbers; this is the pointer, shown by
   the same server-reported role the console itself checks. */
function consolePointer() {
  if (!gateStatus || !gateStatus.deployed || gateStatus.role !== 'admin') return null;
  const sec = section('admin-console', 'Administrator', 'The application console.',
    'Invite requests, codes, members and sessions, and the studio as a whole in numbers, are on their own page.');
  const n = gateStatus.pendingRequests || 0;
  sec.append(h('div.st-row', {}, [
    h('a.btn.primary', { href: 'admin.html', text: 'OPEN THE CONSOLE' }),
    n ? h('span.st-note', { text: `${n} invite request${n === 1 ? '' : 's'} waiting` }) : null
  ].filter(Boolean)));
  return sec;
}

function render() {
  const main = h('main#main');

  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio' }),
    h('h1.bd-title', { text: 'Settings.' }),
    h('p.bd-deck', {
      /* COUNTED, NOT ASSERTED — or as close to it as prose gets. A
         header that says three above four sections is the same fault
         as the first-run panel that said twenty-two modules over
         twenty-four, and the gate cannot see either. */
      text: 'Four things belong to this browser rather than to any film: the API '
          + 'key the model-backed tools use, where your work is physically kept '
          + 'and how much room is left, where this browser copies itself for safe '
          + 'keeping, and how the studio looks. None of the four is part of a '
          + 'project, and the first and the last are in no backup and no cloud.'
    })
  ]));

  const body = h('div.st-body');
  /* Several of these return null when they have nothing to show.
     Element.append() does NOT ignore a null — it inserts the text
     "null" — so they are filtered first. (This comment used to say
     append ignores one; it held only because every section here
     happened to render something on the pages anybody checked. The
     storage section is one of the ones that always renders, which is
     exactly why it would not have caught it either.) */
  body.append(...[renderKey(), renderPlan(), renderStorage(), renderDrive(), renderAppearance(),
              accountSection(section), inviteSection(section, gateStatus),
              consolePointer(), renderAdmin(), renderElsewhere()].filter(Boolean));
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
/* ---- the backup button --------------------------------------
   downloadBackup() builds the file, triggers the <a download> and
   returns how many projects went into it. The count is reported
   back rather than a cheerful noun, because "backed up" with no
   number is exactly the reassurance the studio-wide export trap
   gave twice while holding one film. */
delegate(document, 'click', '[data-action="storage-backup"]', () => {
  try {
    const n = downloadBackup();
    StudioUI.toast('Backup downloaded \u2014 ' + plural(n, 'project', 'projects')
                   + ' in the file.');
  } catch (e) {
    StudioUI.toastError('The backup could not be written. '
                        + ((e && e.message) || 'Nothing was changed.'),
                        { duration: 6000 });
  }
});

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
  window.StudioCloud.onAuth(() => { refreshGate(); if (!busy) render(); });
}

/* THE GATE'S ANSWER ARRIVES LATER STILL — a round trip after the
   session — for the same reason as above, so it is asked for after
   every auth change and on every gate change, and the page redraws
   when it lands. Null until then: inviteSection() and adminSection()
   both render nothing for a signed-in user whose status is unknown,
   rather than flashing an invite box at a member. */
let gateStatus = null;
async function refreshGate() {
  const c = window.StudioCloud;
  if (!c || !c.gate || !c.getSession || !c.getSession()) { gateStatus = null; return; }
  try { gateStatus = await c.gate.status(); } catch (e) { gateStatus = null; }
  if (!busy) render();
}
wireGateUI(() => { if (!busy) render(); });
Store.subscribe('billing:changed', () => refreshBilling());
if (window.StudioCloud && window.StudioCloud.onAuth) window.StudioCloud.onAuth(() => setTimeout(refreshBilling, 0));
refreshBilling();
Store.subscribe('gate:changed', () => refreshGate());
refreshGate();

render();
