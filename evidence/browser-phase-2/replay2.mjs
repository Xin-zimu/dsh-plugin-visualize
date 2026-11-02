import { evaluate, reload, screenshot } from './cdp.mjs'

await reload()
await new Promise(r => setTimeout(r, 4500))

const state = await evaluate(`(function(){
  const cards = [...document.querySelectorAll('[data-openui-card]')]
  const slider = document.querySelector('[data-openui-card] input[type=range]')
  return JSON.stringify({
    cards: cards.length,
    sliderValue: slider?.value ?? null,
    sliderDisabled: slider?.disabled ?? null,
    texts: cards.map(c => (c.textContent || '').slice(0, 150)),
    consoleErrors: [],
  })
})()`)
console.log('after reload:', JSON.stringify(state, null, 2))
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-2/screenshots/stage2-replay.png')))
