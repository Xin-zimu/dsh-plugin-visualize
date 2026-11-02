/**
 * The built-in `@functions` of openui-lang v1.
 *
 * Upstream's table is frozen at 72 names (`@Each` belongs to the evaluator, not to
 * `FUNCTIONS`) and every implementation here is a behavioural port, so these tests pin
 * *upstream's answers* — measured by running
 * `upstream/dsh-intelligent-ui/src/lang/functions.js` — including the ones that look
 * wrong: `@Avg` of an empty list is 0, `@Histogram` of no values is `[]`, and a missing
 * value is skipped rather than counted as zero.
 */
import { describe, expect, it } from 'vitest'
import {
  FUNCTIONS,
  callFunction,
  fxCompareValues,
  fxDeepEqual,
  fxIsPlainObject,
  fxMaybeNumber,
  fxText,
  fxToNumber,
  fxTruthy,
  type FxReport,
  type FxSeverity,
} from '../src/backends/openui/functions.ts'

/** The frozen v1 table, in upstream's own order. `@Each` is deliberately absent. */
const NAMES: readonly string[] = [
  'Count', 'First', 'Last', 'Sum', 'Avg', 'Min', 'Max', 'Sort', 'Filter', 'Round',
  'Abs', 'Floor', 'Ceil', 'Append', 'Prepend', 'Concat', 'Remove', 'RemoveAt', 'Update',
  'Toggle', 'Includes', 'Find', 'IndexOf', 'Take', 'Slice', 'Unique', 'Reverse', 'Range',
  'Pick', 'Shuffle', 'Flatten', 'Chunk', 'Pow', 'Sqrt', 'Random', 'Clamp', 'Percent',
  'Lerp', 'Allocate', 'Payment', 'Convert', 'Format', 'Join', 'Plural', 'Pad', 'Upper',
  'Lower', 'Trim', 'Capitalize', 'Split', 'Replace', 'Duration', 'Default', 'MixColor',
  'Now', 'Today', 'FormatDate', 'AddDays', 'AddMonths', 'DaysBetween', 'MonthsBetween',
  'StartOf', 'GroupBy', 'Pivot', 'Top', 'Between', 'Bucket', 'Cumulative', 'MovingAvg',
  'Change', 'Histogram', 'Stats',
]

/** One diagnostic collected from {@link callFunction}. */
interface Collected {
  readonly value: unknown
  readonly messages: readonly string[]
  readonly severities: readonly (FxSeverity | undefined)[]
}

/**
 * Call a built-in through the public entry point, keeping every diagnostic.
 *
 * @param name - bare function name.
 * @param args - argument values.
 * @returns the value and the diagnostics it reported.
 */
function collect(name: string, args: unknown): Collected {
  const messages: string[] = []
  const severities: (FxSeverity | undefined)[] = []
  const report: FxReport = (message, severity) => {
    messages.push(message)
    severities.push(severity)
  }
  return { value: callFunction(name, args, report), messages, severities }
}

/**
 * View a list result with the element shape the assertions need. The helpers under
 * test answer `unknown` (their values are openui-lang values, not host types), so a
 * spec that reads into a result has to say what it expects to find.
 *
 * @param value - the value a list built-in answered.
 * @returns the same value, typed.
 */
function asList<T>(value: unknown): T[] {
  return value as T[]
}

/** What `@Stats` answers. */
interface StatsShape {
  readonly count: number
  readonly min: number
  readonly max: number
  readonly mean: number
  readonly median: number
  readonly stdev: number
}

/** One `@Histogram` bin. */
interface BinShape {
  readonly key: string
  readonly value: number
  readonly start: number
  readonly end: number
}

