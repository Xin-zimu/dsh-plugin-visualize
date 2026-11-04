// @vitest-environment jsdom

/**
 * 4A-5 — the two decisions whose arithmetic can be tested without a browser.
 *
 * ADR-011 puts every SVG string argument through its own grammar; ADR-012 puts
 * every popover placement through one pure function. Both were written as
 * modules rather than inline code for exactly this reason: a jsdom test has no
 * layout engine, so the only way to test "the panel stays inside the card" is
 * to hand the arithmetic rectangles directly.
 *
 * The refused-value cases are the point of the SVG half. Each one is a string
 * that would reach the DOM in a renderer that passed arguments through, and the
 * assertion is not "it looks wrong" but **the argument is undefined**, which is
 * the only value that cannot become an attribute.
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_COORDINATE,
  svgLength,
  svgNumber,
  svgOpacity,
  svgPaint,
  svgPath,
  svgPoints,
  svgTransform,
  svgViewBox,
} from '../src/client/openui-svg.ts'
import { insideCard, placePopover, type Box } from '../src/client/openui-popover.ts'

const TOKENS = { ink: 'var(--foreground)', danger: 'var(--viz-series-5)' }

describe('ADR-011 — numbers', () => {
  it('accepts an SVG number in both argument forms', () => {
    expect(svgNumber(12)).toBe(12)
    expect(svgNumber('-3.5')).toBe(-3.5)
    expect(svgNumber('1e3')).toBe(1000)
    expect(svgNumber('.5')).toBe(0.5)
  })

  it('refuses what is not an SVG number, rather than coercing it', () => {
    // Number() would accept every one of these, and each would become a
    // coordinate the author never wrote.
    for (const value of ['0x10', '1_0', '1,5', '+', '', ' ', 'abc', '1px', 'Infinity', 'NaN']) {
      expect(svgNumber(value), JSON.stringify(value)).toBeUndefined()
    }
    expect(svgNumber(Number.NaN)).toBeUndefined()
    expect(svgNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(svgNumber(undefined)).toBeUndefined()
    expect(svgNumber({})).toBeUndefined()
  })

  it('clamps magnitude and refuses negative lengths', () => {
    expect(svgNumber(1e9)).toBe(MAX_COORDINATE)
    expect(svgLength(-4)).toBe(0)
    expect(svgLength(4)).toBe(4)
    expect(svgOpacity(1.4)).toBe(1)
    expect(svgOpacity(-1)).toBe(0)
    // Absent is opaque, not transparent: the two must stay distinguishable.
    expect(svgOpacity(undefined)).toBeUndefined()
  })
})

describe('ADR-011 — viewBox', () => {
  it('normalises a readable viewBox', () => {
    expect(svgViewBox('0 0 240 160')).toBe('0 0 240 160')
    expect(svgViewBox(' 0,0 , 240 ,160 ')).toBe('0 0 240 160')
  })

  it('refuses a viewBox with no extent, which would draw nothing', () => {
    expect(svgViewBox('0 0 0 160')).toBeUndefined()
    expect(svgViewBox('0 0 240 0')).toBeUndefined()
    expect(svgViewBox('0 0 -240 160')).toBeUndefined()
  })

  it('refuses a viewBox that is not four numbers', () => {
    for (const value of ['0 0 240', '0 0 240 160 1', 'a b c d', '', '0 0 240 160px']) {
      expect(svgViewBox(value), JSON.stringify(value)).toBeUndefined()
    }
  })
})

describe('ADR-011 — transform grammar', () => {
  it('accepts the six functions at their valid arities', () => {
    expect(svgTransform('rotate(30 50 50)')).toBe('rotate(30 50 50)')
    expect(svgTransform('translate(10)')).toBe('translate(10)')
    expect(svgTransform('translate(10, 20)')).toBe('translate(10 20)')
    expect(svgTransform('scale(2)')).toBe('scale(2)')
    expect(svgTransform('skewX(7)')).toBe('skewX(7)')
    expect(svgTransform('matrix(1 0 0 1 0 0)')).toBe('matrix(1 0 0 1 0 0)')
  })

  it('re-emits the parsed numbers, so the attribute is this file\'s string', () => {
    // '030' is a valid SVG number; the re-emitted form drops the leading zero.
    expect(svgTransform('translate( 010 , 020 )')).toBe('translate(10 20)')
    expect(svgTransform('rotate( 030 050 050 )')).toBe('rotate(30 50 50)')
    expect(svgTransform('translate(1e2)')).toBe('translate(100)')
  })

  it('refuses the whole argument when any part is malformed', () => {
    // Partial application would draw a shape the author never asked for.
    for (const value of [
      'rotate(30 50)',        // wrong arity
      'scale()',             // no arguments
      'spin(3)',             // not a transform
      'rotate(30)junk',      // trailing text
      'rotate(30);color:red',
      'rotate(30) scale(1) translate(1) rotate(1) scale(2)', // five functions
      'translate(1 2 3)',
      'matrix(1 0 0 1)',
      '',
    ]) {
      expect(svgTransform(value), JSON.stringify(value)).toBeUndefined()
    }
  })

  it('cannot carry a second declaration or a reference', () => {
    for (const value of ['rotate(30)"', 'translate(url(x))', 'rotate(30) url(#a)']) {
      expect(svgTransform(value), JSON.stringify(value)).toBeUndefined()
    }
  })
})

describe('ADR-011 — path grammar', () => {
  it('accepts a path and re-serialises it', () => {
    expect(svgPath('M 0 0 L 10 10')).toBe('M 0 0 L 10 10')
    expect(svgPath('M0,0L10,10Z')).toBe('M 0 0 L 10 10 Z')
    expect(svgPath('M 0 0 C 1 1 2 2 3 3')).toBe('M 0 0 C 1 1 2 2 3 3')
    // SVG's implicit repetition is real syntax and is allowed.
    expect(svgPath('M 0 0 10 10')).toBe('M 0 0 10 10')
  })

  it('refuses a path that does not start with a move', () => {
    expect(svgPath('L 10 10')).toBeUndefined()
    expect(svgPath('10 10')).toBeUndefined()
    expect(svgPath('Z')).toBeUndefined()
  })

  it('refuses a half argument group, which the browser would truncate', () => {
    expect(svgPath('M 0 0 L 10')).toBeUndefined()
    expect(svgPath('M 0 0 C 1 1 2 2')).toBeUndefined()
  })

  it('refuses anything outside the path vocabulary', () => {
    for (const value of [
      'M 0 0 L 10 10 <script>',
      'M 0 0 url(#x)',
      'M 0 0 L 10 10;alert(1)',
      'M 0 0 X 1 1',
      '',
    ]) {
      expect(svgPath(value), JSON.stringify(value)).toBeUndefined()
    }
  })

  it('bounds the number of tokens', () => {
    const long = 'M 0 0 ' + Array.from({ length: 400 }, () => 'L 1 1').join(' ')
    expect(svgPath(long)).toBeUndefined()
  })
})

describe('ADR-011 — points grammar', () => {
  it('accepts a point list and normalises the separators', () => {
    expect(svgPoints('0,0 10,5 20,0')).toBe('0,0 10,5 20,0')
    expect(svgPoints('0 0 10 5 20 0')).toBe('0,0 10,5 20,0')
  })

  it('refuses an odd number of coordinates', () => {
    expect(svgPoints('0,0 10,5 20')).toBeUndefined()
  })

  it('refuses letters and references', () => {
    for (const value of ['0,0 L 10,5', 'url(#a)', '0,0 10,5 onload=1', '']) {
      expect(svgPoints(value), JSON.stringify(value)).toBeUndefined()
    }
  })
})

describe('ADR-011 — paint is a closed list', () => {
  it('resolves the language\'s own colour names', () => {
    expect(svgPaint('ink', TOKENS)).toBe('var(--foreground)')
    expect(svgPaint('danger', TOKENS)).toBe('var(--viz-series-5)')
  })

  it('accepts keywords, hex and bare words', () => {
    expect(svgPaint('none', TOKENS)).toBe('none')
    expect(svgPaint('currentColor', TOKENS)).toBe('currentColor')
    expect(svgPaint('#ff8800', TOKENS)).toBe('#ff8800')
    expect(svgPaint('#abc', TOKENS)).toBe('#abc')
    expect(svgPaint('rebeccapurple', TOKENS)).toBe('rebeccapurple')
    expect(svgPaint('rgb(1, 2, 3)', TOKENS)).toBe('rgb(1, 2, 3)')
  })

  it('refuses url(), which is the one paint value that fetches', () => {
    // The whole of ADR-011 hazard 1: a url() paint makes the HOST document
    // issue a request, disclosing that a card was rendered and from where.
    for (const value of [
      'url(https://attacker.example/x)',
      'url(#gradient)',
      'url("https://attacker.example/x")',
      'URL(#a)',
      'var(--background)',
    ]) {
      expect(svgPaint(value, TOKENS), JSON.stringify(value)).toBeUndefined()
    }
  })

  it('refuses anything that could break out of the declaration', () => {
    for (const value of ['red;background:url(x)', 'red"', 'rgb(1,2,3);x', 'expression(alert(1))', '']) {
      expect(svgPaint(value, TOKENS), JSON.stringify(value)).toBeUndefined()
    }
  })
})

const CARD: Box = { left: 100, top: 200, width: 600, height: 400 }

/** A trigger sitting `offset` pixels below the card's top edge. */
function triggerAt(offset: number, height = 24): Box {
  return { left: 120, top: CARD.top + offset, width: 120, height }
}

