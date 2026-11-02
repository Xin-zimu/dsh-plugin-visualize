import { execFileSync } from 'node:child_process'
const run = (args) => execFileSync('bsk', args, { encoding: 'utf8', maxBuffer: 1 << 24 })
// 1. No dialog was raised: a real onerror would have produced a JS dialog the daemon queues.
try {
  const status = run(['status', '--json'])
  console.log('daemon status has pending dialog:', /dialog|pending/i.test(status) ? 'CHECK' : 'none reported')
} catch (e) { console.log('status: unavailable') }

// 2. The fragment's own source, as persisted, must be escaped where it enters the card.
const store = 'C:/Users/<user>\\.dsh\\visualize\\sessions'
console.log('--- the stored fragment ---')
const { readFileSync } = await import('node:fs')
const { execSync } = await import('node:child_process')
const dirs = execSync('dir /b "' + store + '"', { encoding: 'utf8', shell: 'cmd.exe' }).trim().split(/\r?\n/)
const latest = dirs.at(-1)
const file = execSync('dir /b "' + store + '\\' + latest + '\\*.html"', { encoding: 'utf8', shell: 'cmd.exe' }).trim().split(/\r?\n/).at(-1)
const html = readFileSync(store + '\\' + latest + '\\' + file, 'utf8')
console.log('file:', file)
console.log('contains escaped &lt;img:', html.includes('&lt;img'))
console.log('contains raw <img:', /<img\s/.test(html))
