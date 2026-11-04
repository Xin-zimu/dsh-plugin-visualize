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

import { createElement, isValidElement, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { openuiMetaFrom } from '../fragment.ts'
import type { OpenUIMeta } from '../fragment.ts'
import { parseProgram } from '../backends/openui/parse.ts'
import { evaluateProgram } from '../backends/openui/evaluate.ts'
import type { BindingDescriptor, EvaluationValue } from '../backends/openui/evaluate.ts'
import { COMPONENT_NAMES } from '../backends/openui/signatures.ts'
import { cardStateKey, cardStates } from './card-state.ts'
import {
  stated,
  svgLength,
  svgNumber,
  svgOpacity,
  svgPaint,
  svgPath,
  svgPoints,
  svgTransform,
  svgViewBox,
} from './openui-svg.ts'
import { placePopover, type Box, type PlacementResult } from './openui-popover.ts'
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
 *
 * `raw` is the argument list *before* the walker turned it into nodes. Almost no
 * component needs it, but `List` does: the language lets a list item be a
 * `ListItem` descriptor, and whether an entry names that component is a property
 * of the descriptor, not of the node it drew into. Without the raw list, `List`
 * can only see an already-built row and would wrap it in a second one.
 */
type Renderer = (
  props: readonly unknown[],
  write: WriteChannel,
  key: string,
  raw?: readonly EvaluationValue[],
) => ReactNode

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
  // The AA-safe supporting tier, added in 4A-2 after measuring it.
  //
  // `--muted-foreground` is the host's *tertiary* tier, and on white it measures
  // 3.71:1 — below AA (4.5:1) for text. 4A-1 chose tertiary over caption (2.13:1)
  // as an improvement and recorded the result; that choice is left alone here,
  // because Caption is a browser-verified 4A-1 component and this batch does not
  // get to silently restyle it.
  //
  // But 4A-2 adds a lot of small supporting text — the code language label, the
  // copy button, the list marker column, the quote citation and list
  // descriptions — and upstream used the *secondary* tier for exactly those roles
  // (layout-text.css: `.iui-lt-code__copy`, `.iui-lt-li__marker`,
  // `.iui-lt-quote__cite`, `.iui-lt-li__desc`). Secondary measures **5.8:1 on
  // white** and 12.11:1 on the dark surface, so it clears AA in both schemes.
  // Measured, not assumed: evidence/phase-4a-2/label-tiers-light.json.
  '--muted-foreground-strong': ['--dsw-alias-label-secondary', 'light-dark(rgb(26 28 31 / 68%), rgb(240 242 245 / 70%))'],
  '--border': ['--dsw-alias-border-l2', 'light-dark(rgb(0 0 0 / 10%), rgb(255 255 255 / 12%))'],
  // The hairline tier. The host publishes both `border-l1` and `border-l2`; the
  // language's `border: "l1"` names the fainter of the two, so it gets its own
  // declaration rather than reusing `--border` and silently meaning l2.
  '--border-subtle': ['--dsw-alias-border-l1', 'light-dark(rgb(0 0 0 / 8%), rgb(255 255 255 / 10%))'],
  '--card': ['--dsw-alias-bg-layer-2', 'light-dark(rgb(0 0 0 / 4%), rgb(255 255 255 / 6%))'],
  '--primary': ['--dsw-alias-brand-primary-new-colorprimary-new-color', 'light-dark(rgb(65 118 230), rgb(110 150 240))'],
  // The link colour, which is NOT `--primary`.
  //
  // `--primary` is the host's brand *surface* fill: it is designed to carry a
  // paired foreground (see `--primary-foreground`), not to be read as text. Used
  // for a 16px link it measures 4.23:1 on white — below AA's 4.5:1 — and 5.42:1
  // on the dark surface. Measured in both schemes:
  // evidence/phase-4a-2/link-colour-light.json and -dark.json.
  //
  // No single host token clears AA in *both* schemes: the brand token is too
  // light on white, and every static brand step (`--dsw-static-deepseek-600`,
  // `--dsw-static-blue-600`) is a fixed value that measures 3.39–3.53:1 on the
  // dark surface. So `--link` is declared directly as LINK_LITERAL below, for the
  // same reason as SERIES_4_LITERAL: a `var()` bridge here would *look* like it
  // read a host colour and silently return a failing contrast in one scheme,
  // which is D17/D18 again.
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
  // `Code` is the first component here that needs a mono stack. The frame
  // vocabulary's `--font-mono` does NOT exist in the host document, so bridging
  // to it would be D6/D7/D17/D18 a fourth time — a `var()` resolving to nothing
  // that still paints a plausible fallback. `--dsw-font-markdown-code-font-family`
  // is the host's own token for inline code, and it was measured to resolve to a
  // real mono stack on the live page, not assumed from its name. Evidence:
  // evidence/phase-4a-2/host-mono-tokens.json. The other two candidates that also
  // resolved (`--ds-font-family-code`, `--dsw-font-markdown-code-block-font-family`)
  // are the same stack; the inline-code one is chosen because `Code` renders a
  // block of what is visually the host's code text.
  '--font-mono': ['--dsw-font-markdown-code-font-family', 'ui-monospace, \'SF Mono\', Menlo, Consolas, monospace'],
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
 * The link colour, the second variable with no single host token behind it.
 *
 * `Link` is 16px text, so AA asks 4.5:1. The host's brand token clears that in
 * dark (5.42:1) and misses it on white (4.23:1); its static brand steps clear it
 * on white (5.39:1) and miss it on dark (3.39:1). No published token passes both,
 * so this is an explicit pair rather than a `var()` that would silently fail in
 * one scheme — see the note in {@link HOST_TOKENS}. Both values are drawn from
 * the host's own brand scale, one step deeper in light.
 *
 * Measured: evidence/phase-4a-2/link-colour-light.json (4.23 vs 5.39) and
 * evidence/phase-4a-2/link-colour-dark.json (5.42 vs 3.39).
 */
const LINK_LITERAL = 'light-dark(rgb(72 104 178), rgb(86 134 254))'

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
  // Same reasoning as above: no host token clears AA in both schemes, so the
  // value is declared rather than borrowed from one that would fail in one.
  style['--link'] = LINK_LITERAL
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
 * The only URL an activated `Link` may carry, or undefined.
 *
 * `Link` is the first component in this catalogue whose output the reader can
 * activate, and the card is mounted in the **host document** rather than inside
 * the HTML backend's sandboxed frame — so a `javascript:` href here would run in
 * the DSH host's own origin. The policy is ADR-008 and it is a positive,
 * closed list: an absolute `http:` or `https:` URL, and nothing else.
 *
 * The URL is **parsed**, not pattern-matched. A regex tests the shape of the
 * string while the browser tests what it will actually do, and where the two
 * disagree the disagreement resolves in the attacker's favour. Anything that
 * fails to parse, or parses to another scheme, degrades the component to plain
 * text — including `mailto:`, `tel:`, protocol-relative `//host/x`, relative
 * paths and fragments, all of which upstream's looser predicate admits.
 *
 * @param value - the raw `url` argument.
 * @returns the absolute http(s) URL, or undefined when it must not be a link.
 */
function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (raw === '') return undefined
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    // A relative path, a fragment, or junk: not an absolute URL at all.
    return undefined
  }
  // `new URL` lowercases the scheme, so this comparison is case-insensitive
  // without a regex — `JavaScript:` and `java\nscript:` both land here as a
  // scheme that is not http(s).
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : undefined
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
  // Argument order throughout the seven below is the signature table's, read
  // from `signatures.ts` rather than guessed: Label(text), Badge(text, color),
  // Link(text, url), List(items, marker, timeline),
  // ListItem(title, description, marker, children), Quote(text, cite),
  // Code(code, language).
  Label: (props, _write, key) => createElement(
    'div',
    {
      key,
      style: {
        fontSize: SIZES.sm,
        fontWeight: 500,
        lineHeight: 1.4,
        color: 'var(--foreground)',
        overflowWrap: 'anywhere',
      } satisfies CSSProperties,
    },
    text(props[0]),
  ),
  Badge: (props, _write, key) => {
    // Colour is carried by a dot plus a tinted fill, never by the text alone.
    // Upstream learned this the hard way: painting a text token as its own
    // background made the label invisible, and tinted text at 11px failed
    // contrast. Readable text first, colour second.
    const series = typeof props[1] === 'string' ? COLOR_VARS[props[1]] : undefined
    return createElement(
      'span',
      {
        key,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          maxWidth: '100%',
          padding: '1px 8px',
          fontSize: SIZES.xs,
          fontWeight: 500,
          lineHeight: 1.7,
          color: 'var(--foreground)',
          background: series === undefined
            ? 'var(--viz-grid)'
            : `color-mix(in oklab, ${series} 16%, transparent)`,
          borderRadius: 9999,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          verticalAlign: 'baseline',
        } satisfies CSSProperties,
      },
      series === undefined ? null : createElement('span', {
        key: 'dot',
        'aria-hidden': 'true',
        style: {
          flex: 'none',
          width: 6,
          height: 6,
          borderRadius: 9999,
          background: series,
        } satisfies CSSProperties,
      }),
      text(props[0]),
    )
  },
  Link: (props, _write, key) => {
    const label = text(props[0])
    const href = safeHref(props[1])
    // ADR-008: a target that is not an absolute http(s) URL degrades to the text
    // it would otherwise have shown. No href, no target, no handler — the
    // component is still drawn, so a reader sees the label and the policy is
    // visible rather than silent.
    if (href === undefined) {
      return createElement(
        'span',
        {
          key,
          style: { color: 'inherit', overflowWrap: 'anywhere' } satisfies CSSProperties,
        },
        label,
      )
    }
    return createElement(
      'a',
      {
        key,
        href,
        target: '_blank',
        // noreferrer as well as noopener: the opened page must not receive the
        // card's URL as a referrer, and must not be able to reach back through
        // `window.opener`.
        rel: 'noreferrer noopener',
        style: {
          color: 'var(--link)',
          textDecoration: 'none',
          overflowWrap: 'anywhere',
        } satisfies CSSProperties,
      },
      label,
    )
  },
  List: (props, _write, key, raw) => {
    const rawItems = Array.isArray(raw?.[0]) ? raw[0] : raw?.[0] === undefined || raw?.[0] === null ? [] : [raw[0]]
    const drawnItems = props[0]
    const items = Array.isArray(drawnItems) ? drawnItems : drawnItems === undefined || drawnItems === null ? [] : [drawnItems]
    const timeline = props[2] === true
    const marker = props[1] === undefined || props[1] === null ? 'bullet' : props[1]
    const shown = items.slice(0, MAX_LIST_ROWS)
    const rows = shown.map((item, index) =>
      // The *raw* descriptor decides whether this entry is a `ListItem`. A drawn
      // `ListItem` is already a complete row, so passing the node here made the
      // list wrap it in a second `role="listitem"` — the live card showed five
      // rows for four items, with the bullet row containing the check row.
      listEntryRow(item, rawItems[index], index, shown.length, marker, timeline))
    const list = createElement(
      'div',
      {
        key,
        role: 'list',
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: timeline ? 0 : 6,
          minWidth: 0,
        } satisfies CSSProperties,
      },
      rows,
    )
    if (items.length <= MAX_LIST_ROWS) return list
    // Say what was dropped. A list that silently ends early cannot be told apart
    // from one that was meant to be that length.
    return createElement(
      'div',
      { key, style: { display: 'flex', flexDirection: 'column', gap: 6, width: '100%', minWidth: 0 } satisfies CSSProperties },
      list,
      createElement('div', {
        key: 'truncated',
        role: 'note',
        style: { fontSize: SIZES.xs, color: 'var(--muted-foreground-strong)' } satisfies CSSProperties,
      }, `Showing ${MAX_LIST_ROWS} of ${items.length} items`),
    )
  },
  ListItem: (props, _write, key) => listRow(
    // title, description, marker, children.
    { title: text(props[0]), description: text(props[1]), children: children(props[3]) },
    markerNode(props[2], 0, false),
    false,
    false,
    key,
  ),
  Quote: (props, _write, key) => {
    const cite = props[1]
    return createElement(
      'blockquote',
      {
        key,
        style: {
          margin: 0,
          padding: '4px 0 4px 12px',
          borderLeftWidth: 2,
          borderLeftStyle: 'solid',
          borderLeftColor: 'var(--primary)',
          color: 'var(--foreground)',
          overflowWrap: 'anywhere',
        } satisfies CSSProperties,
      },
      createElement('div', { key: 'body' }, text(props[0])),
      cite === undefined || cite === null || cite === ''
        ? null
        : createElement('div', {
          key: 'cite',
          style: { marginTop: 4, fontSize: SIZES.sm, color: 'var(--muted-foreground-strong)' } satisfies CSSProperties,
        }, text(cite)),
    )
  },
  Code: (props, _write, key) => CodeView(props, key),
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

  // --- 4A-3: the rest of the Inputs group -----------------------------------
  //
  // Each renderer below follows the same shape, which is the loop the batch
  // exists to prove: read the bound slot's current value, draw a control that
  // shows it, and on interaction call `write(name, next)`. No renderer keeps its
  // own copy of a bound value, so there is nothing that can drift out of sync
  // with `$state`.

  Input: (props, write, key) => {
    const field = fieldOf(props[0])
    const type = text(props[2], 'text')
    const label = text(props[1], '')
    const placeholder = text(props[3], '')
    const emit = (raw: string): void => {
      // A `number` input writes a number, not the string the DOM gave us: the
      // program's own arithmetic (`$n + 1`) has to keep working, and a string
      // would turn every later `@Set($n, $n + 1)` into concatenation.
      const next = type === 'number'
        ? (raw === '' ? '' : Number(raw))
        : raw
      if (field.binding !== undefined) write(field.binding.name, next as EvaluationValue)
      // An unbound Input has nowhere to write; it renders what the program gave.
    }
    return createElement(
      'label',
      { key, style: FIELD_ROW_STYLE },
      label === '' ? null : createElement('span', { style: FIELD_LABEL_STYLE }, label),
      createElement('input', {
        type: type === 'number' ? 'number' : 'text',
        value: field.current === null || field.current === undefined ? '' : String(field.current),
        placeholder: placeholder === '' ? undefined : placeholder,
        disabled: field.binding === undefined,
        'aria-label': label === '' ? (placeholder === '' ? 'Input' : placeholder) : label,
        onChange: (event: { target: { value: string } }) => emit(event.target.value),
        style: {
          ...FIELD_STYLE,
          ...field.binding === undefined ? { opacity: 0.7 } : {},
        } satisfies CSSProperties,
      }),
    )
  },

  TextArea: (props, write, key) => {
    const field = fieldOf(props[0])
    const label = text(props[1], '')
    const placeholder = text(props[2], '')
    // Clamped: a program asking for 400 rows would push the card's own height
    // past the viewport and the fold would never settle.
    const rows = Math.min(24, Math.max(1, Math.round(num(arg(props[3], 4), 4))))
    return createElement(
      'label',
      { key, style: FIELD_ROW_STYLE },
      label === '' ? null : createElement('span', { style: FIELD_LABEL_STYLE }, label),
      createElement('textarea', {
        rows,
        value: field.current === null || field.current === undefined ? '' : String(field.current),
        placeholder: placeholder === '' ? undefined : placeholder,
        disabled: field.binding === undefined,
        'aria-label': label === '' ? (placeholder === '' ? 'Text' : placeholder) : label,
        onChange: (event: { target: { value: string } }) => {
          if (field.binding !== undefined) write(field.binding.name, event.target.value)
        },
        style: {
          ...FIELD_STYLE,
          resize: 'vertical',
          fontFamily: 'var(--font-sans)',
          lineHeight: 1.45,
          ...field.binding === undefined ? { opacity: 0.7 } : {},
        } satisfies CSSProperties,
      }),
    )
  },

  Select: (props, write, key, raw) => {
    const field = fieldOf(props[0])
    // From `raw`, not `props`: an option object is a plain object, and the
    // walker has already turned it into `null` by the time it reaches `props`.
    const options = optionList(raw?.[1])
    const label = text(props[2], '')
    const placeholder = text(props[3], '')
    const found = options.find(option => sameValue(option.value, field.current))
    // With a placeholder and no match, nothing is selected, which is what shows
    // the placeholder. Without one, the first option is the display value — the
    // program did not choose, but a bare `<select>` must show something.
    const current = found !== undefined
      ? String(found.value)
      : (placeholder !== '' || options.length === 0 ? '' : String(options[0]!.value))
    const items: ReactNode[] = []
    if (placeholder !== '') {
      items.push(createElement('option', { key: 'ph', value: '', disabled: true, hidden: true }, placeholder))
    }
    for (const [index, option] of options.entries()) {
      items.push(createElement('option', { key: `opt${index}`, value: String(option.value) }, option.label))
    }
    return createElement(
      'label',
      { key, style: FIELD_ROW_STYLE },
      label === '' ? null : createElement('span', { style: FIELD_LABEL_STYLE }, label),
      createElement(
        'select',
        {
          value: current,
          disabled: field.binding === undefined,
          'aria-label': label === '' ? (placeholder === '' ? 'Select' : placeholder) : label,
          onChange: (event: { target: { value: string } }) => {
            if (field.binding === undefined) return
            // Write the option's ORIGINAL value, not the string the DOM gave
            // back: an option declared as `{value: 1}` must write `1`, or the
            // program's `$pick == 1` stops being true after one click.
            const picked = options.find(option => sameValue(option.value, event.target.value))
            write(field.binding.name, (picked === undefined ? event.target.value : picked.value) as EvaluationValue)
          },
          style: {
            ...FIELD_STYLE,
            cursor: field.binding === undefined ? 'default' : 'pointer',
            ...field.binding === undefined ? { opacity: 0.7 } : {},
          } satisfies CSSProperties,
        },
        items,
      ),
      found?.description === undefined
        ? null
        : createElement(
          'span',
          { style: { fontSize: SIZES.xs, color: 'var(--muted-foreground-strong)', marginTop: 3 } },
          found.description,
        ),
    )
  },

  SegmentedControl: (props, write, key, raw) => {
    const field = fieldOf(props[0])
    const options = optionList(raw?.[1])
    const block = boolOf(props[2], false)
    const items = options.map((option, index) => {
      const active = sameValue(option.value, field.current)
      return createElement(
        'button',
        {
          key: `seg${index}`,
          type: 'button',
          role: 'radio',
          'aria-checked': active,
          title: option.description === undefined || option.description === '' ? undefined : option.description,
          // A segment whose control is unbound has nothing to write to; it still
          // draws, but pressing it would promise a change it cannot make.
          disabled: field.binding === undefined,
          onClick: field.binding === undefined || active
            ? undefined
            : () => write(field.binding!.name, option.value),
          style: {
            font: 'inherit',
            fontSize: SIZES.sm,
            flex: block ? '1 1 0' : '0 0 auto',
            padding: '4px 12px',
            cursor: field.binding === undefined ? 'default' : 'pointer',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: active ? 'var(--primary)' : 'var(--border)',
            borderRadius: 'calc(var(--radius) * 1.1)',
            background: active ? 'var(--primary)' : 'transparent',
            color: active ? 'var(--primary-foreground)' : 'var(--foreground)',
            minWidth: 0,
          } satisfies CSSProperties,
        },
        option.label,
      )
    })
    return createElement(
      'div',
      {
        key,
        role: 'radiogroup',
        'aria-label': 'Options',
        style: {
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 6,
          width: block ? '100%' : undefined,
          minWidth: 0,
        } satisfies CSSProperties,
      },
      items,
    )
  },

  Checkbox: (props, write, key) => {
    const field = fieldOf(props[0])
    const checked = boolOf(field.current, false)
    const label = text(props[1], '')
    const lineThrough = boolOf(props[2], false)
    const id = `${key}-cb`
    return createElement(
      'label',
      {
        key,
        htmlFor: id,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          fontSize: SIZES.sm,
          cursor: field.binding === undefined ? 'default' : 'pointer',
          color: 'var(--foreground)',
          minWidth: 0,
        } satisfies CSSProperties,
      },
      createElement('input', {
        id,
        type: 'checkbox',
        checked,
        disabled: field.binding === undefined,
        'aria-label': label === '' ? 'Checkbox' : label,
        onChange: (event: { target: { checked: boolean } }) => {
          // A checkbox writes a BOOLEAN. Upstream's `iuiBField` does the same;
          // a program that binds `$done` and then tests `@If($done, ...)`
          // depends on it, and `"true"` is truthy for the wrong reason.
          if (field.binding !== undefined) write(field.binding.name, event.target.checked)
        },
        style: { accentColor: 'var(--primary)', margin: 0, flex: '0 0 auto' } satisfies CSSProperties,
      }),
      createElement(
        'span',
        {
          style: {
            // `lineThrough` strikes the label only while checked — a to-do row
            // that stays struck after unticking would read as done.
            textDecoration: checked && lineThrough ? 'line-through' : undefined,
            color: checked ? 'var(--muted-foreground-strong)' : 'var(--foreground)',
            minWidth: 0,
          } satisfies CSSProperties,
        },
        label,
      ),
    )
  },

  RadioGroup: (props, write, key, raw) => {
    const field = fieldOf(props[0])
    const options = optionList(raw?.[1])
    const label = text(props[2], '')
    const cards = ['cards', 'card'].includes(text(props[3], '').toLowerCase())
    const groupName = `${key}-radio`
    const items = options.map((option, index) => {
      const active = sameValue(option.value, field.current)
      return createElement(
        'label',
        {
          key: `r${index}`,
          style: {
            display: 'flex',
            alignItems: cards ? 'flex-start' : 'center',
            gap: 7,
            padding: cards ? '8px 10px' : 0,
            cursor: field.binding === undefined ? 'default' : 'pointer',
            borderWidth: cards ? 1 : 0,
            borderStyle: 'solid',
            borderColor: active ? 'var(--primary)' : 'var(--border)',
            borderRadius: cards ? 'calc(var(--radius) * 1.2)' : 0,
            background: cards ? (active ? 'color-mix(in oklab, var(--primary) 10%, transparent)' : 'transparent') : undefined,
            minWidth: 0,
          } satisfies CSSProperties,
        },
        createElement('input', {
          type: 'radio',
          name: groupName,
          checked: active,
          disabled: field.binding === undefined,
          onChange: () => {
            if (field.binding !== undefined) write(field.binding.name, option.value)
          },
          style: { accentColor: 'var(--primary)', margin: 0, marginTop: cards ? 2 : 0, flex: '0 0 auto' } satisfies CSSProperties,
        }),
        createElement(
          'span',
          { style: { display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 } },
          createElement('span', { style: { fontSize: SIZES.sm, color: 'var(--foreground)' } }, option.label),
          option.description === undefined || option.description === ''
            ? null
            : createElement(
              'span',
              { style: { fontSize: SIZES.xs, color: 'var(--muted-foreground-strong)' } },
              option.description,
            ),
        ),
      )
    })
    return createElement(
      'div',
      { key, style: FIELD_ROW_STYLE },
      label === '' ? null : createElement('span', { style: FIELD_LABEL_STYLE }, label),
      createElement(
        'div',
        {
          role: 'radiogroup',
          'aria-label': label === '' ? 'Options' : label,
          style: {
            display: 'flex',
            flexDirection: cards ? 'row' : 'column',
            flexWrap: cards ? 'wrap' : 'nowrap',
            gap: cards ? 6 : 5,
            minWidth: 0,
          } satisfies CSSProperties,
        },
        items,
      ),
    )
  },

  DatePicker: (props, write, key) => {
    const field = fieldOf(props[0])
    const label = text(props[1], '')
    const min = props[2] === undefined || props[2] === null ? undefined : String(props[2])
    const max = props[3] === undefined || props[3] === null ? undefined : String(props[3])
    return createElement(
      'label',
      { key, style: FIELD_ROW_STYLE },
      label === '' ? null : createElement('span', { style: FIELD_LABEL_STYLE }, label),
      createElement('input', {
        type: 'date',
        value: field.current === null || field.current === undefined ? '' : String(field.current),
        min,
        max,
        disabled: field.binding === undefined,
        'aria-label': label === '' ? 'Date' : label,
        onChange: (event: { target: { value: string } }) => {
          if (field.binding !== undefined) write(field.binding.name, event.target.value)
        },
        style: {
          ...FIELD_STYLE,
          ...field.binding === undefined ? { opacity: 0.7 } : {},
        } satisfies CSSProperties,
      }),
    )
  },

  Timer: (props, write, key) => {
    const field = fieldOf(props[0])
    const current = Math.max(0, Math.round(num(field.current, 0)))
    return createElement(TimerControl, {
      key,
      remaining: current,
      bindingName: field.binding?.name,
      write,
      label: text(props[1], ''),
    })
  },

  Form: (props, _write, key) => createElement(
    'form',
    {
      key,
      // Never submits: this card is not a document, and a submit would navigate
      // the host pane away from the conversation.
      onSubmit: (event: { preventDefault: () => void }) => event.preventDefault(),
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
      } satisfies CSSProperties,
    },
    children(props[0]),
  ),

  IconButton: (props, write, key) => {
    const icon = text(props[0], '')
    const action = props[1]
    const label = text(props[2], '')
    const variant = text(props[3], 'ghost')
    // `icon` names a glyph. There is no icon set in this renderer yet (`Icon` is
    // 4A-4), so a named glyph is drawn as its own name in a bordered square —
    // visibly a placeholder rather than an empty button that looks broken.
    return createElement(
      'button',
      {
        key,
        type: 'button',
        title: label === '' ? undefined : label,
        'aria-label': label === '' ? (icon === '' ? 'button' : icon) : label,
        ...action === undefined || action === null ? {} : {
          onClick: () => write.runAction(action),
        },
        style: {
          font: 'inherit',
          fontSize: SIZES.sm,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 28,
          minHeight: 28,
          padding: '3px 7px',
          cursor: 'pointer',
          borderRadius: 'calc(var(--radius) * 1.2)',
          borderWidth: 1,
          borderStyle: 'solid',
          ...BUTTON_KINDS[variant] ?? BUTTON_KINDS.ghost,
        } satisfies CSSProperties,
      },
      icon === '' ? (label === '' ? '·' : label) : icon,
    )
  },

  Pressable: (props, write, key) => {
    const action = props[1]
    const selected = boolOf(props[2], false)
    const padding = arg(props[3], 3)
    const background = text(props[4], '')
    const interactive = action !== undefined && action !== null
    return createElement(
      'div',
      {
        key,
        ...interactive ? {
          role: 'button',
          tabIndex: 0,
          'aria-pressed': selected,
          onClick: () => write.runAction(action),
          // A div with role=button is not keyboard-operable unless it says so.
          // Enter and Space, because that is what a real button answers to.
          onKeyDown: (event: { key: string; preventDefault: () => void }) => {
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
              event.preventDefault()
              write.runAction(action)
            }
          },
        } : {},
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
          padding: space(padding, 3),
          borderRadius: 'calc(var(--radius) * 1.2)',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: selected ? 'var(--primary)' : 'var(--border)',
          background: background === ''
            ? (selected ? 'color-mix(in oklab, var(--primary) 12%, transparent)' : 'transparent')
            : (paintOf(background) ?? 'transparent'),
          cursor: interactive ? 'pointer' : 'default',
          minWidth: 0,
        } satisfies CSSProperties,
      },
      children(props[0]),
    )
  },

  // --- 4A-4: media and data -----------------------------------------------
  //
  // These four do not bind `$state`: none of them is an input, so none takes a
  // write channel. They are still pure functions of the descriptor, which is the
  // property the whole component table rests on.

  Icon: (props, _write, key) => {
    const name = text(props[0], '')
    const size = SIZE_OF_ICON[text(props[1], 'md')] ?? SIZE_OF_ICON.md!
    const paint = color(props[2]) ?? 'currentColor'
    // No icon set ships in this build (ADR-010 keeps the dependency tree closed,
    // and the same reasoning applies here). A named glyph is drawn as its own
    // name, which is honest and readable, rather than as an empty box that looks
    // like a rendering failure. Upgrading this to a real set is a substitution,
    // not a rewrite: the geometry and the contract stay.
    return createElement(
      'span',
      {
        key,
        role: 'img',
        'aria-label': name === '' ? 'icon' : name,
        'data-openui-icon': name,
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: size,
          minHeight: size,
          fontSize: `calc(${size} * 0.5)`,
          lineHeight: 1,
          color: paint,
          fontVariantNumeric: 'tabular-nums',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--border)',
          borderRadius: 'calc(var(--radius) * 0.6)',
          padding: 1,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        } satisfies CSSProperties,
      },
      name === '' ? '?' : name.slice(0, 2),
    )
  },

  Image: (props, _write, key) => {
    const src = text(props[0], '')
    const alt = text(props[1], '')
    const ratio = arg(props[2])
    const radius = arg(props[3])
    const fit = text(props[4], 'cover')
    const allowed = allowedImageUrl(src)
    const box: CSSProperties = {
      maxWidth: '100%',
      width: '100%',
      borderRadius: radius === undefined ? 'calc(var(--radius) * 1.2)' : space(radius, 0) + 'px',
      ...ratio === undefined ? {} : { aspectRatio: String(arg(ratio)) },
      overflow: 'hidden',
      display: 'block',
    }
    if (allowed === undefined) {
      // ADR-009: a refused src is never rendered as an <img>. The alt text and
      // the reason are shown instead, so the reader is told why rather than
      // shown a broken-image glyph.
      return createElement(ImageNotice, { key, alt, reason: imageRefusal(src), style: box })
    }
    return createElement(ImageFrame, { key, src: allowed, alt, fit, style: box })
  },

  Table: (props, _write, key, raw) => {
    // From `raw`, not `props`: a cell may be a component descriptor, and the
    // walker has already drawn it into a node by the time it reaches `props`.
    const columns = textList(raw?.[0] ?? props[0])
    const rows = rowList(raw?.[1] ?? props[1])
    if (columns.length === 0) return notice(key, 'Table has no columns')
    if (rows.length === 0) {
      // An empty table draws its header and says it is empty. A table with no
      // header at all is indistinguishable from a component that failed.
      return createElement(
        'table',
        { key, style: TABLE_STYLE, 'data-openui-table': 'empty' },
        createElement(TableHead, { columns }),
        createElement('tbody', null,
          createElement('tr', null,
            createElement('td', {
              colSpan: columns.length,
              style: { ...TABLE_CELL_STYLE, color: 'var(--muted-foreground)', fontStyle: 'italic' },
            }, 'no rows'),
          ),
        ),
      )
    }
    return createElement(
      'table',
      { key, style: TABLE_STYLE, 'data-openui-table': `${rows.length}x${columns.length}` },
      createElement(TableHead, { columns }),
      createElement('tbody', null, rows.map((cells, rowIndex) => createElement(
        'tr',
        { key: `r${rowIndex}`, style: rowIndex % 2 === 1 ? TABLE_ROW_ALT : undefined },
        columns.map((column, columnIndex) => createElement(
          'td',
          { key: `c${columnIndex}`, style: TABLE_CELL_STYLE },
          cellNode(cells[columnIndex]),
        )),
      ))),
    )
  },

  Chart: (props, _write, key, raw) => {
    const type = text(props[0], 'bar')
    const rows = rowObjects(raw?.[1] ?? props[1])
    const xName = typeof props[2] === 'string' && props[2] !== '' ? props[2] : undefined
    const seriesNames = textList(raw?.[3] ?? props[3])
    const format = text(props[4], 'number')
    const currency = text(props[5], '')
    const stacked = boolOf(props[6], false)
    const height = num(arg(props[7], 180), 180)
    return createElement(ChartView, {
      key, type, rows, xName, seriesNames, format, currency, stacked, height,
    })
  },

  // --- 4A-5: drawing ------------------------------------------------------
  //
  // Ten primitives under ADR-011. Every free-form string here is parsed and
  // re-serialised by src/client/openui-svg.ts before it reaches a DOM attribute,
  // and colour goes into `style` rather than a presentation attribute: a `var()`
  // inside an SVG attribute is not reliably resolved, and an unresolved paint is
  // a black shape on a dark card that no unit test can see.

  Svg: (props, _write, key) => {
    const viewBox = svgViewBox(props[1])
    if (viewBox === undefined) {
      // The one visible refusal in this group: with no readable viewBox there is
      // no drawing left to protect, so the component says why instead of drawing
      // a box that looks like a renderer failure (ADR-011 §10).
      return notice(key, 'Svg has no readable viewBox — expected four numbers with a positive width and height')
    }
    const natural = Number(viewBox.split(' ')[2])
    const width = length(props[2])
    const height = length(props[3])
    return createElement(
      'svg',
      {
        key,
        role: 'img',
        'aria-label': 'drawing, viewBox ' + viewBox,
        'data-openui-svg': 'root',
        viewBox,
        preserveAspectRatio: 'xMidYMid meet',
        ...width === undefined ? {} : { width },
        ...height === undefined ? {} : { height },
        style: {
          display: 'block',
          width: width ?? '100%',
          maxWidth: width !== undefined || !(natural > 0)
            ? undefined
            : Math.max(280, Math.round(natural * 1.5)) + 'px',
          ...height === undefined ? {} : { height },
          // Clipped to the viewBox, which is what keeps a drawing that exceeds
          // its own coordinate space inside the card (ADR-012's principle
          // applied to the drawing group).
          overflow: 'hidden',
        } satisfies CSSProperties,
      },
      children(props[0]),
    )
  },

  G: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const transform = stated(props[1]) ? svgTransform(props[1]) : undefined
    if (stated(props[1]) && transform === undefined) refs.list.push('transform')
    const alpha = svgOpacity(props[2])
    if (stated(props[2]) && alpha === undefined) refs.list.push('opacity')
    return createElement(
      'g',
      {
        key,
        ...transform === undefined ? {} : { transform },
        ...alpha === undefined ? {} : { style: { opacity: alpha } satisfies CSSProperties },
        ...refusedAttrs(refs.list),
      },
      children(props[0]),
    )
  },

  Circle: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const paint = drawingPaint({
      fill: props[3], stroke: props[4], strokeWidth: props[5], opacity: props[6], filled: true,
    })
    return createElement('circle', {
      key,
      cx: coordinate(props[0], 'cx', refs),
      cy: coordinate(props[1], 'cy', refs),
      r: extent(props[2], 'r', refs),
      style: paint.style,
      ...refusedAttrs([...refs.list, ...paint.refused]),
    })
  },

  Ellipse: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const paint = drawingPaint({
      fill: props[4], stroke: props[5], strokeWidth: props[6], opacity: props[7], filled: true,
    })
    return createElement('ellipse', {
      key,
      cx: coordinate(props[0], 'cx', refs),
      cy: coordinate(props[1], 'cy', refs),
      rx: extent(props[2], 'rx', refs),
      ry: extent(props[3], 'ry', refs),
      style: paint.style,
      ...refusedAttrs([...refs.list, ...paint.refused]),
    })
  },

  Rect: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const paint = drawingPaint({
      fill: props[4], stroke: props[5], strokeWidth: props[6], opacity: props[7], filled: true,
    })
    const radius = optionalExtent(props[8], 'rx', refs)
    return createElement('rect', {
      key,
      x: coordinate(props[0], 'x', refs),
      y: coordinate(props[1], 'y', refs),
      width: extent(props[2], 'width', refs),
      height: extent(props[3], 'height', refs),
      ...radius === undefined ? {} : { rx: radius },
      style: paint.style,
      ...refusedAttrs([...refs.list, ...paint.refused]),
    })
  },

  Line: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const paint = drawingPaint({
      fill: undefined, stroke: props[4], strokeWidth: props[5], opacity: props[6], filled: false,
    })
    return createElement('line', {
      key,
      x1: coordinate(props[0], 'x1', refs),
      y1: coordinate(props[1], 'y1', refs),
      x2: coordinate(props[2], 'x2', refs),
      y2: coordinate(props[3], 'y2', refs),
      style: paint.style,
      ...refusedAttrs([...refs.list, ...paint.refused]),
    })
  },

  Path: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const path = svgPath(props[0])
    if (path === undefined) refs.list.push('d')
    // A path is filled only when the author asked for a fill: upstream draws an
    // unfilled path as a stroked line, and a closed outline filled by default
    // would ink in shapes nobody meant to fill.
    const paint = drawingPaint({
      fill: props[1], stroke: props[2], strokeWidth: props[3], opacity: props[4],
      filled: false, declaredFill: stated(props[1]),
    })
    return createElement('path', {
      key,
      ...path === undefined ? {} : { d: path },
      style: paint.style,
      ...refusedAttrs([...refs.list, ...paint.refused]),
    })
  },

  Polyline: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const points = svgPoints(props[0])
    if (points === undefined) refs.list.push('points')
    const paint = drawingPaint({
      fill: props[3], stroke: props[1], strokeWidth: props[2], opacity: props[4],
      filled: false, declaredFill: stated(props[3]),
    })
    return createElement('polyline', {
      key,
      ...points === undefined ? {} : { points },
      style: paint.style,
      ...refusedAttrs([...refs.list, ...paint.refused]),
    })
  },

  Polygon: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const points = svgPoints(props[0])
    if (points === undefined) refs.list.push('points')
    const paint = drawingPaint({
      fill: props[1], stroke: props[2], strokeWidth: props[3], opacity: props[4], filled: true,
    })
    return createElement('polygon', {
      key,
      ...points === undefined ? {} : { points },
      style: paint.style,
      ...refusedAttrs([...refs.list, ...paint.refused]),
    })
  },

  SvgText: (props, _write, key) => {
    const refs: Refusals = { list: [] }
    const label = text(props[0], '')
    const size = svgLength(props[3])
    if (stated(props[3]) && size === undefined) refs.list.push('size')
    const paint = svgPaint(props[4], COLOR_VARS)
    if (stated(props[4]) && paint === undefined) refs.list.push('fill')
    const anchor = SVG_ANCHORS[text(props[5], 'start')] ?? 'start'
    const weight = SVG_WEIGHTS[text(props[6], 'normal')] ?? SVG_WEIGHTS.normal!
    return createElement(
      'text',
      {
        key,
        x: coordinate(props[1], 'x', refs),
        y: coordinate(props[2], 'y', refs),
        'data-openui-svg-text': '',
        textAnchor: anchor,
        style: {
          ...size === undefined ? {} : { fontSize: size },
          fill: paint ?? 'currentColor',
          fontWeight: weight,
        } satisfies CSSProperties,
        ...refusedAttrs(refs.list),
      },
      // A text child, never markup: React escapes it, and there is no innerHTML
      // route in this renderer at all (ADR-011 §9).
      label,
    )
  },

  // --- 4A-5: disclosure and play ------------------------------------------

  Carousel: (props, _write, key) => createElement(CarouselView, {
    key,
    items: itemList(props[0]),
    itemWidth: num(arg(props[1], 240), 240),
    gap: space(props[2], 3),
  }),

  Popover: (props, _write, key) => createElement(PopoverView, {
    key,
    trigger: props[0] as ReactNode,
    content: props[1] as ReactNode,
  }),

  Flashcard: (props, _write, key) => createElement(FlashcardView, {
    key,
    front: props[0] as ReactNode,
    back: props[1] as ReactNode,
    hint: text(props[2], ''),
  }),

  Celebration: (props, _write, key) => {
    // fieldOf, not boolOf: when the condition is a bare variable --
    // Celebration($done), which is the form the skill text shows -- the argument
    // arrives as a binding marker rather than a boolean. boolOf on that object
    // returns Boolean({...}), i.e. always true, so the component saw a constant
    // true and never observed the false-to-true transition it exists to fire on.
    //
    // Found in the 4A-5 browser run and reproduced against the real card, where a
    // burst never appeared while $done demonstrably moved to true. The unit test
    // that passed used the comparison form (Celebration($n == 1)), whose argument
    // is already a boolean, so the binding path was never exercised.
    const condition = fieldOf(props[0]).current
    return createElement(CelebrationView, { key, when: boolOf(condition, false) })
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

// --- 4A-3: the Inputs group -------------------------------------------------
//
// Eleven components, and the thing they have in common is the thing that can go
// wrong: every one of them is a *bidirectional* control. A Slider was the only
// bound input before this batch, so the state loop had been proven exactly once.
// These eleven reuse the same path — the card's `write` channel, the same
// `cardStates` store, the same hydrate-and-merge on load — and that reuse is the
// point of the batch. If a control here needed a second way to reach state, the
// loop would not be general and the batch would have failed even if all eleven
// drew something plausible.
//
// Two conventions are inherited from upstream (`upstream/dsh-intelligent-ui`,
// src/client/components/inputs-data.js) rather than invented:
//
//  - **Each component has exactly ONE binding slot**, and it is always the first
//    argument: `value` for the value controls, `checked` for `Checkbox`,
//    `seconds` for `Timer`. That is upstream's `IUI_B_BINDING_ARG` table. An
//    argument in any other position is a plain value, never written back.
//  - **An unbound control still renders and still works locally.** Upstream's
//    `iuiBField` keeps internal state when the first argument is not a `$var`;
//    it simply cannot feed the program. Refusing to draw would make a legal
//    program look broken, and silently writing nowhere would be worse — so an
//    unbound `Input` is a controlled element over a local value, and an unbound
//    `Checkbox` toggles itself.
//
// The one thing that is NOT inherited is the styling vocabulary: upstream ships
// a stylesheet, this renderer draws inline against the frame variables bridged
// on the card root, so every `var(--…)` below must be one of the names in
// {@link HOST_TOKENS} or {@link COLOR_VARS} — otherwise it is D6/D7/D17/D18
// again, a property that silently paints its fallback in the real host.

/**
 * The one argument a component writes back, per component.
 *
 * Upstream's `IUI_B_BINDING_ARG`, kept as a table rather than a per-renderer
 * rule so the convention is stated once and can be asserted in a test.
 */
const BINDING_ARG: Readonly<Record<string, string>> = {
  Input: 'value',
  TextArea: 'value',
  Select: 'value',
  SegmentedControl: 'value',
  Slider: 'value',
  RadioGroup: 'value',
  DatePicker: 'value',
  Checkbox: 'checked',
  Timer: 'seconds',
}

/** One normalised option, from either a bare string or an option object. */
interface Option {
  readonly value: EvaluationValue
  readonly label: string
  readonly description: string | undefined
}

/**
 * Normalise an `options` argument.
 *
 * The language accepts a bare string or `{value, label, description}`. A bare
 * string is its own value *and* its own label; an object with no `value` falls
 * back to its label, and with neither falls back to its index — upstream's rule,
 * and the reason a `Select` never has an unselectable row.
 *
 * Read from the **raw** argument list, not from the drawn one: `drawValue`
 * turns a plain object into `null`, so by the time a renderer sees `props[1]`
 * an option object has already been erased. `List` reads `raw` for the same
 * reason (a `ListItem` is a descriptor, not a node).
 * @param raw - the unevaluated argument.
 * @returns the options, in order.
 */
function optionList(raw: unknown): Option[] {
  const list = Array.isArray(raw) ? raw : (raw === undefined || raw === null ? [] : [raw])
  return list.map((item, index) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as { value?: EvaluationValue; label?: unknown; description?: unknown }
      const value = record.value !== undefined ? record.value : (record.label !== undefined ? record.label : index)
      return {
        value: value as EvaluationValue,
        label: text(record.label ?? value, String(index)),
        description: record.description === undefined || record.description === null
          ? undefined
          : text(record.description, ''),
      }
    }
    return { value: item as EvaluationValue, label: text(item, String(index)), description: undefined }
  })
}

