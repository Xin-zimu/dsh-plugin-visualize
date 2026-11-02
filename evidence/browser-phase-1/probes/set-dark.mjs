// B08 — switch the host to dark, then measure the same card.
import { execFileSync } from 'node:child_process'
const S = 'msel'
const run = (a) => execFileSync('bsk', a, { encoding: 'utf8', maxBuffer: 1 << 26 })
const sync = () => JSON.parse(run(['cooperate','sync','--session',S,'--json'])).context_id
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function click(target, label) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const ctx = sync()
    try {
      const out = JSON.parse(run(['step','--session',S,'--action','click','--params',JSON.stringify(target),'--context',ctx,'--json']))
      if (out.ok) { console.log('clicked', label); return true }
    } catch (e) {
      const m = String(e.stdout || '').match(/"message": "([^"]*)"/)
      console.log(label, attempt, '->', m ? m[1] : 'error')
    }
    await sleep(700)
  }
  return false
}

if (!(await click({ ref: '@e12' }, '深色'))) process.exit(1)
await sleep(1500)

const obs = JSON.parse(run(['observe','--session',S,'--json']))
const lines = obs.text.split('\n')
const start = lines.findIndex(l => /外观/.test(l))
console.log(lines.slice(start, start + 8).join('\n'))
