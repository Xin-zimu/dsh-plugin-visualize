/**
 * The prompt, the catalogue and the code must say the same thing.
 *
 * This is a release gate, not a unit test. It exists because capability drift has
 * already happened twice in this project and both times it was invisible:
 *
 *   - `Action([...])` was refused by the validator while the skill text taught it,
 *     so a model that obeyed the prompt was rejected and one that guessed was not.
 *   - the skill text then listed three refused actions as ordinary ones, so a
 *     Button rendered normally and did nothing when pressed.
 *
 * Both were found by driving a real model, which is expensive and does not happen
 * on every commit. What follows is the cheap version: read the tables the code
 * reads, and fail when the published statements disagree with them.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ACTION_STEPS, COMPONENTS, FUNCTION_NAMES, languageReference } from '../src/backends/openui/signatures.ts'
import { RENDERED_COMPONENTS } from '../src/client/OpenUICard.tsx'
import { SUPPORTED_STEPS, UNSUPPORTED_STEPS } from '../src/client/openui-actions.ts'

const NL = String.fromCharCode(10)
const CATALOG = readFileSync('docs/specifications/COMPONENT_CATALOG.md', 'utf8')
const REFERENCE = languageReference()
const DECLARED = COMPONENTS.map(c => c.name)

/**
 * Find the catalogue row for an action.
 *
 * The rows spell the signature, not just the name: `| \`@Set($var, value)\` |`.
 * Matching on the bare name therefore found nothing, which is the sort of check
 * that passes by being vacuous — it would have kept passing after the row was
 * deleted. Match the opening delimiter and the name, and let the call fail loudly
 * when the row is absent.
 *
 * @param action - the bare action name, without the `@`.
 * @returns the row, or undefined when the catalogue does not mention it.
 */
function catalogRow(action: string): string | undefined {
  const prefix = '| `@' + action + '('
  return CATALOG.split(NL).find(line => line.startsWith(prefix))
}

describe('every declared component is drawn', () => {
  it('has no declared component without a renderer', () => {
    const missing = DECLARED.filter(n => !RENDERED_COMPONENTS.includes(n))
    expect(missing, 'a declared name with no renderer draws a not-drawn notice').toEqual([])
  })

  it('has no renderer for a name the language does not declare', () => {
    const extra = RENDERED_COMPONENTS.filter(n => !DECLARED.includes(n))
    expect(extra, 'a renderer for an undeclared name can never be reached').toEqual([])
  })
})

describe('every declared action is classified', () => {
  it('puts each action in exactly one of supported / refused', () => {
    const unclassified = ACTION_STEPS.filter(n => !SUPPORTED_STEPS.has(n) && !UNSUPPORTED_STEPS.has(n))
    const both = ACTION_STEPS.filter(n => SUPPORTED_STEPS.has(n) && UNSUPPORTED_STEPS.has(n))
    expect(unclassified, 'an unclassified action validates, then refuses as action.unknown').toEqual([])
    expect(both, 'an action cannot be both supported and refused').toEqual([])
  })
})

describe('the catalogue matches the implementation', () => {
  it('documents every component', () => {
    const undocumented = DECLARED.filter(n => !CATALOG.includes('`' + n + '`'))
    expect(undocumented).toEqual([])
  })

  it('marks each refused action as not executing', () => {
    for (const name of UNSUPPORTED_STEPS) {
      const row = catalogRow(name)
      expect(row, 'the catalogue must have a row for @' + name).toBeDefined()
      expect(row, '@' + name + ' must be marked as not executing').toContain('**no**')
      expect(row, '@' + name + ' must not be advertised as executing').not.toContain('| **yes** |')
    }
  })

  it('marks each supported action as executing', () => {
    for (const name of SUPPORTED_STEPS) {
      if (name === 'Action') continue
      const row = catalogRow(name)
      expect(row, 'the catalogue must have a row for @' + name).toBeDefined()
      expect(row, '@' + name + ' is supported and must say so').toContain('**yes**')
    }
  })
})

describe('the skill text matches the implementation', () => {
  it('teaches every supported action', () => {
    for (const name of SUPPORTED_STEPS) {
      if (name === 'Action') continue
      expect(REFERENCE, '@' + name + ' works, so the reference must teach it').toContain('@' + name)
    }
  })

  it('warns against every refused action', () => {
    expect(REFERENCE).toMatch(/Do not use/i)
    for (const name of UNSUPPORTED_STEPS) {
      expect(REFERENCE, '@' + name + ' is refused, so the reference must say so').toContain('@' + name)
    }
  })

  it('names every component', () => {
    const absent = DECLARED.filter(n => !REFERENCE.includes(n))
    expect(absent, 'the reference is generated from COMPONENTS, so a gap means the generator drifted').toEqual([])
  })

  it('documents every declared function', () => {
    const absent = FUNCTION_NAMES.filter(n => !REFERENCE.includes(n))
    expect(absent).toEqual([])
  })
})