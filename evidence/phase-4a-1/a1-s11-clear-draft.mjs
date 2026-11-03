/**
 * Clear the corrupted draft the host's editor left behind, then reload.
 *
 * `DraftEditorRuntime.setDraft` throws `text.replace is not a function` on a
 * restored draft, and that crash takes the whole `conversation.session` slot
 * with it — so the pane paints nothing and every further send is a no-op.
 * A reload alone does not help because the bad value is persisted; the entry has
 * to be removed before the page is reloaded.
 *
 * Only draft/composer keys are touched. Card state and session records are left
 * alone, because a reload has to still be able to replay the existing cards.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

const before = await evaluate(`(function () {
  const keys = Object.keys(localStorage);
  return JSON.stringify({
    total: keys.length,
    keys: keys.map(k => ({ k, len: (localStorage.getItem(k) || '').length })),
  });
})()`)
console.log('before:', JSON.stringify(before, null, 1))

const cleared = await evaluate(`(function () {
  const keys = Object.keys(localStorage);
  const hit = keys.filter(k => /draft|composer|input|editor/i.test(k));
  for (const k of hit) localStorage.removeItem(k);
  return JSON.stringify({ cleared: hit, remaining: Object.keys(localStorage).length });
})()`)
console.log('cleared:', JSON.stringify(cleared, null, 1))

console.log('reload:', JSON.stringify(await reload()).slice(0, 100))
await SLEEP(9000)

const after = await evaluate(`(function () {
  const text = document.body.innerText || '';
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({
    title: document.title,
    textLength: text.length,
    composerLength: box === null ? -1 : (box.textContent || '').length,
    openuiCards: document.querySelectorAll('[data-openui-card]').length,
    unre: document.querySelectorAll('[data-openui-unrendered]').length,
    tail: text.slice(-700),
  });
})()`)
console.log('after:', JSON.stringify(after, null, 1))
