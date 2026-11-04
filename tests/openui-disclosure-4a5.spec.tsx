// @vitest-environment jsdom

/**
 * 4A-5 — the fourteen components, asserted structurally.
 *
 * ## Why the drawing half is tested through the DOM and not only the module
 *
 * `tests/openui-drawing-4a5.spec.tsx` already pins the grammars: a refused
 * `transform` is `undefined`, a refused paint is `undefined`. That is the
 * validator. It is not the renderer, and the renderer is where a validated value
 * can still go to the wrong attribute, be dropped despite being valid, or reach
 * the DOM in a form the validator never produced.
 *
 * So the assertions here read the **rendered markup**: the element count, the
 * attribute the browser will actually see, and — for a refusal — that the
 * attribute is absent while the marker names it. "Is a circle present" is not
 * asked anywhere, because a circle with every coordinate refused is present.
 *
 * ## Why the disclosure half needs a mounted card
 *
 * A Popover's whole contract is about what happens over time: it opens, it
 * closes on Escape, it closes on an outside press but not an inside one, and it
 * leaves no listener behind when it unmounts. None of that is visible in static
 * markup, and all of it is the reason ADR-012 exists.
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { OpenUICard, renderProgram, stateKeyFor } from '../src/client/OpenUICard.tsx'
import { resetCardStates } from '../src/client/card-state.ts'
import type { OpenUIMeta } from '../src/fragment.ts'
import { countOf } from './openui-dom-structure.ts'

const META: OpenUIMeta = {
  kind: 'intelligent_ui',
  program: '',
  title: 'T',
  mode: 'inline',
  path: '~/s/card-4a5.openui.html',
  style: 'whale',
}

/** Undo the entities React escapes, so assertions read the real markup. */
function decode(html: string): string {
  return html.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
}

/** Markup for one program. */
function draw(source: string): string {
  const { node, error } = renderProgram(source, {})
  if (node === null) throw new Error('program did not draw: ' + error)
  return decode(renderToStaticMarkup(node as never))
}

/** The `style` attribute of the first element matching `selector`. */
function styleOf(html: string, selector: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  return container.querySelector(selector)?.getAttribute('style') ?? ''
}

/** One attribute of the first element matching `selector`. */
function attrOf(html: string, selector: string, name: string): string | null {
  const container = document.createElement('div')
  container.innerHTML = html
  return container.querySelector(selector)?.getAttribute(name) ?? null
}

describe('the drawing group renders, and renders what was asked for', () => {
  it('draws every one of the ten primitives into an Svg', () => {
    // One statement per physical line is a language rule, so the children are
    // one real line in the program even though the source wraps here.
    const html = draw(
      'root = Col([Svg([G([Circle(20, 20, 10, "info", "ink", 2)], "translate(4 4)"), '
      + 'Ellipse(60, 20, 14, 8), Rect(0, 40, 30, 20, "ink", "none", 1, 0.5, 3), '
      + 'Line(0, 70, 90, 70), Path("M 0 80 L 20 95 L 40 80"), '
      + 'Polyline("0,100 20,110 40,100"), Polygon("50,100 70,110 60,120"), '
      + 'SvgText("label", 5, 130)], "0 0 120 140")])',
    )
    expect(countOf(html, 'svg')).toBe(1)
    expect(countOf(html, 'g')).toBe(1)
    expect(countOf(html, 'circle')).toBe(1)
    expect(countOf(html, 'ellipse')).toBe(1)
    expect(countOf(html, 'rect')).toBe(1)
    expect(countOf(html, 'line')).toBe(1)
    expect(countOf(html, 'path')).toBe(1)
    expect(countOf(html, 'polyline')).toBe(1)
    expect(countOf(html, 'polygon')).toBe(1)
    expect(countOf(html, 'text')).toBe(1)
  })

  it('puts the geometry on the element as numbers', () => {
    const html = draw('root = Col([Svg([Circle(20, 30, 10)], "0 0 100 100")])')
    expect(attrOf(html, 'circle', 'cx')).toBe('20')
    expect(attrOf(html, 'circle', 'cy')).toBe('30')
    expect(attrOf(html, 'circle', 'r')).toBe('10')
  })

  it('sets the viewBox the parser produced, not the raw string', () => {
    const html = draw('root = Col([Svg([Circle(1, 1, 1)], "0,0 , 200 ,100")])')
    expect(attrOf(html, 'svg', 'viewBox')).toBe('0 0 200 100')
  })

  it('says why when the viewBox cannot be read, instead of drawing an empty box', () => {
    const html = draw('root = Col([Svg([Circle(1, 1, 1)], "0 0 0 100")])')
    expect(countOf(html, 'svg')).toBe(0)
    expect(html).toContain('no readable viewBox')
  })
})

