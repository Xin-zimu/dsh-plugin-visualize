/**
 * P3-06 browser verification, step 16: capture the reloaded OpenUI tail card.
 *
 * The previous capture landed on the HTML control turn (the transcript scrolled
 * to the last turn). This scrolls to the OpenUI tail card that carries the
 * persisted value and captures it, still with no styling applied.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

const moved = await evaluate(`(function () {
  const isTail = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const target = [...document.querySelectorAll('[data-openui-card]')]
    .filter(isTail)
    .find(c => /P3 persistence/.test(c.textContent || ''));
  if (!target) return JSON.stringify({ ok: false });
  target.scrollIntoView({ block: 'center' });
  const r = target.getBoundingClientRect();
  const s = target.querySelector('input[type=range]');
  return JSON.stringify({
    ok: true,
    text: target.textContent.slice(0, 40),
    value: s ? s.value : null,
    top: Math.round(r.top),
    h: Math.round(r.height),
  });
})()`)
console.log('scrolled:', moved)
await SLEEP(1200)
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p306-openui-tail-8.png')))
