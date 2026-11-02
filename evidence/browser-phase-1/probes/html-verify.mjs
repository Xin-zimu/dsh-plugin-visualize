import { execFileSync } from 'node:child_process'
const run = (args) => execFileSync('bsk', args, { encoding: 'utf8', maxBuffer: 1 << 24 })
const clickRef = (ref) => {
  for (let a = 1; a <= 5; a++) {
    const ctx = JSON.parse(run(['cooperate', '--session', 'ihub', 'sync', '--json'])).context_id
    try { JSON.parse(run(['step', '--session', 'ihub', '--action', 'click', '--params', JSON.stringify({ ref }), '--context', ctx, '--json'])); return true } catch (e) {}
  }
  return false
}
let obs = JSON.parse(run(['observe', '--session', 'ihub', '--json']))
let lines = obs.text.split('\n')
console.log('turns with 已完成:', lines.filter(l => /button "已完成，用时/.test(l)).length)
// Expand every fold that is still closed.
for (const l of lines.filter(l => /button "已完成，用时|button "已调用工具"/.test(l))) {
  clickRef(l.match(/@e\d+/)[0])
  await new Promise(r => setTimeout(r, 900))
}
obs = JSON.parse(run(['observe', '--session', 'ihub', '--json']))
lines = obs.text.split('\n')
console.log('--- HTML card region ---')
const i = lines.findIndex(l => /HTML Card|HTML backend|iframe/.test(l))
console.log(i === -1 ? '(not found)' : lines.slice(Math.max(0, i - 3), i + 12).join('\n'))
