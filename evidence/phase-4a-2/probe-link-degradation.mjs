/**
 * Confirm the *degradation* of a refused `Link`, not just the absence of an href.
 *
 * ADR-008 says a refused target renders the label as ordinary text. "No href"
 * alone would also be satisfied by drawing nothing at all — and an element that
 * silently disappears is the defect this project already named (a renderer gap
 * that looked like an intentionally empty card). So this asserts presence.
 */
import { evaluate } from '../lib/cdp.mjs'

const facts = await evaluate(`(function () {
  const cards = [...document.querySelectorAll('[data-openui-card]')];
  const card = cards[cards.length - 1];
  const text = (card.innerText || '');
  const nodes = [...card.querySelectorAll('*')];
  const refused = nodes.filter(el => String(el.textContent ?? '').includes('a refused javascript link'));
  const permitted = nodes.filter(el => String(el.textContent ?? '').includes('a permitted https link'));
  return JSON.stringify({
    theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
    refusedLabelVisible: text.includes('a refused javascript link'),
    permittedLabelVisible: text.includes('a permitted https link'),
    // The refused label must be carried by an element that is NOT an anchor.
    refusedCarrierTags: refused.map(el => el.tagName),
    refusedHasAnchor: refused.some(el => el.tagName === 'A'),
    permittedHasAnchor: permitted.some(el => el.tagName === 'A'),
    javascriptInDom: /javascript:/i.test(card.innerHTML),
    anchorCount: card.querySelectorAll('a').length,
    hrefs: [...card.querySelectorAll('a')].map(a => a.getAttribute('href')),
  });
})()`)

console.log(JSON.stringify(facts, null, 1))

const problems = []
if (facts.refusedLabelVisible !== true) problems.push('the refused link label is not visible as text')
if (facts.refusedHasAnchor !== false) problems.push('the refused link is still an anchor')
if (facts.javascriptInDom !== false) problems.push('the string javascript: survives into the rendered DOM')
if (facts.permittedHasAnchor !== true) problems.push('the permitted link is not an anchor')
if (facts.anchorCount !== 1) problems.push(`expected exactly 1 anchor, saw ${facts.anchorCount}`)
process.exit(problems.length > 0 ? 1 : 0)
