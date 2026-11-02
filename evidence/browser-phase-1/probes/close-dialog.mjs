import { execFileSync } from 'node:child_process'
const S = 'msel'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const run = (a) => execFileSync('bsk', a, { encoding: 'utf8', maxBuffer: 1 << 26 })

async function syncRetry() {
  for (let i = 0; i < 8; i++) {
    try {
      const p = JSON.parse(run(['cooperate', 'sync', '--session', S, '--json']))
      if (p.context_id) return p.context_id
    } catch { /* user holds the tab */ }
    try { run(['cooperate', 'wait', '--session', S, '--json']) } catch { /* ignore */ }
    await sleep(300)
  }
  throw new Error('no context')
}

// The dialog's close button carries a CJK aria-label that does not survive the
// CLI argument round-trip; Escape is the reliable way to dismiss a modal.
for (let attempt = 1; attempt <= 3; attempt++) {
  const ctx = await syncRetry()
  try {
    const out = JSON.parse(run(['step','--session',S,'--action','press','--params',JSON.stringify({ key: 'Escape' }),'--context',ctx,'--json']))
    if (out.ok) { console.log('pressed Escape'); break }
  } catch (e) {
    console.log('escape attempt', attempt, 'failed')
  }
  await sleep(600)
}
await sleep(1000)

const obs = JSON.parse(run(['observe','--session',S,'--json']))
console.log('dialog present:', /dialog "设置"/.test(obs.text))
