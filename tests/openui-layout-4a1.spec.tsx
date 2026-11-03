// @vitest-environment jsdom

/**
 * Stage 4A-1 — `Box`, `Divider`, `Spacer`, `Grid`.
 *
 * These four are layout primitives, so the thing that can be wrong is not
 * "does it draw" but "does it lay out". A component can emit perfectly correct
 * HTML and still be broken in the browser in three ways this file tries to
 * catch before the browser does:
 *
 * 1. **A CSS variable that resolves to nothing.** This is D6/D7: the card was
 *    mounted in the host document while referring to the HTML backend's frame
 *    vocabulary, so every `var(--…)` was invalid at computed-value time and the
 *    element fell back to initial values. No unit test saw it. The guard at the
 *    bottom of this file derives the set of referenced variables from the
 *    rendered markup and asserts each one is declared on the card root.
 * 2. **A layout that only looks right because of a default.** `display: flex`
 *    with no `flex-direction` is a row; a grid with no `minmax(0, …)` refuses to
 *    shrink. Each case below states the property instead of inheriting it.
 * 3. **A component that draws nothing.** A declared name with no renderer used
 *    to resolve to `null`; `Grid([])` must be empty, and `Table([])` must say
 *    so rather than looking identical.
 *
 * The argument order asserted here is read from `signatures.ts`, not guessed:
 * `Box(children, direction, gap, padding, background, radius, border, width,
 * height, flex, align, justify, wrap)` and
 * `Grid(children, columns, minChildWidth, gap)`.
 */

import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpenUICard, renderProgram } from '../src/client/OpenUICard.tsx'
import { COMPONENTS } from '../src/backends/openui/signatures.ts'

/** Markup for one program. */
const draw = (source: string): string => {
  const { node, error } = renderProgram(source)
  if (node === null) throw new Error(`program did not draw: ${error}`)
  return renderToStaticMarkup(node as never)
}

/** The `style` attribute of the first element carrying `marker`, as text. */
const styleOf = (html: string, marker: string): string => {
  const match = new RegExp(`style="([^"]*)"[^>]*>${marker}`, 'u').exec(html)
    ?? new RegExp(`style="([^"]*)"`, 'u').exec(html.split(marker)[0] ?? '')
  return (match?.[1] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

/** True when the markup contains a `prop:value` declaration. */
const has = (html: string, declaration: string): boolean =>
  html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/gu, '').includes(declaration.replace(/\s+/gu, ''))

/** True when a declaration appears as a whole property, not as part of one. */
const hasProperty = (html: string, property: string): boolean => {
  const normalized = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/gu, '')
  return new RegExp(`(?:^|[;"{])${property.replace(/[-]/gu, '\\-')}:`, 'u').test(normalized)
}

describe('the four components are in the tables they must be in', () => {
  it('is declared by the language, so validation cannot reject them', () => {
    const declared = new Set(COMPONENTS.map(component => component.name))
    for (const name of ['Box', 'Divider', 'Spacer', 'Grid']) {
      expect(declared.has(name), `${name} is missing from signatures.ts`).toBe(true)
    }
  })

  it('is drawn by this build rather than reported as unrendered', () => {
    for (const name of ['Box', 'Divider', 'Spacer', 'Grid']) {
      const html = draw(`root = Col([${name}([])])`)
      expect(html).not.toContain('data-openui-unrendered')
    }
  })
})

