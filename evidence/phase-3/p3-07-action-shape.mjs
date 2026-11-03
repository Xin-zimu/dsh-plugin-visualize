/**
 * What does a Button's `action` actually evaluate to?
 *
 * P3-07 dispatches on that descriptor, so its exact shape decides the
 * implementation. This dumps the evaluated tree for the three forms the plan
 * names — `@Set($x, v)`, `@Reset()`, `Action([...])` — plus the two that are out
 * of scope, so the dispatcher can refuse them by shape rather than by guess.
 */
import { parseProgram } from '../../src/backends/openui/parse.ts'
import { evaluateProgram } from '../../src/backends/openui/evaluate.ts'

/** Find the first Button descriptor in an evaluated tree. */
function findButton(value) {
  if (value === null || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findButton(item)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (value.kind === 'element' && value.name === 'Button') return value
  for (const arg of value.args ?? []) {
    const hit = findButton(arg)
    if (hit !== undefined) return hit
  }
  return undefined
}

const CASES = {
  setToLiteral: '$n = 3\nroot = Button("b", @Set($n, 6))',
  setToExpression: '$n = 3\nroot = Button("b", @Set($n, $n + 1))',
  resetNoArgs: '$n = 3\nroot = Button("b", @Reset())',
  resetWithArgs: '$n = 3\n$m = 1\nroot = Button("b", @Reset($n))',
  actionList: '$n = 3\nroot = Button("b", Action([@Set($n, 1), @Reset()]))',
  openUrl: 'root = Button("b", @OpenUrl("https://example.com"))',
  noAction: 'root = Button("b")',
}

for (const [name, source] of Object.entries(CASES)) {
  const parsed = parseProgram(source)
  const result = evaluateProgram(parsed, { state: {} })
  const button = findButton(result.root)
  const action = button?.args?.[1]
  console.log(`\n--- ${name} ---`)
  console.log(JSON.stringify(action, null, 1))
  if (result.diagnostics.length > 0) console.log('diagnostics:', JSON.stringify(result.diagnostics))
}
