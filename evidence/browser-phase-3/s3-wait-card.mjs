/**
 * Stage 3 / P3-05, step 3: wait for the model's OpenUI card to settle.
 *
 * Polls for the card's own marker (`[data-openui-card]`), which only the host
 * renderer sets, and reports the bound Slider's value. A timeout is a real
 * result here and is reported as one.
 */
import { evaluate, SLEEP } from './cdp.mjs'

const deadline = Date.now() + 180_000
let last
while (Date.now() < deadline) {
  last = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const card = cards[cards.length - 1];
    if (!card) return JSON.stringify({ cards: 0, busy: /停止|Stop|生成/.test(document.body.innerText.slice(-200)) });
    const slider = card.querySelector('input[type=range]');
    return JSON.stringify({
      cards: cards.length,
      path: card.getAttribute('data-openui-card'),
      text: (card.textContent || '').slice(0, 120),
      hasSlider: !!slider,
      value: slider ? slider.value : null,
      disabled: slider ? slider.disabled : null,
    });
  })()`)
  if (last.cards > 0 && last.hasSlider) break
  await SLEEP(3000)
}
console.log('result:', JSON.stringify(last, null, 2))
