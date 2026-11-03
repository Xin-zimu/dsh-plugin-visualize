/**
 * Send whatever is currently in the composer, with a real click.
 *
 * The `fill` action sets the text but the send Button stays disabled until the
 * host sees a trusted input event, so submission has to go through `step click`
 * rather than a scripted `.click()` — a synthetic click is not what a user does,
 * and the earlier phase learned the same lesson.
 */
import { click, evaluate, SLEEP } from './cdp.mjs'

const SEND = 'button[aria-label="发送消息"], button[aria-label="Send message"]'

const before = await evaluate(`(function () {
  const composer = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    composerLength: (composer.textContent || '').length,
    composerEmpty: (composer.textContent || '').trim() === '',
    sendDisabled: send === null ? null : send.disabled,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('before:', JSON.stringify(before))

if (before.composerEmpty) {
  console.log('composer is empty — nothing to send')
  process.exit(0)
}

console.log('click:', await click(SEND, 'send'))
await SLEEP(4000)

const after = await evaluate(`(function () {
  const composer = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({
    composerLength: (composer.textContent || '').length,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('after:', JSON.stringify(after))
