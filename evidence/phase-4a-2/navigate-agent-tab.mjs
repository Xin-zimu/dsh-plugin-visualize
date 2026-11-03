/**
 * Point the agent tab at the freshly restarted isolated DSH server.
 *
 * Needed because the server restarts with a new token every session, and a tab
 * left on the previous URL (or on about:blank) makes every later evaluate hang
 * rather than fail. Uses the canonical helper so the cooperate-sync handshake is
 * the harness's, not a re-implementation.
 */
import { navigate, evaluate } from '../../evidence/lib/cdp.mjs'

const url = (await import('node:fs')).readFileSync('tmp/dsh-p3/current-url.txt', 'utf8').trim()
console.log(`navigating to ${url}`)
await navigate(url)
// Confirm the tab really moved: a navigation that silently did nothing would
// make every later measurement meaningless.
const where = await evaluate('JSON.stringify({ url: location.href.slice(0, 60), title: document.title, ready: document.readyState })')
console.log(JSON.stringify(where, null, 1))
