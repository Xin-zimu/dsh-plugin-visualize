// Restart is not needed: patchReload is live, but a hard reload guarantees the
// new client bundle is the one in memory.
import { execFileSync } from 'node:child_process'
const S = 'msel'
const run = (a) => execFileSync('bsk', a, { encoding: 'utf8', maxBuffer: 1 << 26 })
const sync = () => JSON.parse(run(['cooperate','sync','--session',S,'--json'])).context_id
const ctx = sync()
const out = JSON.parse(run(['reload','--session',S,'--context',ctx,'--json']))
console.log(JSON.stringify(out))
