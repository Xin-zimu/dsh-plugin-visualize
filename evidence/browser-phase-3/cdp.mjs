/**
 * CDP helper for the stage-3 browser verification (P3-05).
 *
 * Same discipline as evidence/browser-phase-2/cdp.mjs: browser-skill authorises
 * one action per cooperation context, so every helper action is
 * cooperate sync -> capture context_id -> one action.
 *
 * @module dsh-plugin-visualize/evidence/browser-phase-3/cdp
 */
import { execFileSync } from 'node:child_process'

/** Agent-window session under test. */
export const SESSION = process.env.BSK_SESSION ?? 'edhi'
const SLEEP = ms => new Promise(resolve => setTimeout(resolve, ms))

function raw(args) {
  try {
    return execFileSync('bsk', args, { encoding: 'utf8', maxBuffer: 1 << 26 })
  } catch (error) {
    throw new Error(`bsk ${args[0]} failed:\n${error.stdout ?? ''}${error.stderr ?? ''}`)
  }
}

/** Wait for hand-back, then take a fresh cooperation context. */
export async function sync(attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const parsed = JSON.parse(raw(['cooperate', 'sync', '--session', SESSION, '--json']))
      if (parsed.context_id) return parsed.context_id
    } catch {
      /* the tab is still held; wait for hand-back */
    }
    try { raw(['cooperate', 'wait', '--session', SESSION, '--json']) } catch { /* ignore */ }
    await SLEEP(300)
  }
  throw new Error('could not obtain a cooperation context')
}

/** Evaluate one expression in the page and return its JSON-parsed value. */
export async function evaluate(expression) {
  const context = await sync()
  const parsed = JSON.parse(raw(['evaluate', '--session', SESSION, '--context', context, '--json', expression]))
  if (parsed.ok !== true) throw new Error(`evaluate rejected: ${JSON.stringify(parsed.error)}`)
  return typeof parsed.value === 'string' ? JSON.parse(parsed.value) : parsed.value
}

/** Click one selector or snapshot ref, retrying through content changes. */
export async function click(target, label = String(target)) {
  const params = typeof target === 'string' ? { selector: target } : target
  for (let i = 0; i < 5; i += 1) {
    const context = await sync()
    try {
      const out = JSON.parse(raw(['step', '--session', SESSION, '--action', 'click', '--params', JSON.stringify(params), '--context', context, '--json']))
      if (out.ok) return true
    } catch (error) {
      const message = String(error.message)
      if (!/content changed|covered|not_visible/.test(message)) throw error
    }
    await SLEEP(600)
  }
  console.log('could not click', label)
  return false
}

/** Fill one selector with text, through a fresh cooperation context. */
export async function fill(selector, text) {
  const context = await sync()
  return JSON.parse(raw([
    'step', '--session', SESSION, '--action', 'fill',
    '--params', JSON.stringify({ selector, value: text }), '--context', context, '--json',
  ]))
}

/** Type text into the focused element. */
export async function type(text) {
  const context = await sync()
  return JSON.parse(raw(['step', '--session', SESSION, '--action', 'type', '--params', JSON.stringify({ text }), '--context', context, '--json']))
}

/** Press one key. */
export async function press(key) {
  const context = await sync()
  return JSON.parse(raw(['step', '--session', SESSION, '--action', 'press', '--params', JSON.stringify({ key }), '--context', context, '--json']))
}

/** Navigate the agent tab. */
export async function navigate(url) {
  const context = await sync()
  return JSON.parse(raw(['step', '--session', SESSION, '--action', 'navigate', '--params', JSON.stringify({ url }), '--context', context, '--json']))
}

/** Capture a PNG, optionally cropped to one ref or stitched full-page. */
export async function screenshot(out, options = {}) {
  const context = await sync()
  const args = ['screenshot', '--session', SESSION, '--context', context, '--out', out, '--json']
  if (options.fullPage) args.push('--full-page')
  if (options.ref) args.push('--ref', options.ref)
  if (options.selector) args.push('--selector', options.selector)
  return JSON.parse(raw(args))
}

/** Reload the agent tab. */
export async function reload() {
  const context = await sync()
  return JSON.parse(raw(['reload', '--session', SESSION, '--context', context, '--json']))
}

/** Read the current accessibility observation. */
export function observe() {
  return JSON.parse(raw(['observe', '--session', SESSION, '--json']))
}

export { SLEEP }
