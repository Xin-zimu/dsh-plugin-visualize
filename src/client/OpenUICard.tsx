/**
 * The `intelligent_ui` toolview: renders an openui-lang program as a React
 * element tree.
 *
 * This is the second renderer, and it is deliberately nothing like the first.
 * The HTML backend hands model-authored markup to a sandboxed frame; this one
 * never gives the model any markup at all. The program is parsed on the host
 * into diagnostics, and here it is walked into React elements the component
 * table below names — so a name the table does not have cannot become an
 * element, and no string the model wrote is ever interpreted as code or parsed
 * as HTML.
 *
 * Scope of this milestone: the layout, text and input primitives the seat
 * needs to prove the dispatch works end to end. Widening the table is stage 2's
 * job; the parser, the diagnostics and this renderer stay untouched by it.
 *
 * Replay: everything drawn derives from the persisted meta, so a reload
 * reproduces the card without calling the model again.
 */

import { createElement, type CSSProperties, type ReactNode } from 'react'
import { openuiMetaFrom } from '../fragment.ts'
import type { OpenUIMeta } from '../fragment.ts'
import type { Expr, Statement } from '../backends/openui/parse.ts'
import { parseProgram } from '../backends/openui/parse.ts'

/** One component this renderer can draw. */
type Renderer = (props: readonly unknown[], key: string) => ReactNode

/** Space scale: the language counts gap and padding in 4px steps. */
const STEP = 4

/**
 * Resolve one evaluated argument.
 * @param value - the evaluated value.
 * @param fallback - returned when the value is absent.
 * @returns the value, or the fallback.
 */
function arg(value: unknown, fallback?: unknown): unknown {
  return value === undefined || value === null ? fallback : value
}

/**
 * Read a string argument.
 * @param value - the raw value.
 * @param fallback - used when the value is not a string.
 * @returns the string.
 */
function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

/**
 * Read a numeric argument, tolerating the string forms the language allows.
 * @param value - the raw value.
 * @param fallback - used when the value is not a number.
 * @returns the number.
 */
function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * Turn a gap or padding argument into pixels.
 * @param value - the raw value.
 * @param fallbackSteps - steps used when absent.
 * @returns a CSS length.
 */
function space(value: unknown, fallbackSteps = 0): number {
  return num(arg(value, fallbackSteps), fallbackSteps) * STEP
}

/** The children argument of a container: already-rendered nodes arrive as an array. */
function children(value: unknown): ReactNode {
  if (Array.isArray(value)) return value as ReactNode[]
  if (value === null || value === undefined) return null
  return value as ReactNode
}

/** Colour tokens the language names, resolved through the host's CSS variables. */
const COLOR_VARS: Readonly<Record<string, string>> = {
  ink: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  faint: 'var(--muted-foreground)',
  info: 'var(--primary)',
  success: 'var(--viz-series-2)',
  warning: 'var(--viz-series-3)',
  danger: 'var(--viz-series-4)',
  purple: 'var(--viz-series-5)',
  pink: 'var(--viz-series-4)',
}

/**
 * Resolve a colour argument to a CSS value.
 * @param value - the raw value.
 * @returns the CSS colour, or undefined to inherit.
 */
function color(value: unknown): string | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  return COLOR_VARS[value] ?? value
}

/** Type sizes the language names, as rem values keeping the 11px floor. */
const SIZES: Readonly<Record<string, string>> = {
  xs: '0.6875rem',
  sm: '0.75rem',
  md: '0.875rem',
  lg: '1rem',
  xl: '1.25rem',
  '2xl': '1.5rem',
  '3xl': '1.75rem',
}

/**
 * Resolve a size argument.
 * @param value - the raw value.
 * @param fallback - used when absent or unknown.
 * @returns a CSS font size.
 */
function fontSize(value: unknown, fallback = 'md'): string {
  const name = typeof value === 'string' ? value : fallback
  return SIZES[name] ?? SIZES[fallback] ?? SIZES.md!
}

/** How much a Button's variant changes its look. */
const BUTTON_KINDS: Readonly<Record<string, CSSProperties>> = {
  primary: { background: 'var(--primary)', color: 'var(--primary-foreground)', borderColor: 'var(--primary)' },
  secondary: { background: 'var(--viz-grid)', color: 'var(--foreground)', borderColor: 'var(--border)' },
  ghost: { background: 'transparent', color: 'var(--foreground)', borderColor: 'transparent' },
  outline: { background: 'transparent', color: 'var(--foreground)', borderColor: 'var(--border)' },
  danger: { background: 'var(--viz-series-4)', color: '#fff', borderColor: 'var(--viz-series-4)' },
}

