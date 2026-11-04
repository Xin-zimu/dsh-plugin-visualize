/**
 * SVG argument validation — ADR-011, in one place.
 *
 * ## Why a module rather than ten inline checks
 *
 * Stage 4A-5 adds ten drawing components carrying six free-form string
 * arguments between them: viewBox, transform, d, points, fill and stroke. That
 * is more raw-string surface than the other 34 components combined. Deciding it
 * ten times would mean ten slightly different answers.
 *
 * ## What this module does and does not claim
 *
 * It does **not** claim that an arbitrary string here could execute
 * JavaScript. In this backend it could not: the model writes a descriptor in a
 * closed language (ADR-004), drawValue builds props from an explicit argument
 * table, and React sets attributes one at a time without ever parsing markup.
 * There is no innerHTML route to defend.
 *
 * What it does claim is narrower and real:
 *
 *   - **no resource reference** may be produced by a value, so url( is refused
 *     in paint and no attribute here can make the host issue a request;
 *   - **no unbounded work**, so a path, a point list and a transform are capped;
 *   - **a drawing actually draws**, so a value that fails its grammar is dropped
 *     and marked rather than handed to the DOM, where the browser would silently
 *     ignore the whole attribute and the component would look empty.
 *
 * Every function returns a **re-serialised** string built from parsed numbers,
 * never the caller's string. That is what makes the caps above hold: the
 * attribute's length is a function of the token count this module already
 * bounded.
 *
 * Nothing here imports react or touches the DOM, so the grammars are testable
 * on their own.
 */

/** Largest magnitude a coordinate may hold. Beyond this, layout arithmetic
 * elsewhere in the card stops being meaningful rather than merely large. */
export const MAX_COORDINATE = 100_000

/** Most numbers a single d may contain. */
const MAX_PATH_NUMBERS = 512

/** Most coordinate pairs a points list may contain. */
const MAX_POINTS = 256

/** Most transform functions in one transform. */
const MAX_TRANSFORMS = 4

/** Characters of transform accepted before parsing, so the scan is bounded. */
const MAX_TRANSFORM_LENGTH = 400

/**
 * One SVG number.
 *
 * Deliberately the SVG grammar rather than Number(): Number("0x10") is 16 and
 * Number("1_0") is NaN, neither of which is what an SVG number is.
 */
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

const SEPARATORS = new Set([' ', '\t', '\n', '\r'])

/**
 * Read one bounded, finite number.
 * @param value - the raw argument.
 * @param options - clamp bounds; the default range is the coordinate cap.
 * @returns the number, or undefined when it is absent or not a number.
 */
export function svgNumber(
  value: unknown,
  options: { readonly min?: number; readonly max?: number } = {},
): number | undefined {
  let parsed: number
  if (typeof value === 'number') {
    parsed = value
  } else if (typeof value === 'string' && NUMBER.test(value.trim())) {
    parsed = Number(value.trim())
  } else {
    return undefined
  }
  if (!Number.isFinite(parsed)) return undefined
  const min = options.min ?? -MAX_COORDINATE
  const max = options.max ?? MAX_COORDINATE
  return Math.min(max, Math.max(min, parsed))
}

/**
 * A length: a number that may not be negative.
 * @param value - the raw argument.
 * @returns the length, or undefined.
 */
export function svgLength(value: unknown): number | undefined {
  return svgNumber(value, { min: 0 })
}

/**
 * Clamp an opacity to its real range.
 *
 * Absent is not zero: an element with no opacity argument is fully opaque, and
 * folding the two together would make every shape invisible by default.
 * @param value - the raw argument.
 * @returns 0..1, or undefined when absent or unusable.
 */
export function svgOpacity(value: unknown): number | undefined {
  return svgNumber(value, { min: 0, max: 1 })
}

/** One scanned token: either a command letter or a number, in source order. */
interface Scanned {
  readonly command: string | undefined
  readonly number: string | undefined
}

/**
 * Split a path or point string into commands and numbers.
 *
 * One scanner serves both grammars because both are letters that introduce a
 * fixed number of numbers. Returning undefined for any character outside the
 * two vocabularies is what makes the re-serialised output safe: a stray
 * semicolon, quote or parenthesis never survives the scan.
 * @param source - the raw string.
 * @param allowed - the command letters this grammar admits.
 * @returns the tokens, or undefined when the string is not this grammar.
 */
