// B07 + B08 — measure the OpenUI card through its real root.
//
// Measurements are taken against [data-openui-card]: walking up from a Button
// lands on a transparent wrapper, which would let an unstyled card pass.
import { evaluate } from './cdp.mjs'

const MEASURE = (tag) => `(function(){
  const cards = [...document.querySelectorAll('[data-openui-card]')]
  if (!cards.length) return JSON.stringify({ tag: '${tag}', error: 'no card root' })
  const card = cards[0]
  const cs = getComputedStyle(card)
  const rect = card.getBoundingClientRect()
  const padL = parseFloat(cs.paddingLeft), padR = parseFloat(cs.paddingRight)
  const contentLeft = rect.left + padL
  const contentWidth = rect.width - padL - padR
  const leaves = [...card.querySelectorAll('*')].filter(n => n.children.length === 0 && n.textContent.trim())
  const rows = leaves.map(n => {
    const r = n.getBoundingClientRect(), s = getComputedStyle(n)
    return {
      tag: n.tagName.toLowerCase(),
      text: n.textContent.trim().slice(0, 28),
      leftOffset: Math.round((r.left - contentLeft) * 100) / 100,
      width: Math.round(r.width * 100) / 100,
      color: s.color, background: s.backgroundColor,
      borderColor: s.borderTopColor, borderWidth: s.borderTopWidth,
      borderRadius: s.borderTopLeftRadius, fontSize: s.fontSize,
    }
  })
  const btn = card.querySelector('button')
  const btnRect = btn ? btn.getBoundingClientRect() : null
  const btnCS = btn ? getComputedStyle(btn) : null
  const varNames = ['--foreground','--muted-foreground','--primary','--primary-foreground','--border','--radius','--font-sans']
  const vars = {}
  for (const n of varNames) vars[n] = cs.getPropertyValue(n).trim().slice(0, 40)
  return JSON.stringify({
    tag: '${tag}',
    scheme: { root: getComputedStyle(document.documentElement).colorScheme, body: getComputedStyle(document.body).colorScheme, darkAttr: document.body.hasAttribute('data-ds-dark-theme') },
    card: { width: Math.round(rect.width), height: Math.round(rect.height), contentWidth: Math.round(contentWidth),
            alignItems: cs.alignItems, display: cs.display, color: cs.color, fontFamily: cs.fontFamily.slice(0, 24) },
    vars,
    varsResolved: Object.values(vars).filter(v => v !== '').length,
    rows,
    button: btnRect ? {
      leftOffset: Math.round((btnRect.left - contentLeft) * 100) / 100,
      width: Math.round(btnRect.width * 100) / 100,
      spansContentWidth: btnRect.width >= contentWidth - 1,
      background: btnCS.backgroundColor, color: btnCS.color,
      border: btnCS.borderTopWidth + ' ' + btnCS.borderTopStyle + ' ' + btnCS.borderTopColor,
      radius: btnCS.borderTopLeftRadius,
    } : null,
  }, null, 2)
})()`

export function measure(tag) { return evaluate(MEASURE(tag)) }
