/**
 * Capture the accepted card in both themes.
 *
 * Cropped to the card's own observed ref rather than the viewport: the point of
 * the image is what the four components look like, not what the chat happens to
 * show around them.
 */
import { screenshot, SLEEP } from './cdp.mjs'
import { execFileSync } from 'node:child_process'
import { SESSION } from './cdp.mjs'

const THEME = process.env.CAPTURE_THEME ?? 'light'

function raw(args) {
  return execFileSync('bsk', args, {
    encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, BSK_AUTO_START: '0' },
  })
}

/** The ref of the tail copy of the accepted card. */
function cardRef() {
  const text = JSON.parse(raw(['observe', '--session', SESSION, '--json'])).text
  const lines = text.split('\n')
  const start = lines.findIndex(row => /"A1 layout"/u.test(row))
  // The card's StaticTexts follow its title; the enclosing generic is what the
  // screenshot needs, so prefer a nearby generic if the title row is a text node.
  const generic = lines.slice(Math.max(0, start - 3), start + 1)
    .map(row => row.match(/@(e\d+)\s+generic/u)?.[1])
    .filter(Boolean)
    .pop()
  return generic === undefined ? undefined : `@${generic}`
}

const ref = cardRef()
console.log('card ref:', ref)

try {
  const shot = await screenshot(`evidence/phase-4a-1/a1-${THEME}-card.png`, ref === undefined ? {} : { ref })
  console.log('viewport shot:', JSON.stringify(shot).slice(0, 160))
} catch (error) {
  console.log('cropped shot failed:', String(error.message).split('\n')[1]?.slice(0, 120))
  const shot = await screenshot(`evidence/phase-4a-1/a1-${THEME}-card.png`, { fullPage: true })
  console.log('full page shot:', JSON.stringify(shot).slice(0, 160))
}
await SLEEP(500)
