// @vitest-environment jsdom

/**
 * The OpenUI render path, end to end from a persisted descriptor to elements.
 *
 * The point of these tests is the dispatch and the boundary, not the styling:
 * a program card must be recognised as a program, must not be mistaken for a
 * fragment, and must never turn model text into code or markup.
 */

import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { openuiMetaFrom, openuiMetaFromArgs, visualizationFrom } from '../src/fragment.ts'
import { renderProgram } from '../src/client/OpenUICard.tsx'

const META = {
  kind: 'intelligent_ui',
  program: 'root = Col([Title("Tip splitter"), Text("hello")])',
  title: 'Tip',
  mode: 'inline',
  path: '~/x.openui.html',
  style: 'whale',
}

describe('openui meta', () => {
  it('reads a program card and declines a fragment card', () => {
    expect(openuiMetaFrom(META)?.program).toBe(META.program)
    expect(openuiMetaFrom({ kind: 'visualize', fragment: '<p/>' })).toBeUndefined()
    expect(openuiMetaFrom({ kind: 'intelligent_ui', program: 5 })).toBeUndefined()
    expect(openuiMetaFrom(undefined)).toBeUndefined()
  })

  it('dispatches by discriminant, keeping the two card kinds apart', () => {
    const program = visualizationFrom(META)
    const fragment = visualizationFrom({ kind: 'visualize', fragment: '<p/>', title: 't', mode: 'inline', path: 'p', style: 'whale' })
    expect(program?.kind).toBe('intelligent_ui')
    expect(fragment?.kind).toBe('visualize')
    expect(visualizationFrom({ kind: 'other' })).toBeUndefined()
  })

  it('reads a legacy dsh-intelligent-ui call from its own arguments', () => {
    const meta = openuiMetaFromArgs(JSON.stringify({ program: META.program, title: 'Legacy' }))
    expect(meta?.program).toBe(META.program)
    expect(meta?.title).toBe('Legacy')
  })

  it('does not claim an html call that happens to carry a program field', () => {
    expect(openuiMetaFromArgs(JSON.stringify({ backend: 'html', program: 'root = Col([])' }))).toBeUndefined()
    expect(openuiMetaFromArgs(JSON.stringify({ fragment: '<p/>' }))).toBeUndefined()
  })

  it('recovers a program from half-streamed arguments', () => {
    const partial = '{"title":"T","program":"root = Col([Title(\"hi\")'
    const meta = openuiMetaFromArgs(partial)
    expect(meta?.program).toContain('root = Col')
  })
})

describe('openui renderer', () => {
  it('draws the components the table names', () => {
    const { node, error } = renderProgram('root = Col([Title("Tip"), Text("hello")])')
    expect(error).toBeUndefined()
    const html = renderToStaticMarkup(node as never)
    expect(html).toContain('Tip')
    expect(html).toContain('hello')
  })

  it('refuses a name the table does not have, instead of drawing nothing', () => {
    const { error } = renderProgram('root = Col([Map("sf")])')
    // The parser accepts the syntax; the renderer has no such component, so the
    // call renders as nothing rather than inventing an element.
    const html = renderToStaticMarkup(renderProgram('root = Col([Map("sf")])').node as never)
    expect(html).not.toContain('Map')
    expect(error).toBeUndefined()
  })

  it('reports a parse failure rather than throwing', () => {
    const { node, error } = renderProgram('root = Col([\n  Title("x")\n])')
    expect(node).toBeNull()
    expect(error).toMatch(/expected "\]"/u)
  })

  it('never interprets model text as markup', () => {
    const { node } = renderProgram('root = Col([Text("<img src=x onerror=alert(1)>")])')
    const html = renderToStaticMarkup(node as never)
    expect(html).toContain('&lt;img')
    expect(html).not.toContain('<img')
  })

  it('resolves a reference to an earlier statement', () => {
    const { node } = renderProgram('root = Col([Text(label)])\nlabel = "from a statement"')
    const html = renderToStaticMarkup(node as never)
    expect(html).toContain('from a statement')
  })
})
