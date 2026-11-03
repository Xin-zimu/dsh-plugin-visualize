/**
 * P3-06 browser verification, step 7: which host services exist?
 *
 * The plugin decides whether to draw a turn tail from the host's work-details
 * preference, read through `configForms` (0.1.7+) or `settingsScope`
 * (0.1.2–0.1.6). If neither exists, `foldingSource` returns "never folds" and
 * the entry declines every turn — which would explain an empty tail with no
 * defect in the card dispatch at all. This names what the page actually loaded.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const boot = window.__DSH_BOOT__ || {};
  const entries = boot.entries || [];
  return JSON.stringify({
    entryCount: entries.length,
    ids: entries.map(e => e.id).filter(id => /chat|config|settings|conversation|visualize/i.test(id)),
  }, null, 1);
})()`)
console.log(facts)
