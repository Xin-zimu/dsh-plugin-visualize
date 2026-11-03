/**
 * Stage 3 / P3-05, step 17: revert the capture-only style override.
 *
 * Step 16 forced `content-visibility: visible` on two host fold containers so the
 * card could be photographed. That is not part of the plugin and must not be left
 * applied: this removes the inline style and the marker attribute it set, and
 * confirms the persisted record is untouched.
 */
import { evaluate } from './cdp.mjs'

const reverted = await evaluate(`(function () {
  const touched = [...document.querySelectorAll('[data-p3-was-cv]')];
  for (const el of touched) {
    el.style.contentVisibility = '';
    delete el.dataset.p3WasCv;
  }
  return JSON.stringify({
    reverted: touched.length,
    remaining: document.querySelectorAll('[data-p3-was-cv]').length,
    stored: Object.entries(localStorage).filter(([k]) => k.includes(':openui')).map(([, v]) => v),
  });
})()`)
console.log(reverted)
