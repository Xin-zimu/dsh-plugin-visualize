import { execFileSync } from 'node:child_process'
const S = 'msel'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

function run(a) {
  return execFileSync('bsk', a, { encoding: 'utf8', maxBuffer: 1 << 26 })
}

async function syncRetry() {
  for (let i = 0; i < 6; i++) {
    try {
      const p = JSON.parse(run(['cooperate', 'sync', '--session', S, '--json']))
      if (p.context_id) return p.context_id
    } catch { /* the user still holds the tab */ }
    try { run(['cooperate', 'wait', '--session', S, '--json']) } catch { /* ignore */ }
    await sleep(300)
  }
  throw new Error('could not obtain a cooperation context')
}

const ctx = await syncRetry()
const shot = JSON.parse(run(['screenshot', '--session', S, '--context', ctx,
  '--out', 'D:/work/dsh-plugin-visualize/evidence/browser-phase-1/screenshots/b08-dark.png', '--json']))
console.log(JSON.stringify(shot))