/**
 * Compare an option value with the current value the way the language does.
 *
 * `Select`/`RadioGroup`/`SegmentedControl` options and `$state` values travel as
 * different JS types across a program (`1` vs `"1"` after a round-trip through a
 * `<select>`), so identity alone would fail to mark the active row — the defect
 * where a chosen option is stored but drawn as unchosen.
 * @param a - one value.
 * @param b - the other value.
 * @returns true when they mean the same choice.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === undefined || a === null || b === undefined || b === null) return false
  return String(a) === String(b)
}

/** Read a boolean argument, including the string forms the language allows. */
function boolOf(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'string') return value !== 'false' && value !== '0'
  return Boolean(value)
}

/**
 * The value an argument carries, whether or not it is bound.
 *
 * A bound argument arrives as the marker `bindingNode` produced, so reading it
 * literally would give the renderer an object instead of the value.
 * @param value - one component argument.
 * @returns the current value, and the binding when there is one.
 */
function fieldOf(value: unknown): { readonly current: EvaluationValue; readonly binding: Binding | undefined } {
  const binding = asBinding(value)
  if (binding !== undefined) return { current: binding.value, binding }
  return { current: value as EvaluationValue, binding: undefined }
}

/** Shared look of a text-like control: one box, one border, one focus colour. */
const FIELD_STYLE: CSSProperties = {
  font: 'inherit',
  fontSize: SIZES.sm,
  width: '100%',
  boxSizing: 'border-box',
  padding: '5px 9px',
  borderRadius: 'calc(var(--radius) * 1.1)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--border)',
  background: 'var(--card)',
  color: 'var(--foreground)',
  minWidth: 0,
}

