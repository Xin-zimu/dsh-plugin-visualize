/**
 * Switch the host theme through its own Settings → 通用设置 → 外观 control.
 *
 * Forcing `data-ds-dark-theme` or a class would measure a theme the host does
 * not really render, and stage 1.3 established this control as the only honest
 * way to say "in the real host". The script reports what it found rather than
 * assuming the menu labels.
 */
import { click, evaluate, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

const WANT = process.env.WANT_THEME ?? 'dark'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

function observeText() {
  return JSON.parse(raw(['observe', '--session', SESSION, '--json'])).text
}

function refFor(pattern) {
  const line = observeText().split('\n').find(row => pattern.test(row))
  return line?.match(/@(e\d+)/u)?.[0]
}

const theme = async () => evaluate(`JSON.stringify({
  dark: document.body.hasAttribute('data-ds-dark-theme'),
  scheme: getComputedStyle(document.body).colorScheme,
})`)

console.log('before:', JSON.stringify(await theme()))

// The Settings entry is a menu button; click it, then read what it opened.
const settingsRef = refFor(/button "设置 \[has-submenu\]"/u)
console.log('settings ref:', settingsRef)
console.log('click settings:', await click(settingsRef, 'settings'))
await SLEEP(2500)

const opened = await evaluate(`JSON.stringify({
  text: (document.body.innerText || '').slice(0, 700),
})`)
console.log('opened:', opened.text)

const general = refFor(/通用设置/u)
console.log('general ref:', general)
if (general !== undefined) {
  console.log('click general:', await click(general, 'general'))
  await SLEEP(2000)
}

const appearance = refFor(/外观/u)
console.log('appearance ref:', appearance)
const panel = await evaluate(`JSON.stringify({ text: (document.body.innerText || '').slice(0, 900) })`)
console.log('panel:', panel.text)
