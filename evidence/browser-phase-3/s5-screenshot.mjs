/**
 * Stage 3 / P3-05, step 5: capture the reloaded card.
 *
 * The screenshot is the visual half of the acceptance record; the JSON already
 * captured in s4 is the measured half.
 */
import { screenshot, evaluate, SLEEP } from './cdp.mjs'

await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  if (card) card.scrollIntoView({ block: 'center' });
  return JSON.stringify({ ok: true });
})()`)
await SLEEP(800)
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-state-after-reload.png')))
