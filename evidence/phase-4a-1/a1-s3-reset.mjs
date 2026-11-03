/**
 * Reset the page, then put a short request in the composer.
 *
 * The first `fill` left the host's draft editor in a crashed state
 * (`TypeError: text.replace is not a function` in `DraftEditorRuntime.setDraft`),
 * after which every send reported success and nothing was sent. A reload is the
 * only clean reset: the crash is in the host's editor, not in this plugin.
 */
import { evaluate, fill, navigate, SLEEP } from './cdp.mjs'

const URL = process.env.DSH_URL
if (!URL) throw new Error('set DSH_URL')

await navigate(URL)
await SLEEP(7000)

const composer = '[contenteditable=true][role=textbox]'
const PROMPT = 'Reply with the single word: ready.'

console.log('fill:', JSON.stringify(await fill(composer, PROMPT)).slice(0, 100))
await SLEEP(1000)

const state = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    length: (box.textContent || '').length,
    sendDisabled: send === null ? null : send.disabled,
  });
})()`)
console.log('state:', JSON.stringify(state))
