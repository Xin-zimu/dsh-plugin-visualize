/**
 * P3-06 browser verification, step 12: record what the user actually sees, and
 * capture it with no CSS overrides of any kind.
 *
 * The card must be visible in the tail because the plugin put it there, not
 * because this script made a hidden subtree paint. So this reports the visible
 * tail card's own computed style and rect, then captures the viewport as-is.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

const visible = await evaluate(`(function () {
  const all = [];
  for (const el of document.querySelectorAll('[data-openui-card]')) {
    const r = el.getBoundingClientRect();
    let p = el.parentElement, chain = 0, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') chain += 1;
      p = p.parentElement; d += 1;
    }
    if (chain === 0 && r.height > 0) {
      const s = el.querySelector('input[type=range]');
      all.push({
        text: el.textContent.slice(0, 40),
        value: s ? s.value : null,
        rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
        display: getComputedStyle(el).display,
        visibility: getComputedStyle(el).visibility,
        opacity: getComputedStyle(el).opacity,
      });
    }
  }
  if (all.length === 0) return JSON.stringify({ visibleTails: 0 });
  const first = [...document.querySelectorAll('[data-openui-card]')].find(el => {
    const r = el.getBoundingClientRect();
    let p = el.parentElement, chain = 0, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') chain += 1;
      p = p.parentElement; d += 1;
    }
    return chain === 0 && r.height > 0;
  });
  first.scrollIntoView({ block: 'center' });
  return JSON.stringify({ visibleTails: all.length, cards: all }, null, 1);
})()`)
console.log('visible tail cards:', visible)
await SLEEP(1200)

const out = 'D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p306-tail-visible.png'
console.log(JSON.stringify(await screenshot(out)))
