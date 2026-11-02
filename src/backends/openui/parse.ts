/**
 * Recursive-descent parser for openui-lang.
 *
 * Ported from dsh-intelligent-ui (`src/lang/parse.js`, MIT, see NOTICE). One
 * statement per line: `name = expression` or `$name = expression`. References
 * resolve by name at evaluation time, so a statement may be used before it is
 * defined; this module only builds the AST.
 *
 * The parser never throws: every problem becomes an error diagnostic and, where
 * useful, an `error` recovery node that evaluates to null. It is pure and
 * DOM-free, so the host validates with it and the specs load it unchanged.
 *
 * @module @dsh-unified/visualize/backends/openui/parse
 */

import type { Diagnostic } from '../../core/render-contract.ts'
import { tokenize, type Token } from './tokenize.ts'

/** One expression node. */
export type Expr =
  | { readonly t: 'num', readonly v: number }
  | { readonly t: 'str', readonly v: string }
  | { readonly t: 'bool', readonly v: boolean }
  | { readonly t: 'null' }
  | { readonly t: 'arr', readonly items: readonly Expr[] }
  | { readonly t: 'obj', readonly entries: readonly { readonly key: string, readonly value: Expr }[] }
  | { readonly t: 'ref', readonly name: string, readonly state: boolean }
  | { readonly t: 'call', readonly name: string, readonly args: readonly Expr[], readonly line: number }
  | { readonly t: 'mem', readonly obj: Expr, readonly prop: string }
  | { readonly t: 'idx', readonly obj: Expr, readonly index: Expr }
  | { readonly t: 'un', readonly op: string, readonly arg: Expr }
  | { readonly t: 'bin', readonly op: string, readonly left: Expr, readonly right: Expr }
  | { readonly t: 'tern', readonly cond: Expr, readonly then: Expr, readonly else: Expr }
  | { readonly t: 'error', readonly message: string }

/** One statement: `name = expr` or `$name = expr`. */
export interface Statement {
  readonly name: string
  readonly state: boolean
  readonly expr: Expr
  readonly line: number
}

/** One call site found anywhere in the program, for name checking. */
export interface CallSite {
  readonly name: string
  readonly line: number
}

/** A parsed program. */
export interface ParsedProgram {
  readonly ok: boolean
  readonly statements: readonly Statement[]
  /** `'root'` when the program defines a non-state `root`, else undefined. */
  readonly rootName: string | undefined
  readonly diagnostics: readonly Diagnostic[]
  /** Every component and `@function` call, in source order. */
  readonly calls: readonly CallSite[]
}

/**
 * Binary operator precedence, lowest first. A level groups operators of equal
 * precedence; `?:` sits below every level, and unary and postfix are explicit.
 */
const BINARY_LEVELS: readonly (readonly string[])[] = [
  ['||'],
  ['&&'],
  ['==', '!='],
  ['<', '<=', '>', '>='],
  ['+', '-'],
  ['*', '/', '%'],
]

/** Maximum expression nesting the parser descends into; the host never wraps this in a try/catch. */
const MAX_DEPTH = 200

/** Mutable state threaded through one statement's parse. */
interface Cursor {
  readonly tokens: readonly Token[]
  index: number
  readonly diagnostics: Diagnostic[]
  readonly line: number
  depth: number
  reportedDepth: boolean
}

/**
 * Build an error recovery node.
 * @param message - why the expression is invalid.
 * @returns the recovery node.
 */
function errorNode(message: string): Expr {
  return { t: 'error', message }
}

/**
 * Current token of a cursor.
 * @param cursor - parse cursor.
 * @returns the current token, or undefined at the end of the line.
 */
function peek(cursor: Cursor): Token | undefined {
  return cursor.index < cursor.tokens.length ? cursor.tokens[cursor.index] : undefined
}

/**
 * Human-readable description of a token, for error messages.
 * @param token - token to describe.
 * @returns a description such as `"+"` or `the end of the line`.
 */
