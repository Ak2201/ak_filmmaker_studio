/* ============================================================
   THE LAYER BOUNDARY — the screen and the logic stay apart
   ------------------------------------------------------------
   docs/ARCHITECTURE.md is the long form. In one breath:

     src/lib/            LOGIC   models, storage, cloud, derivations
     src/ui/, src/pages/ VIEW    builds the screen, wires events,
                                 asks src/lib/ for everything else

   The point is that the UI can be replaced — restyled, re-laid out,
   rewritten in another framework — without touching how a film's data
   is kept. That only holds if the view never learns HOW data is kept,
   so this file fails the run when it does:

     view   V1  touches localStorage / sessionStorage / indexedDB
            V2  talks to the backend itself: imports @supabase, calls
                ensureClient(), .rpc(), or fetches /rest/v1 or
                /functions/v1
            V3  imports store.js's raw readers (rawGet/rawSet/…), which
                bypass the project proxy

     logic  L1  imports anything from src/ui/ or src/pages/ (it asks a
                port instead: src/lib/ports.js)
            L2  touches `document` without being a named BROWSER
                ADAPTER below

   No browser is needed — like test:undef, nothing can hide from it.
   It parses every file with acorn and reads the tree, so a comment or
   a string that MENTIONS localStorage is not a violation.

   `--list` prints every hit with its line, for whoever is fixing them.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd();
const LIST = process.argv.includes('--list');

/* BROWSER ADAPTERS. Logic modules whose whole job is a browser facility
   — the storage proxy, the cloud client, a PDF or file export, the
   page veil, the motion layer. They may touch `document`; they still
   may not import the view (L1). Adding a file here is a deliberate act:
   a new model that wants the DOM is usually a view that has been put in
   the wrong folder. Each line says why. */
const ADAPTERS = new Map(Object.entries({
  'src/lib/store.js': 'the storage proxy; flushes on page lifecycle events',
  'src/lib/autosave.js': 'flushes pending writes on visibility / change events',
  'src/lib/dom.js': 'the h() builder and delegate() — the view\'s toolkit',
  'src/lib/cloud.js': 'the cloud client; stamps sync state on <html>',
  'src/lib/sitegate.js': 'the site gate veils the document until it answers',
  'src/lib/plan-gate.js': 'draws the plan wall over a page',
  'src/lib/skin.js': 'reads skins from the CSSOM',
  'src/lib/lang.js': 'swaps the page language in place',
  'src/lib/motion.js': 'the motion layer (startlib)',
  'src/lib/motion-landing.js': 'the landing page\'s motion',
  'src/lib/billing.js': 'loads the Razorpay checkout script',
  'src/lib/drive.js': 'loads Google Identity Services',
  'src/lib/drive-picker.js': 'loads the Google Picker script (a click, drive-only storage)',
  'src/lib/drive-project-sync.js': 'drive-only sync: flushes on pagehide / hidden, pulls on visible',
  'src/lib/backup.js': 'downloads the backup file',
  'src/lib/pdf.js': 'prints through a document',
  'src/lib/invoice-pdf.js': 'prints the invoice',
  'src/lib/ready-pdf.js': 'prints the readiness sheet',
  'src/lib/story-io.js': 'downloads / reads a story file',
  'src/lib/watermark.js': 'stamps a printed page',
  'src/lib/pitch-deck.js': 'builds the deck\'s slides',
  'src/lib/usage.js': 'counts active time from visibility',
  'src/lib/studies.js': 'reads the page language',
}));

const isView = (rel) => rel.startsWith('src/ui/') || rel.startsWith('src/pages/');
const isLogic = (rel) => rel.startsWith('src/lib/');

function walkDir(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, out);
    else if (/\.m?js$/.test(e.name)) out.push(p);
  }
  return out;
}

/* A tiny generic walker: every node, with its parent. */
function visit(node, fn, parent = null) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent);
  for (const k in node) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) for (const c of v) { if (c && typeof c.type === 'string') visit(c, fn, node); }
    else if (v && typeof v.type === 'string') visit(v, fn, node);
  }
}

const STORAGE = new Set(['localStorage', 'sessionStorage', 'indexedDB']);
const RAW = new Set(['rawGet', 'rawSet', 'rawRemove', 'rawKeys']);
const BACKEND_URL = /\/(rest|functions)\/v1\b/;

const hits = [];
const hit = (rel, rule, line, what) => hits.push({ rel, rule, line, what });

function strOf(n) {
  if (!n) return '';
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral') return n.quasis.map((q) => q.value.cooked).join('${}');
  if (n.type === 'BinaryExpression' && n.operator === '+') return strOf(n.left) + strOf(n.right);
  return '';
}

