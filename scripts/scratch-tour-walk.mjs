import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:5882/';
const OUT = process.env.OUT || '.';
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [w, hgt] of [[1280, 900], [390, 844]]) {
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, colorScheme: scheme, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(BASE + 'index.html');
    await page.waitForTimeout(1500);
    const tag = `${w}-${scheme}`;
    // idle writes on the hub with the checklist
    await page.evaluate(() => { window.__w = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (...a) { if (this === localStorage) window.__w++; return o.apply(this, a); }; });
    await page.waitForTimeout(4000);
    const idle = await page.evaluate(() => window.__w);
    const list = await page.evaluate(() => { const s = document.getElementById('firstweek'); return s ? s.innerText.replace(/\s+/g, ' ').slice(0, 300) : null; });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(tag, 'idle writes', idle, 'overflow', overflow, '\n  list:', list);
    await page.screenshot({ path: `${OUT}/hub-${tag}.png`, fullPage: false });
    // start tour
    await page.click('[data-tour-act="start"]');
    await page.waitForTimeout(800);
    const pop = await page.evaluate(() => { const p = document.querySelector('.tour-pop'); return p ? { text: p.innerText.slice(0, 200), focused: document.activeElement === p, ring: !!document.querySelector('[data-tour-on]') } : null; });
    console.log('  step1', JSON.stringify(pop));
    await page.screenshot({ path: `${OUT}/tour1-${tag}.png` });
    // open sample through the tour
    await page.click('[data-tour-act="sample"]');
    await page.waitForTimeout(2500);
    const pop2 = await page.evaluate(() => { const p = document.querySelector('.tour-pop'); return p ? p.innerText.slice(0, 200) : null; });
    console.log('  step1 after sample', JSON.stringify(pop2));
    const list2 = await page.evaluate(() => { const s = document.getElementById('firstweek'); return s ? s.querySelector('.right').textContent : null; });
    console.log('  list after sample', list2);
    // walk the remaining steps
    for (let i = 1; i < 7; i++) {
      const btn = await page.$('.tour-pop [data-tour-act="next"]');
      if (!btn) { console.log('  no next at', i); break; }
      await btn.click();
      await page.waitForLoadState('load');
      await page.waitForTimeout(1800);
      const info = await page.evaluate(() => { const p = document.querySelector('.tour-pop'); const a = document.querySelector('[data-tour-on]'); return { url: location.pathname + location.hash, pop: p ? p.querySelector('h2').textContent : null, focused: document.activeElement === p, anchor: a ? (a.id || a.tagName + '.' + a.className) : null, ow: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      console.log('  step', i + 1, JSON.stringify(info));
      if (w === 390 && scheme === 'dark') await page.screenshot({ path: `${OUT}/step${i + 1}-${tag}.png` });
      // idle writes on a page mid-tour
      if (i === 3) {
        await page.evaluate(() => { window.__w = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (...a) { if (this === localStorage) window.__w++; return o.apply(this, a); }; });
        await page.waitForTimeout(4000);
        console.log('  idle writes mid-tour', await page.evaluate(() => window.__w));
      }
    }
    // Esc ends
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    console.log('  after Esc pop:', await page.evaluate(() => !!document.querySelector('.tour-pop')), 'state', await page.evaluate(() => localStorage.getItem('fms_tour_v1')));
    console.log('  errors', errs);
    await ctx.close();
  }
}
await browser.close();
