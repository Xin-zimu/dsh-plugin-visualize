/**
 * Stage 3 / P3-05, step 7: open the folded turn so the card is actually painted,
 * then capture it.
 *
 * The card lives in a `callRow` inside the finished turn, which the host folds
 * by default. The measurement already proved the value is 6 after the reload;
 * this exists so the screenshot shows it rather than asserting it.
 */
import { evaluate, SLEEP, screenshot } from './cdp.mjs'

const opened = await evaluate(`(function () {
  // The turn's own disclosure control carries the elapsed-time summary.
  const toggles = [...document.querySelectorAll('button')]
    .filter(b => /已完成|Completed|用时/.test(b.textContent || ''));
  if (toggles.length === 0) return JSON.stringify({ opened: false, why: 'no disclosure' });
  toggles[toggles.length - 1].click();
  return JSON.stringify({ opened: true, label: toggles[toggles.length - 1].textContent.trim().slice(0, 40) });
})()`)
console.log('open:', JSON.stringify(opened))
await SLEEP(1500)

const view = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!card) return JSON.stringify({ found: false });
  card.scrollIntoView({ block: 'center' });
  const r = card.getBoundingClientRect();
  const s = card.querySelector('input[type=range]');
  return JSON.stringify({
    found: true,
    top: Math.round(r.top),
    h: Math.round(r.height),
    text: (card.textContent || '').slice(0, 60),
    value: s ? s.value : null,
  });
})()`)
console.log('view:', view)
await SLEEP(1000)

const out = 'D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-card-value-6.png'
console.log(JSON.stringify(await screenshot(out)))
