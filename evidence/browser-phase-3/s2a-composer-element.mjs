/**
 * Stage 3 / P3-05, step 2a: name the composer's element.
 *
 * The accessibility tree reports a textbox, but `document.querySelector
 * ('textarea')` finds nothing, so the composer is a contenteditable surface.
 * The persistence check only needs to put text in it and press Enter, so this
 * records the real selector instead of guessing one.
 */
import { evaluate } from './cdp.mjs'

const facts = await evaluate(`(function () {
  const areas = [...document.querySelectorAll('textarea')].map(el => ({ tag: el.tagName, cls: el.className.slice(0, 80) }));
  const editables = [...document.querySelectorAll('[contenteditable=true],[contenteditable=""]')]
    .map(el => ({ tag: el.tagName, cls: String(el.className).slice(0, 80), role: el.getAttribute('role') }));
  const placeholder = [...document.querySelectorAll('[data-placeholder],[aria-label]')]
    .filter(el => /构建|Describe|message/i.test(el.getAttribute('data-placeholder') || el.getAttribute('aria-label') || ''))
    .map(el => ({ tag: el.tagName, cls: String(el.className).slice(0, 60), label: el.getAttribute('aria-label') }));
  return JSON.stringify({ textareas: areas, editables, placeholder }, null, 1);
})()`)
console.log(facts)