export function describeToken(token: Token | undefined): string {
  if (token === undefined || token.kind === 'eof') return 'the end of the line'
  if (token.kind === 'string') return `the string ${JSON.stringify(token.value)}`
  if (token.kind === 'number') return `the number ${token.text ?? String(token.value)}`
  if (token.kind === 'state') return `"$${String(token.value)}"`
  return JSON.stringify(token.value)
}

/**
 * Refuse to descend further, reporting the depth problem once per statement.
 * @param cursor - parse cursor.
 * @returns the recovery node.
 */
function tooDeep(cursor: Cursor): Expr {
  if (!cursor.reportedDepth) {
    cursor.reportedDepth = true
    cursor.diagnostics.push({
      severity: 'error',
      code: 'VZO110',
      message: `line ${cursor.line}: the expression is nested too deeply`,
    })
  }
  return errorNode('expression nested too deeply')
}

/**
 * Parse one openui-lang program.
 * @param source - program source.
 * @returns the parsed program with its diagnostics and call sites.
 */
export function parseProgram(source: string): ParsedProgram {
  const lexed = tokenize(source)
  const diagnostics: Diagnostic[] = [...lexed.diagnostics]
  const statements: Statement[] = []
  const calls: CallSite[] = []

  const lines: Token[][] = []
  for (const token of lexed.tokens) {
    if (token.kind === 'eof') continue
    const last = lines[lines.length - 1]
    if (last !== undefined && last[0]!.line === token.line) last.push(token)
    else lines.push([token])
  }

  for (const group of lines) parseStatement(group, statements, diagnostics, calls)

  const rootName = statements.some(statement => !statement.state && statement.name === 'root') ? 'root' : undefined
  return {
    ok: diagnostics.every(diagnostic => diagnostic.severity !== 'error'),
    statements,
    rootName,
    diagnostics,
    calls,
  }
}

/**
 * Parse one physical line into at most one statement.
 * @param group - tokens of one line.
 * @param statements - output list, appended to.
 * @param diagnostics - output diagnostics, appended to.
 * @param calls - output call sites, appended to.
 */
function parseStatement(
  group: readonly Token[],
  statements: Statement[],
  diagnostics: Diagnostic[],
  calls: CallSite[],
): void {
  const line = group[0]!.line
  const cursor: Cursor = { tokens: group, index: 0, diagnostics, line, depth: 0, reportedDepth: false }
  const first = group[0]!

  let name: string
  let state = false
  if (first.kind === 'ident') {
    name = String(first.value)
    cursor.index = 1
  } else if (first.kind === 'state') {
    name = String(first.value)
    state = true
    cursor.index = 1
  } else {
    diagnostics.push({
      severity: 'error',
      code: 'VZO111',
      message: `line ${line}: a statement must start with a name, not ${describeToken(first)}`,
    })
    return
  }

  const label = (state ? '$' : '') + name
  const equals = peek(cursor)
  if (equals === undefined || equals.kind !== 'op' || equals.value !== '=') {
    diagnostics.push({
      severity: 'error',
      code: 'VZO112',
      message: `line ${line}: expected "=" after ${label}`,
    })
    return
  }
  cursor.index += 1

  if (peek(cursor) === undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'VZO113',
      message: `line ${line}: ${label} is missing a value after "="`,
    })
    statements.push({ name, state, expr: errorNode('missing value'), line })
    return
  }

  const expr = parseExpression(cursor)
  collectCalls(expr, calls)
  const extra = peek(cursor)
  if (extra !== undefined) {
    diagnostics.push({
      severity: 'error',
      code: 'VZO114',
      message: `line ${line}: unexpected ${describeToken(extra)} after the expression of ${label}`,
    })
  }
  statements.push({ name, state, expr, line })
}

/**
 * Record every call in an expression tree, iteratively so a long flat chain
 * cannot overflow the stack.
 * @param root - the expression.
 * @param calls - output list, appended to.
 */
