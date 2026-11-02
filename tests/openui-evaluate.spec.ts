/**
 * The openui-lang evaluator.
 *
 * Every case here is a behaviour the port must keep from
 * `upstream/dsh-intelligent-ui/src/lang/evaluate.js`: lazy hoisted resolution,
 * memoization, cycle diagnostics, binding descriptors, `@Each` binding and
 * flattening, lazy conditionals, defaults that never see the caller's state,
 * and a depth guard that fires once.
 *
 * The programs are driven through `parseProgram`, so the specs exercise the
 * real pipeline rather than a hand-built AST.
 */

import { describe, expect, it } from 'vitest'
import { parseProgram } from '../src/backends/openui/parse.ts'
import {
  evaluateProgram,
  type BindingDescriptor,
  type ElementDescriptor,
  type EvaluationResult,
  type EvaluationValue,
} from '../src/backends/openui/evaluate.ts'

/**
 * Parse and evaluate one program.
 * @param source - openui-lang source.
 * @param state - current values of the caller's `$variables`.
 * @returns the evaluation.
 */
function run(
  source: string,
  state?: Readonly<Record<string, unknown>>,
): EvaluationResult {
  return evaluateProgram(parseProgram(source), state === undefined ? undefined : { state })
}

/**
 * Read a value as an element descriptor, failing the test when it is not one.
 * @param value - any evaluation value.
 * @returns the descriptor.
 */
function element(value: EvaluationValue): ElementDescriptor {
  expect(value).not.toBeNull()
  const descriptor = value as ElementDescriptor
  expect(descriptor.kind).toBe('element')
  return descriptor
}

/**
 * Read a value as a list, failing the test when it is not one.
 * @param value - any evaluation value.
 * @returns the list.
 */
function parts(value: EvaluationValue): readonly EvaluationValue[] {
  expect(Array.isArray(value)).toBe(true)
  return value as readonly EvaluationValue[]
}

/**
 * Read the arguments of an element descriptor as a list.
 * @param value - any evaluation value.
 * @returns its arguments.
 */
function argsOf(value: EvaluationValue): readonly EvaluationValue[] {
  return parts(element(value).args)
}

/**
 * The children of a `Col([...])` root: the list passed as its first argument.
 * @param result - the evaluation.
 * @returns the children.
 */
function children(result: EvaluationResult): readonly EvaluationValue[] {
  return parts(argsOf(result.root)[0])
}

/**
 * Every diagnostic message of an evaluation.
 * @param result - the evaluation.
 * @returns the messages, in order.
 */
function messages(result: EvaluationResult): string[] {
  return result.diagnostics.map(diagnostic => diagnostic.message)
}

describe('evaluateProgram: result shape', () => {
  it('returns root, stateDefaults and diagnostics', () => {
    const result = run('root = Col([title])\ntitle = Text("Hi")\n$name = "Ada"\n$count = 3')
    expect(result.ok).toBe(true)
    expect(result.diagnostics).toEqual([])
    expect(result.stateDefaults).toEqual({ name: 'Ada', count: 3 })

    const root = element(result.root)
    expect(root.name).toBe('Col')
    expect(root.line).toBe(1)

    const title = element(children(result)[0])
    expect(title.name).toBe('Text')
    expect(title.args[0]).toBe('Hi')
  })

  it('tolerates junk instead of throwing', () => {
    // The host may hand over anything; the evaluator is the last line of defence.
    const junk = [null, undefined, {}, { statements: null }, { statements: [{}] }] as const
    for (const program of junk) {
      const result = evaluateProgram(program as never)
      expect(typeof result.ok).toBe('boolean')
      expect(Array.isArray(result.diagnostics)).toBe(true)
      expect(result.stateDefaults).toEqual({})
    }
    expect(evaluateProgram(null).ok).toBe(true)
    expect(evaluateProgram({ diagnostics: [{ severity: 'error', message: 'x' }] } as never).ok).toBe(false)
  })
})

