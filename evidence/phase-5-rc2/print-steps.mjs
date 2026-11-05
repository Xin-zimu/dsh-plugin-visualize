// Prints the two action sets straight from the module the renderer imports.
// Run with: npx unrun evidence/phase-5-rc2/print-steps.mjs
import { SUPPORTED_STEPS, UNSUPPORTED_STEPS } from '../../src/client/openui-actions.ts'

console.log('UNSUPPORTED_STEPS =', JSON.stringify([...UNSUPPORTED_STEPS]))
console.log('UNSUPPORTED_STEPS.size =', UNSUPPORTED_STEPS.size)
console.log('SUPPORTED_STEPS =', JSON.stringify([...SUPPORTED_STEPS]))
console.log('SUPPORTED_STEPS.size =', SUPPORTED_STEPS.size)
const expected = ['OpenUrl', 'ToAssistant']
const actual = [...UNSUPPORTED_STEPS].sort()
console.log('EXPECTED UNSUPPORTED =', JSON.stringify(expected))
console.log('MATCH =', JSON.stringify(actual) === JSON.stringify(expected))
if (JSON.stringify(actual) !== JSON.stringify(expected)) process.exitCode = 1
