/**
 * Evaluator for the openui-lang AST.
 *
 * Ported from dsh-intelligent-ui (`src/lang/evaluate.js`, MIT, see NOTICE).
 * Evaluation is pure and lazy: statements are resolved by name on demand, so a
 * reference may be used before its statement appears; every value is memoized
 * once; a cycle is reported as a diagnostic instead of recursing. Values are
 * JSON-ish, except for the two descriptors the renderer understands:
 *
 * - {@link ElementDescriptor}: `{ kind: 'element', name, args, line }` for component
 *   calls and `@`-action calls in value position.
 * - {@link BindingDescriptor}: `{ kind: 'binding', name, value }` for a `$variable`
 *   used as a direct argument of a component or of an action's variable slot.
 *
 * Evaluation never throws: a program that cannot be used becomes a diagnostic.
 *
 * @module @dsh-unified/visualize/backends/openui/evaluate
 */

import {
  FUNCTIONS, callFunction, fxDeepEqual, fxIsPlainObject, fxText, fxToNumber, fxTruthy,
} from './functions.ts'
import type { Expr, ParsedProgram } from './parse.ts'

/** A plain data object produced by an object literal, or by a built-in. */
export interface EvaluationObject {
  readonly [key: string]: EvaluationValue
}

/** One value the evaluator can produce. */
export type EvaluationValue =
  | null
  | undefined
  | boolean
  | number
  | string
  | readonly EvaluationValue[]
  | EvaluationObject
  | ElementDescriptor
  | BindingDescriptor

/** A component call, or an `@`-action call, in value position. */
export interface ElementDescriptor {
  readonly kind: 'element'
  readonly name: string
  readonly args: readonly EvaluationValue[]
  readonly line: number
}

/** A `$variable` used where the renderer must keep the name, not only the value. */
export interface BindingDescriptor {
  readonly kind: 'binding'
  readonly name: string
  readonly value: EvaluationValue
}

/**
 * One finding the evaluator reports.
 *
 * `warn` is this repo's wire word for the upstream `warning`: a built-in may
 * still ask for one through `callFunction`, so both spellings are accepted on
 * the way in and normalised to `warn`.
 */
export interface EvaluationDiagnostic {
  readonly severity: 'error' | 'warn'
  readonly message: string
  readonly line?: number
}

/** What {@link evaluateProgram} returns. */
export interface EvaluationResult {
  /** False when any error diagnostic survived deduplication. */
  readonly ok: boolean
  /** Value of the non-state statement named `root`, or null. */
  readonly root: EvaluationValue
  /** Findings, deduplicated by `severity|line|message`. */
  readonly diagnostics: readonly EvaluationDiagnostic[]
  /** Evaluated default of every `$name = ...`, independent of `options.state`. */
  readonly stateDefaults: Readonly<Record<string, EvaluationValue>>
}

/** Current values of the caller's `$variables`. */
export interface EvaluateOptions {
  readonly state?: Readonly<Record<string, unknown>>
}

/** Calls that describe an action rather than a value. */
const ACTION_NAMES: ReadonlySet<string> = new Set([
  'Set', 'Reset', 'OpenUrl', 'CopyToClipboard', 'ToAssistant', 'Action',
])

/**
 * Which argument positions of an action call keep a `$variable` as a binding
 * descriptor. `'all'` keeps every argument (used by `@Reset($a, $b)`); the
 * default is none, so a plain value such as `@Set($final, $choice)` stores the
 * value, not a descriptor.
 */
const ACTION_BINDING_ARGS: Readonly<Record<string, readonly number[] | 'all'>> = {
  Set: [0],
  Reset: 'all',
}

/** Maximum expression nesting depth before evaluation gives up. */
const MAX_DEPTH = 250

/** Fallback environment used when a node is evaluated without one. */
const EMPTY_ENV: EvalEnvironment = { loops: null, line: 0, defaultsMode: false }

