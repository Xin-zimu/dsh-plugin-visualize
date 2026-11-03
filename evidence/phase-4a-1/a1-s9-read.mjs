/**
 * Read the conversation's own text, to see what the model did with the request.
 *
 * Read-only: nothing is clicked or sent.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const text = document.body.innerText || '';
  return JSON.stringify({
    openuiCards: document.querySelectorAll('[data-openui-card]').length,
    anyCard: document.querySelectorAll('[class*=card]').length,
    unre: document.querySelectorAll('[data-openui-unrendered]').length,
    tail: text.slice(-1800),
  });
})()`)
console.log(JSON.stringify(report, null, 1))
