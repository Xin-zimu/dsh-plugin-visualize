import { execFileSync } from 'node:child_process'
const S = 'msel'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))
const run = (a) => execFileSync('bsk', a, { encoding: 'utf8', maxBuffer: 1 << 26 })

async function syncRetry() {
  for (let i = 0; i < 6; i++) {
    try {
      const p = JSON.parse(run(['cooperate', 'sync', '--session', S, '--json']))
      if (p.context_id) return p.context_id
    } catch { /* user holds the tab */ }
    try { run(['cooperate', 'wait', '--session', S, '--json']) } catch { /* ignore */ }
    await sleep(300)
  }
  throw new Error('no context')
}

async function clickRef(ref, label) {
  for (let i = 0; i < 5; i++) {
    const ctx = await syncRetry()
    try {
      const out = JSON.parse(run(['step','--session',S,'--action','click','--params',JSON.stringify({ ref }),'--context',ctx,'--json']))
      if (out.ok) { console.log('clicked', label); return true }
    } catch (e) {
      const m = String(e.stdout || '').match(/"message": "([^"]*)"/)
      console.log(label, i + 1, m ? m[1] : 'error')
    }
    await sleep(600)
  }
  return false
}

if (!(await clickRef('@e2', '通用设置'))) process.exit(1)
await sleep(1200)
const obs = JSON.parse(run(['observe','--session',S,'--json']))
const lightRef = obs.text.split('\n').find(l => /button "浅色"/.test(l))?.match(/@e\d+/)?.[0]
console.log('light ref:', lightRef)
if (lightRef) await clickRef(lightRef, '浅色')
await sleep(1200)

const after = JSON.parse(run(['observe','--session',S,'--json']))
const window = after.text.split('\n')
const i = window.findIndex(l => /外观/.test(l))
console.log(window.slice(i, i + 6).join('\n'))
