/**
 * The step dispatcher behind a Button's `action`.
 *
 * A Button's action is not code: the evaluator has already resolved it into a
 * value tree (`{ kind: 'element', name: '@Set', args: [...] }`), so this module
 * walks a fixed vocabulary and refuses everything else. There is no `eval`, no
 * `new Function`, and no lookup by a string the program chose at runtime beyond
 * a plain record of the steps this build supports.
 *
 * Scope (P3-07): `@Set`, `@Reset` and `Action([...])` — the three that only
 * touch local `$state`. `@OpenUrl`, `@CopyToClipboard` and `@ToAssistant` are
 * recognised and refused, so they are inert rather than silently mis-handled.
 *
 * ## Timing contract, inherited from the evaluator
 *
 * Values in an action were computed when the tree was rendered, not when the
 * button was clicked. `@Set($n, $n + 1)` therefore holds the number that `$n`
 * had *at render time*, and two steps inside one `Action` both see that same
 * pre-click value. Steps still apply in order — a later step that names the same
 * variable wins — but no step re-reads what an earlier one just wrote.
 *
 * That is the upstream contract (`runAction` reads `value(args[1])` from the
 * descriptor, not from the store), and it is pinned by a test rather than left
 * to be rediscovered.
 *
 * @module @nagi-ovo/dsh-visualize/client/openui-actions
 */

import type { EvaluationValue } from '../backends/openui/evaluate.ts'

/** What one dispatch decided, whether or not it wrote anything. */
export interface ActionOutcome {
  /** Variables to write, already validated against the program's declarations. */
  readonly patch: Readonly<Record<string, EvaluationValue>>
  /** Why a step was refused, or a note about one that applied. Empty on a clean run. */
  readonly diagnostics: readonly ActionDiagnostic[]
  /**
   * Text the caller must copy, when the step asked for it.
   *
   * A clipboard write is an effect, not a value, so it cannot be expressed as a
   * state patch: this module stays pure and hands the caller an instruction that
   * only a genuine user gesture may carry out. `undefined` means "no write was
   * requested"; it never means "a write was requested and dropped".
   */
  readonly clipboard?: string
}

/** One finding from a dispatch. */
export interface ActionDiagnostic {
  /** `refused` never writes; `noted` applied but is worth recording. */
  readonly severity: 'refused' | 'noted'
  /** Stable, machine-checkable reason. */
  readonly code: string
  /** What happened, in one line. */
  readonly message: string
}

/**
 * Steps that reach outside the card and are out of scope for this phase.
 *
 * They are listed rather than ignored so a refusal names the step and a test can
 * assert on it. Implementing one later means moving it out of this set — a
 * deliberate edit, not an accident.
 */
export const UNSUPPORTED_STEPS: ReadonlySet<string> = new Set([
  'OpenUrl', 'ToAssistant',
])

/**
 * Steps this build executes.
 *
 * `CopyToClipboard` is here but is **not** a state step: it produces no patch and
 * is refused when nested, because a clipboard write is an effect rather than a
 * value. See {@link ActionOutcome.clipboard}.
 */
export const SUPPORTED_STEPS: ReadonlySet<string> = new Set([
  'Set', 'Reset', 'Action', 'CopyToClipboard',
])

/** The evaluated shape of an action, as the renderer receives it. */
interface ActionDescriptor {
  readonly kind: 'element'
  readonly name: string
  readonly args: readonly EvaluationValue[]
}

/**
 * Narrow a value to an action descriptor.
 * @param value - any evaluated value.
 * @returns the descriptor, or undefined when it is not one.
 */
function asAction(value: unknown): ActionDescriptor | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const record = value as { kind?: unknown; name?: unknown; args?: unknown }
  if (record.kind !== 'element' || typeof record.name !== 'string') return undefined
  if (!Array.isArray(record.args)) return undefined
  return { kind: 'element', name: record.name, args: record.args as readonly EvaluationValue[] }
}

/**
 * Read the variable an action step targets.
 *
 * The evaluator marks a `$variable` used in a `@Set`'s first slot as a binding
 * descriptor; anything else there is not a variable, and refusing it is what
 * keeps an invalid binding from writing a stray key.
 * @param value - the first argument.
 * @returns the declared name, or undefined.
 */
function bindingName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as { kind?: unknown; name?: unknown }
  return record.kind === 'binding' && typeof record.name === 'string' ? record.name : undefined
}

/** Accumulator state for one dispatch. */
interface Run {
  readonly defaults: Readonly<Record<string, EvaluationValue>>
  readonly patch: Record<string, EvaluationValue>
  readonly diagnostics: ActionDiagnostic[]
  /** Turn one evaluated argument into copyable text, or undefined when it is not text. */
  readonly clipboardText: (value: unknown) => string | undefined
  /** Set when a step asked for a clipboard write. */
  clipboard?: string
}

/**
 * Longest string this build will copy.
 *
 * Chosen rather than derived: 32 KiB is comfortably larger than any text a card
 * legitimately displays (a code block, a URL, a paragraph) and far smaller than the
 * payloads that make a silent clipboard overwrite harmful. It is refused, never
 * truncated: truncating would leave the clipboard holding something other than the
 * text the user pressed the control to copy.
 */
export const MAX_CLIPBOARD_TEXT = 32 * 1024

