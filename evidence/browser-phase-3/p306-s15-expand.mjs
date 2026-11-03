/**
 * P3-06 browser verification, step 15: capture the reloaded state, then prove
 * requirement 2 — expanding the fold shows the toolview copy in the process
 * area, and the tail copy stays where it was, without the two ever collapsing
 * into one card.
 *
 * This is parity with the HTML backend's existing strategy: the toolview card is
 * the call's own record inside the fold, the tail card is the turn's output after
 * the answer. Both are the reader's, and the check is that opening the fold does
 * not produce a second copy *in the tail*.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

const before = await evaluate(`(function () {
  const count = (sel) => [...document.querySelectorAll(sel)].filter(el => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  }).length;
  return JSON.stringify({ cards: document.querySelectorAll('[data-openui-card]').length, visible: count('[data-openui-card]') });
})()`)
console.log('collapsed:', before)
await SLEEP(500)
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p306-after-reload.png')))

// Expand the first finished turn's fold.
const expanded = await evaluate(`(function () {
  const btn = [...document.querySelectorAll('button')].find(b => /已完成/.test(b.textContent || ''));
  if (!btn) return JSON.stringify({ ok: false });
  const was = btn.getAttribute('aria-expanded');
  btn.click();
  return JSON.stringify({ ok: true, was });
})()`)
console.log('expand:', expanded)
await SLEEP(2200)

const after = await evaluate(`(function () {
  const isTail = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const folded = cards.filter(c => !isTail(c));
  const tail = cards.filter(isTail);
  return JSON.stringify({
    total: cards.length,
    inFold: folded.length,
    inTail: tail.length,
    tailTexts: tail.map(c => c.textContent.slice(0, 30)),
  });
})()`)
console.log('after expand:', after)
