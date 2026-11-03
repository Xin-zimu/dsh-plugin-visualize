/**
 * Print every card in the conversation and the list rows inside each.
 *
 * The previous probe reported 50 list rows, which is far more than one card
 * contains. The cause is that repeated runs added cards: the conversation now
 * holds several A2 cards, and a probe that says "the last card" is measuring a
 * different element each time the page re-renders. That is a measurement bug
 * that would silently mix results between runs, so this enumerates them.
 */
import { evaluate } from '../lib/cdp.mjs'

const facts = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  return JSON.stringify(cards.map((card, index) => {
    const items = [...card.querySelectorAll('[role="listitem"]')];
    return {
      index,
      path: (card.getAttribute('data-openui-card') || '').split('\\\\').pop(),
      listRows: items.length,
      hiddenMarkers: items.map(li => {
        const first = li.children[0];
        return first === undefined ? null : (first.textContent || '').trim();
      }),
      text: (card.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 90),
      anchors: [...card.querySelectorAll('a')].map(a => a.getAttribute('href')),
    };
  }), null, 1);
})()`)

console.log(facts)