/**
 * Read one argument as clipboard text.
 *
 * Only strings, numbers and booleans are text. An object or a list is refused
 * rather than coerced, because String({...}) yields "[object Object]" — writing a
 * value the user never saw to their clipboard is worse than a refusal they can read.
 *
 * @param value - the evaluated first argument.
 * @returns the text, or undefined when it is not copyable.
 */
export function clipboardPayload(value: unknown): string | undefined {
  if (typeof value === 'string') {
    if (value === '') return undefined
    if (value.length > MAX_CLIPBOARD_TEXT) return undefined
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return String(value)
  return undefined
}

/** Deepest action tree this dispatcher will walk. */
const MAX_ACTION_DEPTH = 32

/**
 * Run one step into the accumulator.
 * @param action - the step descriptor, or a bare array of them.
 * @param run - accumulator.
 * @param depth - current nesting depth.
 */
function apply(action: unknown, run: Run, depth: number): void {
  if (depth > MAX_ACTION_DEPTH) {
    run.diagnostics.push({ severity: 'refused', code: 'action.too-deep', message: 'the action nests too deeply to run' })
    return
  }
  // A bare array is a list of steps, the same as `Action([...])`'s body.
  if (Array.isArray(action)) {
    for (const step of action) apply(step, run, depth + 1)
    return
  }
  const descriptor = asAction(action)
  if (descriptor === undefined) {
    run.diagnostics.push({ severity: 'refused', code: 'action.shape', message: 'the action is not a step this card can run' })
    return
  }
  const name = descriptor.name.replace(/^@/u, '')

  if (UNSUPPORTED_STEPS.has(name)) {
    run.diagnostics.push({
      severity: 'refused',
      code: 'action.unsupported',
      message: `"@${name}" is not available in this build; the card stays as it is`,
    })
    return
  }
  if (!SUPPORTED_STEPS.has(name)) {
    run.diagnostics.push({
      severity: 'refused',
      code: 'action.unknown',
      message: `unknown action "@${name}"`,
    })
    return
  }

  if (name === 'Action') {
    const steps = descriptor.args[0]
    if (!Array.isArray(steps)) {
      run.diagnostics.push({ severity: 'refused', code: 'action.bad-list', message: 'Action expects a list of steps' })
      return
    }
    for (const step of steps) apply(step, run, depth + 1)
    return
  }

  if (name === 'CopyToClipboard') {
    // Nested inside `Action([...])` is refused on purpose, and this is the whole
    // of the reasoning: a composed action runs several steps from one gesture,
    // and whether that gesture's *user activation* is still live by the time the
    // clipboard call happens is a browser-timing property this build has not
    // measured. The safe answer while it is unmeasured is "no" — an explicit
    // refusal the card can show, rather than a silent attempt that may or may not
    // write. Top-level (depth 0) is a direct press on the control, which is the
    // case the ADR authorises.
    if (depth > 0) {
      run.diagnostics.push({
        severity: 'refused',
        code: 'action.clipboard-not-composed',
        message: '@CopyToClipboard runs on its own, not inside Action([...]); a composed run has no proven user activation',
      })
      return
    }
    const payload = run.clipboardText(descriptor.args[0])
    if (payload === undefined) {
      run.diagnostics.push({
        severity: 'refused',
        code: 'action.clipboard-empty',
        message: '@CopyToClipboard needs text to copy',
      })
      return
    }
    run.clipboard = payload
    return
  }

  if (name === 'Reset') {
    // Upstream's executor calls `store.reset()` with no argument: every declared
    // variable returns to its default, and `@Reset($a, $b)`'s bindings are not
    // consulted. Reproducing that here keeps the two builds agreeing; selecting
    // variables by argument is a semantic change that needs its own decision.
    if (descriptor.args.length > 0) {
      run.diagnostics.push({
        severity: 'noted',
        code: 'action.reset-ignores-args',
        message: '@Reset resets every variable; its arguments are not used (matches upstream)',
      })
    }
    for (const [variable, value] of Object.entries(run.defaults)) run.patch[variable] = value
    return
  }

  // Set
  const target = bindingName(descriptor.args[0])
  if (target === undefined) {
    run.diagnostics.push({
      severity: 'refused',
      code: 'action.bad-binding',
      message: '@Set expects a $variable as its first argument',
    })
    return
  }
  if (!Object.prototype.hasOwnProperty.call(run.defaults, target)) {
    run.diagnostics.push({
      severity: 'refused',
      code: 'action.unknown-variable',
      message: `@Set names "$${target}", which this program does not declare`,
    })
    return
  }
  run.patch[target] = descriptor.args[1] ?? null
}

/**
 * Dispatch a Button's action against the card's current state.
 *
 * Pure: it decides what the state should become and never writes. The card
 * applies the patch through the same channel a Slider uses, so one persistence
 * path and one set of validation rules cover both controls.
 *
 * @param action - the evaluated action descriptor, or a bare array of steps.
 * @param defaults - every `$variable` the program declares, with its default.
 * @returns the variables to write, and what was refused or noted.
 */
export function applyAction(
  action: unknown,
  defaults: Readonly<Record<string, EvaluationValue>>,
): ActionOutcome {
  const run: Run = { defaults, patch: {}, diagnostics: [], clipboardText: clipboardPayload }
  if (action === undefined || action === null) {
    return { patch: {}, diagnostics: [] }
  }
  apply(action, run, 0)
  return run.clipboard === undefined
    ? { patch: run.patch, diagnostics: run.diagnostics }
    : { patch: run.patch, diagnostics: run.diagnostics, clipboard: run.clipboard }
}