describe('the function table', () => {
  it('exposes every frozen v1 name and nothing else', () => {
    expect(Object.keys(FUNCTIONS).sort()).toEqual([...NAMES].sort())
    expect(Object.keys(FUNCTIONS)).toHaveLength(72)
    expect(FUNCTIONS.Each).toBeUndefined()
  })

  it('makes every name a callable function', () => {
    for (const name of NAMES) {
      expect(typeof FUNCTIONS[name], name).toBe('function')
      // A call with no arguments must answer, not throw: every built-in either
      // tolerates the empty list or converts its own failure into null.
      expect(() => FUNCTIONS[name]!([]), name).not.toThrow()
    }
  })

  it('answers a direct call rather than reaching the reporter', () => {
    // Direct calls swallow diagnostics by design; only callFunction reports.
    expect(FUNCTIONS.Sum!(['abc'])).toBeNull()
    expect(FUNCTIONS.Sum!([[1, 2]])).toBe(3)
    expect(FUNCTIONS.Count!([null])).toBe(0)
  })

  it('is not fooled by inherited properties', () => {
    expect(collect('toString', []).value).toBeNull()
    expect(collect('hasOwnProperty', []).value).toBeNull()
    expect(collect('__proto__', []).value).toBeNull()
    expect(collect('constructor', []).value).toBeNull()
  })
})

describe('callFunction', () => {
  it('reports one error for an unknown name and returns null', () => {
    const reported = collect('Nope', [])
    expect(reported.value).toBeNull()
    expect(reported.messages).toEqual(['unknown function "@Nope"; use only the @functions in the prompt'])
    expect(reported.severities).toEqual(['error'])
  })

  it('turns a bad argument into a diagnostic instead of a throw', () => {
    // `@Sum` requires an array; a string is not one.
    const reported = collect('Sum', ['abc'])
    expect(reported.value).toBeNull()
    expect(reported.messages).toEqual(['@Sum expects an array'])
    expect(reported.severities).toEqual(['error'])
    expect(() => callFunction('Sum', ['abc'], () => {})).not.toThrow()
  })

  it('reports a built-in failure with the message the built-in wrote', () => {
    const filter = collect('Filter', [[1], 'a', 'bogus', 1])
    expect(filter.value).toBeNull()
    expect(filter.messages).toEqual(['@Filter does not know the operator "bogus"'])
    const group = collect('GroupBy', [[{ k: 'a', v: 1 }], 'k', 'v', 'bogus'])
    expect(group.value).toBeNull()
    expect(group.messages).toEqual(['unknown aggregation "bogus"'])
  })

  it('does not report anything for an argument that is merely absent', () => {
    // null is an empty list, not an error, for every list built-in.
    expect(collect('Sum', [null])).toEqual({ value: 0, messages: [], severities: [] })
    expect(collect('Avg', [null])).toEqual({ value: 0, messages: [], severities: [] })
    expect(collect('First', [null]).value).toBeNull()
    expect(collect('Stats', [null]).value).toEqual({ count: 0, min: 0, max: 0, mean: 0, median: 0, stdev: 0 })
  })

  it('accepts a missing reporter', () => {
    expect(callFunction('Sum', [[1, 2]])).toBe(3)
    expect(callFunction('Nope', [])).toBeNull()
    expect(callFunction('Sum', ['abc'])).toBeNull()
    expect(callFunction('Sum', [[1, 2]], null)).toBe(3)
  })

  it('treats a non-array argument list as no arguments', () => {
    for (const args of [undefined, null, 'abc', 5, { 0: 1 }, true]) {
      expect(callFunction('Sum', args), String(args)).toBe(0)
    }
  })
})

