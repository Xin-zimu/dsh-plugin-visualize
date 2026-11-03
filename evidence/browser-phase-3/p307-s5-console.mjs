/**
 * P3-07 browser verification, step 5: A10 — no new console errors or React
 * warnings caused by action dispatch.
 *
 * The buffer was empty after the reload, which is not evidence of anything by
 * itself. So this clicks every Button again on a freshly loaded page and reads
 * the console afterwards: any warning a Button produces lands in the buffer
 * within that window.
 */
import { evaluate, SLEEP } from './cdp.mjs'

/** Click one action card Button by label. */
function clickScript(label) {
  return `(function () {
    const hit = [...document.querySelectorAll('[data-openui-card]')].find(c => /P307 actions/.test(c.textContent || ''));
    if (!hit) return JSON.stringify({ clicked: false });
    const btn = [...hit.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(label)});
    if (!btn) return JSON.stringify({ clicked: false });
    btn.click();
    return JSON.stringify({ clicked: true });
  })()`
}

for (const label of ['set6', 'reset', 'combo', 'set6']) {
  console.log(label, await evaluate(clickScript(label)))
  await SLEEP(700)
}

const state = await evaluate(`(function () {
  const hit = [...document.querySelectorAll('[data-openui-card]')].find(c => /P307 actions/.test(c.textContent || ''));
  return JSON.stringify({ text: hit ? hit.textContent.slice(0, 80) : null });
})()`)
console.log('final card:', state)
await SLEEP(1200)
