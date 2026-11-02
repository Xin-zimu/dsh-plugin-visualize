import { parseProgram } from '../../src/backends/openui/parse.ts'
import { evaluateProgram } from '../../src/backends/openui/evaluate.ts'

const program = [
  '$count = 3',
  'root = Col([Text("value " + @Format($count, "number"))])',
].join(String.fromCharCode(10))

const parsed = parseProgram(program)
const first = evaluateProgram(parsed, { state: {} })
const second = evaluateProgram(parsed, { state: { count: 42 } })

const text = (r) => r.root?.args?.[0]?.[0]?.args?.[0]
console.log('parse ok:', parsed.ok)
console.log('default state:', JSON.stringify(first.stateDefaults))
console.log('root with default:', JSON.stringify(text(first)))
console.log('root with state 42:', JSON.stringify(text(second)))
console.log('diagnostics:', first.diagnostics.length)