/** The small caps-ish label above a field. */
const FIELD_LABEL_STYLE: CSSProperties = {
  fontSize: SIZES.xs,
  color: 'var(--muted-foreground-strong)',
  display: 'block',
  marginBottom: 3,
}

/** A field as a column: label, control, optional hint. */
const FIELD_ROW_STYLE: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 0,
  minWidth: 0,
}

/** Format seconds as `mm:ss`, upstream's clock format. */
function clock(total: unknown): string {
  const seconds = Math.max(0, Math.round(num(total, 0)))
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60
  return `${mm < 10 ? '0' : ''}${mm}:${ss < 10 ? '0' : ''}${ss}`
}

/**
 * The timer's countdown, which is the one input in this batch that changes state
 * without a gesture.
 *
 * It is a separate component so its `useState`/`useEffect` are instance-scoped:
 * a hook called inside the parent renderer would be attributed to whatever row
 * happened to draw it, and the row's hook order would then shift as the tree
 * changes (upstream's `iuiBHookHost` exists for the same reason).
 *
 * The countdown does not keep its own copy of the remaining time. Every tick
 * writes the bound variable through `write`, which re-evaluates the whole
 * program — so a `Text(@Format($left, ...))` elsewhere on the card counts down
 * with it, and a reload restores whatever it had reached. The only local state
 * is whether it is running, which is a property of this control and not of the
 * program.
 * @param props - the bound value, its name, the write channel and the label.
 * @returns the timer element.
 */