function collectCalls(root: Expr, calls: CallSite[]): void {
  const pending: Expr[] = [root]
  while (pending.length > 0) {
    const node = pending.pop()!
    switch (node.t) {
      case 'call':
        calls.push({ name: node.name, line: node.line })
        for (const arg of node.args) pending.push(arg)
        break
      case 'arr':
        for (const item of node.items) pending.push(item)
        break
      case 'obj':
        for (const entry of node.entries) pending.push(entry.value)
        break
      case 'mem':
        pending.push(node.obj)
        break
      case 'idx':
        pending.push(node.obj, node.index)
        break
      case 'un':
        pending.push(node.arg)
        break
      case 'bin':
        pending.push(node.left, node.right)
        break
      case 'tern':
        pending.push(node.cond, node.then, node.else)
        break
      default:
        break
    }
  }
}

/**
 * Parse a conditional expression, the lowest precedence level.
 * @param cursor - parse cursor.
 * @returns the expression node.
 */
function parseExpression(cursor: Cursor): Expr {
  cursor.depth += 1
  try {
    if (cursor.depth > MAX_DEPTH) return tooDeep(cursor)
    const cond = parseBinaryLevel(cursor, 0)
    const question = peek(cursor)
    if (question === undefined || question.kind !== 'op' || question.value !== '?') return cond

    cursor.index += 1
    const thenExpr = parseExpression(cursor)
    const colon = peek(cursor)
    if (colon === undefined || colon.kind !== 'op' || colon.value !== ':') {
      cursor.diagnostics.push({
        severity: 'error',
        code: 'VZO115',
        message: 'expected ":" in the conditional expression',
      })
      return errorNode('incomplete conditional')
    }
    cursor.index += 1
    const elseExpr = parseExpression(cursor)
    return { t: 'tern', cond, then: thenExpr, else: elseExpr }
  } finally {
    cursor.depth -= 1
  }
}

/**
 * Parse one precedence level and fold left.
 * @param cursor - parse cursor.
 * @param level - index into {@link BINARY_LEVELS}.
 * @returns the expression node.
 */
function parseBinaryLevel(cursor: Cursor, level: number): Expr {
  if (level >= BINARY_LEVELS.length) return parseUnary(cursor)
  let left = parseBinaryLevel(cursor, level + 1)
  const operators = BINARY_LEVELS[level]!
  for (;;) {
    const next = peek(cursor)
    if (next === undefined || next.kind !== 'op' || !operators.includes(String(next.value))) return left
    cursor.index += 1
    const right = parseBinaryLevel(cursor, level + 1)
    left = { t: 'bin', op: String(next.value), left, right }
  }
}

/**
 * Parse a unary expression.
 * @param cursor - parse cursor.
 * @returns the expression node.
 */
function parseUnary(cursor: Cursor): Expr {
  cursor.depth += 1
  try {
    if (cursor.depth > MAX_DEPTH) return tooDeep(cursor)
    const next = peek(cursor)
    if (next !== undefined && next.kind === 'op' && (next.value === '!' || next.value === '-')) {
      cursor.index += 1
      return { t: 'un', op: String(next.value), arg: parseUnary(cursor) }
    }
    return parsePostfix(cursor)
  } finally {
    cursor.depth -= 1
  }
}

/**
 * Parse member and index access applied to a primary expression.
 * @param cursor - parse cursor.
 * @returns the expression node.
 */
function parsePostfix(cursor: Cursor): Expr {
  let node = parsePrimary(cursor)
  for (;;) {
    const next = peek(cursor)
    if (next === undefined || next.kind !== 'op') return node

    if (next.value === '.') {
      cursor.index += 1
      const prop = peek(cursor)
      if (prop === undefined || prop.kind !== 'ident') {
        cursor.diagnostics.push({
          severity: 'error',
          code: 'VZO116',
          message: `line ${next.line}: expected a property name after "."`,
        })
        return errorNode('missing property name')
      }
      cursor.index += 1
      node = { t: 'mem', obj: node, prop: String(prop.value) }
      continue
    }

    if (next.value === '[') {
      cursor.index += 1
      const indexExpr = parseExpression(cursor)
      const close = peek(cursor)
      if (close !== undefined && close.kind === 'op' && close.value === ']') cursor.index += 1
      else {
        cursor.diagnostics.push({
          severity: 'error',
          code: 'VZO117',
          message: `line ${next.line}: expected "]" to close the index`,
        })
      }
      node = { t: 'idx', obj: node, index: indexExpr }
      continue
    }

    return node
  }
}

