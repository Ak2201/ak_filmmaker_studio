/* ============================================================
   AI BATCHES — a long draft as small requests, a few at a time
   ------------------------------------------------------------
   One request for every scene is one long wait and one reply that can
   be cut off at the ceiling. Small batches run side by side finish
   sooner, show the first scene while the last is still being written,
   and lose only themselves when one fails.

   PURE: it knows nothing about a model, a key or a page. `run(batch)`
   is whatever sends one batch; this decides how many are in flight,
   when the next may start, what a failure costs, and what Stop keeps.

   WARM FIRST. Every batch of a run shares one prefix (the system
   prompt, the schema, the run's `shared` context), and a prompt cache
   only helps a request that starts AFTER the prefix was written. So
   batch 0 goes alone, and the rest are released the moment it streams
   its first text (the prefix is in the cache by then) or settles,
   whichever comes first.

   NOTHING RUNS ON ITS OWN: it is reachable from a press, never from a
   timer, and an abort starts nothing new.
   ============================================================ */

export const batchesOf = (jobs, size) => {
  const n = Math.max(1, Math.floor(Number(size)) || 1);
  const list = Array.isArray(jobs) ? jobs : [];
  const out = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
};

const isAbort = (e) => !!(e && (e.kind === 'aborted' || e.code === 'aborted' || e.name === 'AbortError'));
const retryable = (e) => !!(e && (e.kind === 'rate' || e.kind === 'overloaded'));

/** Wait `ms`, or until `signal` aborts (then resolve early; the caller
 *  looks at the signal). */
const nap = (ms, signal) => new Promise((resolve) => {
  if (signal && signal.aborted) { resolve(); return; }
  const t = setTimeout(wake, ms);
  function wake() { clearTimeout(t); if (signal) signal.removeEventListener('abort', wake); resolve(); }
  if (signal) signal.addEventListener('abort', wake, { once: true });
});

/**
 * run(batch, { signal, onItems, onStart, index }) → Promise<{ items, truncated, model }>
 *   onItems(items[]) — finished items, as they parse
 *   onStart()        — the batch's first text has streamed (releases the rest)
 * Resolves { items, failed: [{ index, jobs, error }], truncated, model, stopped }.
 * `items` is in JOB order whatever order the batches finished in; a
 * batch that failed or was stopped keeps the items it had already shown.
 */
export async function runBatches(jobs, {
  size, concurrency = 3, run, onItems, onBatch, signal,
  warmFirst = true, retryRate = 1, retryDelayMs = 8000
} = {}) {
  const batches = batchesOf(jobs, size);
  const total = batches.length;
  if (total === 0) return { items: [], failed: [], truncated: false, model: '', stopped: false };
  const st = batches.map(() => ({ final: null, shown: [], error: null, tries: 0 }));
  const aborted = () => !!(signal && signal.aborted);
  let limit = Math.max(1, Math.floor(Number(concurrency)) || 1);
  let next = 0;
  let inflight = 0;
  let okCount = 0;
  let released = !warmFirst || total <= 1;
  let finish;
  const done = new Promise((r) => { finish = r; });

  const check = () => { if (inflight === 0 && (next >= total || aborted())) finish(); };
  const release = () => { if (!released) { released = true; pump(); } };

  async function attempt(i) {
    const s = st[i];
    for (;;) {
      s.tries++;
      try {
        const r = await run(batches[i], {
          signal, index: i,
          onStart: () => { if (i === 0) release(); },
          onItems: (items) => {
            if (aborted()) return;
            const list = [].concat(items || []).filter(Boolean);
            if (!list.length) return;
            s.shown.push(...list);
            if (i === 0) release();
            if (onItems) { try { onItems(list, i); } catch (e) { /* UI */ } }
          }
        });
        s.final = r || { items: [] };
        okCount++;
        return;
      } catch (e) {
        if (aborted() || isAbort(e)) return;
        if (retryable(e) && s.tries <= retryRate) {
          limit = 1;                       // the provider is pushing back: one at a time now
          s.shown = [];
          await nap(retryDelayMs, signal);
          if (aborted()) return;
          continue;
        }
        s.error = e;
        return;
      }
    }
  }

  function launch(i) {
    inflight++;
    attempt(i).then(() => {
      inflight--;
      if (i === 0) released = true;
      if (onBatch && !aborted()) {
        try { onBatch({ done: okCount, total, failed: st.filter((x) => x.error).length }); } catch (e) { /* UI */ }
      }
      pump();
    });
  }

  function pump() {
    if (!aborted()) {
      if (released) { while (inflight < limit && next < total) launch(next++); }
      else if (next === 0) launch(next++);   // batch 0, alone
    }
    check();
  }

  if (signal) signal.addEventListener('abort', check, { once: true });
  pump();
  await done;

  const items = [];
  const failed = [];
  let truncated = false;
  let model = '';
  st.forEach((s, i) => {
    if (s.final) {
      items.push(...(Array.isArray(s.final.items) ? s.final.items : []));
      if (s.final.truncated) truncated = true;
      if (s.final.model) model = s.final.model;
    } else {
      items.push(...s.shown);
      if (s.error) failed.push({ index: i, jobs: batches[i], error: s.error });
    }
  });
  const stopped = aborted();

  /* Every batch refused the same way and the cause is the key, not the
     batch: say that once, as the error, instead of N identical failures. */
  if (!stopped && failed.length === total) {
    const k = failed[0].error && failed[0].error.kind;
    if ((k === 'auth' || k === 'nokey') && failed.every((f) => f.error && f.error.kind === k)) throw failed[0].error;
  }
  return { items, failed, truncated, model, stopped };
}

export default { runBatches, batchesOf };
