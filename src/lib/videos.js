/* Approved explainer videos, joined to the page at render time.
   videos.json is never written into step JSON (extract regenerates that).
   Keys are documented in video-keys.js. Tolerant of a missing/odd file. */
import data from '../data/videos.json';
import { normKey } from './video-keys.js';

const LIST = Array.isArray(data && data.videos) ? data.videos : [];
const YT = /^[A-Za-z0-9_-]{11}$/;

export function approvedFor(key) {
  return LIST.filter((v) => v && v.approved === true && YT.test(v.yt || '')
    && Array.isArray(v.for) && v.for.some((k) => normKey(k) === normKey(key)));
}
export default { approvedFor };
