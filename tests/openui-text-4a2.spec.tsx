// @vitest-environment jsdom

/**
 * Stage 4A-2 — `Label`, `Badge`, `Link`, `List`, `ListItem`, `Quote`, `Code`.
 *
 * These seven complete the Text group, so the thing that can be wrong is mostly
 * *semantics* rather than layout: what a marker word means, what happens to an
 * entry that is not a `ListItem`, and — the reason this file is longer than the
 * four components would suggest — what a `Link` is allowed to be.
 *
 * Three risks are specific to this batch and each has its own section below:
 *
 * 1. **`Link` is the first component whose output a reader can activate**, and
 *    the card is mounted in the host document, not in the HTML backend's sandbox
 *    frame. A `javascript:` href would run in the DSH host's own origin. The
 *    policy is ADR-008 and it is a positive list: an absolute `http:`/`https:`
 *    URL, and nothing else. The negative cases are asserted here because they
 *    are cheap to assert and impossible to notice by eye.
 * 2. **A `var()` that resolves to nothing still paints a fallback.** This is
 *    D6/D7/D17/D18, and `Code` is the fourth component to reach for a mono font.
 *    `--font-mono` does not exist in the host document; the bridged token was
 *    measured first (`evidence/phase-4a-2/host-mono-tokens.json`) and the
 *    three-layer guard at the bottom of this file keeps it honest.
 * 3. **The argument order is the signature table's, not a guess.** Every
 *    position is asserted against what `signatures.ts` declares, because a
 *    renderer that reads `props[1]` where the table means `props[2]` draws
 *    something plausible and wrong.
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
  return decode(renderToStaticMarkup(node as never))
}

/** Undo the entities React escapes so assertions can read the real markup. */
const decode = (html: string): string => html.replace(/&quot;/g, '"').replace(/&amp;/g, '&')

/** True when the markup contains a declaration, ignoring whitespace. */
const has = (html: string, declaration: string): boolean =>
  html.replace(/\s+/gu, '').includes(declaration.replace(/\s+/gu, ''))

/** The whole card root's markup, for the variable guard. */
const cardMarkup = (program: string): string => decode(renderToStaticMarkup(createElement(OpenUICard as never, {
  meta: {
    kind: 'intelligent_ui', program, title: 't',
    mode: 'inline', path: '~/x.openui.html', style: 'whale',
  },
} as never)))

/** The declarations the card root carries. */
const rootDeclarations = (program: string): Set<string> => {
  const html = cardMarkup(program)
  const declared = new Set<string>()
  for (const match of html.matchAll(/(--[a-z0-9-]+)\s*:/giu)) declared.add(match[1]!)
  return declared
}

