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

import { createElement, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { openuiMetaFrom } from '../fragment.ts'
import type { OpenUIMeta } from '../fragment.ts'
import { parseProgram } from '../backends/openui/parse.ts'
import { evaluateProgram } from '../backends/openui/evaluate.ts'
import type { BindingDescriptor, EvaluationValue } from '../backends/openui/evaluate.ts'
import { COMPONENT_NAMES } from '../backends/openui/signatures.ts'
import { cardStateKey, cardStates } from './card-state.ts'
import { applyAction, SUPPORTED_STEPS, UNSUPPORTED_STEPS } from './openui-actions.ts'
import {
  buildRecord,
  hydrateState,
  mergeValues,
  openuiStateKey,
  readRecord,
  type HydratedState,
} from './openui-state.ts'

/**
 * One component this renderer can draw.
 *
 * `write` carries a `$variable` change back to the card's state, which is what
 * closes the loop: input -> state -> re-evaluate -> new tree.
 */
type Renderer = (props: readonly unknown[], write: WriteChannel, key: string) => ReactNode

/**
 * Writes bound variables and triggers re-evaluation.
 *
 * A Slider writes one variable; a Button's `Action([...])` writes several at
 * once. Both go through this one channel so there is a single state-update and
 * persistence path — a Button cannot reach state by a route a Slider does not.
 */
type WriteChannel = ((name: string, next: EvaluationValue) => void) & {
  /** Apply several variables in one update, which is one re-evaluation. */
  patch(changes: Readonly<Record<string, EvaluationValue>>): void
  /**
   * Dispatch one evaluated action against the program's declared variables.
   *
   * The card, not the renderer, owns this: it is the only place that knows the
   * current state and the declared defaults, and it is the place every other
   * state change already goes through.
   */
  runAction(action: unknown): void
}

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
 * Read a CSS length argument: a number is pixels, a string passes through.
 *
 * `undefined` means "not stated", which is different from `0`: a Box with no
 * width must size itself, not collapse to zero.
 * @param value - the raw value.
 * @returns a CSS length, or undefined when the argument was absent.
 */
function length(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}px` : undefined
  if (typeof value === 'string') return value
  return undefined
}

/**
 * Resolve a `radius` argument the way the language's own scale defines it.
 *
 * The named scale is the one upstream's `utilRadius` publishes; a number is
 * pixels and any other string is passed through as raw CSS. Absent means
 * "square", so callers must not substitute a default here.
 * @param value - the raw value.
 * @returns a CSS radius, or undefined.
 */
function radiusOf(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? `${value}px` : undefined
  const table: Readonly<Record<string, string>> = {
    sm: '6px', md: '10px', lg: '14px', xl: '20px', full: '9999px', none: '0',
  }
  const name = String(value)
  return table[name] ?? name
}

/**
 * Resolve a `border` argument into explicit longhands.
 *
 * `true` is a one-pixel hairline in the pane border colour, a number is that
 * many pixels, `l1`/`l2` select the two host border tiers, and any other string
 * is a CSS border shorthand. Longhands rather than the shorthand for the same
 * reason the Button uses them: a shorthand beside a `borderColor` longhand
 * resets the width and style to nothing, which is how a border disappears while
 * every test still passes.
 * @param value - the raw value.
 * @returns width/style/colour, or undefined when there is no border.
 */
function borderOf(value: unknown): CSSProperties | undefined {
  if (value === undefined || value === null || value === false || value === '' || value === 'none') {
    return undefined
  }
  if (value === true) return { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)' }
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0
      ? { borderWidth: value, borderStyle: 'solid', borderColor: 'var(--border)' }
      : undefined
  }
  const text = String(value).trim()
  if (text === 'l1') return { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border-subtle)' }
  if (text === 'l2') return { borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--border)' }
  // A raw shorthand such as "2px dashed red": split it so a later longhand from
  // the same component cannot silently erase part of it.
  const match = /^(?:(\d+(?:\.\d+)?)px\s+)?(solid|dashed|dotted|double)?\s*(.*)$/u.exec(text)
  if (match !== null && (match[1] !== undefined || match[2] !== undefined)) {
    return {
      borderWidth: match[1] === undefined ? 1 : Number(match[1]),
      borderStyle: (match[2] ?? 'solid') as CSSProperties['borderStyle'],
      borderColor: match[3] === '' ? 'var(--border)' : match[3],
    }
  }
  return { borderWidth: 1, borderStyle: 'solid', borderColor: text === '' ? 'var(--border)' : text }
}

/** The flex `align` vocabulary, as CSS. */
const ALIGN: Readonly<Record<string, CSSProperties['alignItems']>> = {
  start: 'flex-start', left: 'flex-start',
  center: 'center', middle: 'center',
  end: 'flex-end', right: 'flex-end',
  stretch: 'stretch', baseline: 'baseline',
}

/** The flex `justify` vocabulary, as CSS. */
const JUSTIFY: Readonly<Record<string, CSSProperties['justifyContent']>> = {
  start: 'flex-start', left: 'flex-start',
  center: 'center', middle: 'center',
  end: 'flex-end', right: 'flex-end',
  between: 'space-between',
  around: 'space-around',
  evenly: 'space-evenly',
}

/**
 * Read an `align` argument.
 * @param value - the raw value.
 * @returns the CSS value, or undefined when absent or unknown.
 */
function alignOf(value: unknown): CSSProperties['alignItems'] | undefined {
  return typeof value === 'string' ? ALIGN[value.toLowerCase()] : undefined
}

/**
 * Read a `justify` argument.
 * @param value - the raw value.
 * @returns the CSS value, or undefined when absent or unknown.
 */
function justifyOf(value: unknown): CSSProperties['justifyContent'] | undefined {
  return typeof value === 'string' ? JUSTIFY[value.toLowerCase()] : undefined
}

/**
 * Read a `direction` argument.
 * @param value - the raw value.
 * @param fallback - used when absent or unknown.
 * @returns a flex direction.
 */
function directionOf(value: unknown, fallback: CSSProperties['flexDirection']): CSSProperties['flexDirection'] {
  if (value === undefined || value === null || value === '') return fallback
  const table: Readonly<Record<string, CSSProperties['flexDirection']>> = {
    row: 'row', horizontal: 'row', h: 'row',
    col: 'column', column: 'column', vertical: 'column', v: 'column',
  }
  return table[String(value).toLowerCase()] ?? fallback
}

/**
 * Read a `wrap` argument.
 *
 * `wrap` is present-or-absent in the signature table, so both a bare flag and
 * the CSS words are accepted; anything that reads as "off" turns wrapping off.
 * @param value - the raw value.
 * @param fallback - used when absent.
 * @returns a flex-wrap value.
 */
function wrapOf(value: unknown, fallback: CSSProperties['flexWrap']): CSSProperties['flexWrap'] {
  if (value === undefined || value === null || value === '') return fallback
  if (value === false) return 'nowrap'
  const name = String(value).toLowerCase()
  if (name === 'false' || name === 'no' || name === 'none' || name === 'nowrap') return 'nowrap'
  return 'wrap'
}

/**
 * Read a `flex` argument.
 *
 * A number is a grow factor, `true` shares the free space and `false` holds its
 * own size — the same three readings upstream documents.
 * @param value - the raw value.
 * @returns a CSS flex value, or undefined when absent.
 */
function flexOf(value: unknown): CSSProperties['flex'] | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  if (value === true) return '1 1 auto'
  if (value === false) return '0 0 auto'
  return String(value)
}

/**
 * Resolve a `background` argument to something that paints.
 *
 * A colour name from the language's palette becomes a soft tint of the same
 * series the strong form uses, so `background: "success"` reads as a success
 * panel instead of a saturated block. The tint is mixed from a token that is
 * already declared on the card root rather than from a new literal, which is
 * what keeps every referenced variable resolvable in both colour schemes.
 *
 * A raw CSS colour passes through untouched, matching the language's rule that
 * an unrecognised name is taken as CSS.
 *
 * @param value - the raw value.
 * @returns a CSS background, or undefined when absent.
 */
function paintOf(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const strong = COLOR_VARS[value]
  if (strong === undefined) return value
  return `color-mix(in oklab, ${strong} 14%, transparent)`
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
  // The hairline tier. The host publishes both `border-l1` and `border-l2`; the
  // language's `border: "l1"` names the fainter of the two, so it gets its own
  // declaration rather than reusing `--border` and silently meaning l2.
  '--border-subtle': ['--dsw-alias-border-l1', 'light-dark(rgb(0 0 0 / 8%), rgb(255 255 255 / 10%))'],
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
  //
  // Series 4 is the exception, and it was found in the 4A-1 browser run rather
  // than by reading: the host publishes NO purple. Its static scale is deepseek,
  // blue, amber, green and red; the only violet-ish names are
  // `--dsh-file-type-violet` (a file-type tint, empty on the body) and a
  // gradient stop. The previous entry here named `--dsw-static-purple-500`,
  // which does not exist — it resolved to nothing in the real host and looked
  // perfectly fine in every unit test.
  //
  // So this slot has no host token to read. It is declared as a literal pair,
  // which is honest about what it is: the one series colour the host does not
  // supply. `light-dark()` is used because there is no resolved host value to
  // inherit, and the pair matches frame-css.ts so a series-4 chart is the same
  // colour in both backends.
  '--viz-series-1': ['--dsw-static-deepseek-500', '#4176e6'],
  '--viz-series-2': ['--dsw-static-amber-500', '#f59e0b'],
  '--viz-series-3': ['--dsw-static-green-500', '#22c55e'],
  '--viz-series-5': ['--dsw-static-red-500', '#ef4444'],
  '--viz-grid': ['--dsw-alias-border-l1', 'light-dark(rgb(0 0 0 / 8%), rgb(255 255 255 / 10%))'],
  '--radius': ['--dsw-radius-sm', '8px'],
  // `--dsw-font-family`, not `--dsh-font-family-text-default`: the host publishes
  // the former (it resolves to the same system stack) and has never published the
  // latter. Verified against all 509 custom properties the live host declares —
  // see evidence/phase-4a-1/host-tokens.json.
  '--font-sans': ['--dsw-font-family', 'system-ui, -apple-system, \'Segoe UI\', \'PingFang SC\', \'Microsoft YaHei\', sans-serif'],
}

/**
 * The one series colour with no host token behind it.
 *
 * Kept out of {@link HOST_TOKENS} because that table means "a host token plus a
 * fallback", and this has no host token. Writing a plausible-looking name into
 * the table would be the D6/D7 defect again: a `var()` that resolves to nothing
 * still paints the fallback, so the card looks right while the declaration lies
 * about where its colour comes from.
 */
const SERIES_4_LITERAL = 'light-dark(rgb(147 89 185), rgb(183 145 226))'

/**
 * Declare the bridged variables on an element.
 * @returns a style object carrying the custom properties, ready to spread.
 */
function hostTokenStyle(): CSSProperties {
  const style: Record<string, string> = {}
  for (const [name, [hostToken, fallback]] of Object.entries(HOST_TOKENS)) {
    style[name] = `var(${hostToken}, ${fallback})`
  }
  // Declared directly, not through a `var()`: there is no host token to read.
  // A `var()` here would resolve to nothing and paint the fallback, which looks
  // identical but hides that the host supplies no value at all.
  style['--viz-series-4'] = SERIES_4_LITERAL
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
  Box: (props, _write, key) => {
    // Argument order is the signature table's, not a guess: children, direction,
    // gap, padding, background, radius, border, width, height, flex, align,
    // justify, wrap.
    const radius = radiusOf(props[5])
    const border = borderOf(props[6])
    return createElement(
      'div',
      {
        key,
        style: {
          display: 'flex',
          flexDirection: directionOf(props[1], 'column'),
          // A Box wraps only when asked: a column that wrapped would put its
          // children side by side, which is not what "column by default" means.
          flexWrap: wrapOf(props[12], 'nowrap'),
          gap: space(props[2], 0),
          padding: space(props[3], 0),
          background: paintOf(props[4]),
          borderRadius: radius,
          // Radius clips content only when there is a radius to clip to. Setting
          // it unconditionally would make every Box a scroll container and
          // change how a nested Spacer resolves its free space.
          overflow: radius === undefined ? undefined : 'hidden',
          ...border ?? {},
          width: length(props[7]),
          height: length(props[8]),
          flex: flexOf(props[9]),
          alignItems: alignOf(props[10]),
          justifyContent: justifyOf(props[11]),
          boxSizing: 'border-box',
          minWidth: 0,
        } satisfies CSSProperties,
      },
      children(props[0]),
    )
  },
  Grid: (props, _write, key) => {
    // children, columns, minChildWidth, gap.
    //
    // The three branches are the signature table's own words: "Equal columns
    // (2 by default); minChildWidth drops columns when narrow." A numeric
    // `columns` that arrives as a string is read as a count, because a program
    // may legitimately write Grid([...], "3").
    const rawColumns = props[1]
    const columns = num(rawColumns, 0)
    const minChild = length(props[2])
    let template: string
    if (columns >= 1) {
      template = `repeat(${Math.max(1, Math.floor(columns))}, minmax(0, 1fr))`
    } else if (typeof rawColumns === 'string' && rawColumns.trim() !== '' && !Number.isFinite(Number(rawColumns))) {
      // An explicit CSS track list, e.g. "1fr 2fr" or "repeat(3, 1fr)".
      template = rawColumns
    } else if (minChild !== undefined) {
      // `min(100%, …)` keeps a single column from overflowing a narrow card:
      // without it a 160px floor inside a 140px card pushes the card wider.
      template = `repeat(auto-fit, minmax(min(100%, ${minChild}), 1fr))`
    } else {
      template = 'repeat(2, minmax(0, 1fr))'
    }
    return createElement(
      'div',
      {
        key,
        style: {
          display: 'grid',
          gridTemplateColumns: template,
          gap: space(props[3], 2),
          // Grid items are the card's own children: they must be allowed to
          // shrink below their content width, or a long word in one cell widens
          // the whole card instead of wrapping.
          minWidth: 0,
        } satisfies CSSProperties,
      },
      children(props[0]),
    )
  },
  Divider: (_props, _write, key) => createElement('div', {
    key,
    role: 'separator',
    'aria-orientation': 'horizontal',
    style: {
      // A rule needs a box: height 1 with no width would be invisible in a
      // column that stretches, and a zero-height one is invisible everywhere.
      width: '100%',
      height: 1,
      flex: '0 0 auto',
      background: 'var(--border)',
      border: 0,
      margin: 0,
    } satisfies CSSProperties,
  }),
  Spacer: (_props, _write, key) => createElement('div', {
    key,
    'aria-hidden': 'true',
    style: {
      // Free space in a row, and a floor in a column so it still separates two
      // blocks when there is nothing to distribute.
      flex: '1 1 0',
      minWidth: 4,
      minHeight: 4,
      alignSelf: 'stretch',
    } satisfies CSSProperties,
  }),
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
  Button: (props, write, key) => {
    const variant = text(props[2], 'primary')
    // The action arrives already evaluated: a value tree, never source text.
    // `runAction` decides what it means; a step it does not support changes
    // nothing, so an unknown or out-of-scope action is inert by construction
    // rather than by remembering to guard each one here.
    const action = props[1]
    return createElement(
      'button',
      {
        key,
        type: 'button',
        disabled: props[5] === true,
        ...action === undefined || action === null ? {} : {
          onClick: () => write.runAction(action),
        },
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
          cursor: props[5] === true ? 'default' : 'pointer',
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
 * Whether an element descriptor names an action step rather than a component.
 *
 * Action steps share the `{ kind: 'element', name }` shape with components, so
 * the walker has to tell them apart before it looks one up in the component
 * table. The set is the one the dispatcher knows, not a second list.
 * @param name - the descriptor's name, e.g. `Button` or `@Set`.
 * @returns true for a step the dispatcher handles.
 */
function isActionDescriptorName(name: string): boolean {
  const bare = name.replace(/^@/u, '')
  return SUPPORTED_STEPS.has(bare) || UNSUPPORTED_STEPS.has(bare)
}

/** Every component name this build can actually draw. */
export const RENDERED_COMPONENTS: readonly string[] = Object.keys(COMPONENTS)

/**
 * Every component name the language declares, for telling a renderer gap from
 * an unknown name.
 *
 * Read from the signature table rather than written out again: a name that
 * appears in the table and not in {@link COMPONENTS} is exactly the defect this
 * set is used to report, and a second hand-kept list could disagree with the
 * first one — the drift ADR-002 exists to prevent.
 */
const DECLARED_NAMES: ReadonlySet<string> = new Set(COMPONENT_NAMES)

/** A quiet note where a declared component has no renderer yet. */
const UNRENDERED_STYLE: CSSProperties = {
  fontSize: '0.6875rem',
  color: 'var(--muted-foreground)',
  border: '1px dashed var(--border)',
  borderRadius: 'calc(var(--radius) * 0.75)',
  padding: '2px 6px',
  display: 'inline-block',
  maxWidth: '100%',
}

/**
 * Say that a declared component has no renderer yet.
 *
 * It draws *something* on purpose. Drawing nothing is what made a legal program
 * look like a blank card, and a reader cannot tell that apart from a card that
 * was meant to be empty. The notice is small and muted: it is a diagnostic, not
 * a component.
 * @param name - the declared component name.
 * @param key - React key for the notice.
 * @returns the notice node.
 */
function unrenderedNotice(name: string, key: string): ReactNode {
  return createElement(
    'div',
    { key, style: UNRENDERED_STYLE, 'data-openui-unrendered': name },
    `${name} is not drawn by this build`,
  )
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
  write: WriteChannel,
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

  // An action step is a value, not a component: `@Set`, `@Reset`, `Action(...)`
  // and the unsupported steps all arrive as element descriptors, and the
  // component table has no entry for them. Recursing here would resolve each to
  // `null` and the Button would receive no action at all — which is exactly what
  // happened before this check existed. They are handed through untouched so the
  // dispatcher decides what they mean.
  if (isActionDescriptorName(descriptor.name)) return value as ReactNode

  const renderer = COMPONENTS[descriptor.name]
  if (renderer === undefined) {
    // A declared component with no renderer used to resolve to `null`, so a
    // legal program drew a silently empty card. That is the defect measured in
    // evidence/phase-3/unrendered-component-check.txt, and it is a usability
    // failure rather than a parser one: the validator accepts the name because
    // `signatures.ts` declares it, and the renderer then drops it.
    //
    // The two cases are not the same and must not look the same:
    //  - a name the language does not declare is a program error, and the host
    //    rejects it before this code runs (VZO002);
    //  - a name the language declares but this build cannot draw is a *renderer
    //    gap*, and saying so is strictly better than an empty container.
    // An empty argument list is not a gap: `Grid([])` is a legal empty grid and
    // the renderer below draws it.
    return DECLARED_NAMES.has(descriptor.name)
      ? unrenderedNotice(descriptor.name, `o${path}:${descriptor.name}`)
      : null
  }
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
 * A channel that does nothing: for callers that only draw and never interact.
 * @returns the inert channel.
 */
function inertChannel(): WriteChannel {
  const channel = ((_name: string, _next: EvaluationValue) => undefined) as unknown as WriteChannel
  channel.patch = () => undefined
  channel.runAction = () => undefined
  return channel
}

/**
 * Evaluate a program and draw it.
 * @param source - the program.
 * @param state - current `$variable` values.
 * @param write - carries state changes back; inert when omitted.
 * @returns the rendered tree, or the reason it cannot be drawn.
 */
export function drawProgram(
  source: string,
  state: Readonly<Record<string, EvaluationValue>>,
  write: WriteChannel = inertChannel(),
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
  return drawProgram(source, state)
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
 * Hydrate a card's `$state` from its stored record, against the program about
 * to be drawn.
 *
 * Kept out of the component body so the rules stay testable without React, and
 * memoized on `[program, stateKey]` so it runs when the card's identity or
 * program changes rather than on every keystroke.
 *
 * A card with no durable identity — no session, a `streaming` path, or no key
 * at all — hydrates to nothing. That is the same discipline as the HTML
 * backend's preview, thumbnail and new-tab surfaces: they may read, never save.
 *
 * @param program - the openui-lang program.
 * @param stateKey - the card's store key, or undefined when it persists nothing.
 * @returns the restored values, the program's digest, and whether to repair.
 */
function hydrateFor(program: string, stateKey: string | undefined): HydratedState {
  const parsed = parseProgram(program)
  if (!parsed.ok) return { state: {}, dropped: [], hash: '', defaults: {}, needsRepair: false }
  const { stateDefaults } = evaluateProgram(parsed, { state: {} })
  const raw = stateKey === undefined ? undefined : cardStates.read(openuiStateKey(stateKey))
  return hydrateState(raw, stateDefaults)
}

/**
 * Persist this card's `$state` after a change.
 *
 * Write-merge: the stored record is re-read and the union is written, this
 * view's values winning per key. Two views of one card (the toolview and the
 * turn tail) share one key, so a stale view would otherwise rewrite an old map
 * over a newer one.
 *
 * The merged map goes through {@link buildRecord}, which validates it exactly
 * as a restore would, so the merge cannot reintroduce a variable the current
 * program no longer declares or has retyped. Storage failures are the store's
 * business and never reach here — the card keeps rendering either way.
 *
 * @param stateKey - the card's store key.
 * @param hydration - what the card restored against; supplies hash and defaults.
 * @param state - the values to persist.
 */
function persistState(
  stateKey: string,
  hydration: HydratedState,
  state: Readonly<Record<string, EvaluationValue>>,
): void {
  const key = openuiStateKey(stateKey)
  const stored = readRecord(cardStates.read(key))
  const merged = mergeValues(stored?.values ?? {}, state)
  const record = buildRecord(hydration.hash, merged, hydration.defaults)
  // An empty map is how the store is told to drop the entry, so a card whose
  // state was reset leaves nothing behind for a later program to inherit.
  // The record is spread into the store's plain-object shape: it is only ever
  // read back through `readRecord`, never as a `CardState`.
  cardStates.write(key, record === undefined ? {} : { ...record })
}

/**
 * The card. No iframe: this renderer draws host components, so the boundary is
 * the component table rather than a frame.
 * @param props - the persisted meta and the card's state key.
 * @returns the card body.
 */
export function OpenUICard({
  meta,
  stateKey,
}: {
  readonly meta: OpenUIMeta
  /** Store key for `$state`; absent for a card with no durable identity. */
  readonly stateKey?: string | undefined
}): ReactNode {
  // The card owns its `$state`. Writing a variable re-evaluates the whole
  // program, which is what makes one control change another component: the
  // tree is not patched, it is rebuilt from the same program with new state.
  const hydration = useMemo(() => hydrateFor(meta.program, stateKey), [meta.program, stateKey])
  const [state, setState] = useState<Record<string, EvaluationValue>>(() => hydration.state)
  // A program or identity change re-hydrates. Adjusting state during render is
  // React's sanctioned pattern for a prop-derived reset, and it keeps the first
  // paint consistent instead of showing defaults for a frame.
  const lastHydration = useRef(hydration)
  if (lastHydration.current !== hydration) {
    lastHydration.current = hydration
    setState(hydration.state)
  }
  // One channel for every state change: a Slider writes one variable, a
  // Button's action writes a patch, and both end in this `setState`. Nothing a
  // control does can reach state another way.
  const write = useMemo(() => {
    const channel = ((name: string, next: EvaluationValue) => {
      setState(previous => ({ ...previous, [name]: next }))
    }) as WriteChannel
    channel.patch = (changes) => {
      if (Object.keys(changes).length === 0) return
      setState(previous => ({ ...previous, ...changes }))
    }
    channel.runAction = (action) => {
      // Dispatch is pure and runs only from a click handler; it decides the new
      // values, and the same channel that a Slider uses applies them.
      channel.patch(applyAction(action, hydration.defaults).patch)
    }
    return channel
  }, [hydration.defaults])
  // Saving is an effect, not part of the write: a drag fires many changes and
  // the store debounces them, so one transient render never costs a write per
  // pixel. A hydration that dropped anything also lands here, which is what
  // repairs a record left behind by an older program (ADR-006 step 10).
  useEffect(() => {
    if (stateKey === undefined) return
    persistState(stateKey, hydration, state)
  }, [stateKey, hydration, state])
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
 *
 * The session id is injected by the registration and is what gives the card a
 * durable state key. Without it a replayed card would still draw but would
 * persist nothing, because `sessionId + path` is the only identity a card may
 * be stored under (ADR-006).
 */
export function OpenUIToolView({
  block,
  callId,
  visualizeSession,
}: {
  readonly block: unknown
  readonly callId?: string | undefined
  readonly visualizeSession?: string | undefined
}): ReactNode {
  const meta = openuiMetaFrom(block)
  if (meta === undefined) {
    return createElement('div', { style: NOTICE_STYLE }, 'Intelligent UI · this call carries no readable program')
  }
  return createElement(OpenUICard, { meta, stateKey: stateKeyFor(meta, visualizeSession, callId) })
}

/**
 * The store key for a program card, or undefined when it has no durable
 * identity.
 *
 * A path-less or `streaming` card is not persisted: the streaming path is not
 * an identity, and using it as one would make every streaming card in a session
 * share a key. The HTML backend draws the same line for its preview.
 * @param meta - the program card.
 * @param session - the card's session id, when the host provides one.
 * @param callId - the producing call id.
 * @returns the key, or undefined.
 */
export function stateKeyFor(meta: OpenUIMeta, session: string | undefined, callId: string | undefined): string | undefined {
  if (session === undefined || session === '') return undefined
  if (meta.path === '' || meta.path === 'streaming') return undefined
  if (callId === undefined || callId === '') return undefined
  return cardStateKey(session, meta.path, callId)
}