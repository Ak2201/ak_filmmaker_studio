/* Click-to-load YouTube facade. Nothing touches the network before a click. */
import '../styles/video.css';
import { h, delegate } from '../lib/dom.js';
import { approvedFor } from '../lib/videos.js';

const ALLOW = 'autoplay; encrypted-media; picture-in-picture; fullscreen';

export function facade(v) {
  return h('div.vid', { 'data-yt': v.yt, 'data-title': v.title }, [
    h('button.vid-play', {
      type: 'button', 'data-action': 'video-play',
      'aria-label': 'Play: ' + v.title + ' (' + v.channel + ')'
    }, [
      h('span.vid-icon', { 'aria-hidden': 'true', text: '▶' }),
      h('span.vid-meta', {}, [
        h('span.vid-title', { text: v.title }),
        h('span.vid-sub', { text: v.channel + (v.minutes ? ' · ' + v.minutes + ' min' : '') })
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
