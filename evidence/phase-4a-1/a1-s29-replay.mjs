/**
 * Refresh, history replay, and the two display surfaces.
 *
 * Three questions, all of which stage 3 answered for the components it had and
 * none of which may be assumed for these four:
 *
 * 1. **Both surfaces draw the card** — the toolview copy inside the fold and the
 *    tail copy outside it. A card that only exists inside the fold is invisible
 *    after the host folds a finished turn, which is where the reader looks.
 * 2. **A full reload replays it** without another model call.
 * 3. **The replayed card still lays out** — same tracks, same divider, same
 *    spacer — because a replay that paints but collapses would pass a
 *    simpler test.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

const SURVEY = `(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const hits = cards.filter(c => (c.textContent || '').includes('A1 layout'));
  const inTail = (el) => {
    let node = el;
    while (node !== null && node !== document.body) {
      if (node.matches && node.matches('[data-turn-tail], [class*=turnTail], [class*=turn-tail]')) return true;
      node = node.parentElement;
    }
    return false;
  };
  const describe = (card) => {
    const grids = [...card.querySelectorAll('*')].filter(el => getComputedStyle(el).display === 'grid');
    const sep = [...card.querySelectorAll('[role=separator]')];
    const spacer = [...card.querySelectorAll('[aria-hidden=true]')];
    return {
      tail: inTail(card),
      width: Math.round(card.getBoundingClientRect().width),
      height: Math.round(card.getBoundingClientRect().height),
      grids: grids.map(g => getComputedStyle(g).gridTemplateColumns),
      separator: sep.map(s => ({ h: getComputedStyle(s).height, bg: getComputedStyle(s).backgroundColor })),
      spacer: spacer.map(s => ({ flex: getComputedStyle(s).flex, w: Math.round(s.getBoundingClientRect().width) })),
      unrendered: [...card.querySelectorAll('[data-openui-unrendered]')].length,
    };
  };
  return JSON.stringify({
    total: cards.length,
    hits: hits.length,
    tail: hits.filter(inTail).length,
    fold: hits.filter(c => !inTail(c)).length,
    cards: hits.map(describe),
  }, null, 1);
})()`

console.log('before reload:', JSON.stringify(await evaluate(SURVEY)))

console.log('reload:', JSON.stringify(await reload()).slice(0, 90))
await SLEEP(10000)

const after = await evaluate(SURVEY)
console.log('after reload:', JSON.stringify(after))
