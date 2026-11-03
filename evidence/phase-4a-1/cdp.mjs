/**
 * CDP helper for the stage-4A-1 browser verification.
 *
 * Same one-action-per-context discipline as `evidence/browser-phase-3/cdp.mjs`:
 * `cooperate sync` -> use the returned `context_id` for exactly one action ->
 * sync again. Kept local so this phase's scripts do not depend on a previous
 * phase's file staying unchanged.
 *
 * @module dsh-plugin-visualize/evidence/phase-4a-1/cdp
 */
import { execFileSync } from 'node:child_process'

/** Agent-window session under test. */
export const SESSION = process.env.BSK_SESSION ?? 'ytvi'
const SLEEP = ms => new Promise(resolve => setTimeout(resolve, ms))

function raw(args) {
  try {
    return execFileSync('bsk', args, {
      encoding: 'utf8',
      maxBuffer: 1 << 26,
      env: { ...process.env, BSK_AUTO_START: '0' },
    })
  } catch (error) {
    throw new Error(`bsk ${args[0]} failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`)
  }
}

/**
 * Take a fresh cooperation context *and* its observation id.
 *
 * Protocol 1.8 (bsk 0.4.1) requires the strict observation returned by
 * `cooperate sync` to accompany the action; 0.4.0 accepted the context alone.
 * Both are returned here so every caller passes them together.
 */
export async function observeContext(attempts = 12) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const parsed = JSON.parse(raw(['cooperate', 'sync', '--session', SESSION, '--json']))
      if (parsed.context_id) {
        // 1.8 returns `observation_id` at the top level; 1.7 nested it under
        // `observation`. Both shapes are accepted so a future skew is a degraded
        // run rather than a crash.
        const observation = parsed.observation_id ?? parsed.observation?.observation_id
        return { context: parsed.context_id, observation }
      }
    } catch {
      /* the tab is still held; wait for hand-back */
    }
    try { raw(['cooperate', 'wait', '--session', SESSION, '--json']) } catch { /* ignore */ }
    await SLEEP(400)
  }
  throw new Error('could not obtain a cooperation context')
}

/** Wait for hand-back, then take a fresh cooperation context. */
export async function sync(attempts = 12) {
  return (await observeContext(attempts)).context
}

/** Evaluate one expression in the page and return its JSON-parsed value. */
export async function evaluate(expression) {
  const { context, observation } = await observeContext()
  const args = ['evaluate', '--session', SESSION, '--context', context]
  if (observation !== undefined) args.push('--observation', observation)
  const parsed = JSON.parse(raw([...args, '--json', expression]))
  if (parsed.ok !== true) throw new Error(`evaluate rejected: ${JSON.stringify(parsed.error)}`)
  return typeof parsed.value === 'string' ? JSON.parse(parsed.value) : parsed.value
}

/** Run one step action with the context and observation it needs. */
async function step(action, params) {
  const { context, observation } = await observeContext()
  const args = [
    'step', '--session', SESSION, '--action', action,
    '--params', JSON.stringify(params), '--context', context,
  ]
  if (observation !== undefined) args.push('--observation', observation)
  return JSON.parse(raw([...args, '--json']))
}

/** Evaluate and return the raw string, for markup rather than JSON. */
export async function evaluateRaw(expression) {
  const { context, observation } = await observeContext()
  const args = ['evaluate', '--session', SESSION, '--context', context]
  if (observation !== undefined) args.push('--observation', observation)
  const parsed = JSON.parse(raw([...args, '--json', expression]))
  if (parsed.ok !== true) throw new Error(`evaluate rejected: ${JSON.stringify(parsed.error)}`)
  return parsed.value
}

/** Fill one selector with text. */
export async function fill(selector, text) {
  return step('fill', { selector, value: text })
}

/** Click one selector or observed ref, retrying through content changes. */
export async function click(target, label = String(target)) {
  const params = typeof target === 'string' && /^@?e\d+$/u.test(target) ? { ref: target } : { selector: target }
  for (let i = 0; i < 5; i += 1) {
    try {
      const out = await step('click', params)
      if (out.ok) return true
    } catch (error) {
      if (!/content changed|covered|not_visible|matched 2/u.test(String(error.message))) throw error
    }
    await SLEEP(600)
  }
  console.log('could not click', label)
  return false
}

/** Press one key. */
export async function press(key) {
  return step('press', { key })
}

/** Navigate the agent tab. */
export async function navigate(url) {
  return step('navigate', { url })
}

/** Capture a PNG, optionally cropped to one observed ref. */
export async function screenshot(out, options = {}) {
  const { context, observation } = await observeContext()
  const args = ['screenshot', '--session', SESSION, '--context', context, '--out', out, '--json']
  if (observation !== undefined) args.push('--observation', observation)
  if (options.fullPage) args.push('--full-page')
  // 0.4.1 replaced `--selector` with `--ref`: a crop target is an observed ref,
  // not an arbitrary CSS selector.
  if (options.ref) args.push('--ref', options.ref)
  return JSON.parse(raw(args))
}

/** Reload the agent tab. */
export async function reload() {
  const { context, observation } = await observeContext()
  const args = ['reload', '--session', SESSION, '--context', context]
  if (observation !== undefined) args.push('--observation', observation)
  return JSON.parse(raw([...args, '--json']))
}

/** Read buffered console messages. */
export function consoleRead() {
  return JSON.parse(raw(['console', '--session', SESSION, '--json']))
}

/** Resize the agent window, to change the card's available width. */
export async function resize(width, height) {
  const { context, observation } = await observeContext()
  const args = [
    'window', 'resize', '--session', SESSION, '--context', context,
    '--width', String(width), '--height', String(height),
  ]
  if (observation !== undefined) args.push('--observation', observation)
  return JSON.parse(raw([...args, '--json']))
}

export { SLEEP }