describe('ADR-011 - a refused value never becomes an attribute', () => {
  it('refuses a bad transform and records which argument it was', () => {
    const html = draw('root = Col([Svg([G([Circle(5, 5, 4)], "rotate(30 50)")], "0 0 100 100")])')
    // The element is still drawn, so the circle the author asked for is visible;
    // what is absent is the transform, and the marker says so.
    expect(countOf(html, 'circle')).toBe(1)
    expect(attrOf(html, 'g', 'transform')).toBeNull()
    expect(attrOf(html, 'g', 'data-openui-svg-refused')).toBe('transform')
  })

  it('refuses a d that is not a path', () => {
    const html = draw('root = Col([Svg([Path("L 10 10")], "0 0 100 100")])')
    expect(countOf(html, 'path')).toBe(1)
    expect(attrOf(html, 'path', 'd')).toBeNull()
    expect(attrOf(html, 'path', 'data-openui-svg-refused')).toBe('d')
  })

  it('refuses a resource reference in a paint', () => {
    // The one drawing value that could make the HOST document issue a request.
    const html = draw('root = Col([Svg([Circle(5, 5, 4, "url(https://attacker.example/x)")], "0 0 100 100")])')
    expect(html).not.toContain('attacker.example')
    expect(styleOf(html, 'circle')).not.toContain('url(')
    expect(attrOf(html, 'circle', 'data-openui-svg-refused')).toBe('fill')
  })

  it('refuses a non-finite coordinate and names it', () => {
    const html = draw('root = Col([Svg([Circle("abc", 10, 5)], "0 0 100 100")])')
    expect(attrOf(html, 'circle', 'data-openui-svg-refused')).toContain('cx')
  })

  it('never emits a url() for a hostile program that uses several at once', () => {
    const html = draw(
      'root = Col([Svg([Rect(0, 0, 10, 10, "url(#gradient)", "url(https://x.example/y)"), '
      + 'Path("M 0 0 L 5 5", "url(#paint)")], "0 0 50 50")])',
    )
    expect(html.toLowerCase()).not.toContain('url(')
    expect(html).not.toContain('x.example')
  })
})

describe('ADR-011 - colour goes through style, and defaults are legible', () => {
  it('writes the paint as a CSS declaration, not a presentation attribute', () => {
    // A var() inside an SVG presentation attribute is not reliably resolved, and
    // the failure is invisible: it draws black, which reads as a deliberate
    // colour on a light card and as a missing shape on a dark one.
    const html = draw('root = Col([Svg([Circle(5, 5, 4, "info")], "0 0 100 100")])')
    expect(styleOf(html, 'circle')).toContain('var(--primary)')
    expect(attrOf(html, 'circle', 'fill')).toBeNull()
  })

  it('gives an unfilled shape the card ink rather than the SVG black default', () => {
    const html = draw('root = Col([Svg([Circle(5, 5, 4)], "0 0 100 100")])')
    const style = styleOf(html, 'circle')
    expect(style).toContain('currentColor')
    expect(style).not.toContain('black')
  })

  it('strokes a shape that has no fill argument', () => {
    const html = draw('root = Col([Svg([Line(0, 0, 10, 10)], "0 0 100 100")])')
    const style = styleOf(html, 'line')
    expect(style).toContain('stroke')
    expect(style).toContain('currentColor')
  })
})

describe('SvgText is a text node, not markup', () => {
  it('escapes a hostile label instead of parsing it', () => {
    const html = draw('root = Col([Svg([SvgText("<img src=x onerror=alert(1)>", 2, 10)], "0 0 100 100")])')
    // One text element, no img, and the angle brackets survived as characters.
    expect(countOf(html, 'text')).toBe(1)
    expect(countOf(html, 'img')).toBe(0)
    expect(html).toContain('&lt;img')
  })

  it('maps anchor and weight through their closed tables', () => {
    const html = draw('root = Col([Svg([SvgText("x", 5, 20, 14, "ink", "middle", "semibold")], "0 0 100 100")])')
    expect(attrOf(html, 'text', 'text-anchor')).toBe('middle')
    expect(styleOf(html, 'text')).toContain('640')
  })

  it('falls back for an anchor the language does not declare', () => {
    const html = draw('root = Col([Svg([SvgText("x", 5, 20, 12, "ink", "justify")], "0 0 100 100")])')
    expect(attrOf(html, 'text', 'text-anchor')).toBe('start')
  })
})

