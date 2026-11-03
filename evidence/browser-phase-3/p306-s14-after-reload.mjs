/**
 * P3-06 browser verification, step 14: after a reload, is the tail card still
 * there and still 8?
 *
 * This is the combination the acceptance table asks for and the previous phase
 * could not show: a persisted value *and* a card visible outside the fold, on a
 * freshly loaded page, with no styling applied by the test.
 */
import { evaluate, SLEEP } from './cdp.mjs'

/** Reopen the session if the reload landed on the list. */
const opened = await evaluate(`(function () {
  const cards = document.querySelectorAll('[data-openui-card]');
  if (cards.length > 0) return JSON.stringify({ needed: false });
  const items = [...document.querySelectorAll('button, [role=treeitem]')]
    .filter(el => /OpenUI P3 persistence/.test(el.textContent || ''));
  if (items.length === 0) return JSON.stringify({ needed: true, opened: false });
  items[0].click();
  return JSON.stringify({ needed: true, opened: true });
})()`)
console.log('reopen:', opened)
await SLEEP(6000)

const deadline = Date.now() + 60_000
let last
while (Date.now() < deadline) {
  last = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    if (cards.length === 0) return JSON.stringify({ cards: 0 });
    const isTail = (el) => {
      let p = el.parentElement, d = 0;
      while (p && p !== document.documentElement && d < 40) {
        const cs = getComputedStyle(p);
        if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
        p = p.parentElement; d += 1;
      }
      return true;
    };
    const tails = cards.filter(isTail);
    return JSON.stringify({
      cards: cards.length,
      tailCards: tails.length,
      tailTexts: tails.map(c => c.textContent.slice(0, 40)),
      tailValues: tails.map(c => {
        const s = c.querySelector('input[type=range]');
        return s ? s.value : null;
      }),
      stored: Object.entries(localStorage).filter(([k]) => k.includes(':openui')).map(([, v]) => v),
    });
  })()`)
  if (last.cards > 0) break
  await SLEEP(2500)
}
console.log('after reload:', JSON.stringify(last, null, 1))
