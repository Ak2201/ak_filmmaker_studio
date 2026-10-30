/* ============================================================
   PROOF: the landing page's launch offer (start.html, 30 Oct 2026)
   ------------------------------------------------------------
   The hero offer card (#offerCard), the slide-in / phone bar
   (#offerDock) and the closing band (#offerClose), against a faked
   trial_offer() and price_notice() answered HERE, at 1440 and 390:

     pass      trial_offer().pass open: the pass's name and the server's
               price; no struck price; a countdown to ends_at on the
               SERVER's clock (the fake's `now` is three hours off the
               local clock, and the text must follow the server); the
               button is purchase.html?buy=pass
     founding  no open pass, a rise scheduled: Intermediate at today's
               price with the price it rises to struck beside it, the
               founding places left, a countdown to next_price_at on the
               server's clock, the button purchase.html?buy=indie
     neither   nothing rising, no pass: every surface hidden, the hero's
               plain door and the plans stand
     fired     next_price_at in the past: falls to nothing, and no text
               claims a rise

   And: a signed-out press stashes fms_invite_plan {plan, buy:true},
   counts 'signup' and goes straight to Google; a signed-in press is a
   plain navigation to the href. The dock is hidden on load and while
   the hero card is on screen, shows once scrolled past it, hides at the
   closing band, closes on its button and on Escape and stays closed
   after scrolling and a reload; at 390 it is one bar no taller than 64px
   (plus the safe-area inset), with no horizontal overflow and the last
   footer link clickable. Throughout: no localStorage write, no page or
   console error, and no studio-* or supabase-* chunk.

   Motion is inert here (navigator.webdriver: html.st-still), so this
   proves the facts, not the animation; check that by hand.

   Run: PROVE_DIST=dist-verify node scripts/prove-offer.mjs
        (PROVE_PORT, default 5947; PW_CHROMIUM for an installed Chromium)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { SB, REF, USERS, sessionFor } from './fake-supabase.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5947;
const BASE = `http://localhost:${PORT}/`;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webm': 'video/webm', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain'
};
if (!fs.existsSync(path.join(DIST, 'start.html'))) {
  console.error(`prove:offer: no build at ${DIST}; run npm run build:verify and set PROVE_DIST=dist-verify`);
  process.exit(2);
}
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((resolve) => {
  server.once('error', (e) => { console.error(`prove:offer: port ${PORT} is taken (${e.code}); set PROVE_PORT`); process.exit(2); });
  server.listen(PORT, resolve);
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

/* ---- the server, faked here ---------------------------------------
   SKEW: the server's clock runs three hours AHEAD of this machine's, so
   a countdown computed from the visitor's clock reads three hours long. */
const SKEW = 3 * 3600e3;
const S = { pass: null, rise: null };   // pass: { open, endsIn } ; rise: ms from real now (negative: fired) or null
const PASS_PAISE = 4900, PASS_DAYS = 7;
const NOW_PAISE = { free: 0, starter: 59900, indie: 79900, pro: 99900 };
const NEXT_PAISE = { starter: 99900, indie: 149900, pro: 199900 };
const srvNow = () => new Date(Date.now() + SKEW).toISOString();
const passBlock = () => S.pass && {
  open: S.pass.open, amount_paise: PASS_PAISE, days: PASS_DAYS, plan: 'pro',
  ends_at: new Date(Date.now() + SKEW + S.pass.endsIn).toISOString(), cap: null, left: null, now: srvNow()
};
const noticeBody = () => {
  const at = S.rise == null ? null : new Date(Date.now() + S.rise).toISOString();
  return {
    seats_total: at ? 100 : null, seats_taken: at ? 61 : null,
    plans: Object.keys(NOW_PAISE).map((id) => ({ id, price_paise: NOW_PAISE[id],
      next_price_paise: at && NEXT_PAISE[id] ? NEXT_PAISE[id] : null, next_price_at: at && NEXT_PAISE[id] ? at : null, rising: !!at && !!NEXT_PAISE[id] }))
  };
};
const EVENTS = [];
let authHits = 0;
async function route(r) {
  const url = new URL(r.request().url());
  const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  if (url.pathname === '/rest/v1/rpc/price_notice') return json(noticeBody());
  if (url.pathname === '/rest/v1/rpc/trial_offer') {
    const pb = passBlock();
    return json({ trial_enabled: false, trial_minutes: 30, trial_hours: 0.5, purchase_required: true, ...(pb ? { pass: pb } : {}) });
  }
  if (url.pathname === '/rest/v1/rpc/purchases_required') return json(true);
  if (url.pathname === '/rest/v1/rpc/bump_event') { try { EVENTS.push(JSON.parse(r.request().postData() || '{}').p_name); } catch (e) { /* */ } return r.fulfill({ status: 204, body: '' }); }
  if (url.pathname === '/auth/v1/authorize') {
    authHits++;
    /* back to the landing page in the same tab, so its sessionStorage can be read */
    return r.fulfill({ status: 302, headers: { location: BASE + 'start.html?back=google' }, body: '' });
  }
  return json(null);
}