function TimerControl({
  remaining,
  bindingName,
  write,
  label,
}: {
  readonly remaining: number
  readonly bindingName: string | undefined
  readonly write: WriteChannel
  readonly label: string
}): ReactNode {
  const [running, setRunning] = useState(false)
  // The total the bar is measured against. Captured on the first paint and kept:
  // reading it from `remaining` would make the bar jump back to full after the
  // first tick, and reading it from the program is not possible from here.
  const initial = useRef(Math.max(1, remaining))
  if (remaining > initial.current) initial.current = Math.max(1, remaining)

  // Refs, not dependencies: the interval must not be torn down and rebuilt on
  // every tick, and `write` is a new function whenever the card re-renders.
  const latest = useRef({ remaining, bindingName, write })
  latest.current = { remaining, bindingName, write }

  useEffect(() => {
    if (!running) return undefined
    const id = setInterval(() => {
      const state = latest.current
      if (state.bindingName === undefined) { setRunning(false); return }
      const next = Math.max(0, Math.round(state.remaining) - 1)
      state.write(state.bindingName, next)
      if (next <= 0) setRunning(false)
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  const ratio = Math.max(0, Math.min(100, (remaining / Math.max(1, initial.current)) * 100))
  const disabled = bindingName === undefined
  const reset = (): void => {
    setRunning(false)
    if (bindingName !== undefined) write(bindingName, Math.max(0, Math.round(initial.current)))
  }
  const toggle = (): void => {
    if (disabled) return
    if (running) { setRunning(false); return }
    // Starting from zero restarts from the captured total, not from zero —
    // otherwise the one button that could restart a finished timer does nothing.
    if (remaining <= 0) write(bindingName!, Math.max(0, Math.round(initial.current)))
    setRunning(true)
  }

  const buttonStyle = (kind: CSSProperties): CSSProperties => ({
    font: 'inherit',
    fontSize: SIZES.sm,
    padding: '4px 12px',
    cursor: disabled ? 'default' : 'pointer',
    borderRadius: 'calc(var(--radius) * 1.2)',
    borderWidth: 1,
    borderStyle: 'solid',
    ...kind,
  })

  return createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 } satisfies CSSProperties },
    createElement(
      'div',
      { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
      label === ''
        ? null
        : createElement('span', { style: { fontSize: SIZES.xs, color: 'var(--muted-foreground-strong)' } }, label),
      createElement(
        'span',
        {
          role: 'timer',
          // Tabular figures: a countdown that reflows its own width every second
          // makes the whole card twitch.
          style: {
            fontSize: SIZES.lg,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--foreground)',
            marginLeft: 'auto',
          } satisfies CSSProperties,
        },
        clock(remaining),
      ),
    ),
    createElement(
      'div',
      {
        role: 'progressbar',
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(ratio),
        'aria-valuetext': clock(remaining),
        'aria-label': label === '' ? 'Timer' : label,
        style: { height: 6, borderRadius: 999, background: 'var(--viz-grid)', overflow: 'hidden' } satisfies CSSProperties,
      },
      createElement('span', {
        style: {
          display: 'block',
          height: '100%',
          width: `${ratio}%`,
          background: 'var(--primary)',
          transition: 'width 0.9s linear',
        } satisfies CSSProperties,
      }),
    ),
    createElement(
      'div',
      { style: { display: 'flex', gap: 8 } },
      createElement(
        'button',
        { type: 'button', onClick: toggle, disabled, style: buttonStyle(BUTTON_KINDS.secondary!) },
        running ? 'Pause' : 'Start',
      ),
      createElement(
        'button',
        { type: 'button', onClick: reset, disabled, style: buttonStyle(BUTTON_KINDS.ghost!) },
        'Reset',
      ),
    ),
  )
}


// --- 4A-4 helpers: media and data -----------------------------------------

/** Icon box sizes, so `size` stays a name rather than an arbitrary number. */
const SIZE_OF_ICON: Readonly<Record<string, string>> = {
  sm: '1rem',
  md: '1.25rem',
  lg: '1.75rem',
  xl: '2.5rem',
}

/**
 * The URL an `Image` may load, or `undefined` when the scheme is refused.
 *
 * ADR-009: the allowlist is positive and closed, and the URL is *parsed* rather
 * than pattern-matched — a regex tests the shape of the string while the browser
 * tests what it will do, and the two disagree exactly where it matters
 * (`java\nscript:`, ` JavaScript:`). ADR-008 made the same call for `Link`.
 * @param src - the `src` argument as written.
 * @returns the parsed href, or undefined when it must not be loaded.
 */
function allowedImageUrl(src: string): string | undefined {
  if (src === '') return undefined
  let parsed: URL
  try {
    parsed = new URL(src)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  return parsed.href
}

/**
 * Why an `Image` src was refused, in words a reader can act on.
 * @param src - the refused `src`.
 * @returns one short sentence.
 */
function imageRefusal(src: string): string {
  if (src === '') return 'no src given'
  try {
    const parsed = new URL(src)
    return `${parsed.protocol} is not an allowed scheme (http or https only)`
  } catch {
    return 'not an absolute http or https URL'
  }
}

/** Read a list of strings from a raw argument, dropping non-strings. */
function textList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map(item => (typeof item === 'string' ? item : '')).filter(item => item !== '')
}

/**
 * Read `rows` for a `Table`: one array of cell descriptors per row.
 *
 * A row that is not an array is skipped rather than rendered as a single
 * mystery cell; the count of what was actually drawn is what the tests assert.
 */
function rowList(raw: unknown): unknown[][] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((row): row is unknown[] => Array.isArray(row))
    .map(row => [...row])
}

