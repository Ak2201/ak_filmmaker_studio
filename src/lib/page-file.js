/* The page a pathname names, as its .html file — pure, import-free.
   Production (Vercel cleanUrls) serves /settings, dev and preview serve
   /settings.html; both must read as 'settings.html'. */
export function pageFile(pathname) {
  const seg = String(pathname || '').split('/').pop().toLowerCase();
  if (!seg) return 'index.html';
  return /\.html$/.test(seg) ? seg : seg + '.html';
}