describe('aggregates skip missing values instead of counting them as 0', () => {
  it('averages only the present numbers', () => {
    expect(FUNCTIONS.Avg!([[1, null, 3]])).toBe(2)
    expect(FUNCTIONS.Avg!([[null, 10]])).toBe(10)
    expect(FUNCTIONS.Avg!([['', 10]])).toBe(10)
    expect(FUNCTIONS.Avg!([[1, 2, 3, 4]])).toBe(2.5)
  })

  it('keeps the documented empty-list answers', () => {
    expect(FUNCTIONS.Avg!([[]])).toBe(0)
    expect(FUNCTIONS.Min!([[]])).toBeNull()
    expect(FUNCTIONS.Max!([[]])).toBeNull()
    expect(FUNCTIONS.Sum!([[]])).toBe(0)
  })

  it('skips null and blank in every aggregate helper', () => {
    expect(FUNCTIONS.Sum!([[1, null, 3]])).toBe(4)
    expect(FUNCTIONS.Sum!([[' 2 ', '', 'x']])).toBe(2)
    expect(FUNCTIONS.Min!([[null, 5, 9]])).toBe(5)
    expect(FUNCTIONS.Max!([[null, 5, 9]])).toBe(9)
    expect(FUNCTIONS.Stats!([[null, 10]])).toEqual({ count: 1, min: 10, max: 10, mean: 10, median: 10, stdev: 0 })
    expect(asList<BinShape>(FUNCTIONS.Histogram!([[null, 1, 2], 2])).map(bin => bin.value)).toEqual([1, 1])
    expect(FUNCTIONS.MovingAvg!([[null, 10], '', 2])).toEqual([0, 10])
  })

  it('groups and buckets the same way', () => {
    expect(FUNCTIONS.GroupBy!([[{ k: 'a', v: null }, { k: 'a', v: 10 }], 'k', 'v', 'avg'])).toEqual([{ key: 'a', value: 10 }])
    expect(FUNCTIONS.Pivot!([[{ r: 'a', c: 'x', v: null }, { r: 'a', c: 'x', v: 10 }], 'r', 'c', 'v', 'sum']))
      .toEqual([{ key: 'a', x: 10 }])
    expect(FUNCTIONS.Bucket!([[{ d: '2026-01-01', v: null }, { d: '2026-01-01', v: 10 }], 'd', 'day', 'v', 'avg']))
      .toEqual([{ key: '2026-01-01', value: 10 }])
  })

  it('counts rows, not values, for a count aggregation', () => {
    expect(FUNCTIONS.GroupBy!([[{ k: 'a', v: null }, { k: 'a', v: 2 }], 'k', 'v', 'count'])).toEqual([{ key: 'a', value: 2 }])
  })

  it('never lets an ordering comparison match a missing field', () => {
    const partial = [{ v: null }, { v: 5 }]
    expect(FUNCTIONS.Filter!([partial, 'v', '<', 3])).toEqual([])
    expect(FUNCTIONS.Filter!([partial, 'v', '>=', 3])).toEqual([{ v: 5 }])
    expect(FUNCTIONS.Filter!([partial, 'v', '==', null])).toEqual([{ v: null }])
  })

  it('distinguishes fxMaybeNumber from fxToNumber', () => {
    expect(fxToNumber(null)).toBe(0)
    expect(fxToNumber('')).toBe(0)
    expect(fxToNumber(' 7 ')).toBe(7)
    expect(fxToNumber(true)).toBe(1)
    expect(fxToNumber({})).toBeNaN()
    expect(fxMaybeNumber(null)).toBeNaN()
    expect(fxMaybeNumber('')).toBeNaN()
    expect(fxMaybeNumber(' 7 ')).toBe(7)
    expect(fxMaybeNumber(0)).toBe(0)
  })
})

describe('`@Format`', () => {
  it('formats each documented kind', () => {
    expect(FUNCTIONS.Format!([12345.6])).toBe('12,345.6')
    expect(FUNCTIONS.Format!([12345.678, 'currency'])).toBe('$12,345.68')
    expect(FUNCTIONS.Format!([45, 'percent'])).toBe('45%')
    expect(FUNCTIONS.Format!([45.5, 'percent', 1])).toBe('45.5%')
    expect(FUNCTIONS.Format!([1200000, 'compact'])).toBe('1.2M')
    expect(FUNCTIONS.Format!([1234.5678, 'number', 2])).toBe('1,234.57')
  })

  it('defaults the currency to USD and honours an explicit ISO code', () => {
    expect(FUNCTIONS.Format!([1234.5, 'currency', 0, 'eur'])).toBe('€1,235')
    expect(FUNCTIONS.Format!([1234.5, 'currency', 2, 'gbp'])).toBe('£1,234.50')
  })

  it('returns empty text for an absent value and the text form of a non-number', () => {
    expect(FUNCTIONS.Format!([null])).toBe('')
    expect(FUNCTIONS.Format!([undefined])).toBe('')
    expect(FUNCTIONS.Format!([Number.NaN])).toBe('')
    expect(FUNCTIONS.Format!(['abc'])).toBe('abc')
    expect(FUNCTIONS.Format!([true])).toBe('1')
  })

  it('rejects an unknown kind instead of falling back', () => {
    const reported = collect('Format', [45, 'money'])
    expect(reported.value).toBeNull()
    expect(reported.messages).toEqual(['@Format expects "number", "currency", "percent", "compact"'])
  })
})

