import { click, observe } from './cdp.mjs'

// Dismiss the one-time preview notice if it is present.
const before = observe()
const continueRef = before.text.split('\n').find(l => /button "继续"/.test(l))?.match(/@e\d+/)?.[0]
if (continueRef) {
  console.log('dismissing preview notice:', continueRef)
  await click({ ref: continueRef }, 'preview notice')
  await new Promise(r => setTimeout(r, 2000))
}
const after = observe()
console.log('dialog present:', /dialog "预览版说明"/.test(after.text))
const lines = after.text.split('\n')
console.log(lines.filter(l => /textbox|发送消息|选择模型/.test(l)).join('\n'))
