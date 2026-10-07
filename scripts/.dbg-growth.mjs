// scratch debug (not committed)
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor } from './fake-supabase.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'dist-billing');
const PORT = 5872;
const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
F.reset();
const amy = USERS['tok-amy'].id;
F.db.members.set(amy, { role: 'user', disabled_at: null });
F.db.accounts.push({ id: 'acc_amy', name: 'Amy', owner_id: amy, plan: 'indie', plan_until: null, seat_limit: 1, created_at: new Date().toISOString() });
F.db.payments.push({ id: 'payS', user_id: amy, plan_id: 'starter', period: 'lifetime', amount_paise: 299900, status: 'paid', created_at: new Date().toISOString() });
F.db.payments.push({ id: 'payI', user_id: amy, plan_id: 'indie', period: 'lifetime', amount_paise: 500000, status: 'paid', created_at: new Date().toISOString() });
const ctx = await browser.newContext({ serviceWorkers: 'block' });
await ctx.route(SB + '/**', handle);
await ctx.addInitScript(([k, v, uid]) => { if (!sessionStorage.getItem('__s')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__s', '1'); } }, [`sb-${REF}-auth-token`, sessionFor('tok-amy'), amy]);
const page = await ctx.newPage();
page.on('console', (m) => console.log('console', m.type(), m.text()));
await page.goto(`http://localhost:${PORT}/${process.argv[2] || 'settings.html#plan'}`);
await page.waitForTimeout(4000);
console.log('renders', await page.evaluate(() => new Promise((res) => { let n = 0; const o = new MutationObserver(() => n++); o.observe(document.getElementById('app'), { childList: true, subtree: true }); setTimeout(() => res(n), 2000); })));
console.log(await page.evaluate(() => {
  const el = document.querySelector(process_sel());
  function process_sel() { return '[data-gr-panel]'; }
  if (!el) return 'no panel';
  const chain = [];
  for (let n = el; n; n = n.parentElement) chain.push(n.tagName + '#' + n.id + '.' + n.className + ' hidden=' + n.hidden + ' disp=' + getComputedStyle(n).display + ' vis=' + getComputedStyle(n).visibility);
  return chain.join('\n') + '\ncount ' + document.querySelectorAll('[data-gr-panel]').length;
}));
await browser.close(); srv.kill();
