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

import { createElement, useCallback, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { openuiMetaFrom } from '../fragment.ts'
import type { OpenUIMeta } from '../fragment.ts'
import { parseProgram } from '../backends/openui/parse.ts'
import { evaluateProgram } from '../backends/openui/evaluate.ts'
import type { BindingDescriptor, EvaluationValue } from '../backends/openui/evaluate.ts'

/**
 * One component this renderer can draw.
 *
 * `write` carries a `$variable` change back to the card's state, which is what
 * closes the loop: input -> state -> re-evaluate -> new tree.
 */
type Renderer = (props: readonly unknown[], write: WriteChannel, key: string) => ReactNode

/** Writes one bound variable and triggers re-evaluation. */
type WriteChannel = (name: string, next: EvaluationValue) => void

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

/**
 * Frame variable → host design token, with a literal fallback.
 *
 * The DSH host publishes its palette as `--dsw-alias-*` and `--dsw-static-*`
 * design tokens; it does NOT publish `--foreground`, `--primary` or
 * `--border`. Declaring those names here, on the card root, bridges the two so
 * the component table below can keep using one vocabulary inside and outside
 * DSH. Without this every `var(--…)` in the table is invalid at computed-value
 * time and collapses to the property's initial value — a Button with no
 * background, no border and square corners, which is exactly what a real
 * browser showed and no unit test could see.
 *
 * The fallbacks keep a non-DSH host legible; `light-dark()` is deliberately not
 * used, because these are plain values the host already resolved for the
 * current appearance, and re-interpreting them per scheme would double-apply
 * the theme.
 */
const HOST_TOKENS: Readonly<Record<string, readonly [string, string]>> = {
  '--foreground': ['--dsw-alias-label-primary', 'light-dark(rgb(26 28 31), rgb(240 242 245))'],
  // Tertiary, not caption: the host's caption tier measures 2.13:1 on white,
  // which is below AA for text. Tertiary is the tier the host itself uses for
  // small meta text (timestamps, key hints) and measures 3.71:1.
  '--muted-foreground': ['--dsw-alias-label-tertiary', 'light-dark(rgb(26 28 31 / 55%), rgb(240 242 245 / 55%))'],
  '--border': ['--dsw-alias-border-l2', 'light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 12%))'],
  '--card': ['--dsw-alias-bg-layer-2', 'light-dark(rgb(0 0 0 / 4%), rgb(255 255 255 / 6%))'],
  '--primary': ['--dsw-alias-brand-primary-new-colorprimary-new-color', 'light-dark(rgb(65 118 230), rgb(110 150 240))'],
  // The text that pairs with the brand fill. The host's *-inverted token is NOT
  // it: in dark mode that one resolves to #353638, which measures 3.59:1 on the
  // brand blue and fails AA. --dsw-alias-label-primary-foreground is the token
  // the host itself pairs with a filled brand surface (5.61:1 on #5686fe, and
  // 5.61:1 on #4176e6 in light mode).
  '--primary-foreground': ['--dsw-alias-label-primary-foreground', 'light-dark(rgb(255 255 255), rgb(13 13 13))'],
  // The series order matches frame-css.ts, so one colour name means the same
  // colour in both backends: 1 brand, 2 amber, 3 green, 4 purple, 5 red.
  '--viz-series-1': ['--dsw-static-deepseek-500', '#4176e6'],
  '--viz-series-2': ['--dsw-static-amber-500', '#f59e0b'],
  '--viz-series-3': ['--dsw-static-green-500', '#22c55e'],
  '--viz-series-4': ['--dsw-static-purple-500', '#9359b9'],
  '--viz-series-5': ['--dsw-static-red-500', '#ef4444'],
  '--viz-grid': ['--dsw-alias-border-l1', 'light-dark(rgb(0 0 0 / 8%), rgb(255 255 255 / 10%))'],
  '--radius': ['--dsw-radius-sm', '8px'],
  '--font-sans': ['--dsh-font-family-text-default', 'system-ui, -apple-system, \'Segoe UI\', \'PingFang SC\', \'Microsoft YaHei\', sans-serif'],
}

/**
 * Declare the bridged variables on an element.
 * @returns a style object carrying the custom properties, ready to spread.
 */
function hostTokenStyle(): CSSProperties {
  const style: Record<string, string> = {}
  for (const [name, [hostToken, fallback]] of Object.entries(HOST_TOKENS)) {
    style[name] = `var(${hostToken}, ${fallback})`
  }
  return style as CSSProperties
}

/** Colour tokens the language names, resolved through the host's CSS variables. */
const COLOR_VARS: Readonly<Record<string, string>> = {
  ink: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  faint: 'var(--muted-foreground)',
  info: 'var(--primary)',
  success: 'var(--viz-series-3)',
  warning: 'var(--viz-series-2)',
  danger: 'var(--viz-series-5)',
  purple: 'var(--viz-series-4)',
  pink: 'var(--viz-series-5)',
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
  danger: { background: 'var(--viz-series-5)', color: 'var(--primary-foreground)', borderColor: 'var(--viz-series-5)' },
}

/**
 * The component table. A name here is a name the model may use; nothing else
 * can become an element. Keeping this beside the host's signature table is what
 * makes the prompt, the validator and the renderer agree.
 */
const COMPONENTS: Readonly<Record<string, Renderer>> = {
  Col: (props, _write, key) => createElement(
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
  Row: (props, _write, key) => createElement(
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
  Card: (props, _write, key) => {
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
  Title: (props, _write, key) => createElement(
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
  Text: (props, _write, key) => createElement(
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
  Caption: (props, _write, key) => createElement(
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
  Button: (props, _write, key) => {
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
          // Longhands, not the `border` shorthand: the variant table below sets
          // borderColor, and mixing the two made the shorthand's style and width
          // resolve to nothing.
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--border)',
          cursor: 'pointer',
          ...BUTTON_KINDS[variant] ?? BUTTON_KINDS.primary,
        } satisfies CSSProperties,
      },
      text(props[0]),
    )
  },
  Slider: (props, write, key) => {
    const bound = asBinding(props[0])
    const current = num(bound === undefined ? props[0] : bound.value, 0)
    const min = num(props[1], 0)
    const max = num(props[2], 100)
    return createElement(
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
        min,
        max,
        step: num(arg(props[3], 1), 1),
        // A bound Slider is controlled by $state and can be dragged; an unbound
        // one has nowhere to write to, so it stays read-only rather than
        // pretending to move.
        value: current,
        ...bound === undefined ? {} : {
          onChange: (event: { target: { value: string } }) => {
            const parsed = Number(event.target.value)
            if (Number.isFinite(parsed)) write(bound.name, parsed)
          },
        },
        disabled: bound === undefined,
        'aria-label': text(props[4], 'value'),
        style: { flex: '1 1 auto', minWidth: 60, accentColor: 'var(--primary)' } satisfies CSSProperties,
      }),
      createElement('span', { style: { minWidth: 24, textAlign: 'right' } }, text(current)),
    )
  },
}

/** What the parser and the walker hand the renderer. */
interface RenderedProgram {
  readonly node: ReactNode
  readonly error: string | undefined
}

/** One `$variable` a component may write back to. */
interface Binding {
  readonly name: string
  readonly value: EvaluationValue
}

/**
 * Turn one evaluated value into React nodes.
 *
 * The evaluator has resolved statements, `@functions`, `@Each`, arithmetic and
 * conditionals already; this maps the resulting descriptor tree onto the
 * component table. That split is the point of stage 2: the engine the host
 * validates with is the engine the card renders with.
 *
 * A `$variable` argument is passed through as a {@link Binding} rather than a
 * bare value, because an input has to know which variable to write back to.
 * Flattening it is exactly what kept the Slider read-only.
 *
 * @param value - an evaluated value.
 * @param write - writes one bound variable.
 * @param depth - nesting depth, so a hostile tree cannot exhaust the stack.
 * @returns the node.
 */
function drawValue(
  value: EvaluationValue,
  write: (name: string, next: EvaluationValue) => void,
  depth = 0,
  path = '',
): ReactNode {
  if (depth > 200) return null
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) {
    // Each item needs its OWN key, or React sees N siblings with one identity.
    // @Each output made that visible: every generated Text shared `o3:Text`.
    return value.map((item, index) => drawValue(item, write, depth + 1, `${path}/${index}`))
  }
  if (typeof value !== 'object') return value as ReactNode

  const descriptor = value as {
    kind?: string
    name?: string
    args?: readonly EvaluationValue[]
    value?: EvaluationValue
  }

  if (descriptor.kind === 'binding' && typeof descriptor.name === 'string') {
    return bindingNode({ name: descriptor.name, value: descriptor.value ?? null })
  }

  if (descriptor.kind !== 'element' || typeof descriptor.name !== 'string') return null

  const renderer = COMPONENTS[descriptor.name]
  if (renderer === undefined) return null
  const args = (descriptor.args ?? []).map((arg, index) =>
    drawValue(arg, write, depth + 1, `${path}/${descriptor.name}${index}`))
  return renderer(args, write, `o${path}:${descriptor.name}`)
}

