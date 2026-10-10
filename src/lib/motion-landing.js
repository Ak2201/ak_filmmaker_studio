/* ============================================================
   MOTION, landing-only — scroll progress, parallax, marquee, glow,
   aurora. Split from motion.js so the app pages, which import motion.js
   through the CORE motion-app.js, do not carry these in first paint.
   Same rules: no storage, every distance x --motion, off under
   reduced motion.
   ============================================================ */
import { prefersReducedMotion } from './motion.js';

const motionScale = () => {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion'));
  return Number.isFinite(v) ? v : 1;
};

/* ---- scroll progress ------------------------------------------- */
export function scrollProgress() {
  if (document.querySelector('.mo-progress') || prefersReducedMotion()) return null;
  const bar = document.createElement('div');
  bar.className = 'mo-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  let raf = 0;
  const upd = () => {
    raf = 0;
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(upd); };
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on, { passive: true });
  upd();
  return bar;
}

/* ---- parallax: vertical only, capped at 40px x --motion --------- */
export function parallax(el, { speed = 0.08 } = {}) {
  if (!el || prefersReducedMotion()) return;
  let raf = 0, vis = true;
  const upd = () => {
    raf = 0;
    if (!vis) return;
    const r = el.getBoundingClientRect();
    const d = (r.top + r.height / 2 - innerHeight / 2) * speed * motionScale();
    const cap = 40 * motionScale();
    el.style.translate = '0 ' + Math.max(-cap, Math.min(cap, -d)).toFixed(1) + 'px';
  };
  const on = () => { if (!raf) raf = requestAnimationFrame(upd); };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { for (const e of es) vis = e.isIntersecting; on(); }).observe(el);
  }
  addEventListener('scroll', on, { passive: true });
  addEventListener('resize', on, { passive: true });
  on();
}

/* ---- marquee: an infinite slider, clone is aria-hidden + inert -- */
export function marquee(el) {
  if (!el || el.dataset.moMarquee) return;
  el.dataset.moMarquee = '1';
  el.classList.add('mo-marquee');
  const track = document.createElement('div');
  track.className = 'mo-marquee-track';
  const a = document.createElement('div');
  a.className = 'mo-marquee-set';
  while (el.firstChild) a.append(el.firstChild);
  const b = a.cloneNode(true);
  b.setAttribute('aria-hidden', 'true');
  b.setAttribute('inert', '');
  b.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
  b.querySelectorAll('a, button').forEach((n) => n.setAttribute('tabindex', '-1'));
  track.append(a, b);
  el.append(track);
}

/* ---- glow: a slow animated gradient behind an element ----------- */
export function glow(el) {
  if (!el) return;
  el.classList.add('mo-glow');
}

/* ---- aurora: drifting brand gradients, for a clipped host ------- */
export function aurora(el) {
  if (!el || el.querySelector('.mo-aurora')) return;
  const a = document.createElement('div');
  a.className = 'mo-aurora';
  a.setAttribute('aria-hidden', 'true');
  a.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  el.prepend(a);
}
