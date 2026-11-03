/**
 * Switch the host theme through the host's own 外观 control, one step at a time.
 *
 * `probe.mjs --what=theme` does this in one pass and reports BLOCKED when the
 * page has not repainted by the time it re-reads. That is the right *verdict*
 * (a forced attribute would measure a theme the host never renders), but a
 * single blocked run does not distinguish "the control was never clicked" from
 * "the click landed and the theme repainted late".
 *
 * This does the same clicks with a longer settle and prints what each step saw,
 * so the acceptance run can say which happened. The theme is still only ever
 * changed through the host's own control; `data-ds-dark-theme` is never set.
 *
 * Usage: node evidence/phase-4a-2/switch-theme.mjs --want=dark|light
 */
import { evaluate, click, refFor } from '../lib/cdp.mjs'

const argv = process.argv.slice(2)
const want = (argv.find(a => a.startsWith('--want=')) ?? '--want=dark').slice(7)
const label = want === 'dark' ? '深色' : '浅色'

const state = async () => await evaluate(`JSON.stringify({ dark: document.body.hasAttribute('data-ds-dark-theme'), scheme: getComputedStyle(document.body).colorScheme, dialogs: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length })`)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

console.log(`before: ${JSON.stringify(await state())}`)

// Re-open Settings if its panel is not already showing the appearance control.
if (refFor(new RegExp(`button "${label}"`, 'u')) === undefined) {
  const settings = refFor(/button "设置 \[has-submenu\]"/u)
  if (settings !== undefined) {
    await click(settings, 'settings')
    await sleep(2500)
  }
  const general = refFor(/通用设置/u)
  if (general !== undefined) {
    await click(general, 'general')
    await sleep(2200)
  }
}

const target = refFor(new RegExp(`button "${label}"`, 'u'))
if (target === undefined) {
  console.error(`BLOCKED: the host's ${label} control is not in the accessibility tree`)
  process.exit(2)
}
await click(target, label)
console.log(`clicked ${label}`)

// Poll rather than sleep once: the host writes an attribute and re-themes the
// document, and that is not synchronous with the click.
let after = await state()
for (let attempt = 0; attempt < 20 && after.dark !== (want === 'dark'); attempt += 1) {
  await sleep(500)
  after = await state()
}
console.log(`after: ${JSON.stringify(after)}`)

if (after.dark !== (want === 'dark')) {
  console.error(`BLOCKED: asked for ${want} through the host control and the host did not switch`)
  process.exit(2)
}
console.log('THEME SWITCHED')