/** Variables a program references but the card root does not declare. */
const unresolved = (program: string): string[] => {
  // The program's own markup, not the card root's: the root legitimately
  // *declares* the bridged host tokens, so including it would filter out
  // everything and make this guard vacuous.
  const html = draw(program)
  const declared = rootDeclarations(program)
  const referenced = new Set<string>()
  for (const match of html.matchAll(/var\((--[a-z0-9-]+)/giu)) referenced.add(match[1]!)
  return [...referenced].filter(name => !declared.has(name)).sort()
}

// ---------------------------------------------------------------------------
// The tables agree
// ---------------------------------------------------------------------------

describe('the seven components are in the tables they must be in', () => {
  const SEVEN = ['Label', 'Badge', 'Link', 'List', 'ListItem', 'Quote', 'Code'] as const

  it('is declared by the language, so validation cannot reject them', () => {
    const declared = new Set(COMPONENTS.map(component => component.name))
    for (const name of SEVEN) {
      expect(declared.has(name), `${name} is missing from signatures.ts`).toBe(true)
    }
  })

  it('is declared in the Text group, which is what this batch closes', () => {
    const textGroup = COMPONENTS.filter(component => component.group === 'Text').map(c => c.name)
    for (const name of SEVEN) {
      expect(textGroup, `${name} should be in the Text group`).toContain(name)
    }
  })

  it('is drawn by this build rather than reported as unrendered', () => {
    const programs: Record<string, string> = {
      Label: 'root = Label("x")',
      Badge: 'root = Col([Badge("x")])',
      Link: 'root = Col([Link("x", "https://example.com")])',
      List: 'root = List(["x"])',
      ListItem: 'root = Col([ListItem("x")])',
      Quote: 'root = Col([Quote("x")])',
      Code: 'root = Col([Code("x")])',
    }
    for (const [name, program] of Object.entries(programs)) {
      expect(draw(program), `${name} still reports itself unrendered`).not.toContain('data-openui-unrendered')
    }
  })
})

// ---------------------------------------------------------------------------
// Label / Badge
// ---------------------------------------------------------------------------

describe('Label', () => {
  it('draws its text', () => {
    expect(draw('root = Label("Field name")')).toContain('Field name')
  })

  it('is a block that does not overflow a narrow card', () => {
    const html = draw('root = Label("averylongwordthatcannotbreak")')
    expect(has(html, 'overflow-wrap:anywhere')).toBe(true)
  })

  it('renders an empty label without throwing', () => {
    expect(draw('root = Label("")')).toBeTypeOf('string')
  })
})

describe('Badge', () => {
  it('draws its text', () => {
    expect(draw('root = Col([Badge("new")])')).toContain('new')
  })

  it('carries colour with a dot and a tint, not with low-contrast text', () => {
    // Upstream's comment records the defect: painting a text token as its own
    // background made the label invisible, and tinted text at 11px failed
    // contrast. So the text stays foreground and the colour rides on a dot.
    const html = draw('root = Col([Badge("new", "success")])')
    expect(has(html, 'color-mix')).toBe(true)
    // The badge text itself must not be painted in the series colour.
    expect(html).toContain('new')
  })

  it('falls back to a neutral fill when no colour is given', () => {
    const html = draw('root = Col([Badge("plain")])')
    expect(has(html, 'var(--viz-grid)')).toBe(true)
  })

  it('accepts every colour word the signature table declares', () => {
    for (const word of ['info', 'success', 'warning', 'danger', 'purple', 'pink']) {
      const html = draw(`root = Col([Badge("b", "${word}")])`)
      expect(html, `${word} did not draw`).toContain('b')
    }
  })
})

// ---------------------------------------------------------------------------
// Link — ADR-008. The security section of this batch.
// ---------------------------------------------------------------------------

describe('Link allows only an absolute http(s) URL', () => {
  it('renders an anchor with rel and target for https', () => {
    const html = draw('root = Col([Link("docs", "https://example.com/docs")])')
    expect(html).toContain('href="https://example.com/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toMatch(/rel="[^"]*noreferrer/u)
    expect(html).toMatch(/rel="[^"]*noopener/u)
  })

  it('renders an anchor for http', () => {
    const html = draw('root = Col([Link("docs", "http://example.com")])')
    expect(html).toContain('href="http://example.com"')
  })

  it('keeps the label visible when it refuses the target', () => {
    // The degradation must still draw the text. Drawing nothing would look like
    // an intentionally empty card, which this project has already named a defect.
    const html = draw('root = Col([Link("the label", "javascript:alert(1)")])')
    expect(html).toContain('the label')
    expect(html).not.toContain('javascript:')
  })

  // Each case is a target the component must refuse. `javascript:` and
  // `data:` are the execution and phishing hazards; `file:` is local access;
  // the rest are values upstream's looser regex would have admitted.
  const REFUSED = [
    ['javascript:', 'javascript:alert(1)'],
    ['javascript: with mixed case', 'JavaScript:alert(1)'],
    ['javascript: with a newline', 'java\nscript:alert(1)'],
    ['data:', 'data:text/html,<script>alert(1)</script>'],
    ['file:', 'file:///C:/Windows/System32/drivers/etc/hosts'],
    ['vbscript:', 'vbscript:msgbox(1)'],
    ['blob:', 'blob:https://example.com/abc'],
    ['about:', 'about:blank'],
    ['protocol-relative', '//evil.example.com/x'],
    ['root-relative', '/docs/page'],
    ['fragment', '#section'],
    ['relative', 'docs/page.html'],
    ['mailto:', 'mailto:someone@example.com'],
    ['tel:', 'tel:+8610000000000'],
    ['ftp:', 'ftp://example.com/x'],
    ['unparseable', 'http://[not a url'],
    ['empty', ''],
  ] as const

  for (const [label, target] of REFUSED) {
    it(`refuses ${label} and draws plain text instead`, () => {
      const html = draw(`root = Col([Link("label text", ${JSON.stringify(target)})])`)
      expect(html, `${label} produced an href`).not.toContain('href=')
      expect(html, `${label} should still show its label`).toContain('label text')
    })
  }

  it('refuses a URL the model supplied through a variable', () => {
    // The same policy must apply to an evaluated argument, not only to a literal:
    // a binding is resolved before the renderer sees it.
    const html = draw('$u = "javascript:alert(1)"\nroot = Col([Link("t", $u)])')
    expect(html).not.toContain('href=')
  })
})

// ---------------------------------------------------------------------------
// List / ListItem
// ---------------------------------------------------------------------------

describe('List', () => {
  it('draws one row per entry, in order', () => {
    const html = draw('root = List(["first", "second", "third"])')
    const order = ['first', 'second', 'third'].map(text => html.indexOf(text))
    expect(order.every(index => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('numbers rows with the number marker', () => {
    const html = draw('root = List(["a", "b"], "number")')
    expect(html).toContain('1.')
    expect(html).toContain('2.')
  })

  it('defaults to bullets', () => {
    expect(draw('root = List(["a"])')).toContain('\u2022')
  })

  it('draws a check marker', () => {
    expect(draw('root = List(["done"], "check")')).toContain('\u2713')
  })

  it('draws a dash marker', () => {
    expect(draw('root = List(["x"], "dash")')).toContain('\u2013')
  })

  it('omits the marker column entirely for "none"', () => {
    const html = draw('root = List(["plain"], "none")')
    expect(html).toContain('plain')
    expect(html).not.toContain('\u2022')
  })

  it('is a role=list with role=listitem rows', () => {
    const html = draw('root = List(["a", "b"])')
    expect(has(html, 'role:list')).toBe(false) // role is an attribute, not a style
    expect(html).toContain('role="list"')
    expect((html.match(/role="listitem"/gu) ?? []).length).toBe(2)
  })

  it('lets a nested ListItem supply its own marker and description', () => {
    const html = draw('root = List([ListItem("Title", "Desc", "dash")])')
    expect(html).toContain('Title')
    expect(html).toContain('Desc')
    expect(html).toContain('\u2013')
  })

  it('draws a nested ListItem as exactly one row, not one row wrapped in another', () => {
    // Found in the live browser run, not by a test: `List([ListItem(...)])`
    // produced TWO `role="listitem"` elements for one item — the walker drew the
    // ListItem into a complete row, and List then wrapped that row in a second
    // one. The card showed five rows for a four-item program, with the bullet
    // row containing the check row. Fixed by letting List consult the raw
    // descriptor; this test is the regression guard.
    const html = draw('root = List([ListItem("Unique", "D", "check")])')
    expect((html.match(/role="listitem"/gu) ?? []).length, 'one item is one row').toBe(1)
    expect((html.match(/Unique/gu) ?? []).length, 'the title is drawn once').toBe(1)
    expect(html).toContain('\u2713')
    expect(html, 'the list marker must not also be drawn').not.toContain('\u2022')
  })

  it('draws N plain items as N rows', () => {
    // The other half of the same contract: the row count tracks the item count.
    for (const count of [1, 2, 3, 5]) {
      const items = Array.from({ length: count }, (_, i) => `"i${i}"`).join(', ')
      const html = draw(`root = List([${items}])`)
      expect((html.match(/role="listitem"/gu) ?? []).length, `${count} items`).toBe(count)
    }
  })

  it('draws an empty list without throwing', () => {
    expect(draw('root = List([])')).toBeTypeOf('string')
  })

  it('caps a very long list and says so rather than ending silently', () => {
    const items = Array.from({ length: 260 }, (_, i) => `"item${i}"`).join(', ')
    const html = draw(`root = List([${items}])`)
    expect(html).toContain('Showing 200 of 260 items')
    // The tail must be absent, not merely unmentioned.
    expect(html).not.toContain('item259')
  })

  it('draws a timeline with a dot per row', () => {
    const html = draw('root = List([ListItem("a"), ListItem("b")], "bullet", true)')
    expect(html).toContain('a')
    expect(html).toContain('b')
  })
})

describe('ListItem', () => {
  it('draws title and description', () => {
    const html = draw('root = Col([ListItem("The title", "The description")])')
    expect(html).toContain('The title')
    expect(html).toContain('The description')
  })

  it('draws nested children', () => {
    const html = draw('root = Col([ListItem("T", "D", "bullet", [Text("nested")])])')
    expect(html).toContain('nested')
  })

  it('is a listitem', () => {
    expect(draw('root = Col([ListItem("T")])')).toContain('role="listitem"')
  })
})

// ---------------------------------------------------------------------------
// Quote / Code
// ---------------------------------------------------------------------------

describe('Quote', () => {
  it('draws the quotation', () => {
    expect(draw('root = Col([Quote("To be or not to be")])')).toContain('To be or not to be')
  })

  it('draws the citation when there is one', () => {
    const html = draw('root = Col([Quote("words", "Shakespeare")])')
    expect(html).toContain('Shakespeare')
  })

  it('draws no citation block when the argument is absent', () => {
    const html = draw('root = Col([Quote("words")])')
    expect(html).toContain('words')
  })

  it('uses a blockquote with a side rule in the brand colour', () => {
    const html = draw('root = Col([Quote("w")])')
    expect(html).toContain('<blockquote')
    expect(has(html, 'border-left-color:var(--primary)')).toBe(true)
  })
})

describe('Code', () => {
  it('draws the code text', () => {
    expect(draw('root = Col([Code("let x = 1")])')).toContain('let x = 1')
  })

  it('draws the language label', () => {
    expect(draw('root = Col([Code("x", "typescript")])')).toContain('typescript')
  })

  it('offers a copy control', () => {
    const html = draw('root = Col([Code("x")])')
    expect(html).toContain('<button')
    expect(html).toContain('Copy')
  })

  it('uses a monospace family that the host actually publishes', () => {
    // The frame vocabulary's `--font-mono` does not exist in the host document.
    // Measured first: evidence/phase-4a-2/host-mono-tokens.json. This asserts the
    // bridge exists and reads a real host token rather than a bare literal.
    const html = draw('root = Col([Code("x")])')
    expect(has(html, 'font-family:var(--font-mono)')).toBe(true)
    const bridge = /--font-mono:var\((--[a-z0-9-]+)/iu.exec(cardMarkup('root = Col([Code("x")])'))
    expect(bridge?.[1]).toBe('--dsw-font-markdown-code-font-family')
  })

  it('preserves whitespace and newlines in the code', () => {
    const html = draw('root = Col([Code("line one\\nline two")])')
    expect(has(html, 'white-space:pre')).toBe(true)
  })

  it('does not interpret the code as markup', () => {
    // The whole point of this backend: the model writes a program, not markup.
    const html = draw('root = Col([Code("<b>bold</b>")])')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
    expect(html).not.toContain('<b>bold</b>')
  })
})

// ---------------------------------------------------------------------------
// CSS variables — the D6/D7/D17/D18 guard
// ---------------------------------------------------------------------------

describe('CSS variable resolution — the D6/D7 guard', () => {
  it('resolves every variable the seven new components reference', () => {
    // Programs chosen to touch every branch that emits a var(): a tinted badge
    // fill, a badge dot, the link colour, the marker columns, the quote rule and
    // the code block's mono family, border and background.
    const programs = [
      'root = Label("a")',
      'root = Col([Badge("b", "success")])',
      'root = Col([Badge("b")])',
      'root = Col([Link("l", "https://example.com")])',
      'root = List(["a", "b"], "number")',
      'root = List([ListItem("t", "d", "check")], "bullet", true)',
      'root = Col([ListItem("t", "d", "bullet", [Text("n")])])',
      'root = Col([Quote("q", "c")])',
      'root = Col([Code("x", "ts")])',
    ]
    for (const program of programs) {
      expect(unresolved(program), `unresolved in: ${program}`).toEqual([])
    }
  })

  it('declares the mono bridge it references', () => {
    expect(rootDeclarations('root = Label("a")').has('--font-mono')).toBe(true)
  })

  it('keeps every bridged variable pointing at a host token, with a fallback', () => {
    const html = cardMarkup('root = Label("a")')
    for (const match of html.matchAll(/(--[a-z0-9-]+)\s*:\s*var\((--[a-z0-9-]+)\s*,\s*([^)]+)\)/giu)) {
      expect(match[2], `${match[1]} reads a host token`).toMatch(/^--(dsw|dsh)-/u)
      expect(match[3]!.trim().length, `${match[1]} has a fallback`).toBeGreaterThan(0)
    }
  })

  it('declares the two variables that have no single host token, without pretending', () => {
    // `--viz-series-4` (4A-1) and `--link` (4A-2) are the two names with no host
    // token that clears AA in both schemes. Both must be *declared* literals, not
    // `var()` bridges: a bridge would resolve to nothing or to a failing colour
    // and still paint, which is exactly D17/D18.
    const html = cardMarkup('root = Label("a")')
    for (const name of ['--viz-series-4', '--link']) {
      const declaration = new RegExp(`${name}:([^;]+);`, 'u').exec(html)?.[1]?.trim() ?? ''
      expect(declaration, `${name} must be declared`).not.toBe('')
      expect(declaration, `${name} must not be a var() bridge`).not.toMatch(/^var\(/u)
      expect(declaration, `${name} must resolve per scheme`).toContain('light-dark')
    }
  })

  it('does not paint a link with --primary, which is a surface fill', () => {
    // `--primary` is the brand fill the Button uses behind white text. As 16px
    // link text on white it measures 4.23:1, below AA; this pins that the link
    // uses its own contrast-checked colour instead.
    const html = draw('root = Col([Link("l", "https://example.com")])')
    expect(html).toContain('color:var(--link)')
    expect(html).not.toContain('color:var(--primary)')
  })
})
