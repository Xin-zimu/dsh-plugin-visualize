/**
 * Stage 3 / P3-05, step 2: have the model draw an OpenUI card with a bound
 * Slider, so persistence is exercised by a real card and not by a fixture.
 *
 * The composer is a `contenteditable` div (role=textbox), not a textarea, so it
 * is filled through the browser-skill `fill` action, which dispatches the input
 * events the host listens for.
 */
import { fill, press, evaluate, SLEEP, observe } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'

const PROMPT = [
  'Use the visualize tool with backend "openui", not html.',
  'Draw a card titled "P3 persistence": a Col whose first child is Slider($count, 1, 10, 1, "count")',
  'and whose second child is Text("count " + @Format($count, "number")).',
  'Declare $count = 3 above it. Keep it under 6 lines and do not explain.',
].join(' ')

console.log('fill:', JSON.stringify(await fill(COMPOSER, PROMPT)))
await SLEEP(1000)

const typed = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ text: box ? box.innerText.slice(0, 90) : null });
})()`)
console.log('typed:', JSON.stringify(typed))

await press('Enter')
console.log('sent')
await SLEEP(2500)
console.log('--- observe ---')
console.log(observe().text.slice(-1500))
