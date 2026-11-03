/**
 * P3-06 browser verification, step 3: why is there only one card?
 *
 * The single `[data-openui-card]` node sits inside a `content-visibility:
 * hidden` fold container, which is exactly the situation the turn tail exists to
 * fix — so the question is whether the turn-tail entry mounted at all. This
 * reports the turn-tail surface, the folding preference the plugin reads, and
 * where the closing answer sits, without changing anything.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const describe = (el) => {
    const r = el.getBoundingClientRect();
    const chain = [];
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 12) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') chain.push(String(p.className || p.tagName).slice(0, 24));
      p = p.parentElement; d += 1;
    }
    return { top: Math.round(r.top), h: Math.round(r.height), text: el.textContent.slice(0, 40), hiddenBy: chain };
  };

  // Any turn-tail container the plugin draws (grid of cards after the answer).
  const grids = [...document.querySelectorAll('div')].filter(d => {
    const cs = getComputedStyle(d);
    return cs.display === 'grid' && cs.gridTemplateColumns.startsWith('minmax(0px, 1fr)');
  }).map(d => ({ cls: String(d.className || '').slice(0, 20), children: d.children.length, top: Math.round(d.getBoundingClientRect().top) }));

  return JSON.stringify({
    cardCount: cards.length,
    cards: cards.map(describe),
    turnTailGrids: grids,
    // The host's fold control, and whether it reports open.
    folds: [...document.querySelectorAll('button')]
      .filter(b => /已完成|用时/.test(b.textContent || ''))
      .map(b => ({ label: b.textContent.trim().slice(0, 24), expanded: b.getAttribute('aria-expanded') })),
  }, null, 1);
})()`)
console.log(facts)
