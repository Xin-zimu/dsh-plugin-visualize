/**
 * Walk the Settings panel to the appearance control and switch the theme.
 *
 * Each step reports what the page says, because this host's menu structure is
 * not something to guess: a wrong label silently does nothing and the
 * measurement would then run in the wrong theme.
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

const themeState = () => evaluate(`JSON.stringify({
  dark: document.body.hasAttribute('data-ds-dark-theme'),
  scheme: getComputedStyle(document.body).colorScheme,
})`)

// Step 1: the settings menu, then the General entry inside it.
if (refFor(/dialog|menu "设置"/u) !== undefined || refFor(/通用设置/u) !== undefined) {
  const general = refFor(/通用设置/u)
  if (general !== undefined) {
    console.log('general:', general, await click(general, 'general'))
    await SLEEP(2500)
  }
}

// Step 2: whatever the panel now offers.
const dump = await evaluate(`JSON.stringify({
  text: (document.body.innerText || '').slice(0, 1200),
})`)
console.log('panel text:', dump.text.slice(-700))

// Step 3: the appearance radios, if they are in the tree.
const labels = observeText().split('\n').filter(row => /深色|浅色|外观|Dark|Light/u.test(row))
console.log('theme rows:', JSON.stringify(labels, null, 1))
