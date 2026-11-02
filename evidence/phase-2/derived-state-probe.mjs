// Isolate the derived-state behaviour: does a $variable that depends on
// another $variable follow the CALLER's state, or stay at its default?
import { parseProgram } from '../../src/backends/openui/parse.ts'
import { evaluateProgram } from '../../src/backends/openui/evaluate.ts'

const NL = String.fromCharCode(10)

// Case A: derived state used directly.
const a = parseProgram(['$n = 2', '$double = $n * 2', 'root = Text(@Format($double, "number"))'].join(NL))
for (const state of [{}, { n: 5 }]) {
  const r = evaluateProgram(a, { state })
  console.log('A state=' + JSON.stringify(state), '->', JSON.stringify(r.root?.args?.[0]))
}

// Case B: plain statement depending on state.
const b = parseProgram(['$n = 2', 'rows = @Range(0, $n)', 'root = Text(@Format(@Count(rows), "number"))'].join(NL))
for (const state of [{}, { n: 5 }]) {
  const r = evaluateProgram(b, { state })
  console.log('B state=' + JSON.stringify(state), '->', JSON.stringify(r.root?.args?.[0]), 'diag', r.diagnostics.length)
}

// Case C: what does UPSTREAM do for the same programs?
const up = await import('../../upstream/dsh-intelligent-ui/src/lang/index.js')
const upA = up.parseProgram(['$n = 2', '$double = $n * 2', 'root = Text(@Format($double, "number"))'].join(NL))
for (const state of [{}, { n: 5 }]) {
  const r = up.evaluateProgram(upA, { state })
  console.log('A(upstream) state=' + JSON.stringify(state), '->', JSON.stringify(r.root?.args?.[0]))
}
const upB = up.parseProgram(['$n = 2', 'rows = @Range(0, $n)', 'root = Text(@Format(@Count(rows), "number"))'].join(NL))
for (const state of [{}, { n: 5 }]) {
  const r = up.evaluateProgram(upB, { state })
  console.log('B(upstream) state=' + JSON.stringify(state), '->', JSON.stringify(r.root?.args?.[0]))
}
