import { evaluate } from './cdp.mjs'

const S = `(function(){
  const card = document.querySelector('[data-openui-card]')
  if (!card) return JSON.stringify({ error: 'no card' })
  // Walk ancestors and find one that defines custom properties.
  const read = (el) => {
    const out = {}
    for (const sheet of [...document.styleSheets, ...(document.adoptedStyleSheets||[])]) {
      let rules; try { rules = sheet.cssRules } catch { continue }
      const walk = (list) => { for (const r of list) { if (r.cssRules) { walk(r.cssRules); continue } if (r.style) for (const p of r.style) if (p.startsWith('--')) out[p] = r.style.getPropertyValue(p).trim() } }
      walk(rules)
    }
    return out
  }
  // Author stylesheets are unreadable here (161 sheets, 1 var). Read resolved values instead.
  const names = []
  const cs = getComputedStyle(card)
  for (let i = 0; i < cs.length; i++) { const n = cs[i]; if (n.startsWith('--')) names.push(n) }
  const vals = {}
  for (const n of names) vals[n] = cs.getPropertyValue(n).trim()
  return JSON.stringify({ count: names.length, names: names.sort(), vals }, null, 2)
})()`
console.log(evaluate(S))