/**
 * Where a node is being evaluated.
 *
 * `loops` holds the `@Each` variables in scope, `line` is what a diagnostic
 * points at, and `defaultsMode` makes every `$variable` resolve to its own
 * default rather than to the caller's state.
 */
interface EvalEnvironment {
  readonly loops: ReadonlyMap<string, EvaluationValue> | null
  readonly line: number
  readonly defaultsMode: boolean
}

/** One statement as the evaluator sees it, with a junk-tolerant reader on top. */
interface EvaluableStatement {
  readonly name: string
  readonly state: boolean
  readonly expr: Expr | undefined
  readonly line: number
}

/** The mutable state of one {@link evaluateProgram} call. */
interface Run {
  readonly statementByKey: ReadonlyMap<string, EvaluableStatement>
  readonly values: Map<string, EvaluationValue>
  readonly defaults: Map<string, EvaluationValue>
  /** Plain statement values computed in defaults-only mode, kept apart from {@link values}. */
  readonly defaultValues: Map<string, EvaluationValue>
  readonly visiting: Set<string>
  readonly diagnostics: EvaluationDiagnostic[]
  readonly userState: Readonly<Record<string, unknown>> | null
  depthReported: boolean
}

/**
 * Read the statements of a parsed program, skipping anything unusable.
 * @param program - result of `parseProgram`, or junk from an untyped caller.
 * @returns the statements the evaluator can resolve, in source order.
 */
function readStatements(program: ParsedProgram | null | undefined): EvaluableStatement[] {
  const statements: EvaluableStatement[] = []
  if (program === null || program === undefined) return statements
  const raw: unknown = (program as { readonly statements?: unknown }).statements
  if (!Array.isArray(raw)) return statements
  for (const entry of raw as readonly unknown[]) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as {
      readonly name?: unknown
      readonly state?: unknown
      readonly expr?: unknown
      readonly line?: unknown
    }
    if (typeof record.name !== 'string') continue
    statements.push({
      name: record.name,
      state: record.state === true,
      expr: record.expr as Expr | undefined,
      line: typeof record.line === 'number' ? record.line : 0,
    })
  }
  return statements
}

/**
 * Carry the parser's error diagnostics into an evaluation, in source order.
 * @param program - result of `parseProgram`.
 * @param out - the diagnostic list to append to.
 */
function readDiagnostics(
  program: ParsedProgram | null | undefined,
  out: EvaluationDiagnostic[],
): void {
  if (program === null || program === undefined) return
  const raw: unknown = (program as { readonly diagnostics?: unknown }).diagnostics
  if (!Array.isArray(raw)) return
  for (const entry of raw as readonly unknown[]) {
    if (entry === null || typeof entry !== 'object') continue
    const record = entry as {
      readonly severity?: unknown
      readonly message?: unknown
      readonly line?: unknown
    }
    if (record.severity !== 'error') continue
    out.push({
      severity: 'error',
      message: String(record.message ?? ''),
      ...typeof record.line === 'number' ? { line: record.line } : {},
    })
  }
}

/**
 * Append one diagnostic.
 * @param run - the current evaluation.
 * @param message - human-readable message.
 * @param line - source line; anything that is not a number becomes 0.
 * @param severity - severity, default `error`; upstream's `warning` is accepted
 *   as `warn` because the built-ins still speak it.
 */
function report(run: Run, message: string, line?: number, severity?: string): void {
  const level: 'error' | 'warn' = severity === 'warning' || severity === 'warn' ? 'warn' : 'error'
  run.diagnostics.push({ severity: level, message, line: typeof line === 'number' ? line : 0 })
}

/**
 * Evaluation environment of a statement: program scope, so a statement never
 * sees an `@Each` loop variable (the loop variable only exists inside the
 * template).
 * @param line - the statement's line.
 * @param defaultsMode - resolve `$variables` to their defaults, never to `options.state`.
 * @returns the environment.
 */
