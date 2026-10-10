/* ============================================================
   AN IDENTIFIER THAT IS USED AND NEVER DECLARED
   ------------------------------------------------------------
   Added 11 Oct 2026, after one of these reached production and broke
   the only way into the app.

   WHAT HAPPENED. Wave 3 deleted `const HEADS = 'main h2';` from
   `src/ui/motion-app.js` and left its one use, `pick(root, HEADS)`,
   behind. `motion-app.js` is in the CORE chunk, imported by
   chrome.js, so every page threw `ReferenceError: HEADS is not
   defined` — and the throw landed inside cloud.js's `await
   import('@supabase/supabase-js')`, so the Supabase client was never
   built. No client, no session; the site gate read that as "signed
   out" and sent the visitor to the landing page. The report was
   "Google login is not working", and it was: nobody could sign in to
   the live site.

   WHY NOTHING CAUGHT IT, which is the part worth keeping. Every
   browser check in this repo runs under Playwright, and
   `motion-app.js` opens with

       const WANT = … && !navigator.webdriver && …

   Playwright sets `navigator.webdriver`. The whole motion layer is
   therefore INERT under `verify` and every `prove:*`, by design — so
   `verify` passed all 21 pages, `prove:gate` 120, `prove:growth` 78
   and `prove:billing` 186, all green, against code that crashed on
   the first real page load. A bug in motion is invisible to the gate
   by construction. This file is the compensating control: it needs no
   browser, so `navigator.webdriver` cannot hide anything from it.

   WHAT IT IS AND IS NOT. This is deliberately a FILE-level check, not
   a scope-accurate one: a name declared anywhere in the file counts
   as declared everywhere in it. That under-reports (a genuine
   block-scope mistake slips through) and almost never cries wolf,
   which is the trade a check in the ship path should make. It is not
   a linter and is not trying to become one.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import * as acorn from 'acorn';

const ROOT = process.cwd();
const DIRS = ['src'];

/* Things the browser, the platform and the bundler provide. Anything
   genuinely global that is NOT here will be reported, which is the
   right default: adding a name to this list should be a deliberate
   act, the same as adding a word to verify's EXPECTED. */
const GLOBALS = new Set([
  // language
  'globalThis', 'undefined', 'NaN', 'Infinity', 'Object', 'Array', 'String', 'Number', 'Boolean',
  'Symbol', 'BigInt', 'Math', 'JSON', 'Date', 'RegExp', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'ReferenceError', 'EvalError', 'URIError', 'AggregateError', 'Promise', 'Proxy',
  'Reflect', 'Map', 'Set', 'WeakMap', 'WeakSet', 'WeakRef', 'ArrayBuffer', 'SharedArrayBuffer',
  'DataView', 'Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array',
  'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'decodeURI', 'decodeURIComponent',
  'encodeURI', 'encodeURIComponent', 'escape', 'unescape', 'eval', 'Intl', 'Atomics', 'FinalizationRegistry',
  // DOM and browser
  'window', 'document', 'navigator', 'location', 'history', 'screen', 'localStorage',
  'sessionStorage', 'indexedDB', 'caches', 'crypto', 'console', 'performance', 'customElements',
  'alert', 'confirm', 'prompt', 'fetch', 'Request', 'Response', 'Headers', 'FormData', 'Blob',
  'File', 'FileReader', 'URL', 'URLSearchParams', 'TextEncoder', 'TextDecoder', 'AbortController',
  'AbortSignal', 'Event', 'CustomEvent', 'EventTarget', 'MessageChannel', 'MessagePort',
  'BroadcastChannel', 'Worker', 'WebSocket', 'XMLHttpRequest', 'DOMParser', 'XMLSerializer',
  'MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone',
  'matchMedia', 'getComputedStyle', 'scrollTo', 'scrollBy', 'open', 'close', 'print', 'btoa', 'atob',
  'innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'scrollX', 'scrollY', 'devicePixelRatio',
  'Image', 'Audio', 'Option', 'Node', 'Element', 'HTMLElement', 'HTMLCanvasElement', 'HTMLInputElement',
  'DocumentFragment', 'Range', 'Selection', 'CSS', 'Notification', 'Intl',
  'getSelection', 'isSecureContext', 'origin', 'top', 'parent', 'self', 'frames', 'name',
  'addEventListener', 'removeEventListener', 'dispatchEvent', 'postMessage', 'focus', 'blur',
  'NodeFilter', 'DecompressionStream', 'CompressionStream', 'ReadableStream', 'WritableStream',
  'HashChangeEvent', 'PopStateEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'DragEvent',
  'TransformStream', 'MediaQueryList', 'getSelection', 'speechSynthesis', 'visualViewport',
  /* THIS APP's OWN globals, set on window on purpose and read without
     an import: cloud.js assigns window.StudioCloud (sitegate.js's
     comment explains why it is a global rather than an import), and
     chrome.js assigns window.StudioUI. Both are deliberate. */
  'StudioCloud', 'StudioUI', 'StudioStore',
  // workers / extension surface this codebase touches
  'self', 'chrome', 'clients', 'skipWaiting', 'importScripts', 'ServiceWorkerGlobalScope',
  // build-time
  'process', '__dirname', '__filename', 'require', 'module', 'exports', 'Buffer'
]);

