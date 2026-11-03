/**
 * Stage 3 / P3-05, step 9: expand the tool row so the card is painted, then
 * capture it.
 *
 * The a11y snapshot exposes the tool row ("已调用工具") but not the card inside
 * it, which means the row is collapsed. Expanding is a click on that row's own
 * control; the measurement already proved the value, this is for the picture.
 */
import { click, evaluate, screenshot, observe, SLEEP } from './cdp.mjs'

const before = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  const r = card.getBoundingClientRect();
  return JSON.stringify({ h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.top) });
})()`)
console.log('card rect before:', before)

// Expand the collapsed tool row that holds the card.
console.log('expand:', await click('button', 'tool row'))
await SLEEP(2500)

const after = await evaluate(`(function () {
  const rows = [...document.querySelectorAll('button')].filter(b => /已调用工具/.test(b.textContent || ''));
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  const r = card.getBoundingClientRect();
  const s = card.querySelector('input[type=range]');
  return JSON.stringify({
    rows: rows.length,
    expanded: rows.map(b => b.getAttribute('aria-expanded')),
    rect: { h: Math.round(r.height), top: Math.round(r.top) },
    text: card.textContent.slice(0, 40),
    value: s ? s.value : null,
  });
})()`)
console.log('after expand:', after)

const seen = observe().text
console.log('card in a11y tree:', /count\s*6/.test(seen) ? 'yes' : 'no')
await SLEEP(600)
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-card-expanded.png')))
