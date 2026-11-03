/**
 * P3-06 browser verification, step 4: generate a card in a fresh turn.
 *
 * The replayed turn from the previous phase produced no turn-tail entry, which
 * may be a replay artefact rather than a render bug. A new turn is the user path
 * the acceptance table actually names ("正常生成"), so this draws one and then
 * measures it.
 */
import { fill, press, evaluate, SLEEP } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'

const PROMPT = [
  'Use the visualize tool with backend "openui", not html.',
  'Draw a card titled "P306 tail": a Col whose first child is Slider($count, 1, 10, 1, "count")',
  'and whose second child is Text("count " + @Format($count, "number")).',
  'Declare $count = 3 above it. Keep it under 6 lines and do not explain.',
].join(' ')

console.log('fill:', JSON.stringify(await fill(COMPOSER, PROMPT)))
await SLEEP(900)
console.log('typed:', JSON.stringify(await evaluate(`(function () {
  const b = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ len: b ? b.innerText.length : -1 });
})()`)))

// Send with the composer's own send control, which is enabled once text lands.
const sent = await evaluate(`(function () {
  const btns = [...document.querySelectorAll('button')];
  const send = btns.find(b => /发送消息|Send message/.test(b.getAttribute('aria-label') || ''));
  if (!send) return JSON.stringify({ sent: false, why: 'no send button' });
  if (send.disabled) return JSON.stringify({ sent: false, why: 'disabled' });
  send.click();
  return JSON.stringify({ sent: true });
})()`)
console.log('send:', sent)
await SLEEP(2500)