function programEnv(line: number, defaultsMode: boolean): EvalEnvironment {
  return { loops: null, line: typeof line === 'number' ? line : 0, defaultsMode: defaultsMode === true }
}

/**
 * Value of a plain (non-`$`) statement, memoized per mode: the defaults pass
 * keeps its own cache so a default never inherits a value computed from
 * `options.state`.
 * @param run - the current evaluation.
 * @param name - statement name.
 * @param defaultsMode - whether this is the defaults-only pass.
 * @returns the value, or null when unknown or part of a cycle.
 */
function loadValue(run: Run, name: string, defaultsMode: boolean): EvaluationValue {
  const cache = defaultsMode ? run.defaultValues : run.values
  if (cache.has(name)) return cache.get(name) ?? null
  const statement = run.statementByKey.get(name)
  if (statement === undefined) return null
  const visitKey = defaultsMode ? `defaults:${name}` : name
  if (run.visiting.has(visitKey)) {
    report(run, `circular reference: "${name}" eventually refers to itself`, statement.line)
    return null
  }
  run.visiting.add(visitKey)
  let value: EvaluationValue = null
  try {
    value = evaluate(run, statement.expr, programEnv(statement.line, defaultsMode), false, 0)
  } finally {
    run.visiting.delete(visitKey)
  }
  cache.set(name, value)
  return value
}

/**
 * Evaluated default of a `$name = ...` statement, memoized and independent of
 * `options.state`: every `$variable` read while a default is computed resolves
 * to that variable's own default, so a derived default is stable across
 * sessions.
 * @param run - the current evaluation.
 * @param name - state variable name, without the `$`.
 * @returns the default value, or null when undeclared.
 */
function stateDefault(run: Run, name: string): EvaluationValue {
  if (run.defaults.has(name)) return run.defaults.get(name) ?? null
  const key = `$${name}`
  const statement = run.statementByKey.get(key)
  if (statement === undefined) return null
  if (run.visiting.has(key)) {
    report(run, `circular reference: "${key}" eventually refers to itself`, statement.line)
    return null
  }
  run.visiting.add(key)
  let value: EvaluationValue = null
  try {
    value = evaluate(run, statement.expr, programEnv(statement.line, true), false, 0)
  } finally {
    run.visiting.delete(key)
  }
  run.defaults.set(name, value)
  return value
}

/**
 * Read a reference: a loop variable, a `$state` value, or a statement value.
 * @param run - the current evaluation.
 * @param name - referenced name.
 * @param isState - whether the reference was written `$name`.
 * @param env - current environment.
 * @returns the value.
 */
function readReference(
  run: Run,
  name: string,
  isState: boolean,
  env: EvalEnvironment | null,
): EvaluationValue {
  const defaultsMode = env === null ? false : env.defaultsMode === true
  if (!isState && env !== null && env.loops !== null && env.loops.has(name)) {
    return env.loops.get(name) ?? null
  }
  if (isState) {
    if (!defaultsMode && run.userState !== null
      && Object.prototype.hasOwnProperty.call(run.userState, name)) {
      return run.userState[name] as EvaluationValue
    }
    if (run.statementByKey.has(`$${name}`)) return stateDefault(run, name)
    return null
  }
  if (!run.statementByKey.has(name)) {
    report(run, `unknown reference "${name}": no statement defines it`, env === null ? 0 : env.line)
    return null
  }
  return loadValue(run, name, defaultsMode)
}

/**
 * Read a value as a plain data object, for own-property member and index reads.
 * @param value - any value.
 * @returns the same value, typed for own-property reads.
 */
function asRecord(value: unknown): Readonly<Record<string, EvaluationValue>> {
  return value as Readonly<Record<string, EvaluationValue>>
}

/**
 * Read a property, with array pluck (`rows.amount`).
 * @param run - the current evaluation.
 * @param target - receiver value.
 * @param prop - property name.
 * @param env - current environment, for diagnostics.
 * @returns the member value.
 */
