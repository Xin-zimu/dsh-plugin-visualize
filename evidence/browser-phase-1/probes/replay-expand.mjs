import { execFileSync } from 'node:child_process'
const run = (args) => execFileSync('bsk', args, { encoding: 'utf8', maxBuffer: 1 << 24 })
const clickRef = (ref) => {
  for (let a = 1; a <= 4; a++) {
    const ctx = JSON.parse(run(['cooperate', '--session', 'ihub', 'sync', '--json'])).context_id
    try { JSON.parse(run(['step', '--session', 'ihub', '--action', 'click', '--params', JSON.stringify({ ref }), '--context', ctx, '--json'])); return true }
    catch (e) { /* retry */ }
  }
  return false
}
// Turn fold -> tool fold, exactly as before the reload.
clickRef('@e80')
await new Promise(r => setTimeout(r, 800))
let obs = JSON.parse(run(['observe', '--session', 'ihub', '--json']))
let toolRef = obs.text.split('\n').find(l => /button "已调用工具"/.test(l))?.match(/@e\d+/)?.[0]
console.log('tool fold ref:', toolRef)
if (toolRef) clickRef(toolRef)
await new Promise(r => setTimeout(r, 800))
obs = JSON.parse(run(['observe', '--session', 'ihub', '--json']))
const lines = obs.text.split('\n')
const bare = lines.filter(l => /^\s+(Browser Test|OpenUI Browser Test|Hello DSH)\s*$/.test(l))
console.log('card text after reload+expand:', JSON.stringify(bare))
console.log('Test Button element:', lines.some(l => /button "Test Button"/.test(l)) ? 'PRESENT' : 'ABSENT')
