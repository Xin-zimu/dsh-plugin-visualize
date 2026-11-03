/**
 * Stage 4A-1 browser verification, step 2: draw a card that exercises all four
 * components through the real tool path.
 *
 * The program is stated as a *description* to the model, not as text pasted
 * into the card, so what the browser measures is the product: the model writes
 * openui-lang, the host validates it against the signature table, and the
 * renderer draws it. A hand-injected DOM would prove nothing about that chain.
 *
 * Every statement is on its own physical line, which the language requires.
 */
import { fill, evaluate, SLEEP } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'

const PROMPT = [
  'Use the visualize tool with backend "openui", not html.',
  'Draw a card titled "A1 layout". One statement per physical line. Do not explain.',
  'The card is a Col with gap 4 containing, in this order:',
  '1. A Box with direction col, gap 2, padding 3, background "info", radius "md", border "l2",',
  '   containing a Title "Box nesting" and a Row with gap 2 holding a Text "left" and a Text "right".',
  '2. A Box with direction row, gap 3, padding 2, background "success", radius "lg", width 240,',
  '   containing a Text "fixed 240".',
  '3. A Box with direction row, gap 2, padding 2, background "warning", radius "lg", flex 1,',
  '   containing a Text "elastic".',
  '4. A Row with gap 2 containing Text "before", then a Spacer, then Text "after".',
  '5. A Divider.',
  '6. A Grid with 2 columns, gap 3, whose cells are:',
  '   a Box with direction col, gap 1, padding 2, background "danger", radius "sm", border true,',
  '   holding a Text "cell one"; and a Col holding a Text "cell two" and a Caption "second line".',
  '7. A Grid with minChildWidth 180 and gap 2, whose cells are Text "auto a", Text "auto b", Text "auto c".',
  '8. A Grid with 3 columns containing Text "three a", Text "three b", Text "three c".',
  '9. An empty Grid: a Grid with no children.',
  'Name the title exactly "A1 layout".',
].join(' ')

console.log('fill:', JSON.stringify(await fill(COMPOSER, PROMPT)).slice(0, 120))
await SLEEP(900)

const sent = await evaluate(`(function () {
  const send = [...document.querySelectorAll('button')]
    .find(b => /发送消息|Send message/.test(b.getAttribute('aria-label') || ''));
  if (!send || send.disabled) return JSON.stringify({ sent: false });
  send.click();
  return JSON.stringify({ sent: true });
})()`)
console.log('send:', sent)
await SLEEP(3000)

/** Wait for the new card to settle. */
const deadline = Date.now() + 240_000
let last
while (Date.now() < deadline) {
  last = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const hit = cards.find(c => /A1 layout/.test(c.textContent || ''));
    if (!hit) return JSON.stringify({ found: false, cards: cards.length });
    return JSON.stringify({
      found: true,
      text: hit.textContent.slice(0, 160),
      unrendered: [...hit.querySelectorAll('[data-openui-unrendered]')].map(n => n.getAttribute('data-openui-unrendered')),
      grids: hit.querySelectorAll('[style*="display: grid"], [style*="display:grid"]').length,
    });
  })()`)
  if (last.found) break
  await SLEEP(3000)
}
console.log('card:', JSON.stringify(last, null, 1))
