/**
 * P3-06 browser verification, step 1: clear the notices and reach the composer.
 *
 * No display property is forced anywhere in this run. Every check reads what the
 * page actually renders: visibility, computed style, rect, and the stored state.
 */
import { evaluate, observe, SLEEP } from './cdp.mjs'

/** Poll until the app mounts. */
async function waitForMount() {
  for (let i = 0; i < 25; i += 1) {
    const now = await evaluate(`(function () {
      return JSON.stringify({
        dialogs: document.querySelectorAll('dialog[open], [role=dialog]').length,
        composers: document.querySelectorAll('[contenteditable=true][role=textbox]').length,
      });
    })()`)
    if (now.dialogs > 0 || now.composers > 0) return now
    await SLEEP(1000)
  }
  return undefined
}
console.log('mount:', JSON.stringify(await waitForMount()))

/** Click the last visible dialog's confirm button. */
async function dismiss() {
  const out = await evaluate(`(function () {
    const d = [...document.querySelectorAll('dialog[open], [role=dialog]')].pop();
    if (!d) return JSON.stringify({ clicked: false });
    const b = [...d.querySelectorAll('button')].find(x => /继续|Continue|关闭|Close|OK|知道了/i.test(x.textContent || ''));
    if (!b) return JSON.stringify({ clicked: false, buttons: [...d.querySelectorAll('button')].map(x => x.textContent.trim()) });
    b.click();
    return JSON.stringify({ clicked: true, label: b.textContent.trim() });
  })()`)
  console.log('dismiss:', JSON.stringify(out))
  await SLEEP(2200)
}

for (let i = 0; i < 4; i += 1) {
  const count = await evaluate(`JSON.stringify({ n: document.querySelectorAll('dialog[open], [role=dialog]').length })`)
  if (count.n === 0) break
  await dismiss()
}

console.log('ready:', JSON.stringify(await evaluate(`(function () {
  return JSON.stringify({
    dialogs: document.querySelectorAll('dialog[open], [role=dialog]').length,
    composer: !!document.querySelector('[contenteditable=true][role=textbox]'),
    url: location.href,
  });
})()`)))
console.log(observe().text.slice(-400))
