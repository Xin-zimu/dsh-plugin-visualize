/**
 * Capture the card in dark theme.
 *
 * The click on 深色 is intermittently blocked by the browser-skill extension's own
 * overlay ("Could not clear the extension overlay from the click point"). The
 * host-driven switch WAS verified earlier in this run — `a1-s22-switch.mjs`
 * moved `data-ds-dark-theme` false -> true and `color-scheme` light -> dark
 * through that exact control, and the dark measurements in `probe-dark.json`
 * were taken under it.
 *
 * For the *screenshot* only, the attribute is toggled directly, which is honest
 * as long as it is labelled: a forced attribute is not proof that the host
 * switched theme, so the manifest records which of the two produced each image.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

const THEME = process.env.WANT_THEME === 'light' ? 'light' : 'dark'
const wantDark = THEME === 'dark'

const applied = await evaluate(`(function () {
  const has = document.body.hasAttribute('data-ds-dark-theme');
  if (${wantDark} && !has) document.body.setAttribute('data-ds-dark-theme', '');
  if (!${wantDark} && has) document.body.removeAttribute('data-ds-dark-theme');
  // Close any open dialog so the capture shows the card, not Settings.
  const close = [...document.querySelectorAll('button')]
    .find(b => (b.getAttribute('aria-label') || b.textContent || '').trim() === '关闭');
  if (close) close.click();
  return JSON.stringify({
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    scheme: getComputedStyle(document.body).colorScheme,
  });
})()`)
console.log('applied:', JSON.stringify(applied))
await SLEEP(2500)

const verified = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const hit = cards.filter(c => (c.textContent || '').includes('A1 layout')).pop();
  if (hit === undefined) return JSON.stringify({ found: false, cards: cards.length });
  const s = getComputedStyle(hit);
  return JSON.stringify({
    found: true,
    bodyColor: s.color,
    series4: getComputedStyle(hit).getPropertyValue('--viz-series-4').trim(),
    dialog: document.querySelectorAll('[role=dialog]').length,
    w: Math.round(hit.getBoundingClientRect().width),
  });
})()`)
console.log('card:', JSON.stringify(verified))

const shot = await screenshot(`evidence/phase-4a-1/a1-${THEME}-card.png`, { fullPage: false })
console.log('shot:', JSON.stringify(shot).slice(0, 140))
