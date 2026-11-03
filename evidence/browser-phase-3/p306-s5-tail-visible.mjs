/**
 * P3-06 browser verification, step 5: is a freshly drawn card visible while the
 * turn is folded?
 *
 * This is the acceptance case. No CSS property is forced: the script reports the
 * card's rect, whether any ancestor is skipping paint, and — the decisive part —
 * whether the turn-tail surface mounted a second instance of the card outside
 * the fold.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    const chain = [];
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') chain.push(String(p.className || p.tagName).slice(0, 26));
      p = p.parentElement; d += 1;
    }
    const s = el.querySelector('input[type=range]');
    return {
      path: el.getAttribute('data-openui-card') ? el.getAttribute('data-openui-card').split('\\\\').pop() : null,
      text: el.textContent.slice(0, 40),
      value: s ? s.value : null,
      rect: { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) },
      inViewport: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight,
      paintSkippedBy: chain,
      painted: chain.length === 0,
    };
  };
  return JSON.stringify({
    total: cards.length,
    cards: cards.map(describe),
    folds: [...document.querySelectorAll('button')]
      .filter(b => /已完成|用时/.test(b.textContent || ''))
      .map(b => b.textContent.trim().slice(0, 20)),
  }, null, 1);
})()`)
console.log(report)
