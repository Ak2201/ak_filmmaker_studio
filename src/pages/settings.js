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

   NO PAGE-LOCAL MIRROR OF "Is there a key". Every render asks
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
import { pageHeader, eyebrow as kitEyebrow, button, kGoogleBtn } from '../ui/kit/index.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate, commitMain } from '../lib/dom.js';
/* The provider table. The key area is composed by ai-panel.js; this
   page only needs to name the host in its own prose. */
import { apiHost, apiName, providerLabel } from '../lib/ai-providers.js';
import Panel from '../ui/ai-panel.js';
import { aiPill } from '../ui/ai-pill.js';
import { REGIONS, region, chosenRegion, detectRegion, setRegion } from '../lib/region.js';
import { filmRegion, setFilmRegion } from '../lib/film-region.js';   // = region.js currentProjectPrefs / setProjectRegion; film-region.js says why
import DriveSync, { DRIVE_STATES } from '../lib/drive-sync.js';
import PlanGate from '../lib/plan-gate.js';
import { mayRemoveBranding } from '../ui/footer.js';   // CORE: the PDF line's own rule
import Account from '../lib/account.js';   // CORE: auth.js imports it too
import { syncLine, ago } from '../ui/status-bar.js';
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
import { usageOptedOut } from '../lib/usage.js';
import { movedAnchor, plural, formatWhen, fmtQuota, storageReadout, bigTierFigure, roleLine, seatsKey, planSummary, cloudDeleteReport, setUsageCounting, autopaySummary } from '../lib/settings-model.js';
import { CANCEL_AT_MANDATE } from '../lib/offer-terms.js';
import { inviteSection, wireGateUI } from '../ui/gate-ui.js';
import { mountMotionChoice } from '../ui/motion-choice.js';
import { renderFilmPicker, onFavChange, hasOpenProject } from '../ui/fav-film.js';
import { passName } from '../lib/pass-view.js';

/* Old billing anchors: settings.html#plan etc. now live on purchase.html. */
{
  const dest = movedAnchor(location.hash);
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
  /* Radio pattern: one Tab stop per group, on the chosen option (or the
     first when nothing is chosen); arrow keys move and choose. */
  const stop = options.some((o) => o.value === current) ? current : options[0] && options[0].value;
  options.forEach((o) => {
    const on = o.value === current;
    /* The kit's button as well as `.st-choice`: this is the studio's
       button, not a new control, so the shape, the label face and the
       focus ring all come from kit.css. `.st-choice` only adds which of
       them is live. */
    const b = h('button.k-btn.k-btn--secondary.st-choice' + (on ? '.is-on' : ''), {
      type: 'button',
      role: 'radio',
      'aria-checked': String(on),
      tabindex: o.value === stop ? '0' : '-1',
      title: o.title || o.label
    });
    b.setAttribute(attr, o.value);
    b.append(h('span', { text: o.label }));
    row.append(b);
  });
  grp.append(row);
  return grp;
}

document.addEventListener('keydown', (e) => {
  const r = e.target && e.target.closest && e.target.closest('.st-choice[role="radio"]');
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (!r || !step || e.altKey || e.ctrlKey || e.metaKey) return;
  const all = [...r.closest('[role="radiogroup"]').querySelectorAll('.st-choice[role="radio"]')];
  const next = all[(all.indexOf(r) + step + all.length) % all.length];
  e.preventDefault();
  if (next === r) return;
  next.focus();
  next.click();
});

