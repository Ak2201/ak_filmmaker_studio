/* ============================================================
   BUILD THE CHROME EXTENSION — dist-extension/, ready to load unpacked
   ------------------------------------------------------------
   The extension IS the app: the same Vite build, plus the side panel
   entry (extension/panel.html), with the service worker turned off
   (an extension page never registers one), a manifest, the background
   worker and its config. One codebase, so a fix to the breakdown is a
   fix in the extension without a second copy to keep in step.

       npm run build:extension
       chrome://extensions -> Developer mode -> Load unpacked -> dist-extension/

   ext-config.json carries the Supabase URL and publishable key from
   .env. Both are public — the same two values are inlined into every
   page of the website — and RLS is what guards the data.

   Before Google sign-in works in the extension, the extension's
   redirect URL must be on the Supabase project's Redirect URLs list.
   See docs/EXTENSION.md.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'dist-extension');

function readEnv() {
  const env = { ...process.env };
  for (const f of ['.env', '.env.local']) {
    const p = path.join(ROOT, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return env;
}

console.log('building dist-extension/ …');
const r = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT, '--emptyOutDir'], {
  cwd: ROOT, stdio: 'inherit',
  env: { ...process.env, VITE_DISABLE_SW: '1', FMS_EXTENSION: '1' }
});
if (r.status !== 0) process.exit(r.status || 1);

// The PWA's worker and manifest mean nothing inside an extension.
for (const f of ['sw.js', 'manifest.webmanifest', 'registerSW.js']) fs.rmSync(path.join(OUT, f), { force: true });

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const manifest = fs.readFileSync(path.join(ROOT, 'extension/manifest.template.json'), 'utf8')
  .replaceAll('__NAME__', JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8')).name)
  .replace('__VERSION__', String(pkg.version || '1.0.0').replace(/[^0-9.]/g, '') || '1.0.0');
fs.writeFileSync(path.join(OUT, 'manifest.json'), manifest);

fs.mkdirSync(path.join(OUT, 'extension'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'extension/background.js'), path.join(OUT, 'extension/background.js'));

const env = readEnv();
const url = String(env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
const ref = (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1] || '';
fs.writeFileSync(path.join(OUT, 'extension/ext-config.json'), JSON.stringify({ url, key, ref }, null, 2));
if (!url || !key) console.warn('! no Supabase project in .env — the extension will build, but cannot sign in or sync.');

const panel = path.join(OUT, 'extension/panel.html');
if (!fs.existsSync(panel)) { console.error('✗ extension/panel.html was not built'); process.exit(1); }
console.log('✓ dist-extension/ — load it unpacked from chrome://extensions');
