/**
 * Generate the capability matrix from the implementation, not from a document.
 *
 * The risk this addresses: a catalogue, a skill paragraph and a dispatcher are
 * three independent statements of what the product can do, and they drift. Twice
 * in this project the drift was real — `Action([...])` was refused by the validator
 * while the skill taught it, and the skill listed three refused actions as though
 * they worked. Both were invisible until someone drove a real model.
 *
 * So the matrix is produced by reading the same tables the code reads. If a
 * document disagrees with this output, the document is wrong.
 */
import { readFileSync } from 'node:fs'
import { ACTION_STEPS, COMPONENTS, FUNCTION_NAMES } from '../src/backends/openui/signatures.ts'
import { RENDERED_COMPONENTS } from '../src/client/OpenUICard.tsx'
import { SUPPORTED_STEPS, UNSUPPORTED_STEPS } from '../src/client/openui-actions.ts'

const declared = COMPONENTS.map(c => c.name).sort()
const rendered = [...RENDERED_COMPONENTS].sort()

const matrix = {
  generatedFrom: [
    'src/backends/openui/signatures.ts  COMPONENTS, ACTION_STEPS, FUNCTION_NAMES',
    'src/client/OpenUICard.tsx          RENDERED_COMPONENTS',
    'src/client/openui-actions.ts       SUPPORTED_STEPS, UNSUPPORTED_STEPS',
  ],
  components: {
    declared: declared.length,
    rendered: rendered.length,
    missing: declared.filter(n => !rendered.includes(n)),
    extra: rendered.filter(n => !declared.includes(n)),
    status: declared.length === rendered.length && declared.every(n => rendered.includes(n)) ? 'Supported' : 'INCOMPLETE',
  },
  functions: { declared: FUNCTION_NAMES.length },
  actions: ACTION_STEPS.map(name => {
    const supported = SUPPORTED_STEPS.has(name)
    const refused = UNSUPPORTED_STEPS.has(name)
    return {
      name: '@' + name,
      status: supported ? 'Supported' : refused ? 'Deferred' : 'UNDECLARED IN EITHER SET',
      note: name === 'CopyToClipboard'
        ? 'Supported, user gesture and visible payload required; refused inside Action([...])'
        : name === 'Action' ? 'Supported; composes steps, but not a clipboard write'
          : undefined,
    }
  }),
};

// Every action the language declares must be in exactly one of the two sets. A name
// in neither is a gap: it validates, then does nothing, and reports `action.unknown`
// at dispatch — a refusal that reads like a bug rather than a decision.
const unclassified = ACTION_STEPS.filter(n => !SUPPORTED_STEPS.has(n) && !UNSUPPORTED_STEPS.has(n))
matrix.actionsUnclassified = unclassified
const both = ACTION_STEPS.filter(n => SUPPORTED_STEPS.has(n) && UNSUPPORTED_STEPS.has(n))
matrix.actionsInBothSets = both

console.log(JSON.stringify(matrix, null, 1))

const ok = matrix.components.status === 'Supported' && unclassified.length === 0 && both.length === 0
process.exit(ok ? 0 : 1)