/**
 * Marker for a bound argument.
 *
 * A binding travels through the same array as ordinary arguments, so it is
 * carried in a shape the component table can recognise rather than being
 * flattened before the component ever sees it.
 * @param binding - the binding.
 * @returns the marker.
 */
function bindingNode(binding: Binding): ReactNode {
  return { __openuiBinding: binding } as unknown as ReactNode
}

/**
 * Read a bound argument, if this argument is one.
 * @param value - one component argument.
 * @returns the binding, or undefined.
 */
function asBinding(value: unknown): Binding | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const marked = (value as { __openuiBinding?: Binding }).__openuiBinding
  return marked === undefined ? undefined : marked
}

/**
 * Evaluate a program and draw it.
 * @param source - the program.
 * @param state - current `$variable` values.
 * @param write - writes one variable back.
 * @returns the rendered tree, or the reason it cannot be drawn.
 */
export function drawProgram(
  source: string,
  state: Readonly<Record<string, EvaluationValue>>,
  write: (name: string, next: EvaluationValue) => void,
): RenderedProgram {
  const parsed = parseProgram(source)
  if (!parsed.ok) {
    return { node: null, error: parsed.diagnostics[0]?.message ?? 'the program could not be parsed' }
  }
  if (parsed.rootName === undefined) {
    return { node: null, error: 'the program never defines `root`' }
  }

  const result = evaluateProgram(parsed, { state })
  const failed = result.diagnostics.find(diagnostic => diagnostic.severity === 'error')
  if (failed !== undefined) return { node: null, error: failed.message }

  return { node: drawValue(result.root, write), error: undefined }
}