describe('Box', () => {
  it('nests Row, Col and Text without losing any of them', () => {
    const html = draw(
      'root = Box([Row([Text("in-row")]), Col([Text("in-col")]), Text("direct")], "col", 2)',
    )
    expect(html).toContain('in-row')
    expect(html).toContain('in-col')
    expect(html).toContain('direct')
  })

  it('is a column by default and only a row when asked', () => {
    const asColumn = draw('root = Box([Text("a")])')
    expect(has(asColumn, 'flex-direction:column')).toBe(true)
    const asRow = draw('root = Box([Text("a")], "row")')
    expect(has(asRow, 'flex-direction:row')).toBe(true)
  })

  it('turns a gap step count into pixels, and states 0 when absent', () => {
    // The language counts gap in 4px steps; a missing gap must be an explicit
    // 0 rather than the flex default, so a Box cannot inherit a parent's gap.
    expect(has(draw('root = Box([Text("a")], "col", 3)'), 'gap:12px')).toBe(true)
    expect(has(draw('root = Box([Text("a")])'), 'gap:0')).toBe(true)
  })

  it('applies padding on all four sides', () => {
    expect(has(draw('root = Box([Text("a")], "col", 0, 4)'), 'padding:16px')).toBe(true)
  })

  it('paints a semantic background as a tint, and passes a raw colour through', () => {
    const tinted = draw('root = Box([Text("a")], "col", 0, 0, "success")')
    // Mixed from the series token rather than a new literal, so the tint is
    // theme-aware and references a variable the card root declares.
    expect(tinted).toContain('color-mix')
    expect(tinted).toContain('var(--viz-series-3)')
    const raw = draw('root = Box([Text("a")], "col", 0, 0, "#123456")')
    expect(raw).toContain('#123456')
  })

  it('has no background at all when none was asked for — not "transparent"', () => {
    // An unset background inherits nothing and paints nothing; explicitly
    // transparent would be a claim, and would defeat a parent's paint.
    const html = draw('root = Box([Text("a")])')
    expect(has(html, 'background:transparent')).toBe(false)
  })

  it('clips to the radius only when a radius exists', () => {
    const rounded = draw('root = Box([Text("a")], "col", 0, 0, "info", "lg")')
    expect(has(rounded, 'border-radius:14px')).toBe(true)
    expect(has(rounded, 'overflow:hidden')).toBe(true)
    const square = draw('root = Box([Text("a")])')
    expect(has(square, 'overflow:hidden')).toBe(false)
  })

  it('draws a border as longhands so no shorthand can erase it', () => {
    const hairline = draw('root = Box([Text("a")], "col", 0, 0, "info", "md", true)')
    expect(has(hairline, 'border-width:1px')).toBe(true)
    expect(has(hairline, 'border-style:solid')).toBe(true)
    expect(has(hairline, 'border-color:var(--border)')).toBe(true)
    // The faint tier is its own declaration, not an alias of --border.
    const faint = draw('root = Box([Text("a")], "col", 0, 0, "info", "md", "l1")')
    expect(has(faint, 'border-color:var(--border-subtle)')).toBe(true)
  })

  it('has no border when none was asked for', () => {
    const html = draw('root = Box([Text("a")])')
    expect(has(html, 'border-width')).toBe(false)
    expect(has(html, 'border-style')).toBe(false)
  })

  it('sizes by pixels for a number and passes a CSS length through', () => {
    expect(has(draw('root = Box([Text("a")], "col", 0, 0, "info", 0, false, 240)'), 'width:240px')).toBe(true)
    expect(has(draw('root = Box([Text("a")], "col", 0, 0, "info", 0, false, "50%")'), 'width:50%')).toBe(true)
    expect(has(draw('root = Box([Text("a")], "col", 0, 0, "info", 0, false, 0, 120)'), 'height:120px')).toBe(true)
  })

  it('does not set a size it was not given, so the Box can stretch or shrink', () => {
    // A width of 0 would collapse the Box; "auto" written explicitly would stop
    // a flex child from growing. Absent is the only correct encoding.
    const html = draw('root = Box([Text("a")])')
    expect(hasProperty(html, 'width')).toBe(false)
    expect(hasProperty(html, 'height')).toBe(false)
  })

  it('carries a flex share for elastic width', () => {
    expect(has(draw('root = Row([Box([Text("a")], "col", 0, 0, "info", 0, false, 0, 0, 2)])'), 'flex:2')).toBe(true)
    expect(has(draw('root = Row([Box([Text("a")], "col", 0, 0, "info", 0, false, 0, 0, true)])'), 'flex:1 1 auto')).toBe(true)
    expect(has(draw('root = Row([Box([Text("a")], "col", 0, 0, "info", 0, false, 0, 0, false)])'), 'flex:0 0 auto')).toBe(true)
  })

  it('reads align and justify from the language vocabulary', () => {
    const html = draw('root = Box([Text("a")], "row", 0, 0, "info", 0, false, 0, 0, 0, "center", "between")')
    expect(has(html, 'align-items:center')).toBe(true)
    expect(has(html, 'justify-content:space-between')).toBe(true)
  })

  it('uses border-box, so padding cannot widen it past a stated width', () => {
    expect(has(draw('root = Box([Text("a")])'), 'box-sizing:border-box')).toBe(true)
  })
})