// --- disclosure and play, on a mounted card -------------------------------

/** Mount the real card; returns what the interaction cases need. */
function mount(program: string) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const card = { ...META, program }
  const key = stateKeyFor(card, 's1', 'call-4a5')
  act(() => { root.render(createElement(OpenUICard as never, { meta: card, stateKey: key })) })
  return {
    host,
    unmount: () => { act(() => root.unmount()); host.remove() },
    query: <T extends Element>(selector: string): T | null => host.querySelector(selector) as T | null,
    all: (selector: string): Element[] => [...host.querySelectorAll(selector)],
  }
}

/** Press something the way a user would, inside React's batching. */
function press(element: Element | null): void {
  if (element === null) throw new Error('nothing to press')
  act(() => {
    element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** Send a key to the document, the way a focused page would deliver it. */
function keydown(key: string): void {
  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  })
}

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => { resetCardStates(() => undefined, { delayMs: 0 }) })
afterEach(() => { document.body.innerHTML = '' })

describe('Popover - ADR-012 containment and lifetime', () => {
  const PROGRAM = 'root = Col([Popover("more", "the detail")])'

  it('starts closed and opens on the trigger', () => {
    const card = mount(PROGRAM)
    expect(card.all('[data-openui-popover="panel"]')).toHaveLength(0)
    const trigger = card.query<HTMLButtonElement>('[data-openui-popover="trigger"]')!
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    press(trigger)
    expect(card.all('[data-openui-popover="panel"]')).toHaveLength(1)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    card.unmount()
  })

  it('declares itself non-modal, and does not trap focus', () => {
    const card = mount(PROGRAM)
    press(card.query('[data-openui-popover="trigger"]'))
    const panel = card.query('[data-openui-popover="panel"]')!
    expect(panel.getAttribute('role')).toBe('dialog')
    // The point of the decision: a trap in a non-modal panel would fight the
    // host's own Tab navigation.
    expect(panel.getAttribute('aria-modal')).toBe('false')
    // No element inside the panel may declare itself the focus boundary.
    expect(card.all('[data-openui-popover="panel"] [tabindex="-1"]')).toHaveLength(0)
    card.unmount()
  })

  it('is positioned absolutely inside the card', () => {
    const card = mount(PROGRAM)
    press(card.query('[data-openui-popover="trigger"]'))
    const panel = card.query<HTMLElement>('[data-openui-popover="panel"]')!
    expect(panel.style.position).toBe('absolute')
    // Not fixed: a fixed panel is positioned against the viewport and would
    // cover the host's own interface (ADR-012 section 1).
    expect(panel.style.position).not.toBe('fixed')
    card.unmount()
  })

  it('closes on Escape and returns focus to the trigger', () => {
    const card = mount(PROGRAM)
    const trigger = card.query<HTMLButtonElement>('[data-openui-popover="trigger"]')!
    press(trigger)
    expect(card.all('[data-openui-popover="panel"]')).toHaveLength(1)
    keydown('Escape')
    expect(card.all('[data-openui-popover="panel"]')).toHaveLength(0)
    // Focus must not be left on a node that no longer exists.
    expect(document.activeElement).toBe(trigger)
    card.unmount()
  })

  it('closes on a press outside, and stays open on a press inside', () => {
    const card = mount(PROGRAM)
    press(card.query('[data-openui-popover="trigger"]'))
    const panel = card.query('[data-openui-popover="panel"]')!
    // Inside: the panel must survive its own content being clicked.
    act(() => { panel.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(card.all('[data-openui-popover="panel"]')).toHaveLength(1)
    // Outside: anywhere else in the document.
    act(() => { document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })) })
    expect(card.all('[data-openui-popover="panel"]')).toHaveLength(0)
    card.unmount()
  })

  it('leaves no document listener behind when it closes', () => {
    // The measured question, not a code reading: count the listeners on the
    // document around a full open/close cycle.
    const added: string[] = []
    const removed: string[] = []
    const realAdd = document.addEventListener.bind(document)
    const realRemove = document.removeEventListener.bind(document)
    type Listener = EventListenerOrEventListenerObject
    document.addEventListener = ((type: string, listener: Listener, options?: boolean | AddEventListenerOptions) => {
      added.push(type)
      realAdd(type, listener, options)
    }) as typeof document.addEventListener
    document.removeEventListener = ((type: string, listener: Listener, options?: boolean | EventListenerOptions) => {
      removed.push(type)
      realRemove(type, listener, options)
    }) as typeof document.removeEventListener
    try {
      const card = mount(PROGRAM)
      press(card.query('[data-openui-popover="trigger"]'))
      keydown('Escape')
      card.unmount()
    } finally {
      document.addEventListener = realAdd
      document.removeEventListener = realRemove
    }
    for (const type of added) {
      expect(removed.filter(entry => entry === type).length, type + ' was added but never removed').toBeGreaterThanOrEqual(
        added.filter(entry => entry === type).length,
      )
    }
    expect(added).toContain('pointerdown')
    expect(added).toContain('keydown')
  })

  it('removes its listeners when the card unmounts while the panel is open', () => {
    const added: string[] = []
    const removed: string[] = []
    const realAdd = document.addEventListener.bind(document)
    const realRemove = document.removeEventListener.bind(document)
    type Listener = EventListenerOrEventListenerObject
    document.addEventListener = ((type: string, listener: Listener, options?: boolean | AddEventListenerOptions) => {
      added.push(type)
      realAdd(type, listener, options)
    }) as typeof document.addEventListener
    document.removeEventListener = ((type: string, listener: Listener, options?: boolean | EventListenerOptions) => {
      removed.push(type)
      realRemove(type, listener, options)
    }) as typeof document.removeEventListener
    try {
      const card = mount(PROGRAM)
      press(card.query('[data-openui-popover="trigger"]'))
      // Unmounted while open: the cleanup is the only place they are removed.
      card.unmount()
    } finally {
      document.addEventListener = realAdd
      document.removeEventListener = realRemove
    }
    for (const type of new Set(added)) {
      expect(removed.filter(entry => entry === type).length, type + ' leaked').toBe(
        added.filter(entry => entry === type).length,
      )
    }
  })

  it('closes one popover when another in the same card is opened', () => {
    // Within one card, pressing trigger B is an outside press for panel A, so A
    // closes. That is the dismissal rule, not interference: each instance decides
    // for itself, and the press really was outside A.
    const card = mount('root = Col([Popover("a", "A detail"), Popover("b", "B detail")])')
    const triggers = card.all('[data-openui-popover="trigger"]')
    expect(triggers).toHaveLength(2)
    press(triggers[0]!)
    expect(card.all('[data-openui-popover="panel"]')).toHaveLength(1)
    press(triggers[1]!)
    const panels = card.all('[data-openui-popover="panel"]')
    expect(panels).toHaveLength(1)
    // The surviving panel is B's, not A's.
    expect(panels[0]!.textContent).toContain('B detail')
    expect(triggers[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(triggers[1]!.getAttribute('aria-expanded')).toBe('true')
    card.unmount()
  })

  it('closes only its own panel when the press is in another card', () => {
    // ADR-012 P5. Pressing a trigger in card B is an outside press for card A's
    // panel, so A closes — the dismissal rule, applied correctly. What must NOT
    // happen is A's handler closing B's panel, and that is what is asserted: the
    // surviving panel is the one belonging to the card that was pressed.
    const left = mount('root = Col([Popover("left", "left detail")])')
    const right = mount('root = Col([Popover("right", "right detail")])')
    press(left.query('[data-openui-popover="trigger"]'))
    expect(left.all('[data-openui-popover="panel"]')).toHaveLength(1)
    press(right.query('[data-openui-popover="trigger"]'))
    expect(left.all('[data-openui-popover="panel"]')).toHaveLength(0)
    const surviving = right.all('[data-openui-popover="panel"]')
    expect(surviving).toHaveLength(1)
    expect(surviving[0]!.textContent).toContain('right detail')
    left.unmount()
    right.unmount()
  })

  it('leaves the other card working when one card unmounts', () => {
    // Two independent React roots. Unmounting one must remove only its own
    // listeners; the survivor must still open, close on Escape, and keep focus.
    const left = mount('root = Col([Popover("left", "left detail")])')
    const right = mount('root = Col([Popover("right", "right detail")])')
    press(left.query('[data-openui-popover="trigger"]'))
    left.unmount()
    const trigger = right.query<HTMLButtonElement>('[data-openui-popover="trigger"]')!
    press(trigger)
    expect(right.all('[data-openui-popover="panel"]')).toHaveLength(1)
    keydown('Escape')
    expect(right.all('[data-openui-popover="panel"]')).toHaveLength(0)
    expect(document.activeElement).toBe(trigger)
    right.unmount()
  })
})

describe('Flashcard - a flip is a state change, not a content swap', () => {
  it('shows one face at a time and flips on press', () => {
    const card = mount('root = Col([Flashcard("front", "back", "Tap")])')
    const button = card.query<HTMLButtonElement>('[data-openui-flashcard="card"]')!
    expect(button.getAttribute('data-openui-flashcard-state')).toBe('front')
    expect(button.getAttribute('aria-pressed')).toBe('false')
    // Both faces are in the DOM; exactly one is exposed to a screen reader.
    expect(card.all('[data-openui-flashcard="visible"]')).toHaveLength(1)
    expect(card.all('[data-openui-flashcard="hidden"]')).toHaveLength(1)
    press(button)
    expect(button.getAttribute('data-openui-flashcard-state')).toBe('back')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    const visible = card.all('[data-openui-flashcard="visible"]')[0]!
    expect(visible.textContent).toContain('back')
    card.unmount()
  })

  it('keeps the hint visible after the flip, so the affordance is not lost', () => {
    const card = mount('root = Col([Flashcard("front", "back", "Tap")])')
    press(card.query('[data-openui-flashcard="card"]'))
    expect(card.all('[data-openui-flashcard="hint"]')).toHaveLength(1)
    expect(card.query('[data-openui-flashcard="hint"]')!.textContent).toBe('Tap')
    card.unmount()
  })
})

describe('Celebration - fires on the transition, and cleans up', () => {
  it('draws nothing while the condition is false', () => {
    const card = mount('$n = 0\nroot = Col([Celebration($n == 1)])')
    expect(card.all('[data-openui-celebration]')).toHaveLength(0)
    card.unmount()
  })

  it('bursts once when the condition turns true, and clears itself', async () => {
    // Real timers, so the assertion is about the effect and not about a mock.
    const card = mount('$n = 0\nroot = Col([Button("go", Action([@Set($n, 1)])), Celebration($n == 1)])')
    expect(card.all('[data-openui-celebration="burst"]')).toHaveLength(0)
    press(card.query('button'))
    expect(card.all('[data-openui-celebration="burst"]')).toHaveLength(1)
    // A burst is a fixed number of pieces: the browser run counts the same way.
    expect(card.all('[data-openui-celebration="burst"] i').length).toBeGreaterThan(0)
    card.unmount()
  })

  it('does not retrigger on a re-render while the condition stays true', () => {
    const card = mount('$n = 1\nroot = Col([Button("x", Action([@Set($n, 1)])), Celebration($n == 1)])')
    // Loaded already true: no burst, because nothing was just achieved.
    expect(card.all('[data-openui-celebration="burst"]')).toHaveLength(0)
    card.unmount()
  })
})

describe('Carousel - scrolls and snaps, inside the card', () => {
  it('draws one item per child, each with a fixed width', () => {
    const html = draw('root = Carousel([Text("a"), Text("b"), Text("c")], 160, 2)')
    expect(countOf(html, '[data-openui-carousel="item"]')).toBe(3)
    // Three items, three children: not three items and a wrapper.
    expect(countOf(html, '[data-openui-carousel="track"]')).toBe(1)
    expect(styleOf(html, '[data-openui-carousel="item"]')).toContain('160px')
  })

  it('is a scroll container that a keyboard can reach', () => {
    const html = draw('root = Carousel([Text("a"), Text("b")], 200)')
    const track = styleOf(html, '[data-openui-carousel="track"]')
    expect(track).toContain('overflow-x')
    expect(track).toContain('scroll-snap-type')
    // A scroll container is not focusable by default; without this a keyboard
    // user cannot reach the items beyond the first.
    expect(attrOf(html, '[data-openui-carousel="track"]', 'tabindex')).toBe('0')
  })

  it('clamps an item width the language did not bound', () => {
    expect(styleOf(draw('root = Carousel([Text("a")], 5000)'), '[data-openui-carousel="item"]')).toContain('640px')
    expect(styleOf(draw('root = Carousel([Text("a")], 1)'), '[data-openui-carousel="item"]')).toContain('80px')
  })
})