function evalMember(
  run: Run,
  target: EvaluationValue,
  prop: string,
  env: EvalEnvironment,
): EvaluationValue {
  if (target === null || target === undefined) return null
  if (Array.isArray(target)) {
    if (prop === 'length') return target.length
    return target.map((item) => {
      if (item === null || item === undefined) return null
      if (fxIsPlainObject(item)) {
        const record = asRecord(item)
        return Object.prototype.hasOwnProperty.call(record, prop) ? record[prop] ?? null : null
      }
      return null
    })
  }
  if (typeof target === 'string') return prop === 'length' ? target.length : null
  if (fxIsPlainObject(target)) {
    const record = asRecord(target)
    return Object.prototype.hasOwnProperty.call(record, prop) ? record[prop] ?? null : null
  }
  report(run, `cannot read ".${prop}" of a ${typeof target}`, env.line)
  return null
}

/**
 * Read an index, tolerating negative indexes.
 * @param run - the current evaluation.
 * @param target - receiver value.
 * @param index - index value.
 * @param env - current environment, for diagnostics.
 * @returns the indexed value.
 */
function evalIndex(
  run: Run,
  target: EvaluationValue,
  index: EvaluationValue,
  env: EvalEnvironment,
): EvaluationValue {
  if (target === null || target === undefined) return null
  let numeric: number | null = null
  if (typeof index === 'number' && Number.isFinite(index)) numeric = Math.trunc(index)
  else if (typeof index === 'string' && index.trim() !== '' && !Number.isNaN(Number(index))) {
    numeric = Math.trunc(Number(index))
  }
  if (Array.isArray(target)) {
    if (numeric === null) {
      report(run, 'an array index must be a number', env.line)
      return null
    }
    const at = numeric < 0 ? target.length + numeric : numeric
    return at >= 0 && at < target.length ? target[at] ?? null : null
  }
  if (typeof target === 'string') {
    if (numeric === null) {
      report(run, 'a text index must be a number', env.line)
      return null
    }
    const at = numeric < 0 ? target.length + numeric : numeric
    return at >= 0 && at < target.length ? target.charAt(at) : null
  }
  if (fxIsPlainObject(target)) {
    const record = asRecord(target)
    const key = fxText(index)
    return Object.prototype.hasOwnProperty.call(record, key) ? record[key] ?? null : null
  }
  report(run, 'only arrays, strings and objects can be indexed', env.line)
  return null
}

/**
 * Evaluate a prefix `!` or `-`.
 * @param run - the current evaluation.
 * @param node - unary node.
 * @param env - environment.
 * @param depth - nesting depth.
 * @returns the value.
 */
function evalUnary(
  run: Run,
  node: { readonly op: string, readonly arg: Expr },
  env: EvalEnvironment | null,
  depth: number,
): EvaluationValue {
  const value = evaluate(run, node.arg, env, false, depth + 1)
  if (node.op === '!') return !fxTruthy(value)
  if (node.op === '-') {
    const number = fxToNumber(value)
    if (Number.isNaN(number)) {
      report(run, '"-" needs a number', env === null ? 0 : env.line)
      return null
    }
    return -number
  }
  return null
}

/**
 * Apply a numeric binary operator.
 * @param run - the current evaluation.
 * @param left - left value.
 * @param right - right value.
 * @param op - operator.
 * @param env - environment.
 * @returns the value.
 */
function evalArithmetic(
  run: Run,
  left: EvaluationValue,
  right: EvaluationValue,
  op: string,
  env: EvalEnvironment | null,
): EvaluationValue {
  const first = fxToNumber(left)
  const second = fxToNumber(right)
  if (Number.isNaN(first) || Number.isNaN(second)) {
    report(run, `"${op}" needs numbers`, env === null ? 0 : env.line)
    return null
  }
  if (op === '+') return first + second
  if (op === '-') return first - second
  if (op === '*') return first * second
  if (op === '/' || op === '%') {
    if (second === 0) {
      report(run, `division by zero in "${op}"`, env === null ? 0 : env.line)
      return null
    }
    return op === '/' ? first / second : first % second
  }
  return null
}

