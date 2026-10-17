/* ============================================================
   PRE-PRODUCTION MODEL — the page's words and order, no DOM
   ------------------------------------------------------------
   src/lib/preprod-path.js derives the steps and src/lib/readiness.js
   the checks; src/pages/preprod.js draws them. What sits between —
   the menu's groups, which step a hash names, the order the checks
   are listed in and the sentences that go with them — is here, and
   stores nothing.
   ============================================================ */
import { nextStep } from './preprod-path.js';

export const STATE_WORD = { done: 'Done', doing: 'In progress', todo: 'Not started' };
export const STATE_TONE = { done: 'ok', doing: 'warn', todo: null };

/* One mark per step, all in src/data/section-icons.json. */
export const ICON = {
  script: 'description', scenes: 'view_list', breakdown: 'label', vision: 'palette', shots: 'format_list_numbered',
  people: 'groups', places: 'place', songs: 'music_note', budget: 'currency_rupee', schedule: 'calendar_month',
  sheets: 'content_cut', ready: 'fact_check'
};

/* The menu's item ids are the PANELS' element ids (step-<id>), which is
   what a row's aria-controls has to be; the page's own ids (#<id> in the
   address bar, the Fix links, the footer's Back/Next) stay bare. */
export const panelId = (id) => 'step-' + id;
export const bareId = (pid) => String(pid).replace(/^step-/, '');

/** The steps as the section menu's groups, consecutive steps of one
    group together. */
export function menuGroups(steps) {
  const groups = [];
  for (const s of steps) {
    const label = s.group || '';
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
    g.items.push({
      id: panelId(s.id), label: s.label, icon: ICON[s.id] || '', done: s.state === 'done', doing: s.state === 'doing',
      hint: STATE_WORD[s.state] + '. ' + s.about
    });
  }
  return groups;
}

/** The step a hash (without its '#', decoded) names, else the next
    step to do, else the first. */
export function resolveStep(steps, hash) {
  const want = String(hash || '').replace(/^step-/, '');
  const hit = steps.find((s) => s.id === want);
  const next = nextStep(steps);
  return hit ? hit.id : (next ? next.id : (steps[0] || {}).id);
}

/** The checks in reading order: blockers, then gaps, then what passes.
    A copy; the input is untouched. */
export function sortedChecks(checks) {
  const order = (c) => (c.passed ? 2 : c.severity === 'blocker' ? 0 : 1);
  return checks.slice().sort((a, b) => order(a) - order(b));
}

/** A check's class, mark and words, for one row of the list. */
export function checkRow(c) {
  return {
    cls: c.passed ? 'is-ok' : c.severity === 'blocker' ? 'is-blocker' : 'is-gap',
    mark: c.passed ? '✓' : c.severity === 'blocker' ? '✕' : '!',
    markLabel: c.passed ? 'passes' : c.severity,
    title: c.label + (c.count ? ' (' + c.count + ')' : ''),
    hint: c.passed ? '' : c.hint + (c.items.length ? ' — ' + c.items.slice(0, 4).join('; ') + (c.items.length > 4 ? '; …' : '') : ''),
    href: c.where || 'dashboard.html#readiness'
  };
}

/** "3 of 12 steps done · next: Budget" */
export function summaryText(done, total, next) {
  return done + ' of ' + total + ' steps done' + (next && next.id !== 'ready' ? ' · next: ' + next.label : '');
}

export default { STATE_WORD, STATE_TONE, ICON, panelId, bareId, menuGroups, resolveStep, sortedChecks, checkRow, summaryText };
