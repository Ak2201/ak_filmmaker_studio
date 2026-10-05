/* ============================================================
   NODE SEAMS — run browser-side lib modules under plain Node
   ------------------------------------------------------------
   Imported FIRST by the Node tests (test-story, test-screenplay).
   Replaces exactly two things and nothing else:
     - src/lib/store.js, which patches Storage.prototype for the
       browser, becomes an empty module;
     - a `.json` import is served as an ES module, the way Vite
       serves it.
   localStorage becomes an in-memory Map, exported as `mem` so a test
   can inspect or corrupt what was written.
   ============================================================ */
import { register } from 'node:module';

register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js')
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) {
      const { readFileSync } = await import('node:fs');
      const src = readFileSync(new URL(url), 'utf8');
      return { format: 'module', source: 'export default ' + src, shortCircuit: true };
    }
    return next(url, ctx);
  }
`), import.meta.url);

export const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