/**
 * Apply a relational operator.
 * @param run - the current evaluation.
 * @param left - left value.
 * @param right - right value.
 * @param op - operator.
 * @param env - environment.
 * @returns the boolean result, or null when the operands are not comparable.
 */
function evalComparison(
  run: Run,
  left: EvaluationValue,
  right: EvaluationValue,
  op: string,
  env: EvalEnvironment | null,
): EvaluationValue {
  if (typeof left === 'string' && typeof right === 'string') {
    if (op === '<') return left < right
    if (op === '<=') return left <= right
    if (op === '>') return left > right
    return left >= right
  }
  const first = fxToNumber(left)
  const second = fxToNumber(right)
  if (Number.isNaN(first) || Number.isNaN(second)) {
    report(run, `"${op}" needs numbers`, env === null ? 0 : env.line)
    return null
  }
  if (op === '<') return first < second
  if (op === '<=') return first <= second
  if (op === '>') return first > second
  return first >= second
}

/**
 * Apply one binary operator whose left operand is already evaluated.
 * @param run - the current evaluation.
 * @param op - operator.
 * @param left - evaluated left value.
 * @param rightNode - right operand node, evaluated lazily.
 * @param env - environment.
 * @param depth - nesting depth.
 * @returns the value.
 */
function applyBinary(
  run: Run,
  op: string,
  left: EvaluationValue,
  rightNode: Expr | undefined,
  env: EvalEnvironment | null,
  depth: number,
): EvaluationValue {
  if (op === '&&') {
    return fxTruthy(left) ? fxTruthy(evaluate(run, rightNode, env, false, depth + 1)) : false
  }
  if (op === '||') {
    return fxTruthy(left) ? true : fxTruthy(evaluate(run, rightNode, env, false, depth + 1))
  }
  const right = evaluate(run, rightNode, env, false, depth + 1)
  if (op === '==') return fxDeepEqual(left, right)
  if (op === '!=') return !fxDeepEqual(left, right)
  if (op === '+') {
    if (typeof left === 'string' || typeof right === 'string') return fxText(left) + fxText(right)
    return evalArithmetic(run, left, right, '+', env)
  }
  if (op === '-' || op === '*' || op === '/' || op === '%') {
    return evalArithmetic(run, left, right, op, env)
  }
  if (op === '<' || op === '<=' || op === '>' || op === '>=') {
    return evalComparison(run, left, right, op, env)
  }
  return null
}

/** One step of a binary expression's left spine. */
interface BinaryStep {
  readonly op: string
  readonly right: Expr | undefined
}

/**
 * Evaluate a binary expression by walking its left spine iteratively, so a long
 * flat chain such as `1 + 2 + 3 + ...` never grows the JavaScript stack.
 * @param run - the current evaluation.
 * @param node - binary node.
 * @param env - environment.
 * @param depth - nesting depth.
 * @returns the value.
 */
function evalBinary(
  run: Run,
  node: { readonly t: 'bin', readonly op: string, readonly left: Expr, readonly right: Expr },
  env: EvalEnvironment | null,
  depth: number,
): EvaluationValue {
  const spine: BinaryStep[] = []
  let current: Expr | undefined = node
  while (current !== undefined && current.t === 'bin') {
    spine.push({ op: current.op, right: current.right })
    current = current.left
  }
  let value = evaluate(run, current, env, false, depth + 1)
  for (let index = spine.length - 1; index >= 0; index -= 1) {
    const step = spine[index]
    if (step === undefined) continue
    value = applyBinary(run, step.op, value, step.right, env, depth)
  }
  return value
}