function scan(source: string, allowed: ReadonlySet<string>): Scanned[] | undefined {
  const tokens: Scanned[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]!
    if (SEPARATORS.has(char) || char === ',') {
      index += 1
      continue
    }
    if (/[a-zA-Z]/.test(char)) {
      if (!allowed.has(char)) return undefined
      tokens.push({ command: char, number: undefined })
      index += 1
      continue
    }
    const start = index
    if (char === '+' || char === '-') index += 1
    let digits = 0
    while (index < source.length && /[0-9]/.test(source[index]!)) { index += 1; digits += 1 }
    if (source[index] === '.') {
      index += 1
      while (index < source.length && /[0-9]/.test(source[index]!)) { index += 1; digits += 1 }
    }
    if (digits === 0) return undefined
    // An exponent is only an exponent when a digit follows; otherwise the e
    // would be read as a command letter by the branch above and silently split
    // one number into two tokens.
    if (source[index] === 'e' || source[index] === 'E') {
      let probe = index + 1
      if (source[probe] === '+' || source[probe] === '-') probe += 1
      if (probe < source.length && /[0-9]/.test(source[probe]!)) {
        index = probe
        while (index < source.length && /[0-9]/.test(source[index]!)) index += 1
      }
    }
    const literal = source.slice(start, index)
    if (!NUMBER.test(literal)) return undefined
    tokens.push({ command: undefined, number: literal })
  }
  return tokens
}

/** How many numbers each path command consumes. */
const PATH_ARITY: Readonly<Record<string, number>> = {
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
}

/** Every path command, both cases. */
const PATH_LETTERS: ReadonlySet<string> = new Set('MmLlHhVvCcSsQqTtAaZz'.split(''))

/**
 * Validate a d argument and re-serialise it from its numbers.
 *
 * The path must start with a move, and every command must be followed by a
 * whole number of argument groups. SVG's implicit repetition ("M 0 0 10 10") is
 * allowed because it is real syntax, but a half-group is not: the browser would
 * silently truncate it into a different shape rather than refusing it.
 * @param value - the raw d argument.
 * @returns the normalised path, or undefined when it is not a path.
 */
export function svgPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const source = value.trim()
  if (source === '') return undefined
  const tokens = scan(source, PATH_LETTERS)
  if (tokens === undefined) return undefined

  // Group into commands with their arguments.
  const groups: { command: string, numbers: string[] }[] = []
  for (const token of tokens) {
    if (token.command !== undefined) {
      groups.push({ command: token.command, numbers: [] })
    } else if (groups.length === 0) {
      // A number before any command: not a path.
      return undefined
    } else {
      groups[groups.length - 1]!.numbers.push(token.number!)
    }
  }
  if (groups.length === 0) return undefined

  const first = groups[0]!.command.toUpperCase()
  if (first !== 'M') return undefined

  let total = 0
  for (const group of groups) {
    const arity = PATH_ARITY[group.command.toUpperCase()]
    if (arity === undefined) return undefined
    if (arity === 0) {
      if (group.numbers.length !== 0) return undefined
      continue
    }
    if (group.numbers.length === 0) return undefined
    if (group.numbers.length % arity !== 0) return undefined
    total += group.numbers.length
  }
  if (total > MAX_PATH_NUMBERS) return undefined

  return groups
    .map(group => group.numbers.length === 0
      ? group.command
      : group.command + ' ' + group.numbers.join(' '))
    .join(' ')
}

/**
 * Validate a points list and re-serialise it.
 * @param value - the raw argument, like "0,0 10,5 20,0".
 * @returns the normalised list, or undefined when it is not one.
 */
export function svgPoints(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const source = value.trim()
  if (source === '') return undefined
  // No command letters exist in this grammar, so any letter refuses the value.
  const tokens = scan(source, new Set<string>())
  if (tokens === undefined || tokens.length === 0) return undefined
  if (tokens.length % 2 !== 0) return undefined
  if (tokens.length > MAX_POINTS * 2) return undefined
  const pairs: string[] = []
  for (let index = 0; index < tokens.length; index += 2) {
    pairs.push(tokens[index]!.number + ',' + tokens[index + 1]!.number)
  }
  return pairs.join(' ')
}

/** How many arguments each transform function takes. */
const TRANSFORM_ARITY: Readonly<Record<string, readonly number[]>> = {
  translate: [1, 2],
  scale: [1, 2],
  rotate: [1, 3],
  skewX: [1],
  skewY: [1],
  matrix: [6],
}

/**
 * Validate a transform and re-serialise it from its numbers.
 *
 * A malformed transform refuses **the whole argument**: applying the halves
 * that happened to parse would draw a shape the author never asked for, which
 * is harder to notice than an undrawn one.
 * @param value - the raw transform argument.
 * @returns the normalised transform, or undefined when it is not one.
 */
