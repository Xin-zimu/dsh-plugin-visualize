/**
 * Type text into the composer, mapping characters to the key names `press`
 * accepts.
 *
 * A literal space is not a valid key name, so each character is tried and the
 * first spelling that works is kept for the rest of the run.
 */
import { click, evaluate, SLEEP, sync } from './cdp.mjs'
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

/** Key names for the characters that are not literal. */
const NAMED = {
  ' ': ['Space', ' '],
  '\n': ['Enter'],
}

/** Type one key, trying each candidate spelling until one is accepted. */
async function typeOne(character) {
  const candidates = NAMED[character] ?? [character]
  let lastError
  for (const key of candidates) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const context = await sync()
      try {
        const out = JSON.parse(raw([
          'step', '--session', SESSION, '--action', 'press',
          '--params', JSON.stringify({ key }), '--context', context, '--json',
        ]))
        if (out.ok) return key
        lastError = new Error(JSON.stringify(out).slice(0, 160))
      } catch (error) {
        lastError = error
        if (!/content changed|covered|not_visible|cooperat/u.test(String(error.message))) break
      }
      await SLEEP(250)
    }
  }
  throw new Error(`could not type ${JSON.stringify(character)}: ${String(lastError?.message ?? '').slice(0, 160)}`)
}

await click(COMPOSER, 'composer')
await SLEEP(300)

const chosen = {}
let typed = ''
for (const character of TEXT) {
  const key = await typeOne(character)
  chosen[character === ' ' ? '<space>' : character] = key
  typed += character
}

const state = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    length: (box.textContent || '').length,
    head: (box.textContent || '').slice(0, 60),
    sendDisabled: send === null ? null : send.disabled,
  });
})()`)
console.log('chosen keys:', JSON.stringify(chosen))
console.log('typed:', JSON.stringify(typed.slice(0, 80)))
console.log('state:', JSON.stringify(state))
