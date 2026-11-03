/**
 * Read the full banner text, and the facts a fresh session needs to proceed.
 *
 * The point is to establish *why* the conversation pane is empty: the visible
 * message names a session log written by a newer harness, which this build
 * refuses to interpret. That would explain three prompts returning HTTP 200
 * with nothing painted, and it is entirely independent of this plugin.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const text = document.body.innerText || '';
  return JSON.stringify({
    text,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log(report.text)
console.log('--- cards:', report.cards)