describe('`@Join`', () => {
  it('joins a list with the default and an explicit separator', () => {
    expect(FUNCTIONS.Join!([['a', null, 'b'], '-'])).toBe('a-b')
    expect(FUNCTIONS.Join!([[1, 2, 3]])).toBe('1, 2, 3')
  })

  it('reads a field and skips missing values', () => {
    expect(FUNCTIONS.Join!([[{ n: 'x' }, { n: 'y' }], ', ', 'n'])).toBe('x, y')
    expect(FUNCTIONS.Join!([[{ n: 'x' }, { other: 1 }, { n: 'y' }], ', ', 'n'])).toBe('x, y')
  })

  it('returns a string unchanged', () => {
    expect(FUNCTIONS.Join!(['abc'])).toBe('abc')
  })
})

describe('`@Plural`', () => {
  it('picks the singular for exactly one', () => {
    expect(FUNCTIONS.Plural!([1, 'guest'])).toBe('1 guest')
    expect(FUNCTIONS.Plural!(['1', 'thing'])).toBe('1 thing')
  })

  it('appends s by default and takes an explicit plural', () => {
    expect(FUNCTIONS.Plural!([3, 'guest'])).toBe('3 guests')
    expect(FUNCTIONS.Plural!([0, 'item'])).toBe('0 items')
    expect(FUNCTIONS.Plural!([2, 'person', 'people'])).toBe('2 people')
    expect(FUNCTIONS.Plural!([1.5, 'thing'])).toBe('1.5 things')
  })

  it('needs a count and a word', () => {
    const reported = collect('Plural', [1])
    expect(reported.value).toBeNull()
    expect(reported.messages).toEqual(['@Plural needs a count and a word'])
  })
})

describe('`@Sort`', () => {
  const rows = [{ k: 'a', v: 2 }, { k: 'b', v: 1 }, { k: 'c', v: 3 }]

  it('sorts ascending by default and descending on request', () => {
    expect(asList<{ k: string }>(FUNCTIONS.Sort!([rows, 'v'])).map(row => row.k)).toEqual(['b', 'a', 'c'])
    expect(asList<{ k: string }>(FUNCTIONS.Sort!([rows, 'v', 'desc'])).map(row => row.k)).toEqual(['c', 'a', 'b'])
    expect(asList<{ k: string }>(FUNCTIONS.Sort!([rows, 'v', 'descending'])).map(row => row.k)).toEqual(['c', 'a', 'b'])
  })

  it('sorts a bare list of numbers and leaves the input untouched', () => {
    expect(FUNCTIONS.Sort!([[3, 1, 2]])).toEqual([1, 2, 3])
    expect(rows.map(row => row.k)).toEqual(['a', 'b', 'c'])
  })

  it('sorts missing values last ascending and first descending', () => {
    // `fxOrder` puts a null last, but the direction sign multiplies that order too,
    // so descending puts the nulls first. That is upstream's behaviour, kept as is.
    expect(FUNCTIONS.Sort!([[{ v: null }, { v: 1 }, { v: 2 }], 'v'])).toEqual([{ v: 1 }, { v: 2 }, { v: null }])
    expect(FUNCTIONS.Sort!([[{ v: null }, { v: 1 }, { v: 2 }], 'v', 'desc'])).toEqual([{ v: null }, { v: 2 }, { v: 1 }])
  })

  it('rejects a direction it does not know', () => {
    const reported = collect('Sort', [rows, 'v', 'up'])
    expect(reported.value).toBeNull()
    expect(reported.messages).toEqual(['@Sort expects "asc", "desc"'])
  })
})

