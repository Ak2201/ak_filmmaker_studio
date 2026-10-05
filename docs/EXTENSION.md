# The Chrome extension

The extension is the app. `npm run build:extension` builds the same pages as the website into `dist-extension/`, adds the side panel (`extension/panel.html`), a manifest and a background worker, and turns the PWA's service worker off. A fix to any page is a fix in the extension, and there is no second copy to keep in step.

## Load it

```bash
npm install
npm run build:extension
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist-extension/`. The toolbar button opens the side panel.

To ship it to the Chrome Web Store, zip the *contents* of `dist-extension/` (with `manifest.json` at the root of the zip).

## Two settings it needs, neither of which is code

1. **Supabase → Authentication → URL Configuration → Redirect URLs.** Add the extension's redirect URL:

   ```
   https://<extension-id>.chromiumapp.org/
   ```

   The id is shown on `chrome://extensions`. An unpacked extension's id changes with its folder path unless the manifest has a `key`; a Web Store build has a fixed id. Without this entry, Google sign-in in the panel ends with "the extension redirect URL is not allowed".

2. **Schema sections 13 and 14** (`supabase-schema.sql`) have to run for invite codes, invite requests, the device lock and screening passes to exist. Until they do, everything **fails closed**: a signed-in account is told the gate is not switched on, sync stays paused, and the panel offers nothing it cannot honour. (It used to fail open so the code could ship before the SQL; that let every Google account through, and is gone — `docs/GATE.md`.) Then make the first admin by hand. Section 13.2 has the one-line insert, and no UI can do it, because anything that can grant the first admin can grant the second.

## What each PRD requirement is, here

| PRD | Where | Notes |
|---|---|---|
| FR-101 gatekeeper | `src/pages/panel.js` | Code is normalised as typed; verifying spends nothing. |
| FR-102 admin console | `settings.html#admin-console` (`src/ui/gate-ui.js`) | Shown by the server's role; every RPC re-checks it. |
| FR-103 screening passes | `screening.html` (`src/pages/screening.js`, `src/lib/watermark.js`) | Read-only, expiring, canvas watermark overlaid **and** baked into each block, tamper watchdog, print refused. |
| FR-201 Google SSO | `chrome.identity.launchWebAuthFlow` → `supabase.auth.setSession` (`extension-bridge.js`, `cloud.js`) | Same Google client as the website. |
| FR-202 ephemeral storage | supabase-js is given a `chrome.storage.session` adapter | Tokens, the ticket and the lock handle never reach `localStorage` or `chrome.storage.local`. Quitting Chrome signs you out. |
| FR-203 one device + takeover | `session_acquire` / `session_takeover` (schema 13.4), prompt in `gate-ui.js` | 90-second stale cutoff. Cancel keeps working locally. |
| FR-204 heartbeat | `extension/background.js`, `chrome.alarms` every 0.5 min | Refreshes an expired token itself. A 409 or 401 clears `chrome.storage.session` and sends the panel to the gatekeeper. |
| FR-205 clean release | `chrome.windows.onRemoved` / `runtime.onSuspend` | Releases only when no window is left. `onSuspend` fires whenever Chrome idles the worker. |
| FR-301 side panel | `side_panel.default_path`, `openPanelOnActionClick` | App pages open in the panel itself. |
| FR-302 idea clipper | context menu → `chrome.storage.local` queue → Idea Vault | A clipping is not a credential, which is why `.local` is allowed for it. |

## What losing the session does, and what it never does

It clears the **credentials** and pauses **sync**. It never touches the writer's work: projects live in the extension's `localStorage`, exactly as they do on the website, and they are still there after a takeover, a revoked invite or a browser restart.

Extension pages have their own origin, so their `localStorage` is not the website's. To move a studio between the two, use the backup file (hub → export / import) or sign in to the same account on both.

## Proving it

```bash
npm run build:extension && npm run prove:extension   # 28 checks, the real unpacked extension
npm run build && npm run prove:gate                  # 34 checks, the website's half
```

Both replace only the network to Supabase, with an in-memory implementation of section 13 (`scripts/fake-supabase.mjs`), plus the two things a headless browser cannot do: a human at Google's consent screen, and a 30-second wait.
