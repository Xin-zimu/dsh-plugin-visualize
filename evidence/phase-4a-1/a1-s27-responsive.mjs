/**
 * Grid responsiveness: change the card's available width and measure again.
 *
 * This is the case the owner asked to verify in a real browser rather than by
 * inspecting HTML. Two grids are compared because they answer different
 * questions:
 *
 * - the **3-column** grid must keep 3 equal tracks and shrink each one;
 * - the **minChildWidth** grid must *drop columns* as the card narrows, which is
 *   the whole point of `auto-fit` and is invisible in generated markup.
 *
 * The window is resized through the browser-skill window control, then the card's
 * own width is read back so the measurement is anchored to what the layout
 * actually had, not to the requested window size.
 */
import { evaluate, resize, SLEEP } from './cdp.mjs'

const measure = () => evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards.filter(c => (c.textContent || '').includes('A1 layout')).pop();
  if (card === undefined) return JSON.stringify({ found: false });
  const grids = [...card.querySelectorAll('*')].filter(el => getComputedStyle(el).display === 'grid');
  return JSON.stringify({
    found: true,
    cardWidth: Math.round(card.getBoundingClientRect().width),
    grids: grids.map(el => ({
      w: Math.round(el.getBoundingClientRect().width),
      template: getComputedStyle(el).gridTemplateColumns,
      trackCount: getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
      items: el.children.length,
    })),
  });
})()`)

const widths = [1280, 900, 640, 480]
const results = []
for (const width of widths) {
  try {
    await resize(width, 900)
  } catch (error) {
    console.log('resize failed for', width, String(error.message).split('\n')[1]?.slice(0, 80))
  }
  await SLEEP(1800)
  const m = await measure()
  results.push({ requested: width, ...m })
  console.log(JSON.stringify({ requested: width, cardWidth: m.cardWidth, grids: m.grids }))
}

console.log(JSON.stringify(results, null, 1))
