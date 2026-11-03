/**
 * Stage 3 / P3-05, step 2b: reconcile after an uncertain Enter.
 *
 * The previous run's Enter was rejected before it executed (the action reports
 * effect_state unknown and is explicitly not replayed), so this checks whether
 * anything was actually sent before deciding what to do next. Replaying an
 * uncertain submission is the one thing the browser skill forbids.
 */
import { evaluate, observe } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const cards = document.querySelectorAll('[data-openui-card]');
  const turns = document.querySelectorAll('[data-turn], article, [role=article]');
  return JSON.stringify({
    composerText: box ? box.innerText.slice(0, 120) : null,
    openuiCards: cards.length,
    turnNodes: turns.length,
    bodyTail: document.body.innerText.slice(-400),
  }, null, 1);
})()`)
console.log(facts)
console.log('--- observe ---')
console.log(observe().text.slice(-1000))
