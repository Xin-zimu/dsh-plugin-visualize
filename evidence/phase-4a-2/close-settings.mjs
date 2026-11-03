/**
 * Close the host's Settings dialog and bring the card into view.
 *
 * Why this exists: `--what=theme` drives the host's own 外观 control, which
 * leaves the Settings dialog OPEN. The dialog paints a dimming overlay across
 * the page, so two different measurements taken while it is up are both wrong in
 * the reader's favour:
 *
 *  - a screenshot shows a greyed card, not what a reader sees;
 *  - a contrast ratio computed from computed styles ignores the overlay, and a
 *    uniform darkening moves every ratio *towards* 1 — so the measured numbers
 *    would be optimistic rather than merely unrepresentative.
 *
 * Rather than reason about how far off that is, close the dialog and measure the
 * card the way it is actually read.
 */
import { evaluate, press, click } from '../lib/cdp.mjs'

/** Any visible dialog still covering the page. */
const isOpen = async () => await evaluate(`(function () {
  const dialogs = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"]')]
    .filter(el => el.getBoundingClientRect().width > 100);
  return JSON.stringify({ open: dialogs.length, labels: dialogs.map(d => (d.textContent || '').slice(0, 20)) });
})()`)

const before = await isOpen()
console.log(`dialogs open before: ${JSON.stringify(before)}`)

if (before.open > 0) {
  // Escape is the host's own cancel gesture for this dialog and, unlike clicking
  // an inferred close button, it cannot accidentally activate a setting.
  try { await press('Escape') } catch (error) { console.log(`Escape failed: ${String(error.message).slice(0, 80)}`) }
  await new Promise(resolve => setTimeout(resolve, 600))
}

let after = await isOpen()
if (after.open > 0) {
  // Fall back to the dialog's close control if Escape did not dismiss it.
  const ref = await evaluate(`(function () {
    const btn = [...document.querySelectorAll('button')]
      .find(b => (b.getAttribute('aria-label') || '') === '关闭' || (b.textContent || '').trim() === '关闭'
        || (b.getAttribute('aria-label') || '').toLowerCase() === 'close');
    return JSON.stringify({ found: btn !== undefined });
  })()`)
  console.log(`close button found: ${JSON.stringify(ref)}`)
  if (ref.found === true) {
    try { await click({ text: '关闭' }) } catch (error) { console.log(`close click failed: ${String(error.message).slice(0, 80)}`) }
    await new Promise(resolve => setTimeout(resolve, 600))
    after = await isOpen()
  }
}

console.log(`dialogs open after: ${JSON.stringify(after)}`)

// Scroll the newest card into view so a viewport screenshot contains it.
const scrolled = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  if (cards.length === 0) return JSON.stringify({ card: false });
  const card = cards[cards.length - 1];
  card.scrollIntoView({ block: 'center' });
  const r = card.getBoundingClientRect();
  return JSON.stringify({ card: true, inViewport: r.top >= 0 && r.bottom <= window.innerHeight, top: Math.round(r.top), h: Math.round(r.height) });
})()`)
console.log(`card: ${scrolled}`)

if (after.open > 0) {
  console.error('BLOCKED: the Settings dialog is still open — measurements taken now would be dimmed')
  process.exit(2)
}