/**
 * Evaluate a program with no interaction.
 *
 * Kept for the many callers that only need to know whether a program draws.
 * @param source - the program.
 * @param state - current `$variable` values.
 * @returns the rendered tree, or the reason it cannot be drawn.
 */
export function renderProgram(
  source: string,
  state: Readonly<Record<string, EvaluationValue>> = {},
): RenderedProgram {
  return drawProgram(source, state, () => {})
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
  // The card owns its `$state`. Writing a variable re-evaluates the whole
  // program, which is what makes one control change another component: the
  // tree is not patched, it is rebuilt from the same program with new state.
  const [state, setState] = useState<Record<string, EvaluationValue>>({})
  const write = useCallback((name: string, next: EvaluationValue) => {
    setState(previous => ({ ...previous, [name]: next }))
  }, [])
  const { node, error } = useMemo(
    () => drawProgram(meta.program, state, write),
    [meta.program, state, write],
  )
  return createElement(
    'div',
    // The bridged custom properties must sit on the card root itself: a
    // var() only sees declarations on the element or an ancestor, so putting
    // them anywhere lower would leave the table's colours unresolved.
    { style: { ...hostTokenStyle(), ...ROOT_STYLE }, 'data-openui-card': meta.path },
    // Same treatment as the HTML card's header (VisualizeCard.tsx): foreground
    // ink at 0.65 opacity. Using muted ink here made the two backends disagree
    // about what a card title looks like — and dropped it under AA (2.13:1).
    createElement(
      'div',
      { style: { fontSize: '0.75rem', color: 'var(--foreground)', opacity: 0.65 } },
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