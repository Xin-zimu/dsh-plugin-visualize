/**
 * Stage 7C workstream B — real-host load of the rebuilt plugin on DSH 0.2.2-rc.1
 * (isolated home tmp/dsh-022, profile p22web, :3094). TEST ONLY, not shipped.
 *
 * What it proves: after the devDependencies/peer-range change, the built plugin
 * still activates on the real 0.2.2-rc.1 host, the `visualize` tool is callable,
 * its OpenUI card renders, durable events show the call/result, the style route
 * answers, and the console stays clean.
 *
 * It reuses the Gate 2 test-only probe (`visualize-probe`) already installed in
 * the isolated profile; the probe is not product code.
 *
 * Usage:
 *   $env:BSK_SESSION = '<bsk session>'
 *   node evidence/stage-7c/compat/real-host-check.mjs <base-url>
 *
 * Writes JSON only (no screenshots) to evidence/stage-7c/compat/real-host/.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { evaluate, SLEEP } from '../../lib/cdp.mjs'

const OUT = 'evidence/stage-7c/compat/real-host'
const BASE = process.argv[2] ?? 'http://127.0.0.1:3094'
const results = {}
// The page repaints while the SPA boots; `document_changed` is a moving-page
// refusal, not a product fact (AGENTS.md §10), so retry it here instead of
// weakening the shared helper mid-run.
const ev = async (expression, attempts = 80) => {
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await evaluate(expression, 1)
    } catch (error) {
      const message = String(error?.message ?? error)
      if (/document_changed|synchronize before|control_context_invalid|observation_changed/.test(message) && i + 1 < attempts) {
        await SLEEP(500)
        continue
      }
      throw error
    }
  }
  throw new Error('page never stabilized for evaluate')
}

async function record(name, value) {
  results[name] = value
  await mkdir(OUT, { recursive: true })
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(value, null, 2)}\n`)
}

async function op(body, timeoutMs = 120000) {
  const json = JSON.stringify(body)
  await ev(`(() => {
    window.__v7c = window.__v7c ?? { seq: 0, results: {} }
    const seq = ++window.__v7c.seq
    window.__v7c.results[seq] = { pending: true }
    fetch('/api/visualize-probe/op', {
      method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin',
      body: ${JSON.stringify(json)},
    }).then(async (response) => {
      const text = await response.text()
      let value
      try { value = JSON.parse(text) } catch { value = { raw: text } }
      window.__v7c.results[seq] = { status: response.status, value }
    }).catch(error => { window.__v7c.results[seq] = { fetchError: String(error) } })
    return JSON.stringify({ started: true })
  })()`)
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const value = await ev(`JSON.stringify(Object.entries(window.__v7c?.results ?? {}).at(-1)?.[1] ?? { pending: true })`)
    if (!value.pending) return value
    await SLEEP(300)
  }
  return { timedOut: true }
}

function pageState() {
  return ev(`(() => {
    const frames = Array.from(document.querySelectorAll('iframe'))
    const consoleErrors = (window.__consoleErrors ?? []).slice(-10)
    return JSON.stringify({
      url: location.href,
      title: document.title,
      openuiCards: document.querySelectorAll('[data-openui-card]').length,
      unrendered: document.querySelectorAll('[data-openui-unrendered]').length,
      iframes: frames.length,
      sandboxedFrames: frames.filter(f => (f.getAttribute('sandbox') ?? '').includes('allow-scripts')).length,
      consoleErrors: consoleErrors,
      bodyHead: (document.body.innerText || '').slice(0, 300),
      bodyTail: (document.body.innerText || '').slice(-500),
    })
  })()`)
}

// G0: the browser must be on the isolated host, not the owner's GUI.
const gate = await ev(`JSON.stringify({ href: location.href })`)
if (!String(gate.href).startsWith(BASE)) {
  console.error(`ENVIRONMENT BLOCK: tab is on ${gate.href}, not ${BASE}`)
  process.exit(2)
}

const consoleBuffer = await ev(`(() => {
  if (window.__v7cConsoleInstalled) return JSON.stringify('already')
  window.__consoleErrors = []
  const push = (level) => (...args) => {
    if (level === 'error' || level === 'warn') {
      window.__consoleErrors.push(String(args[0]).slice(0, 300))
    }
  }
  const originalError = console.error
  const originalWarn = console.warn
  console.error = (...args) => { window.__consoleErrors.push(String(args[0]).slice(0, 300)); originalError.apply(console, args) }
  console.warn = (...args) => { window.__consoleErrors.push(String(args[0]).slice(0, 300)); originalWarn.apply(console, args) }
  window.__v7cConsoleInstalled = true
  return JSON.stringify('installed')
})()`)
await record('00-g0-page', await pageState())
await record('00-console-install', consoleBuffer)

const roots = await op({ op: 'roots' })
const sessionId = roots.value?.roots?.[0]?.sessionId
await record('01-roots', roots)
if (sessionId === undefined) {
  console.error('ENVIRONMENT BLOCK: probe returned no root session')
  process.exit(2)
}

const marker = `STAGE7C compat ${Date.now().toString(36)}`
const promptText = `Use the visualize tool to render a card titled "Stage 7C compat" whose body says compatibility OK. Keep it minimal, then answer with the single word DONE. (${marker})`
await record('02-prompt', await op({ op: 'prompt', sessionId, text: promptText, clientTimeZone: 'UTC' }))

let settled
for (let i = 0; i < 150; i += 1) {
  const state = await op({ op: 'session', sessionId }, 20000)
  const events = await op({ op: 'events', sessionId, types: [], limit: 1 }, 20000)
  if (state.value?.agentStatus === 'idle' && (events.value?.sessionSeq ?? 0) > 1) {
    settled = { state: state.value, seq: events.value?.sessionSeq }
    break
  }
  await SLEEP(1000)
}
await record('03-settled', settled ?? { timedOut: true })
await SLEEP(2500)
await record('04-page-after', await pageState())
await record('05-events', await op({
  op: 'events',
  sessionId,
  types: ['user/message', 'tool/call', 'tool/result', 'assistant/message', 'turn/start', 'turn/end'],
  limit: 200,
}))

await ev(`(() => {
  window.__route3 = null
  fetch('/api/dsh-visualize/style-files', { credentials: 'same-origin' }).then(async (r) => {
    window.__route3 = { status: r.status, contentType: r.headers.get('content-type'), head: (await r.text()).slice(0, 160) }
  }).catch((e) => { window.__route3 = { error: String(e) } })
  return JSON.stringify('started')
})()`)
await SLEEP(1500)
await record('06-style-route', await ev('JSON.stringify(window.__route3 ?? { pending: true })'))

const bundle = await ev(`(() => {
  const scripts = Array.from(document.querySelectorAll('script[src]')).map(s => s.getAttribute('src'))
  return JSON.stringify({ scripts: scripts.slice(0, 10) })
})()`)
await record('07-scripts', bundle)

console.log(JSON.stringify({
  sessionId,
  settled: results['03-settled'],
  pageAfter: results['04-page-after'],
  styleRoute: results['06-style-route'],
  events: results['05-events']?.value?.events?.map?.(e => e.type ?? e) ?? 'n/a',
}, null, 2).slice(0, 6000))

