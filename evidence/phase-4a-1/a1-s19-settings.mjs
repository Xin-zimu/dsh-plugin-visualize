/**
 * Open the host's Settings and find the appearance control.
 *
 * The theme must be switched through the host's own Settings → 通用设置 → 外观
 * control, as in stage 1.3 — not by setting a class or an attribute. Forcing the
 * theme would prove the CSS works under a theme the host does not actually use,
 * and would leave the measurement unable to say "in the real host".
 */
import { click, evaluate, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

function refFor(pattern) {
  const out = raw(['observe', '--session', SESSION, '--json'])
  const line = JSON.parse(out).text.split('\n').find(row => pattern.test(row))
  return line?.match(/@(e\d+)/u)?.[0]
}

console.log('settings ref:', refFor(/button "设置"/u))
console.log('open settings:', await click(refFor(/button "设置"/u), 'settings'))
await SLEEP(3000)

const state = await evaluate(`(function () {
  const text = document.body.innerText || '';
  return JSON.stringify({
    hasAppearance: /外观|Appearance/.test(text),
    hasGeneral: /通用设置|General/.test(text),
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    tail: text.slice(0, 900),
  });
})()`)
console.log(JSON.stringify(state, null, 1))
