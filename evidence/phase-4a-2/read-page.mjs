/**
 * Read the page before probing it (AGENTS.md §10, consequence 3).
 *
 * When a card does not appear, the correct first move is to look at what the
 * conversation actually says — not to write another script that waits longer.
 * In 4A-1 ten scripts were spent trying to make a card appear while the host was
 * publishing a visible failure banner nobody had read.
 */
import { evaluate, consoleRead } from '../lib/cdp.mjs'

const facts = await evaluate(`(function () {
  const text = (document.body.innerText || '');
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const turns = [...document.querySelectorAll('[data-role],article,li')].slice(-6).map(el => (el.innerText || '').slice(0, 160));
  return JSON.stringify({
    cards: cards.length,
    cardTitles: cards.map(c => (c.textContent || '').slice(0, 60)),
    tail: text.slice(-1400),
    composer: (document.querySelector('[contenteditable="true"]') || {}).innerText?.slice(0, 80) ?? null,
    banners: [...document.querySelectorAll('[role="alert"],[role="status"],[role="note"]')].map(el => (el.innerText || '').slice(0, 120)),
    turns,
  });
})()`)

console.log(JSON.stringify(facts, null, 1))
try {
  const log = consoleRead()
  console.log('--- console (tail) ---')
  console.log(JSON.stringify(log).slice(-1500))
} catch (error) {
  console.log(`console read failed: ${error.message.slice(0, 120)}`)
}
