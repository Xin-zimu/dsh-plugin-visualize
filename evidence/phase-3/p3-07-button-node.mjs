// Is the Button's onClick handler attached at all?
import { renderToStaticMarkup } from 'react-dom/server'
import { OpenUICard } from '../../src/client/OpenUICard.tsx'

// A static render cannot show handlers, so this instead proves the *descriptor*
// reaching the component table has an action, using the same walk the card does.
import { parseProgram } from '../../src/backends/openui/parse.ts'
import { evaluateProgram } from '../../src/backends/openui/evaluate.ts'

const program = [
  '$count = 3',
  'inc = Button("inc", @Set($count, 6), "primary")',
  'root = Col([inc])',
].join('\n')

const parsed = parseProgram(program)
const result = evaluateProgram(parsed, { state: {} })
console.log('ok:', parsed.ok, 'diagnostics:', result.diagnostics.length)
console.log('root:', JSON.stringify(result.root, null, 1))
