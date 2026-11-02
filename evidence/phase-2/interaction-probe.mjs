// Correct the interaction probe: a PLAIN statement derives from $state and
// re-evaluates; a $variable's default is deliberately state-independent
// (upstream test: "stateDefaults are independent of options.state").
import { parseProgram } from '../../src/backends/openui/parse.ts'
import { evaluateProgram } from '../../src/backends/openui/evaluate.ts'

const NL = String.fromCharCode(10)

// Correct shape: $n is state; rows is a plain statement derived from it.
const program = [
  '$n = 2',
  'rows = @Range(0, $n)',
  'root = Col(@Each(rows, "i", Card([Text("item " + @Format(i, "number"))])))',
].join(NL)

const parsed = parseProgram(program)
const at = (n) => {
  const result = evaluateProgram(parsed, { state: { n } })
  const cards = result.root?.args?.[0] ?? []
  return { count: cards.length, labels: cards.map(c => c.args?.[0]?.[0]?.args?.[0]) }
}

const two = at(2)
const five = at(5)
console.log('parse ok:', parsed.ok)
console.log('n=2 ->', JSON.stringify(two))
console.log('n=5 ->', JSON.stringify(five))
console.log('tree changes with state:', JSON.stringify(two) !== JSON.stringify(five))

// And confirm the defaults-only rule on purpose, so the contrast is on record.
const stateful = parseProgram(['$n = 2', '$rows = @Range(0, $n)', 'root = Text("x")'].join(NL))
console.log('derived $variable default is state-independent:',
  JSON.stringify(evaluateProgram(stateful, { state: {} }).stateDefaults),
  JSON.stringify(evaluateProgram(stateful, { state: { n: 5 } }).stateDefaults))