/**
 * Read `data` for a `Chart`: plain row objects, as ADR-010 specifies.
 *
 * The language turns an object argument into a descriptor before it reaches
 * `props`, so this reads from `raw`. A non-object row is dropped, because a
 * chart drawn from a mystery value would be a lie about the data.
 */
function rowObjects(raw: unknown): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return []
  const out: Record<string, unknown>[] = []
  for (const row of raw) {
    if (row === null || typeof row !== 'object' || Array.isArray(row)) continue
    out.push(row as Record<string, unknown>)
  }
  return out
}

/** A cell may already be a rendered node, or a plain scalar. */
function cellNode(value: unknown): ReactNode {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value as ReactNode[]
  return value as ReactNode
}

/** A quiet, stated refusal — the shape 4A-1 established for an undrawable part. */
function notice(key: string, message: string): ReactNode {
  return createElement('div', {
    key,
    role: 'status',
    'data-openui-notice': message,
    style: NOTICE_STYLE,
  }, message)
}

const TABLE_STYLE: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: SIZES.sm,
  color: 'var(--foreground)',
  display: 'table',
  tableLayout: 'auto',
}

const TABLE_CELL_STYLE: CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  borderBottomWidth: 1,
  borderBottomStyle: 'solid',
  borderBottomColor: 'var(--border)',
  // Long data truncates rather than pushing the card wider than the pane.
  maxWidth: 320,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  verticalAlign: 'top',
}

const TABLE_ROW_ALT: CSSProperties = {
  background: 'var(--viz-grid)',
}

/** The header row of a `Table`. */
function TableHead({ columns }: { readonly columns: readonly string[] }): ReactNode {
  return createElement('thead', null, createElement('tr', null, columns.map((column, index) => createElement(
    'th',
    {
      key: `h${index}`,
      scope: 'col',
      style: {
        ...TABLE_CELL_STYLE,
        fontWeight: 600,
        color: 'var(--foreground)',
        borderBottomColor: 'var(--border)',
      } satisfies CSSProperties,
    },
    column,
  ))))
}

/** An image that could not be used, saying why instead of showing a broken icon. */
function ImageNotice({
  alt, reason, style,
}: { readonly alt: string; readonly reason: string; readonly style: CSSProperties }): ReactNode {
  return createElement(
    'div',
    {
      role: 'img',
      'aria-label': alt === '' ? 'image' : alt,
      'data-openui-image': 'refused',
      style: {
        ...style,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        minHeight: 64,
        padding: 10,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'var(--border)',
        background: 'var(--viz-grid)',
        color: 'var(--muted-foreground-strong)',
        fontSize: SIZES.xs,
        textAlign: 'center',
      } satisfies CSSProperties,
    },
    createElement('span', { style: { fontWeight: 500 } }, alt === '' ? 'image' : alt),
    createElement('span', null, reason),
  )
}

/**
 * An allowed image, with the loading contract ADR-009 sets out.
 *
 * `loading=lazy` and `decoding=async` keep a card with many images from blocking
 * the conversation paint; `referrerPolicy=no-referrer` stops the host leaking the
 * console URL to a third-party host. A failed load degrades to the same visible
 * refusal a rejected scheme gets, because a broken-image glyph explains nothing.
 */
function ImageFrame({
  src, alt, fit, style,
}: { readonly src: string; readonly alt: string; readonly fit: string; readonly style: CSSProperties }): ReactNode {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return createElement(ImageNotice, { alt, reason: 'the image could not be loaded', style })
  }
  return createElement('img', {
    src,
    alt: alt === '' ? 'image' : alt,
    loading: 'lazy',
    decoding: 'async',
    referrerPolicy: 'no-referrer',
    'data-openui-image': 'loaded',
    onError: () => setFailed(true),
    style: {
      ...style,
      objectFit: fit === 'contain' ? 'contain' : 'cover',
    } satisfies CSSProperties,
  })
}


/** Series colours, in the order a chart assigns them. */
const SERIES_VARS: readonly string[] = [
  'var(--viz-series-1)',
  'var(--viz-series-2)',
  'var(--viz-series-3)',
  'var(--viz-series-4)',
  'var(--viz-series-5)',
]

/** One resolved series: its name, its colour, and its numeric points. */
interface ChartSeries {
  readonly name: string
  readonly color: string
  readonly values: readonly (number | null)[]
}

/**
 * Read the series out of the rows, following ADR-010.
 *
 * `seriesNames` wins when given; otherwise every key that holds at least one
 * finite number becomes a series, in first-seen order. A value that is not a
 * finite number becomes a `null` gap rather than a zero: coerce it and the chart
 * claims a reading that does not exist.
 */
function chartSeries(
  rows: readonly Record<string, unknown>[],
  xName: string | undefined,
  seriesNames: readonly string[],
): ChartSeries[] {
  let names = [...seriesNames]
  if (names.length === 0) {
    const seen: string[] = []
    for (const row of rows) {
      for (const [key, value] of Object.entries(row)) {
        if (key === xName) continue
        if (seen.includes(key)) continue
        if (typeof value === 'number' && Number.isFinite(value)) seen.push(key)
      }
    }
    names = seen
  }
  return names.map((name, index) => ({
    name,
    color: SERIES_VARS[index % SERIES_VARS.length]!,
    values: rows.map(row => {
      const value = row[name]
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    }),
  }))
}

/** Format one number for a label or an axis tick. */
function formatValue(value: number, format: string, currency: string): string {
  if (format === 'percent') return `${Math.round(value * 100) / 100}%`
  if (format === 'currency') return `${currency === '' ? '$' : currency}${Math.round(value * 100) / 100}`
  if (Math.abs(value) >= 1000) return value.toLocaleString()
  return String(Math.round(value * 100) / 100)
}

/**
 * Draw a chart from row objects, as inline SVG.
 *
 * ADR-010 decides the shape and, just as importantly, what happens when the data
 * cannot be drawn: a stated refusal is rendered as visible text, never an empty
 * box. SVG rather than Canvas for a reason the project needs — every bar, point
 * and slice is a countable element, so a test asserts *how many* were drawn
 * instead of that a shape exists (`AGENTS.md` §6, the D20 lesson).
 */
