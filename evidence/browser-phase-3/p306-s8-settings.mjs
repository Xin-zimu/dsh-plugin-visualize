/**
 * P3-06 browser verification, step 8: what is the host's work-details setting?
 *
 * `foldingSource` declines the turn tail unless the host folds, and on a 0.1.7+
 * host that means `transcriptView !== 'verbose'`. The host persists that under
 * the `ui-chat` settings namespace; the store is the page's own localStorage
 * (the host's settings services are localStorage-backed, per card-state.ts's
 * note). Reading it settles whether the entry declined or the Definition
 * published nothing.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const keys = Object.keys(localStorage).filter(k => /ui-chat|transcript|settings|dsh/i.test(k));
  const picked = {};
  for (const k of keys.slice(0, 24)) {
    const raw = localStorage.getItem(k);
    picked[k] = (raw || '').slice(0, 220);
  }
  return JSON.stringify({ keyCount: keys.length, keys: keys.slice(0, 24), picked }, null, 1);
})()`)
console.log(facts)
