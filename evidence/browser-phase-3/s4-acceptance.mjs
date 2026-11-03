/**
 * Stage 3 / P3-05, step 4: the acceptance check.
 *
 * Drag the bound Slider 3 -> 6, confirm the sibling Text follows, then reload
 * the page and confirm the card comes back at 6 rather than at its default 3.
 * This is exactly the case S04 failed in stage 2.
 */
import { evaluate, SLEEP, reload } from './cdp.mjs'

/** Read the card's slider value, sibling text and stored record. */
const READ = `(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  if (!card) return JSON.stringify({ cards: 0 });
  const slider = card.querySelector('input[type=range]');
  const store = Object.entries(localStorage)
    .filter(([k]) => k.includes('openui'))
    .map(([k, v]) => ({ k, v }));
  return JSON.stringify({
    cards: cards.length,
    text: (card.textContent || '').slice(0, 120),
    value: slider ? slider.value : null,
    records: store,
  });
})()`

console.log('before:', JSON.stringify(await evaluate(READ), null, 1))

// Drag to 6 with the same event pair a pointer produces.
const drag = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  const s = card.querySelector('input[type=range]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(s, '6');
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return JSON.stringify({ set: s.value });
})()`)
console.log('drag:', JSON.stringify(drag))

// Let the 400 ms debounce land.
await SLEEP(1500)
console.log('after drag:', JSON.stringify(await evaluate(READ), null, 1))

console.log('reloading...')
console.log('reload:', JSON.stringify(await reload()))
await SLEEP(6000)

// Re-read the same card after the reload; the store is a fresh page's.
const after = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  if (!card) return JSON.stringify({ cards: 0, body: document.body.innerText.slice(0, 200) });
  const slider = card.querySelector('input[type=range]');
  return JSON.stringify({
    cards: cards.length,
    text: (card.textContent || '').slice(0, 120),
    value: slider ? slider.value : null,
    records: Object.entries(localStorage).filter(([k]) => k.includes('openui')).map(([k, v]) => ({ k, v })),
  });
})()`)
console.log('after reload:', JSON.stringify(after, null, 1))
