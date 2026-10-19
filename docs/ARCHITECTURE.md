# Architecture — the screen and the logic are separate

Last reviewed: 2026-10-19 (checked: `test:layers` / `scripts/check-layers.mjs`, the four ports and their registering files, the `src/lib` models named below).

> Owner's goal (15 Oct 2026): **plug and play** — the UI can be changed, or
> replaced outright, without touching how a film's data is kept or how the
> backend is reached. `npm run test:layers` (`scripts/check-layers.mjs`) holds
> the line; it needs no browser and is part of `test:all`.

## The two layers

```
┌───────────────────────────────────────────────────────────────┐
│ VIEW      src/pages/*.js   one entry per page: render + events │
│           src/ui/**        shared screen pieces, the kit       │
│           src/styles/**    the look (tokens.css, skins/)       │
├────────────────── asks by function call only ─────────────────┤
│ LOGIC     src/lib/**       models, derivations, storage, cloud │
│           src/data/*.json  the content                         │
├───────────────────────────────────────────────────────────────┤
│ BACKEND   supabase/        schema, RLS, edge functions         │
└───────────────────────────────────────────────────────────────┘
```

**The view may:** build DOM, listen for events, hold in-memory view state (which
tab is open, what is being dragged), format a value for display, and call any
exported function in `src/lib/`.

**The view may not** (each is a rule `test:layers` fails on):

| Rule | What | Instead |
|---|---|---|
| V1 | touch `localStorage`, `sessionStorage` or `indexedDB` | call a model in `src/lib/` that owns the key |
| V2 | import `@supabase/*`, call `ensureClient()` / `.rpc()`, or fetch `/rest/v1` / `/functions/v1` | call a named function in `src/lib/` (built on `cloud-api.js`) |
| V3 | import `rawGet` / `rawSet` / `rawRemove` / `rawKeys` from `store.js` | the model does the raw read |

**The logic may not:**

| Rule | What | Instead |
|---|---|---|
| L1 | import anything from `src/ui/` or `src/pages/` | ask a **port** (below) |
| L2 | touch `document`, unless the file is a named *browser adapter* | return data and let the view draw it |

Browser adapters are the handful of logic modules whose job *is* a browser
facility — the storage proxy, the cloud client, PDF and file exports, the
site gate's veil, the motion layer. They are listed, each with its reason, in
`ADAPTERS` at the top of `scripts/check-layers.mjs`. Adding one is a
deliberate act; a new model that wants the DOM is usually a view in the wrong
folder.

## Where things go

- **A stored thing** (scenes, contacts, a page's notes, a UI preference that
  persists) → a model in `src/lib/` that owns its key names and exports
  `read…` / `save…` functions. Models are written on `src/lib/prefs.js`
  (`readText`, `writeJSON`, `session.*`…), which goes through the same
  `Storage.prototype` the app always used, so the project proxy in `store.js`
  scopes every key exactly as before.
- **A backend call** → a named function in `src/lib/` (e.g. `billing.js`,
  `gate.js`, `admin-api.js`) written on `src/lib/cloud-api.js` (`rpc`,
  `cloudClient`, `projectConfig`).
- **A derivation** (counts, totals, readiness, ordering, validation, text a
  file export is made of) → a pure function in `src/lib/`, testable in Node.
  A page's own derivations live in `src/lib/<page>-model.js`.
- **Drawing it** → `src/pages/<page>.js` and `src/ui/`.

## Ports — when the logic needs the screen

A few logic modules need the screen to do one thing: `cloud.js` must ask
"upload these projects?", the pitch deck closes on the brand line. They call
`callPort(name, fallback, …args)` from `src/lib/ports.js`; the view registers
the implementation with `setPort(name, fn)` when it loads. A port nobody
registered answers its fallback, which is always the safe answer.

| Port | Returns | Registered by |
|---|---|---|
| `ask(messageOrOptions)` | `Promise<boolean>` | `src/ui/dialog.js` |
| `brandLine({ className })` | `Element \| null` | `src/ui/footer.js` |
| `takeoverDialog(info)` | `Promise<boolean>` | `src/ui/ports-view.js` (lazy) |
| `addTake(lineId, text)` / `removeTake(lineId, text)` | `'ok' \| 'gone' \| 'dup'` | `src/ui/coverage.js` (the open script row) |

## Replacing the UI

1. Keep `src/lib/`, `src/data/` and `supabase/` as they are.
2. Write new views that call the same `src/lib/` functions.
3. Register the ports above.
4. **Keep every `data-key` attribute and every stored key name** — those are
   the contract with users' saved work (CLAUDE.md invariant 1). The blueprint
   pages bind fields by `data-key`; `npm run verify` fails if one goes missing.
5. Keep `store.js` imported first on every page entry (invariant 6).

To change only the *look*, edit `src/styles/tokens.css` and
`src/styles/skins/studio.css` (invariants 4 and 7); no script changes.
