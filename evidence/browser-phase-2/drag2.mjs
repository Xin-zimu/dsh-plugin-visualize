import { evaluate, screenshot } from './cdp.mjs'

// Drag the bound slider and read the OTHER components back.
const before = await evaluate(`(function(){
  const card = [...document.querySelectorAll('[data-openui-card]')].pop()
  const s = card.querySelector('input[type=range]')
  return JSON.stringify({ text: (card.textContent||'').slice(0,160), value: s.value, disabled: s.disabled })
})()`)
console.log('before:', JSON.stringify(before))

const dragged = await evaluate(`(function(){
  const card = [...document.querySelectorAll('[data-openui-card]')].pop()
  const s = card.querySelector('input[type=range]')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(s, '6')
  s.dispatchEvent(new Event('input', { bubbles: true }))
  s.dispatchEvent(new Event('change', { bubbles: true }))
  return JSON.stringify({ set: s.value })
})()`)
console.log('dragged:', JSON.stringify(dragged))
await new Promise(r => setTimeout(r, 1200))

const after = await evaluate(`(function(){
  const card = [...document.querySelectorAll('[data-openui-card]')].pop()
  const s = card.querySelector('input[type=range]')
  card.scrollIntoView({ block: 'center' })
  return JSON.stringify({ text: (card.textContent||'').slice(0,200), value: s.value, rows: card.querySelectorAll('div').length })
})()`)
console.log('after :', JSON.stringify(after))
await new Promise(r => setTimeout(r, 600))
console.log(JSON.stringify(await screenshot('D:/work/dsh-plugin-visualize/evidence/browser-phase-2/screenshots/stage2-slider.png')))
