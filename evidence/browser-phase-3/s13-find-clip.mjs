/**
 * Stage 3 / P3-05, step 13: find the ancestor that clips the card.
 *
 * The card measures 675x79 at top 332 (inside the viewport) yet does not paint.
 * That is a clipping ancestor, not a rendering failure of the card. This reports
 * every ancestor's height and overflow so the record can say which one, instead
 * of claiming the card is invisible for no stated reason.
 */
import { evaluate, SLEEP } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!card) return JSON.stringify({ found: false });
  const out = [];
  let el = card.parentElement, depth = 1;
  while (el && el !== document.documentElement && depth < 40) {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const clipped = /(hidden|clip|auto|scroll)/.test(s.overflow + s.overflowY)
      && r.height > 0 && r.height < 80;
    out.push({
      depth,
      cls: String(el.className || '').slice(0, 40),
      h: Math.round(r.height),
      ov: s.overflowY,
      clip: s.clipPath !== 'none' || s.visibility !== 'visible' || s.opacity === '0',
      suspicious: clipped,
    });
    if (clipped) break;
    el = el.parentElement; depth += 1;
  }
  return JSON.stringify({ found: true, out }, null, 1);
})()`)
console.log(facts)
await SLEEP(200)
