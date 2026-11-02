import { evaluate } from './cdp.mjs'
import { contrast } from './contrast-lib.mjs'

// Sample the host's own secondary text (the "HTML Card" path label, timestamps,
// the "已完成，用时 2秒" line) and compare with our card's caption colour.
const S = [
  '(function(){',
  '  const found = [];',
  '  const walk = (root) => {',
  '    for (const el of root.querySelectorAll("*")) {',
  '      if (el.shadowRoot) walk(el.shadowRoot);',
  '      if (el.children.length !== 0) continue;',
  '      const t = (el.textContent || "").trim();',
  '      if (!t || t.length < 3 || t.length > 80) continue;',
  '      const s = getComputedStyle(el);',
  '      const fs = parseFloat(s.fontSize);',
  '      if (fs > 13 || fs < 10) continue;',
  '      found.push({ text: t.slice(0, 40), color: s.color, fontSize: s.fontSize });',
  '      if (found.length >= 25) return;',
  '    }',
  '  };',
  '  walk(document.body);',
  '  return JSON.stringify(found);',
  '})()',
].join('\n')

const rows = evaluate(S)
const summary = rows.map(r => ({ ...r, onWhite: contrast(r.color, 'rgb(255,255,255)') }))
console.log(JSON.stringify(summary, null, 2))