/* ---- the key ------------------------------------------------ */
function renderKey() {
  /* Titled after the provider in use rather than after one of them.
     A page headed "The Anthropic API key" above a Gemini key bar is
     a page that is wrong about the only thing it is for. */
  /* LOCKED: nobody can type a key their plan cannot use. The section
     keeps its id so settings.html#ai still lands somewhere, and
     re-renders on 'plan:changed' (subscribed below), so a plan that
     arrives after first paint swaps the pill for the key section.
     Its title and deck are chosen by state: the unlocked deck promises
     a provider switch "below", which a locked section does not draw. */
  if (!PlanGate.aiUnlocked()) {
    const locked = section('ai', 'This device · never synced', 'AI tools.',
      'AI tools run on your own ' + providerLabel() + ' API key (' + apiName() + ', or another provider). '
        + 'Each tool shows what it will send and waits for your click. They come with Pro.');
    locked.append(h('p.st-note', { text: 'Your key would be kept on this device only.' }));
    locked.append(aiPill({ label: 'Unlock AI tools' }));
    return locked;
  }
  const sec = section('ai', 'This device · never synced',
    'Your ' + providerLabel() + ' API key.',
    'The AI tools in the studio run on ' + apiName() + ' with your own key — one key for '
      + 'every tool, on this browser. Each tool shows what it will send and waits '
      + 'for your click. You can switch provider below; each one keeps its own key.');

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
    'India, or somewhere else. This changes what the studio OFFERS on this device, '
      + 'not what it charges: the purchase page says which currency a price is in '
      + 'and which currency the charge is made in.');

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

  /* The OPEN FILM's region (docs/US-MARKET-PLAN.md §A3), beside the
     device's mode because the two are different questions: the device
     decides what the map offers, the film decides its paperwork and
     whether its pages show the India-only material. Set on a click only
     (setFilmRegion); a film that predates regions reads as India
     paperwork with its content following this device. */
  const proj = Store.currentProject();
  if (proj) {
    const pp = filmRegion();
    const filmNow = pp.explicit ? pp.region : '';
    sec.append(choices('This film', 'data-project-region-choice', filmNow, [
      { value: 'IN', label: 'India', title: 'Rupees, A4 and Indian dates on the paperwork, with the India-only checks.' },
      { value: 'INT', label: 'Elsewhere', title: 'US dollars, US Letter and US dates on the paperwork; the India-only material is hidden.' }
    ]));
    sec.append(h('p.st-note', { text: pp.explicit
      ? (pp.region === 'IN'
        ? '“' + proj.title + '” is made in India: rupees, A4 and Indian dates on its paperwork.'
        : '“' + proj.title + '” is made elsewhere: US dollars, US Letter and US dates on its paperwork, '
          + 'and the India-only material is hidden on its pages. Nothing is deleted.')
      : '“' + proj.title + '” was started before films had a region, so its paperwork stays in rupees '
        + 'on A4 and its India-only material follows this device. Pick one above to set it.' }));
  }

  /* What rate card the budget actually reads, said as a fact and not as a
     union badge: no union floor exists (the FEFSI MoU lapsed in 2025), so
     nothing here says "applied" about an agreement. */
  if (now === 'IN') {
    sec.append(h('p.st-rate', {}, [
      h('span.st-rate-k', { text: 'Rate card in use' }),
      h('span.st-rate-v', { text: 'Chennai 2024\u201325 \u00b7 indicative ranges, not a union agreement' })
    ]));
  }

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

/* Chars in, quota bytes out: fmtQuota() and the meter's band are in
   src/lib/settings-model.js, with the reasoning. */

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
  /* Three bands, and the first of them is the whole point. A studio
     with room to spare is drawn in the accent, not in a warning
     hue: colouring a healthy number amber is how people learn to
     ignore amber. 0% on a studio that has written something is a lie
     by rounding, so it reads "under 1%". */
  const { limit, pct, band, shown } = storageReadout(u);

  const sec = section('storage', 'This device \u00b7 where the work actually sits',
    'Storage.',
    'Everything you write is saved in this browser. Everyday work \u2014 '
      + 'blueprint answers, scenes, contacts, the schedule \u2014 uses the '
      + 'browser\u2019s main storage, which has limited room. Large items such '
      + 'as screenplays are kept in a second, much larger store.');

  if (u.tier === 'unavailable') sec.append(tierDownCard());
  /* No "not checked yet" note for a COLD tier: store.js opens the tier at
     boot whenever any stub exists, so cold means nothing large is stored,
     which the figure below already says. The note contradicted it. */

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
    h('span.st-meter-figure', { text: bigTierFigure(u) })
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
    text: 'To take a copy of every project, use Backup in the rail, above your avatar (Tools on a phone) and choose Export everything. '
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

