/**
 * Clear the composer and put a program request in it, avoiding the crash the
 * first attempt hit.
 *
 * `fill` sets a draft; on this host build a very long single-line value crashed
 * the editor's `setDraft` (`text.replace is not a function`). The card's program
 * does not need to be long: the model writes it, not this script.
 */
import { click, evaluate, fill, press, SLEEP } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'

const PROMPT = [
  'Use visualize with backend "openui". Title it "A1 layout". One statement per line.',
  'Col gap 4 containing:',
  'a Box col, gap 2, padding 3, background "info", radius "md", border "l2",',
  'holding Title "Box nesting" and a Row gap 2 with Text "left" and Text "right";',
  'a Box row, gap 3, padding 2, background "success", radius "lg", width 240, holding Text "fixed";',
  'a Box row, gap 2, padding 2, background "warning", radius "lg", flex 1, holding Text "elastic";',
  'a Row gap 2 with Text "before", Spacer(), Text "after";',
  'a Divider();',
  'a Grid 2 columns gap 3 with a Box col gap 1 padding 2 background "danger" radius "sm" border true',
  'holding Text "cell one", and a Col holding Text "cell two" and Caption "second line";',
  'a Grid minChildWidth 180 gap 2 with Text "auto a", Text "auto b", Text "auto c";',
  'a Grid 3 columns with Text "three a", Text "three b", Text "three c";',
  'and an empty Grid().',
].join(' ')

// Start from a clean composer: a previous attempt left text and a crashed draft.
await click(COMPOSER, 'composer')
await press('Control+a')
await press('Backspace')
await SLEEP(400)

console.log('fill:', JSON.stringify(await fill(COMPOSER, PROMPT)).slice(0, 120))
await SLEEP(1200)

const state = await evaluate(`(function () {
  const composer = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    length: (composer.textContent || '').length,
    sendDisabled: send === null ? null : send.disabled,
  });
})()`)
console.log('state:', JSON.stringify(state))
