/**
 * Draw the 4A-1 card: focus the composer, fill it, send, wait for the card.
 *
 * The previous attempts failed with `fill_target_changed` — the composer loses
 * focus between the harness resolving the selector and typing into it, which a
 * long value makes more likely. Focusing first, then filling, is closer to what
 * a person does and gives the harness a settled target.
 */
import { click, evaluate, fill, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

const COMPOSER = '[contenteditable=true][role=textbox]'

function refFor(pattern) {
  const out = execFileSync('bsk', ['observe', '--session', SESSION, '--json'], {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
  const line = JSON.parse(out).text.split('\n').find(row => pattern.test(row))
  return line?.match(/@(e\d+)/u)?.[0]
}

const PROMPT = [
  'Use visualize with backend "openui", title "A1 layout". One statement per line, no explanation.',
  'root is Col gap 4 with these children in order:',
  'Box col gap 2 padding 3 background "info" radius "md" border "l2" holding Title "Box nesting" and a Row gap 2 with Text "left" and Text "right";',
  'Box row gap 3 padding 2 background "success" radius "lg" width 240 holding Text "fixed 240";',
  'Box row gap 2 padding 2 background "warning" radius "lg" flex 1 holding Text "elastic";',
  'Row gap 2 with Text "before", Spacer, Text "after";',
  'Divider;',
  'Grid 2 columns gap 3 with Box col gap 1 padding 2 background "danger" radius "sm" border true holding Text "cell one", and a Col holding Text "cell two" and Caption "second line";',
  'Grid minChildWidth 180 gap 2 with Text "auto a", Text "auto b", Text "auto c";',
  'Grid 3 columns with Text "three a", Text "three b", Text "three c";',
  'and an empty Grid.',
].join(' ')

const composerRef = refFor(/textbox "发消息或创建任务/u)
console.log('composer ref:', composerRef)
console.log('focus:', await click(composerRef, 'composer'))
await SLEEP(800)

for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    const out = await fill(COMPOSER, PROMPT)
    console.log('fill attempt', attempt, ':', JSON.stringify(out).slice(0, 110))
    break
  } catch (error) {
    console.log('fill attempt', attempt, 'failed:', String(error.message).split('\n')[1]?.slice(0, 100))
    await SLEEP(1500)
  }
}

await SLEEP(1500)
const composed = await evaluate(`(function () {
  const box = document.querySelector('[contenteditable=true][role=textbox]');
  return JSON.stringify({ length: (box.textContent || '').length });
})()`)
console.log('composed:', JSON.stringify(composed))

console.log('send:', await click(refFor(/button "发送消息"/u), 'send'))
await SLEEP(6000)

const deadline = Date.now() + 240_000
let last
while (Date.now() < deadline) {
  last = await evaluate(`(function () {
    const cards = [...document.querySelectorAll('[data-openui-card]')];
    const hit = cards.find(c => /A1 layout/.test(c.textContent || ''));
    if (!hit) return JSON.stringify({ found: false, cards: cards.length });
    return JSON.stringify({
      found: true,
      text: hit.textContent.slice(0, 200),
      unrendered: [...hit.querySelectorAll('[data-openui-unrendered]')].map(n => n.getAttribute('data-openui-unrendered')),
    });
  })()`)
  if (last.found) break
  await SLEEP(3000)
}
console.log('card:', JSON.stringify(last, null, 1))