function ChartView({
  type, rows, xName, seriesNames, format, currency, stacked, height,
}: {
  readonly type: string
  readonly rows: readonly Record<string, unknown>[]
  readonly xName: string | undefined
  readonly seriesNames: readonly string[]
  readonly format: string
  readonly currency: string
  readonly stacked: boolean
  readonly height: number
}): ReactNode {
  // ADR-010: an unknown type falls back to bar, like every other enum here.
  const kind = CHART_TYPES.has(type) ? type : 'bar'

  if (rows.length === 0) return notice('chart', 'Chart has no data')

  const series = chartSeries(rows, xName, seriesNames)
  if (series.length === 0) return notice('chart', 'Chart found no numeric series')

  const empty = series.filter(item => item.values.every(value => value === null))
  if (empty.length === series.length) {
    return notice('chart', `Chart series ${series.map(item => `\"${item.name}\"`).join(', ')} has no numeric values`)
  }

  // A pie or donut is one series by definition; saying so is more useful than
  // silently drawing one ring and dropping the rest.
  const radial = kind === 'pie' || kind === 'donut'
  if (radial && series.length > 1) {
    return notice('chart', `Chart type ${kind} takes one series; ${series.length} were given`)
  }

  const categories = rows.map((row, index) => {
    if (xName === undefined) return String(index + 1)
    const value = row[xName]
    return value === undefined || value === null ? String(index + 1) : String(value)
  })

  // Gaps are drawn as gaps and counted in a notice, so a reader can tell a
  // missing reading from a zero.
  const gapCount = series.reduce(
    (total, item) => total + item.values.filter(value => value === null).length, 0,
  )
  const gapNote = gapCount === 0
    ? null
    : createElement('div', {
      role: 'status',
      'data-openui-notice': 'gaps',
      style: { ...NOTICE_STYLE, marginTop: 6 },
    }, `${gapCount} value${gapCount === 1 ? '' : 's'} could not be read as a number and ${gapCount === 1 ? 'is' : 'are'} shown as a gap`)

  const chart = radial
    ? createElement(RadialChart, { kind, categories, series: series[0]!, format, currency, height })
    : createElement(AxisChart, { kind, categories, series, format, currency, stacked, height })

  return createElement(
    'div',
    {
      role: 'group',
      'aria-label': `Chart, ${kind}, ${series.length} series`,
      'data-openui-chart': kind,
      style: { display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' } satisfies CSSProperties,
    },
    chart,
    createElement(ChartLegend, { series, radial: series.length === 1 && radial }),
    gapNote,
  )
}

const CHART_TYPES: ReadonlySet<string> = new Set(['bar', 'line', 'area', 'pie', 'donut', 'scatter'])


const CHART_PAD = { top: 10, right: 10, bottom: 22, left: 40 }

/** A bar / line / area / scatter chart on two axes. */
function AxisChart({
  kind, categories, series, format, currency, stacked, height,
}: {
  readonly kind: string
  readonly categories: readonly string[]
  readonly series: readonly ChartSeries[]
  readonly format: string
  readonly currency: string
  readonly stacked: boolean
  readonly height: number
}): ReactNode {
  const W = 640
  const H = Math.max(80, Math.min(520, Math.round(height)))
  const plotW = W - CHART_PAD.left - CHART_PAD.right
  const plotH = H - CHART_PAD.top - CHART_PAD.bottom

  // Stacking sums per category; otherwise the extent is over every value.
  const perCategory = categories.map((_, index) => stacked
    ? series.reduce((sum, item) => sum + (item.values[index] ?? 0), 0)
    : 0)
  const flat = series.flatMap(item => item.values.filter((value): value is number => value !== null))
  const candidates = stacked ? [...flat, ...perCategory] : flat
  const max = candidates.length === 0 ? 1 : Math.max(...candidates, 0)
  const min = Math.min(...(candidates.length === 0 ? [0] : candidates), 0)
  const span = max - min === 0 ? 1 : max - min

  const yOf = (value: number): number => CHART_PAD.top + plotH - ((value - min) / span) * plotH
  const bandW = plotW / Math.max(1, categories.length)
  const xOf = (index: number): number => CHART_PAD.left + bandW * (index + 0.5)

  const ticks = [0, 0.25, 0.5, 0.75, 1].map(part => min + span * part)

  const grid = ticks.map((tick, index) => createElement('g', { key: `g${index}` },
    createElement('line', {
      x1: CHART_PAD.left, x2: W - CHART_PAD.right,
      y1: yOf(tick), y2: yOf(tick),
      stroke: 'var(--border)',
      strokeWidth: 1,
      shapeRendering: 'crispEdges',
    }),
    createElement('text', {
      x: CHART_PAD.left - 6, y: yOf(tick) + 3,
      textAnchor: 'end',
      fontSize: 10,
      fill: 'var(--muted-foreground-strong)',
    }, formatValue(tick, format, currency)),
  ))

  const axisLabels = categories.map((category, index) => createElement('text', {
    key: `x${index}`,
    x: xOf(index), y: H - 6,
    textAnchor: 'middle',
    fontSize: 10,
    fill: 'var(--muted-foreground-strong)',
  }, category.length > 8 ? `${category.slice(0, 7)}…` : category))

  const marks: ReactNode[] = []
  series.forEach((item, seriesIndex) => {
    if (kind === 'bar') {
      const barW = stacked
        ? bandW * 0.6
        : (bandW * 0.7) / Math.max(1, series.length)
      item.values.forEach((value, index) => {
        if (value === null) return
        const base = stacked
          ? series.slice(0, seriesIndex).reduce((sum, previous) => sum + (previous.values[index] ?? 0), 0)
          : 0
        const top = yOf(base + value)
        const bottom = yOf(base)
        marks.push(createElement('rect', {
          key: `b${seriesIndex}-${index}`,
          'data-chart-mark': 'bar',
          x: stacked ? xOf(index) - barW / 2 : xOf(index) - (bandW * 0.7) / 2 + seriesIndex * barW,
          y: Math.min(top, bottom),
          width: barW,
          height: Math.max(1, Math.abs(bottom - top)),
          fill: item.color,
          rx: 2,
        }))
      })
      return
    }
    if (kind === 'scatter') {
      item.values.forEach((value, index) => {
        if (value === null) return
        marks.push(createElement('circle', {
          key: `s${seriesIndex}-${index}`,
          'data-chart-mark': 'point',
          cx: xOf(index), cy: yOf(value), r: 3.5,
          fill: item.color,
        }))
      })
      return
    }
    // line and area share the path; area adds a filled region underneath.
    const points = item.values
      .map((value, index) => (value === null ? undefined : { x: xOf(index), y: yOf(value) }))
      .filter((point): point is { x: number; y: number } => point !== undefined)
    if (points.length === 0) return
    const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
    if (kind === 'area') {
      const base = yOf(min)
      marks.push(createElement('path', {
        key: `a${seriesIndex}`,
        'data-chart-mark': 'area',
        d: `${path} L${points[points.length - 1]!.x},${base} L${points[0]!.x},${base} Z`,
        fill: item.color,
        opacity: 0.18,
      }))
    }
    marks.push(createElement('path', {
      key: `l${seriesIndex}`,
      'data-chart-mark': 'line',
      d: path,
      fill: 'none',
      stroke: item.color,
      strokeWidth: 2,
      strokeLinejoin: 'round',
      strokeLinecap: 'round',
    }))
    // A single point would otherwise draw nothing visible on a line chart.
    if (points.length === 1) {
      marks.push(createElement('circle', {
        key: `p${seriesIndex}`,
        'data-chart-mark': 'point',
        cx: points[0]!.x, cy: points[0]!.y, r: 3.5,
        fill: item.color,
      }))
    }
  })

  return createElement(
    'svg',
    {
      role: 'img',
      'aria-label': `${kind} chart, ${categories.length} categories`,
      viewBox: `0 0 ${W} ${H}`,
      width: '100%',
      height: H,
      preserveAspectRatio: 'xMidYMid meet',
      style: { display: 'block', maxWidth: '100%', overflow: 'visible' } satisfies CSSProperties,
    },
    grid,
    axisLabels,
    marks,
  )
}

/** A pie or donut: one series, one slice per category. */
function RadialChart({
  kind, categories, series, format, currency, height,
}: {
  readonly kind: string
  readonly categories: readonly string[]
  readonly series: ChartSeries
  readonly format: string
  readonly currency: string
  readonly height: number
}): ReactNode {
  const size = Math.max(100, Math.min(320, Math.round(height)))
  const center = size / 2
  const radius = center - 4
  const inner = kind === 'donut' ? radius * 0.58 : 0
  const values = series.values.map(value => (value === null || value < 0 ? 0 : value))
  const total = values.reduce((sum, value) => sum + value, 0)

  if (total <= 0) return notice('chart', 'Chart has nothing to divide into slices')

  let angle = -Math.PI / 2
  const slices = values.map((value, index) => {
    const sweep = (value / total) * Math.PI * 2
    const start = angle
    const end = angle + sweep
    angle = end
    const point = (at: number, r: number): string => `${center + Math.cos(at) * r},${center + Math.sin(at) * r}`
    // A full circle cannot be drawn as one arc: start and end coincide.
    const d = sweep >= Math.PI * 2 - 0.0001
      ? `M${center},${center - radius} A${radius},${radius} 0 1 1 ${center},${center + radius} A${radius},${radius} 0 1 1 ${center},${center - radius} Z`
      : [
        `M${point(start, radius)}`,
        `A${radius},${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(end, radius)}`,
        inner > 0 ? `L${point(end, inner)}` : `L${center},${center}`,
        inner > 0
          ? `A${inner},${inner} 0 ${sweep > Math.PI ? 1 : 0} 0 ${point(start, inner)}`
          : '',
        'Z',
      ].filter(part => part !== '').join(' ')
    return createElement('path', {
      key: `slice${index}`,
      'data-chart-mark': 'slice',
      'data-chart-slice': categories[index] ?? String(index + 1),
      d,
      fill: SERIES_VARS[index % SERIES_VARS.length]!,
      stroke: 'var(--background)',
      strokeWidth: 1,
    })
  })

  return createElement(
    'svg',
    {
      role: 'img',
      'aria-label': `${kind} chart, ${categories.length} slices`,
      viewBox: `0 0 ${size} ${size}`,
      width: size,
      height: size,
      style: { display: 'block', maxWidth: '100%' } satisfies CSSProperties,
    },
    slices,
  )
}

/** The legend, drawn from series names so a reader can map colour to label. */
function ChartLegend({
  series, radial,
}: { readonly series: readonly ChartSeries[]; readonly radial: boolean }): ReactNode {
  if (radial) return null
  if (series.length <= 1) return null
  return createElement(
    'div',
    {
      style: {
        display: 'flex', flexWrap: 'wrap', gap: 10,
        marginTop: 6, fontSize: SIZES.xs, color: 'var(--muted-foreground-strong)',
      } satisfies CSSProperties,
    },
    series.map((item, index) => createElement(
      'span',
      { key: `lg${index}`, 'data-chart-legend': item.name, style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
      createElement('span', {
        'aria-hidden': 'true',
        style: { width: 8, height: 8, borderRadius: 2, background: item.color, display: 'inline-block' },
      }),
      item.name,
    )),
  )
}

/**
 * A horizontally scrolling, snapping row — `Carousel`.
 *
 * The scroll state is local and transient: it is not `$state`, it is not
 * persisted, and a reload starts at the first item. That is the same line
 * `Popover` draws for its open flag (ADR-012 §6), and it is drawn deliberately
 * rather than by omission.
 */
function CarouselView({
  items,
  itemWidth,
  gap,
}: {
  readonly items: readonly ReactNode[]
  readonly itemWidth: number
  readonly gap: number
}): ReactNode {
  const track = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const width = Math.min(640, Math.max(80, Math.round(itemWidth)))
  const count = items.length

  // The effect key is the item count, not the items: re-running on every render
  // would detach and reattach the listener whenever state elsewhere in the card
  // changed. The cleanup is the only place the listener is removed.
  useEffect(() => {
    const element = track.current
    if (element === null) return undefined
    const read = (): void => {
      const start = element.scrollLeft < 4
      const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 4
      setEdges(previous => (previous.start === start && previous.end === end ? previous : { start, end }))
    }
    read()
    element.addEventListener('scroll', read, { passive: true })
    return () => element.removeEventListener('scroll', read)
  }, [count])

  const page = (direction: number): void => {
    const element = track.current
    if (element === null) return
    element.scrollBy({ left: direction * element.clientWidth * 0.85, behavior: 'smooth' })
  }

  const navStyle: CSSProperties = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    width: 26,
    height: 26,
    borderRadius: 999,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
    background: 'var(--background)',
    color: 'var(--foreground)',
    cursor: 'pointer',
    fontSize: SIZES.sm,
    lineHeight: 1,
    padding: 0,
  }

  return createElement(
    'div',
    { style: { position: 'relative', minWidth: 0, maxWidth: '100%' } satisfies CSSProperties },
    createElement(
      'div',
      {
        ref: track,
        'data-openui-carousel': 'track',
        // A scroll container is not focusable by default, and a keyboard user
        // cannot reach its hidden items without a focus stop. `tabIndex` alone
        // is what makes the arrow keys scroll it.
        tabIndex: 0,
        role: 'group',
        'aria-label': 'carousel, ' + count + ' items',
        style: {
          display: 'flex',
          gap,
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x mandatory',
          paddingBottom: 4,
          maxWidth: '100%',
        } satisfies CSSProperties,
      },
      items.map((item, index) => createElement(
        'div',
        {
          key: 'item' + index,
          'data-openui-carousel': 'item',
          style: { flex: '0 0 auto', width, scrollSnapAlign: 'start', minWidth: 0 } satisfies CSSProperties,
        },
        item,
      )),
    ),
    edges.start ? null : createElement('button', {
      type: 'button',
      'aria-label': 'Previous',
      'data-openui-carousel': 'prev',
      onClick: () => page(-1),
      style: { ...navStyle, left: 2 },
    }, '‹'),
    edges.end ? null : createElement('button', {
      type: 'button',
      'aria-label': 'Next',
      'data-openui-carousel': 'next',
      onClick: () => page(1),
      style: { ...navStyle, right: 2 },
    }, '›'),
  )
}

/**
 * An inline, non-modal disclosure — `Popover`, under ADR-012.
 *
 * No portal, no `position: fixed`, no focus trap. The panel is absolutely
 * positioned inside the card, and its position comes from the pure function in
 * `openui-popover.ts` so the containment arithmetic is tested without a layout
 * engine and the browser run confirms the wiring rather than discovering the
 * maths.
 *
 * The one thing that is easy to get wrong and is therefore called out: the
 * listeners below are attached **only while open** and removed in the effect's
 * cleanup, which is the single place they are removed. The 4A-3 `Timer` lesson
 * is that a component acquiring a global resource must show where it releases it.
 */
function PopoverView({ trigger, content }: {
  readonly trigger: ReactNode
  readonly content: ReactNode
}): ReactNode {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<PlacementResult | undefined>(undefined)
  const anchor = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const measure = useCallback((): void => {
    const anchorElement = anchor.current
    const triggerElement = button.current
    const panelElement = panel.current
    if (anchorElement === null || triggerElement === null) return
    const cardElement = anchorElement.closest('[data-openui-card]')
    const card = cardElement?.getBoundingClientRect()
    const boxOf = (rect: DOMRect): Box => ({
      left: rect.left, top: rect.top, width: rect.width, height: rect.height,
    })
    const panelRect = panelElement?.getBoundingClientRect()
    const next = placePopover({
      // No card ancestor means this is not inside a card at all (a unit test, a
      // page-mode render): fall back to the viewport so the panel still lands
      // somewhere sensible instead of at a zero-sized origin.
      card: card === undefined
        ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
        : boxOf(card),
      trigger: boxOf(triggerElement.getBoundingClientRect()),
      anchor: boxOf(anchorElement.getBoundingClientRect()),
      panel: panelRect === undefined || panelRect.width === 0
        // First paint: the panel has no measured size yet. An estimate is
        // better than a zero, because a zero always reports "fits below".
        ? { left: 0, top: 0, width: Math.max(120, triggerElement.offsetWidth), height: 120 }
        : boxOf(panelRect),
    })
    setPlacement(previous => (previous !== undefined
      && previous.placement === next.placement
      && Math.abs(previous.left - next.left) < 0.5
      && Math.abs(previous.top - next.top) < 0.5
      && previous.width === next.width
      && previous.maxHeight === next.maxHeight
      ? previous
      : next))
  }, [])

  // Measure after layout, before paint: a frame of the panel at the wrong
  // position is visible as a jump.
  useLayoutEffect(() => {
    if (!open) { setPlacement(undefined); return }
    measure()
  }, [open, measure])

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event: Event): void => {
      const target = event.target as Node | null
      if (target === null) return
      if (panel.current?.contains(target) === true) return
      if (button.current?.contains(target) === true) return
      // Its own instance only: a press outside card A's popover must not close
      // card B's, which is why this handler closes over its own state rather
      // than reaching for a shared one.
      setOpen(false)
    }
    const onKey = (event: Event): void => {
      if ((event as KeyboardEvent).key !== 'Escape') return
      setOpen(false)
      // Focus goes back to the trigger, because the panel it was in is gone and
      // leaving focus on a removed node drops it to the body.
      button.current?.focus()
    }
    const onResize = (): void => measure()
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open, measure])

  const panelStyle: CSSProperties = placement === undefined
    ? {}
    : {
      left: placement.left,
      top: placement.top,
      width: placement.width,
      ...placement.maxHeight === undefined ? {} : { maxHeight: placement.maxHeight },
    }

  return createElement(
    'span',
    { style: { position: 'relative', display: 'inline-block', minWidth: 0 } satisfies CSSProperties },
    createElement(
      'span',
      { ref: anchor, style: { display: 'inline-block' } satisfies CSSProperties },
      createElement(
        'button',
        {
          ref: button,
          type: 'button',
          'data-openui-popover': 'trigger',
          'aria-expanded': open,
          onClick: () => setOpen(previous => !previous),
          style: {
            font: 'inherit',
            fontSize: SIZES.sm,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            minHeight: 24,
            cursor: 'pointer',
            color: 'var(--foreground)',
            background: 'transparent',
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: 'var(--border)',
            borderRadius: 'calc(var(--radius) * 1.2)',
          } satisfies CSSProperties,
        },
        trigger,
      ),
    ),
    open ? createElement(
      'div',
      {
        ref: panel,
        role: 'dialog',
        // Not modal: the content outside stays available, and a focus trap here
        // would fight the host's own Tab navigation (ADR-012 §3).
        'aria-modal': 'false',
        'data-openui-popover': 'panel',
        'data-openui-popover-placement': placement?.placement ?? 'unmeasured',
        style: {
          position: 'absolute',
          zIndex: 1,
          minWidth: 160,
          maxWidth: '100%',
          overflowY: 'auto',
          padding: '8px 10px',
          background: 'var(--background)',
          color: 'var(--foreground)',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--border)',
          borderRadius: 'calc(var(--radius) * 1.2)',
          boxShadow: '0 6px 18px light-dark(rgb(0 0 0 / 12%), rgb(0 0 0 / 45%))',
          fontSize: SIZES.sm,
          ...panelStyle,
        } satisfies CSSProperties,
      },
      content,
    ) : null,
  )
}