const when = formatWhen;

function driveButton(action, label, opts) {
  opts = opts || {};
  const b = h('button.k-btn' + (opts.primary ? '.k-btn--primary' : '.k-btn--secondary'), {
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
      h('button.k-btn.k-btn--secondary.st-version-btn', {
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
    : 'Continue with Google to turn on cloud sync. Everything works without an account; your projects stay on this device.' }));
  if (!signedIn && c && c.isConfigured && c.isConfigured()) {
    sec.append(h('p', {}, [kGoogleBtn({ action: false, attrs: { 'data-action': 'plan-sign-in' } })]));
  }
  return sec;
}

function renderDrive() {
  const st = DriveSync.getDriveStatus();
  const sec = section('drive', 'This device · your own Drive',
    'Back up to Google Drive.',
    'A copy of every project on this browser, in your own Google Drive. '
      + 'Drive keeps earlier versions, so you can go back. Your AI key is never '
      + 'included. (Quick exports and imports are in Backup, in the rail, above your avatar (Tools on a phone).)');

  /* The plan's `drive_backup` (src/data/plan-matrix.json: Intermediate
     and up). Locked: say so and offer the way up; the backup FILE stays
     a download for everybody (Storage, Home), so nothing is held back. */
  if (!PlanGate.allowed('drive_backup')) {
    sec.dataset.planLocked = 'drive_backup';
    const note = h('p.st-note', {
      text: 'Google Drive backup is not part of your plan. You can still '
          + 'export a backup file from Backup, in the rail, above your avatar (Tools on a phone).'
    });
    const see = h('a.k-btn.k-btn--secondary', { href: 'purchase.html', text: 'See plans' });
    sec.append(note, h('div.st-drive-actions', {}, [see]));
    /* Which plan has it, and what it costs (PlanGate.offerFor). */
    PlanGate.offerFor(['drive_backup']).then((o) => {
      if (!o) return;
      note.textContent = 'Google Drive backup comes with ' + PlanGate.offerText(o) + ' a year. You can still '
        + 'export a backup file from Backup, in the rail, above your avatar (Tools on a phone).';
      see.href = o.href;
      see.textContent = 'See ' + o.name;
    }).catch(() => { /* the plain note stands */ });
    return sec;
  }

  if (!st.configured) {
    sec.append(h('p.st-note', {
      text: 'Google Drive backup is not available right now. You can still '
          + 'export a backup file from Backup, in the rail, above your avatar (Tools on a phone).'
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
        ? 'This browser is overriding the build'
        : 'USING THE BUILD\u2019S OWN PROJECT'
    })
  ]));

  if (live) sec.append(h('p.st-note', { text: 'In use right now: ' + live.url }));

  const row = h('div.st-row');
  row.append(h('button.k-btn.k-btn--secondary', {
    type: 'button', 'data-action': 'admin-configure',
    text: override ? 'Change the project' : 'Point at another project'
  }));
  /* Only offered when there is something to fall back TO. Clearing an
     override on a build with no project of its own would leave the app
     unable to sign anybody in, with the form that fixes it now hidden
     behind an admin check that needs a sign-in. */
  if (override && built) {
    row.append(h('button.k-btn.k-btn--secondary', {
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
    h('a.k-btn.k-btn--primary', { href: 'admin.html', text: 'Open the console' }),
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
  const sec = section('you', 'You', signedIn ? 'Your account.' : 'Continue with Google.',
    signedIn
      ? 'You are signed in. Signing in is what lets your films sync between devices and be shared.'
      : 'Everything works without an account. An account adds sync between devices and sharing; new or returning, it is the same button.');
  const slot = h('div#accountBlockHost');
  const make = AuthUI['renderAccountBlock'];   // not a named import: that export belongs to another lane and may not exist yet
  let block = null;
  /* Signed out, the shared block is a caps menu row ("Sign in") beside
     this page's own k-btn sign-in under Cloud sync: two styles for one
     action (UI review, 22 Oct 2026). Signed out, this page draws the
     same primary button as the cloud-sync panel instead. */
  if (signedIn && typeof make === 'function') { try { block = make(); } catch (e) { block = null; } }
  if (block) slot.append(block);
  else if (signedIn) slot.append(h('p', { text: 'Signed in as ' + ((c.getUserEmail && c.getUserEmail()) || 'your Google account') + '.' }));
  else if (c && c.isConfigured && c.isConfigured()) {
    slot.append(h('p.hint', { text: 'You are not signed in. Your projects are saved on this device either way.' }));
    slot.append(h('p', {}, [kGoogleBtn({ action: false, attrs: { 'data-action': 'plan-sign-in' } })]));
  } else {
    slot.append(h('p.hint', { text: 'This build is not connected to a cloud project, so there is no account to sign in to.' }));
  }
  sec.append(slot);
  if (signedIn) sec.append(renderIdentityFacts());
  /* Your testimonials, and the route to take one back: the consent
     sentence promises it lives here (testimonial-prompt.js). Filled
     after the swap, so commitMain compares an empty host. */
  if (signedIn) sec.append(h('div#myTestimonials'));
  return sec;
}

/* THE IDENTITY CARD'S THREE FACTS (14 Oct 2026): role and plan, seats,
   last sync. Every one is read, none stored, and a fact that cannot be
   known is left out rather than guessed: no studio account means no seat
   count; no Drive backup means no Drive line. The owner's name is never
   printed (brand.json seller is empty by decision); the role is the
   gate's word (admin / member). */
let factsSeen = null;        // { uid, data } | { uid, none: true }
let factsFetching = false;
function wantFacts() {
  const uid = sessionUid();
  if (!uid || factsFetching || (factsSeen && factsSeen.uid === uid)) return;
  factsFetching = true;
  Account.loadAccount()
    .then((d) => { factsSeen = { uid, data: d || null }; })
    .catch(() => { factsSeen = { uid, data: null }; })
    .finally(() => { factsFetching = false; if (sessionUid() === uid && !busy) render(); });
}
/* The Team panel re-reads the account after every create / invite /
   revoke (and on each render). Adopt its answer, and redraw only when the
   seat count actually moved, so its refresh-on-render cannot loop. */
document.addEventListener('fms:account-loaded', (e) => {
  const uid = sessionUid();
  if (!uid) return;
  const d = e.detail || null;
  const was = factsSeen && factsSeen.uid === uid ? seatsKey(factsSeen.data) : null;
  factsSeen = { uid, data: d };
  if (was !== seatsKey(d) && !busy) render();
});
function renderIdentityFacts() {
  wantFacts();
  const c = window.StudioCloud;
  const cp = PlanGate.currentPlan();
  const gate = (c && c.getGateState && c.getGateState()) || {};
  const cells = [];
  /* 'granted' is only ever computed with plan 'free' (plan-gate.js), so its
     planName is the FREE plan's: say what it is, as purchase.js does. */
  cells.push(['Role', roleLine(cp, gate.role)]);
  const d = factsSeen && factsSeen.uid === sessionUid() ? factsSeen.data : null;
  if (d && d.seats && d.seats.limit) {
    cells.push(['Seats', d.seats.used + ' of ' + d.seats.limit + ' allocated']);
  }
  const st = c && c.getSyncStatus ? c.getSyncStatus() : null;
  let last = syncLine(st).text;
  try {
    const ds = DriveSync.getDriveStatus();
    const t = ds && ds.syncedAt ? Date.parse(ds.syncedAt) : NaN;
    if (Number.isFinite(t)) last += ' \u00b7 Drive ' + ago(t);
  } catch (e) { /* no Drive line */ }
  cells.push(['Sync', last]);
  return h('dl.st-facts', {}, cells.map(([k, v]) => h('div.st-fact', {}, [h('dt', { text: k }), h('dd', { text: v })])));
}

/* The build, read from package.json at build time (the same value the
   status dock prints). Nothing measured is invented: no platform, no
   gateway. */
function renderBuild() {
  const v = String(import.meta.env.VITE_APP_VERSION || '');
  if (!v) return null;
  return h('p.st-build', { id: 'build', text: 'Build v' + v });
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
  /* The line, the LED pill read from the same facts, and the usage note:
     src/lib/settings-model.js planSummary(). */
  const { line, led, usageNote, bought } = planSummary(cp, { off, signedIn, trialEndsAt: () => PlanGate.trialEndsAt() });
  if (led) card.append(h('p.st-plan-pills', {}, [h('span.st-led.is-' + led[1], {}, [h('span.st-dot.is-' + led[1], { 'aria-hidden': 'true' }), led[0]])]));
  card.append(h('p.st-plan-line', { text: line }));

  /* The second line: what the plan means for what you can keep and share. */
  if (usageNote) card.append(h('p.st-plan-note', { text: usageNote }));

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
  card.append(h('p.st-plan-link', {}, [button({
    href: 'purchase.html', variant: 'primary', iconAfter: 'arrow_forward',
    label: bought ? 'Manage plan' : 'Purchase'
  })]));
  sec.append(card);
  return sec;
}

/* ---- Auto-pay (§62) -------------------------------------------------
   Only while there is one: a status line (what it charges and when) and
   where to cancel. There is NO cancel button here (owner, 28 Oct 2026):
   cancelling is done at the mandate, from the Razorpay e-mail link or the
   bank / UPI app. The console's admin cancel (billing.js) is untouched.
   The words are offer-terms.js's, through settings-model.js. */
function renderAutopay() {
  const cp = PlanGate.currentPlan();
  const nameOf = (p) => (p === 'pass' ? passName(cp.passDays) : Billing.planName(p));
  const sum = autopaySummary(cp.autopay, nameOf);
  if (!sum) return null;
  const sec = section('autopay', 'Plan & purchases', 'Auto-pay.',
    'The payment that repeats by itself, and how to stop it.');
  const card = h('div.st-plan-card.st-autopay');
  card.append(h('p.st-plan-pills', {}, [h('span.st-led.is-' + sum.led[1], {}, [h('span.st-dot.is-' + sum.led[1], { 'aria-hidden': 'true' }), sum.led[0]])]));
  card.append(h('p.st-plan-line', { text: sum.name + ' · ' + sum.line }));
  if (sum.note) card.append(h('p.st-plan-note', { text: sum.note }));
  if (sum.canCancel) card.append(h('p.st-plan-note', { text: CANCEL_AT_MANDATE }));
  sec.append(card);
  return sec;
}

/* ---- What's in my plan ---------------------------------------------
   The current plan's modules and tools, and what the NEXT plan adds with
   the price this account would pay for it. The rows and their labels are
   src/data/plan-matrix.json (plan-matrix.js labelOf, the same rows the
   plan cards and start.html derive from); whether each is IN this plan is
   the live answer (PlanGate.allowed(), the server's features map), so a
   console edit shows here too. A module no plan sells is left out
   (isDisabledEverywhere), as everywhere else. The figure is the server's
   upgrade quote (PlanGate.quotedOffer: list price less the unused year);
   without one the plan is named and the link stands with no figure.
   Only for a signed-in account whose plan is known, and not while
   purchases are off (everything is open then, so the list says nothing).
   The matrix is a lazy import: it never rides on this page's first paint. */
let matrixMod = null;
let matrixAsked = false;
const nextOffer = { key: '', o: null };
function renderPlanContents() {
  const cp = PlanGate.currentPlan();
  if (!cp.gated || !cp.plan || PlanGate.purchasesOff()) return null;
  /* THE ACCOUNT'S STATE DECIDES THE SECTION, the way plan-gate's wall
     does (entitlement().reason), not the plan id alone: an ended trial,
     a lapsed year and a grant all read as plan 'free', and the features
     map allows whatever it does not name, so listing allowed() for them
     told an account with nothing open that its trial opened every module
     "right now". Nothing is open → no list, only the way back. A grant
     is the studio's word, not a plan's: what it opens is the whole
     studio while it stands (open_features()), which the Plan card above
     already says. 'unknown' (billing_status() unread): nothing shown. */
  const why = cp.reason;
  if (why === 'unknown' || why === 'granted') return null;
  if (cp.entitled === false) {
    const ended = cp.planUntil && Date.parse(cp.planUntil) <= PlanGate.serverNow() ? new Date(cp.planUntil) : null;
    const sec = section('plan-contents', 'Your plan', 'What’s in my plan.',
      cp.lapsed || ended ? 'Your plan’s year ' + (ended ? 'ended on ' + ended.toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'has ended') + '. Nothing is open until you choose a plan; everything you made is kept.'
        : cp.passUsed ? 'Your launch pass has ended. Nothing is open until you choose a yearly plan; everything you made is kept.'
        : why === 'off' || !cp.used ? 'No plan is active. Everything you made is kept; a plan opens the studio again.'
        : 'Your free trial has ended. Nothing is open until you choose a plan; everything you made is kept.');
    sec.append(h('p.st-plan-link', {}, [button({ href: 'purchase.html', variant: 'primary', iconAfter: 'arrow_forward', label: 'Choose a plan' })]));
    return sec;
  }
  if (!matrixMod) {
    if (!matrixAsked) { matrixAsked = true; import('../lib/plan-matrix.js').then((m) => { matrixMod = m; if (!busy) render(); }, () => { /* no list */ }); }
    return null;
  }
  const { MATRIX, PAID, labelOf, planHas } = matrixMod;
  const rows = MATRIX.features.filter((r) => !r.inverted && r.kind !== 'limit'
    && !(r.kind === 'module' && PlanGate.isDisabledEverywhere(r.key)));
  /* Two capabilities have their OWN rule, stricter than the features
     map: the PDF "Made with" line (footer.js mayRemoveBranding(), never
     for a trial) and the AI tools (aiUnlocked(), fails closed). Reading
     allowed() for them told a full-scope trial it could remove the line
     every PDF it exported still printed. A trial lists modules only. */
  const included = (r) => (r.key === 'remove_branding' ? mayRemoveBranding(cp)
    : r.key === 'ai_tools' ? PlanGate.aiUnlocked() : PlanGate.allowed(r.key));
  const mine = rows.filter((r) => (cp.plan !== 'free' || r.kind === 'module') && included(r));
  const at = PAID.indexOf(cp.plan);
  const next = at >= 0 ? PAID[at + 1] : null;
  const extras = next ? rows.filter((r) => planHas(r, next) && !included(r)) : [];
  /* A sample-scope trial opens the sample films only (§33): its modules
     are the ones it can show you there, and it says so. */
  const sample = cp.plan === 'free' && PlanGate.sampleOnly();
  const sec = section('plan-contents', 'Your plan', 'What’s in my plan.',
    cp.plan === 'free'
      ? (sample ? 'What your trial opens right now, on the sample films. Choose a plan to start a film of your own.'
                : 'What your trial opens right now. Choose a plan to keep working on your own film after it ends.')
      : cp.passActive
        /* §61: "7-day pass · ends 3 Nov": a pass is the whole studio for its days. */
        ? passName(cp.passDays) + (cp.planUntil ? ' · ends ' + new Date(cp.planUntil).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '') + '. The whole studio, read from the plan itself; choose a yearly plan to keep it.'
        : 'What the ' + (cp.planName || 'current') + ' plan includes, read from the plan itself.');
  const list = (rs, cls) => h('ul.st-pc-list' + (cls || ''), {}, rs.map((r) => h('li', { text: labelOf(r) })));
  const mods = mine.filter((r) => r.kind === 'module');
  const tools = mine.filter((r) => r.kind !== 'module');
  if (mods.length) sec.append(h('h3.st-plan-sub', { text: 'Modules · ' + mods.length }), list(mods));
  if (tools.length) sec.append(h('h3.st-plan-sub', { text: 'Tools' }), list(tools));
  if (extras.length) {
    const ids = extras.map((r) => r.key);
    const key = cp.plan + ':' + ids.join(',');
    if (nextOffer.key !== key) {
      nextOffer.key = key; nextOffer.o = null;
      PlanGate.quotedOffer(ids).then((o) => { if (nextOffer.key === key) { nextOffer.o = o; if (!busy) render(); } }, () => { /* named without a figure */ });
    }
    const o = nextOffer.o;
    const name = (o && o.name) || MATRIX.plans[next] || 'the next plan';
    const box = h('div.st-pc-next');
    box.append(h('h3.st-plan-sub', { text: 'Upgrade to ' + name + ' to get' }), list(extras, '.is-next'));
    box.append(h('p.st-plan-note', { text: o && o.due
      ? (o.more ? 'Upgrade for ' + o.due + ' more: the unused part of your plan is counted.' : name + ' is ' + o.due + ' a year.')
      : 'The Purchase page shows what the upgrade costs you.' }));
    box.append(h('p.st-plan-link', {}, [button({
      href: (o && o.href) || ('purchase.html?plan=' + encodeURIComponent(next)), iconAfter: 'arrow_forward',
      label: o && o.due && o.more ? 'Upgrade to ' + name + ' for ' + o.due : 'See ' + name
    })]));
    sec.append(box);
  } else if (cp.plan === 'free') {
    sec.append(h('p.st-plan-link', {}, [button({ href: 'purchase.html', iconAfter: 'arrow_forward', label: 'Choose a plan' })]));
  }
  return sec;
}

function renderActivitySection() {
  const sec = section('activity', 'This studio', 'Activity log.',
    'A timeline of your recent edits. Updates whenever you save. Click an entry to jump back.');
  const host = h('div.st-activity');
  renderActivityLog(host);
  /* ONE BUTTON LANGUAGE (item 48): activity-log.js draws its two actions
     as mono-caps `.mini-btn` ('↻ REFRESH', 'Clear log'), which the
     k-scope sheet does not cover. Restate them as kit small buttons in
     sentence case. The log redraws itself on Refresh and Clear, so this
     re-applies on each redraw; it touches only class and label, and the
     click listeners activity-log.js bound stay on the same elements. */
  const kitActions = () => host.querySelectorAll('.activity-actions .mini-btn').forEach((b) => {
    const danger = b.classList.contains('danger');
    b.className = 'k-btn k-btn--sm ' + (danger ? 'k-btn--danger' : 'k-btn--secondary');
    b.textContent = danger ? 'Clear log' : 'Refresh';
  });
  kitActions();
  new MutationObserver(kitActions).observe(host, { childList: true });
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
    'A walk through every page of the studio, on the Dragon sample. It starts by itself once, the first time an account signs in; this button takes it again. Pause it any time and resume it from your account menu.');
  sec.append(h('p', {}, [h('button.k-btn.k-btn--secondary', { type: 'button', 'data-action': 'tour-start', text: 'Take the tour again' })]));
  return sec;
}

function renderDanger() {
  const c = window.StudioCloud;
  const signedIn = !!(c && c.getSession && c.getSession());
  const sec = section('danger', 'Danger zone', 'Erase what you have written.',
    'These cannot be undone. Export a backup first (Backup, in the rail, above your avatar (Tools on a phone)) if you want to keep anything.');
  sec.append(h('div.st-danger-row', {}, [
    /* Erase never signs out (CLAUDE.md item 29), and the dialog one click
       on says so: this line promised a sign-out that never happened. */
    h('p', { text: 'Removes every project, setting and saved key from this browser.' + (signedIn ? ' You stay signed in, and the copies in the cloud are not touched.' : '') }),
    h('button.k-btn.k-btn--danger', { type: 'button', 'data-action': 'erase-all', text: 'Erase everything on this device' })
  ]));
  if (signedIn) {
    sec.append(h('div.st-danger-row', {}, [
      h('p', { text: 'Deletes the cloud copy of every project you own. The copies on this device stay.' }),
      h('button.k-btn.k-btn--danger', { type: 'button', 'data-action': 'delete-cloud', text: 'Delete my cloud projects' })
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
    confirm: 'Erase everything', danger: true
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
    typeToConfirm: 'DELETE', confirm: 'Delete cloud copies', danger: true
  });
  if (!ok) return;
  const c = window.StudioCloud;
  if (!c || typeof c.deleteOwnedCloudProjects !== 'function') {
    await tell({ title: 'Not available yet', body: 'Deleting cloud projects is not available in this build.' });
    return;
  }
  try {
    const res = await c.deleteOwnedCloudProjects();
    await tell(cloudDeleteReport(res));
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
  const main = h('main#main.k-scope.k-page.k-page--side');

  main.append(pageHeader({
    eyebrow: ['Studio', 'Settings'],
    title: 'Settings',
    sub: 'Your account, how the studio behaves on this device, where your work is kept and backed up, and your team.',
    class: 'bd-head st-head'
  }));

  const team = accountSection((id, eyebrow, title, deck) => section(id === 'account' ? 'account-people' : id, eyebrow, title, deck));
  const panes = [
    tabPane('account', 'Account', 'You', [renderAccountMine(), renderActivitySection(), inviteSection(section, gateStatus), renderBuild()], { icon: 'person', hint: 'Your sign-in, your activity and invites.' }),
    /* PLAN & PURCHASES (27 Oct 2026): its own tab, because the public
       copy points here for the auto-pay status. Cancelling is at the
       mandate (Razorpay e-mail, bank / UPI app), never a button here. Id 'purchases', not 'plan' (#plan is an old
       billing anchor that redirects to purchase.html). */
    tabPane('purchases', 'Plan & purchases', 'You', [renderPlanCard(), renderAutopay(), renderPlanContents()], { icon: 'payments', hint: 'Your plan, auto-pay and what the plan opens.' }),
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

  const tHost = document.getElementById('myTestimonials');
  if (tHost) import('../ui/testimonial-prompt.js').then((m) => m.mountMyTestimonials(tHost)).catch(() => { /* §59 absent or offline: nothing to list */ });

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

/* The open film's region: a click only, never on load (verify's
   idle-write check). No reload: the film's paperwork is read when it
   is printed, and src/ui/india-content.js re-reads the India-only switch
   on the `region:project` notice, so a redraw of this page is enough. */
delegate(document, 'click', '[data-project-region-choice]', (e, el) => {
  const want = el.getAttribute('data-project-region-choice');
  const after = setFilmRegion(want);
  if (!after) { StudioUI.toastError('The film’s region could not be changed.'); return; }
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
  'drive-restore':  () => run('drive-restore', () => openRestorePreview('head', null, 'The backup in Drive')),
  'drive-versions': () => run('drive-versions', async () => {
    if (versions) { versions = null; return; }
    versions = await DriveSync.listVersions();
  }),
  'drive-disconnect': async () => {
    if (!await ask({
      title: 'Stop syncing to Drive from this browser?',
      body: 'The file in your Drive is not deleted and nothing you have written is touched.',
      confirm: 'Stop syncing'
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
        confirm: 'Replace', danger: true
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
    confirm: 'Use built-in'
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
    setUsageCounting(el.checked);
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
      confirm: 'Turn off'
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
Store.subscribe('cloud:status', () => { if (!busy) render(); });
/* The Drive section reads the plan's drive_backup, which arrives later. */
Store.subscribe('plan:changed', () => { dropUsage(); if (!busy) render(); });
refreshGate();

render();