/**
 * The component table. A name here is a name the model may use; nothing else
 * can become an element. Keeping this beside the host's signature table is what
 * makes the prompt, the validator and the renderer agree.
 */
const COMPONENTS: Readonly<Record<string, Renderer>> = {
  Col: (props, key) => createElement(
    'div',
    {
      key,
      style: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: space(props[1], 3),
        minWidth: 0,
      } satisfies CSSProperties,
    },
    children(props[0]),
  ),
  Row: (props, key) => createElement(
    'div',
    {
      key,
      style: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: space(props[1], 2),
        justifyContent: props[2] === 'between' ? 'space-between' : undefined,
        minWidth: 0,
      } satisfies CSSProperties,
    },
    children(props[0]),
  ),
  Card: (props, key) => {
    const variant = text(props[1], 'soft')
    return createElement(
      'div',
      {
        key,
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: space(props[3], 3),
          padding: space(props[2], 4),
          borderRadius: 'calc(var(--radius) * 1.6)',
          border: '1px solid var(--border)',
          background: variant === 'soft'
            ? 'var(--viz-grid)'
            : variant === 'elevated' ? 'var(--card)' : 'transparent',
          boxShadow: variant === 'elevated' ? '0 8px 24px rgb(16 24 40 / 0.12)' : undefined,
          minWidth: 0,
        } satisfies CSSProperties,
      },
      children(props[0]),
    )
  },
  Title: (props, key) => createElement(
    'div',
    {
      key,
      style: {
        fontSize: fontSize(props[1], 'lg'),
        fontWeight: 600,
        color: color(props[2]) ?? 'var(--foreground)',
        letterSpacing: '-0.01em',
      } satisfies CSSProperties,
    },
    text(props[0]),
  ),
  Text: (props, key) => createElement(
    'div',
    {
      key,
      style: {
        fontSize: fontSize(props[1], 'md'),
        color: color(props[2]) ?? 'var(--foreground)',
        fontWeight: props[3] === 'semibold' ? 600 : props[3] === 'medium' ? 500 : 400,
        whiteSpace: 'pre-wrap',
        minWidth: 0,
      } satisfies CSSProperties,
    },
    Array.isArray(props[0]) ? (props[0] as ReactNode[]) : text(props[0]),
  ),
  Caption: (props, key) => createElement(
    'div',
    {
      key,
      style: {
        fontSize: SIZES.sm,
        color: color(props[1]) ?? 'var(--muted-foreground)',
      } satisfies CSSProperties,
    },
    text(props[0]),
  ),
  Button: (props, key) => {
    const variant = text(props[2], 'primary')
    return createElement(
      'button',
      {
        key,
        type: 'button',
        // An action step needs the evaluator to mean anything. Until stage 2/3
        // wires it, the button is drawn but inert rather than pretending.
        disabled: props[5] === true,
        style: {
          font: 'inherit',
          fontSize: SIZES.sm,
          alignSelf: 'flex-start',
          padding: '5px 14px',
          borderRadius: 'calc(var(--radius) * 1.4)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          ...BUTTON_KINDS[variant] ?? BUTTON_KINDS.primary,
        } satisfies CSSProperties,
      },
      text(props[0]),
    )
  },
  Slider: (props, key) => createElement(
    'label',
    {
      key,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: SIZES.sm,
        color: 'var(--muted-foreground)',
        minWidth: 0,
      } satisfies CSSProperties,
    },
    text(props[4], ''),
    createElement('input', {
      type: 'range',
      min: num(props[1], 0),
      max: num(props[2], 100),
      step: num(arg(props[3], 1), 1),
      defaultValue: num(props[0], 0),
      // Interaction needs `$state`, which arrives with the evaluator; drawing
      // it read-only is honest about where this milestone stops.
      disabled: true,
      style: { flex: '1 1 auto', minWidth: 60, accentColor: 'var(--primary)' } satisfies CSSProperties,
    }),
  ),
}

/** What the parser and the walker hand the renderer. */
interface RenderedProgram {
  readonly node: ReactNode
  readonly error: string | undefined
}

/**
 * Statement values, resolved on demand.
 *
 * openui-lang lets a statement be referenced before it is defined, so a
 * one-pass walk is wrong: `root = Col([Text(label)])` followed by
 * `label = "hi"` must still read the label. This resolves a name the first
 * time it is asked for, memoizes the result, and treats a cycle as null rather
 * than recursing forever.
 */
class Scope {
  readonly #statements: ReadonlyMap<string, Expr>
  readonly #values = new Map<string, unknown>()
  readonly #resolving = new Set<string>()

