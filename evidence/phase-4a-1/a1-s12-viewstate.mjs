/**
 * Read the conversation-view records, looking for the non-string the host's
 * draft editor chokes on.
 *
 * Read-only until the last step, which removes only the two view-state keys and
 * reloads. Card state (`dsh-visualize:*`) is never touched — a reload has to
 * still replay the existing cards.
 */
import { evaluate, reload, SLEEP } from './cdp.mjs'

const inspect = await evaluate(`(function () {
  const out = [];
  for (const k of Object.keys(localStorage)) {
    if (!/conversation|settings|view/i.test(k)) continue;
    const raw = localStorage.getItem(k) || '';
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { parsed = '<<not json>>'; }
    out.push({
      key: k,
      raw: raw.slice(0, 200),
      type: typeof parsed,
      shape: parsed === null || typeof parsed !== 'object' ? String(parsed)
        : Object.fromEntries(Object.entries(parsed).map(([k2, v]) => [k2, Array.isArray(v) ? 'array(' + v.length + ')' : typeof v])),
    });
  }
  return JSON.stringify(out, null, 1);
})()`)
console.log('inspect:', inspect)

const cleared = await evaluate(`(function () {
  const hit = Object.keys(localStorage).filter(k => /^dsh\\.conversation\\./.test(k));
  for (const k of hit) localStorage.removeItem(k);
  return JSON.stringify({ cleared: hit });
})()`)
console.log('cleared:', cleared)

console.log('reload:', JSON.stringify(await reload()).slice(0, 90))
await SLEEP(10000)

const after = await evaluate(`(function () {
  const text = document.body.innerText || '';
  return JSON.stringify({
    title: document.title,
    textLength: text.length,
    cards: document.querySelectorAll('[data-openui-card]').length,
    unre: document.querySelectorAll('[data-openui-unrendered]').length,
    tail: text.slice(-400),
  });
})()`)
console.log('after:', JSON.stringify(after, null, 1))
