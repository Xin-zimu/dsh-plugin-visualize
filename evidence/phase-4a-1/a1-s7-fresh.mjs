/**
 * Start a fresh conversation, then draw the 4A-1 card in it.
 *
 * The existing session carries a long history and several prior cards; its
 * restored draft is what crashes the host's `DraftEditorRuntime.setDraft`
 * (`text.replace is not a function`) and leaves the composer unsendable. A new
 * session has no restored draft, so the same flow can be measured.
 */
import { click, evaluate, fill, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'
const SEND = 'button[aria-label="发送消息"], button[aria-label="Send message"]'

/** The ref the accessibility tree gives an element matching `pattern`. */
function refFor(pattern) {
  const out = execFileSync('bsk', ['observe', '--session', SESSION, '--json'], {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
  const line = JSON.parse(out).text.split('\n').find(row => pattern.test(row))
  return line?.match(/@(e\d+)/u)?.[0]
}

console.log('new session:', await click(refFor(/button "新建会话"/u), 'new session'))
await SLEEP(5000)

const state = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    url: location.href.replace(/token=[^&]+/, 'token=…'),
    len: box === null ? -1 : (box.textContent || '').length,
    sendDisabled: send === null ? null : send.disabled,
    cards: document.querySelectorAll('[data-openui-card]').length,
    messages: document.querySelectorAll('[data-testid="message"], .message').length,
  });
})()`)
console.log('fresh state:', JSON.stringify(state))

// A tiny message first: proves the composer can submit at all in this session,
// before any question about card rendering is asked.
console.log('fill:', JSON.stringify(await fill(COMPOSER, 'Reply with exactly: PING')).slice(0, 100))
await SLEEP(1200)
console.log('send:', await click(SEND, 'send'))
await SLEEP(8000)

const after = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const text = document.body.innerText || '';
  return JSON.stringify({
    len: box === null ? -1 : (box.textContent || '').length,
    sawPing: /PING/.test(text),
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('after:', JSON.stringify(after))
