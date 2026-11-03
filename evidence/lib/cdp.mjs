/**
 * The one authoritative CDP helper for browser verification.
 *
 * ## Why this file exists
 *
 * Stage 1 through 4A-1 each carried their own `cdp.mjs` — four copies, 50 to 159
 * lines, drifting apart as the browser-skill protocol changed underneath them.
 * A phase-3 script could not call `resize`; a 4A-1 script could not call `type`.
 * Every new phase paid to re-derive the parts it needed, and a fix in one copy
 * never reached the others.
 *
 * This is the superset, and it is the only copy that should be edited. The
 * older phase copies stay on disk as **historical record**: they are what those
 * runs actually executed, and rewriting them would falsify evidence.
 * `docs/testing/BROWSER_HARNESS.md` records that arrangement and how to check
 * behaviour parity between this file and the copies it replaces.
 *
 * ## Protocol discipline
 *
 * browser-skill authorises one action per cooperation context:
 * `cooperate sync` -> use the returned context for exactly one action -> sync
 * again. From 0.4.1 (protocol 1.8) each action also needs the unused strict
 * `observation_id` from that same sync; 0.4.0 (1.7) returned it nested. Both
 * shapes are read here, so a future skew degrades instead of crashing.
 *
 * ## Deliberate omissions
 *
 * There is no per-character typing helper. `fill` sets a whole value in one
 * action, and `press('Enter')` submits. A character loop was written once in
 * 4A-1 to work around a protocol skew, cost ~1760 subprocess calls and seven
 * minutes, and was never needed once the CLI matched the extension. If `fill`
 * fails, the fault is the environment — diagnose it, do not type around it.
 *
 * @module dsh-plugin-visualize/evidence/lib/cdp
 */
import { execFileSync } from 'node:child_process'

/** Agent-window session under test; set `BSK_SESSION` per run. */
export const SESSION = process.env.BSK_SESSION ?? ''

/** The daemon is started and owned by the operator, never by a script. */
const ENV = { ...process.env, BSK_AUTO_START: '0' }

/**
 * Hard ceiling on one `bsk` invocation.
 *
 * Without this a `bsk` call against a tab that has no page loaded does not fail
 * — it hangs until something else gives up. A probe that hangs is worse than one
 * that fails: it burns wall-clock, gets backgrounded, and then looks like a
 * product problem. Measured in 4A-1: a bare `evaluate` against a blank tab never
 * returned.
 */
const CALL_TIMEOUT_MS = Number(process.env.BSK_CALL_TIMEOUT_MS ?? 20000)

const SLEEP = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Run one `bsk` invocation, bounded in time.
 * @param args - argv after `bsk`.
 * @returns stdout.
 */
function raw(args) {
  if (SESSION === '') throw new Error('set BSK_SESSION to the agent-window session id')
  try {
    return execFileSync('bsk', args, {
      encoding: 'utf8', maxBuffer: 1 << 26, env: ENV, timeout: CALL_TIMEOUT_MS, killSignal: 'SIGKILL',
    })
  } catch (error) {
    const timedOut = error.killed === true || error.signal === 'SIGKILL' || /ETIMEDOUT/u.test(String(error.code ?? ''))
    if (timedOut) {
      throw new Error(`bsk ${args[0]} timed out after ${CALL_TIMEOUT_MS}ms (tab may have no page loaded)`)
    }
    throw new Error(`bsk ${args[0]} failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`)
  }
}

/**
 * Take a fresh cooperation context together with the observation it authorises.
 *
 * @param attempts - how many hand-back waits to tolerate.
 * @returns the context id and, on protocol 1.8+, its observation id.
 */
export async function observeContext(attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const parsed = JSON.parse(raw(['cooperate', 'sync', '--session', SESSION, '--json']))
      if (parsed.context_id) {
        // 1.8 puts `observation_id` at the top level; 1.7 nested it under
        // `observation`. Accepting both is the difference between a degraded run
        // and a crash when the CLI and extension versions disagree.
        const observation = parsed.observation_id ?? parsed.observation?.observation_id
        return { context: parsed.context_id, observation, raw: parsed }
      }
    } catch {
      /* the tab is still held; wait for hand-back */
    }
    try { raw(['cooperate', 'wait', '--session', SESSION, '--json']) } catch { /* ignore */ }
    await SLEEP(400)
  }
  throw new Error('could not obtain a cooperation context')
}

/** Take a fresh cooperation context id. */
export async function sync(attempts = 12) {
  return (await observeContext(attempts)).context
}

/** Build the shared `--context`/`--observation` argv pair. */
async function authority() {
  const { context, observation } = await observeContext()
  const args = ['--context', context]
  if (observation !== undefined) args.push('--observation', observation)
  return args
}

/**
 * Evaluate an expression in the page.
 *
 * Prefer returning a small object: this output lands in a terminal, then in an
 * evidence file, then in a transcript. Returning the whole accessibility tree
 * or a full DOM dump is the single easiest way to waste a context window.
 *
 * @param expression - the expression; may end in `JSON.stringify(...)`.
 * @returns the parsed value.
 */
export async function evaluate(expression) {
  const args = ['evaluate', '--session', SESSION, ...await authority()]
  const parsed = JSON.parse(raw([...args, '--json', expression]))
  if (parsed.ok !== true) throw new Error(`evaluate rejected: ${JSON.stringify(parsed.error)}`)
  return typeof parsed.value === 'string' ? JSON.parse(parsed.value) : parsed.value
}

