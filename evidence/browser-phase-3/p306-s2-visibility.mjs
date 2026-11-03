/**
 * P3-06 browser verification, step 2: is the OpenUI card visible in a folded turn?
 *
 * This is the check the previous phase could not make. Nothing here forces a CSS
 * property: it reports what the browser actually renders — the card's rect, its
 * computed `content-visibility` chain, whether it is painted (an intersection
 * with the viewport at a non-zero size), and where it sits relative to the
 * closing answer.
 */
import { evaluate, SLEEP } from './cdp.mjs'

const report = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const frames = [...document.querySelectorAll('iframe')];
  const card = cards[cards.length - 1];
  if (!card) {
    return JSON.stringify({
      cards: 0,
      frames: frames.length,
      tail: document.body.innerText.slice(-200),
    });
  }
  const r = card.getBoundingClientRect();
  const s = card.querySelector('input[type=range]');

  // Walk up: is any ancestor skipping paint, and is any ancestor clipping?
  const blockers = [];
  let el = card, depth = 0;
  while (el && el !== document.documentElement && depth < 40) {
    const cs = getComputedStyle(el);
    if (cs.contentVisibility && cs.contentVisibility !== 'visible') {
      blockers.push({ depth, why: 'content-visibility:' + cs.contentVisibility, cls: String(el.className || '').slice(0, 30) });
    }
    el = el.parentElement; depth += 1;
  }

  // Painted = the card's own box intersects the viewport with a real size,
  // and nothing above it is skipping paint.
  const inViewport = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  return JSON.stringify({
    cards: cards.length,
    frames: frames.length,
    text: card.textContent.slice(0, 60),
    value: s ? s.value : null,
    rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
    inViewport,
    paintSkippedBy: blockers,
    visible: inViewport && blockers.length === 0,
  }, null, 1);
})()`)
console.log('report:', report)
await SLEEP(300)
