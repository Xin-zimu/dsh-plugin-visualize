/**
 * P3-06 browser verification, step 11: does the turn-tail entry mount for the
 * OpenUI turns specifically?
 *
 * The HTML control produced two frames — one inside the fold, one outside it in
 * the turn tail — so the entry mounts on this host and the folding signal is
 * fine. The two OpenUI turns produced no tail at all. That isolates the fault to
 * the OpenUI branch, and this reports what the tail contains per turn.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  // Group every card/frame by the turn it sits in: the fold containers, and the
  // tail containers that are not inside a fold.
  const all = [];
  for (const el of document.querySelectorAll('[data-openui-card], iframe')) {
    const chain = [];
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') chain.push(String(p.className || p.tagName).slice(0, 20));
      p = p.parentElement; d += 1;
    }
    all.push({
      kind: el.tagName === 'IFRAME' ? 'html:' + (el.title || '').slice(0, 22) : 'openui:' + el.textContent.slice(0, 22),
      folded: chain.length > 0,
      foldedBy: chain.slice(0, 2),
    });
  }
  return JSON.stringify({
    surfaces: all,
    foldedCount: all.filter(a => a.folded).length,
    tailCount: all.filter(a => !a.folded).length,
  }, null, 1);
})()`)
console.log(facts)
