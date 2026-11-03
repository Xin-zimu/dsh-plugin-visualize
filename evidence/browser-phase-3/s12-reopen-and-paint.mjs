/**
 * Stage 3 / P3-05, step 12: reopen the session, re-measure, and paint the card.
 *
 * The reload landed on the session list, so the card is not mounted yet. This
 * reopens the session by name, re-measures the value the reload restored, and
 * expands the card's *own* tool row (matched by its label, not by tag name,
 * which is what collapsed it last time) so the capture shows the card.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

/** Reopen the session that holds the card. */
const opened = await evaluate(`(function () {
  const items = [...document.querySelectorAll('button, [role=treeitem]')]
    .filter(el => /OpenUI P3 persistence/.test(el.textContent || ''));
  if (items.length === 0) return JSON.stringify({ opened: false });
  items[0].click();
  return JSON.stringify({ opened: true, label: items[0].textContent.trim().slice(0, 40) });
})()`)
console.log('open session:', opened)

/** Poll for the card. */
let card
const deadline = Date.now() + 60_000
while (Date.now() < deadline) {
  card = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const c = cards[cards.length - 1];
    if (!c) return JSON.stringify({ cards: 0 });
    const s = c.querySelector('input[type=range]');
    return JSON.stringify({
      cards: cards.length,
      text: c.textContent.slice(0, 60),
      value: s ? s.value : null,
      rect: (function () { const r = c.getBoundingClientRect(); return { h: Math.round(r.height), top: Math.round(r.top) }; })(),
    });
  })()`)
  if (card.cards > 0) break
  await SLEEP(2000)
}
console.log('card:', JSON.stringify(card))

/** Expand the card's own tool row. */
const expanded = await evaluate(`(function () {
  const rows = [...document.querySelectorAll('button, [role=button]')]
    .filter(el => /已调用工具|Tool called/.test(el.textContent || '') && el.textContent.trim().length < 20);
  if (rows.length === 0) return JSON.stringify({ expanded: false, why: 'no tool row' });
  const row = rows[rows.length - 1];
  row.click();
  return JSON.stringify({ expanded: true, before: row.getAttribute('aria-expanded') });
})()`)
console.log('expand row:', expanded)
await SLEEP(2000)

const painted = await evaluate(`(function () {
  const c = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!c) return JSON.stringify({ cards: 0 });
  c.scrollIntoView({ block: 'center' });
  const r = c.getBoundingClientRect();
  const s = c.querySelector('input[type=range]');
  const rec = Object.entries(localStorage).filter(([k]) => k.includes(':openui')).map(([, v]) => v);
  return JSON.stringify({ cards: 1, value: s ? s.value : null, text: c.textContent.slice(0, 60), rect: { h: Math.round(r.height), top: Math.round(r.top) }, stored: rec });
})()`)
console.log('painted:', painted)
await SLEEP(800)

console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-card-restored-6.png')))
