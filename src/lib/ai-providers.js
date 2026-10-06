/* ============================================================
   THE PROVIDERS — who the key belongs to, and nothing else
   ------------------------------------------------------------
   There are two ways to run the model-backed tools in this studio:
   Anthropic's API and Google's Gemini API. A user brings their own
   key to one of them. EVERYTHING that differs between the two
   because of WHOSE API it is — the host, the key's shape, the
   console you get a key from, the model ids, the storage key the
   key is kept under — is in the table below and nowhere else.

   WHY THIS IS ITS OWN FILE AND NOT PART OF src/lib/ai.js.
   Four pages print a sentence naming where the key goes before
   the request module has loaded: the blueprint entry panel on
   feature.html and short.html, and the two "needs a key" notes on
   write.html that render precisely BECAUSE ai.js is not loaded
   yet. A page that cannot ask would have to restate the host, and
   a restated host is a host that goes stale — the money-parser
   trap in CLAUDE.md, with a privacy claim instead of a number.
   This module has one import and no model code in it, so those
   pages can ask without pulling the request path into first paint.

   src/lib/ai.js owns the REQUEST. src/ui/ai-panel.js owns the
   FORM. This owns the facts both of them read.

   NEITHER KEY IS PROJECT DATA AND NEITHER IS THE USER'S WORK.
   `fms_ai_key_v1` and `fms_ai_key_gemini_v1` are both deliberately
   absent from all five of the places a project key is registered:

     1. SCOPED_KEYS in src/lib/store.js  — so neither is suffixed
        with a project id. One key, one device, every project.
     2. PROJECT_KEYS in src/lib/backup.js — so neither is written
        into the backup file a user emails to themselves.
     3. GLOBAL_KEYS in src/pages/hub.js  — the other half of that
        backup, and the one most easily missed: `export-all` walks
        GLOBAL_KEYS, so a key listed there travels in the file
        even though it is not "project" data.
     4. ALL_KEYS in src/pages/hub.js     — so "reset the studio"
        does not silently throw away a credential. The panel has
        its own Forget button for that.
     5. the scope check in supabase-schema.sql — so neither CAN
        sync. src/lib/cloud.js derives what it uploads from
        Store.SCOPED_KEYS; a key that is not in that list has no
        cloud scope and is never sent.

   Absence from a list in another file is a weak guarantee, so
   nothing here relies on it: every read and write goes through
   `rawGet`/`rawSet`/`rawRemove`, which bypass the storage proxy
   entirely.

   NO KEY WAS RENAMED TO GET THE SECOND PROVIDER. `fms_ai_key_v1`
   still means exactly what it meant — the Anthropic key — so a
   user who had one keeps it, with no migration to write and none
   to get half-finished. The Gemini key is a NEW key beside it,
   and so is its model choice. Two keys can be saved at once; the
   provider setting picks which one a request uses.
   ============================================================ */
import { rawGet, rawSet, rawRemove } from './store.js';

/* Per-device, never scoped, never synced. See the header. */
export const AI_KEY           = 'fms_ai_key_v1';
export const AI_MODEL_KEY     = 'fms_ai_model_v1';
export const GEMINI_KEY       = 'fms_ai_key_gemini_v1';
export const GEMINI_MODEL_KEY = 'fms_ai_model_gemini_v1';
export const AI_PROVIDER_KEY  = 'fms_ai_provider_v1';

/* Two models each, and the pair means the same thing on both
   sides: the default is the fast one, because the jobs here are
   structured craft tasks rather than research problems and the
   user is waiting, and the second is there for when they are not.

   `keyShape` is a SHAPE check, not a validity check — only the API
   can say whether a key works, and this exists so an obvious paste
   error is caught before it becomes a rejection the user has to
   interpret. Pasting an Anthropic key into a Gemini field is the
   mistake two providers makes possible, and it is the one this
   catches. */
export const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    apiName: 'Anthropic’s API',
    host: 'api.anthropic.com',
    origin: 'https://api.anthropic.com',
    keyKey: AI_KEY,
    modelKey: AI_MODEL_KEY,
    keyPlaceholder: 'sk-ant-…',
    keyShape: /^sk-ant-[A-Za-z0-9_-]{16,}$/,
    keyShapeSays: 'That does not look like an Anthropic key. They start with "sk-ant-".',
    consoleName: 'the Anthropic console',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    models: [
      { id: 'claude-sonnet-5', label: 'Sonnet 5', hint: 'quick — the default' },
      { id: 'claude-opus-5',   label: 'Opus 5',   hint: 'slower, more considered' }
    ]
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    apiName: 'the Gemini API',
    host: 'generativelanguage.googleapis.com',
    origin: 'https://generativelanguage.googleapis.com',
    keyKey: GEMINI_KEY,
    modelKey: GEMINI_MODEL_KEY,
    keyPlaceholder: 'AIza… or AQ.…',
    /* Two forms are live: the classic API key ("AIza…") and the newer
       one Google AI Studio issues ("AQ.…", with dots in the body). The
       shape check only exists to catch a key pasted into the wrong
       provider's field; whether Google accepts a key is Google's call,
       and a bad one answers 400 + API_KEY_INVALID, handled in ai.js. */
    keyShape: /^(?:AIza[A-Za-z0-9_-]{16,}|AQ\.[A-Za-z0-9._-]{16,})$/,
    keyShapeSays: 'That does not look like a Gemini key. They start with "AIza" or "AQ.".',
    consoleName: 'Google AI Studio',
    consoleUrl: 'https://aistudio.google.com/apikey',
    models: [
      { id: 'gemini-3.8-flash',       label: 'Gemini 3.8 Flash', hint: 'quick — the default' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',   hint: 'slower, more considered' }
    ]
  }
];

