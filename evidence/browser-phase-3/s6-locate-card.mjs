/**
 * Stage 3 / P3-05, step 6: locate the card in the DOM and bring it into view.
 *
 * The card is present (1 `[data-openui-card]` node) but the transcript folds a
 * finished turn, so it was outside the captured viewport. This reports the
 * card's rect and its ancestors' visibility, then scrolls the real scroll
 * container rather than the window.
 */
import { evaluate, SLEEP, screenshot } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!card) return JSON.stringify({ found: false });
  const rect = card.getBoundingClientRect();
  const style = getComputedStyle(card);
  // Find the nearest scrollable ancestor and where the card sits inside it.
  let scroller = card.parentElement, depth = 0;
  while (scroller && depth < 30) {
    const s = getComputedStyle(scroller);
    if (/(auto|scroll)/.test(s.overflowY) && scroller.scrollHeight > scroller.clientHeight + 4) break;
    scroller = scroller.parentElement; depth += 1;
  }
  return JSON.stringify({
    found: true,
    rect: { top: Math.round(rect.top), left: Math.round(rect.left), h: Math.round(rect.height) },
    display: style.display,
    visibility: style.visibility,
    text: (card.textContent || '').slice(0, 80),
    scroller: scroller ? { tag: scroller.tagName, cls: String(scroller.className).slice(0, 60), sh: scroller.scrollHeight, ch: scroller.clientHeight, top: scroller.scrollTop } : null,
  }, null, 1);
})()`)
console.log('locate:', facts)

const scrolled = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  card.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = card.getBoundingClientRect();
  return JSON.stringify({ top: Math.round(r.top), h: Math.round(r.height) });
})()`)
console.log('scrolled:', scrolled)
await SLEEP(1200)

console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-card-value-6.png')))
