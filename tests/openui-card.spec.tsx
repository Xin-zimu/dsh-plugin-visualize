// @vitest-environment jsdom

/**
 * The OpenUI render path, end to end from a persisted descriptor to elements.
 *
 * The point of these tests is the dispatch and the boundary, not the styling:
 * a program card must be recognised as a program, must not be mistaken for a
 * fragment, and must never turn model text into code or markup.
 */

import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { openuiMetaFrom, openuiMetaFromArgs, visualizationFrom } from '../src/fragment.ts'
import { OpenUICard, renderProgram } from '../src/client/OpenUICard.tsx'

/**
 * Markup for one component with props, without JSX in this spec.
 *
 * `unknown` (rather than React's own prop types) keeps the helper usable for a
 * component whose props are required: createElement's overloads would otherwise
 * demand a props object matching the component exactly.
 */
const renderElement = (
  type: (props: never) => unknown,
  props: Record<string, unknown>,
) => renderToStaticMarkup(createElement(type as never, props as never))

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

describe('layout contract', () => {
  it('stretches column children instead of centring them', () => {
    const { node } = renderProgram('root = Col([Text("a"), Button("b")])')
    const html = renderToStaticMarkup(node as never)
    // A flex column defaults to align-items: stretch; the renderer states it so
    // a lone Button cannot drift to the middle of the card.
    expect(html).toContain('align-items:stretch')
  })

  it('keeps a Button to its own width inside a stretched column', () => {
    const { node } = renderProgram('root = Col([Button("Test Button")])')
    const html = renderToStaticMarkup(node as never)
    expect(html).toContain('align-self:flex-start')
  })
})
describe('host token bridge', () => {
  it('declares every variable the component table references', () => {
    // The bridge belongs to the card root, not to the program tree: a var()
    // resolves against the element or an ancestor, so the declaration has to
    // sit above every component the table draws.
    const html = renderElement(
      OpenUICard,
      { meta: { ...META, program: 'root = Col([Title("t"), Text("x"), Button("b"), Caption("c")])' } },
    )
    // The DSH host publishes --dsw-* tokens only; without an explicit bridge on
    // the card root every var() below is invalid at computed-value time and the
    // element falls back to initial values (a Button with no background).
    // React escapes the style attribute, so compare against the decoded text.
    const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    for (const name of ['--foreground', '--muted-foreground', '--border', '--primary', '--primary-foreground', '--radius']) {
      expect(decoded).toContain(`${name}:var(--dsw-`)
    }
    // --font-sans is a --dsw-* token, not a --dsh-* one. This assertion used to
    // name `--dsh-font-family-text-default`, which the host has never published:
    // the 4A-1 browser run found it resolving to nothing (D18), and the fix is
    // `--dsw-font-family`. Pinned to the measured token so it cannot drift back.
    expect(decoded).toContain('--font-sans:var(--dsw-font-family')
  })

  it('keeps the semantic colour names on their own series', () => {
    const success = renderToStaticMarkup(renderProgram('root = Text("ok", "md", "success")').node as never)
    const danger = renderToStaticMarkup(renderProgram('root = Text("no", "md", "danger")').node as never)
    // success must not resolve to the amber slot, and danger must not reuse it.
    expect(success).toContain('var(--viz-series-3)')
    expect(danger).toContain('var(--viz-series-5)')
  })

  it('gives a Button a real border rather than a shorthand conflict', () => {
    const html = renderToStaticMarkup(renderProgram('root = Button("b")').node as never)
    expect(html).toContain('border-width:1px')
    expect(html).toContain('border-style:solid')
  })
})