export function svgTransform(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const source = value.trim()
  if (source === '' || source.length > MAX_TRANSFORM_LENGTH) return undefined
  const found = [...source.matchAll(/\s*([a-zA-Z]+)\s*\(([^()]*)\)\s*/gu)]
  if (found.length === 0 || found.length > MAX_TRANSFORMS) return undefined
  // Full consumption: "rotate(30) translate(1,1)" is fine, "rotate(30)junk" is
  // not, and the difference is exactly whether the matches cover the string.
  if (found.map(match => match[0]).join('') !== source) return undefined

  const parts: string[] = []
  for (const match of found) {
    const name = match[1]!
    const arity = TRANSFORM_ARITY[name]
    if (arity === undefined) return undefined
    const raw = match[2]!.trim()
    const numbers = raw === '' ? [] : raw.split(/\s*,\s*|\s+/u).filter(part => part !== '')
    if (!arity.includes(numbers.length)) return undefined
    const checked: string[] = []
    for (const literal of numbers) {
      if (!NUMBER.test(literal)) return undefined
      const parsed = Number(literal)
      if (!Number.isFinite(parsed)) return undefined
      const clamped = Math.min(MAX_COORDINATE, Math.max(-MAX_COORDINATE, parsed))
      checked.push(String(Number(clamped.toFixed(6))))
    }
    parts.push(name + '(' + checked.join(' ') + ')')
  }
  return parts.join(' ')
}

/**
 * Validate a viewBox and re-serialise it.
 *
 * A zero or negative extent is refused rather than passed through: every shape
 * in a drawing with no extent collapses to nothing, and the result is
 * indistinguishable from a component that failed to render.
 * @param value - the raw viewBox argument.
 * @returns the normalised viewBox, or undefined when it is not one.
 */
export function svgViewBox(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const parts = value.trim().split(/[\s,]+/u).filter(part => part !== '')
  if (parts.length !== 4) return undefined
  const numbers: number[] = []
  for (const part of parts) {
    if (!NUMBER.test(part)) return undefined
    const parsed = Number(part)
    if (!Number.isFinite(parsed)) return undefined
    numbers.push(Math.min(MAX_COORDINATE, Math.max(-MAX_COORDINATE, parsed)))
  }
  const width = numbers[2]!
  const height = numbers[3]!
  if (width <= 0 || height <= 0) return undefined
  return numbers.map(number => String(Number(number.toFixed(6)))).join(' ')
}

/** Paint values that name nothing and reference nothing. */
const PAINT_WORDS: ReadonlySet<string> = new Set([
  'none', 'currentColor', 'transparent', 'black', 'white', 'red', 'green', 'blue',
  'yellow', 'orange', 'purple', 'pink', 'gray', 'grey', 'silver', 'gold',
  'teal', 'navy', 'olive', 'maroon', 'lime', 'aqua', 'fuchsia', 'cyan', 'magenta',
  'brown', 'coral', 'crimson', 'indigo', 'violet', 'salmon', 'khaki', 'tan',
])

/** Functions whose arguments are bare numbers, and which fetch nothing. */
const PAINT_FUNCTIONS = /^(?:rgba?|hsla?)\([0-9.,%/\s+-]*\)$/u

/**
 * Validate a fill or stroke value.
 *
 * The closed list is the whole of ADR-011's first hazard: a paint value is the
 * one drawing argument that could make the **host document** issue a network
 * request, and url( is how. Nothing in this list can reference anything.
 * @param value - the raw argument.
 * @param tokens - the language's named colours, already resolved to CSS.
 * @returns the paint, or undefined when it must not reach the DOM.
 */
export function svgPaint(
  value: unknown,
  tokens: Readonly<Record<string, string>>,
): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.trim()
  if (raw === '') return undefined
  const named = tokens[raw]
  if (named !== undefined) return named
  if (PAINT_WORDS.has(raw)) return raw
  if (/^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$|^#[0-9a-fA-F]{8}$/u.test(raw)) return raw
  // A bare word, letters only: it names a colour or it names nothing. It cannot
  // carry a parenthesis, a semicolon or a quote, which is what a reference needs.
  if (/^[a-zA-Z]+$/u.test(raw)) return raw
  if (PAINT_FUNCTIONS.test(raw)) return raw
  return undefined
}

/**
 * Whether an argument was supplied at all.
 * @param value - the raw argument.
 * @returns true when it is present and not empty.
 */
export function stated(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}
