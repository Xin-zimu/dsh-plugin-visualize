/**
 * Inspect the geometry that the summary numbers hide.
 *
 * Three questions, each of which the aggregate probe cannot answer:
 *
 * 1. **The Spacer's gap reads 605px**, but the card is 680px wide and the row
 *    also contains "before" and "after". If that number were real, the two Texts
 *    would be off-card. It is almost certainly measured from the wrong pair:
 *    `parent.children` includes elements the TraversalView wraps, so the
 *    element *before* the Spacer may not be the Text at all.
 * 2. **The second Grid resolves to 3 columns**, not the 1–2 that
 *    `minChildWidth: 180` should allow in a 680px card at gap 8. Either the
 *    auto-fit floor is not applying, or the measurement is reading the wrong
 *    grid.
 * 3. **The 3-column Grid and the minChildWidth Grid report identical geometry**
 *    (221.333px each, gap 8). Two different programs producing identical output
 *    is the signature of reading one node twice.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards.filter(c => (c.textContent || '').includes('A1 layout')).pop();
  if (card === undefined) return JSON.stringify({ found: false });

  const style = (el) => getComputedStyle(el);
  const describe = (el) => {
    const s = style(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      display: s.display,
      text: (el.textContent || '').slice(0, 20),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      template: s.gridTemplateColumns === 'none' ? null : s.gridTemplateColumns,
      gap: s.gap,
      children: el.children.length,
    };
  };

  // Every grid, with its full child list and each child's own rect.
  const grids = [...card.querySelectorAll('*')].filter(el => style(el).display === 'grid').map(el => ({
    ...describe(el),
    childRects: [...el.children].map(describe),
  }));

  // The Spacer's real siblings, walked up to the nearest flex row.
  const spacers = [...card.querySelectorAll('[aria-hidden=true]')].map(el => {
    const parent = el.parentElement;
    const siblings = [...parent.children].map(describe);
    const row = (() => {
      let node = el;
      while (node !== null && node !== card) {
        if (style(node).display === 'flex' && style(node).flexDirection === 'row') return node;
        node = node.parentElement;
      }
      return null;
    })();
    return {
      spacer: describe(el),
      directParent: parent === null ? null : describe(parent),
      siblings,
      nearestRow: row === null ? null : {
        ...describe(row),
        children: [...row.children].map(describe),
      },
    };
  });

  return JSON.stringify({ found: true, grids, spacers }, null, 1);
})()`)
console.log(JSON.stringify(report, null, 1))
