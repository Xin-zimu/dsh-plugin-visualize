/**
 * CDP helper for the stage-2 browser verification.
 *
 * browser-skill authorises one action per cooperation context, so every helper
 * action is: cooperate sync -> capture context_id -> one action.
 *
 * @module dsh-plugin-visualize/evidence/browser-phase-2/cdp
 */
import { execFileSync } from 'node:child_process'

/** Agent-window session under test. */
export const SESSION = process.env.BSK_SESSION ?? 'qncc'
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

/** Capture a PNG. */
export async function screenshot(out) {
  const context = await sync()
  return JSON.parse(raw(['screenshot', '--session', SESSION, '--context', context, '--out', out, '--json']))
}

/** Capture a PNG. */
export async function reload() {
  const context = await sync()
  return JSON.parse(raw(['reload', '--session', SESSION, '--context', context, '--json']))
}

/** Read the current accessibility observation. */
export function observe() {
  return JSON.parse(raw(['observe', '--session', SESSION, '--json']))
}
