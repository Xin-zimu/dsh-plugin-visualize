/**
 * Reload and re-read the conversation.
 *
 * Three `api/session/prompt` calls returned 200 while the conversation pane
 * showed no messages, and the console carries a crashing
 * `conversation.session` slot. If a reload paints the turns, the send worked
 * and only the live render was broken.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

console.log('reload:', JSON.stringify(await reload()).slice(0, 120))
await SLEEP(9000)

const report = await evaluate(`(function () {
  const text = document.body.innerText || '';
  return JSON.stringify({
    title: document.title,
    openuiCards: document.querySelectorAll('[data-openui-card]').length,
    unre: document.querySelectorAll('[data-openui-unrendered]').length,
    textLength: text.length,
    tail: text.slice(-1200),
  });
})()`)
console.log(JSON.stringify(report, null, 1))
