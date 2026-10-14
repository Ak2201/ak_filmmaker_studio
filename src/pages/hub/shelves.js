/* ============================================================
   HUB — the knowledge-base strip under the project grid: four of the
   Library's shelves, each a link to its tab on library.html. Titles,
   blurbs and counts come from the same data the Library reads
   (films, directors, rules, watch list), so a count cannot drift from
   the shelf it points at. Stores nothing.
   ============================================================ */
import { h } from '../../lib/dom.js';
import films from '../../data/films.json';
import directors from '../../data/directors.json';
import rules from '../../data/rules.json';
import watchlist from '../../data/watchlist.json';

const WATCH_FILMS = watchlist.reduce((n, w) => n + (w.films ? w.films.length : 0), 0);

function shelfList() {
  return [
    { id: 'films', title: 'Tamil Cinema Craft Library', blurb: films.length + ' films, what to learn from each', n: films.length },
    { id: 'directors', title: 'Director Archetypes', blurb: directors.length + ' voices to study', n: directors.length },
    { id: 'rules', title: 'Rules of Thumb', blurb: 'Craft maxims, attributed', n: rules.length },
    { id: 'watch', title: 'Watch List per Step', blurb: 'Films to study for each blueprint step', n: WATCH_FILMS }
  ];
}

export function shelvesMarkup() {
  return h('section.hub-shelves', { 'aria-labelledby': 'hubShelvesHead' }, [
    h('div.hub-shelves-head', {}, [
      h('h2#hubShelvesHead.hub-shelves-title', {}, [
        h('span.hub-shelves-lab', { text: 'Filmmaker knowledge base' }),
        h('span.hub-shelves-dot', { 'aria-hidden': 'true', text: '•' }),
        h('span.hub-shelves-sub', { text: 'Curated craft shelves' })
      ]),
      h('a.hub-shelves-all', { href: 'library.html', text: 'View all shelves →' })
    ]),
    h('div.hub-shelf-grid', {}, shelfList().map((s) =>
      h('a.hub-shelf', { href: 'library.html#' + s.id }, [
        h('h3', { text: s.title }),
        h('p', { text: s.blurb }),
        h('div.hub-shelf-count', {}, [h('span', { 'aria-hidden': 'true', text: '►' }), s.n + ' on this shelf'])
      ])))
  ]);
}

export default { shelvesMarkup };
