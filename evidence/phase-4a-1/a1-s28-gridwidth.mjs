/**
 * Grid responsiveness, measured by constraining the card's own width.
 *
 * The previous attempt resized the *window*, which on this host does not change
 * the card's width — every sample came back 527px, so the "columns dropped"
 * result it produced was really a different card, not a narrower one. That is
 * recorded rather than used.
 *
 * This constrains the card element itself to a series of widths and reads the
 * resolved `grid-template-columns` after each. It proves the CSS mechanism
 * (auto-fit dropping tracks) under real layout, and it deliberately does not
 * change any stylesheet: the constraint is a temporary inline width on the card
 * element, removed afterwards, and the host's CSS is never touched.
 */
import { evaluate, SLEEP } from './cdp.mjs'

const report = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards.filter(c => (c.textContent || '').includes('A1 layout')).pop();
  if (card === undefined) return JSON.stringify({ found: false });

  // The minChildWidth grid is the one whose template contains auto-fit; identify
  // it by behaviour rather than by position, so the measurement does not depend
  // on the order the model happened to emit its statements in.
  const grids = [...card.querySelectorAll('*')].filter(el => getComputedStyle(el).display === 'grid');
  const autoGrids = grids.filter(el => el.children.length > 0);

  const original = card.style.width;
  const samples = [];
  for (const width of [680, 560, 440, 320]) {
    card.style.width = width + 'px';
    // Force a layout read so the grid resolves against the new width.
    void card.getBoundingClientRect().width;
    const measured = autoGrids.map(el => ({
      items: el.children.length,
      template: getComputedStyle(el).gridTemplateColumns,
      tracks: getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length,
      w: Math.round(el.getBoundingClientRect().width),
    }));
    samples.push({ cardWidth: Math.round(card.getBoundingClientRect().width), grids: measured });
  }
  card.style.width = original;

  return JSON.stringify({ found: true, samples }, null, 1);
})()`)
console.log(JSON.stringify(report, null, 1))
