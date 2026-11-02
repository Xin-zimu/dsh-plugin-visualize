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

async function click(target, label) {
  const params = typeof target === 'string' ? { selector: target } : target
  for (let i = 0; i < 5; i++) {
    const ctx = await syncRetry()
    try {
      const out = JSON.parse(run(['step','--session',S,'--action','click','--params',JSON.stringify(params),'--context',ctx,'--json']))
      if (out.ok) { console.log('clicked', label); return true }
    } catch (e) {
      const m = String(e.stdout || '').match(/"message": "([^"]*)"/)
      console.log(label, i + 1, m ? m[1] : 'error')
    }
    await sleep(700)
  }
  return false
}

// Account menu -> settings -> general -> dark
await click('button[aria-label="账号菜单"]', 'account')
await sleep(900)
{
  const obs = JSON.parse(run(['observe','--session',S,'--json']))
  const ref = obs.text.split('\n').find(l => /menuitem "设置"/.test(l))?.match(/@e\d+/)?.[0]
  if (ref) await click({ ref }, 'settings')
}
await sleep(1400)
{
  const obs = JSON.parse(run(['observe','--session',S,'--json']))
  const general = obs.text.split('\n').find(l => /button "通用设置"/.test(l))?.match(/@e\d+/)?.[0]
  if (general) await click({ ref: general }, '通用设置')
}
await sleep(1200)
{
  const obs = JSON.parse(run(['observe','--session',S,'--json']))
  const dark = obs.text.split('\n').find(l => /button "深色"/.test(l))?.match(/@e\d+/)?.[0]
  if (dark) await click({ ref: dark }, '深色')
}
await sleep(1400)

const ctx = await syncRetry()
run(['step','--session',S,'--action','press','--params',JSON.stringify({ key: 'Escape' }),'--context',ctx,'--json'])
await sleep(1000)
{
  const ctx2 = await syncRetry()
  run(['evaluate','--session',S,'--context',ctx2,'--json','document.querySelector("[data-openui-card]").scrollIntoView({ block: "center" }), "ok"'])
}
await sleep(800)
{
  const ctx3 = await syncRetry()
  const shot = JSON.parse(run(['screenshot','--session',S,'--context',ctx3,'--out','D:/work/dsh-plugin-visualize/evidence/browser-phase-1/screenshots/b08-dark.png','--json']))
  console.log(JSON.stringify(shot))
}
