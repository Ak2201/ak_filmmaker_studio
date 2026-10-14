/* ============================================================
   SETTINGS — the things that belong to this DEVICE, not the film
   ------------------------------------------------------------
   REVAMPED 12 Oct 2026, in the Console's shape: five tabs down the left
   (Account · Preferences · Data & backup · Team · Admin), a card per
   setting, and nothing that another place already does. Appearance is
   gone from here (the Dark/Light button lives in the top bar, on every
   page); "Download a backup" is gone (the Backup menu in the top bar is
   the one place for export/import); buying and invoices were already on
   the Purchase page. A hash that used to name a section (#drive,
   #favourite, #danger …) still lands: those are cards INSIDE a tab, and
   tabs.js opens the tab that holds the target.
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
import '../styles/kit-scope.css';   /* the kit's look for the legacy .btn / fields the account, invite and key modules draw */

import StudioUI from '../ui/chrome.js';
import { pageHeader, eyebrow as kitEyebrow } from '../ui/kit/index.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate, commitMain } from '../lib/dom.js';
/* The provider table. The key area is composed by ai-panel.js; this
   page only needs to name the host in its own prose. */
import { apiHost, apiName, providerLabel } from '../lib/ai-providers.js';
import Panel from '../ui/ai-panel.js';
import { aiPill } from '../ui/ai-pill.js';
import { REGIONS, region, chosenRegion, detectRegion, setRegion } from '../lib/region.js';
import DriveSync, { DRIVE_STATES } from '../lib/drive-sync.js';
import PlanGate from '../lib/plan-gate.js';
import Billing from '../lib/billing.js';   // CORE (the `studio` chunk), so this adds no chunk
/* The backup FILE is backup.js's, exactly as it is for the hub's
   Export and for Drive's upload. This page calls it; it does not
   know what a backup looks like. Already a static import here
   through drive-sync.js, so naming it costs nothing. */
/* The admin console reuses the sign-in modal's own config form rather
   than growing a second copy of it. Two forms writing one storage key
   is two things to keep in step, and setCfg() has exactly one caller
   for a reason. */
import { openCloudAuthModal, mayConfigure } from '../ui/auth.js';
/* The account section builds and refreshes itself; this page only
   says where it goes. It returns null when signed out, like
   renderAdmin(), so append stays branchless. */
import { accountSection } from '../ui/account-panel.js';
import * as AuthUI from '../ui/auth.js';
import { ask, tell } from '../ui/dialog.js';
/* The restore preview (Data & backup → Drive): the reader and the
   comparison are backup.js's, the panel is restore-preview.js's. */
import { buildBackup, downloadBackup, summariseBackup, compareForRestore } from '../lib/backup.js';
import { restorePreview, replaceSentences } from '../ui/restore-preview.js';
import { renderActivityLog } from '../ui/activity-log.js';
import { ALL_KEYS } from './hub/all-keys.js';
import { OPTOUT_KEY, usageOptedOut } from '../lib/usage.js';
import { inviteSection, wireGateUI } from '../ui/gate-ui.js';
import { mountMotionChoice } from '../ui/motion-choice.js';
import { renderFilmPicker, onFavChange, hasOpenProject } from '../ui/fav-film.js';

