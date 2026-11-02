import { evaluate } from './cdp.mjs'
import { contrast } from './contrast-lib.mjs'

// The card paints no background of its own, so text contrast is measured
// against the nearest ancestor that actually paints one.
const S = [
  '(function(){',
  '  const card = document.querySelector("[data-openui-card]");',
  '  const opaque = (c) => c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent";',
  '  let backdrop = null, node = card.parentElement;',
  '  while (node) {',
  '    const bg = getComputedStyle(node).backgroundColor;',
  '    if (opaque(bg)) { backdrop = { tag: node.tagName, cls: (node.className || "").toString().slice(0, 40), bg: bg }; break; }',
  '    node = node.parentElement;',
  '  }',
  '  const leaves = [...card.querySelectorAll("*")].filter(n => n.children.length === 0 && n.textContent.trim());',
  '  const rows = leaves.map(n => {',
  '    const s = getComputedStyle(n);',
  '    return { text: n.textContent.trim().slice(0, 24), tag: n.tagName.toLowerCase(),',
  '             fg: s.color, bg: opaque(s.backgroundColor) ? s.backgroundColor : null,',
  '             borderWidth: s.borderTopWidth, borderColor: s.borderTopColor, radius: s.borderTopLeftRadius };',
  '  });',
  '  return JSON.stringify({ backdrop: backdrop, rows: rows, bodyBg: getComputedStyle(document.body).backgroundColor });',
  '})()',
].join('\n')

const data = evaluate(S)
const base = data.backdrop?.bg ?? data.bodyBg
const out = {
  backdrop: data.backdrop ?? { tag: 'body', bg: data.bodyBg },
  rows: data.rows.map(r => ({
    ...r,
    effectiveBg: r.bg ?? base,
    contrast: contrast(r.fg, r.bg ?? base),
  })),
}
console.log(JSON.stringify(out, null, 2))
