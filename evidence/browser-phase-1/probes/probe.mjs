import { execFileSync } from 'node:child_process'
const raw = execFileSync('bsk', ['observe', '--session', 'ihub', '--json'], { encoding: 'utf8', maxBuffer: 1 << 24 })
const obs = JSON.parse(raw)
const lines = obs.text.split('\n')
console.log('lines:', lines.length)
for (const line of lines) {
  if (/textbox|发送|contenteditable|composer/i.test(line)) console.log(line)
}
console.log('--- tail ---')
console.log(lines.slice(-25).join('\n'))
