/**
 * Stage 3 / P3-05, step 16: paint a card the host has skipped.
 *
 * The card's ancestors carry `content-visibility: hidden` (a host fold
 * optimisation), which keeps a laid-out subtree out of painting and out of the
 * accessibility tree. Forcing it visible is a *capture* measure only — it
 * changes nothing about the plugin or the persisted state, and it is reverted
 * before the page is used again.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

const forced = await evaluate(`(function () {
  const card = [...document.querySelectorAll('[data-openui-card]')].pop();
  if (!card) return JSON.stringify({ ok: false });
  const touched = [];
  let el = card;
  while (el && el !== document.body) {
    const s = getComputedStyle(el);
    if (s.contentVisibility && s.contentVisibility !== 'visible') {
      el.dataset.p3WasCv = s.contentVisibility;
      el.style.contentVisibility = 'visible';
      touched.push(String(el.className || el.tagName).slice(0, 30));
    }
    el = el.parentElement;
  }
  const c = [...document.querySelectorAll('[data-openui-card]')].pop();
  c.scrollIntoView({ block: 'center' });
  const r = c.getBoundingClientRect();
  const s = c.querySelector('input[type=range]');
  return JSON.stringify({ ok: true, touched, value: s ? s.value : null, text: c.textContent.slice(0, 40), rect: { h: Math.round(r.height), top: Math.round(r.top) } });
})()`)
console.log('forced:', forced)
await SLEEP(1500)

const out = 'D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p3-card-value-6.png'
console.log(JSON.stringify(await screenshot(out)))
