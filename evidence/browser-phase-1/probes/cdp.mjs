// Shared CDP helper for the phase-1.3 re-verification probes.
//
// browser-skill authorises exactly one action per cooperation context, so every
// helper action does: cooperate sync -> capture context_id -> one evaluate.
// Keeping this in a module (rather than passing JS on a command line) avoids
// shell quoting damage to multi-line expressions.
import { execFileSync } from 'node:child_process'

export const SESSION = process.env.BSK_SESSION ?? 'msel'

function run(args) {
  try {
    return execFileSync('bsk', args, { encoding: 'utf8', maxBuffer: 1 << 26 })
  } catch (err) {
    throw new Error(`bsk ${args[0]} failed:\n${err.stdout ?? ''}${err.stderr ?? ''}`)
  }
}

export function sync() {
  const parsed = JSON.parse(run(['cooperate', 'sync', '--session', SESSION, '--json']))
  if (!parsed.context_id) throw new Error('sync returned no context_id')
  return parsed.context_id
}

export function evaluate(expression) {
  const context = sync()
  const raw = run(['evaluate', '--session', SESSION, '--context', context, '--json', expression])
  const parsed = JSON.parse(raw)
  if (parsed.ok !== true) throw new Error(`evaluate rejected: ${raw}`)
  const value = parsed.value
  return typeof value === 'string' ? JSON.parse(value) : value
}

export function screenshot(out, ref) {
  const context = sync()
  const args = ['screenshot', '--session', SESSION, '--context', context, '--out', out, '--json']
  if (ref) args.push('--ref', ref)
  return JSON.parse(run(args))
}

export function step(action, params) {
  const context = sync()
  return JSON.parse(
    run(['step', '--session', SESSION, '--action', action, '--params', JSON.stringify(params), '--context', context, '--json']),
  )
}

export function observe() {
  return JSON.parse(run(['observe', '--session', SESSION, '--json']))
}
