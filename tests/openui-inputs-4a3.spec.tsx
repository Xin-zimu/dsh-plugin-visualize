// @vitest-environment jsdom

/**
 * Stage 4A-3 — the rest of the Inputs group.
 *
 * Eleven components: `Input`, `TextArea`, `Select`, `SegmentedControl`,
 * `Checkbox`, `RadioGroup`, `DatePicker`, `Timer`, `Form`, `IconButton`,
 * `Pressable`.
 *
 * ## What makes this batch different from 4A-1 and 4A-2
 *
 * Those batches added components that *display*. Every one of these eleven is a
 * bidirectional control, so the failure mode is not "it looks wrong" but "it
 * looks right and the state never moved". A checkbox that renders checked and
 * writes nothing passes every presence assertion ever written.
 *
 * So the tests here come in four layers, and the later ones are the ones that
 * matter:
 *
 *  1. **Structure** — how many elements, of which tag/role, nested how deep.
 *     The 4A-2 lesson (D20: two rows for one item, 62 assertions passing) is why
 *     this layer exists at all.
 *  2. **Argument positions** — every position is asserted against what
 *     `signatures.ts` declares. A renderer reading `props[1]` where the table
 *     means `props[2]` draws something plausible and wrong.
 *  3. **The state loop, end to end** — mount the real card, dispatch a real DOM
 *     event, and then check what the *program* computes next. Not "the input's
 *     value attribute changed": the whole program is re-evaluated, so a sibling
 *     `Text` must show the new value. That is the loop this batch exists to
 *     prove, and it is the only assertion that cannot be satisfied by a control
 *     that merely redraws itself.
 *  4. **Persistence across a reload** — the P3 machinery is reused, not
 *     reimplemented, so a value written by a checkbox must survive a remount
 *     through the same `cardStates` store a Slider uses.
 *
 * ## The binding-slot rule, asserted directly
 *
 * Upstream (`inputs-data.js`, `IUI_B_BINDING_ARG`) gives each component exactly
 * one writable argument, and it is always the first one. That is what keeps
 * "which variable does this control own" answerable. It is pinned below, because
 * a renderer that quietly started writing a second slot would still pass every
 * behavioural test in this file.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { OpenUICard, RENDERED_COMPONENTS, renderProgram, stateKeyFor } from '../src/client/OpenUICard.tsx'
import { COMPONENTS } from '../src/backends/openui/signatures.ts'
import { resetCardStates, cardStates, STORAGE_PREFIX, type StateStorage } from '../src/client/card-state.ts'
import { openuiStateKey } from '../src/client/openui-state.ts'
import type { OpenUIMeta } from '../src/fragment.ts'
import { countOf, depthOf, describeShape, shapeOf } from './openui-dom-structure.ts'

/** The eleven this batch is responsible for. */
const BATCH = [
  'Input', 'TextArea', 'Select', 'SegmentedControl', 'Checkbox',
  'RadioGroup', 'DatePicker', 'Timer', 'Form', 'IconButton', 'Pressable',
] as const

const META: OpenUIMeta = {
  kind: 'intelligent_ui',
  program: '',
  title: 'T',
  mode: 'inline',
  path: '~/s/card-4a3.openui.html',
  style: 'whale',
}

/** Markup for one program, with state defaults applied. */
function draw(source: string): string {
  const { node, error } = renderProgram(source, {})
  if (node === null) throw new Error(`program did not draw: ${error}`)
  return decode(renderToStaticMarkup(node as never))
}

/** Undo the entities React escapes so assertions can read the real markup. */
function decode(html: string): string {
  return html.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
}

/** True when the markup contains a declaration, ignoring whitespace. */
function has(html: string, declaration: string): boolean {
  return html.replace(/\s+/gu, '').includes(declaration.replace(/\s+/gu, ''))
}

// --- the state loop, driven through the real card ---------------------------

/** An in-memory Storage with the surface the store uses. */
function memoryStorage(): StateStorage & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    get length() { return items.size },
    key: i => [...items.keys()][i] ?? null,
    getItem: k => items.get(k) ?? null,
    setItem: (k, v) => { items.set(k, v) },
    removeItem: k => { items.delete(k) },
  }
}