/**
 * A card that flips between two faces — `Flashcard`.
 *
 * Both faces are always in the DOM and the inactive one is `aria-hidden`, so the
 * flip is a state change and not a content swap: a screen reader announces the
 * face that is showing, and the hidden face is not read twice. `aria-pressed`
 * says which face is visible to anything that cannot see the rotation.
 *
 * The two faces share one grid cell rather than being absolutely positioned, so
 * the card is as tall as its taller face and the surrounding layout does not
 * jump when it flips. A reduced-motion user gets the same content with the
 * transition removed, not a different component.
 */
function FlashcardView({
  front,
  back,
  hint,
}: {
  readonly front: ReactNode
  readonly back: ReactNode
  readonly hint: string
}): ReactNode {
  const [flipped, setFlipped] = useState(false)
  const face = (content: ReactNode, visible: boolean, key: string): ReactNode => createElement(
    'span',
    {
      key,
      'data-openui-flashcard': visible ? 'visible' : 'hidden',
      'aria-hidden': !visible,
      style: {
        gridArea: '1 / 1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '10px 8px',
        // The hidden face keeps its space but is not painted, so the card does
        // not resize on flip.
        opacity: visible ? 1 : 0,
        transition: 'opacity 140ms ease',
        pointerEvents: visible ? 'auto' : 'none',
        minWidth: 0,
      } satisfies CSSProperties,
    },
    content,
  )

  return createElement(
    'button',
    {
      type: 'button',
      'data-openui-flashcard': 'card',
      'data-openui-flashcard-state': flipped ? 'back' : 'front',
      'aria-pressed': flipped,
      'aria-label': hint === '' ? 'flashcard, tap to flip' : hint,
      onClick: () => setFlipped(previous => !previous),
      style: {
        font: 'inherit',
        color: 'var(--foreground)',
        display: 'grid',
        width: '100%',
        minHeight: 96,
        cursor: 'pointer',
        textAlign: 'center',
        background: 'var(--card)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--border)',
        borderRadius: 'calc(var(--radius) * 1.4)',
      } satisfies CSSProperties,
    },
    face(front, !flipped, 'front'),
    face(back, flipped, 'back'),
    // The hint is a permanent affordance, not a face: it must stay readable
    // after the flip or the reader loses the instruction that caused it.
    createElement(
      'span',
      {
        'data-openui-flashcard': 'hint',
        style: {
          gridArea: '2 / 1',
          fontSize: SIZES.xs,
          color: 'var(--muted-foreground-strong)',
          paddingBottom: 6,
        } satisfies CSSProperties,
      },
      hint === '' ? 'Tap to flip' : hint,
    ),
  )
}

/**
 * Confetti when its condition turns true — `Celebration`.
 *
 * Two properties make this safe to put in a card that re-renders on every state
 * change, and both are the 4A-3 `Timer` lesson:
 *
 *   - it fires on the **transition** into true, not on the value being true, so a
 *     re-render does not retrigger it and a card left at `true` does not loop;
 *   - the clear timer is owned by one effect whose cleanup is the only place it
 *     is cancelled, so unmounting mid-burst leaves nothing running.
 *
 * It never portals to `document.body`: the burst is drawn inside the card, even
 * though that is visually smaller than a full-window one. ADR-012 §1 forbids a
 * card from mounting into the host's document, and confetti is exactly the
 * decorative case where the exception would be tempting.
 */
function CelebrationView({ when }: { readonly when: boolean }): ReactNode {
  const [burst, setBurst] = useState(0)
  const previous = useRef<boolean | null>(null)

  useEffect(() => {
    const last = previous.current
    previous.current = when
    // Only a change from a known false fires. `null` is the first paint: a card
    // that loads already true has not just achieved anything.
    if (last === false && when) setBurst(value => value + 1)
  }, [when])

  useEffect(() => {
    if (burst === 0) return undefined
    const timer = setTimeout(() => setBurst(0), 2200)
    return () => clearTimeout(timer)
  }, [burst])

  if (burst === 0) return null

  const pieces = Array.from({ length: 36 }, (_value, index) => createElement('i', {
    key: 'p' + index,
    'aria-hidden': 'true',
    style: {
      position: 'absolute',
      left: ((index * 37) % 100) + '%',
      top: 0,
      width: 6,
      height: 10,
      borderRadius: 2,
      background: SERIES_VARS[index % SERIES_VARS.length]!,
      animation: 'none',
      // A deterministic spread: the same burst every time, so the browser run
      // can assert a piece count rather than "some confetti appeared".
      transform: 'translate(' + (((index * 71) % 200) - 100) + 'px, ' + (30 + ((index * 53) % 60)) + 'px)',
      opacity: 0.85,
    } satisfies CSSProperties,
  }))

  return createElement(
    'div',
    {
      'data-openui-celebration': 'burst',
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'celebration',
      style: {
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        borderRadius: 'inherit',
      } satisfies CSSProperties,
    },
    pieces,
  )
}

/** A list of refused argument names, collected while building one element. */
interface Refusals {
  list: string[]
}

/**
 * Mark an element whose arguments were refused — ADR-011 §10.
 *
 * A refused value is dropped rather than drawn, because a wrong shape inside a
 * drawing is worse than a missing one: the reader cannot tell it from a shape
 * the author meant. It is recorded structurally instead, so the browser run can
 * assert exactly which argument was refused rather than "something is off".
 * @param names - the refused argument names, in the order they were read.
 * @returns attributes to spread, or an empty object.
 */
function refusedAttrs(names: readonly string[]): Record<string, string> {
  if (names.length === 0) return {}
  return { 'data-openui-svg-refused': names.join(' ') }
}

/**
 * A required coordinate.
 *
 * Absent still has to produce a number: React would drop an `undefined`
 * attribute and the browser would then draw the element at 0, which is a
 * plausible-looking shape in the wrong place. The refusal is recorded, and the
 * element is drawn at the origin of its own coordinate space.
 * @param value - the raw argument.
 * @param name - the argument's name, for the refusal marker.
 * @param refs - the refusal collector.
 * @returns the coordinate.
 */
function coordinate(value: unknown, name: string, refs: Refusals): number {
  const parsed = svgNumber(value)
  if (parsed === undefined) {
    refs.list.push(name)
    return 0
  }
  return parsed
}

/**
 * A required extent: a coordinate that may not be negative.
 * @param value - the raw argument.
 * @param name - the argument's name, for the refusal marker.
 * @param refs - the refusal collector.
 * @returns the extent.
 */
function extent(value: unknown, name: string, refs: Refusals): number {
  const parsed = svgLength(value)
  if (parsed === undefined) {
    refs.list.push(name)
    return 0
  }
  return parsed
}

/**
 * An **optional** extent.
 *
 * Separate from {@link extent} because the two cases must not look the same: an
 * absent optional argument is not a refusal, and marking it as one would put a
 * refusal notice on every `Rect` that simply has square corners. That is the
 * difference between "the author did not ask for a radius" and "the author asked
 * for a radius this renderer would not draw".
 * @param value - the raw argument.
 * @param name - the argument's name, for the refusal marker.
 * @param refs - the refusal collector.
 * @returns the extent, or undefined when absent or refused.
 */
function optionalExtent(value: unknown, name: string, refs: Refusals): number | undefined {
  if (!stated(value)) return undefined
  const parsed = svgLength(value)
  if (parsed === undefined) refs.list.push(name)
  return parsed
}

/** The `text-anchor` values the language names. */
const SVG_ANCHORS: Readonly<Record<string, 'start' | 'middle' | 'end'>> = {
  start: 'start',
  middle: 'middle',
  end: 'end',
}

/**
 * How the language's three weights map to numeric weights.
 *
 * Numbers rather than keywords because the host's font stack resolves `normal`
 * and `medium` to the same face, which would make two named weights draw
 * identically.
 */
const SVG_WEIGHTS: Readonly<Record<string, number>> = {
  normal: 440,
  medium: 560,
  semibold: 640,
}

/**
 * Resolve the paint arguments shared by every shape into CSS declarations.
 *
 * Colour is set through `style` and not as a presentation attribute: a `var()`
 * inside an SVG presentation attribute is not reliably resolved, and the failure
 * is invisible — an unresolved `fill` draws black, which reads as a deliberate
 * colour on a light card and as a missing shape on a dark one (ADR-011 §7).
 *
 * The defaults matter as much as the values. SVG fills black unless told
 * otherwise, so a shape with no `fill` argument is given `currentColor`; a
 * stroked shape with no `stroke` is given `currentColor` too. Either way the
 * drawing inherits the card's ink and is legible in both schemes.
 * @param input - the raw paint arguments and whether this element is filled.
 * @returns the style declarations, plus the names of the refused arguments.
 */
function drawingPaint(input: {
  readonly fill: unknown
  readonly stroke: unknown
  readonly strokeWidth: unknown
  readonly opacity: unknown
  /** Whether this element is a filled shape by nature. */
  readonly filled: boolean
  /** Overrides `filled` for shapes that fill only on request (Path, Polyline). */
  readonly declaredFill?: boolean
}): { style: CSSProperties, refused: string[] } {
  const refused: string[] = []
  const style: Record<string, string | number> = {}
  const wantsFill = input.declaredFill ?? input.filled

  const fill = svgPaint(input.fill, COLOR_VARS)
  if (stated(input.fill) && fill === undefined) refused.push('fill')
  const stroke = svgPaint(input.stroke, COLOR_VARS)
  if (stated(input.stroke) && stroke === undefined) refused.push('stroke')

  if (fill !== undefined) {
    style.fill = fill
  } else if (wantsFill && !stated(input.stroke)) {
    style.fill = 'currentColor'
  } else {
    style.fill = 'none'
  }
  if (stroke !== undefined) {
    style.stroke = stroke
  } else if (!wantsFill || stated(input.stroke)) {
    style.stroke = 'currentColor'
  }

  const width = svgLength(input.strokeWidth)
  if (stated(input.strokeWidth) && width === undefined) refused.push('strokeWidth')
  if (width !== undefined && width > 0) style.strokeWidth = width
  else if (style.stroke !== undefined && style.fill === 'none') style.strokeWidth = 2

  const alpha = svgOpacity(input.opacity)
  if (stated(input.opacity) && alpha === undefined) refused.push('opacity')
  if (alpha !== undefined) style.opacity = alpha

  // Round joins and caps, so a thin polyline does not end in spikes.
  style.strokeLinecap = 'round'
  style.strokeLinejoin = 'round'
  return { style: style as CSSProperties, refused }
}

/**
 * The children of a container, as an array of nodes.
 *
 * Distinct from `children()` because a Carousel needs the items as a list to
 * give each one a fixed width; a single child must still become a one-item
 * list rather than a list of its own arguments.
 * @param value - the evaluated children argument.
 * @returns the items.
 */