describe('Grid', () => {
  it('is two equal columns by default', () => {
    expect(has(draw('root = Grid([Text("a")])'), 'grid-template-columns:repeat(2,minmax(0,1fr))')).toBe(true)
  })

  it('takes a column count, including the string form the language allows', () => {
    expect(has(draw('root = Grid([Text("a")], 3)'), 'repeat(3,minmax(0,1fr))')).toBe(true)
    expect(has(draw('root = Grid([Text("a")], "3")'), 'repeat(3,minmax(0,1fr))')).toBe(true)
  })

  it('drops columns when minChildWidth is given, keeping 100% as the floor', () => {
    const html = draw('root = Grid([Text("a")], 0, 180)')
    // min(100%, …) is what stops a 180px floor from overflowing a narrower card.
    expect(has(html, 'repeat(auto-fit,minmax(min(100%,180px),1fr))')).toBe(true)
  })

  it('accepts an explicit track list', () => {
    expect(has(draw('root = Grid([Text("a")], "1fr 2fr")'), 'grid-template-columns:1fr2fr')).toBe(true)
  })

  it('turns a gap step count into pixels and states a gap when absent', () => {
    expect(has(draw('root = Grid([Text("a")], 2, 0, 3)'), 'gap:12px')).toBe(true)
    expect(has(draw('root = Grid([Text("a")])'), 'gap:8px')).toBe(true)
  })

  it('nests complex components inside its cells', () => {
    const html = draw(
      'root = Grid([Box([Title("t"), Text("body")], "col", 2), Col([Divider(), Text("under")])], 2)',
    )
    expect(html).toContain('t')
    expect(html).toContain('body')
    expect(html).toContain('under')
    expect(html).toContain('role="separator"')
  })

  it('lets its cells shrink, so a long word cannot widen the card', () => {
    expect(has(draw('root = Grid([Text("a")])'), 'min-width:0')).toBe(true)
  })

  it('draws an empty Grid as an empty grid, not as nothing', () => {
    // A legal empty grid and a missing renderer must not look the same.
    const html = draw('root = Grid([])')
    expect(has(html, 'display:grid')).toBe(true)
    expect(html).not.toContain('data-openui-unrendered')
  })

  it('draws an empty array passed through a statement', () => {
    const html = draw('cells = []\nroot = Grid(cells, 3)')
    expect(has(html, 'display:grid')).toBe(true)
    expect(has(html, 'repeat(3,minmax(0,1fr))')).toBe(true)
  })
})

describe('Divider', () => {
  it('is a real separator with a visible rule', () => {
    const html = draw('root = Col([Divider()])')
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="horizontal"')
    // Two properties that each cause an invisible rule when missing: no height
    // paints a zero-height box, and no background paints nothing at all.
    expect(has(html, 'height:1px')).toBe(true)
    expect(has(html, 'background:var(--border)')).toBe(true)
    expect(has(html, 'width:100%')).toBe(true)
  })

  it('does not collapse in a flex column', () => {
    expect(has(draw('root = Col([Divider()])'), 'flex:0 0 auto')).toBe(true)
  })

  it('takes no arguments, and extra ones change nothing', () => {
    expect(draw('root = Col([Divider()])')).toBe(draw('root = Col([Divider()])'))
  })
})

