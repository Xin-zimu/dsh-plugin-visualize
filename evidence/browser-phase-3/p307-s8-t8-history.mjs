/**
 * P3-07 browser verification, step 8: T8 — history replay.
 *
 * The session already holds cards from three different generations: the first
 * `P3 persistence` card (persisted before P3-06), the `P306 tail` card (drawn
 * with the turn-tail fix), and the `P307 actions` card (drawn with Button
 * dispatch). All three must still restore on the tail with their values intact,
 * which is what "old cards still replay" means in practice.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const isTail = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const openui = [...document.querySelectorAll('[data-openui-card]')];
  const html = [...document.querySelectorAll('iframe')];
  const describe = (el) => ({
    text: el.textContent.slice(0, 46),
    value: (function () {
      const s = el.querySelector('input[type=range]');
      return s ? s.value : null;
    })(),
    tail: isTail(el),
  });
  return JSON.stringify({
    openuiTotal: openui.length,
    openuiTails: openui.filter(isTail).map(describe),
    htmlTotal: html.length,
    htmlTitles: [...new Set(html.map(f => f.title))],
    htmlTails: html.filter(isTail).length,
  }, null, 1);
})()`)
console.log('history:', report)
