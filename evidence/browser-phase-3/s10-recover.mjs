/**
 * Stage 3 / P3-05, step 10: recover the card after a blind click collapsed it.
 *
 * The previous step clicked the first `button` on the page, which toggled a
 * disclosure and unmounted the card. This reports what is on screen now and
 * targets the tool row by its own label instead of by tag name.
 */
import { evaluate, SLEEP } from './cdp.mjs'

const state = await evaluate(`(function () {
  const cards = document.querySelectorAll('[data-openui-card]');
  const rows = [...document.querySelectorAll('button, [role=button]')]
    .filter(b => /已调用工具|Tool called/.test(b.textContent || ''));
  return JSON.stringify({
    cards: cards.length,
    toolRows: rows.map(b => ({
      label: b.textContent.trim().slice(0, 24),
      expanded: b.getAttribute('aria-expanded'),
      tag: b.tagName,
    })),
  }, null, 1);
})()`)
console.log(state)
await SLEEP(300)