describe('`@Filter`', () => {
  const rows = [{ k: 'a', v: 2 }, { k: 'b', v: 1 }, { k: 'c', v: 3 }]

  it('matches every documented operator', () => {
    expect(asList<{ k: string }>(FUNCTIONS.Filter!([rows, 'v', '>', 1])).map(row => row.k)).toEqual(['a', 'c'])
    expect(asList<{ k: string }>(FUNCTIONS.Filter!([rows, 'v', '<=', 1])).map(row => row.k)).toEqual(['b'])
    expect(asList<{ k: string }>(FUNCTIONS.Filter!([rows, 'k', '!=', 'a'])).map(row => row.k)).toEqual(['b', 'c'])
    expect(asList<{ k: string }>(FUNCTIONS.Filter!([rows, 'k', '==', 'a'])).map(row => row.k)).toEqual(['a'])
  })

  it('supports contains on arrays and text', () => {
    expect(FUNCTIONS.Filter!([[[1, 2], [3, 4]], '', 'contains', 2])).toEqual([[1, 2]])
    expect(FUNCTIONS.Filter!([rows, 'k', 'contains', 'a'])).toEqual([{ k: 'a', v: 2 }])
  })

  it('needs four arguments', () => {
    const reported = collect('Filter', [rows, 'v', '>'])
    expect(reported.value).toBeNull()
    expect(reported.messages).toEqual(['@Filter needs a list, a field, an operator and a value'])
  })
})

describe('`@GroupBy`', () => {
  const rows = [
    { region: 'A', cat: 'x', amount: 1 },
    { region: 'A', cat: 'y', amount: 2 },
    { region: 'B', cat: 'x', amount: 3 },
  ]

  it('groups in first-seen order and sums by default', () => {
    expect(FUNCTIONS.GroupBy!([rows, 'region', 'amount'])).toEqual([
      { key: 'A', value: 3 },
      { key: 'B', value: 3 },
    ])
  })

  it('counts rows when no field is given', () => {
    expect(FUNCTIONS.GroupBy!([rows, 'region'])).toEqual([
      { key: 'A', value: 2 },
      { key: 'B', value: 1 },
    ])
  })

  it('takes each aggregation name', () => {
    expect(FUNCTIONS.GroupBy!([rows, 'region', 'amount', 'min'])).toEqual([
      { key: 'A', value: 1 },
      { key: 'B', value: 3 },
    ])
    expect(FUNCTIONS.GroupBy!([rows, 'region', 'amount', 'max'])).toEqual([
      { key: 'A', value: 2 },
      { key: 'B', value: 3 },
    ])
  })
})

describe('`@Pivot`', () => {
  const rows = [
    { region: 'A', cat: 'x', amount: 1 },
    { region: 'A', cat: 'y', amount: 2 },
    { region: 'B', cat: 'x', amount: 3 },
  ]

  it('cross-tabulates with a 0 for an absent cell', () => {
    expect(FUNCTIONS.Pivot!([rows, 'region', 'cat', 'amount'])).toEqual([
      { key: 'A', x: 1, y: 2 },
      { key: 'B', x: 3, y: 0 },
    ])
  })

  it('never lets a column overwrite the row label or another column', () => {
    expect(FUNCTIONS.Pivot!([[{ r: 'a', c: 'key', v: 1 }], 'r', 'c', 'v'])).toEqual([{ key: 'a', 'key (2)': 1 }])
    expect(FUNCTIONS.Pivot!([[{ r: 'a', c: 1, v: 1 }, { r: 'a', c: '1', v: 2 }], 'r', 'c', 'v']))
      .toEqual([{ key: 'a', 1: 1, '1 (2)': 2 }])
  })
})

