/**
 * Draw the 4A-1 card: navigate, fill the composer, send, and wait for the card.
 *
 * One script, so a failure at any stage stops the run instead of leaving a
 * half-populated composer behind. `fill` is used rather than per-character
 * typing: it is one action instead of ~900, and on the matched CLI/extension
 * version (0.4.1 / 0.4.1) it no longer crashes the host's draft editor.
 */
import { click, evaluate, fill, navigate, SLEEP } from './cdp.mjs'

const URL = process.env.DSH_URL
if (!URL) throw new Error('set DSH_URL')

const COMPOSER = '[contenteditable=true][role=textbox]'
const SEND = 'button[aria-label="发送消息"], button[aria-label="Send message"]'

const PROMPT = [
  'Use visualize with backend "openui", title "A1 layout". One statement per line, no explanation.',
  'root is Col gap 4 with these children in order:',
  'Box col gap 2 padding 3 background "info" radius "md" border "l2" holding Title "Box nesting"',
  'and a Row gap 2 with Text "left" and Text "right";',
  'Box row gap 3 padding 2 background "success" radius "lg" width 240 holding Text "fixed 240";',
  'Box row gap 2 padding 2 background "warning" radius "lg" flex 1 holding Text "elastic";',
  'Row gap 2 with Text "before", Spacer, Text "after";',
  'Divider;',
  'Grid 2 columns gap 3 with Box col gap 1 padding 2 background "danger" radius "sm" border true',
  'holding Text "cell one", and a Col holding Text "cell two" and Caption "second line";',
  'Grid minChildWidth 180 gap 2 with Text "auto a", Text "auto b", Text "auto c";',
  'Grid 3 columns with Text "three a", Text "three b", Text "three c";',
  'and an empty Grid.',
].join(' ')

await navigate(URL)
await SLEEP(7000)

const ready = await evaluate(`(function () {
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ box: box !== null, send: send !== null, len: box === null ? -1 : (box.textContent || '').length });
})()`)
console.log('ready:', JSON.stringify(ready))
if (!ready.box) throw new Error('the composer never appeared')

console.log('fill:', JSON.stringify(await fill(COMPOSER, PROMPT)).slice(0, 110))
await SLEEP(1500)

const composed = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({ length: (box.textContent || '').length, sendDisabled: send.disabled });
})()`)
console.log('composed:', JSON.stringify(composed))

console.log('send:', await click(SEND, 'send'))
await SLEEP(6000)

const after = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ length: (box.textContent || '').length, cards: document.querySelectorAll('[data-openui-card]').length });
})()`)
console.log('after send:', JSON.stringify(after))
