/* ============================================================
   RESTORE PREVIEW — what a backup holds, beside what is here now
   ------------------------------------------------------------
   Drawn BEFORE the confirmation, never instead of it: the panel
   carries the buttons, and the button that restores still goes
   through ask() in src/ui/dialog.js. This module draws and decides
   nothing — the counts come from summariseBackup() and the
   replace / add / leave-alone split from compareForRestore(), both
   in src/lib/backup.js, which own the format and mirror the applier.

   Read-only and stateless: it builds a node from two summaries and
   writes nothing anywhere. Buttons carry `data-action` for the
   page's delegated handler (CSP: no inline handlers).
   ============================================================ */
import { h } from '../lib/dom.js';

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const FORMATS = { feature: 'Feature', short: 'Short' };
const formatLabel = (f) => FORMATS[f] || (f ? String(f).charAt(0).toUpperCase() + String(f).slice(1) : 'Feature');

/** "3 scenes · 120 pages · 2 contacts" — pages only when known. */
export function countsLine(c) {
  const parts = [plural(c.scenes || 0, 'scene', 'scenes')];
  if (c.scriptPages != null) parts.push(plural(c.scriptPages, 'page', 'pages'));
  parts.push(plural(c.contacts || 0, 'contact', 'contacts'));
  return parts.join(' · ');
}

function totalsLine(s) {
  const t = s.totals;
  return plural(t.projects, 'project', 'projects') + ' · ' + countsLine({
    scenes: t.scenes, scriptPages: t.scriptPages, contacts: t.contacts
  });
}

/**
 * The sentences that say what a restore will do. Exported so the
 * confirmation dialog repeats exactly what the panel said.
 */
export function replaceSentences(plan, incoming) {
  const out = [];
  const names = (list) => list.map((p) => '"' + p.title + '"').join(', ');
  if (plan.replaces.length) {
    out.push('Replaces ' + plural(plan.replaces.length, 'project', 'projects') + ' in this browser with the backup’s copy: '
      + names(plan.replaces.map((r) => r.incoming)) + '. Wherever the backup holds a part of them — scenes, script, contacts, shots and so on — '
      + 'that part becomes what the backup holds, and anything newer here is not kept.');
  }
  if (plan.adds.length) {
    out.push('Adds ' + plural(plan.adds.length, 'project', 'projects') + ' this browser does not have yet: '
      + names(plan.adds) + '.');
  }
  if (!plan.replaces.length && !plan.adds.length) out.push('This backup holds no projects, so no project changes.');
  if (plan.keeps.length) {
    const one = plan.keeps.length === 1;
    out.push(plural(plan.keeps.length, 'project', 'projects') + (one ? ' that exists' : ' that exist')
      + ' only in this browser (' + names(plan.keeps) + ') ' + (one ? 'is' : 'are') + ' left alone.');
  }
  const also = [];
  if (incoming && incoming.hasPrefs) also.push('your studio preferences (theme, writing settings, tour progress)');
  if (incoming && incoming.notes) also.push('your saved notes');
  if (also.length) out.push('It also sets ' + also.join(' and ') + ' to the backup’s.');
  return out;
}

/**
 * @param {object} o
 *   plan        compareForRestore(incoming, current)
 *   incoming    summariseBackup(file)
 *   current     summariseBackup(buildBackup())
 *   source      'The backup in Drive' / 'The version saved on 3 Oct …'
 *   savedAt     preformatted date of the file, or ''
 *   actions     { confirm, cancel, download } — data-action names
 *   confirmLabel, disabled
 */
export function restorePreview(o) {
  const { plan, incoming, current } = o;
  const act = o.actions;
  const root = h('section.st-restore', { role: 'region', 'aria-labelledby': 'stRestoreH', tabindex: '-1' });

  root.append(h('h3.st-restore-h#stRestoreH', { text: 'Check before you restore' }));
  root.append(h('p.st-restore-p', {
    text: o.source + (o.savedAt ? ', saved ' + o.savedAt : '') + '. Nothing has changed yet — this is only what it holds.'
  }));

  /* The two totals, side by side — a quick read of "is this the one I want". */
  root.append(h('div.st-restore-sides', {}, [
    h('div.st-restore-side', {}, [
      h('span.st-restore-label', { text: 'In the backup' }),
      h('span.st-restore-figure', { text: totalsLine(incoming) })
    ]),
    h('div.st-restore-side', {}, [
      h('span.st-restore-label', { text: 'In this browser now' }),
      h('span.st-restore-figure', { text: totalsLine(current) })
    ])
  ]));

  if (incoming.projects.length) {
    const byId = new Map(plan.replaces.map((r) => [r.incoming.id, r]));
    const ul = h('ul.st-restore-rows');
    incoming.projects.forEach((p) => {
      const hit = byId.get(p.id);
      ul.append(h('li' + (hit ? '.is-replace' : '.is-add'), {}, [
        h('span.st-restore-name', {}, [
          h('strong', { text: p.title }),
          h('span.st-restore-fmt', { text: formatLabel(p.format) })
        ]),
        h('span.st-restore-counts', { text: 'Backup: ' + countsLine(p) }),
        hit
          ? h('span.st-restore-fate', { text: 'Replaces your copy (now ' + countsLine(hit.current) + ')' })
          : h('span.st-restore-fate', { text: 'Added — this browser does not have it' })
      ]));
    });
    root.append(ul);
  }
  if (plan.keeps.length) {
    root.append(h('p.st-restore-keep', {
      text: 'Stays as it is (not in the backup): ' + plan.keeps.map((p) => p.title).join(', ') + '.'
    }));
  }

  /* WHAT RESTORING REPLACES — said in words, in the warning family. */
  const warn = h('div.st-restore-warn', { role: 'note' });
  warn.append(h('p.st-restore-warn-h', { text: 'What restoring replaces' }));
  replaceSentences(plan, incoming).forEach((t) => warn.append(h('p.st-restore-warn-p', { text: t })));
  warn.append(h('p.st-restore-warn-p', {
    text: 'The file in Drive is not changed by a restore. Unsure? Download this browser’s backup first.'
  }));
  root.append(warn);

  root.append(h('div.st-drive-actions', {}, [
    h('button.btn.primary', { type: 'button', 'data-action': act.confirm, disabled: o.disabled ? true : null, text: o.confirmLabel || 'Restore this backup…' }),
    h('button.btn', { type: 'button', 'data-action': act.download, disabled: o.disabled ? true : null, text: 'Download this browser’s backup first' }),
    h('button.btn', { type: 'button', 'data-action': act.cancel, disabled: o.disabled ? true : null, text: 'Cancel' })
  ]));
  return root;
}

export default { restorePreview, replaceSentences, countsLine };
