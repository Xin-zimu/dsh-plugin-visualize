/**
 * Ask the model for the 4A-1 card, typed rather than filled.
 *
 * The program is described, not pasted: the model has to write openui-lang and
 * the host has to validate it against the signature table. A DOM injected by
 * this script would prove nothing about that chain.
 */
import { click, evaluate, SLEEP, sync } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8',
    maxBuffer: 1 << 26,
    env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

const COMPOSER = '[contenteditable=true][role=textbox]'

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

/** Key names for the characters that are not literal. */
const NAMED = { ' ': ['Space'], '\n': ['Enter'] }

async function typeOne(character) {
  const candidates = NAMED[character] ?? [character]
  let lastError
  for (const key of candidates) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const context = await sync()
      try {
        const out = JSON.parse(raw([
          'step', '--session', SESSION, '--action', 'press',
          '--params', JSON.stringify({ key }), '--context', context, '--json',
        ]))
        if (out.ok) return key
        lastError = new Error(JSON.stringify(out).slice(0, 160))
      } catch (error) {
        lastError = error
        if (!/content changed|covered|not_visible|cooperat/u.test(String(error.message))) break
      }
      await SLEEP(200)
    }
  }
  throw new Error(`could not type ${JSON.stringify(character)}: ${String(lastError?.message ?? '').slice(0, 160)}`)
}

await click(COMPOSER, 'composer')
await SLEEP(300)
for (const character of PROMPT) await typeOne(character)

const before = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  const send = document.querySelector('button[aria-label="发送消息"], button[aria-label="Send message"]');
  return JSON.stringify({
    length: (box.textContent || '').length,
    tail: (box.textContent || '').slice(-40),
    sendDisabled: send === null ? null : send.disabled,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('composed:', JSON.stringify(before))

console.log('send:', await click('button[aria-label="发送消息"], button[aria-label="Send message"]', 'send'))
await SLEEP(5000)

const after = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({
    length: (box.textContent || '').length,
    cards: document.querySelectorAll('[data-openui-card]').length,
  });
})()`)
console.log('after send:', JSON.stringify(after))