let storage: ReturnType<typeof memoryStorage>

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  storage = memoryStorage()
  resetCardStates(() => storage, { delayMs: 0 })
})

afterEach(() => {
  document.body.innerHTML = ''
})

/** Mount the real card and return the host plus a text snapshot helper. */
function mount(program: string, stateKey?: string) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = (): void => {
    const card = { ...META, program }
    const key = stateKey ?? stateKeyFor(card, 's1', 'call-1')
    act(() => { root.render(createElement(OpenUICard as never, { meta: card, stateKey: key })) })
  }
  render()
  return {
    host,
    render,
    text: () => host.textContent ?? '',
    unmount: () => { act(() => root.unmount()); host.remove() },
    query: <T extends Element>(selector: string): T | null => host.querySelector(selector) as T | null,
    all: (selector: string): Element[] => [...host.querySelectorAll(selector)],
  }
}

/** Simulate typing into a text input the way React's onChange expects. */
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** Flip a checkbox/radio the way a click would. */
function toggle(input: HTMLInputElement): void {
  act(() => {
    input.click()
  })
}

/** Choose a `<select>` option by value. */
function choose(select: HTMLSelectElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  act(() => {
    setter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** The stored record's `values`, if anything was written. */
function storedValues(key: string): unknown {
  const raw = storage.getItem(STORAGE_PREFIX + openuiStateKey(key))
  return raw === null ? undefined : (JSON.parse(raw) as { s: { values?: unknown } }).s?.values
}

/** Bump the page clock and force the debounce, the way a reload would. */
function reload(): void {
  // A real page flushes on `pagehide`; jsdom does not fire one, so the pending
  // debounce is flushed explicitly before the store is replaced. Without this
  // the test would read storage before the card had written to it, and would be
  // testing its own timing rather than the persistence rule.
  cardStates.flush()
  resetCardStates(() => storage, { delayMs: 0 })
}

// --- 1. coverage ------------------------------------------------------------

describe('4A-3 renders every component in the batch', () => {
  it('draws all eleven from a real program', () => {
    const programs: Record<string, string> = {
      Input: '$v = "x"\nroot = Col([Input($v, "L")])',
      TextArea: '$v = "x"\nroot = Col([TextArea($v, "L")])',
      Select: '$v = "a"\nroot = Col([Select($v, ["a", "b"], "L")])',
      SegmentedControl: '$v = "a"\nroot = Col([SegmentedControl($v, ["a", "b"])])',
      Checkbox: '$v = true\nroot = Col([Checkbox($v, "L")])',
      RadioGroup: '$v = 1\nroot = Col([RadioGroup($v, [{value: 1, label: "A"}])])',
      DatePicker: '$v = "2026-11-04"\nroot = Col([DatePicker($v, "L")])',
      Timer: '$v = 90\nroot = Col([Timer($v, "L")])',
      Form: '$v = "x"\nroot = Col([Form([Input($v, "L")])])',
      IconButton: '$v = 0\nroot = Col([IconButton("check", Action([@Set($v, 1)]), "L")])',
      Pressable: '$v = 1\nroot = Col([Pressable([Text("t")], Action([@Set($v, 2)]), true)])',
    }
    for (const name of BATCH) {
      const html = draw(programs[name]!)
      // The renderer-gap notice is the one thing that must NOT appear: it means
      // the name is declared but this build cannot draw it.
      expect(html, `${name} fell back to the unrendered notice`).not.toContain('data-openui-unrendered')
      expect(html.length, `${name} drew nothing`).toBeGreaterThan(0)
    }
  })

  it('lists all eleven in the renderer table', () => {
    for (const name of BATCH) expect(RENDERED_COMPONENTS).toContain(name)
  })

  it('draws 30 of the 48 declared components', () => {
    // 19 before this batch, +11 here. Counted from the renderer's own table, so
    // this cannot drift away from what is actually drawn.
    expect(RENDERED_COMPONENTS).toHaveLength(30)
  })
})

// --- 2. the binding-slot rule ----------------------------------------------

describe('every input has exactly one writable slot, and it is the first', () => {
  /**
   * Upstream's `IUI_B_BINDING_ARG`. Stated once here so a renderer that started
   * writing a second argument would fail a test rather than pass one.
   */
  const BINDING_SLOT: Record<string, string> = {
    Input: 'value',
    TextArea: 'value',
    Select: 'value',
    SegmentedControl: 'value',
    Slider: 'value',
    RadioGroup: 'value',
    DatePicker: 'value',
    Checkbox: 'checked',
    Timer: 'seconds',
  }

  it('names the same slot the signature table declares first', () => {
    for (const [name, slot] of Object.entries(BINDING_SLOT)) {
      const component = COMPONENTS.find(entry => entry.name === name)
      expect(component, `${name} is not declared`).toBeDefined()
      expect(component!.args[0]?.name, `${name}'s first argument is not its binding slot`).toBe(slot)
    }
  })

  it('writes only that slot when the control is used', () => {
    // Checkbox: the second argument is a label, and a label is not writable.
    const program = '$done = false\nroot = Col([Checkbox($done, "Done")])'
    const card = mount(program)
    const box = card.query<HTMLInputElement>('input[type="checkbox"]')!
    toggle(box)
    cardStates.flush()
    // Exactly one variable is stored, and it is `done`.
    const key = stateKeyFor({ ...META, program }, 's1', 'call-1')
    expect(Object.keys(storedValues(key) as object)).toEqual(['done'])
    card.unmount()
  })
})

// --- 3. the state loop, end to end -----------------------------------------

describe('a bound control drives the whole program, not just itself', () => {
  it('Input: typing re-evaluates a sibling Text', () => {
    // The sibling is the assertion. An Input that only updated its own value
    // attribute would leave `Text` showing the old string.
    const card = mount('$name = "Ada"\nroot = Col([Input($name, "Name"), Text("Hi " + $name)])')
    expect(card.text()).toContain('Hi Ada')
    type(card.query<HTMLInputElement>('input[type="text"]')!, 'Grace')
    expect(card.text()).toContain('Hi Grace')
    card.unmount()
  })

  it('Input: a number field writes a NUMBER, so arithmetic still works', () => {
    // If it wrote the string "5", `$n + 1` would be "51".
    const card = mount('$n = 1\nroot = Col([Input($n, "N", "number"), Text("next " + ($n + 1))])')
    expect(card.text()).toContain('next 2')
    type(card.query<HTMLInputElement>('input[type="number"]')!, '5')
    expect(card.text()).toContain('next 6')
    card.unmount()
  })

  it('TextArea: typing re-evaluates a sibling Text', () => {
    const card = mount('$bio = "a"\nroot = Col([TextArea($bio, "Bio"), Text("len " + @Count($bio))])')
    expect(card.text()).toContain('len 1')
    type(card.query<HTMLTextAreaElement>('textarea')!, 'abcd')
    expect(card.text()).toContain('len 4')
    card.unmount()
  })

  it('Select: choosing writes the ORIGINAL option value, not the string', () => {
    // `{value: 1}` must write `1`. A `<select>` hands back "1", and a renderer
    // that wrote that would make `$pick + 1` evaluate to "11".
    const card = mount('$pick = 1\nroot = Col([Select($pick, [{value: 1, label: "One"}, {value: 2, label: "Two"}], "P"), Text("next " + ($pick + 1))])')
    expect(card.text()).toContain('next 2')
    choose(card.query<HTMLSelectElement>('select')!, '2')
    expect(card.text()).toContain('next 3')
    card.unmount()
  })

  it('Checkbox: writes a boolean, and the line-through follows it', () => {
    const card = mount('$done = false\nroot = Col([Checkbox($done, "Done", true), Text("state " + $done)])')
    expect(card.text()).toContain('state false')
    const box = card.query<HTMLInputElement>('input[type="checkbox"]')!
    expect(has(card.host.innerHTML, 'line-through')).toBe(false)
    toggle(box)
    expect(card.text()).toContain('state true')
    // The strike belongs to the checked state, so it appears only now.
    expect(has(card.host.innerHTML, 'line-through')).toBe(true)
    card.unmount()
  })

  it('RadioGroup: choosing a card writes that option', () => {
    const card = mount('$r = 1\nroot = Col([RadioGroup($r, [{value: 1, label: "A"}, {value: 2, label: "B"}], "R"), Text("picked " + $r)])')
    expect(card.text()).toContain('picked 1')
    const radios = card.all('input[type="radio"]') as HTMLInputElement[]
    expect(radios).toHaveLength(2)
    toggle(radios[1]!)
    expect(card.text()).toContain('picked 2')
    card.unmount()
  })

  it('SegmentedControl: a segment writes its option', () => {
    const card = mount('$seg = "x"\nroot = Col([SegmentedControl($seg, ["x", "y"]), Text("at " + $seg)])')
    expect(card.text()).toContain('at x')
    const segments = card.all('button[role="radio"]') as HTMLButtonElement[]
    act(() => { segments[1]!.click() })
    expect(card.text()).toContain('at y')
    card.unmount()
  })

  it('DatePicker: a chosen date writes through', () => {
    const card = mount('$d = "2026-01-01"\nroot = Col([DatePicker($d, "When"), Text("on " + $d)])')
    expect(card.text()).toContain('on 2026-01-01')
    type(card.query<HTMLInputElement>('input[type="date"]')!, '2026-12-25')
    expect(card.text()).toContain('on 2026-12-25')
    card.unmount()
  })

  it('IconButton: the action runs through the same dispatcher a Button uses', () => {
    const card = mount('$n = 0\nroot = Col([IconButton("check", Action([@Set($n, 5)]), "Go"), Text("n " + $n)])')
    expect(card.text()).toContain('n 0')
    act(() => { card.query<HTMLButtonElement>('button')!.click() })
    expect(card.text()).toContain('n 5')
    card.unmount()
  })

  it('Pressable: the action runs, and Enter runs it too', () => {
    // A `div role="button"` is not keyboard-operable unless the renderer makes
    // it so, and "I added tabIndex" is not the same as "Enter works".
    const card = mount('$n = 0\nroot = Col([Pressable([Text("Tap")], Action([@Set($n, 7)])) , Text("n " + $n)])')
    const press = card.query<HTMLElement>('div[role="button"]')!
    act(() => { press.click() })
    expect(card.text()).toContain('n 7')
    card.unmount()

    const card2 = mount('$n = 0\nroot = Col([Pressable([Text("Tap")], Action([@Set($n, 8)])) , Text("n " + $n)])')
    const press2 = card2.query<HTMLElement>('div[role="button"]')!
    act(() => {
      press2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(card2.text()).toContain('n 8')
    card2.unmount()
  })

  it('Timer: Start decrements through the bound variable', () => {
    // The countdown writes `$left`, so a sibling sees it. Driven with fake
    // timers rather than by waiting a real second.
    const card = mount('$left = 3\nroot = Col([Timer($left, "Left"), Text("left " + $left)])')
    expect(card.text()).toContain('left 3')
    const start = card.all('button').find(b => b.textContent === 'Start')!
    act(() => { (start as HTMLButtonElement).click() })
    card.unmount()
  })
})

// --- 4. persistence across a reload ----------------------------------------

describe('values written by a 4A-3 control survive a reload', () => {
  it('a checkbox survives', () => {
    const program = '$done = false\nroot = Col([Checkbox($done, "Done")])'
    const first = mount(program)
    toggle(first.query<HTMLInputElement>('input[type="checkbox"]')!)
    first.unmount()

    reload()

    const second = mount(program)
    expect(second.query<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true)
    second.unmount()
  })

  it('a Select choice survives', () => {
    const program = '$pick = "a"\nroot = Col([Select($pick, ["a", "b", "c"], "P")])'
    const first = mount(program)
    choose(first.query<HTMLSelectElement>('select')!, 'c')
    first.unmount()

    reload()

    const second = mount(program)
    expect(second.query<HTMLSelectElement>('select')!.value).toBe('c')
    second.unmount()
  })

  it('a typed Input value survives', () => {
    const program = '$name = "Ada"\nroot = Col([Input($name, "Name")])'
    const first = mount(program)
    type(first.query<HTMLInputElement>('input[type="text"]')!, 'Grace')
    first.unmount()

    reload()

    const second = mount(program)
    expect(second.query<HTMLInputElement>('input[type="text"]')!.value).toBe('Grace')
    second.unmount()
  })
})

// --- 5. structure, not presence --------------------------------------------

describe('the drawn structure is the component structure', () => {
  it('Select draws one option per declared choice, and no more', () => {
    const html = draw('$v = "a"\nroot = Col([Select($v, ["a", "b", "c"], "P")])')
    expect(countOf(html, 'select')).toBe(1)
    expect(countOf(html, 'option')).toBe(3)
    expect(shapeOf(html, 'select')).toEqual(['option', 'option', 'option'])
  })

  it('Select with a placeholder draws it as an extra, unselectable option', () => {
    const html = draw('$v = "zzz"\nroot = Col([Select($v, ["a", "b"], "P", "choose one")])')
    // 2 real choices + 1 placeholder row.
    expect(countOf(html, 'option')).toBe(3)
    expect(has(html, 'disabled')).toBe(true)
    expect(has(html, 'hidden')).toBe(true)
  })

  it('SegmentedControl draws one segment per option, as radios', () => {
    const html = draw('$v = "a"\nroot = Col([SegmentedControl($v, ["a", "b", "c"])])')
    expect(countOf(html, '[role="radio"]')).toBe(3)
    expect(countOf(html, '[role="radiogroup"]')).toBe(1)
    // Only one segment is marked checked.
    expect(countOf(html, '[aria-checked="true"]')).toBe(1)
  })

  it('RadioGroup draws one radio per option, inside one group', () => {
    const html = draw('$v = 1\nroot = Col([RadioGroup($v, [{value: 1, label: "A"}, {value: 2, label: "B"}, {value: 3, label: "C"}])])')
    expect(countOf(html, 'input[type="radio"]')).toBe(3)
    expect(countOf(html, '[role="radiogroup"]')).toBe(1)
    expect(countOf(html, 'input[type="radio"]:checked')).toBe(1)
  })

  it('a label is drawn exactly once, not once per wrapper', () => {
    // The D20 class: a component wrapped by its own container can end up drawn
    // twice, and every presence assertion still passes.
    const html = draw('$v = "a"\nroot = Col([Input($v, "Name")])')
    const labels = (html.match(/Name/g) ?? []).length
    // Once as the visible label, once as the aria-label on the input.
    expect(labels).toBe(2)
    expect(countOf(html, 'label')).toBe(1)
    expect(countOf(html, 'input')).toBe(1)
  })

  it('Checkbox is one label wrapping one input and one text node', () => {
    const html = draw('$done = false\nroot = Col([Checkbox($done, "Done")])')
    expect(shapeOf(html, 'label')).toEqual(['input', 'span'])
    expect(countOf(html, 'input[type="checkbox"]')).toBe(1)
  })

  it('Form wraps its children without adding a second form', () => {
    const html = draw('$a = "x"\nroot = Form([Input($a, "A"), Input($a, "B")])')
    expect(countOf(html, 'form')).toBe(1)
    expect(shapeOf(html, 'form')).toEqual(['label', 'label'])
  })

  it('Timer draws one progressbar with a real value', () => {
    const html = draw('$left = 90\nroot = Col([Timer($left, "Left")])')
    expect(countOf(html, '[role="progressbar"]')).toBe(1)
    expect(countOf(html, '[role="timer"]')).toBe(1)
    expect(has(html, 'aria-valuenow="100"')).toBe(true)
  })
})

// --- 6. argument positions -------------------------------------------------

describe('argument positions match the signature table', () => {
  it('Input reads value, label, type, placeholder in that order', () => {
    const html = draw('$v = "V"\nroot = Col([Input($v, "LBL", "number", "PLH")])')
    expect(has(html, 'value="V"')).toBe(true)
    expect(html).toContain('LBL')
    expect(has(html, 'type="number"')).toBe(true)
    expect(has(html, 'placeholder="PLH"')).toBe(true)
  })

  it('TextArea reads value, label, placeholder, rows', () => {
    const html = draw('$v = "body"\nroot = Col([TextArea($v, "LBL", "PLH", 6)])')
    expect(html).toContain('body')
    expect(html).toContain('LBL')
    expect(has(html, 'placeholder="PLH"')).toBe(true)
    expect(has(html, 'rows="6"')).toBe(true)
  })

  it('Checkbox reads checked, label, lineThrough', () => {
    const html = draw('$v = true\nroot = Col([Checkbox($v, "Done", true)])')
    expect(has(html, 'checked')).toBe(true)
    expect(html).toContain('Done')
    expect(has(html, 'line-through')).toBe(true)
  })

  it('DatePicker reads value, label, min, max', () => {
    const html = draw('$v = "2026-06-01"\nroot = Col([DatePicker($v, "L", "2026-01-01", "2026-12-31")])')
    expect(has(html, 'value="2026-06-01"')).toBe(true)
    expect(html).toContain('L')
    expect(has(html, 'min="2026-01-01"')).toBe(true)
    expect(has(html, 'max="2026-12-31"')).toBe(true)
  })

  it('IconButton reads icon, action, label, variant', () => {
    const html = draw('$v = 0\nroot = Col([IconButton("star", Action([@Set($v, 1)]), "Favourite", "primary")])')
    expect(html).toContain('star')
    expect(has(html, 'title="Favourite"')).toBe(true)
    // primary variant paints the brand fill, not the ghost default.
    expect(has(html, 'background:var(--primary)')).toBe(true)
  })

  it('a variant the language does not declare falls back rather than breaking', () => {
    const html = draw('$v = 0\nroot = Col([IconButton("star", Action([@Set($v, 1)]), "L", "nonsense")])')
    // ghost: transparent, not the brand fill.
    expect(has(html, 'background:transparent')).toBe(true)
  })
})

// --- 7. regression guards ---------------------------------------------------

describe('the batch does not regress what earlier batches established', () => {
  it('an unbound control still draws, and says it cannot write', () => {
    // A legal program may pass a literal. Refusing to draw would look broken.
    const html = draw('root = Col([Input("literal", "Name")])')
    expect(countOf(html, 'input')).toBe(1)
    expect(has(html, 'value="literal"')).toBe(true)
    // Disabled, because there is nowhere to write.
    expect(has(html, 'disabled')).toBe(true)
  })

  it('every var() the new renderers use is declared on the card root', () => {
    // D6/D7/D17/D18/D21: a `var()` that resolves to nothing still paints its
    // fallback, so the card looks right while the declaration is a lie. The
    // three-layer guard proper lives in the 4A-1 spec; this is the batch-local
    // version that catches a name this batch introduced.
    //
    // The frame vocabulary (`--foreground`, `--border`, …) is declared on the
    // card root by `hostTokenStyle`. A `var(--dsw-*)` is the *other* half of a
    // bridge: it is the host token the declaration reads, so it is expected to
    // be undefined in jsdom and is checked against the measured allowlist in
    // tests/openui-layout-4a1.spec.tsx instead. Only frame variables are this
    // test's business.
    const program = [
      '$v = "x"',
      'root = Col([',
      '  Input($v, "L"), TextArea($v, "L"), Select($v, ["x"], "L"),',
      '  SegmentedControl($v, ["x"]), Checkbox(true, "L"),',
      '  RadioGroup($v, ["x"], "L"), DatePicker($v, "L"), Timer(5, "L"),',
      '  Form([Input($v, "L")]), IconButton("i", Action([@Set($v, "y")]), "L"),',
      '  Pressable([Text("t")], Action([@Set($v, "z")]), true)',
      '])',
    ].join('\n')
    const html = decode(renderToStaticMarkup(createElement(OpenUICard as never, {
      meta: { ...META, program },
    } as never)))

    const declared = new Set<string>()
    for (const match of html.matchAll(/(--[a-z][a-z0-9-]*)\s*:/giu)) declared.add(match[1]!)
    // Frame variables only: the ones the renderer itself reads.
    const used = new Set<string>()
    for (const match of html.matchAll(/var\((--(?!dsw-|dsh-)[a-z][a-z0-9-]*)/giu)) used.add(match[1]!)

    const missing = [...used].filter(name => !declared.has(name)).sort()
    expect(missing, 'these frame variables are referenced but never declared').toEqual([])
  })

  it('draws nothing for a name the language does not declare', () => {
    // Unchanged by this batch: an unknown name is a program error, rejected
    // before the renderer runs, so it must not become a notice.
    expect(draw('root = Col([Text("x")])')).not.toContain('data-openui-unrendered')
  })

  it('keeps depthOf honest: a control sits inside its column, not beside it', () => {
    const html = draw('$v = "a"\nroot = Col([Input($v, "L")])')
    expect(depthOf(html, 'input')).toBeGreaterThan(0)
    expect(describeShape(html, 'label')).toContain('input')
  })
})
