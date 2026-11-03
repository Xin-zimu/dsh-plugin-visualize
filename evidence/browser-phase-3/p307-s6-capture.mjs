/**
 * P3-07 browser verification, step 6: capture the action card, with no CSS
 * override of any kind.
 *
 * The card is in the turn tail, which is outside the fold, so it paints without
 * help. The check asserts that before capturing: if a fold ancestor were
 * involved, the picture would be worthless as evidence.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

const state = await evaluate(`(function () {
  const isTail = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const hit = [...document.querySelectorAll('[data-openui-card]')]
    .filter(isTail)
    .find(c => /P307 actions/.test(c.textContent || ''));
  if (!hit) return JSON.stringify({ ok: false, why: 'no visible tail card' });
  hit.scrollIntoView({ block: 'center' });
  const r = hit.getBoundingClientRect();
  return JSON.stringify({
    ok: true,
    text: hit.textContent.slice(0, 90),
    rect: { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) },
    noOverrides: !document.querySelector('[data-p3-was-cv]'),
  });
})()`)
console.log('card:', state)
await SLEEP(1200)
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p307-actions-card.png')))