/* Anthropic stays the default, for the plain reason that it is
   what every existing install is already set to and what every
   saved `fms_ai_key_v1` is a key for. */
export const DEFAULT_PROVIDER = PROVIDERS[0].id;

const byId = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/* ------------------------------------------------------------
   WHICH PROVIDER
   ------------------------------------------------------------ */
export function getProviderId() {
  const id = rawGet(AI_PROVIDER_KEY);
  return byId[id] ? id : DEFAULT_PROVIDER;
}

/** The descriptor. Never returns undefined: an unknown id — a
    hand-edited storage value, or a provider that was removed —
    falls back to the default rather than throwing somewhere
    further down, where the cause would be unrecoverable. */
export function provider(id) {
  return byId[id] || byId[getProviderId()] || PROVIDERS[0];
}

export function setProvider(id) {
  if (!byId[id]) return false;
  return rawSet(AI_PROVIDER_KEY, id);
}

/** For the sentences pages print about where the key goes. There
    are two of these rather than one because "Anthropic" and
    "Anthropic’s API" read differently in a sentence than "Google
    Gemini" and "the Gemini API" do, and a sentence assembled from
    the wrong one of the pair is how a privacy claim starts
    sounding like a template. */
export const providerLabel = (id) => provider(id).label;
export const apiName = (id) => provider(id).apiName;
export const apiHost = (id) => provider(id).host;
export const apiOrigin = (id) => provider(id).origin;

/* ------------------------------------------------------------
   THE KEY
   ------------------------------------------------------------
   Every function here takes an optional provider id and defaults
   to the active one, so a caller that does not care about
   providers — which is every caller outside the panel — reads
   exactly as it did when there was one.
   ------------------------------------------------------------ */
export function getKey(id) {
  const k = rawGet(provider(id).keyKey);
  return typeof k === 'string' ? k.trim() : '';
}
export function hasKey(id) { return getKey(id).length > 0; }

/** Returns false when storage refused, so the panel can say so
    rather than pretending the key was kept. */
export function setKey(value, id) {
  const clean = String(value ?? '').trim();
  if (!clean) return clearKey(id);
  return rawSet(provider(id).keyKey, clean);
}
export function clearKey(id) { return rawRemove(provider(id).keyKey); }

/** What the UI is allowed to show. Never the key. The last four
    characters are enough for a user to tell two keys apart and
    not enough for anybody else to do anything with. */
export function maskKey(value, id) {
  const k = String(value ?? getKey(id));
  if (!k) return '';
  return '•'.repeat(12) + k.slice(-4);
}

export function looksLikeKey(value, id) {
  return provider(id).keyShape.test(String(value ?? '').trim());
}

/* ------------------------------------------------------------
   THE MODEL
   ------------------------------------------------------------
   Each provider keeps its own choice under its own storage key.
   One shared model key would have meant switching provider left a
   model id the other side has never heard of, which is a 400 at
   the end of a click rather than at the moment of the choice.
   ------------------------------------------------------------ */
export function models(id) { return provider(id).models; }
export function defaultModel(id) { return provider(id).models[0].id; }

export function getModel(id) {
  const p = provider(id);
  const m = rawGet(p.modelKey);
  return p.models.some((x) => x.id === m) ? m : p.models[0].id;
}
export function setModel(modelId, id) {
  const p = provider(id);
  if (!p.models.some((x) => x.id === modelId)) return false;
  return rawSet(p.modelKey, modelId);
}

export default {
  PROVIDERS, DEFAULT_PROVIDER,
  AI_KEY, AI_MODEL_KEY, GEMINI_KEY, GEMINI_MODEL_KEY, AI_PROVIDER_KEY,
  getProviderId, provider, setProvider, providerLabel, apiName, apiHost, apiOrigin,
  getKey, hasKey, setKey, clearKey, maskKey, looksLikeKey,
  models, defaultModel, getModel, setModel
};