/** Evaluate and return the raw string, for markup rather than JSON. */
export async function evaluateRaw(expression) {
  const args = ['evaluate', '--session', SESSION, ...await authority()]
  const parsed = JSON.parse(raw([...args, '--json', expression]))
  if (parsed.ok !== true) throw new Error(`evaluate rejected: ${JSON.stringify(parsed.error)}`)
  return parsed.value
}

/**
 * Run exactly one step action, retrying the transient refusals.
 *
 * Two kinds of refusal are *not* failures and must not be reported as one:
 *
 * - `observation_changed` / "strict observation changed": the page moved between
 *   `cooperate sync` and the dispatch. On a live conversation (a streaming turn,
 *   a counter) this happens constantly. The correct response is a fresh sync and
 *   one more attempt — not a diagnosis of the product.
 * - "content changed" / "covered": the target shifted under the pointer.
 *
 * Everything else surfaces immediately: a real permission error silently retried
 * five times is how a defect becomes invisible.
 *
 * Exported because the phase-1 helper exported it and a phase may need an action
 * this module has no dedicated wrapper for. Adding a wrapper is preferable where
 * one reads better; this is the general escape hatch.
 *
 * @param action - click | press | fill | hover | select | drag | scroll-to | wheel | navigate
 * @param params - that action's protocol fields, e.g. `{ selector, value }`.
 * @param attempts - how many transient refusals to tolerate.
 * @returns the parsed step result.
 */
export async function step(action, params, attempts = 4) {
  let lastError
  for (let i = 0; i < attempts; i += 1) {
    const args = [
      'step', '--session', SESSION, '--action', action,
      '--params', JSON.stringify(params), ...await authority(),
    ]
    try {
      return JSON.parse(raw([...args, '--json']))
    } catch (error) {
      const message = String(error.message)
      const transient = /observation_changed|strict observation changed|content changed|covered by|not_visible/u.test(message)
      if (!transient) throw error
      lastError = error
      await SLEEP(500)
    }
  }
  throw lastError ?? new Error(`bsk step ${action} failed`)
}

/**
 * Fill one target with a whole value in a single action.
 *
 * This is what replaces character-by-character typing. It sets the editor's
 * value directly, so a long program costs one call rather than one per glyph.
 *
 * @param selector - CSS selector, or `@eN` ref.
 * @param value - the complete text.
 */
export async function fill(selector, value) {
  return step('fill', { selector, value })
}

/**
 * Click a selector or an observed ref.
 * @param target - CSS selector, or `@eN`.
 * @param label - name used in the retry log.
 * @returns whether a click landed.
 */
export async function click(target, label = String(target)) {
  const params = typeof target === 'string' && /^@?e\d+$/u.test(target) ? { ref: target } : { selector: target }
  // `step` already retries the transient refusals (page moved, target covered).
  // Only the "did it land" question is left here.
  try {
    const out = await step('click', params)
    if (out.ok) return true
  } catch (error) {
    if (!/matched 2|overlay/u.test(String(error.message))) throw error
    console.log('could not click', label, '—', String(error.message).split('\n')[1]?.slice(0, 80))
    return false
  }
  console.log('could not click', label)
  return false
}

/** Press one key combo, e.g. `Enter` or `Control+a`. */
export async function press(key) {
  return step('press', { key })
}

/** Navigate the agent-window tab. */
export async function navigate(url) {
  return step('navigate', { url })
}

/** Reload the agent-window tab. */
export async function reload() {
  const args = ['reload', '--session', SESSION, ...await authority()]
  return JSON.parse(raw([...args, '--json']))
}

/**
 * Capture a PNG.
 * @param out - destination path.
 * @param options - `ref` to crop to an observed ref, `fullPage`.
 */
export async function screenshot(out, options = {}) {
  const args = ['screenshot', '--session', SESSION, '--out', out, ...await authority()]
  if (options.fullPage) args.push('--full-page')
  if (options.ref) args.push('--ref', options.ref)
  return JSON.parse(raw([...args, '--json']))
}

/**
 * Resize the agent window.
 *
 * Note: on DSH this does **not** reliably change a card's width — measure the
 * card element instead. Kept because some checks genuinely want the viewport.
 */
export async function resize(width, height) {
  const args = [
    'window', 'resize', '--session', SESSION,
    '--width', String(width), '--height', String(height), ...await authority(),
  ]
  return JSON.parse(raw([...args, '--json']))
}

/** Read buffered console entries. */
export function consoleRead() {
  return JSON.parse(raw(['console', '--session', SESSION, '--json']))
}

/**
 * Read the accessibility observation.
 * @returns the whole observation record; `text` is a large string.
 */
export function observe() {
  return JSON.parse(raw(['observe', '--session', SESSION, '--json']))
}

/**
 * The ref of the first accessibility-tree row matching `pattern`.
 *
 * Cheaper and more stable than a CSS selector when the harness overlay covers
 * the same point: the extension resolves refs itself.
 *
 * @param pattern - regex applied to each row of the observation text.
 * @returns `@eN`, or undefined.
 */
export function refFor(pattern) {
  const line = observe().text.split('\n').find(row => pattern.test(row))
  return line?.match(/@(e\d+)/u)?.[0]
}

export { SLEEP }
