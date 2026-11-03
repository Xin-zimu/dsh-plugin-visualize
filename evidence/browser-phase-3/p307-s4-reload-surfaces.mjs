/**
 * P3-07 browser verification, step 4: A07 (a Button's write survives a reload)
 * and A08 (both conversation surfaces read the same state).
 *
 * The card was left with `count 6, step 5` by the acceptance run. After a reload
 * both the toolview copy and the turn-tail copy must show that, because they
 * share one key.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

/** Every action card's text, split by whether it is inside a fold. */
const READ_ALL = `(function () {
  const isTail = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const cards = [...document.querySelectorAll('[data-openui-card]')].filter(c => /P307 actions/.test(c.textContent || ''));
  return JSON.stringify({
    total: cards.length,
    inFold: cards.filter(c => !isTail(c)).length,
    inTail: cards.filter(isTail).length,
    texts: cards.map(c => c.textContent.slice(0, 80)),
  });
})()`

console.log('before reload:', await evaluate(READ_ALL))
console.log('reload:', JSON.stringify(await reload()))
await SLEEP(9000)

/** Reopen the session if the reload landed on the list. */
const opened = await evaluate(`(function () {
  if (document.querySelectorAll('[data-openui-card]').length > 0) return JSON.stringify({ needed: false });
  const items = [...document.querySelectorAll('button, [role=treeitem]')]
    .filter(el => /P307|OpenUI P3/.test(el.textContent || ''));
  if (items.length === 0) return JSON.stringify({ needed: true, opened: false });
  items[0].click();
  return JSON.stringify({ needed: true, opened: true });
})()`)
console.log('reopen:', opened)
await SLEEP(5000)

const deadline = Date.now() + 60_000
let last
while (Date.now() < deadline) {
  last = await evaluate(READ_ALL)
  if (last.total > 0) break
  await SLEEP(2500)
}
console.log('A07/A08 after reload:', JSON.stringify(last, null, 1))
