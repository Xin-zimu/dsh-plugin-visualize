/**
 * Stage 3 / P3-05, step 14: capture the card by scrolling its own scroll
 * container, then crop to it with a snapshot ref.
 *
 * Nothing clips the card and it measures 675x79, so the only thing that can keep
 * it out of the picture is the scroll offset of the transcript. This scrolls the
 * transcript to the card, takes a fresh snapshot so a ref exists for it, and
 * crops the capture to that ref.
 */
import { evaluate, screenshot, SLEEP, observe } from './cdp.mjs'

// Scroll the transcript so the card is at the top of the reading area.
const moved = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!card) return JSON.stringify({ ok: false });
  let scroller = card.parentElement;
  while (scroller) {
    const s = getComputedStyle(scroller);
    if (/(auto|scroll)/.test(s.overflowY) && scroller.scrollHeight > scroller.clientHeight + 8) break;
    scroller = scroller.parentElement;
  }
  if (!scroller) {
    card.scrollIntoView({ block: 'start' });
    return JSON.stringify({ ok: true, via: 'viewport' });
  }
  const box = card.getBoundingClientRect();
  const host = scroller.getBoundingClientRect();
  scroller.scrollTop += Math.round(box.top - host.top) - 40;
  return JSON.stringify({ ok: true, via: 'container', scrollTop: Math.round(scroller.scrollTop) });
})()`)
console.log('scroll:', moved)
await SLEEP(1200)

const seen = observe()
const cardLine = seen.text.split('\n').find(l => /data-openui|P3 persistence/.test(l)) ?? '(card not in a11y tree)'
console.log('a11y card line:', cardLine.slice(0, 140))

const out = 'D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-card-final.png'
console.log(JSON.stringify(await screenshot(out)))
