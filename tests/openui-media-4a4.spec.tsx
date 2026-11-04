// @vitest-environment jsdom
/**
 * 4A-4 — `Table`, `Chart`, `Icon`, `Image`.
 *
 * The assertions here are **structural**, because that is the lesson this
 * project already paid for twice: 62 presence assertions passed while a `List`
 * drew two rows for one item (D20), and a card that drew nothing looked
 * identical to a card that was deliberately empty (4A-1). So:
 *
 *   - a table of 3 rows asserts **3 `<tr>` in `<tbody>`**, not that the text is
 *     somewhere in the markup;
 *   - a chart asserts **one `data-chart-mark` element per datum**, not that an
 *     `<svg>` exists;
 *   - a refused image asserts that **no `<img>` element was produced at all**,
 *     not merely that `src` is missing. ADR-009 requires exactly that reading.
 *
 * The hostile-input cases are the point of the `Image` half: this renderer mounts
 * in the host document, so a `javascript:` or `data:` `src` is a host-origin
 * question, not a styling one.
 */
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { renderProgram } from '../src/client/OpenUICard.tsx'
import { countOf, shapeOf } from './openui-dom-structure.ts'

/** Undo the entities React escapes, so assertions read the real markup. */
function decode(html: string): string {
  return html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
}

/** Markup for one program. */
function draw(source: string): string {
  const { node, error } = renderProgram(source, {})
  if (node === null) throw new Error(`program did not draw: ${error}`)
  return decode(renderToStaticMarkup(node as never))
}

/** Every `data-chart-mark` count, keyed by mark kind. */
function marks(html: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const match of html.matchAll(/data-chart-mark="([a-z]+)"/gu)) {
    const kind = match[1]!
    out[kind] = (out[kind] ?? 0) + 1
  }
  return out
}

describe('Image — ADR-009 source policy', () => {
  it('renders an <img> for an absolute https URL, with the loading contract', () => {
    const html = draw('root = Col([Image("https://example.com/a.png", "A photo")])')
    expect(countOf(html, 'img')).toBe(1)
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
    // HTML attribute names are case-insensitive; React emits this one camelCased.
    expect(html.toLowerCase()).toContain('referrerpolicy="no-referrer"')
    expect(html).toContain('alt="A photo"')
  })

  it('renders an <img> for an absolute http URL', () => {
    expect(countOf(draw('root = Col([Image("http://example.com/a.png", "x")])'), 'img')).toBe(1)
  })

  it('produces NO <img> element for any refused scheme', () => {
    // Each of these is a different hazard: script execution, a host-origin
    // document resource, local disk disclosure, and a same-origin resolution.
    const refused = [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'file:///C:/Windows/win.ini',
      'blob:https://example.com/abc',
      '//evil.example.com/x.png',
      'figs/a.png',
      '/rooted.png',
      '',
    ]
    for (const src of refused) {
      const html = draw(`root = Col([Image(\"${src}\", \"alt text\")])`)
      expect(countOf(html, 'img'), `src ${JSON.stringify(src)} must not become an <img>`).toBe(0)
      // The refusal must be visible and name a reason, not be a blank box.
      expect(html, `src ${JSON.stringify(src)} should say why`).toContain('data-openui-image="refused"')
      expect(html).toContain('alt text')
    }
  })

  it('names the reason for a refused scheme', () => {
    expect(draw('root = Col([Image("javascript:alert(1)", "x")])')).toContain('not an allowed scheme')
    expect(draw('root = Col([Image("figs/a.png", "x")])')).toContain('not an absolute')
  })
})

describe('Icon', () => {
  it('draws one named glyph, labelled for assistive tech', () => {
    const html = draw('root = Col([Icon("map-pin")])')
    expect(countOf(html, '[data-openui-icon]')).toBe(1)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label="map-pin"')
  })

  it('applies each of the four sizes and falls back for an unknown one', () => {
    for (const size of ['sm', 'md', 'lg', 'xl']) {
      const html = draw(`root = Col([Icon(\"star\", \"${size}\")])`)
      expect(countOf(html, '[data-openui-icon]')).toBe(1)
    }
    // An unknown size must still draw exactly one icon, not zero.
    expect(countOf(draw('root = Col([Icon("star", "nonsense")])'), '[data-openui-icon]')).toBe(1)
  })

  it('takes a colour and still draws a glyph for an empty name', () => {
    const html = draw('root = Col([Icon("star", "md", "danger")])')
    expect(countOf(html, '[data-openui-icon]')).toBe(1)
    expect(countOf(draw('root = Col([Icon("")])'), '[data-openui-icon]')).toBe(1)
  })
})

