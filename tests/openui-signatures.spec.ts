// @vitest-environment node

/**
 * The tables the prompt, the validator and the evaluator must agree on.
 *
 * Stage 2's own failure mode was teaching a name that silently falls back, so
 * these tests assert the three-way agreement rather than trusting that a name
 * list looks right: every signature the skill teaches must have an owner that
 * can actually produce a value.
 */

import { describe, expect, it } from 'vitest'
import { COMPONENT_NAMES, FUNCTION_NAMES } from '../src/backends/openui/signatures.ts'
import { FUNCTIONS as IMPLEMENTATIONS, callFunction } from '../src/backends/openui/functions.ts'

/** Names the evaluator intercepts before the function table is consulted. */
const EVALUATOR_FORMS: readonly string[] = ['Each']

/** Functions whose result depends on the clock, so evaluation is not pure. */
const IMPURE: readonly string[] = ['Now', 'Today']

describe('signature ownership', () => {
  it('teaches exactly the components the renderer can draw', () => {
    // 48 upstream components; the renderer table is widened in stage 3.
    expect(COMPONENT_NAMES.length).toBe(48)
    expect(new Set(COMPONENT_NAMES).size).toBe(48)
  })

  it('teaches 73 functions, each with exactly one owner', () => {
    expect(FUNCTION_NAMES.length).toBe(73)
    expect(new Set(FUNCTION_NAMES).size).toBe(73)

    const unowned = FUNCTION_NAMES.filter(
      name => !Object.prototype.hasOwnProperty.call(IMPLEMENTATIONS, name) && !EVALUATOR_FORMS.includes(name),
    )
    expect(unowned).toEqual([])
  })

  it('keeps the evaluator forms out of the value-function table', () => {
    // @Each evaluates a template per item; it cannot be a value-only function,
    // so it must not silently appear in FUNCTIONS as a null-returning entry.
    for (const name of EVALUATOR_FORMS) {
      expect(Object.prototype.hasOwnProperty.call(IMPLEMENTATIONS, name)).toBe(false)
    }
  })

  it('has no implementation the tables do not teach', () => {
    const taught = new Set(FUNCTION_NAMES)
    const extra = Object.keys(IMPLEMENTATIONS).filter(name => !taught.has(name))
    expect(extra).toEqual([])
  })

  it('reports an unknown function instead of falling back', () => {
    const seen: string[] = []
    const value = callFunction('NoSuchFunction', [1], (message) => { seen.push(message) })
    expect(value).toBeNull()
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('unknown function "@NoSuchFunction"')
  })

  it('marks the two clock-reading functions as impure', () => {
    // Recorded so a future "evaluation is pure" claim can be checked rather
    // than assumed: these two change result between calls.
    for (const name of IMPURE) {
      expect(FUNCTION_NAMES).toContain(name)
    }
  })
})