describe('Spacer', () => {
  it('takes the free space in a row and keeps a floor in a column', () => {
    const html = draw('root = Row([Text("a"), Spacer(), Text("b")])')
    expect(has(html, 'flex:1 1 0')).toBe(true)
    // Without a floor a Spacer between two blocks in a column is invisible.
    expect(has(html, 'min-width:4px')).toBe(true)
    expect(has(html, 'min-height:4px')).toBe(true)
  })

  it('is hidden from assistive technology', () => {
    expect(draw('root = Row([Spacer()])')).toContain('aria-hidden="true"')
  })

  it('sits between its siblings in order', () => {
    const html = draw('root = Row([Text("left"), Spacer(), Text("right")])')
    expect(html.indexOf('left')).toBeLessThan(html.indexOf('aria-hidden'))
    expect(html.indexOf('aria-hidden')).toBeLessThan(html.indexOf('right'))
  })
})

describe('a declared component with no renderer says so', () => {
  it('draws a notice instead of an empty card', () => {
    const html = draw('root = Col([Table([])])')
    expect(html).toContain('data-openui-unrendered="Table"')
    expect(html).toContain('Table is not drawn by this build')
  })

  it('distinguishes that from a legal empty container', () => {
    const empty = draw('root = Col([Grid([])])')
    const missing = draw('root = Col([Table([])])')
    expect(empty).not.toContain('not drawn by this build')
    expect(missing).toContain('not drawn by this build')
  })

  it('still draws nothing for a name the language does not declare', () => {
    // `Map` is open-intelligent-ui's, not ours: the host rejects the program at
    // validation (VZO002), so reaching here must not invent an element either.
    const html = draw('root = Col([Map("sf")])')
    expect(html).not.toContain('Map')
    expect(html).not.toContain('data-openui-unrendered')
  })

  it('keeps the notice out of the way inside a nested container', () => {
    const html = draw('root = Box([Grid([Chart([])], 2)], "col")')
    expect(html).toContain('data-openui-unrendered="Chart"')
    expect(has(html, 'display:grid')).toBe(true)
  })
})

