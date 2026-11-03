/**
 * P3-07 browser verification, step 2b: wait until the streaming turn settles and
 * the action card exists.
 *
 * The previous step's send succeeded; the evaluate that followed was rejected
 * because the page was mid-stream, not because anything failed. This polls
 * patiently and reports the card once the turn is done.
 */
import { evaluate, SLEEP } from './cdp.mjs'

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function tryEval(expression) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await evaluate(expression)
    } catch (error) {
      if (!/synchronize|cooperation|content changed/i.test(String(error))) throw error
      await sleep(1500)
    }
  }
  return undefined
}

const deadline = Date.now() + 240_000
let last
while (Date.now() < deadline) {
  last = await tryEval(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const hit = cards.find(c => /P307 actions/.test(c.textContent || ''));
    if (!hit) return JSON.stringify({ found: false, cards: cards.length });
    const buttons = [...hit.querySelectorAll('button')].map(b => b.textContent.trim());
    const slider = hit.querySelector('input[type=range]');
    return JSON.stringify({
      found: true,
      text: hit.textContent.slice(0, 100),
      buttons,
      slider: slider ? { value: slider.value, disabled: slider.disabled } : null,
    });
  })()`)
  if (last?.found) break
  await sleep(3000)
}
console.log('card:', JSON.stringify(last, null, 1))
