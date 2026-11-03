/**
 * P3-06 browser verification, step 17: restore the default collapsed state and
 * capture the acceptance picture — a folded turn with the OpenUI tail card
 * visible beneath its answer.
 *
 * The fold was expanded in the previous step to prove the no-duplicate rule.
 * Collapsing it again returns the page to how a reader actually meets it, which
 * is the state requirement 1 describes.
 */
import { evaluate, screenshot, SLEEP } from './cdp.mjs'

const collapsed = await evaluate(`(function () {
  const btn = [...document.querySelectorAll('button')].find(b => /已完成/.test(b.textContent || ''));
  if (!btn) return JSON.stringify({ ok: false });
  const was = btn.getAttribute('aria-expanded');
  if (was === 'true') btn.click();
  return JSON.stringify({ ok: true, was, now: btn.getAttribute('aria-expanded') });
})()`)
console.log('collapse:', collapsed)
await SLEEP(2000)

const state = await evaluate(`(function () {
  const isVisible = (el) => {
    let p = el.parentElement, d = 0;
    while (p && p !== document.documentElement && d < 40) {
      const cs = getComputedStyle(p);
      if (cs.contentVisibility && cs.contentVisibility !== 'visible') return false;
      p = p.parentElement; d += 1;
    }
    return true;
  };
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const visible = cards.filter(isVisible);
  const target = visible.find(c => /P3 persistence/.test(c.textContent || ''));
  if (target) target.scrollIntoView({ block: 'center' });
  return JSON.stringify({
    total: cards.length,
    visible: visible.length,
    visibleTexts: visible.map(c => c.textContent.slice(0, 30)),
    noOverrides: !document.querySelector('[data-p3-was-cv]'),
    foldState: [...document.querySelectorAll('button')]
      .filter(b => /已完成/.test(b.textContent || ''))
      .map(b => b.getAttribute('aria-expanded')),
  });
})()`)
console.log('state:', state)
await SLEEP(1000)
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-3/p306-folded-tail-acceptance.png')))
