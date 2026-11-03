/**
 * Which monospace font token does the real DSH host actually publish?
 *
 * `Code` is the first 4A-2 component that needs a mono stack, and the card's
 * frame vocabulary has `--font-mono`, which does NOT exist in the host document
 * — the same shape as D17 (`--dsw-static-purple-500`) and D18
 * (`--dsh-font-family-text-default`): a `var()` that resolves to nothing still
 * paints its fallback, so the card looks right while the declaration lies.
 *
 * Rather than guess a plausible-looking `--dsw-*` name, this reads every
 * candidate the host was measured to declare (evidence/phase-4a-1/
 * host-tokens.json `fontCandidates`) and reports which ones resolve to a
 * non-empty value on the live page.
 *
 * Usage: node evidence/phase-4a-2/probe-host-mono.mjs
 * Requires a fresh smoke pass and BSK_SESSION.
 */
import { evaluate } from '../lib/cdp.mjs'

const CANDIDATES = [
  '--dsw-font-family',
  '--ds-font-family-code',
  '--dsw-font-markdown-code-font-family',
  '--dsw-font-markdown-code-block-font-family',
  '--dsw-font-markdown-code-block-small-font-family',
  '--dsw-font-family-brand',
  '--dsw-font-markdown-base-font-family',
  // Deliberately included although it is known to be absent, so a future run
  // re-proves the negative instead of inheriting a belief.
  '--dsw-font-mono',
  '--font-mono',
]

const expression = `(function () {
  const body = getComputedStyle(document.body);
  const card = document.querySelector('[data-openui-card]');
  const onCard = card === null ? null : getComputedStyle(card);
  const out = {};
  for (const name of ${JSON.stringify(CANDIDATES)}) {
    const bodyValue = body.getPropertyValue(name).trim();
    out[name] = {
      onBody: bodyValue === '' ? null : bodyValue.slice(0, 70),
      onCard: onCard === null ? null : (onCard.getPropertyValue(name).trim() || null),
      resolves: bodyValue !== '',
    };
  }
  return JSON.stringify({ theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light', tokens: out }, null, 1);
})()`

const report = await evaluate(expression)
const resolving = Object.entries(report.tokens)
  .filter(([, value]) => value.resolves)
  .map(([name, value]) => `${name} = ${value.onBody}`)

console.log(JSON.stringify({
  theme: report.theme,
  resolves: resolving,
  absent: Object.entries(report.tokens).filter(([, v]) => !v.resolves).map(([n]) => n),
}, null, 1))