async function context(browser, { width, signedIn = false }) {
  const height = width >= 1100 ? 900 : 844;
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height }, timezoneId: 'Asia/Kolkata' });
  await ctx.route(SB + '/**', route);
  await ctx.route(/\/purchase(\.html)?(\?|$)/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>checkout</title><p>checkout</p>' }));
  await ctx.addInitScript(([k, v, uid]) => {
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
    window.__writes = [];
    const o = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...a) { if (this === localStorage) window.__writes.push(String(a[0])); return o.apply(this, a); };
  }, signedIn ? [`sb-${REF}-auth-token`, sessionFor('tok-amy'), USERS['tok-amy'].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [], chunks = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (q) => { if (/\/(studio|supabase)-[\w-]+\.js/.test(q.url())) chunks.push(q.url()); });
  return { ctx, page, errors, chunks };
}
const view = (page) => page.evaluate(() => {
  const vis = (n) => !!n && !n.closest('[hidden]') && n.getClientRects().length > 0;
  const card = document.getElementById('offerCard');
  const txt = (n) => (n ? n.textContent.replace(/\s+/g, ' ').trim() : '');
  const q = (sel) => card && [...card.querySelectorAll(sel)].find(vis);
  const cta = card && card.querySelector('[data-offer-cta]');
  return {
    shown: vis(card), state: card ? card.dataset.offerState : '',
    name: txt(q('.st-offer-name span:not([hidden])')), price: txt(q('[data-o-price]')), unit: txt(q('[data-o-unit]')),
    was: vis(card && card.querySelector('[data-o-was]')) ? txt(card.querySelector('[data-o-was-amt]')) : '',
    day: txt(q('[data-o-day]')), seats: txt(q('[data-o-seats]')),
    clock: txt(q('[data-o-clock]')), spoken: txt(card && card.querySelector('[data-o-spoken]')), lead: txt(q('[data-o-timer-lead]')),
    href: cta ? cta.getAttribute('href') : '', ctaText: txt(cta),
    heroPrimary: [...document.querySelectorAll('.st-hero .mk-btn--primary')].filter(vis).map(txt),
    closeShown: vis(document.getElementById('offerClose')), dockShown: vis(document.getElementById('offerDock')),
    closeHref: (document.querySelector('#offerClose [data-offer-cta]') || {}).getAttribute?.('href') || '',
    body: document.body.innerText.replace(/\s+/g, ' ')
  };
});
const secs = (t) => { const m = /(?:(\d+)d )?(\d\d):(\d\d):(\d\d)/.exec(t || ''); return m ? (+(m[1] || 0)) * 86400 + (+m[2]) * 3600 + (+m[3]) * 60 + (+m[4]) : null; };
async function load(page, file = 'start.html') {
  await page.goto(BASE + file, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const allErrors = [], allChunks = [], allWrites = [];
const done = async (c) => {
  allErrors.push(...c.errors); allChunks.push(...c.chunks);
  try { allWrites.push(...await c.page.evaluate(() => window.__writes || [])); } catch (e) { /* navigated away */ }
  await c.ctx.close();
};
try {
  const PASS_LEFT = 3 * 86400e3 + 4 * 3600e3 + 12 * 60e3;   // 3d 04:12, on the server's clock
  const RISE_IN = 26 * 3600e3;                               // 26h of REAL time; 23h on the server's clock
  for (const width of [1440, 390]) {
    console.log(`@${width}: the pass is open`);
    S.pass = { open: true, endsIn: PASS_LEFT }; S.rise = RISE_IN;
    {
      const c = await context(browser, { width });
      await load(c.page);
      const a = await view(c.page);
      ok(a.shown && a.state === 'pass', `the card shows the pass (${a.state})`);
      ok(a.name === 'The launch pass' && a.price === '₹' + PASS_PAISE / 100 && a.unit === 'for ' + PASS_DAYS + ' days', `the server's price and length: "${a.name}", ${a.price} ${a.unit}`);
      ok(a.was === '', 'no struck price on the pass');
      const s = secs(a.clock), want = PASS_LEFT / 1000;
      ok(s != null && Math.abs(s - want) <= 5, `the countdown is ends_at minus the SERVER's now (${a.clock}; ${Math.round(want)}s real, a visitor's clock would say ${Math.round(want + SKEW / 1000)}s)`);
      ok(/^Offer ends in 3 days 4 hours 1[12] minutes$/.test(a.spoken), `the spoken label is to the minute: "${a.spoken}"`);
      ok(a.href === 'purchase.html?buy=pass' && a.closeHref === 'purchase.html?buy=pass', `the buttons go to purchase.html?buy=pass (${a.href})`);
      ok(a.ctaText === 'Get the launch pass — continue with Google', `signed out, the button says Google comes first: "${a.ctaText}"`);
      ok(a.heroPrimary.length === 1 && a.heroPrimary[0] === a.ctaText, `the hero has exactly one primary action: ${JSON.stringify(a.heroPrimary)}`);
      ok(!a.dockShown, 'the slide-in is hidden on load, with the hero card on screen');
      await c.page.waitForTimeout(2100);
      const b = await view(c.page);
      const d = secs(a.clock) - secs(b.clock);
      ok(d >= 1 && d <= 3, `it ticks down (${a.clock} → ${b.clock})`);
      /* the signed-out press */
      EVENTS.length = 0; authHits = 0;
      await Promise.all([c.page.waitForURL(/back=google/, { timeout: 8000 }).catch(() => {}), c.page.click('#offerCard [data-offer-cta]')]);
      const stash = await c.page.evaluate(() => sessionStorage.getItem('fms_invite_plan'));
      ok(authHits === 1, 'signed out, the press goes straight to the Google sign-in');
      ok(stash === JSON.stringify({ plan: 'pass', buy: true }), `and the intent is stashed first: ${stash}`);
      await c.page.waitForTimeout(400);
      ok(EVENTS.includes('signup'), `and it counts 'signup' (${JSON.stringify(EVENTS)})`);
      await done(c);
    }

    console.log(`@${width}: the founding price`);
    S.pass = { open: false, endsIn: PASS_LEFT }; S.rise = RISE_IN;
    {
      const c = await context(browser, { width });
      await load(c.page);
      const a = await view(c.page);
      ok(a.shown && a.state === 'founding', `the card shows the founding price (${a.state})`);
      ok(a.name === 'Intermediate at the founding price' && a.price === '₹799' && a.unit === 'a year', `today's price: "${a.name}", ${a.price} ${a.unit}`);
      ok(a.was === '₹1,499', `the price it rises to is struck beside it: ${a.was}`);
      ok(a.day === 'about ₹2.19 a day', `with the per-day figure: "${a.day}"`);
      ok(a.seats === '39 of 100 founding places left', `the founding places left are the server's: "${a.seats}"`);
      const s = secs(a.clock), want = (RISE_IN - SKEW) / 1000;
      ok(s != null && Math.abs(s - want) <= 5 && a.lead === 'Founding price ends in', `the countdown runs on the server's clock (${a.lead} ${a.clock}; ${Math.round(want)}s on the server, ${Math.round(RISE_IN / 1000)}s on this machine)`);
      ok(a.href === 'purchase.html?buy=indie', `the button goes to purchase.html?buy=indie (${a.href})`);
      ok(a.ctaText === 'Lock the founding price — continue with Google', `"${a.ctaText}"`);
      ok(a.heroPrimary.length === 1, 'the hero has exactly one primary action');
      ok(!/hurry|only \d+ left|someone just|risk-free|money-back/i.test(a.body), 'no urgency words, fake activity or guarantees anywhere');
      await c.page.waitForTimeout(2100);
      const d = secs(a.clock) - secs((await view(c.page)).clock);
      ok(d >= 1 && d <= 3, 'it ticks down');

      /* the dock */
      ok(!(await view(c.page)).dockShown, 'the slide-in is hidden while the hero card is on screen');
      await c.page.evaluate(() => document.getElementById('value').scrollIntoView({ behavior: 'instant' }));
      await c.page.waitForFunction(() => !document.getElementById('offerDock').hidden, null, { timeout: 3000 }).catch(() => {});
      ok((await view(c.page)).dockShown, 'scrolled past the card, the slide-in shows');
      const geo = await c.page.evaluate(() => {
        const r = document.getElementById('offerDock').getBoundingClientRect();
        return { h: r.height, w: r.width, right: innerWidth - r.right, bottom: innerHeight - r.bottom, over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          pad: getComputedStyle(document.documentElement).getPropertyValue('--offer-dock-h').trim(),
          cta: (document.querySelector('#offerDock [data-offer-cta]') || {}).getAttribute?.('href') };
      });
      if (width <= 720) {
        ok(geo.h <= 64 && geo.w === width && geo.bottom === 0, `at ${width} it is one bottom bar, ${Math.round(geo.h)}px tall, full width`);
        ok(geo.pad === Math.ceil(geo.h) + 'px', `and the page reserves its height (--offer-dock-h ${geo.pad})`);
      } else ok(geo.w <= 320 && geo.right > 0 && geo.bottom > 0, `at ${width} it is a card in the bottom right (${Math.round(geo.w)}px wide)`);
      ok(!geo.over, 'no horizontal overflow with the slide-in shown');
      ok(geo.cta === 'purchase.html?buy=indie', 'the slide-in\'s button is the same checkout');
      await c.page.evaluate(() => document.getElementById('start').scrollIntoView({ behavior: 'instant', block: 'center' }));
      await c.page.waitForFunction(() => document.getElementById('offerDock').hidden, null, { timeout: 3000 }).catch(() => {});
      const atClose = await view(c.page);
      ok(!atClose.dockShown && atClose.closeShown, 'at the closing band the slide-in hides and the band carries the offer');
      /* the end of the page: the last footer link is clickable */
      await c.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await c.page.waitForTimeout(400);
      const last = await c.page.evaluate(() => {
        const links = [...document.querySelectorAll('.mk-foot a[href]')].filter((a) => a.getClientRects().length);
        const a = links[links.length - 1]; if (!a) return null;
        a.scrollIntoView({ block: 'end', behavior: 'instant' });
        const r = a.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { ok: !!hit && (hit === a || a.contains(hit)), href: a.getAttribute('href') };
      });
      ok(last && last.ok, `the last footer link (${last && last.href}) is clickable, nothing over it`);
      /* close it, and it stays closed */
      await c.page.evaluate(() => document.getElementById('value').scrollIntoView({ behavior: 'instant' }));
      await c.page.waitForFunction(() => !document.getElementById('offerDock').hidden, null, { timeout: 3000 }).catch(() => {});
      await c.page.click('#offerDock [data-offer-close]');
      const closed = await c.page.evaluate(() => ({ hidden: document.getElementById('offerDock').hidden, focus: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }));
      ok(closed.hidden && closed.focus === 'main', `its close button closes it, and focus goes to <main> (${closed.focus})`);
      await c.page.evaluate(() => window.scrollBy(0, 400)); await c.page.waitForTimeout(300);
      await c.page.evaluate(() => document.getElementById('value').scrollIntoView({ behavior: 'instant' })); await c.page.waitForTimeout(400);
      ok(!(await view(c.page)).dockShown, 'and it stays closed after scrolling');
      await load(c.page);
      await c.page.evaluate(() => document.getElementById('value').scrollIntoView({ behavior: 'instant' })); await c.page.waitForTimeout(600);
      ok(!(await view(c.page)).dockShown, 'and after a reload in the same session');
      await done(c);
    }
    {
      /* Escape, in a fresh session */
      const c = await context(browser, { width });
      await load(c.page);
      await c.page.evaluate(() => document.getElementById('value').scrollIntoView({ behavior: 'instant' }));
      await c.page.waitForFunction(() => !document.getElementById('offerDock').hidden, null, { timeout: 3000 }).catch(() => {});
      await c.page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await c.page.keyboard.press('Escape');
      ok(!(await view(c.page)).dockShown, 'Escape closes the slide-in');
      await done(c);
    }
    {
      /* signed in: the press is a plain navigation to the checkout */
      const c = await context(browser, { width, signedIn: true });
      await load(c.page);
      const a = await view(c.page);
      ok(a.ctaText === 'Lock the founding price', `signed in, the button names the offer only: "${a.ctaText}"`);
      authHits = 0;
      await Promise.all([c.page.waitForURL(/purchase/, { timeout: 8000 }).catch(() => {}), c.page.click('#offerCard [data-offer-cta]')]);
      ok(/\/purchase\.html\?buy=indie$/.test(c.page.url()) && authHits === 0, `signed in, the press opens ${new URL(c.page.url()).pathname + new URL(c.page.url()).search} with no sign-in`);
      await done(c);
    }

    console.log(`@${width}: neither, and a rise that has fired`);
    for (const [label, rise] of [['nothing rising', null], ['the rise has fired', -3600e3]]) {
      S.pass = null; S.rise = rise;
      const c = await context(browser, { width });
      await load(c.page);
      const a = await view(c.page);
      ok(!a.shown && !a.closeShown && !a.dockShown, `${label}: every offer surface stays hidden`);
      ok(a.heroPrimary.length === 1 && a.heroPrimary[0] === 'Get started', `${label}: the hero keeps its plain door: ${JSON.stringify(a.heroPrimary)}`);
      ok(!/founding|rises to|launch pass|₹1,499|ends in/i.test(a.body), `${label}: no text claims an offer or a rise`);
      await c.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await c.page.waitForTimeout(300);
      ok(!(await view(c.page)).dockShown, `${label}: no slide-in anywhere on the page`);
      ok(await c.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `${label}: no horizontal overflow`);
      await done(c);
    }
  }
  console.log('global');
  ok(allWrites.filter((k) => k !== 'fms_studio_account_v1' && !/^sb-/.test(k)).length === 0, 'no localStorage write anywhere' + (allWrites.length ? ': ' + [...new Set(allWrites)].join(', ') : ''));
  ok(allChunks.length === 0, 'no studio-* or supabase-* chunk on the landing page' + (allChunks.length ? ': ' + [...new Set(allChunks)].join(', ') : ''));
  const real = allErrors.filter((e) => !/favicon/i.test(e));
  ok(real.length === 0, 'no page or console error' + (real.length ? ': ' + [...new Set(real)].slice(0, 4).join(' | ') : ''));
} finally {
  await browser.close();
  server.close();
}
console.log(`\noffer: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
