/* ============================================================
   NO NATIVE DIALOGS
   ------------------------------------------------------------
   Owner, 11 Oct 2026: "all pops should be used inside app only, not
   with browser". The browser's confirm() / alert() / prompt() is a grey
   system box that names the host, cannot be themed and blocks the page.
   Every question the app asks goes through src/ui/dialog.js — ask(),
   askDanger(), tell(), askText().

   This parses every file in src/ (acorn, no browser) and fails on a call
   to confirm / alert / prompt — bare, or through window / globalThis /
   self — unless the name is a parameter or local declaration of the
   enclosing code (an injected `confirm` callback is not the browser's).

   ALLOWLIST — deliberate exceptions, each with its reason. Empty today:
   the one native prompt the web platform insists on, the beforeunload
   "leave site?" box, is not a confirm() call at all (it is set through
   the event's returnValue, and no code here asks for it that way), so
   nothing needs an entry. Add an entry as 'path:name' with a reason —
   never as a way to silence a new call.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const acorn = require('acorn');

const ALLOW = {
  // 'src/example.js:confirm': 'reason',
};
const NAMES = new Set(['confirm', 'alert', 'prompt']);
const HOSTS = new Set(['window', 'globalThis', 'self']);

function files(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(p));
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

/* Names declared anywhere in the file (params, let/const/var, functions,
   destructured). Coarse on purpose: a file that declares `confirm` is
   calling its own. */
function declared(ast) {
  const names = new Set();
  const pat = (n) => {
    if (!n) return;
    if (n.type === 'Identifier') names.add(n.name);
    else if (n.type === 'ObjectPattern') n.properties.forEach((p) => pat(p.value || p.argument));
    else if (n.type === 'ArrayPattern') n.elements.forEach(pat);
    else if (n.type === 'AssignmentPattern') pat(n.left);
    else if (n.type === 'RestElement') pat(n.argument);
  };
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (/Function/.test(n.type)) { (n.params || []).forEach(pat); if (n.id) pat(n.id); }
    if (n.type === 'VariableDeclarator') pat(n.id);
    if (n.type === 'CatchClause') pat(n.param);
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(ast);
  return names;
}

const bad = [];
let scanned = 0;
for (const f of files('src')) {
  scanned++;
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
  catch (e) { bad.push(`${f}: will not parse — ${e.message}`); continue; }
  const own = declared(ast);
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression') {
      const c = n.callee;
      let name = null;
      if (c.type === 'Identifier' && NAMES.has(c.name) && !own.has(c.name)) name = c.name;
      else if (c.type === 'MemberExpression' && !c.computed && c.object.type === 'Identifier'
        && HOSTS.has(c.object.name) && NAMES.has(c.property.name)) name = c.property.name;
      if (name && !ALLOW[`${f}:${name}`]) bad.push(`${f}:${n.loc.start.line}  native ${name}() — use src/ui/dialog.js`);
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(ast);
}

if (bad.length) {
  for (const b of bad) console.log('✗ ' + b);
  console.log(`\ndialogs: ${bad.length} problem(s) in ${scanned} files`);
  process.exit(1);
}
console.log(`✓ dialogs: ${scanned} files, no native confirm / alert / prompt`);