describe('evaluateProgram: lazy, hoisted, memoized', () => {
  it('resolves a reference defined later in the program', () => {
    const result = run('root = Col([answer])\nanswer = Title(text)\ntext = "later"')
    expect(result.diagnostics).toEqual([])
    expect(element(children(result)[0]).args[0]).toBe('later')
  })

  it('memoizes a statement, so two references share one value', () => {
    const result = run('root = Col([a, a])\na = {n: 1}')
    const args = parts(argsOf(result.root)[0])
    expect(args).toHaveLength(2)
    expect(args[0]).toEqual({ n: 1 })
    // Identity, not just equality: the second read came out of the cache.
    expect(args[0]).toBe(args[1])
  })

  it('reports an unknown plain reference as an error', () => {
    const result = run('root = Col([nope])')
    expect(children(result)[0]).toBeNull()
    expect(result.ok).toBe(false)
    expect(messages(result)).toContain('unknown reference "nope": no statement defines it')
  })

  it('reads an undeclared $variable as null without a diagnostic', () => {
    const result = run('root = Text(($missing == null) + "")')
    expect(element(result.root).args[0]).toBe('true')
    expect(result.diagnostics).toEqual([])
    expect(result.stateDefaults).toEqual({})
  })
})

describe('evaluateProgram: cycles', () => {
  it('reports a plain cycle instead of recursing', () => {
    const result = run('root = Col([a])\na = b\nb = a')
    expect(children(result)[0]).toBeNull()
    expect(messages(result)).toContain('circular reference: "a" eventually refers to itself')
  })

  it('reports a $state cycle at the statement that closes it', () => {
    const result = run('root = Text($x + "")\n$x = $y\n$y = $x')
    expect(messages(result).some(message => message.startsWith('circular reference:'))).toBe(true)
    expect(result.stateDefaults.x).toBeNull()
  })

  it('deduplicates diagnostics by severity, line and message', () => {
    const result = run('root = Col([nope, nope])')
    const unknown = messages(result).filter(message => message.includes('unknown reference'))
    expect(unknown).toHaveLength(1)
  })
})

describe('evaluateProgram: bindings', () => {
  it('keeps a $variable only as a direct component argument', () => {
    const result = run([
      'root = Text($name, $name + "!", $items.n)',
      '$name = "Ada"',
      '$items = [{n: 1}, {n: 2}]',
    ].join('\n'))
    const args = element(result.root).args
    expect(args[0]).toEqual({ kind: 'binding', name: 'name', value: 'Ada' } satisfies BindingDescriptor)
    expect(args[1]).toBe('Ada!')
    expect(args[2]).toEqual([1, 2])
  })

  it("keeps bindings only in an action's variable slot", () => {
    const result = run([
      'root = Button("Go", Action([@Set($final, $choice), @Reset($a, $b), @ToAssistant($label)]))',
      '$choice = 2',
      '$final = 0',
      '$a = 1',
      '$b = 2',
      '$label = "hi"',
    ].join('\n'))
    const steps = parts(argsOf(element(result.root).args[1])[0])
    expect(steps).toHaveLength(3)

    const set = element(steps[0])
    expect(set.name).toBe('@Set')
    expect(set.args[0]).toEqual({ kind: 'binding', name: 'final', value: 0 })
    expect(set.args[1]).toBe(2)

    const reset = element(steps[1])
    expect(reset.name).toBe('@Reset')
    expect(reset.args).toEqual([
      { kind: 'binding', name: 'a', value: 1 },
      { kind: 'binding', name: 'b', value: 2 },
    ])

    const toAssistant = element(steps[2])
    expect(toAssistant.name).toBe('@ToAssistant')
    expect(toAssistant.args[0]).toBe('hi')
  })
})

describe('evaluateProgram: @Each', () => {
  it('binds the loop variable, skips null items and concatenates arrays', () => {
    const result = run([
      'root = Col(@Each(items, "item", Text(item + "")))',
      'items = [1, null, 2]',
    ].join('\n'))
    const children = parts(argsOf(result.root)[0])
    expect(children.map(child => element(child).args[0])).toEqual(['1', '2'])
  })

  it('flattens a template that returns an array', () => {
    const result = run([
      'root = Col(@Each(items, "i", [Text("a" + i), Text("b" + i)]))',
      'items = [0, 1]',
    ].join('\n'))
    const children = parts(argsOf(result.root)[0])
    expect(children.map(child => element(child).args[0])).toEqual(['a0', 'b0', 'a1', 'b1'])
  })

  it('shadows a plain statement of the same name', () => {
    const result = run([
      'root = Col(@Each(items, "item", Text(item)))',
      'items = ["inner"]',
      'item = "outer"',
    ].join('\n'))
    expect(element(children(result)[0]).args[0]).toBe('inner')
  })

  it('rejects a non-array list, a non-string loop name and a short call', () => {
    const notAList = run('root = Col(@Each("text", "x", Text(x)))')
    expect(argsOf(notAList.root)[0]).toBeNull()
    expect(messages(notAList)).toContain('@Each expects an array as its first argument')

    const badName = run('root = Col(@Each([1], 2, Text("x")))')
    expect(messages(badName).some(m => m.includes('loop variable name as a string'))).toBe(true)

    const tooFew = run('root = Col(@Each([1]))')
    expect(messages(tooFew).some(m => m.includes('@Each needs a list'))).toBe(true)
  })
})

