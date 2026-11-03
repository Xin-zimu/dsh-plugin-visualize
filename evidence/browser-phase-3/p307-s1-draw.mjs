/**
 * P3-07 browser verification, step 2: draw a card whose Buttons carry the three
 * supported actions, so the dispatcher is exercised by a real program.
 *
 * The program has to stay one statement per physical line (the language has no
 * line continuation), and the Slider and the Text are there to prove a Button's
 * write reaches the same state a control writes.
 */
import { fill, evaluate, SLEEP } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'

const PROMPT = [
  'Use the visualize tool with backend "openui", not html.',
  'Draw a card titled "P307 actions" with exactly this structure, one statement per line:',
  '$count = 3 and $step = 1.',
  'A Button labelled "set6" whose action is @Set($count, 6).',
  'A Button labelled "reset" whose action is @Reset().',
  'A Button labelled "combo" whose action is Action([@Set($count, 2), @Set($step, 5)]).',
  'A Slider bound to $count from 1 to 10 step 1, labelled "count".',
  'A Text showing "count " plus @Format($count, "number") and " step " plus @Format($step, "number").',
  'Put every statement on its own physical line. Do not explain.',
].join(' ')

console.log('fill:', JSON.stringify(await fill(COMPOSER, PROMPT)).slice(0, 90))
await SLEEP(900)

const sent = await evaluate(`(function () {
  const send = [...document.querySelectorAll('button')]
    .find(b => /发送消息|Send message/.test(b.getAttribute('aria-label') || ''));
  if (!send || send.disabled) return JSON.stringify({ sent: false });
  send.click();
  return JSON.stringify({ sent: true });
})()`)
console.log('send:', sent)
await SLEEP(3000)

/** Wait for the new card to settle. */
const deadline = Date.now() + 200_000
let last
while (Date.now() < deadline) {
  last = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const hit = cards.find(c => /P307 actions/.test(c.textContent || ''));
    if (!hit) return JSON.stringify({ found: false, cards: cards.length });
    const buttons = [...hit.querySelectorAll('button')].map(b => b.textContent.trim());
    const slider = hit.querySelector('input[type=range]');
    return JSON.stringify({
      found: true,
      text: hit.textContent.slice(0, 90),
      buttons,
      slider: slider ? { value: slider.value, disabled: slider.disabled } : null,
    });
  })()`)
  if (last.found) break
  await SLEEP(3000)
}
console.log('card:', JSON.stringify(last, null, 1))
