/**
 * P3-07 browser verification, step 7: T7 — switching sessions shows neither the
 * other session's cards nor its state.
 *
 * T7 was NOT VERIFIED after P3-06. The isolated home has a second session from
 * earlier phases; opening it must show none of this session's cards, and coming
 * back must show this session's values intact.
 */
import { evaluate, SLEEP } from './cdp.mjs'

/** Read the action card plus every stored OpenUI record. */
const READ = `(function () {
  const hit = [...document.querySelectorAll('[data-openui-card]')].find(c => /P307 actions/.test(c.textContent || ''));
  return JSON.stringify({
    actionCard: hit ? hit.textContent.slice(0, 70) : null,
    cards: document.querySelectorAll('[data-openui-card]').length,
    records: Object.entries(localStorage).filter(([k]) => k.includes(':openui')).map(([k, v]) => ({
      tail: (k.split('|').pop() || '').slice(0, 46),
      values: (JSON.parse(v).s || {}).values,
    })),
  });
})()`

const here = await evaluate(READ)
console.log('this session:', JSON.stringify(here, null, 1))

/** Start a brand-new session, which must inherit no cards. */
const created = await evaluate(`(function () {
  const btn = [...document.querySelectorAll('button')]
    .find(b => /新建会话|New session/.test((b.getAttribute('aria-label') || '') + (b.title || '') + (b.textContent || '')));
  if (!btn) return JSON.stringify({ ok: false, why: 'no new-session button' });
  btn.click();
  return JSON.stringify({ ok: true, label: (btn.getAttribute('aria-label') || btn.textContent || '').trim().slice(0, 30) });
})()`)
console.log('new session:', created)
await SLEEP(3000)

const fresh = await evaluate(READ)
console.log('fresh session:', JSON.stringify(fresh, null, 1))

/** Go back to the session that holds the cards. */
const back = await evaluate(`(function () {
  const item = [...document.querySelectorAll('button, [role=treeitem]')]
    .filter(el => /OpenUI P3 persistence card/.test(el.textContent || ''));
  if (item.length === 0) return JSON.stringify({ ok: false });
  item[0].click();
  return JSON.stringify({ ok: true });
})()`)
console.log('back:', back)
await SLEEP(4000)

const returned = await evaluate(READ)
console.log('returned:', JSON.stringify(returned, null, 1))
