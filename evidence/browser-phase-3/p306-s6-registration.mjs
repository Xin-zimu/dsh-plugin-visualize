/**
 * P3-06 browser verification, step 6: is the turn-tail entry mounted at all?
 *
 * The plugin registers a `conversation.chat.turnTail` entry that should render a
 * grid of cards after the closing answer. If the grid exists nowhere, either the
 * entry declined (the host did not report folding) or the Definition published
 * no cards. Those are different faults and must not be confused, so this reports
 * the signals rather than a conclusion.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  // The turn tail's own container: a grid track sized minmax(0, 1fr).
  const grids = [...document.querySelectorAll('div')].filter(d => {
    const cs = getComputedStyle(d);
    return cs.display === 'grid' && /minmax\\(0px, 1fr\\)|minmax\\(0, 1fr\\)/.test(cs.gridTemplateColumns);
  }).map(d => ({
    cls: String(d.className || '').slice(0, 24),
    children: d.children.length,
    html: d.innerHTML.slice(0, 90),
  }));

  // The host's work-details preference, as the UI exposes it.
  const settingsHints = [...document.querySelectorAll('[data-testid], [aria-label]')]
    .map(el => el.getAttribute('data-testid') || el.getAttribute('aria-label'))
    .filter(v => v && /transcript|工作详情|transcriptView|视图/i.test(v))
    .slice(0, 8);

  // Every element that holds a card, and whether it is the fold or the tail.
  const holders = [...document.querySelectorAll('[data-openui-card]')].map(c => {
    const tailish = c.closest('[data-visualize-launcher]');
    return {
      inLauncher: !!tailish,
      parentChain: (function () {
        const names = [];
        let p = c.parentElement, d = 0;
        while (p && d < 6) { names.push(String(p.className || p.tagName).slice(0, 18)); p = p.parentElement; d += 1; }
        return names;
      })(),
    };
  });

  return JSON.stringify({ grids, settingsHints, holders }, null, 1);
})()`)
console.log(facts)
