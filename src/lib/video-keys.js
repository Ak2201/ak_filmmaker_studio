/* Video join keys. Import-free on purpose: steps.js and library.js use these
   at render time and must not pull videos.json into first paint.
     step:<ns>/<stepId>   ns = feature | production | short (the `ns` renderSteps gets)
     lib:film/<title>   lib:director/<name>
     lib:rule/<n>                  lib:glossary/<term>
     module:<navigation.json module id>      landing                      */
export const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
/* Normalise a whole key: only the id part of lib: keys is folded. */
export const normKey = (k) => String(k).startsWith('lib:') ? 'lib:' + norm(String(k).slice(4)) : String(k);
export const stepKey = (ns, id) => 'step:' + ns + '/' + id;
export const libKey = (kind, id) => normKey('lib:' + kind + '/' + id);
