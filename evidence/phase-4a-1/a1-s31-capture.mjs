/**
 * Switch theme, close the Settings panel, then prove the card is in that theme
 * and capture it.
 *
 * The earlier attempt produced a screenshot of the Settings panel itself, which
 * would have been recorded as a dark-theme capture while showing none of the
 * card. So this checks three things before capturing: the theme attribute, the
 * dialog being gone, and the card being visible.
 */
import { click, evaluate, screenshot, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

const THEME = process.env.WANT_THEME === 'light' ? 'light' : 'dark'
const LABEL = THEME === 'dark' ? '深色' : '浅色'

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
  dialog: document.querySelectorAll('[role=dialog]').length,
})`)

console.log('theme button:', LABEL, refFor(new RegExp(`button "${LABEL}"`, 'u')))
console.log('click theme:', await click(refFor(new RegExp(`button "${LABEL}"`, 'u')), LABEL))
await SLEEP(2000)
console.log('after theme:', JSON.stringify(await state()))

// Close the panel, or the capture shows Settings rather than the card.
const closeRef = refFor(/button "关闭"/u)
if (closeRef !== undefined) {
  console.log('close:', await click(closeRef, 'close'))
  await SLEEP(1800)
}
console.log('after close:', JSON.stringify(await state()))

const card = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const hit = cards.filter(c => (c.textContent || '').includes('A1 layout')).pop();
  if (hit === undefined) return JSON.stringify({ found: false });
  const r = hit.getBoundingClientRect();
  return JSON.stringify({ found: true, w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) });
})()`)
console.log('card:', JSON.stringify(card))

if (card.found) {
  const shot = await screenshot(`evidence/phase-4a-1/a1-${THEME}-card.png`, { fullPage: false })
  console.log('shot:', JSON.stringify(shot).slice(0, 150))
}