  /**
   * @param statements - every non-state statement, by name.
   */
  constructor(statements: ReadonlyMap<string, Expr>) {
    this.#statements = statements
  }

  /**
   * Read one name.
   * @param name - the statement name.
   * @returns the rendered value, or null when the name is undefined or cyclic.
   */
  get(name: string): unknown {
    if (this.#values.has(name)) return this.#values.get(name)
    const expr = this.#statements.get(name)
    if (expr === undefined) return null
    if (this.#resolving.has(name)) return null
    this.#resolving.add(name)
    const value = this.value(expr)
    this.#resolving.delete(name)
    this.#values.set(name, value)
    return value
  }

  /**
   * Evaluate an argument expression to a plain value.
   * @param expr - the expression.
   * @returns the value.
   */
  value(expr: Expr): unknown {
    switch (expr.t) {
      case 'str':
      case 'num':
      case 'bool':
        return expr.v
      case 'null':
        return null
      case 'ref':
        return this.get(expr.name)
      case 'arr':
        return expr.items.map(item => this.value(item))
      case 'call':
        return this.render(expr, `k${this.#values.size}:${expr.name}`)
      case 'bin':
        if (expr.op === '+') return `${text(this.value(expr.left))}${text(this.value(expr.right))}`
        return null
      default:
        return null
    }
  }

  /**
   * Draw one component call.
   * @param expr - the call node.
   * @param key - React key.
   * @returns the element, or null when the table has no such component.
   */
  render(expr: Extract<Expr, { t: 'call' }>, key: string): ReactNode {
    const renderer = COMPONENTS[expr.name]
    if (renderer === undefined) return null
    return renderer(expr.args.map(item => this.value(item)), key)
  }
}

/**
 * Walk the program into elements.
 * @param source - the program.
 * @returns the rendered tree, or the reason it cannot be drawn.
 */
export function renderProgram(source: string): RenderedProgram {
  const parsed = parseProgram(source)
  if (!parsed.ok) {
    return { node: null, error: parsed.diagnostics[0]?.message ?? 'the program could not be parsed' }
  }

  const statements = new Map<string, Expr>()
  let rootExpr: Expr | undefined
  for (const statement of parsed.statements as readonly Statement[]) {
    if (statement.name === 'root' && !statement.state) {
      rootExpr = statement.expr
      continue
    }
    statements.set(statement.name, statement.expr)
  }

  if (rootExpr === undefined) {
    return { node: null, error: 'the program never defines \`root\`' }
  }

  const scope = new Scope(statements)
  const node = rootExpr.t === 'call' ? scope.render(rootExpr, 'root') : (scope.value(rootExpr) as ReactNode)
  return { node, error: undefined }
}

/**
 * Style of the card body: a plain surface, never a frame.
 *
 * `alignItems: 'stretch'` keeps every child full width, which is what a column
 * layout means; without it a flex column centres each child on the cross axis,
 * and a lone Button drifted to the middle of the card.
 */
const ROOT_STYLE: CSSProperties = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--foreground)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 12,
  minWidth: 0,
}

/** A quiet notice, used when a program cannot be drawn. */
const NOTICE_STYLE: CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--muted-foreground)',
  border: '1px dashed var(--border)',
  borderRadius: 'calc(var(--radius) * 1.4)',
  padding: '10px 12px',
}

/**
 * The card. No iframe: this renderer draws host components, so the boundary is
 * the component table rather than a frame.
 * @param props - the persisted meta.
 * @returns the card body.
 */
export function OpenUICard({ meta }: { readonly meta: OpenUIMeta }): ReactNode {
  const { node, error } = renderProgram(meta.program)
  return createElement(
    'div',
    { style: ROOT_STYLE, 'data-openui-card': meta.path },
    createElement(
      'div',
      { style: { fontSize: '0.75rem', color: 'var(--muted-foreground)' } },
      meta.title,
    ),
    error === undefined
      ? node
      : createElement('div', { style: NOTICE_STYLE }, error),
  )
}

/**
 * The `intelligent_ui` toolview entry.
 *
 * Registered under the tool name the pre-fork dsh-intelligent-ui plugin used,
 * so a card written by that plugin — a program in the call's own arguments —
 * replays through this renderer. A call whose arguments are not a readable
 * program declines to a quiet line rather than drawing an empty card.
 */
export function OpenUIToolView({ block }: { readonly block: unknown }): ReactNode {
  const meta = openuiMetaFrom(block)
  if (meta === undefined) {
    return createElement('div', { style: NOTICE_STYLE }, 'Intelligent UI · this call carries no readable program')
  }
  return createElement(OpenUICard, { meta })
}