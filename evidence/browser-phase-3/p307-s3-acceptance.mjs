/**
 * P3-07 browser verification, step 3: the acceptance matrix, driven by real
 * clicks on a real card.
 *
 * A01 @Set, A03 @Reset, A04 Action([...]) and A02 (repeated use) all reduce to
 * "click a Button, read the card", so each one is measured rather than asserted.
 * Nothing forces a CSS property or calls an internal function: every check goes
 * through a dispatched click, exactly as a reader would.
 */
import { evaluate, SLEEP } from './cdp.mjs'

/** Read the action card's text and slider. */
const READ = `(function () {
  const hit = [...document.querySelectorAll('[data-openui-card]')].find(c => /P307 actions/.test(c.textContent || ''));
  if (!hit) return JSON.stringify({ found: false });
  const slider = hit.querySelector('input[type=range]');
  return JSON.stringify({
    found: true,
    text: hit.textContent.slice(0, 100),
    slider: slider ? slider.value : null,
  });
})()`

/** Click one of the card's Buttons by its label. */
function clickScript(label) {
  return `(function () {
    const hit = [...document.querySelectorAll('[data-openui-card]')].find(c => /P307 actions/.test(c.textContent || ''));
    if (!hit) return JSON.stringify({ clicked: false, why: 'no card' });
    const btn = [...hit.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if (!btn) return JSON.stringify({ clicked: false, why: 'no button' });
    btn.click();
    return JSON.stringify({ clicked: true });
  })()`
}

console.log('initial:', await evaluate(READ))

/** Click, settle, read. */
async function press(label) {
  const out = await evaluate(clickScript(label))
  await SLEEP(900)
  const after = await evaluate(READ)
  console.log(`${label}:`, JSON.stringify(out), '->', after.text)
  return after
}

// A01: @Set($count, 6)
const a01 = await press('set6')
console.log('A01 set ->', a01.text)

// A03: @Reset() returns every declared variable to its default.
await press('set6')
const a03 = await press('reset')
console.log('A03 reset ->', a03.text)

// A04: Action([@Set($count, 2), @Set($step, 5)])
const a04 = await press('combo')
console.log('A04 combo ->', a04.text)

// A02: repeated clicks each recompute from the latest state.
await press('combo')
const a02 = await press('combo')
console.log('A02 repeat ->', a02.text)

// Leave the card in a known state for the reload check.
const final = await press('set6')
console.log('final ->', final.text)

/** Persisted record for this card. */
const stored = await evaluate(`(function () {
  const rows = Object.entries(localStorage).filter(([k]) => k.includes(':openui'));
  return JSON.stringify(rows.map(([k, v]) => ({ key: (k.split('\\\\').pop() || '').slice(0, 60), record: v })));
})()`)
console.log('stored:', stored)
