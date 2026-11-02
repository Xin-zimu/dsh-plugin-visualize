// Diagnose which of the OpenUI card's CSS variables actually resolve.
//
// getComputedStyle on the card reported rgb(15 17 21) for colour, which looked
// healthy — but that is INHERITED from the chat, not resolved from var().
// A var() that does not exist makes the whole declaration invalid at computed
// value time, so border/background/radius silently fall back to their initial
// values. This probe separates "resolved" from "inherited by accident".
import { evaluate } from './cdp.mjs'

const S = `(function(){
  const card = document.querySelector('[data-openui-card]')
  if (!card) return JSON.stringify({ error: 'no card' })
  const btn = [...card.querySelectorAll('button')][0]

  const declared = ['--foreground','--muted-foreground','--primary','--primary-foreground','--border','--viz-grid','--radius','--font-sans','--viz-series-2','--viz-series-3','--viz-series-4','--viz-series-5']
  const onCard = {}
  for (const n of declared) onCard[n] = getComputedStyle(card).getPropertyValue(n).trim()

  // The declaration the renderer actually emits, and what the browser made of it.
  const btnCS = getComputedStyle(btn)
  return JSON.stringify({
    declaredVarsOnCard: onCard,
    resolvedCount: Object.values(onCard).filter(v => v !== '').length,
    declaredCount: declared.length,
    button: {
      inlineStyle: btn.getAttribute('style'),
      background: btnCS.backgroundColor,
      color: btnCS.color,
      borderWidth: btnCS.borderTopWidth,
      borderStyle: btnCS.borderTopStyle,
      borderColor: btnCS.borderTopColor,
      borderRadius: btnCS.borderTopLeftRadius,
      cursor: btnCS.cursor,
    },
    cardColorFromVarOrInherit: getComputedStyle(card).color,
    parentColor: getComputedStyle(card.parentElement).color,
  }, null, 2)
})()`
console.log(evaluate(S))
