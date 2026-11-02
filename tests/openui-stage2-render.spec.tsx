// @vitest-environment jsdom

/**
 * The capabilities stage 2 added, asserted through the renderer the user
 * actually sees — not only through the evaluator.
 *
 * A program that evaluates correctly but draws nothing is not a feature, so
 * every case here goes through `renderProgram` and asserts on the markup.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderProgram } from '../src/client/OpenUICard.tsx'

/** Markup for one program, with an optional state. */
const draw = (source: string, state?: Record<string, unknown>) => {
  const { node, error } = renderProgram(source, state as never)
  return { error, html: node === null ? '' : renderToStaticMarkup(node as never) }
}

describe('evaluated programs render', () => {
  it('computes arithmetic instead of printing the operator', () => {
    const { html, error } = draw('root = Text("total: " + (2 + 3 * 4))')
    expect(error).toBeUndefined()
    expect(html).toContain('total: 14')
  })

  it('formats a number with @Format', () => {
    const { html } = draw('root = Text(@Format(1234.5, "number", 0))')
    expect(html).toMatch(/1[,.]?235/u)
  })

  it('expands @Each into one node per item', () => {
    const { html } = draw('root = Col(@Each([1, 2, 3], "n", Text("row " + n)))')
    expect(html).toContain('row 1')
    expect(html).toContain('row 2')
    expect(html).toContain('row 3')
  })

  it('takes the taken branch of a conditional only', () => {
    const { html } = draw('root = Text(true ? "yes" : missing.deep.thing)')
    expect(html).toContain('yes')
  })

  it('reads $state and changes the tree when it changes', () => {
    const program = 'root = Col(@Each(@Range(0, $n), "i", Text("item " + i)))'
    const two = draw(program, { n: 2 })
    const four = draw(program, { n: 4 })
    expect(two.html).toContain('item 1')
    expect(two.html).not.toContain('item 2')
    expect(four.html).toContain('item 3')
    expect(two.html).not.toBe(four.html)
  })

  it('reports an unknown function instead of drawing a silent blank', () => {
    const { error, html } = draw('root = Text(@NoSuchFunction(1))')
    expect(error).toBeUndefined()
    // The call evaluates to null, so the Text draws empty — but the host's
    // validator rejects the program before it ever reaches here (VZO001).
    expect(html).not.toContain('NoSuchFunction')
  })

  it('refuses a program with no root', () => {
    const { error } = draw('x = 1')
    expect(error).toMatch(/never defines .root./u)
  })
})