for (const file of walkDir(path.join(ROOT, 'src'))) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  const view = isView(rel), logic = isLogic(rel);
  if (!view && !logic) continue;
  let ast;
  try {
    ast = acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowAwaitOutsideFunction: true });
  } catch (e) { console.error(`✗ ${rel}: does not parse — ${e.message}`); process.exitCode = 1; continue; }

  const sources = [];   // [source, line]
  visit(ast, (n, parent) => {
    const line = n.loc && n.loc.start.line;
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source) {
      sources.push([n.source.value, line, n]);
    }
    if (n.type === 'ImportExpression') { const s = strOf(n.source); if (s) sources.push([s, line, n]); }

    if (view) {
      // V1: the storage globals, read as an identifier (not as a property name or a key in an object).
      if (n.type === 'Identifier' && STORAGE.has(n.name)) {
        const asProp = parent && parent.type === 'MemberExpression' && parent.property === n && !parent.computed;
        const asKey = parent && parent.type === 'Property' && parent.key === n && !parent.computed;
        if (!asProp && !asKey) hit(rel, 'V1', line, n.name);
      }
      // window.localStorage / globalThis.localStorage
      if (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && STORAGE.has(n.property.name)
          && n.object.type === 'Identifier' && (n.object.name === 'window' || n.object.name === 'globalThis' || n.object.name === 'self')) {
        hit(rel, 'V1', line, n.object.name + '.' + n.property.name);
      }
      // V2: ensureClient() / x.rpc() / client.from()… the client's own surface.
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed) {
        const m = n.callee.property.name;
        if (m === 'ensureClient' || m === 'rpc') hit(rel, 'V2', line, '.' + m + '()');
      }
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'ensureClient') hit(rel, 'V2', line, 'ensureClient()');
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'fetch') {
        const u = strOf(n.arguments[0]);
        if (BACKEND_URL.test(u)) hit(rel, 'V2', line, 'fetch ' + u.slice(0, 40));
        else if (n.arguments[0] && n.arguments[0].type === 'CallExpression') {
          // fetch(String(cfg.url)… + '/rest/v1/…')
          let found = '';
          visit(n.arguments[0], (c) => { const s = strOf(c); if (BACKEND_URL.test(s)) found = s; });
          if (found) hit(rel, 'V2', line, 'fetch …' + found.slice(0, 40));
        }
      }
    }
    if (logic && !ADAPTERS.has(rel)) {
      if (n.type === 'Identifier' && n.name === 'document') {
        const asProp = parent && parent.type === 'MemberExpression' && parent.property === n && !parent.computed;
        const asKey = parent && parent.type === 'Property' && parent.key === n && !parent.computed;
        if (!asProp && !asKey) hit(rel, 'L2', line, 'document');
      }
    }
  });

  for (const [src, line, node] of sources) {
    if (view) {
      if (src.startsWith('@supabase/')) hit(rel, 'V2', line, 'import ' + src);
      if (/(^|\/)store\.js$/.test(src) && node.specifiers) {
        for (const sp of node.specifiers) {
          const nm = sp.imported ? (sp.imported.name || sp.imported.value) : '';
          if (RAW.has(nm)) hit(rel, 'V3', line, 'import ' + nm);
        }
      }
    }
    if (logic && src.startsWith('.')) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), src));
      if (target.startsWith('src/ui/') || target.startsWith('src/pages/')) hit(rel, 'L1', line, 'imports ' + target);
    }
  }
}

/* ---- report ---------------------------------------------------- */
const RULES = {
  V1: 'view touches browser storage — ask a src/lib/ model',
  V2: 'view talks to the backend — go through src/lib/ (cloud-api.js)',
  V3: 'view imports a raw storage reader — ask a src/lib/ model',
  L1: 'logic imports the view — use a port (src/lib/ports.js)',
  L2: 'logic touches the DOM and is not a named browser adapter',
};
const byRule = {};
for (const h of hits) (byRule[h.rule] ||= []).push(h);

if (LIST || hits.length) {
  for (const r of Object.keys(RULES)) {
    const list = byRule[r];
    if (!list) continue;
    console.log(`\n${r}  ${RULES[r]}  (${list.length})`);
    for (const h of list) console.log(`   ${h.rel}:${h.line}  ${h.what}`);
  }
}

const stale = [...ADAPTERS.keys()].filter((f) => !fs.existsSync(path.join(ROOT, f)));
if (stale.length) { console.error(`\n✗ ADAPTERS names files that no longer exist: ${stale.join(', ')}`); process.exitCode = 1; }

if (hits.length) {
  console.error(`\n✗ layers: ${hits.length} boundary violation(s). See docs/ARCHITECTURE.md.`);
  process.exitCode = 1;
} else if (!process.exitCode) {
  console.log('✓ layers: the view reaches no storage and no backend; the logic imports no view.');
}
