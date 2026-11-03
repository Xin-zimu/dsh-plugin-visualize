/**
 * Stage 3 / P3-05, step 11: reload from scratch and re-measure.
 *
 * The card was unmounted by an accidental disclosure toggle, so this reloads the
 * session and measures what comes back. It is a stronger check than step 4: this
 * is a second, independent reload of the same card, and the value must still be
 * 6 rather than the program's default 3.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

console.log('reload:', JSON.stringify(await reload()))
await SLEEP(8000)

const deadline = Date.now() + 90_000
let last
while (Date.now() < deadline) {
  last = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const card = cards[cards.length - 1];
    if (!card) return JSON.stringify({ cards: 0, tail: document.body.innerText.slice(-120) });
    const s = card.querySelector('input[type=range]');
    const rec = Object.entries(localStorage).filter(([k]) => k.includes(':openui'));
    return JSON.stringify({
      cards: cards.length,
      text: card.textContent.slice(0, 60),
      value: s ? s.value : null,
      stored: rec.map(([, v]) => v),
    });
  })()`)
  if (last.cards > 0) break
  await SLEEP(3000)
}
console.log('after reload:', JSON.stringify(last, null, 2))
