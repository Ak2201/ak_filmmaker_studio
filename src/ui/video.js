/* Click-to-load YouTube facade. Nothing touches the network before a click. */
import '../styles/video.css';
import { h, delegate } from '../lib/dom.js';
import { approvedFor } from '../lib/videos.js';

const ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';

/* The video's own still, served from OUR origin (scripts/make-video-thumbs.mjs
   fetched it once into public/media/vid/). NOT hotlinked from
   i.ytimg.com: this block is a click-to-load facade, and an <img> on
   Google's CDN would hand them every reader's IP on page load —
   exactly what the facade exists to prevent, and what the "Plays from
   YouTube" line promises has not happened yet.

   `loading="lazy"` with explicit dimensions, like every other image
   below the fold here, and `onerror` drops it so the two videos with
   no still (and anything added before `npm run thumbs` is re-run)
   degrade to the plain play button rather than a broken frame. */
const poster = (yt) => h('img.vid-poster', {
  src: '/media/vid/' + yt + '.webp',
  alt: '', 'aria-hidden': 'true', loading: 'lazy', decoding: 'async',
  width: 640, height: 360
});

export function facade(v) {
  const img = poster(v.yt);
  img.addEventListener('error', () => img.remove(), { once: true });
  return h('div.vid', { 'data-yt': v.yt, 'data-title': v.title }, [
    img,
    h('button.vid-play', {
      type: 'button', 'data-action': 'video-play',
      'aria-label': 'Play: ' + v.title + (v.channel ? ' (' + v.channel + ')' : '')
    }, [
      h('span.vid-icon', { 'aria-hidden': 'true', text: '▶' }),
      h('span.vid-meta', {}, [
        h('span.vid-title', { text: v.title }),
        /* "Plays from YouTube": pressing play loads YouTube's player, which
           receives the visitor's address — said on the facade, before the click. */
        h('span.vid-sub', { text: [v.channel, v.minutes ? v.minutes + ' min' : '', 'Plays from YouTube'].filter(Boolean).join(' · ') })
      ])
    ])
  ]);
}

export function watchBlock(videos, label = 'Watch') {
  if (!videos.length) return null;
  return h('div.vid-block', {}, [
    h('div.vid-label', { text: label }),
    ...videos.map((v) => h('div.vid-item', {}, [facade(v), v.why ? h('p.vid-why', { text: v.why }) : null]))
  ]);
}

function play(box) {
  const yt = box.getAttribute('data-yt');
  const frame = h('iframe', {
    src: 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(yt) + '?autoplay=1&rel=0',
    title: box.getAttribute('data-title') || 'Video',
    allow: ALLOW, allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin'
  });
  box.replaceChildren(frame);
  box.classList.add('is-live');
  /* The focused button just left the DOM; without this, focus fell to
     <body> and the next Tab on a 65,000px blueprint started at the top. */
  try { frame.focus(); } catch (e) { /* older engines */ }
}
delegate(document, 'click', '[data-action="video-play"]', (e, el) => play(el.closest('.vid')));

/** Fill the empty [data-vkey] slots that steps.js / library.js leave behind. */
export function fillSlots(slots) {
  for (const slot of slots) {
    const vids = approvedFor(slot.getAttribute('data-vkey'));
    const block = watchBlock(vids);
    if (block) { slot.replaceChildren(block); slot.hidden = false; }
  }
}