/**
 * Parse a literal, reference, call, array, object or parenthesised expression.
 * @param cursor - parse cursor.
 * @returns the expression node.
 */
function parsePrimary(cursor: Cursor): Expr {
  const token = peek(cursor)
  if (token === undefined) {
    cursor.diagnostics.push({
      severity: 'error',
      code: 'VZO118',
      message: `line ${cursor.line}: expected an expression`,
    })
    return errorNode('missing expression')
  }

  if (token.kind === 'number') {
    cursor.index += 1
    return { t: 'num', v: Number(token.value) }
  }
  if (token.kind === 'string') {
    cursor.index += 1
    return { t: 'str', v: String(token.value) }
  }
  if (token.kind === 'state') {
    cursor.index += 1
    return { t: 'ref', name: String(token.value), state: true }
  }
  if (token.kind === 'ident') {
    cursor.index += 1
    if (token.value === 'true') return { t: 'bool', v: true }
    if (token.value === 'false') return { t: 'bool', v: false }
    if (token.value === 'null') return { t: 'null' }
    const next = peek(cursor)
    if (next !== undefined && next.kind === 'op' && next.value === '(') {
      return { t: 'call', name: String(token.value), args: parseArgList(cursor), line: token.line }
    }
    return { t: 'ref', name: String(token.value), state: false }
  }

  if (token.kind === 'op') {
    if (token.value === '@') return parseAtCall(cursor, token)
    if (token.value === '(') {
      cursor.index += 1
      const inner = parseExpression(cursor)
      const close = peek(cursor)
      if (close !== undefined && close.kind === 'op' && close.value === ')') cursor.index += 1
      else {
        cursor.diagnostics.push({
          severity: 'error',
          code: 'VZO119',
          message: `line ${token.line}: expected ")"`,
        })
      }
      return inner
    }
    if (token.value === '[') return parseArrayLiteral(cursor, token)
    if (token.value === '{') return parseObjectLiteral(cursor, token)
  }

  cursor.diagnostics.push({
    severity: 'error',
    code: 'VZO120',
    message: `line ${token.line}: unexpected ${describeToken(token)}`,
  })
  cursor.index += 1
  return errorNode(`unexpected ${describeToken(token)}`)
}

/**
 * Parse `@Name(args)`; the `@` token is the current token.
 * @param cursor - parse cursor.
 * @param atToken - the `@` token, for its line.
 * @returns the call node, or a recovery node.
 */
function parseAtCall(cursor: Cursor, atToken: Token): Expr {
  cursor.index += 1
  const nameToken = peek(cursor)
  if (nameToken === undefined || nameToken.kind !== 'ident') {
    cursor.diagnostics.push({
      severity: 'error',
      code: 'VZO121',
      message: `line ${atToken.line}: expected a function name after "@"`,
    })
    return errorNode('missing function name')
  }
  cursor.index += 1
  const open = peek(cursor)
  if (open === undefined || open.kind !== 'op' || open.value !== '(') {
    cursor.diagnostics.push({
      severity: 'error',
      code: 'VZO122',
      message: `line ${atToken.line}: expected "(" after "@${String(nameToken.value)}"`,
    })
    return errorNode('missing argument list')
  }
  return { t: 'call', name: `@${String(nameToken.value)}`, args: parseArgList(cursor), line: atToken.line }
}

/**
 * Parse a parenthesised, comma-separated argument list. Named arguments are
 * rejected: the language is fully positional.
 * @param cursor - parse cursor.
 * @returns the argument nodes.
 */
