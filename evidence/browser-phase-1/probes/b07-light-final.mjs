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

async function click(selector, label) {
  for (let i = 0; i < 5; i++) {
    const ctx = await syncRetry()
    try {
      const out = JSON.parse(run(['step','--session',S,'--action','click','--params',JSON.stringify({ selector }),'--context',ctx,'--json']))
      if (out.ok) { console.log('clicked', label); return true }
    } catch (e) {
      const m = String(e.stdout || '').match(/"message": "([^"]*)"/)
      console.log(label, i + 1, m ? m[1] : 'error')
    }
    await sleep(700)
  }
  return false
}

await click('button.hE4tRW_root[aria-expanded="false"]', 'turn fold')
await sleep(900)
await click('button.BE0jCW_title[aria-expanded="false"]', 'tool fold')
await sleep(900)

{
  const ctx = await syncRetry()
  run(['evaluate','--session',S,'--context',ctx,'--json','document.querySelector("[data-openui-card]").scrollIntoView({ block: "center" }), "ok"'])
}
await sleep(800)
{
  const ctx = await syncRetry()
  const shot = JSON.parse(run(['screenshot','--session',S,'--context',ctx,'--out','D:/work/dsh-plugin-visualize/evidence/browser-phase-1/screenshots/b07-aligned-light.png','--json']))
  console.log(JSON.stringify(shot))
}