describe('`@Stats`', () => {
  it('reports count, min, max, mean, median and the population stdev', () => {
    expect(FUNCTIONS.Stats!([[1, 2, 3, 4]])).toEqual({
      count: 4, min: 1, max: 4, mean: 2.5, median: 2.5, stdev: Math.sqrt(1.25),
    })
  })

  it('averages the two middle values for an even count', () => {
    const even = FUNCTIONS.Stats!([[1, 2, 3, 4]]) as StatsShape
    const odd = FUNCTIONS.Stats!([[1, 2, 3]]) as StatsShape
    expect(even.median).toBe(2.5)
    expect(odd.median).toBe(2)
    expect(odd.stdev).toBeCloseTo(Math.sqrt(2 / 3), 12)
  })

  it('answers all zeroes for an empty list rather than null', () => {
    expect(FUNCTIONS.Stats!([[]])).toEqual({ count: 0, min: 0, max: 0, mean: 0, median: 0, stdev: 0 })
  })
})

describe('`@Histogram`', () => {
  it('bins evenly between the observed extremes', () => {
    const bins = asList<BinShape>(FUNCTIONS.Histogram!([[1, 2, 3, 4], 2]))
    expect(bins.map(bin => bin.value)).toEqual([2, 2])
    expect(bins.map(bin => bin.start)).toEqual([1, 2.5])
    expect(bins[0]!.key).toBe('1\u20132.5')
    expect(bins[1]!.key).toBe('2.5\u20134')
    expect(bins[1]!.end).toBe(4)
  })

  it('takes an explicit range and keeps a value equal to the high edge in the last bin', () => {
    const bins = asList<BinShape>(FUNCTIONS.Histogram!([[1, 2, 3, 4], 2, 0, 10]))
    expect(bins.map(bin => bin.value)).toEqual([4, 0])
    expect(bins.map(bin => bin.start)).toEqual([0, 5])
    expect(bins[1]!.end).toBe(10)
  })

  it('answers an empty list for no values, and null for no arguments at all', () => {
    expect(FUNCTIONS.Histogram!([[]])).toBeNull()
    expect(FUNCTIONS.Histogram!([[null], 3])).toEqual([])
  })

  it('widens a degenerate range instead of dividing by zero', () => {
    // Every value is equal, so low + 1 is the only range there is; the single value
    // lands in the first bin because 5 is strictly below the computed high of 6.
    const bins = asList<BinShape>(FUNCTIONS.Histogram!([[5, 5, 5], 3]))
    expect(bins.map(bin => bin.value)).toEqual([3, 0, 0])
    expect(bins[0]!.start).toBe(5)
    expect(bins[2]!.end).toBe(6)
    expect(bins[0]!.key).toBe('5\u20135.3333')
  })

  it('needs at least one bin', () => {
    const reported = collect('Histogram', [[1, 2, 3, 4], 0])
    expect(reported.value).toBeNull()
    expect(reported.messages).toEqual(['@Histogram needs at least one bin'])
  })
})

