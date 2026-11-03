/**
 * Reload the page and report the composer state, touching nothing.
 *
 * `fill` is avoided entirely: on this host build it crashes the draft editor,
 * so any script that fills is a script that breaks the next send.
 */
import { evaluate, navigate, SLEEP } from './cdp.mjs'

const URL = process.env.DSH_URL
if (!URL) throw new Error('set DSH_URL')

await navigate(URL)
await SLEEP(7000)

const state = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    length: (box === null ? -1 : (box.textContent || '').length),
    sendDisabled: send === null ? null : send.disabled,
    cards: document.querySelectorAll('[data-openui-card]').length,
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
  });
})()`)
console.log('state:', JSON.stringify(state))