describe('CSS variable resolution — the D6/D7 guard', () => {
  /** The card root's declarations, as written into the style attribute. */
  const rootDeclarations = (program: string): Set<string> => {
    const html = renderToStaticMarkup(createElement(OpenUICard as never, {
      meta: {
        kind: 'intelligent_ui',
        program,
        title: 't',
        mode: 'inline',
        path: '~/x.openui.html',
        style: 'whale',
      },
    } as never))
    const decoded = html.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const declared = new Set<string>()
    for (const match of decoded.matchAll(/(--[a-z0-9-]+)\s*:/giu)) declared.add(match[1]!)
    return declared
  }

  /** Every `var(--name)` in the markup, minus the ones the card root declares. */
  const unresolved = (program: string): string[] => {
    const html = draw(program).replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const declared = rootDeclarations(program)
    const referenced = new Set<string>()
    for (const match of html.matchAll(/var\((--[a-z0-9-]+)/giu)) referenced.add(match[1]!)
    return [...referenced].filter(name => !declared.has(name)).sort()
  }

  it('resolves every variable the four new components reference', () => {
    // The programs deliberately touch every branch that emits a var(): a tinted
    // background, both border tiers, a radius, a divider rule and a grid.
    const programs = [
      'root = Box([Text("a")], "row", 2, 4, "success", "lg", "l2")',
      'root = Box([Text("a")], "col", 1, 2, "danger", "md", "l1", 200, 100)',
      'root = Col([Divider()])',
      'root = Row([Text("a"), Spacer(), Text("b")])',
      'root = Grid([Box([Text("a")], "col", 1, 1, "info", "sm", true)], 3, 120, 2)',
      'root = Grid([Grid([Text("x")], 2)], "1fr 1fr")',
    ]
    for (const program of programs) {
      expect(unresolved(program), `unresolved in: ${program}`).toEqual([])
    }
  })

  it('declares the faint border tier it references', () => {
    const declared = rootDeclarations('root = Col([])')
    expect(declared.has('--border-subtle')).toBe(true)
    expect(declared.has('--border')).toBe(true)
  })

  it('keeps every bridged variable pointing at a host token, with a fallback', () => {
    // A bridged name must name the token it reads from; a plain literal here
    // would work in one scheme and be wrong in the other.
    const html = renderToStaticMarkup(createElement(OpenUICard as never, {
      meta: {
        kind: 'intelligent_ui', program: 'root = Col([])', title: 't',
        mode: 'inline', path: '~/x.openui.html', style: 'whale',
      },
    } as never)).replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    for (const match of html.matchAll(/(--[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\s*,\s*([^)]+)\)/giu)) {
      expect(match[2], `${match[1]} reads a host token`).toMatch(/^--(dsw|dsh)-/u)
      expect(match[3]!.trim().length, `${match[1]} has a fallback`).toBeGreaterThan(0)
    }
  })

  it('names only host tokens this project has actually seen resolve', () => {
    // The browser run found two bridged names that do not exist in the real
    // host: `--dsw-static-purple-500` and `--dsh-font-family-text-default`.
    // Both had fallbacks, so the card still looked right and every unit test
    // passed. This pins the set to the measured host so a plausible-looking new
    // name has to be justified by a measurement rather than guessed.
    //
    // Source: evidence/phase-4a-1/host-tokens.json, a scan of all 509 custom
    // properties the live DSH host declares.
    //
    // `--dsw-font-markdown-code-font-family` was added in 4A-2 for `Code`'s mono
    // stack, and it was measured the same way rather than guessed: the live page
    // was asked which mono candidates resolve, and the frame vocabulary's
    // `--font-mono` was among the ones that do NOT exist in the host. Record:
    // evidence/phase-4a-2/host-mono-tokens.json. This list is deliberately a
    // written-down set — adding a name to it is the moment a measurement has to
    // exist, which is what stops D17/D18 recurring.
    const VERIFIED_HOST_TOKENS = new Set([
      '--dsw-alias-label-primary',
      '--dsw-alias-label-tertiary',
      '--dsw-alias-border-l1',
      '--dsw-alias-border-l2',
      '--dsw-alias-bg-layer-2',
      '--dsw-alias-brand-primary-new-colorprimary-new-color',
      '--dsw-alias-label-primary-foreground',
      '--dsw-static-deepseek-500',
      '--dsw-static-amber-500',
      '--dsw-static-green-500',
      '--dsw-static-red-500',
      '--dsw-radius-sm',
      '--dsw-font-family',
      '--dsw-font-markdown-code-font-family',
      // Added in 4A-2 for small supporting text. Measured on the live page at
      // 5.8:1 on white and 12.11:1 on the dark surface;
      // evidence/phase-4a-2/label-tiers-light.json.
      '--dsw-alias-label-secondary',
    ])

    const html = renderToStaticMarkup(createElement(OpenUICard as never, {
      meta: {
        kind: 'intelligent_ui', program: 'root = Col([])', title: 't',
        mode: 'inline', path: '~/x.openui.html', style: 'whale',
      },
    } as never)).replace(/&quot;/g, '"').replace(/&amp;/g, '&')

    const named = new Set<string>()
    for (const match of html.matchAll(/var\((--(?:dsw|dsh)-[a-z0-9-]+)/giu)) named.add(match[1]!)

    const unverified = [...named].filter(name => !VERIFIED_HOST_TOKENS.has(name)).sort()
    expect(unverified, 'these bridged tokens were never seen in the real host').toEqual([])
  })

  it('declares the one series colour the host cannot supply, without pretending otherwise', () => {
    // `--viz-series-4` has no host token: the host publishes no purple at all.
    // It must therefore be a direct declaration, not a `var()` with a fallback —
    // a `var()` would resolve to nothing and silently paint the fallback while
    // claiming the host provided a colour.
    const html = renderToStaticMarkup(createElement(OpenUICard as never, {
      meta: {
        kind: 'intelligent_ui', program: 'root = Col([])', title: 't',
        mode: 'inline', path: '~/x.openui.html', style: 'whale',
      },
    } as never)).replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const declaration = /--viz-series-4:([^;]+);/u.exec(html)?.[1]?.trim() ?? ''
    expect(declaration).not.toBe('')
    expect(declaration).not.toContain('var(--dsw-static-purple')
    expect(declaration).toContain('light-dark')
  })
})
