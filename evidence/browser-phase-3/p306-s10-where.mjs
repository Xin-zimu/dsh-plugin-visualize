/**
 * P3-06 browser verification, step 10: where is the HTML control card?
 *
 * Two iframes exist. The question is whether the second one is a turn-tail
 * duplicate (which would mean the entry does mount here, and only the OpenUI
 * branch is missing) or both are toolview frames for two calls (which would mean
 * the entry declines on this host for both backends).
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  return JSON.stringify({
    frames: [...document.querySelectorAll('iframe')].map(f => {
      const r = f.getBoundingClientRect();
      const chain = [];
      let p = f.parentElement, d = 0;
      while (p && p !== document.documentElement && d < 30) {
        const cs = getComputedStyle(p);
        if (cs.contentVisibility && cs.contentVisibility !== 'visible') chain.push(String(p.className || p.tagName).slice(0, 22));
        p = p.parentElement; d += 1;
      }
      return {
        title: f.title,
        top: Math.round(r.top),
        h: Math.round(r.height),
        hiddenBy: chain,
        visible: chain.length === 0 && r.height > 0,
      };
    }),
    cards: [...document.querySelectorAll('[data-openui-card]')].map(c => c.textContent.slice(0, 28)),
  }, null, 1);
})()`)
console.log(facts)