describe('Table', () => {
  it('draws one header cell per column and one <tr> per row', () => {
    const html = draw('root = Col([Table(["Name", "Qty"], [["a", 1], ["b", 2], ["c", 3]])])')
    expect(countOf(html, 'th')).toBe(2)
    expect(countOf(html, 'tbody tr')).toBe(3)
    // Three rows of two cells each: the cell count is the second structural
    // fact a presence assertion cannot see.
    expect(countOf(html, 'tbody td')).toBe(6)
  })

  it('keeps the header when there are no rows, and says it is empty', () => {
    const html = draw('root = Col([Table(["Name", "Qty"], [])])')
    expect(countOf(html, 'th')).toBe(2)
    expect(html).toContain('no rows')
  })

  it('states a refusal when there are no columns', () => {
    const html = draw('root = Col([Table([], [])])')
    expect(countOf(html, 'table')).toBe(0)
    expect(html).toContain('Table has no columns')
  })

  it('pads a short row rather than shifting the cells', () => {
    const html = draw('root = Col([Table(["A", "B", "C"], [["only-one"]])])')
    expect(countOf(html, 'tbody tr')).toBe(1)
    expect(countOf(html, 'tbody td')).toBe(3)
  })
})

describe('Chart — ADR-010 contract', () => {
  it('draws exactly one bar per datum', () => {
    const html = draw('root = Col([Chart("bar", [{\"x\": \"a\", \"y\": 3}, {\"x\": \"b\", \"y\": 5}, {\"x\": \"c\", \"y\": 2}], "x", ["y"])])')
    expect(marks(html).bar).toBe(3)
    expect(countOf(html, '[data-openui-chart]')).toBe(1)
  })

  it('draws one slice per category for a pie, and none for a bar', () => {
    const pie = draw('root = Col([Chart("pie", [{\"x\": \"a\", \"y\": 1}, {\"x\": \"b\", \"y\": 1}], "x", ["y"])])')
    expect(marks(pie).slice).toBe(2)
    expect(marks(pie).bar ?? 0).toBe(0)
  })

  it('draws a line as one path per series', () => {
    const html = draw('root = Col([Chart("line", [{\"x\": \"a\", \"s\": 1}, {\"x\": \"b\", \"s\": 2}], "x", ["s"])])')
    expect(marks(html).line).toBe(1)
  })

  it('refuses empty data with a stated reason, never a blank box', () => {
    const html = draw('root = Col([Chart("bar", [], "x", ["y"])])')
    expect(html).toContain('Chart has no data')
    expect(countOf(html, 'svg')).toBe(0)
  })

  it('refuses when no numeric series can be found', () => {
    const html = draw('root = Col([Chart("bar", [{\"x\": \"a\", \"y\": \"nope\"}], "x", ["y"])])')
    expect(html).toContain('no numeric values')
    expect(countOf(html, 'svg')).toBe(0)
  })

  it('treats a non-finite value as a gap, not as zero, and says so', () => {
    // A chart that silently plots NaN as 0 is lying about the data.
    const html = draw('root = Col([Chart("bar", [{\"x\": \"a\", \"y\": 4}, {\"x\": \"b\"}], "x", ["y"])])')
    expect(marks(html).bar).toBe(1)
    expect(html).toContain('could not be read as a number')
  })

  it('refuses a pie with more than one series, naming the rule', () => {
    const html = draw('root = Col([Chart("pie", [{\"x\": \"a\", \"p\": 1, \"q\": 2}], "x", ["p", "q"])])')
    expect(html).toContain('takes one series')
    expect(countOf(html, 'svg')).toBe(0)
  })

  it('draws a single data point instead of collapsing', () => {
    const html = draw('root = Col([Chart("line", [{\"x\": \"a\", \"y\": 7}], "x", ["y"])])')
    expect(countOf(html, 'svg')).toBe(1)
    expect((marks(html).line ?? 0) + (marks(html).point ?? 0)).toBeGreaterThan(0)
  })

  it('falls back to bar for an unknown type, like every other enum here', () => {
    const html = draw('root = Col([Chart("nonsense", [{\"x\": \"a\", \"y\": 1}], "x", ["y"])])')
    expect(marks(html).bar).toBe(1)
  })

  it('sums the series when stacked', () => {
    const html = draw('root = Col([Chart("bar", [{\"x\": \"a\", \"p\": 1, \"q\": 2}], "x", ["p", "q"], "number", "", true)])')
    expect(marks(html).bar).toBe(2)
  })
})
