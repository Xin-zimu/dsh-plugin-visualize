/**
 * Find what is sitting on top of the page at the composer's click point.
 *
 * `Could not clear the extension overlay from the click point` means something
 * is covering the target. `elementFromPoint` names it, which decides whether it
 * is the browser-skill overlay (a harness problem) or something in the page.
 */
import { evaluate } from './cdp.mjs'

const report = await evaluate(`(function () {
  const composer = document.querySelector('[contenteditable=true][role=textbox]');
  if (composer === null) return JSON.stringify({ composer: false });
  const r = composer.getBoundingClientRect();
  const cx = Math.round(r.x + r.width / 2);
  const cy = Math.round(r.y + r.height / 2);
  const at = document.elementFromPoint(cx, cy);
  const describe = (el) => el === null ? null : {
    tag: el.tagName,
    id: el.id || null,
    cls: (el.className && String(el.className).slice(0, 60)) || null,
    aria: el.getAttribute && el.getAttribute('aria-label'),
    text: (el.textContent || '').slice(0, 40),
  };
  const overlays = [...document.querySelectorAll('body > *')].map(el => {
    const s = getComputedStyle(el);
    const b = el.getBoundingClientRect();
    return { tag: el.tagName, id: el.id || null, pos: s.position, z: s.zIndex, w: Math.round(b.width), h: Math.round(b.height), child: el.childElementCount };
  });
  return JSON.stringify({
    composer: true,
    point: { cx, cy },
    topElement: describe(at),
    composerContainsTop: at === null ? null : composer.contains(at),
    overlays,
    activeTag: document.activeElement ? document.activeElement.tagName : null,
  }, null, 1);
})()`)
console.log(report)
