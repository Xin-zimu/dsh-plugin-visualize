/**
 * Minimal CDP driver for genuine IME composition.
 *
 * ## Why this exists at all
 *
 * `bsk` can click, fill and press, but it has no way to express an IME
 * composition. A synthetic `CompositionEvent` dispatched from page script is
 * **not** an IME: the browser never enters composition mode, so a controlled
 * component that clobbers the composition buffer would not be caught. That is
 * exactly the defect V1 is supposed to detect.
 *
 * Chrome DevTools Protocol does have the real thing:
 *   Input.imeSetComposition  -> enters composition mode, sets the pre-edit
 *   Input.dispatchKeyEvent   -> commits, with the candidate window lifecycle
 * These go through the browser's own input pipeline, so React sees the same
 * events it sees when a human types with a pinyin IME.
 *
 * This driver speaks CDP directly over the WebSocket so it adds no dependency,
 * and it drives a **separate isolated Edge profile** — the acceptance profile —
 * never the operator's own browser.
 */
// Node 24 exposes a global `WebSocket`; no import needed and no dependency added.

let nextId = 1
const pending = new Map()

/** Resolve the page target to attach to. */
export async function firstPageTarget(port = 9222) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  const targets = await response.json()
  const page = targets.find(t => t.type === 'page')
  if (!page) throw new Error('no page target')
  return page
}

/** Open a CDP session on a page target. */
export async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
  })
  ws.addEventListener('message', event => {
    const msg = JSON.parse(event.data)
    const slot = pending.get(msg.id)
    if (!slot) return
    pending.delete(msg.id)
    if (msg.error) slot.reject(new Error(JSON.stringify(msg.error)))
    else slot.resolve(msg.result)
  })
  return {
    send(method, params = {}) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)) }
        }, 20000)
      })
    },
    close() { ws.close() },
  }
}

/** Evaluate an expression in the page and return its parsed JSON value. */
export async function evaluateJson(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 400))
  return result.result.value
}

/** Wait until a predicate expression is truthy, or throw after `tries`. */
export async function waitFor(cdp, expression, tries = 40, delayMs = 500) {
  for (let i = 0; i < tries; i += 1) {
    if (await evaluateJson(cdp, expression)) return true
    await new Promise(r => setTimeout(r, delayMs))
  }
  return false
}
