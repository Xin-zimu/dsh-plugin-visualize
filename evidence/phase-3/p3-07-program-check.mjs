// Does the test program parse, and what does actionOf actually find?
import { parseProgram } from '../../src/backends/openui/parse.ts'
import { evaluateProgram } from '../../src/backends/openui/evaluate.ts'

const lines = [
  '$count = 3',
  '$step = 1',
  'root = Col([',
  '  Button("inc", @Set($count, 6), "primary"),',
  '  Button("reset", @Reset(), "secondary"),',
  '  Text("count " + @Format($count, "number")),',
  '  Text("step " + @Format($step, "number"))',
  '])',
]
const program = lines.join('\n')
const parsed = parseProgram(program)
console.log('parsed ok:', parsed.ok, '| root:', parsed.rootName)
console.log('diagnostics:', JSON.stringify(parsed.diagnostics, null, 1))

if (parsed.ok) {
  const result = evaluateProgram(parsed, { state: {} })
  console.log('eval diagnostics:', JSON.stringify(result.diagnostics, null, 1))
  console.log('root:', JSON.stringify(result.root, null, 1).slice(0, 1200))
}