describe('the value helpers the evaluator shares', () => {
  it('recognises a plain object', () => {
    expect(fxIsPlainObject({})).toBe(true)
    expect(fxIsPlainObject({ a: 1 })).toBe(true)
    expect(fxIsPlainObject([])).toBe(false)
    expect(fxIsPlainObject(null)).toBe(false)
    expect(fxIsPlainObject('x')).toBe(false)
    // Upstream's test is a three-part test, not a prototype check: a Date passes.
    expect(fxIsPlainObject(new Date())).toBe(true)
  })

  it('renders text the way the language does', () => {
    expect(fxText(null)).toBe('')
    expect(fxText(undefined)).toBe('')
    expect(fxText(Number.NaN)).toBe('')
    expect(fxText(Number.POSITIVE_INFINITY)).toBe('')
    expect(fxText(1.5)).toBe('1.5')
    expect(fxText(true)).toBe('true')
    expect(fxText([1, null, 'a'])).toBe('1, , a')
    expect(fxText({ a: 1 })).toBe('{"a":1}')
  })

  it('applies the language truthiness', () => {
    expect(fxTruthy(0)).toBe(false)
    expect(fxTruthy(Number.NaN)).toBe(false)
    expect(fxTruthy('')).toBe(false)
    expect(fxTruthy(null)).toBe(false)
    expect(fxTruthy([])).toBe(true)
    expect(fxTruthy('0')).toBe(true)
  })

  it('compares structurally, with NaN equal to itself', () => {
    expect(fxDeepEqual(Number.NaN, Number.NaN)).toBe(true)
    expect(fxDeepEqual(null, undefined)).toBe(true)
    expect(fxDeepEqual([1, [2]], [1, [2]])).toBe(true)
    expect(fxDeepEqual([1, 2], [2, 1])).toBe(false)
    expect(fxDeepEqual({ a: 1 }, { a: 1 })).toBe(true)
    expect(fxDeepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(fxDeepEqual('1', 1)).toBe(false)
  })

  it('orders numbers numerically and text numerically when it can', () => {
    expect(fxCompareValues(1, 2)).toBeLessThan(0)
    expect(fxCompareValues('10', '9')).toBeGreaterThan(0)
    expect(fxCompareValues('a', 'b')).toBeLessThan(0)
    expect(fxCompareValues('a', 'a')).toBe(0)
    expect(fxCompareValues(null, null)).toBe(0)
  })
})

describe('the corners that look like bugs and are kept', () => {
  it('returns null from `@Change` when the previous value is 0', () => {
    expect(FUNCTIONS.Change!([120, 100])).toBe(20)
    expect(FUNCTIONS.Change!([1, 0])).toBeNull()
    expect(FUNCTIONS.Change!([0, -100])).toBe(100)
  })

  it('returns null from `@Sqrt` for a negative input instead of reporting', () => {
    expect(collect('Sqrt', [-1])).toEqual({ value: null, messages: [], severities: [] })
    expect(FUNCTIONS.Sqrt!([9])).toBe(3)
  })

  it('returns null from `@Pow` when the result is not a number', () => {
    expect(FUNCTIONS.Pow!([2, 10])).toBe(1024)
    expect(FUNCTIONS.Pow!([-1, 0.5])).toBeNull()
  })

  it('deduplicates primitives in one pass and structures by value', () => {
    expect(FUNCTIONS.Unique!([[1, '1', 1, null, undefined, Number.NaN, Number.NaN]]))
      .toEqual([1, '1', null, Number.NaN])
    expect(FUNCTIONS.Unique!([[{ a: 1 }, { a: 1 }, [1], [1], { a: 2 }]])).toEqual([{ a: 1 }, [1], { a: 2 }])
  })

  it('allocates the rounding remainder to the first share', () => {
    expect(FUNCTIONS.Allocate!([100, [1, 1, 1]])).toEqual([33.34, 33.33, 33.33])
    expect(FUNCTIONS.Allocate!([10, [1, 3]])).toEqual([2.5, 7.5])
    expect(FUNCTIONS.Allocate!([10, []])).toEqual([])
  })

  it('keeps the upstream payment, percent and convert arithmetic', () => {
    expect(FUNCTIONS.Payment!([1200, 0, 12])).toBe(100)
    expect(Math.abs((FUNCTIONS.Payment!([300000, 0.5, 360]) as number) - 1798.65)).toBeLessThan(0.01)
    expect(FUNCTIONS.Percent!([3, 4])).toBe(75)
    expect(FUNCTIONS.Percent!([3, 0])).toBe(0)
    expect(FUNCTIONS.Lerp!([0, 10, 0.25])).toBe(2.5)
    expect(FUNCTIONS.Convert!([100, 'c', 'f'])).toBe(212)
    expect(FUNCTIONS.Convert!([0, 'c', 'k'])).toBe(273.15)
    expect(FUNCTIONS.Convert!([1, 'kg', 'g'])).toBe(1000)
    expect(Math.abs((FUNCTIONS.Convert!([1, 'km', 'mi']) as number) - 0.621371192237334)).toBeLessThan(1e-12)
    expect(collect('Convert', [1, 'kg', 'km']).messages).toEqual(['@Convert cannot convert "kg" to "km"'])
  })

  it('rounds, pads and capitalises exactly as upstream does', () => {
    expect(FUNCTIONS.Round!([2.345, 2])).toBe(2.35)
    expect(FUNCTIONS.Round!([5, -3])).toBe(5)
    expect(FUNCTIONS.Pad!([7, 2])).toBe('07')
    // The guard stops after 1000 prefixes, then the result is sliced from the right.
    expect(FUNCTIONS.Pad!([7, 6, 'ab'])).toBe('babab7')
    expect(FUNCTIONS.Capitalize!(['new york'])).toBe('New York')
    expect(FUNCTIONS.Split!(['a, b,,c'])).toEqual(['a', 'b', 'c'])
    expect(FUNCTIONS.Split!(['abc', ''])).toEqual(['a', 'b', 'c'])
    expect(FUNCTIONS.Duration!([4800])).toBe('1h 20m')
    expect(FUNCTIONS.Duration!([245])).toBe('4m 05s')
    expect(FUNCTIONS.Duration!([245, 'clock'])).toBe('4:05')
    expect(FUNCTIONS.MixColor!(['#ffffff', '#000000', 0.5])).toBe('#808080')
  })

  it('formats dates in a fixed en-US locale', () => {
    expect(FUNCTIONS.FormatDate!(['2026-10-09'])).toBe('Oct 9, 2026')
    expect(FUNCTIONS.FormatDate!(['2026-10-09', 'short'])).toBe('Oct 9')
    expect(FUNCTIONS.FormatDate!(['2026-10-09', 'iso'])).toBe('2026-10-09')
    expect(FUNCTIONS.FormatDate!(['2026-10-09', 'weekday'])).toBe('Fri')
    // A date-only string is read in local time, so the printed day is the same day.
    expect(FUNCTIONS.AddDays!(['2026-01-31', 1])).toBe('2026-02-01')
    expect(FUNCTIONS.AddMonths!(['2026-01-31', 1])).toBe('2026-02-28')
    expect(FUNCTIONS.DaysBetween!(['2026-01-01', '2026-01-31'])).toBe(30)
    expect(FUNCTIONS.MonthsBetween!(['2026-01-20', '2026-03-15'])).toBe(1)
    expect(FUNCTIONS.StartOf!(['2026-01-07', 'week'])).toBe('2026-01-05')
    expect(FUNCTIONS.Today!([])).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(FUNCTIONS.Now!([])).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(collect('FormatDate', ['not a date']).messages)
      .toEqual(['@FormatDate expects a date like "2026-10-09", an ISO string or a timestamp'])
  })

  it('fills empty periods with 0 for a sum and null for a min', () => {
    expect(FUNCTIONS.Bucket!([[{ d: '2026-01-01', v: 1 }, { d: '2026-01-03', v: 2 }], 'd', 'day', 'v', 'min'])).toEqual([
      { key: '2026-01-01', value: 1 },
      { key: '2026-01-02', value: null },
      { key: '2026-01-03', value: 2 },
    ])
  })

  it('accumulates and smooths over the present values only', () => {
    expect(FUNCTIONS.Cumulative!([[1, 2, 3], ''])).toEqual([1, 3, 6])
    expect(FUNCTIONS.Cumulative!([[null, 10]])).toEqual([0, 10])
    expect(FUNCTIONS.MovingAvg!([[1, 2, 3], '', 2])).toEqual([1, 1.5, 2.5])
  })

  it('tops by a field with an explicit direction and stable ties', () => {
    const rows = [{ region: 'A', amount: 1 }, { region: 'B', amount: 3 }, { region: 'C', amount: 3 }]
    expect(asList<{ region: string }>(FUNCTIONS.Top!([rows, 'amount', 2])).map(row => row.region)).toEqual(['B', 'C'])
    expect(asList<{ region: string }>(FUNCTIONS.Top!([rows, 'amount', 2, 'ascending'])).map(row => row.region))
      .toEqual(['A', 'B'])
    expect(FUNCTIONS.Top!([rows, 'amount', 0])).toEqual([])
    expect(collect('Top', [rows, 'amount', 1, 'sideways']).messages).toEqual(['@Top expects "asc", "desc"'])
  })

  it('keeps a bounded range', () => {
    expect(FUNCTIONS.Range!([0, 3])).toEqual([0, 1, 2])
    expect(FUNCTIONS.Range!([3, 0, -1])).toEqual([3, 2, 1])
    expect(collect('Range', [0, 3, 0]).messages).toEqual(['@Range needs a step other than 0'])
  })
})