/* Old billing anchors: settings.html#plan etc. now live on purchase.html. */
{
  const OLD = { plan: 'purchase.html#plan', billing: 'purchase.html#plan', invoices: 'purchase.html#plan', refund: 'purchase.html#plan',
                promo: 'purchase.html#plan', gift: 'purchase.html#plan', trial: 'purchase.html#plan', referral: 'purchase.html#plan' };
  const dest = OLD[String(location.hash || '').replace(/^#/, '')];
  if (dest) location.replace(dest);
}

const app = document.getElementById('app');

/* A label from an id, derived the same way chrome.js's
   appearanceMenu() derives its theme labels. Derived rather than
   listed, so dropping or adding a theme needs no edit here. */
const titleCase = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/* ---- a card --------------------------------------------------
   One setting, drawn as a card (the `.st-sec` surface from modules.css).
   Cards live INSIDE the five tab panels below; the panels, not the
   cards, are what tabs.js turns into tabs. */
function section(id, eyebrow, title, deck) {
  /* A kit panel by construction (k-panel / k-panel-head / k-panel-body):
     the mono eyebrow is the header band, the title and deck open the body.
     The .st-sec and .st-card classes and the .bd-h2 title stay as the hooks
     the proofs and the other builders read. Callers keep doing
     sec.append(...): that lands in the BODY, below the deck. */
  const sec = h('div.k-panel.st-sec.st-card', { id });
  const body = h('div.k-panel-body.st-sec-body');
  sec.append(
    h('div.k-panel-head', {}, [kitEyebrow(eyebrow)]),
    body
  );
  body.append(
    h('h2.bd-h2', { text: title }),
    h('p.bd-sub', { text: deck })
  );
  sec.append = (...nodes) => body.append(...nodes);
  sec.appendChild = (node) => body.appendChild(node);
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
    'Your ' + providerLabel() + ' API key.',
    'The AI tools in the studio run on ' + apiName() + ' with your own key — one key for '
      + 'every tool, on this browser. Each tool shows what it will send and waits '
      + 'for your click. You can switch provider below; each one keeps its own key.');

  /* LOCKED: nobody can type a key their plan cannot use. The section
     keeps its heading so settings.html#ai still lands somewhere, and
     re-renders on 'plan:changed' (subscribed below), so a plan that
     arrives after first paint swaps the pill for the key section. */
  if (!PlanGate.aiUnlocked()) {
    sec.append(h('p.st-note', { text: 'AI tools come with Pro. Your key would be kept on this device only.' }));
    sec.append(aiPill({ label: 'Unlock AI tools' }));
    return sec;
  }

  /* The module's own arrangement of the bar, the gate, the form and
     the disclosure. The disclosure body is this page's, because what
     a tool sends depends on the tool — on a settings page the honest
     answer is the key itself and nothing else. */
  sec.append(Panel.keySection(
    'Every AI tool in the studio',
    'Your key stays on this device. It is never put in a backup, never synced '
    + 'and never sent to us. It goes only to ' + apiHost() + ', and only when you '
    + 'run a tool. Usage is billed to your own account. Forget key removes it '
    + 'from this device without touching your work.'
  ));

  return sec;
}

/* ---- favourite film ------------------------------------------
   The film every example and every "What is a …?" box is told in. It
   is the OPEN PROJECT's choice (store.js projectFav, on the project
   entry); with no project open it is the device's demo choice, which is
   what favouriteSlug() falls back to. Writes on a click only. */
function renderFavourite() {
  const project = hasOpenProject();
  const sec = section('favourite', project ? 'This film' : 'This device',
    'Favourite film.',
    'Pick the film we explain every step with: the examples on the Story page and the boxes that say what a logline, a want or a beat is.');
  sec.append(renderFilmPicker({ label: 'Favourite film' }));
  sec.append(h('p.st-note', {
    text: project
      ? 'Saved with this project. Another project keeps its own favourite.'
      : 'No project is open, so this applies to this browser. Open a project and pick again to give that project its own.'
  }));
  return sec;
}
onFavChange(() => render());

/* ---- motion --------------------------------------------------
   Theme moved to the top bar (one Dark/Light button, every page). What
   stays here is the one display setting with no home in the bar. */
function renderMotion() {
  const sec = section('motion', 'This device · not part of the film',
    'Motion.',
    'Reduce the animation, or follow your device. Your choice is not part of any project or backup.');
  mountMotionChoice(sec);
  return sec;
}

/* ---- India / International ----------------------------------
   The one setting on this page that changes what the STUDIO offers
   rather than how it looks, which is why it is not folded into
   Appearance.

   IT RELOADS. Every count the map prints — "29 modules", "6 of 6
   ready", the stage headings — is derived once at import time
   (src/ui/launcher.js says so in as many words), and the rail, the
   phase bar and the palette index are all built at load. Re-rendering
   this one page would leave every one of those saying the other
   region's number. A reload is one second and it cannot be half
   right; a live re-render of nine modules' worth of derived counts
   can. region.js still notifies `region:changed` for anything that
   wants it. */
function renderRegion() {
  const now = region();
  const chosen = chosenRegion();
  const guess = detectRegion();
  const sec = section('region', 'This device · not part of the film',
    'Where you are making this film.',
    'India, or somewhere else. This changes what the studio OFFERS, not what '
      + 'it charges: there is one checkout and it settles in rupees either way.');

  sec.append(choices('Mode', 'data-region-choice', now,
    REGIONS.map((r) => ({ value: r.id, label: r.label, title: r.line }))));

  /* What actually changes, said in the words of the things that
     change rather than as "India-specific content". */
  sec.append(h('p.st-note', { text: now === 'IN'
    ? 'India: the certification checks, the Chennai rate card and the Indian '
      + 'festival deadlines are all on, and prices show in rupees.'
    : 'International: the India-only parts of the studio are hidden rather than '
      + 'replaced. There is no verified rate card, union figure or festival '
      + 'deadline for anywhere else yet, and this studio will not print an '
      + 'invented one — so those pages show nothing rather than something made up. '
      + 'Everything you have written is untouched and comes straight back if you '
      + 'switch to India.' }));

  sec.append(h('p.st-note', { text: chosen
    ? 'You chose this, so it stays chosen — the studio will not change it back, '
      + 'wherever you open it.'
    : 'Guessed from your device’s time zone (' + (guess === 'IN' ? 'India' : 'outside India')
      + '). Nothing was looked up and nothing was sent anywhere; your choice '
      + 'above replaces the guess for good.' }));

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
  card.append(h('p.st-alarm-h', { text: 'Part of your storage did not open.' }));
  card.append(h('p.st-alarm-p', {
    text: 'This browser could not open the storage used for large items such as '
        + 'screenplays, so a script may look empty when it is not. Nothing has been '
        + 'lost, and saving over it is blocked. Reload the page before you type '
        + 'anything. If this keeps happening, you may be in a private window, '
        + 'which does not keep this storage.'
  }));
  return card;
}

function nearlyFullCard() {
  const card = h('div.st-alarm', { role: 'group', 'aria-label': 'Storage warning' });
  card.append(h('p.st-alarm-h', { text: 'Storage is nearly full.' }));
  card.append(h('p.st-alarm-p', {
    text: 'Saves may soon start to fail. Download a backup below, then delete a '
        + 'project you have finished with from Home to make room.'
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
    'Everything you write is saved in this browser. Everyday work \u2014 '
      + 'blueprint answers, scenes, contacts, the schedule \u2014 uses the '
      + 'browser\u2019s main storage, which has limited room. Large items such '
      + 'as screenplays are kept in a second, much larger store.');

  if (u.tier === 'unavailable') sec.append(tierDownCard());
  else if (u.tier !== 'ready') {
    sec.append(h('p.st-note', {
      text: 'Large-item storage has not been checked yet, so its figure below is not shown.'
    }));
  }

  const tiers = h('div.st-tiers');

  /* --- the small tier: the only one with a proportion --- */
  const smallM = h('div.st-meter');
  smallM.append(h('p.st-meter-head', {}, [
    h('span.st-meter-label', { text: 'Main storage' }),
    h('span.st-meter-figure', { text: fmtQuota(u.small) + ' of about ' + fmtQuota(limit) })
  ]));
  smallM.append(h('div.st-bar', {
    role: 'progressbar',
    'aria-valuemin': '0',
    'aria-valuemax': '100',
    'aria-valuenow': String(pct),
    'aria-valuetext': shown + ' of the room this browser is likely to allow',
    'aria-label': 'Main storage'
  }, [
    /* A custom property rather than `style="width:…"`, so the one
       inline style on this page carries a MEASUREMENT and never a
       colour. An inline style beats every stylesheet, which is why
       the band below is a class and not a second declaration. */
    h('span.st-bar-fill' + (band === 'ok' ? '' : '.is-' + band),
      { style: '--st-fill: ' + pct + '%' })
  ]));
  smallM.append(h('p.st-meter-note' + (band === 'warn' ? '.is-warn' : ''), {
    text: shown + ' full, across every project on this browser.'
        + (band === 'warn'
            ? ' There is still room, but now is a good time to take a backup.'
            : '')
  }));
  tiers.append(smallM);

  /* --- the big tier: counted, never proportioned --- */
  const bigM = h('div.st-meter');
  bigM.append(h('p.st-meter-head', {}, [
    h('span.st-meter-label', { text: 'Large-item storage' }),
    h('span.st-meter-figure', {
      text: u.tier === 'unavailable' ? 'could not be counted'
          : u.overflowed ? fmtQuota(u.big) + ' across ' + plural(u.overflowed, 'item', 'items')
          : 'nothing here yet'
    })
  ]));
  bigM.append(h('p.st-meter-note', {
    text: u.tier === 'unavailable'
      ? 'This storage did not open, so its size is unknown. Your work in it is still there.'
      : u.overflowed
        ? 'Browsers allow hundreds of megabytes here, so there is plenty of room.'
        : 'Nothing large enough to need it yet. A screenplay is usually the first.'
  }));
  tiers.append(bigM);

  sec.append(tiers);

  if (band === 'bad' && u.tier !== 'unavailable') sec.append(nearlyFullCard());

  /* The ceiling is the one figure above that is not a measurement,
     so it is the one that has to admit it. */
  sec.append(h('p.st-note', {
    text: 'The limit is an estimate: most browsers allow about 5 MB of main '
        + 'storage. These figures count only your work, not the app itself.'
  }));

  sec.append(h('p.st-note', {
    text: 'To take a copy of every project, use Backup in the top bar (Export everything). '
        + 'Keep it somewhere safe \u2014 browsers can clear their storage without asking.'
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
   */

let versions = null;     // null until EARLIER VERSIONS is opened
let busy = '';           // which control is mid-flight, for the label
/* The restore preview, when one is open: what the Drive file holds
   beside what this browser holds, drawn before the confirmation. A
   render flag like `versions` — never stored. { kind: 'head' |
   'version' | 'theirs', rev, source, savedAt, incoming, current, plan } */
let restorePrev = null;

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
    text: 'The backup in Drive was changed somewhere else, and this browser has '
        + 'changes too. Nothing has been overwritten. Choose which copy to keep — '
        + 'Drive keeps the earlier version either way.'
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
    driveButton('drive-take-theirs', 'Take theirs — replace this browser', { busyLabel: 'Reading Drive…' })
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

/* Cloud sync's own switch, for a signed-in member only (signed out there
   is no sync to turn off). The choice is `cloudSync: 'off'` in the device
   prefs blob, written by cloud.js's setSyncEnabled on a click and never on
   load. Turning it OFF asks first, out loud, like every other consequential
   control on this page; turning it ON just does it, and cloud.js catches up
   both ways. */
function cloudSyncSwitch() {
  const c = window.StudioCloud;
  if (!c || typeof c.setSyncEnabled !== 'function' || !c.getSession || !c.getSession()) return null;
  const on = c.syncEnabled();
  const box = h('p.st-note.st-cloud-sync', {}, [
    h('label', {}, [
      h('input', { type: 'checkbox', id: 'cloudSyncToggle', 'data-action': 'cloud-sync-toggle', ...(on ? { checked: '' } : {}) }),
      ' Cloud sync'
    ]),
    h('span', { text: on
      ? ' — your work goes up to your account a few seconds after you stop typing.'
      : ' — off. Changes on this device are kept here and will reach your account when you turn it back on.' })
  ]);
  const input = box.querySelector('input');
  input.checked = on;
  return box;
}

/* Cloud sync gets a card of its own (it sat inside the Drive section, so it
   read as a Drive setting; it is the ACCOUNT's). */
function renderCloudSync() {
  const c = window.StudioCloud;
  const signedIn = !!(c && c.getSession && c.getSession());
  const sec = section('cloud-sync', 'Your account',
    'Cloud sync.',
    'Keeps your projects the same on every device you sign in on. Independent of Google Drive.');
  const sw = cloudSyncSwitch();
  if (sw) { sec.append(sw); return sec; }
  sec.append(h('p.st-note', { text: signedIn
    ? 'Cloud sync is not available in this build.'
    : 'Sign in to turn on cloud sync. Everything works without an account; your projects stay on this device.' }));
  if (!signedIn && c && c.isConfigured && c.isConfigured()) {
    sec.append(h('p', {}, [h('button.btn.primary', { type: 'button', 'data-action': 'plan-sign-in', text: 'Sign in' })]));
  }
  return sec;
}

function renderDrive() {
  const st = DriveSync.getDriveStatus();
  const sec = section('drive', 'This device · your own Drive',
    'Back up to Google Drive.',
    'A copy of every project on this browser, in your own Google Drive. '
      + 'Drive keeps earlier versions, so you can go back. Your AI key is never '
      + 'included. (Quick exports and imports are in Backup, in the top bar.)');

  /* The plan's `drive_backup` (src/data/plan-matrix.json: Intermediate
     and up). Locked: say so and offer the way up; the backup FILE stays
     a download for everybody (Storage, Home), so nothing is held back. */
  if (!PlanGate.allowed('drive_backup')) {
    sec.dataset.planLocked = 'drive_backup';
    const note = h('p.st-note', {
      text: 'Google Drive backup is not part of your plan. You can still '
          + 'export a backup file from Backup in the top bar.'
    });
    const see = h('a.btn', { href: 'purchase.html', text: 'SEE PLANS' });
    sec.append(note, h('div.st-drive-actions', {}, [see]));
    /* Which plan has it, and what it costs (PlanGate.offerFor). */
    PlanGate.offerFor(['drive_backup']).then((o) => {
      if (!o) return;
      note.textContent = 'Google Drive backup comes with ' + PlanGate.offerText(o) + ' — one payment. You can still '
        + 'export a backup file from Backup in the top bar.';
      see.href = o.href;
      see.textContent = 'SEE ' + o.name.toUpperCase();
    }).catch(() => { /* the plain note stands */ });
    return sec;
  }

  if (!st.configured) {
    sec.append(h('p.st-note', {
      text: 'Google Drive backup is not available right now. You can still '
          + 'export a backup file from Backup in the top bar.'
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

  /* The Google token from a sign-in lives about an hour and this static
     build has nowhere to keep a refresh token (drive.js, CLAUDE.md item
     10). That used to be a note shown in every state; now it appears only
     when it has actually happened — the status line carries the sentence
     (drive-sync.js) and a Reconnect button sits under it. */

  if (!st.connected) {
    sec.append(h('p.st-note', {
      text: 'Connecting gives the studio access to the one backup file it creates '
          + 'in your Drive — nothing else.'
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

  if (st.state === DRIVE_STATES.ERROR) {
    sec.append(h('div.st-drive-actions', {}, [
      driveButton('drive-connect', 'Reconnect Google Drive', { primary: true, busyLabel: 'Asking Google…' })
    ]));
  }

  if (!st.live) {
    /* Supabase is signed in. Said plainly, in one sentence with its reason:
       the account keeps your work up to date across devices, so Drive is the
       one-tap EXTRA copy here. It does not also run by itself, because two
       devices uploading to one Drive file would keep overwriting each other. */
    sec.append(h('p.st-note', {
      text: 'Cloud sync is on, so your account already keeps your work up to date. '
          + 'Drive is your extra copy: press Back up now whenever you want one. '
          + 'It does not also upload by itself, so two devices never overwrite one file.'
    }));
  }

  if (st.state === DRIVE_STATES.CONFLICT) sec.append(conflictCard(st));

  const actions = h('div.st-drive-actions');
  actions.append(driveButton('drive-backup', 'Back up now', { primary: true, busyLabel: 'Uploading…' }));
  actions.append(driveButton('drive-restore', 'Restore from Drive', { busyLabel: 'Reading Drive…' }));
  actions.append(driveButton('drive-versions', versions ? 'Hide earlier versions' : 'Earlier versions', { busyLabel: 'Reading…' }));
  actions.append(driveButton('drive-disconnect', 'Disconnect'));
  sec.append(actions);

  if (versions) sec.append(versionList());

  if (restorePrev) {
    sec.append(restorePreview({
      plan: restorePrev.plan, incoming: restorePrev.incoming, current: restorePrev.current,
      source: restorePrev.source, savedAt: restorePrev.savedAt,
      actions: { confirm: 'drive-restore-confirm', cancel: 'drive-restore-cancel', download: 'drive-restore-download' },
      disabled: !!busy
    }));
  }

  if (st.link) {
    sec.append(h('p.st-note', {}, [
      'The file is yours to open, copy or download: ',
      h('a', { href: st.link, target: '_blank', rel: 'noopener', text: 'open it in Drive' }),
      '. Disconnecting here never deletes it.'
    ]));
  }

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

  const sec = section('database', 'Admin · not shown to other people',
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


/* ---- Account, Activity, Tour, Danger zone (11 Oct 2026) ------------
   Account is the sign-in block (src/ui/auth.js renderAccountBlock()
   when that lane's export is present, a plain sign-in button until
   then). The people-you-share-with panel keeps its own section. */
function renderAccountMine() {
  const c = window.StudioCloud;
  const signedIn = !!(c && c.getSession && c.getSession());
  const sec = section('you', 'You', signedIn ? 'Your account.' : 'Sign in.',
    signedIn
      ? 'You are signed in. Signing in is what lets your films sync between devices and be shared.'
      : 'Everything works without an account. Signing in adds sync between devices and sharing.');
  const slot = h('div#accountBlockHost');
  const make = AuthUI['renderAccountBlock'];   // not a named import: that export belongs to another lane and may not exist yet
  let block = null;
  if (typeof make === 'function') { try { block = make(); } catch (e) { block = null; } }
  if (block) slot.append(block);
  else if (signedIn) slot.append(h('p', { text: 'Signed in as ' + ((c.getUserEmail && c.getUserEmail()) || 'your Google account') + '.' }));
  else if (c && c.isConfigured && c.isConfigured()) {
    slot.append(h('p', {}, [h('button.btn.primary', { type: 'button', 'data-action': 'plan-sign-in', text: 'Sign in' })]));
  } else {
    slot.append(h('p.hint', { text: 'This build is not connected to a cloud project, so there is no account to sign in to.' }));
  }
  sec.append(slot);
  return sec;
}

/* The plan, as a summary and nothing more. Buying, invoices and refunds are
   on the Purchase page ONLY (owner, 12 Oct 2026): this card reads what the
   studio already knows (plan-gate.js) and sends you there. */
/* USAGE AGAINST THE PLAN'S CAPS (12 Oct 2026). billing_status() carries the
   limits and what is used; ui/plan-cards.js's usageList() draws them (and
   brings plans.css with it), so both are fetched together, once, and only
   for somebody signed in who has a plan to be counted against. The answer is
   held here and the card is drawn from it, so the redraw that follows the
   fetch finds it cached and asks for nothing \u2014 no loop, and no request from
   a page that is only being looked at signed out. It is dropped when the
   account or the plan changes. Nothing is stored. */
let usageSeen = null;        // { st, usageList } | { failed: true }
let usageFetching = false;
/* A plan or auth event marks the held answer STALE and refetches it, but
   keeps drawing it meanwhile: clearing it painted "Counting your usage..."
   and then the list again, a blink on every event. It is cleared outright
   only when the signed-in account itself changes, so one person never sees
   another's figures. */
let usageStale = false;
let usageUid = null;
function sessionUid() {
  try { const c = window.StudioCloud; const s = c && c.getSession && c.getSession(); return (s && s.user && s.user.id) || null; } catch (e) { return null; }
}
function dropUsage() {
  const uid = sessionUid();
  if (uid !== usageUid) { usageSeen = null; usageUid = uid; }
  usageStale = true;
}
function wantUsage() {
  if ((usageSeen && !usageStale) || usageFetching) return;
  usageFetching = true;
  usageStale = false;
  const uid = sessionUid();
  usageUid = uid;
  Promise.all([Billing.status(), import('../ui/plan-cards.js')])
    .then(([st, m]) => { if (sessionUid() !== uid) return; usageSeen = st ? { st, usageList: m.usageList } : (usageSeen && usageSeen.st ? usageSeen : { failed: true }); })
    .catch(() => { if (!(usageSeen && usageSeen.st)) usageSeen = { failed: true }; })
    .finally(() => { usageFetching = false; if (!busy) render(); });
}

function renderPlanCard() {
  const cp = PlanGate.currentPlan();
  const c = window.StudioCloud;
  const signedIn = !!(c && c.getSession && c.getSession());
  const sec = section('plan-summary', 'Your plan', 'Plan.',
    'What you have, and when it ends. Everything about buying, invoices and refunds is on the Purchase page.');
  const card = h('div.st-plan-card');
  const off = PlanGate.purchasesOff();
  let line;
  if (off) line = 'The studio is free to use right now. Nothing needs buying.';
  else if (cp.reason === 'trial') {
    const end = PlanGate.trialEndsAt();
    line = 'Free trial' + (end ? ' \u00b7 ends ' + end.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '') + '.';
  } else if (cp.reason === 'paid') line = (cp.planName || 'Your plan') + ' \u00b7 yours for good.';
  else if (cp.reason === 'granted') line = 'Access given to you by the studio' + (cp.planName ? ' \u00b7 ' + cp.planName : '') + '.';
  else if (cp.reason === 'expired') line = 'Your free trial has ended. A plan brings it back.';
  else line = cp.gated ? (cp.planName || 'No plan') + '.' : 'Plan details load when you are signed in.';
  /* Where the plan stands, as one LED pill: read from the same facts as the
     line below it, so it can never say something the line does not. */
  const led = off ? ['Open', 'ok'] : cp.reason === 'trial' ? ['Trial', 'warn'] : cp.reason === 'paid' ? ['Active', 'ok']
    : cp.reason === 'granted' ? ['Granted', 'ok'] : cp.reason === 'expired' ? ['Ended', 'bad'] : null;
  if (led) card.append(h('p.st-plan-pills', {}, [h('span.st-led.is-' + led[1], {}, [h('span.st-dot.is-' + led[1], { 'aria-hidden': 'true' }), led[0]])]));
  card.append(h('p.st-plan-line', { text: line }));

  /* The second line: what the plan means for what you can keep and share. */
  let usageNote = '';
  if (off) usageNote = 'The studio is open, so nothing is capped: sync as many films as you like and share them freely.';
  else if (!signedIn) usageNote = '';   // the line above already says plan details need a sign-in
  else if (cp.reason === 'granted') usageNote = 'Nothing is capped while this access stands.';
  else if (cp.reason === 'trial') usageNote = 'Plan limits on synced films and shares apply once you choose a plan.';
  else if (cp.reason === 'expired') usageNote = 'Everything you wrote is still saved on this device.';
  if (usageNote) card.append(h('p.st-plan-note', { text: usageNote }));

  const bought = signedIn && !off && cp.reason === 'paid';
  if (bought) {
    wantUsage();
    const seen = usageSeen;
    if (seen && seen.st && seen.st.plan && seen.st.plan !== 'free') {
      card.append(h('h3.st-plan-sub', { text: 'Your usage' }), seen.usageList(seen.st));
    } else if (!seen || !seen.failed) {
      card.append(h('p.st-plan-note', { text: 'Counting your usage\u2026' }));
    } else {
      card.append(h('p.st-plan-note', { text: 'Your usage could not be loaded just now. The Purchase page shows it too.' }));
    }
  }
  card.append(h('p.st-plan-link', {}, [h('a.btn.primary', {
    href: 'purchase.html',
    text: bought ? 'Manage plan \u2192' : 'Plan & purchases \u2192'
  })]));
  sec.append(card);
  return sec;
}

function renderActivitySection() {
  const sec = section('activity', 'This studio', 'Activity log.',
    'A timeline of your recent edits. Updates whenever you save. Click an entry to jump back.');
  const host = h('div.st-activity');
  renderActivityLog(host);
  sec.append(host);
  return sec;
}

/* PRIVACY — the one switch, and it is about counting, not about your work.
   On by default (the owner's decision, 12 Oct 2026); the answer lives on this
   device only (fms_usage_optout_v1: in the reset list, in no backup). What is
   counted and what never is, is written out in privacy.html and in the help
   below, in the same words. */
function renderPrivacySection() {
  const on = !usageOptedOut();
  const sec = section('privacy', 'This device \u00b7 what the studio may count', 'Privacy.',
    'The studio never reads what you write. This switch is only about whether it may count which tools get used.');
  sec.append(h('p.st-note.st-usage-count', {}, [
    h('label', {}, [
      h('input', { type: 'checkbox', id: 'usageCountToggle', 'data-action': 'usage-count-toggle', ...(on ? { checked: '' } : {}) }),
      ' Count which tools I use (no content, ever)'
    ]),
    h('span', { text: on
      ? ' \u2014 on. When you are signed in, the studio adds one to a daily total for a tool you opened or a feature you used, such as \u201cbudget opened\u201d or \u201cPDF exported\u201d. The total has no name, e-mail, film, script or text on it.'
      : ' \u2014 off. Nothing is counted from this device.' })
  ]));
  sec.append(h('p.st-note', { text: 'Signed out, nothing is counted either way. Turn it off and nothing more is sent from the next click. Totals already added cannot be traced back to you, so they cannot be taken back out.' }));
  sec.append(h('p.st-note', {}, [h('a', { href: 'privacy.html#usage-counts', text: 'Read exactly what is counted' }), '.']));
  return sec;
}

function renderTourSection() {
  const sec = section('tour', 'Help', 'Take the tour.',
    'A two-minute walk through the studio. It never starts by itself; this is the button for it.');
  sec.append(h('p', {}, [h('button.btn', { type: 'button', 'data-action': 'tour-start', text: 'Take the tour again' })]));
  return sec;
}

function renderDanger() {
  const c = window.StudioCloud;
  const signedIn = !!(c && c.getSession && c.getSession());
  const sec = section('danger', 'Danger zone', 'Erase what you have written.',
    'These cannot be undone. Export a backup first (Backup, in the top bar) if you want to keep anything.');
  sec.append(h('div.st-danger-row', {}, [
    h('p', { text: 'Removes every project, setting and saved key from this browser, and signs you out.' }),
    h('button.btn.danger', { type: 'button', 'data-action': 'erase-all', text: 'Erase everything on this device' })
  ]));
  if (signedIn) {
    sec.append(h('div.st-danger-row', {}, [
      h('p', { text: 'Deletes the cloud copy of every project you own. The copies on this device stay.' }),
      h('button.btn.danger', { type: 'button', 'data-action': 'delete-cloud', text: 'Delete my cloud projects' })
    ]));
  }
  return sec;
}

delegate(document, 'click', '[data-action="tour-start"]', () => {
  import('../ui/tour.js').then((m) => m.startTour()).catch(() => StudioUI.toastError('The tour did not load.'));
});

delegate(document, 'click', '[data-action="erase-all"]', async () => {
  const r = await ask({
    title: 'Erase everything on this device?',
    body: 'Every project, setting and saved key in this browser is erased. You stay signed in; the cloud copies of your projects are not touched, and cloud sync is paused so the empty device does not upload over them. This cannot be undone.',
    typeToConfirm: 'ERASE',
    checkbox: { label: 'Also delete my Google Drive backup file', checked: false },
    confirm: 'ERASE EVERYTHING', danger: true
  });
  if (!r || !r.ok) return;
  const alsoDrive = !!r.checked;
  try {
    const m = await import('./hub/backup-menu.js');
    const res = typeof m.resetAll === 'function'
      ? await m.resetAll({ confirmed: true, alsoDrive })
      : await m.createBackupMenu({ allKeys: ALL_KEYS, logActivity: () => {} }).resetAll({ confirmed: true, alsoDrive });
    if (res && res.cancelled) return;
    await tell({ title: res && res.ok === false ? 'Not everything was erased' : 'Erased', body: (res && res.message) || 'This device has been erased.' });
    location.reload();
  } catch (e) {
    StudioUI.toastError('The erase did not finish. ' + ((e && e.message) || ''), { duration: 6000 });
  }
});

delegate(document, 'click', '[data-action="delete-cloud"]', async () => {
  const ok = await ask({
    title: 'Delete my cloud projects?',
    body: 'Deletes the cloud copy of every project you own. The copies on this device stay. Cloud sync will be paused so nothing re-uploads.',
    typeToConfirm: 'DELETE', confirm: 'DELETE CLOUD COPIES', danger: true
  });
  if (!ok) return;
  const c = window.StudioCloud;
  if (!c || typeof c.deleteOwnedCloudProjects !== 'function') {
    await tell({ title: 'Not available yet', body: 'Deleting cloud projects is not available in this build.' });
    return;
  }
  try {
    const res = await c.deleteOwnedCloudProjects();
    const failed = (res && res.failed) || [];
    await tell({
      title: failed.length ? 'Some cloud projects were not deleted' : 'Cloud projects deleted',
      body: 'Deleted ' + ((res && res.deleted) || 0) + ' cloud project(s)' + (failed.length ? '; ' + failed.length + ' failed.' : '.') + ' Cloud sync is paused.'
    });
    render();
  } catch (e) {
    StudioUI.toastError('The cloud projects were not deleted. ' + ((e && e.message) || ''), { duration: 6000 });
  }
});

/* A tab panel: the thing tabs.js turns into a tab. Cards are filtered for
   null first (Element.append(null) inserts the text "null"); a panel with no
   cards is not drawn at all (Team before sign-in, Admin for everyone else). */
function tabPane(id, label, group, cards, menu = {}) {
  const kept = cards.filter(Boolean);
  if (!kept.length) return null;
  /* menu: { icon, hint } for the shared side menu (src/ui/section-menu.js) */
  return h('section.st-tab', { id, 'data-tab-label': label, 'data-tab-group': group, 'data-tab-icon': menu.icon, 'data-tab-hint': menu.hint }, kept);
}

function render() {
  const main = h('main#main.k-scope');

  main.append(pageHeader({
    eyebrow: ['Studio', 'Settings'],
    title: 'Settings',
    sub: 'Your account, how the studio behaves on this device, where your work is kept and backed up, and your team.',
    class: 'st-head'
  }));

  const team = accountSection((id, eyebrow, title, deck) => section(id === 'account' ? 'account-people' : id, eyebrow, title, deck));
  const panes = [
    tabPane('account', 'Account', 'You', [renderAccountMine(), renderPlanCard(), renderActivitySection(), inviteSection(section, gateStatus)], { icon: 'person', hint: 'Your sign-in, your plan, your activity and invites.' }),
    tabPane('preferences', 'Preferences', 'This device', [renderRegion(), renderMotion(), renderFavourite(), renderKey(), renderPrivacySection(), renderTourSection()], { icon: 'tune', hint: 'Region, motion, favourite film, your AI key and privacy.' }),
    tabPane('backup', 'Data & backup', 'This device', [renderStorage(), renderCloudSync(), renderDrive(), renderDanger()], { icon: 'backup', hint: 'Where your work is kept, cloud sync, Drive backup and erase.' }),
    tabPane('team', 'Team', 'Together', [team], { icon: 'groups', hint: 'Who you share films with.' }),
    tabPane('admin', 'Admin', 'Admin', [consolePointer(), renderAdmin()], { icon: 'admin_panel_settings', hint: 'Studio-wide settings for administrators.' })
  ].filter(Boolean);

  const body = h('div.st-body.st-console', {}, panes);
  main.append(body);

  /* Nine events redraw this page; commitMain skips the swap when nothing
     changed and keeps scroll and focus when it does. */
  if (!commitMain(app, main, mountShell)) return;

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

/* Region: this page owns it: there is no
   document-level listener for [data-region-choice] anywhere, because
   the choice is not applied by painting something — it is applied by
   loading the app again with a different map. See renderRegion().
   setRegion() is a no-op when the value has not moved, so clicking
   the mode you are already in does not reload the page under you. */
delegate(document, 'click', '[data-region-choice]', (e, el) => {
  const want = el.getAttribute('data-region-choice');
  if (want === region()) return;
  try { setRegion(want); } catch (err) { StudioUI.toastError('That region is not one the studio knows.'); return; }
  location.reload();
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
  'drive-restore':  () => run('drive-restore', () => openRestorePreview('head', null, 'The backup in Drive')),
  'drive-versions': () => run('drive-versions', async () => {
    if (versions) { versions = null; return; }
    versions = await DriveSync.listVersions();
  }),
  'drive-disconnect': async () => {
    if (!await ask({
      title: 'Stop syncing to Drive from this browser?',
      body: 'The file in your Drive is not deleted and nothing you have written is touched.',
      confirm: 'STOP SYNCING'
    })) return;
    DriveSync.disconnect();
    versions = null;
    restorePrev = null;
    render();
  },
  'drive-keep-mine':   () => run('drive-keep-mine', () => DriveSync.resolveConflict('mine')),
  'drive-take-theirs': () => run('drive-take-theirs', () => openRestorePreview('theirs', null, 'The backup in Drive')),
  'drive-restore-cancel': () => { restorePrev = null; render(); },
  /* The preview's own buttons. Restore still ends in ask(): the panel is
     what the dialog is about, not a replacement for it. */
  'drive-restore-download': () => {
    try {
      const n = downloadBackup();
      StudioUI.toast('Backup downloaded \u2014 ' + plural(n, 'project', 'projects') + ' in the file.');
    } catch (e) {
      StudioUI.toastError('The backup could not be written. ' + ((e && e.message) || 'Nothing was changed.'), { duration: 6000 });
    }
  },
  'drive-restore-confirm': () => {
    const p = restorePrev;
    if (!p) return;
    run('drive-restore-confirm', async () => {
      /* A restore REPLACES the projects this browser shares with the
         file. Asked out loud, every time, because the one thing this
         app refuses is deciding that silently — and the question
         repeats the panel's own sentences so the two cannot disagree. */
      const sentences = replaceSentences(p.plan, p.incoming);
      if (!await ask({
        title: 'Replace this browser\u2019s copy?',
        body: [...sentences, 'The file in Drive is not changed by this.'],
        confirm: 'REPLACE', danger: true
      })) return;
      const r = p.kind === 'theirs'
        ? await DriveSync.resolveConflict('theirs')
        : await DriveSync.pull(p.rev ? { revisionId: p.rev } : {});
      if (r && r.ok) { restorePrev = null; location.reload(); }
    });
  }
};

/* Read the Drive file a restore would apply and open the preview — and
   NOTHING else: no write, no apply. A file that cannot be read says why
   in a toast and no panel opens, because a restore of something that
   cannot be read could only fail. `kind` is what the confirm will do:
   'head' (the current Drive file), 'version' (an earlier revision, `rev`),
   'theirs' (the conflict's "take theirs"). */
async function openRestorePreview(kind, rev, source) {
  const r = await DriveSync.previewRemote(rev ? { revisionId: rev } : {});
  if (!r.ok) { StudioUI.toastError(r.message || 'Drive did not answer.', { duration: 6000 }); return; }
  const { pageCount } = await import('../lib/script.js');
  const incoming = summariseBackup(r.all, { pageCount });
  if (!incoming.ok) { StudioUI.toastError(incoming.problem || 'That backup could not be read.', { duration: 6000 }); return; }
  const current = summariseBackup(buildBackup(), { pageCount });
  restorePrev = {
    kind, rev: rev || null, source, incoming, current,
    plan: compareForRestore(incoming, current),
    savedAt: when(incoming.exported || r.modifiedTime)
  };
  /* The panel renders when run() redraws; bring it into view after that. */
  setTimeout(() => {
    const el = document.querySelector('.st-restore');
    if (el) { el.scrollIntoView({ block: 'nearest' }); try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }, 60);
}

/* ---- the admin console's two buttons ------------------------
   Both delegate to code that already exists: the modal owns the form,
   cloud.js owns the key. Nothing here writes storage directly, which
   is what keeps setCfg() a single caller. */
delegate(document, 'click', '[data-action="plan-sign-in"]', () => {
  openCloudAuthModal();
});

delegate(document, 'click', '[data-action="admin-configure"]', () => {
  openCloudAuthModal({ mode: 'settings' });
});

delegate(document, 'click', '[data-action="admin-use-built-in"]', async () => {
  const c = window.StudioCloud;
  if (!c || !c.setCfg) return;
  if (!await ask({
    title: 'Use the build\u2019s own Supabase project?',
    body: 'Drops this browser\u2019s own Supabase project and goes back to the one this build ships with. Nothing you have written is touched. You will be signed out of the current project.',
    confirm: 'USE BUILT-IN'
  })) return;
  /* setCfg(null) CLEARS THE OVERRIDE, it does not un-configure the app
     — getCfg() falls through to the build's own. That is only true
     since the build carries one; before, this call was how you broke
     sign-in. */
  c.setCfg(null);
  location.reload();
});

delegate(document, 'click', '[data-action^="drive-"]', async (e, el) => {
  const act = el.getAttribute('data-action');
  if (act === 'drive-restore-version') {
    const rev = el.getAttribute('data-rev');
    /* The date comes from the file itself (savedAt), so the line says
       "An earlier version of the backup, saved <date>" and no more. */
    return run('drive-restore-version', () =>
      openRestorePreview('version', rev, 'An earlier version of the backup in Drive'));
  }
  const fn = DRIVE_ACTIONS[act];
  if (fn) fn();
});

/* The usage-counting switch. Checked = counting. The key is written only when
   the answer is "no" and removed when it is "yes", so the default leaves nothing. */
delegate(document, 'change', '[data-action="usage-count-toggle"]', (e, el) => {
  try {
    if (el.checked) Store.rawRemove(OPTOUT_KEY); else Store.rawSet(OPTOUT_KEY, '1');
  } catch (err) { StudioUI.toastError('This browser would not save that choice.'); }
  render();
});

delegate(document, 'change', '[data-action="cloud-sync-toggle"]', async (e, el) => {
  const c = window.StudioCloud;
  if (!c) return;
  if (!el.checked) {
    const yes = await ask({
      title: 'Turn off cloud sync?',
      body: 'Changes on this device won\u2019t reach your other devices until you turn it back on. Nothing is deleted.',
      confirm: 'TURN OFF'
    });
    if (!yes) { el.checked = true; return; }
    c.setSyncEnabled(false).then(render);
  } else {
    c.setSyncEnabled(true).then(render);
  }
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
  window.StudioCloud.onAuth(() => { dropUsage(); refreshGate(); if (!busy) render(); });
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
Store.subscribe('gate:changed', () => refreshGate());
/* The Drive section reads the plan's drive_backup, which arrives later. */
Store.subscribe('plan:changed', () => { dropUsage(); if (!busy) render(); });
refreshGate();

render();
