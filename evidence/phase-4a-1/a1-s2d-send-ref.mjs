/**
 * Send by clicking the observed send Button ref, then report what happened.
 *
 * Selecting by CSS matched a Button that reported success while the composer
 * kept its text, so this uses the accessibility tree's own ref instead — the
 * element the observation calls "发送消息".
 */
import { evaluate, SLEEP, sync } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

const observation = JSON.parse(raw(['observe', '--session', SESSION, '--json']))
const line = observation.text.split('\n').find(row => /button "发送消息"/u.test(row))
console.log('send row:', line ?? '(not found)')
const ref = line?.match(/@(e\d+)/u)?.[1]

if (ref === undefined) {
  console.log('no send ref')
  process.exit(0)
}

const context = await sync()
const out = JSON.parse(raw([
  'step', '--session', SESSION, '--action', 'click',
  '--params', JSON.stringify({ ref: `@${ref}` }), '--context', context, '--json',
]))
console.log('click:', JSON.stringify(out).slice(0, 200))

await SLEEP(6000)
const after = await evaluate(`(function () {
  const composer = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({
    length: (composer.textContent || '').length,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('after:', JSON.stringify(after))
