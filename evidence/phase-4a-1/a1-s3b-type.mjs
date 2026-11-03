/**
 * Type into the composer with real keystrokes instead of `fill`.
 *
 * The host's draft editor crashes on `fill` (`DraftEditorRuntime.setDraft`
 * receives a non-string), which leaves the editor unusable and makes every
 * later send a no-op. Typing goes through the same event path a person uses, so
 * it avoids whatever shape `fill` passes in.
 */
import { click, evaluate, press, SLEEP, sync } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

const COMPOSER = '[contenteditable=true][role=textbox]'
const TEXT = process.env.PROMPT_TEXT
if (!TEXT) throw new Error('set PROMPT_TEXT')

await click(COMPOSER, 'composer')
await SLEEP(300)

// One character per action keeps each step ordinary; Enter would submit, so it
// is never one of them.
let typed = 0
for (const character of TEXT) {
  if (character === '\n') continue
  const context = await sync()
  try {
    const out = JSON.parse(raw([
      'step', '--session', SESSION, '--action', 'press',
      '--params', JSON.stringify({ key: character }), '--context', context, '--json',
    ]))
    if (out.ok) typed += 1
  } catch (error) {
    console.log('press failed at', typed, String(error.message).slice(0, 120))
    break
  }
}

const state = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    typed: ${typed},
    length: (box.textContent || '').length,
    head: (box.textContent || '').slice(0, 40),
    sendDisabled: send === null ? null : send.disabled,
  });
})()`)
console.log('state:', JSON.stringify(state))
