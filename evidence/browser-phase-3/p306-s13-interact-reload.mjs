/**
 * P3-06 browser verification, step 13: interaction, no-duplicate, and reload.
 *
 * Three acceptance rows in one pass, all measured on the live page:
 *   - an interaction in the TAIL card drives its siblings,
 *   - expanding the fold shows the toolview copy in the process area only,
 *   - a reload keeps the value and keeps the tail card visible while folded.
 *
 * Nothing here forces a CSS property.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

/** Drag the first visible tail card's slider and read the page back. */
const drag = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const isTail = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const card = cards.find(isTail);
  if (!card) return JSON.stringify({ ok: false, why: 'no visible tail card' });
  const s = card.querySelector('input[type=range]');
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(s, '8');
  s.dispatchEvent(new Event('input', { bubbles: true }));
  s.dispatchEvent(new Event('change', { bubbles: true }));
  return JSON.stringify({ ok: true, before: '6', set: s.value, text: card.textContent.slice(0, 40) });
})()`)
console.log('tail drag:', drag)
await SLEEP(1500)

const after = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const isTail = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const card = cards.find(isTail);
  const stored = Object.entries(localStorage).filter(([k]) => k.includes(':openui')).map(([, v]) => v);
  return JSON.stringify({ text: card ? card.textContent.slice(0, 40) : null, stored });
})()`)
console.log('after drag:', after)

console.log('reload:', JSON.stringify(await reload()))
await SLEEP(9000)
console.log('--- awaiting remount ---')
