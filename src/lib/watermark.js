/* ============================================================
   FORENSIC WATERMARK — for the screening room (PRD 2.0 FR-103, §6)
   ------------------------------------------------------------
   Faint diagonal text — the pass's access id, the viewer's typed
   e-mail and the time the pass was opened — over everything a
   screening-pass holder can see. Its job is DETERRENCE and
   ATTRIBUTION: a photo or screenshot of a leaked page names the pass
   it came from, and the console's redemption log names the person
   that pass was issued to.

   WHAT IT IS NOT. Nothing that runs in somebody else's browser can
   stop them copying what that browser shows them; a camera pointed at
   a screen defeats every scheme. The PRD's bar is "resist simple
   CSS-inspection removal", and this meets it three ways, each of which
   survives the obvious attack on the one before:

     1. A CANVAS overlay, not text in the DOM. There is no string to
        find and delete, and it is drawn per device pixel.
     2. THE SAME MARK IS BAKED INTO EACH PROTECTED BLOCK'S BACKGROUND
        as an image, so deleting the overlay element still leaves every
        paragraph watermarked in a screenshot.
     3. A WATCHDOG. A MutationObserver plus a once-a-second check put
        the overlay back if it is removed, hidden, made transparent or
        moved behind the content — and after a few attempts the
        protected content is taken off the page entirely.

   Print is refused outright by the page's print stylesheet; a pass is
   for watching, not for filing.
   ============================================================ */

const FONT = '600 15px system-ui, -apple-system, "Segoe UI", sans-serif';

function drawTile(lines, dpr, ink) {
  const w = 420, hgt = 240;
  const c = document.createElement('canvas');
  c.width = w * dpr; c.height = hgt * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(w / 2, hgt / 2);
  g.rotate(-Math.PI / 7);
  g.font = FONT;
  g.textAlign = 'center';
  g.fillStyle = ink;
  lines.forEach((t, i) => g.fillText(t, 0, (i - (lines.length - 1) / 2) * 20));
  return c;
}

/** `lines`: the text to repeat. `ink`: a CSS colour (read from a token
 *  by the caller — this file holds no colour of its own). `protect`: the
 *  elements to bake the mark into. `onTamper`: called after `limit`
 *  restorations, once; the caller takes the content down. */
export function createWatermark({ lines, ink, protect = [], onTamper, limit = 3 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.wm = '1';
  let tile = null, tileUrl = '', tampers = 0, observer = null, timer = 0, dead = false;

  const styleCanvas = () => {
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none',
      zIndex: '2147483646', opacity: '1', display: 'block', visibility: 'visible', mixBlendMode: 'normal'
    });
  };

  function paint() {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    tile = drawTile(lines, dpr, ink);
    tileUrl = tile.toDataURL('image/png');
    canvas.width = Math.ceil(window.innerWidth * dpr);
    canvas.height = Math.ceil(window.innerHeight * dpr);
    const g = canvas.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    const pat = g.createPattern(tile, 'repeat');
    g.fillStyle = pat;
    g.fillRect(0, 0, canvas.width, canvas.height);
    for (const el of protect) {
      if (!el || !el.style) continue;
      el.style.backgroundImage = `url("${tileUrl}")`;
      el.style.backgroundSize = `${tile.width / dpr}px ${tile.height / dpr}px`;
      el.style.backgroundRepeat = 'repeat';
    }
  }

  function intact() {
    if (!canvas.isConnected) return false;
    const cs = getComputedStyle(canvas);
    if (cs.display === 'none' || cs.visibility !== 'visible' || Number(cs.opacity) < 0.9) return false;
    if (cs.position !== 'fixed' || (parseInt(cs.zIndex, 10) || 0) < 2147483000) return false;
    if (canvas.width === 0 || canvas.height === 0) return false;
    for (const el of protect) {
      if (el && el.isConnected && !String(el.style.backgroundImage || '').includes('data:image/png')) return false;
    }
    return true;
  }

  function check() {
    if (dead || intact()) return;
    tampers++;
    if (tampers > limit) {
      dead = true;
      stop();
      if (onTamper) onTamper();
      return;
    }
    styleCanvas();
    if (!canvas.isConnected) document.body.append(canvas);
    paint();
  }

  function stop() {
    if (observer) observer.disconnect();
    clearInterval(timer);
    window.removeEventListener('resize', paint);
  }

  return {
    mount() {
      styleCanvas();
      document.body.append(canvas);
      paint();
      window.addEventListener('resize', paint);
      observer = new MutationObserver(() => check());
      observer.observe(document.body, { childList: true, subtree: false, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
      observer.observe(canvas, { attributes: true });
      protect.forEach((el) => el && observer.observe(el, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] }));
      timer = setInterval(check, 1000);
      return this;
    },
    destroy() { stop(); canvas.remove(); },
    get tampers() { return tampers; }
  };
}

export default { createWatermark };
