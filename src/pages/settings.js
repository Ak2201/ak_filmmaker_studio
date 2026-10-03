/* ============================================================
   SETTINGS — the things that belong to this DEVICE, not the film
   ------------------------------------------------------------
   Everything on this page is per-device and per-browser. Nothing
   here is part of a project, nothing here is in a backup file, and
   nothing here syncs. That is the line the page is drawn along: the
   hub owns projects and backups, and this owns the small set of
   choices that follow the machine rather than the work.

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
    'Projects, the full-studio backup and Reset everything are on ',
    h('a', { href: 'index.html', text: 'Home' }),
    ', because all three are about the work rather than about this device. '
    + 'Signing in for cloud sync is the pill in the bar at the top of every '
    + 'page, this one included.'
  ]));
  return sec;
}

/* ---- render -------------------------------------------------- */
function render() {
  const main = h('main#main');

  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio' }),
    h('h1.bd-title', { text: 'Settings.' }),
    h('p.bd-deck', {
      text: 'Two things belong to this browser rather than to any film: the API '
          + 'key the model-backed tools use, and how the studio looks. Both were '
          + 'reachable only from inside whichever page happened to carry the '
          + 'control. Neither one is in a project, a backup, or the cloud.'
    })
  ]));

  const body = h('div.st-body');
  body.append(renderKey(), renderAppearance(), renderElsewhere());
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

render();