const ANCHOR: Box = { left: 120, top: 200, width: 120, height: 24 }
const PANEL: Box = { left: 0, top: 0, width: 220, height: 120 }

describe('ADR-012 — placement stays inside the card', () => {
  it('opens below the trigger when there is room', () => {
    const result = placePopover({ card: CARD, trigger: triggerAt(20), anchor: triggerAt(20), panel: PANEL })
    expect(result.placement).toBe('below')
    expect(result.maxHeight).toBeUndefined()
  })

  it('flips above when below does not fit', () => {
    const trigger = triggerAt(300)
    const result = placePopover({ card: CARD, trigger, anchor: trigger, panel: PANEL })
    expect(result.placement).toBe('above')
    expect(result.top).toBeLessThan(0)
  })

  it('clamps a panel that fits on neither side, rather than overflowing', () => {
    const trigger = triggerAt(150, 20)
    const tall: Box = { ...PANEL, height: 400 }
    const result = placePopover({ card: CARD, trigger, anchor: trigger, panel: tall })
    expect(result.placement).toBe('clamped')
    expect(result.maxHeight).toBeDefined()
    expect(result.maxHeight!).toBeGreaterThan(0)
  })

  it('expands over the card when neither side is legible', () => {
    const tiny: Box = { left: 0, top: 0, width: 600, height: 60 }
    const trigger: Box = { left: 10, top: 20, width: 40, height: 20 }
    const result = placePopover({ card: tiny, trigger, anchor: trigger, panel: PANEL })
    expect(result.placement).toBe('cover')
    expect(insideCard({ card: tiny, anchor: trigger, result })).toBe(true)
  })

  it('shifts inward instead of leaving the card on either side', () => {
    for (const left of [-200, 0, 500, 900]) {
      const trigger: Box = { ...triggerAt(20), left }
      const result = placePopover({ card: CARD, trigger, anchor: trigger, panel: PANEL })
      expect(insideCard({ card: CARD, anchor: trigger, result }), 'left=' + left).toBe(true)
    }
  })

  it('never reports a placement that leaves the card, swept on both axes', () => {
    // The property the browser run measures, checked here over the whole range so
    // a failure names the trigger position rather than "a popover somewhere".
    //
    // Both axes, because they fail differently: a vertical sweep only exercises
    // the flip and the height clamp, and a horizontal sweep only exercises the
    // side clamps. Sweeping one and calling it "containment" is exactly the
    // mistake that would let a missing horizontal clamp pass — so it is written
    // down here rather than assumed.
    let checked = 0
    for (let left = -160; left <= 900; left += 20) {
      for (let offset = -120; offset <= 420; offset += 20) {
        for (const [width, height] of [[80, 40], [220, 120], [420, 400], [760, 160]] as const) {
          const trigger: Box = { ...triggerAt(offset), left }
          const result = placePopover({ card: CARD, trigger, anchor: trigger, panel: { left: 0, top: 0, width, height } })
          const atLeft = trigger.left + result.left
          const atTop = trigger.top + result.top
          const drawnHeight = result.maxHeight ?? height
          const where = 'left ' + left + ' offset ' + offset + ' panel ' + width + 'x' + height
          expect(atLeft, 'left edge at ' + where).toBeGreaterThanOrEqual(CARD.left - 0.5)
          expect(atLeft + result.width, 'right edge at ' + where).toBeLessThanOrEqual(CARD.left + CARD.width + 0.5)
          expect(atTop, 'top edge at ' + where).toBeGreaterThanOrEqual(CARD.top - 0.5)
          expect(atTop + drawnHeight, 'bottom edge at ' + where).toBeLessThanOrEqual(CARD.top + CARD.height + 0.5)
          expect(result.width, 'width at ' + where).toBeLessThanOrEqual(CARD.width)
          expect(insideCard({ card: CARD, anchor: trigger, result }), where).toBe(true)
          checked += 1
        }
      }
    }
    // A sweep that silently did nothing would pass every assertion above.
    expect(checked).toBe(54 * 28 * 4)
  })

  it('reports unmeasured rather than inventing a constraint when the card has no extent', () => {
    const empty: Box = { left: 0, top: 0, width: 0, height: 0 }
    const result = placePopover({ card: empty, trigger: ANCHOR, anchor: ANCHOR, panel: PANEL })
    expect(result.placement).toBe('unmeasured')
  })
})