const files = [];
const walkDir = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkDir(p);
    else if (e.name.endsWith('.js')) files.push(p);
  }
};
for (const d of DIRS) walkDir(path.join(ROOT, d));
files.sort();

/* ---- collect bound names, anywhere in the file ---- */
function bindPattern(node, out) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier': out.add(node.name); break;
    case 'ObjectPattern': node.properties.forEach((p) =>
      bindPattern(p.type === 'RestElement' ? p.argument : p.value, out)); break;
    case 'ArrayPattern': node.elements.forEach((el) => bindPattern(el, out)); break;
    case 'AssignmentPattern': bindPattern(node.left, out); break;
    case 'RestElement': bindPattern(node.argument, out); break;
    default: break;
  }
}

/* A hand-rolled walk: acorn-walk is not installed and the node set
   here is small enough that naming it is clearer than a dependency. */
function visit(node, fn, parent) {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, fn, node));
    else if (v && typeof v.type === 'string') visit(v, fn, node);
  }
}

let failures = 0, scanned = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, allowAwaitOutsideFunction: true });
  } catch (e) {
    console.log(`✗ ${path.relative(ROOT, file)}: will not parse — ${e.message}`);
    failures++; continue;
  }
  scanned++;

  const declared = new Set();
  visit(ast, (n) => {
    switch (n.type) {
      case 'VariableDeclarator': bindPattern(n.id, declared); break;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        if (n.id) declared.add(n.id.name);
        n.params.forEach((p) => bindPattern(p, declared));
        break;
      case 'ClassDeclaration': case 'ClassExpression': if (n.id) declared.add(n.id.name); break;
      case 'CatchClause': bindPattern(n.param, declared); break;
      case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': case 'ImportSpecifier':
        declared.add(n.local.name); break;
      case 'LabeledStatement': declared.add(n.label.name); break;
      default: break;
    }
  });

  /* references: an Identifier that is actually read */
  const bad = new Map();
  visit(ast, (n, parent) => {
    if (!n || n.type !== 'Identifier' || !parent) return;
    if (parent.type === 'MetaProperty') return;   // import.meta
    // property access `a.b` — `b` is not a reference
    if (parent.type === 'MemberExpression' && parent.property === n && !parent.computed) return;
    // `{ b: 1 }` — the key is not a reference
    if (parent.type === 'Property' && parent.key === n && !parent.computed && !parent.shorthand) return;
    // declarations, params, labels, imports/exports are bindings not reads
    if (parent.type === 'VariableDeclarator' && parent.id === n) return;
    if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression'
      || parent.type === 'ArrowFunctionExpression' || parent.type === 'ClassDeclaration'
      || parent.type === 'ClassExpression') && (parent.id === n || (parent.params || []).includes(n))) return;
    if (parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier'
      || parent.type === 'ImportSpecifier' || parent.type === 'ExportSpecifier') return;
    if (parent.type === 'CatchClause' && parent.param === n) return;
    if (parent.type === 'LabeledStatement' || parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return;
    if (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') { if (parent.key === n) return; }
    // patterns are bindings
    if (parent.type === 'ObjectPattern' || parent.type === 'ArrayPattern'
      || parent.type === 'RestElement' || parent.type === 'AssignmentPattern') return;
    if (parent.type === 'Property' && (parent.key === n || parent.value === n)
      && /Pattern$/.test(String(parent.__inPattern || ''))) return;

    if (declared.has(n.name) || GLOBALS.has(n.name)) return;
    if (!bad.has(n.name)) bad.set(n.name, n.loc.start.line);
  });

  if (bad.size) {
    failures++;
    for (const [name, line] of bad) {
      console.log(`✗ ${path.relative(ROOT, file)}:${line}  '${name}' is used and never declared or imported`);
    }
  }
}

if (failures) {
  console.log(`\nundeclared: ${failures} file(s) with a problem, out of ${scanned} scanned`);
  console.log("If a name really is a global the browser provides, add it to GLOBALS in this file —");
  console.log('deliberately, the way verify\'s EXPECTED is added to.');
  process.exit(1);
}
console.log(`✓ undeclared: ${scanned} files, no identifier used without being declared or imported`);
