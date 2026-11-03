/**
 * Stage 3 / P3-05, step 1: authenticate the isolated instance and reach a chat.
 *
 * The page booted without its token, so every /api call answered 401 and the
 * SPA never mounted. Navigating through the helper's own context carries the
 * token; the notice dialogs are then cleared so the composer is reachable.
 */
import { evaluate, navigate, observe, SLEEP } from './cdp.mjs'

/** The isolated instance's tokenised URL, captured from its startup line. */
const URL = process.argv[2]
if (!URL) throw new Error('pass the tokenised URL as the first argument')

console.log('navigate:', JSON.stringify(await navigate(URL)))
await SLEEP(8000)

/** Poll until the app mounts or the deadline passes. */
async function waitForMount() {
  for (let i = 0; i < 20; i += 1) {
    const now = await evaluate(`(function () {
      return JSON.stringify({
        dialogs: document.querySelectorAll('dialog[open], [role=dialog]').length,
        composers: document.querySelectorAll('textarea, [contenteditable=true]').length,
      });
    })()`)
    if (now.dialogs > 0 || now.composers > 0) return now
    await SLEEP(1000)
  }
  return undefined
}

console.log('mount:', JSON.stringify(await waitForMount()))

/** Click the last visible dialog's confirm-ish button. */
async function dismiss() {
  const out = await evaluate(`(function () {
    const d = [...document.querySelectorAll('dialog[open], [role=dialog]')].pop();
    if (!d) return JSON.stringify({ clicked: false });
    const buttons = [...d.querySelectorAll('button')].map(x => x.textContent.trim());
    const b = [...d.querySelectorAll('button')].find(x => /继续|Continue|关闭|Close|OK|知道了/i.test(x.textContent || ''));
    if (!b) return JSON.stringify({ clicked: false, buttons });
    b.click();
    return JSON.stringify({ clicked: true, label: b.textContent.trim() });
  })()`)
  console.log('dismiss:', JSON.stringify(out))
  await SLEEP(2000)
}

for (let i = 0; i < 4; i += 1) {
  const count = await evaluate(`JSON.stringify({ n: document.querySelectorAll('dialog[open], [role=dialog]').length })`)
  if (count.n === 0) break
  await dismiss()
}

console.log('after:', JSON.stringify(await evaluate(`(function () {
  return JSON.stringify({
    dialogs: document.querySelectorAll('dialog[open], [role=dialog]').length,
    composers: document.querySelectorAll('textarea, [contenteditable=true]').length,
  });
})()`)))
console.log('--- observe ---')
console.log(observe().text.slice(0, 1400))