function parseArgList(cursor: Cursor): Expr[] {
  cursor.index += 1
  const args: Expr[] = []
  for (;;) {
    const next = peek(cursor)
    if (next === undefined) {
      cursor.diagnostics.push({
        severity: 'error',
        code: 'VZO123',
        message: `line ${cursor.line}: expected ")" to close the argument list`,
      })
      return args
    }
    if (next.kind === 'op' && next.value === ')') {
      cursor.index += 1
      return args
    }
    if (next.kind === 'op' && next.value === ',') {
      cursor.index += 1
      continue
    }

    const start = cursor.index
    const expr = parseExpression(cursor)

    const after = peek(cursor)
    if (after !== undefined && after.kind === 'op' && after.value === ':') {
      cursor.diagnostics.push({
        severity: 'error',
        code: 'VZO124',
        message: `line ${after.line}: named arguments (name: value) are not supported: every argument is positional`,
      })
      while (cursor.index < cursor.tokens.length) {
        const stop = cursor.tokens[cursor.index]!
        if (stop.kind === 'op' && (stop.value === ',' || stop.value === ')')) break
        cursor.index += 1
      }
      args.push(errorNode('named argument'))
      continue
    }

    if (cursor.index === start) cursor.index += 1
    args.push(expr)
  }
}

/**
 * Parse `[item, item, ...]`; the `[` token is the current token.
 * @param cursor - parse cursor.
 * @param openToken - the `[` token, for its line.
 * @returns the array node.
 */
function parseArrayLiteral(cursor: Cursor, openToken: Token): Expr {
  cursor.index += 1
  const items: Expr[] = []
  for (;;) {
    const next = peek(cursor)
    if (next === undefined) {
      cursor.diagnostics.push({
        severity: 'error',
        code: 'VZO125',
        message: `line ${openToken.line}: expected "]" to close the array — a statement must stay on one physical line`,
      })
      return { t: 'arr', items }
    }
    if (next.kind === 'op' && next.value === ']') {
      cursor.index += 1
      return { t: 'arr', items }
    }
    if (next.kind === 'op' && next.value === ',') {
      cursor.index += 1
      continue
    }
    const start = cursor.index
    items.push(parseExpression(cursor))
    if (cursor.index === start) cursor.index += 1
  }
}

/**
 * Parse `{key: value, ...}`; keys may be bare ASCII identifiers, quoted strings or numbers.
 * @param cursor - parse cursor.
 * @param openToken - the `{` token, for its line.
 * @returns the object node.
 */
function parseObjectLiteral(cursor: Cursor, openToken: Token): Expr {
  cursor.index += 1
  const entries: { key: string, value: Expr }[] = []
  for (;;) {
    const next = peek(cursor)
    if (next === undefined) {
      cursor.diagnostics.push({
        severity: 'error',
        code: 'VZO126',
        message: `line ${openToken.line}: expected "}" to close the object`,
      })
      return { t: 'obj', entries }
    }
    if (next.kind === 'op' && next.value === '}') {
      cursor.index += 1
      return { t: 'obj', entries }
    }
    if (next.kind === 'op' && next.value === ',') {
      cursor.index += 1
      continue
    }

    let key: string | null = null
    if (next.kind === 'ident' || next.kind === 'string' || next.kind === 'number') key = String(next.value)
    if (key === null) {
      cursor.diagnostics.push({
        severity: 'error',
        code: 'VZO127',
        message: `line ${next.line}: expected a key, not ${describeToken(next)}`,
      })
      cursor.index += 1
      continue
    }
    cursor.index += 1

    const colon = peek(cursor)
    if (colon === undefined || colon.kind !== 'op' || colon.value !== ':') {
      cursor.diagnostics.push({
        severity: 'error',
        code: 'VZO128',
        message: `line ${next.line}: expected ":" after the key ${JSON.stringify(key)}`,
      })
      entries.push({ key, value: errorNode('missing value') })
      continue
    }
    cursor.index += 1
    entries.push({ key, value: parseExpression(cursor) })
  }
}
