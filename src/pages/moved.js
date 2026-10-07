/* ============================================================
   MOVED — the redirect stub for a page that became a Library tab
   ------------------------------------------------------------
   study.html and dissect.html were pages until 6 Oct 2026; they are
   tabs of library.html now (#case-studies, #dissection). Their URLs
   stay alive for bookmarks, shared links and the hub's older copy.

   Why a module and not the inline <script> the arunak-*.html stubs
   carry: the strict CSP in vercel.json and netlify.toml has no
   'unsafe-inline' for scripts, so an inline redirect is refused and
   only the meta refresh would fire — which drops the #fragment. The
   arunak stubs get away with it because the HOST answers them with a
   301 first. These are answered by the file itself, so the redirect
   has to be a same-origin script.

   The stub names its destination and the prefix its old section ids
   gained (`<meta name="fms-moved" content="library.html#case-studies"
   data-prefix="cs-">`), so study.html#beats lands on library.html#cs-
   beats — inside the Case Studies tab, which tabs.js opens for it.

   It writes nothing and imports nothing: no store.js, no chrome. A
   page whose whole job is to leave must not boot the studio first.
   ============================================================ */
const meta = document.querySelector('meta[name="fms-moved"]');
if (meta) {
  const [file, frag] = String(meta.content || 'library.html').split('#');
  const prefix = meta.getAttribute('data-prefix') || '';
  const want = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  const target = want && /^[\w-]+$/.test(want) ? prefix + want : frag;
  /* An old fragment this stub cannot vouch for — dissect.html#anything
     that was never an id — used to land on the Library's FIRST tab,
     Films, because tabs.js falls back to it for a hash that matches
     nothing. `?tab=` names the tab this page became, and tabs.js uses
     it only in that case: a fragment that resolves still wins. */
  const tab = target && target !== frag && frag ? '?tab=' + encodeURIComponent(frag) : '';
  location.replace('./' + file + tab + (target ? '#' + target : ''));
}