/**
 * Evaluate `@Each(list, "name", template)`.
 * @param run - the current evaluation.
 * @param node - call node.
 * @param env - environment.
 * @param depth - nesting depth.
 * @param line - diagnostic line.
 * @returns the concatenated results.
 */
function evalEach(
  run: Run,
  node: { readonly args: readonly Expr[] },
  env: EvalEnvironment | null,
  depth: number,
  line: number,
): EvaluationValue {
  const args = node.args
  if (args.length < 3) {
    report(run, '@Each needs a list, a loop variable name and a template', line)
    return null
  }
  const list = evaluate(run, args[0], env, false, depth + 1)
  if (list !== null && list !== undefined && !Array.isArray(list)) {
    report(run, '@Each expects an array as its first argument', line)
    return null
  }
  const variable = evaluate(run, args[1], env, false, depth + 1)
  if (typeof variable !== 'string' || variable === '') {
    report(run, '@Each needs the loop variable name as a string, like @Each(rows, "row", ...)', line)
    return null
  }
  const items: readonly EvaluationValue[] = Array.isArray(list) ? list : []
  const out: EvaluationValue[] = []
  for (const item of items) {
    if (item === null || item === undefined) continue
    const parentLoops = env === null ? null : env.loops
    const loops = new Map<string, EvaluationValue>(parentLoops ?? [])
    loops.set(variable, item)
    const templateEnv: EvalEnvironment = {
      loops,
      line: env === null ? line : env.line,
      defaultsMode: env === null ? false : env.defaultsMode === true,
    }
    const value = evaluate(run, args[2], templateEnv, false, depth + 1)
    if (Array.isArray(value)) {
      for (const entry of value) out.push(entry)
    } else {
      out.push(value)
    }
  }
  return out
}

/**
 * Evaluate a call: `@Each`, an action step, a built-in `@function`, or a
 * component.
 * @param run - the current evaluation.
 * @param node - call node.
 * @param env - environment.
 * @param depth - nesting depth.
 * @returns the value.
 */
function evalCall(
  run: Run,
  node: { readonly name: string, readonly args: readonly Expr[], readonly line: number },
  env: EvalEnvironment | null,
  depth: number,
): EvaluationValue {
  const line = typeof node.line === 'number' ? node.line : env === null ? 0 : env.line
  const name = typeof node.name === 'string' ? node.name : ''
  if (name === '@Each') return evalEach(run, node, env, depth, line)
  const args = node.args

  if (name.charAt(0) !== '@') {
    // A component call keeps `$variable` arguments as binding descriptors.
    return {
      kind: 'element',
      name,
      args: args.map(arg => evaluate(run, arg, env, true, depth + 1)),
      line,
    }
  }

  const bare = name.slice(1)
  if (ACTION_NAMES.has(bare)) {
    const keep: readonly number[] | 'all' =
      Object.prototype.hasOwnProperty.call(ACTION_BINDING_ARGS, bare)
        ? ACTION_BINDING_ARGS[bare] ?? []
        : []
    return {
      kind: 'element',
      name,
      args: args.map((arg, index) => evaluate(
        run,
        arg,
        env,
        keep === 'all' || (Array.isArray(keep) && keep.includes(index)),
        depth + 1,
      )),
      line,
    }
  }

  if (typeof FUNCTIONS[bare] !== 'function') return null
  return callFunction(
    bare,
    args.map(arg => evaluate(run, arg, env, false, depth + 1)),
    (message: string, severity?: string) => {
      report(run, message, line, severity)
    },
  ) as EvaluationValue
}

/**
 * Evaluate one expression node.
 * @param run - the current evaluation.
 * @param node - AST node; null and undefined evaluate to null.
 * @param env - environment.
 * @param keepBinding - whether a `$variable` stays a binding descriptor.
 * @param depth - nesting depth.
 * @returns the value.
 */
