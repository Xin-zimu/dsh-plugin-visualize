/**
 * Send whatever is in the composer, without touching the composer first.
 *
 * The composer already holds the request, so the only action needed is the send
 * Button. Clicking it by its accessibility ref avoids the coordinate check that
 * `Could not clear the extension overlay from the click point` was failing on.
 */
import { click, evaluate, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

function refFor(pattern) {
  const out = execFileSync('bsk', ['observe', '--session', SESSION, '--json'], {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
  const line = JSON.parse(out).text.split('\n').find(row => pattern.test(row))
  return line?.match(/@(e\d+)/u)?.[0]
}

const before = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ length: (box.textContent || '').length, head: (box.textContent || '').slice(0, 40) });
})()`)
console.log('before:', JSON.stringify(before))

const sendRef = refFor(/button "发送消息"/u)
console.log('send ref:', sendRef)
console.log('send:', await click(sendRef, 'send'))
await SLEEP(7000)

const after = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ length: (box.textContent || '').length, cards: document.querySelectorAll('[data-openui-card]').length });
})()`)
console.log('after:', JSON.stringify(after))