function itemList(value: unknown): ReactNode[] {
  if (Array.isArray(value)) return value.flat() as ReactNode[]
  if (value === null || value === undefined) return []
  return [value as ReactNode]
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
 * **This is now unreachable through a program.** After 4A-5 every name
 * `signatures.ts` declares has a renderer, so `COMPONENTS[name] === undefined`
 * implies the name is not declared, and `drawValue` returns `null` for it. The
 * branch is kept, and exported so it is still tested, for one reason: the gap it
 * reports is created by adding a signature without adding a renderer, which is a
 * two-file mistake no test can prevent and which would otherwise ship as a
 * silently blank card. Deleting the branch would make that mistake invisible
 * again; keeping it tested costs one import.
 * @param name - the declared component name.
 * @param key - React key for the notice.
 * @returns the notice node.
 */
export function unrenderedNotice(name: string, key: string): ReactNode {
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
  // The raw argument list travels beside the drawn nodes. Only `List` reads it,
  // and only to ask whether an entry *is* a `ListItem` — a question the rendered
  // node cannot answer, because a `ListItem` is itself a complete row.
  return renderer(args, write, `o${path}:${descriptor.name}`, descriptor.args)
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
 * The marker column of a list row, or null for none.
 *
 * Marker words are upstream's, resolved once here so `List` and `ListItem`
 * cannot disagree about what `"dash"` means. An unrecognised word is drawn as
 * custom text rather than dropped: the language allows a custom marker, and
 * silently showing nothing would look like `marker: "none"`.
 * @param marker - the raw marker argument.
 * @param index - row index, for `number`.
 * @param timeline - whether this row is on a timeline.
 * @returns the marker node, or null.
 */
function markerNode(marker: unknown, index: number, timeline: boolean): ReactNode {
  const name = typeof marker === 'string' ? marker.trim() : marker === true ? 'bullet' : ''
  // `none` and absent both mean "no marker column at all". Timeline rows keep a
  // column regardless, because the spine is drawn in it.
  if (!timeline && (name === '' || name === 'none' || name === 'false')) return null
  const numbered = name === 'number' || name === 'ordered' || name === 'decimal'
  const checked = name === 'check' || name === 'checkmark' || name === 'done'
  const base: CSSProperties = {
    display: 'flex',
    justifyContent: 'center',
    flex: '0 0 auto',
    minWidth: 16,
    lineHeight: 1.5,
    color: 'var(--muted-foreground-strong)',
    fontVariantNumeric: 'tabular-nums',
  }
  if (timeline) {
    // A dot on the spine; numbered and check markers label it instead.
    const labelled = numbered || checked
    return createElement('div', {
      key: 'marker',
      'aria-hidden': 'true',
      style: {
        ...base,
        position: 'relative',
        width: 16,
      },
    }, createElement('span', {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: labelled ? 16 : 8,
        height: labelled ? 16 : 8,
        marginTop: labelled ? 1 : 5,
        borderRadius: '9999px',
        background: 'var(--primary)',
        fontSize: '0.625rem',
        fontWeight: 600,
        color: 'var(--primary-foreground)',
      },
    }, numbered ? String(index + 1) : checked ? '\u2713' : ''))
  }
  const style: CSSProperties = numbered ? { ...base, justifyContent: 'flex-end' } : base
  const content = numbered ? `${index + 1}.` : name === 'bullet' || name === 'dot'
    ? '\u2022'
    : name === 'dash' ? '\u2013' : checked ? '\u2713' : name
  return createElement(
    'div',
    {
      key: 'marker',
      'aria-hidden': 'true',
      style: checked ? { ...style, color: 'var(--viz-series-3)' } : style,
    },
    content,
  )
}

/**
 * One list row: an optional marker column and a content column.
 *
 * `ListItem` renders through this too, so a row nested in a `List` and a
 * free-standing one cannot drift apart.
 * @param parts - title, description and children.
 * @param marker - the marker node, or null.
 * @param timeline - whether this row is on a timeline.
 * @param last - whether it is the final row, which ends the spine.
 * @param key - React key.
 * @returns the row.
 */
function listRow(
  parts: { readonly title?: ReactNode; readonly description?: ReactNode; readonly children?: ReactNode },
  marker: ReactNode,
  timeline: boolean,
  last: boolean,
  key: string,
): ReactNode {
  const body: ReactNode[] = []
  if (parts.title !== null && parts.title !== undefined && parts.title !== '') {
    body.push(createElement('div', { key: 'title', style: { color: 'var(--foreground)', overflowWrap: 'anywhere' } }, parts.title))
  }
  if (parts.description !== null && parts.description !== undefined && parts.description !== '') {
    body.push(createElement('div', {
      key: 'description',
      style: { fontSize: SIZES.sm, lineHeight: 1.45, color: 'var(--muted-foreground-strong)', overflowWrap: 'anywhere' },
    }, parts.description))
  }
  if (parts.children !== null && parts.children !== undefined && parts.children !== '') {
    body.push(createElement('div', { key: 'body', style: { color: 'var(--foreground)', minWidth: 0 } }, parts.children))
  }
  return createElement(
    'div',
    {
      key,
      role: 'listitem',
      style: {
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        minWidth: 0,
        ...timeline ? { position: 'relative', paddingBottom: last ? 0 : 12 } : {},
      } satisfies CSSProperties,
    },
    marker,
    createElement('div', {
      key: 'content',
      style: { display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 auto', minWidth: 0 } satisfies CSSProperties,
    }, body),
    // The spine joins this row's dot to the next one. Drawn as a sibling of the
    // content so it cannot affect the content column's width.
    timeline && !last
      ? createElement('div', {
        key: 'spine',
        'aria-hidden': 'true',
        style: {
          position: 'absolute',
          top: 22,
          bottom: -2,
          left: 8,
          width: 1,
          background: 'var(--border)',
        } satisfies CSSProperties,
      })
      : null,
  )
}

/**
 * Read one list entry, which the language allows to be a `ListItem`
 * descriptor, a bare string, or an already-drawn node.
 *
 * A non-descriptor is treated as a title, matching upstream: `List(["a",
 * "b"])` is a legal bulleted list of two plain items.
 *
 * The `raw` argument is the entry *before* the walker drew it, and it is what
 * tells this function whether the entry is a `ListItem`. That distinction cannot
 * be recovered from the node: `ListItem` renders a complete row, so treating its
 * output as content would nest one row inside another and produce two
 * `role="listitem"` elements for one item. The live card showed exactly that —
 * five rows for four items, with the bullet row containing the check row.
 *
 * @param item - one evaluated (already drawn) entry.
 * @param raw - the same entry as a descriptor, when it has one.
 * @param index - its position, for React keys and numbering.
 * @param total - the number of entries, to know the last row.
 * @param fallbackMarker - the list's own marker, used when the entry omits one.
 * @param timeline - whether the list is a timeline.
 * @returns the row.
 */
function listEntryRow(
  item: EvaluationValue,
  raw: EvaluationValue | undefined,
  index: number,
  total: number,
  fallbackMarker: unknown,
  timeline: boolean,
): ReactNode {
  const key = `li${index}`
  const descriptor = raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as { kind?: string; name?: string; args?: readonly EvaluationValue[] }
    : undefined
  // A `ListItem` inside a List supplies its own marker, title, description and
  // children: title, description, marker, children.
  if (descriptor?.kind === 'element' && descriptor.name === 'ListItem') {
    const args = descriptor.args ?? []
    const marker = args[2] === undefined || args[2] === null ? fallbackMarker : args[2]
    // The children argument arrived already drawn, as the element at index 3 of
    // the *drawn* entry. Reading it from there keeps `drawValue` the only place
    // that turns values into nodes.
    const drawnArgs = item !== null && typeof item === 'object' && !Array.isArray(item)
      ? (item as { args?: readonly EvaluationValue[] }).args
      : undefined
    return listRow(
      { title: text(args[0]), description: text(args[1]), children: children(drawnArgs?.[3]) },
      markerNode(marker, index, timeline),
      timeline,
      index === total - 1,
      key,
    )
  }
  if (isValidElement(item)) {
    // Already-rendered node: an `@Each` body or a component the walker drew
    // before this row saw it. It is content, not a row of its own.
    return listRow({ children: item }, markerNode(fallbackMarker, index, timeline), timeline, index === total - 1, key)
  }
  return listRow(
    { title: typeof item === 'string' ? item : text(item) },
    markerNode(fallbackMarker, index, timeline),
    timeline,
    index === total - 1,
    key,
  )
}

/**
 * The most rows one `List` will draw.
 *
 * A single dispatch must not emit an unbounded number of DOM nodes. Upstream
 * caps the same way and charges the excess against the row's output budget;
 * here the cap is stated, and the truncation is reported in the card rather than
 * silently dropping the tail — a list that quietly ends early is indistinguishable
 * from one that was meant to be that length.
 */
const MAX_LIST_ROWS = 200

/**
 * Format code text for the `Code` block.
 *
 * The language hands over an already-evaluated string; there is no syntax
 * highlighting, deliberately — highlighting is an interpretation of the text and
 * this renderer's contract with the model is that what it wrote is what is drawn.
 * @param value - the raw `code` argument.
 * @returns the code text.
 */
function codeText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(item => codeText(item)).join('\n')
  return ''
}

/**
 * A `Code` block with a copy button.
 *
 * The clipboard call is deliberately local rather than routed through the
 * dispatcher: `@CopyToClipboard` is still in `UNSUPPORTED_STEPS` (stage 4B), and
 * that is an *action* the program can take. A copy button is a user gesture on a
 * visible control, which is a different and much narrower capability. It is
 * best-effort and swallows a refusal — a denied permission must not throw into
 * the card. ADR-008's scope note makes the same distinction for `Link` vs
 * `@OpenUrl`.
 * @param props - component arguments.
 * @param key - React key.
 * @returns the block.
 */
function CodeView(props: readonly unknown[], key: string): ReactNode {
  const body = codeText(props[0])
  const language = text(props[1], '')
  return createElement(CodeBlock, { body, language, key })
}

/**
 * The stateful half of {@link CodeView}, kept as its own component because the
 * "copied" confirmation is local UI state and must not reach `$state`.
 */
function CodeBlock({ body, language }: { readonly body: string; readonly language: string }): ReactNode {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => {
    if (timer.current !== undefined) clearTimeout(timer.current)
  }, [])
  const copy = (): void => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
    // Best-effort: a refused permission is not an error the card may throw.
    if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
      void clipboard.writeText(body).catch(() => undefined)
    }
    setCopied(true)
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = undefined
      setCopied(false)
    }, 1600)
  }
  return createElement(
    'div',
    {
      style: {
        minWidth: 0,
        maxWidth: '100%',
        background: 'var(--card)',
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: 'var(--border-subtle)',
        borderRadius: 'calc(var(--radius) * 1)',
        overflow: 'hidden',
      } satisfies CSSProperties,
    },
    createElement(
      'div',
      {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          minHeight: 26,
          padding: '2px 6px 2px 10px',
          borderBottomWidth: 1,
          borderBottomStyle: 'solid',
          borderBottomColor: 'var(--border-subtle)',
        } satisfies CSSProperties,
      },
      createElement('span', {
        style: {
          fontSize: SIZES.xs,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: 'var(--muted-foreground-strong)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        } satisfies CSSProperties,
      }, language),
      createElement('button', {
        type: 'button',
        onClick: copy,
        'aria-label': copied ? 'Copied' : 'Copy code',
        style: {
          flex: '0 0 auto',
          font: 'inherit',
          padding: '2px 8px',
          fontSize: SIZES.xs,
          color: 'var(--muted-foreground-strong)',
          background: 'transparent',
          borderWidth: 1,
          borderStyle: 'solid',
          borderColor: 'var(--border-subtle)',
          borderRadius: 6,
          cursor: 'pointer',
        } satisfies CSSProperties,
      }, copied ? 'Copied' : 'Copy'),
    ),
    createElement('pre', {
      style: {
        margin: 0,
        padding: '10px 12px',
        maxHeight: 360,
        overflow: 'auto',
        fontSize: SIZES.sm,
        lineHeight: 1.55,
      } satisfies CSSProperties,
    }, createElement('code', {
      style: {
        fontFamily: 'var(--font-mono)',
        whiteSpace: 'pre',
        color: 'var(--foreground)',
      } satisfies CSSProperties,
    }, body)),
  )
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
  // The containing block for an open Popover panel (ADR-012 section 1).
  // Positioning alone is not containment - the panel's placement is clamped to
  // this element's measured rectangle - but it is what makes the panel's
  // coordinates relative to the card rather than to whatever ancestor happens
  // to be positioned. It does not affect flow and does not resize the card.
  position: 'relative',
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