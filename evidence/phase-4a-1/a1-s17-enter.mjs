/**
 * Submit with Enter instead of clicking the send Button.
 *
 * The send Button's click point is covered by the browser-skill extension's own
 * overlay ("Could not clear the extension overlay from the click point"), which
 * is a harness limitation rather than anything in the page. Enter is the same
 * submission path from the composer's point of view, and it is not blocked.
 */
import { press, evaluate, SLEEP, sync } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

/** Focus one target by accessibility ref. */
function focusRef(ref) {
  const context = raw(['cooperate', 'sync', '--session', SESSION, '--json'])
  const parsed = JSON.parse(context)
  const args = ['focus', '--session', SESSION, '--context', parsed.context_id]
  if (parsed.observation_id !== undefined) args.push('--observation', parsed.observation_id)
  return JSON.parse(raw([...args, '--json', ref]))
}

const before = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ length: (box.textContent || '').length });
})()`)
console.log('before:', JSON.stringify(before))

try {
  console.log('focus:', JSON.stringify(focusRef('@e209')).slice(0, 80))
} catch (error) {
  console.log('focus by ref failed:', String(error.message).split('\n')[1]?.slice(0, 90))
}

await SLEEP(400)
console.log('enter:', JSON.stringify(await press('Enter')).slice(0, 120))
await SLEEP(8000)

const after = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({
    length: (box.textContent || '').length,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('after:', JSON.stringify(after))
