/**
 * Stage 3 / P3-05, step 15: why a laid-out card is absent from the a11y tree.
 *
 * `getBoundingClientRect` reports 675x79 inside the viewport, yet the card never
 * appears in the accessibility tree or in a capture. The remaining explanation
 * is `content-visibility` or a zero-height fold container that still reports a
 * child rect. This records which, because "invisible for an unstated reason" is
 * not a finding.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!card) return JSON.stringify({ found: false });
  const hits = [];
  let el = card, depth = 0;
  while (el && depth < 30) {
    const s = getComputedStyle(el);
    if (s.contentVisibility && s.contentVisibility !== 'visible') {
      hits.push({ depth, why: 'content-visibility', v: s.contentVisibility, cls: String(el.className || '').slice(0, 40) });
    }
    if (el.hasAttribute && el.hasAttribute('inert')) hits.push({ depth, why: 'inert', cls: String(el.className || '').slice(0, 40) });
    if (s.display === 'none') hits.push({ depth, why: 'display:none', cls: String(el.className || '').slice(0, 40) });
    el = el.parentElement; depth += 1;
  }
  // Is any ancestor shorter than the card while clipping?
  const rows = [...document.querySelectorAll('button, [role=button]')]
    .filter(b => /已调用工具|Tool called/.test(b.textContent || ''))
    .map(b => ({ label: b.textContent.trim().slice(0, 20), expanded: b.getAttribute('aria-expanded') }));
  return JSON.stringify({ found: true, hits, toolRows: rows }, null, 1);
})()`)
console.log(facts)
