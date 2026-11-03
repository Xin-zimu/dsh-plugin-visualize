/**
 * Stage 3 / P3-05, step 6b: why the card is in the DOM but not in the picture.
 *
 * A finished turn folds its process by default, so an OpenUI card inside it can
 * be present, measured, and still not painted. This walks the card's ancestors
 * looking for the one that hides it, which is a fact worth recording: the turn
 * tail only re-shows HTML cards today, because TurnCards reads
 * `visualizeMetaFrom` and not `openuiMetaFrom`.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!card) return JSON.stringify({ found: false });
  const chain = [];
  let el = card, depth = 0;
  while (el && el !== document.body && depth < 24) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    chain.push({
      depth,
      tag: el.tagName,
      cls: String(el.className || '').slice(0, 46),
      display: s.display,
      visibility: s.visibility,
      overflow: s.overflow,
      h: Math.round(r.height),
      hidden: el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true',
    });
    el = el.parentElement; depth += 1;
  }
  return JSON.stringify({ found: true, chain }, null, 1);
})()`)
console.log(facts)