function evaluate(
  run: Run,
  node: Expr | null | undefined,
  env: EvalEnvironment | null,
  keepBinding: boolean,
  depth: number,
): EvaluationValue {
  if (node === null || node === undefined || typeof node !== 'object') return null
  if (depth > MAX_DEPTH) {
    if (!run.depthReported) {
      run.depthReported = true
      report(run, 'the expression is nested too deeply to evaluate', env === null ? 0 : env.line)
    }
    return null
  }
  switch (node.t) {
    case 'str':
      return typeof node.v === 'string' ? node.v : ''
    case 'num':
      return typeof node.v === 'number' ? node.v : 0
    case 'bool':
      return node.v === true
    case 'null':
      return null
    case 'arr':
      return node.items.map(item => evaluate(run, item, env, false, depth + 1))
    case 'obj': {
      const out: Record<string, EvaluationValue> = {}
      for (const entry of node.entries) {
        if (entry === null || entry === undefined || typeof entry.key !== 'string') continue
        out[entry.key] = evaluate(run, entry.value, env, false, depth + 1)
      }
      return out
    }
    case 'ref': {
      const value = readReference(run, node.name, node.state === true, env)
      if (node.state === true && keepBinding) return { kind: 'binding', name: node.name, value }
      return value
    }
    case 'mem':
      return evalMember(
        run,
        evaluate(run, node.obj, env, false, depth + 1),
        node.prop,
        env ?? EMPTY_ENV,
      )
    case 'idx':
      return evalIndex(
        run,
        evaluate(run, node.obj, env, false, depth + 1),
        evaluate(run, node.index, env, false, depth + 1),
        env ?? EMPTY_ENV,
      )
    case 'un':
      return evalUnary(run, node, env, depth)
    case 'bin':
      return evalBinary(run, node, env, depth)
    case 'tern':
      return fxTruthy(evaluate(run, node.cond, env, false, depth + 1))
        ? evaluate(run, node.then, env, false, depth + 1)
        : evaluate(run, node.else, env, false, depth + 1)
    case 'call':
      return evalCall(run, node, env, depth)
    case 'error':
      return null
    default:
      return null
  }
}

/**
 * Evaluate a parsed program.
 * @param program - result of `parseProgram`.
 * @param options - current values of `$variables`.
 * @returns the root value, the evaluated state defaults and every diagnostic.
 */
export function evaluateProgram(
  program: ParsedProgram | null | undefined,
  options?: EvaluateOptions,
): EvaluationResult {
  const diagnostics: EvaluationDiagnostic[] = []
  readDiagnostics(program, diagnostics)

  const statements = readStatements(program)
  const statementByKey = new Map<string, EvaluableStatement>()
  for (const statement of statements) {
    statementByKey.set(statement.state ? `$${statement.name}` : statement.name, statement)
  }

  const requested: unknown = options === undefined ? undefined : options.state
  const userState = typeof requested === 'object' && requested !== null
    ? requested as Readonly<Record<string, unknown>>
    : null

  const run: Run = {
    statementByKey,
    values: new Map(),
    defaults: new Map(),
    defaultValues: new Map(),
    visiting: new Set(),
    diagnostics,
    userState,
    depthReported: false,
  }

  const root = statementByKey.has('root') ? loadValue(run, 'root', false) : null

  const stateDefaults: Record<string, EvaluationValue> = {}
  for (const statement of statements) {
    if (!statement.state) continue
    if (!Object.prototype.hasOwnProperty.call(stateDefaults, statement.name)) {
      stateDefaults[statement.name] = stateDefault(run, statement.name)
    }
  }
  for (const statement of statements) {
    if (statement.state) continue
    loadValue(run, statement.name, false)
  }

  const seen = new Set<string>()
  const unique: EvaluationDiagnostic[] = []
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.severity}|${diagnostic.line ?? 0}|${diagnostic.message}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(diagnostic)
  }

  return {
    ok: unique.every(diagnostic => diagnostic.severity !== 'error'),
    root,
    diagnostics: unique,
    stateDefaults,
  }
}
