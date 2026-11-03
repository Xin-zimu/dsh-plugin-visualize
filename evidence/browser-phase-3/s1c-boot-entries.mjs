/**
 * Stage 3 / P3-05, step 1c: which boot entry produced the unresolvable bundle.
 *
 * The page requests `plugins/??@deepseek-ai/dsh-client-modules/client.js`, whose
 * `??` is the empty-ids form, and the server answers 404. Reading the boot
 * payload is how we name the entry instead of guessing at it.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const boot = window.__DSH_BOOT__;
  return JSON.stringify({
    rev: boot.rev,
    entries: boot.entries,
    batches: boot.batches,
  });
})()`)
console.log(JSON.stringify(facts, null, 2))
