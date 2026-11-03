/**
 * P3-06 browser verification, step 9: does the turn tail work for HTML here?
 *
 * The turn tail existed for HTML cards before this phase. If an HTML card also
 * produces no tail entry on this host, the cause is the folding signal the entry
 * gates on — not the OpenUI dispatch this phase changed. That is the difference
 * between "my fix is wrong" and "this host reports no folding", and it must be
 * settled by experiment rather than assumed.
 */
import { evaluate, fill, SLEEP } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'

const PROMPT = [
  'Use the visualize tool with backend "html".',
  'Render a small card titled "P306 html control" containing a heading and one paragraph.',
  'Do not use any script. Do not explain.',
].join(' ')

console.log('fill:', JSON.stringify(await fill(COMPOSER, PROMPT)).slice(0, 120))
await SLEEP(900)

const sent = await evaluate(`(function () {
  const btns = [...document.querySelectorAll('button')];
  const send = btns.find(b => /发送消息|Send message/.test(b.getAttribute('aria-label') || ''));
  if (!send || send.disabled) return JSON.stringify({ sent: false });
  send.click();
  return JSON.stringify({ sent: true });
})()`)
console.log('send:', sent)
await SLEEP(3000)

/** Wait for an HTML iframe card to settle. */
const deadline = Date.now() + 180_000
let last
while (Date.now() < deadline) {
  last = await evaluate(`(function () {
    const frames = [...document.querySelectorAll('iframe')];
    const titled = frames.filter(f => /control/i.test(f.title || ''));
    return JSON.stringify({ frames: frames.length, control: titled.length, tail: document.body.innerText.slice(-90) });
  })()`)
  if (last.control > 0) break
  await SLEEP(3000)
}
console.log('html card:', JSON.stringify(last))
