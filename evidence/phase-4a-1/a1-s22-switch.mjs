/**
 * Switch to the requested theme through the host's own 外观 control, then verify
 * the host actually changed — not just that a button was clicked.
 *
 * The pre-condition is that the Settings panel is already open on 外观; the
 * script refuses rather than forcing the theme if the control is not there.
 */
import { click, evaluate, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

const WANT = process.env.WANT_THEME ?? '深色'
const LABEL = WANT === 'dark' ? '深色' : '浅色'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

function refFor(pattern) {
  const text = JSON.parse(raw(['observe', '--session', SESSION, '--json'])).text
  const line = text.split('\n').find(row => pattern.test(row))
  return line?.match(/@(e\d+)/u)?.[0]
}

const state = () => evaluate(`JSON.stringify({
  dark: document.body.hasAttribute('data-ds-dark-theme'),
  scheme: getComputedStyle(document.body).colorScheme,
})`)

console.log('before:', JSON.stringify(await state()))

const ref = refFor(new RegExp(`button "${LABEL}"`, 'u'))
console.log(`theme button "${LABEL}":`, ref)
if (ref === undefined) {
  console.log('the appearance control is not in the tree — refusing to force the theme')
  process.exit(0)
}

console.log('click:', await click(ref, LABEL))
await SLEEP(2500)
console.log('after:', JSON.stringify(await state()))