describe('evaluateProgram: laziness', () => {
  it('evaluates only the taken branch of a conditional', () => {
    const result = run('root = Col([v == null ? "safe" : v.deep.field])\nv = null')
    expect(children(result)[0]).toBe('safe')
    expect(result.diagnostics).toEqual([])
  })

  it('short-circuits && and ||', () => {
    const result = run('root = Col([false && nope, true || nope])')
    expect(parts(argsOf(result.root)[0])).toEqual([false, true])
    expect(result.diagnostics).toEqual([])
  })
})

describe('evaluateProgram: stateDefaults', () => {
  it('is independent of options.state', () => {
    const direct = 'root = Text($a + "")\n$a = 2\n$b = $a * 10'
    expect(evaluateProgram(parseProgram(direct)).stateDefaults).toEqual({ a: 2, b: 20 })
    expect(evaluateProgram(parseProgram(direct), { state: { a: 5 } }).stateDefaults)
      .toEqual({ a: 2, b: 20 })

    const indirect = 'root = Text($a + "")\n$a = 2\n$b = next\nnext = $a + 1'
    expect(evaluateProgram(parseProgram(indirect), { state: { a: 5 } }).stateDefaults)
      .toEqual({ a: 2, b: 3 })
  })

  it('still lets options.state drive the rendered root', () => {
    const result = run('root = Text($a + "")\n$a = 2\n$b = $a * 10', { a: 5 })
    expect(element(result.root).args[0]).toBe('5')
    expect(result.stateDefaults).toEqual({ a: 2, b: 20 })
  })

  it("leaves the caller's state untouched", () => {
    const state = { count: 5, nested: [1, 2] }
    const snapshot: unknown = JSON.parse(JSON.stringify(state))
    const result = run('root = Text($count + "")\n$count = 1', state)
    expect(element(result.root).args[0]).toBe('5')
    expect(result.stateDefaults).toEqual({ count: 1 })
    expect(state).toEqual(snapshot)
  })
})

describe('evaluateProgram: stack safety', () => {
  it('walks a long flat binary chain iteratively', () => {
    const terms = Array.from({ length: 500 }, (_, index) => index)
    const result = run(`root = ${terms.join(' + ')}`)
    expect(result.diagnostics).toEqual([])
    expect(result.root).toBe(124750)

    // Far past the parser's own depth guard: the left spine is a loop, not recursion.
    const longer = Array.from({ length: 4000 }, (_, index) => index)
    const deep = run(`root = ${longer.join(' + ')}`)
    expect(deep.diagnostics).toEqual([])
    expect(deep.root).toBe(7998000)
  })

  it('reports excessive nesting once, not once per node', () => {
    const deep = 't' + '.a'.repeat(300)
    const single = run(`root = ${deep}\nt = 1`)
    expect(single.root).toBeNull()
    expect(messages(single).filter(message => message.includes('nested too deeply')))
      .toEqual(['the expression is nested too deeply to evaluate'])

    // depthReported is per evaluation, so the second deep statement stays quiet.
    const twice = run(`root = Col([p, q])\np = ${deep}\nq = ${deep}\nt = 1`)
    expect(messages(twice).filter(message => message.includes('nested too deeply'))).toHaveLength(1)
  })
})

describe('evaluateProgram: names', () => {
  it('does not treat an unknown component name as an evaluator error', () => {
    const result = run('root = Mystery(1)')
    expect(element(result.root).name).toBe('Mystery')
    expect(result.diagnostics).toEqual([])
  })

  it('does not treat an unknown @function name as an evaluator error', () => {
    const result = run('root = Col([@Nope(1)])')
    expect(children(result)[0]).toBeNull()
    expect(result.diagnostics).toEqual([])
  })
})

describe('evaluateProgram: member and index access', () => {
  it('plucks, indexes negatively and reads length', () => {
    const result = run([
      'root = Col([names, rows[1].name, rows[-1].name, rows.length])',
      'names = rows.name',
      'rows = [{name: "a"}, {name: "b"}]',
    ].join('\n'))
    const args = children(result)
    expect(args[0]).toEqual(['a', 'b'])
    expect(args[1]).toBe('b')
    expect(args[2]).toBe('b')
    expect(args[3]).toBe(2)
  })
})
