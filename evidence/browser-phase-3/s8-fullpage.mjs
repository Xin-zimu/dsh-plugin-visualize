/**
 * Stage 3 / P3-05, step 8: capture the card element itself.
 *
 * The folded turn clips the transcript region, so a viewport capture can show
 * the conversation without showing the card even when the card is laid out.
 * A full-page capture stitches the real document, which is where the card is.
 */
import { screenshot, evaluate, SLEEP } from './cdp.mjs'

const before = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  const s = card && card.querySelector('input[type=range]');
  return JSON.stringify({ text: card ? card.textContent.slice(0, 40) : null, value: s ? s.value : null });
})()`)
console.log('card:', before)
await SLEEP(400)

const out = 'D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-card-fullpage.png'
console.log(JSON.stringify(await screenshot(out, { fullPage: true })))
