/**
 * Lexer for the openui-lang subset this build ships.
 *
 * Ported from dsh-intelligent-ui (`src/lang/tokenize.js`, MIT, see NOTICE).
 * The language is line oriented: the parser groups these tokens by source line,
 * so every statement is exactly one physical line. `//` starts a comment that
 * runs to the end of the line. The lexer never throws; anything it cannot read
 * becomes a located diagnostic and is skipped.
 *
 * @module @dsh-unified/visualize/backends/openui/tokenize
 */

import type { Diagnostic } from '../../core/render-contract.ts'

/** One lexical token. */
export interface Token {
  readonly kind: 'number' | 'string' | 'ident' | 'state' | 'op' | 'eof'
  readonly value: string | number
  /** The literal text, kept for error messages. */
  readonly text?: string
  readonly line: number
}

/** A program's tokens, ending with `eof`, plus lexical diagnostics. */
export interface TokenizeResult {
  readonly tokens: readonly Token[]
  readonly diagnostics: readonly Diagnostic[]
}

/** Backslash escapes understood inside a double-quoted string. */
const ESCAPES: Readonly<Record<string, string>> = {
  n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v',
  '0': '\0', '"': '"', "'": "'", '\\': '\\', '/': '/',
}

/** Operator candidates, longest first so `>=` wins over `>`. */
const OPERATORS: readonly string[] = [
  '==', '!=', '<=', '>=', '&&', '||',
  '+', '-', '*', '/', '%', '!', '<', '>', '=',
  '(', ')', '[', ']', '{', '}', ',', '.', '?', ':', '@',
]

/**
 * True for an ASCII digit.
 * @param ch - one character.
 * @returns whether the character is a digit.
 */
function isDigit(ch: string | undefined): boolean {
  return ch !== undefined && ch >= '0' && ch <= '9'
}

/**
 * True for the first character of an identifier.
 * @param ch - one character.
 * @returns whether the character may start an identifier.
 */
function isIdentStart(ch: string | undefined): boolean {
  return ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_')
}

/**
 * True for a character allowed inside an identifier.
 * @param ch - one character.
 * @returns whether the character may continue an identifier.
 */
function isIdentPart(ch: string | undefined): boolean {
  return isIdentStart(ch) || isDigit(ch)
}

/**
 * Read a hexadecimal unicode escape body.
 * @param text - full source.
 * @param at - index of the first hex digit.
 * @returns the decoded character and how many hex digits it consumed, or null when malformed.
 */
function unicodeEscape(text: string, at: number): { char: string, length: number } | null {
  const hex = text.slice(at, at + 4)
  if (!/^[0-9a-fA-F]{4}$/u.test(hex)) return null
  return { char: String.fromCharCode(parseInt(hex, 16)), length: 4 }
}

/**
 * Split openui-lang source into tokens and lexical diagnostics.
 * @param source - program source.
 * @returns tokens ending with an `eof` token, plus diagnostics.
 */
export function tokenize(source: string): TokenizeResult {
  const text = typeof source === 'string' ? source : ''
  const tokens: Token[] = []
  const diagnostics: Diagnostic[] = []
  let index = 0
  let line = 1

  while (index < text.length) {
    const ch = text[index]

    if (ch === '\n') {
      line += 1
      index += 1
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\u00a0') {
      index += 1
      continue
    }
    if (ch === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1
      continue
    }

    const startLine = line

    if (isDigit(ch) || (ch === '.' && isDigit(text[index + 1]))) {
      let raw = ''
      while (index < text.length && isDigit(text[index])) {
        raw += text[index]
        index += 1
      }
      if (text[index] === '.' && isDigit(text[index + 1])) {
        raw += '.'
        index += 1
        while (index < text.length && isDigit(text[index])) {
          raw += text[index]
          index += 1
        }
      }
      tokens.push({ kind: 'number', value: Number(raw), text: raw, line: startLine })
      continue
    }

    if (ch === '"') {
      let value = ''
      let closed = false
      index += 1
      while (index < text.length) {
        const current = text[index]
        if (current === '\n') break
        if (current === '"') {
          index += 1
          closed = true
          break
        }
        if (current === '\\') {
          const escape = text[index + 1]
          if (escape === undefined || escape === '\n') {
            index += 1
            break
          }
          if (escape === 'u') {
            const decoded = unicodeEscape(text, index + 2)
            if (decoded !== null) {
              value += decoded.char
              index += 2 + decoded.length
            } else {
              value += 'u'
              index += 2
            }
            continue
          }
          value += Object.hasOwn(ESCAPES, escape) ? ESCAPES[escape]! : escape
          index += 2
          continue
        }
        value += current
        index += 1
      }
      if (!closed) {
        diagnostics.push({
          severity: 'error',
          code: 'VZO101',
          message: 'unterminated string: a string must close on the same line',
        })
      }
      tokens.push({ kind: 'string', value, line: startLine })
      continue
    }

    if (isIdentStart(ch)) {
      let name = ''
      while (index < text.length && isIdentPart(text[index])) {
        name += text[index]
        index += 1
      }
      tokens.push({ kind: 'ident', value: name, line: startLine })
      continue
    }

    if (ch === '$') {
      index += 1
      if (!isIdentStart(text[index])) {
        diagnostics.push({ severity: 'error', code: 'VZO102', message: 'a name must follow "$"' })
        tokens.push({ kind: 'op', value: '$', line: startLine })
        continue
      }
      let name = ''
      while (index < text.length && isIdentPart(text[index])) {
        name += text[index]
        index += 1
      }
      tokens.push({ kind: 'state', value: name, line: startLine })
      continue
    }

    let operator: string | null = null
    for (const candidate of OPERATORS) {
      if (text.startsWith(candidate, index)) {
        operator = candidate
        break
      }
    }
    if (operator !== null) {
      tokens.push({ kind: 'op', value: operator, line: startLine })
      index += operator.length
      continue
    }

    diagnostics.push({
      severity: 'error',
      code: 'VZO103',
      message: `line ${startLine}: unexpected character ${JSON.stringify(ch)} — names are ASCII, and an object key that is not a bare ASCII identifier must be quoted`,
    })
    index += 1
  }

  tokens.push({ kind: 'eof', value: '', line })
  return { tokens, diagnostics }
}
