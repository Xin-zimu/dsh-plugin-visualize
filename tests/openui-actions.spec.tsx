// @vitest-environment jsdom

/**
 * P3-07 — Button action dispatch.
 *
 * A Button's `action` arrives from the evaluator as a value tree, never as code.
 * These tests pin what the dispatcher does with each shape, what it refuses, and
 * — the part that is easy to get wrong — which snapshot a step reads inside an
 * `Action([...])`.
 *
 * The card-level cases drive the real component so "the state changed" means the
 * tree re-evaluated and the value persisted, not merely that a function returned
 * an object.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { evaluateProgram } from '../src/backends/openui/evaluate.ts'
import type { EvaluationValue } from '../src/backends/openui/evaluate.ts'
import { parseProgram } from '../src/backends/openui/parse.ts'
import { OpenUICard } from '../src/client/OpenUICard.tsx'
import { applyAction, SUPPORTED_STEPS, UNSUPPORTED_STEPS } from '../src/client/openui-actions.ts'
import { cardStateKey, cardStates, resetCardStates, STORAGE_PREFIX, type StateStorage } from '../src/client/card-state.ts'
import { openuiStateKey } from '../src/client/openui-state.ts'
import type { OpenUIMeta } from '../src/fragment.ts'

// One statement per physical line: the language has no line continuation, so a
// multi-line `Col([...])` is a parse error rather than a layout choice.
const PROGRAM = [
  '$count = 3',
  '$step = 1',
  'inc = Button("inc", @Set($count, 6), "primary")',
  'resetBtn = Button("reset", @Reset(), "secondary")',
  'showCount = Text("count " + @Format($count, "number"))',
  'showStep = Text("step " + @Format($step, "number"))',
  'root = Col([inc, resetBtn, showCount, showStep])',
].join('\n')

/** Defaults of a program, as the card computes them. */
function defaultsOf(program: string): Record<string, EvaluationValue> {
  return { ...evaluateProgram(parseProgram(program), { state: {} }).stateDefaults }
}

/** The evaluated action of the first Button, by its label. */
function actionOf(program: string, label: string): unknown {
  const result = evaluateProgram(parseProgram(program), { state: {} })
  const walk = (value: EvaluationValue): unknown => {
    if (value === null || typeof value !== 'object') return undefined
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = walk(item)
        if (hit !== undefined) return hit
      }
      return undefined
    }
    const record = value as { kind?: string; name?: string; args?: readonly EvaluationValue[] }
    if (record.kind === 'element' && record.name === 'Button' && record.args?.[0] === label) {
      return record.args[1]
    }
    for (const arg of record.args ?? []) {
      const hit = walk(arg as EvaluationValue)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  return walk(result.root as EvaluationValue)
}

let storage: Map<string, string>

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  storage = new Map()
  const fake: StateStorage = {
    get length() { return storage.size },
    key: i => [...storage.keys()][i] ?? null,
    getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => { storage.set(k, v) },
    removeItem: k => { storage.delete(k) },
  }
  resetCardStates(() => fake, { delayMs: 0 })
})

afterEach(() => {
  document.body.innerHTML = ''
})

const META: OpenUIMeta = {
  kind: 'intelligent_ui', program: PROGRAM, title: 'Acts', mode: 'inline',
  path: 'viz/acts.openui.html', style: 'whale',
}

/** Mount a card and return helpers. */
function mount(program = PROGRAM) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const card = { ...META, program }
  const key = cardStateKey('s1', card.path, 'call-1')
  act(() => { root.render(<OpenUICard meta={card} stateKey={key} />) })
  return {
    host,
    key,
    unmount: () => { act(() => root.unmount()); host.remove() },
    button: (label: string) => {
      const hit = [...host.querySelectorAll('button')].find(b => (b.textContent || '') === label)
      if (!hit) throw new Error(`no button "${label}"`)
      return hit
    },
    text: () => host.textContent ?? '',
  }
}

/** Click a Button the way a pointer would, inside act(). */
function click(view: ReturnType<typeof mount>, label: string) {
  const target = view.button(label)
  act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('action descriptor shapes', () => {
  it('reads the supported steps from the evaluator', () => {
    expect(SUPPORTED_STEPS.has('Set')).toBe(true)
    expect(SUPPORTED_STEPS.has('Reset')).toBe(true)
    expect(SUPPORTED_STEPS.has('Action')).toBe(true)
    // `CopyToClipboard` moved into this set when stage 4B shipped it (ADR-013).
    // Asserting it is supported rather than that the set has three members is the
    // point: the *behaviour* is what the tests below cover, and this one only says
    // which vocabulary the dispatcher will consider.
    expect(SUPPORTED_STEPS.has('CopyToClipboard')).toBe(true)
    // Still recognised so a refusal can name them, and still not executed.
    expect([...UNSUPPORTED_STEPS].sort()).toEqual(['OpenUrl', 'ToAssistant'])
  })
})

describe('applyAction', () => {
  const defaults = { count: 3, step: 1 }

  it('sets one variable (A01)', () => {
    const outcome = applyAction(actionOf(PROGRAM, 'inc'), defaults)
    expect(outcome.patch).toEqual({ count: 6 })
    expect(outcome.diagnostics).toEqual([])
  })

  it('resets every declared variable to its default (A03)', () => {
    const outcome = applyAction(actionOf(PROGRAM, 'reset'), defaults)
    expect(outcome.patch).toEqual({ count: 3, step: 1 })
  })

  it('notes that @Reset ignores its arguments, matching upstream (A03)', () => {
    // Upstream's executor calls `store.reset()` with no argument, so a program
    // that names variables gets a full reset either way. Reproduced, not fixed.
    const program = '$count = 3\n$step = 1\nroot = Button("r", @Reset($count))'
    const outcome = applyAction(actionOf(program, 'r'), defaults)
    expect(outcome.patch).toEqual({ count: 3, step: 1 })
    expect(outcome.diagnostics.map(d => d.code)).toEqual(['action.reset-ignores-args'])
    expect(outcome.diagnostics[0]?.severity).toBe('noted')
  })

  it('runs a list in order, with the last write to a variable winning (A04)', () => {
    const program = '$count = 3\nroot = Button("b", Action([@Set($count, 5), @Set($count, 9)]))'
    const outcome = applyAction(actionOf(program, 'b'), defaults)
    expect(outcome.patch).toEqual({ count: 9 })
  })

  it('reads a pre-click snapshot, not each other’s writes (A04)', () => {
    // The evaluator froze `$count + 1` against the state at render time, so both
    // steps carry 4. Steps apply in order and the later one wins; neither
    // re-reads what the earlier one wrote. This is upstream's contract.
    const program = '$count = 3\nroot = Button("b", Action([@Set($count, $count + 1), @Set($count, $count + 1)]))'
    const outcome = applyAction(actionOf(program, 'b'), defaults)
    expect(outcome.patch).toEqual({ count: 4 })
  })

  it('accepts a bare array of steps, as upstream does (A04)', () => {
    const program = '$count = 3\nroot = Button("b", Action([@Set($count, 7), @Reset()]))'
    expect(applyAction(actionOf(program, 'b'), defaults).patch).toEqual({ count: 3, step: 1 })
  })

  it('refuses a @Set whose first argument is not a variable (A05)', () => {
    // A literal in that slot cannot become a binding, so nothing is written.
    const descriptor = {
      kind: 'element', name: '@Set', args: ['count', 6], line: 1,
    }
    const outcome = applyAction(descriptor, defaults)
    expect(outcome.patch).toEqual({})
    expect(outcome.diagnostics.map(d => d.code)).toEqual(['action.bad-binding'])
    expect(outcome.diagnostics[0]?.severity).toBe('refused')
  })

  it('refuses a @Set on a variable the program does not declare (A05)', () => {
    const descriptor = {
      kind: 'element', name: '@Set', args: [{ kind: 'binding', name: 'ghost', value: null }, 1], line: 1,
    }
    const outcome = applyAction(descriptor, defaults)
    expect(outcome.patch).toEqual({})
    expect(outcome.diagnostics.map(d => d.code)).toEqual(['action.unknown-variable'])
  })

  it('refuses the out-of-scope steps without side effects (A06)', () => {
    // `@CopyToClipboard` is no longer in this list: it shipped in 4B and is covered
    // by tests/openui-clipboard-4b.spec.tsx. Deleting it from here without that
    // file existing would have quietly removed the only check on it.
    for (const name of ['@OpenUrl', '@ToAssistant']) {
      const descriptor = { kind: 'element', name, args: ['https://example.com'], line: 1 }
      const outcome = applyAction(descriptor, defaults)
      expect(outcome.patch).toEqual({})
      expect(outcome.diagnostics.map(d => d.code)).toEqual(['action.unsupported'])
      expect(outcome.clipboard, name + ' must not reach the clipboard').toBeUndefined()
    }
  })

  it('refuses an unknown name, a malformed step and a bad Action body (A06)', () => {
    expect(applyAction({ kind: 'element', name: '@Explode', args: [] }, defaults).diagnostics[0]?.code).toBe('action.unknown')
    expect(applyAction({ nope: true }, defaults).diagnostics[0]?.code).toBe('action.shape')
    expect(applyAction({ kind: 'element', name: 'Action', args: ['not a list'] }, defaults).diagnostics[0]?.code).toBe('action.bad-list')
    expect(applyAction('text', defaults).diagnostics[0]?.code).toBe('action.shape')
  })

  it('writes nothing for a Button with no action (A06)', () => {
    expect(applyAction(undefined, defaults)).toEqual({ patch: {}, diagnostics: [] })
    expect(applyAction(null, defaults)).toEqual({ patch: {}, diagnostics: [] })
  })

  it('refuses a deeply nested action rather than recursing forever (A06)', () => {
    let nested: unknown = { kind: 'element', name: 'Action', args: [[]] }
    for (let i = 0; i < 60; i += 1) nested = { kind: 'element', name: 'Action', args: [[nested]] }
    const outcome = applyAction(nested, defaults)
    expect(outcome.diagnostics.some(d => d.code === 'action.too-deep')).toBe(true)
  })

  it('never mutates the defaults it is given (A05)', () => {
    const before = JSON.stringify(defaults)
    applyAction(actionOf(PROGRAM, 'reset'), defaults)
    applyAction(actionOf(PROGRAM, 'inc'), defaults)
    expect(JSON.stringify(defaults)).toBe(before)
  })
})

describe('a Button drives the card', () => {
  it('re-evaluates the tree on click (A01)', () => {
    const view = mount()
    expect(view.text()).toContain('count 3')
    click(view, 'inc')
    expect(view.text()).toContain('count 6')
    view.unmount()
  })

  it('keeps the latest state across repeated clicks (A02)', () => {
    // Each click re-evaluates, so a counter built from the current value climbs.
    const program = [
      '$n = 0',
      'add = Button("add", @Set($n, $n + 1))',
      'show = Text("n " + @Format($n, "number"))',
      'root = Col([add, show])',
    ].join('\n')
    const view = mount(program)
    expect(view.text()).toContain('n 0')
    click(view, 'add')
    expect(view.text()).toContain('n 1')
    click(view, 'add')
    expect(view.text()).toContain('n 2')
    click(view, 'add')
    expect(view.text()).toContain('n 3')
    view.unmount()
  })

  it('resets every variable on @Reset (A03)', () => {
    const program = [
      '$a = 1',
      '$b = 2',
      'bump = Button("bump", Action([@Set($a, 7), @Set($b, 8)]))',
      'reset = Button("reset", @Reset())',
      'show = Text("a " + @Format($a, "number") + " b " + @Format($b, "number"))',
      'root = Col([bump, reset, show])',
    ].join('\n')
    const view = mount(program)
    click(view, 'bump')
    expect(view.text()).toContain('a 7 b 8')
    click(view, 'reset')
    expect(view.text()).toContain('a 1 b 2')
    view.unmount()
  })

  it('persists what a Button changed (A07)', () => {
    const view = mount()
    click(view, 'inc')
    expect(view.text()).toContain('count 6')
    cardStates.flush()
    const raw = storage.get(`${STORAGE_PREFIX}${openuiStateKey(view.key)}`)
    expect(raw).toBeDefined()
    const record = JSON.parse(raw!) as { s: { values: Record<string, unknown> } }
    expect(record.s.values['count']).toBe(6)
    view.unmount()
  })

  it('restores a Button-changed value on the next mount (A07)', () => {
    const first = mount()
    click(first, 'inc')
    first.unmount()
    cardStates.flush()
    resetCardStates(() => ({
      get length() { return storage.size },
      key: i => [...storage.keys()][i] ?? null,
      getItem: k => storage.get(k) ?? null,
      setItem: (k, v) => { storage.set(k, v) },
      removeItem: k => { storage.delete(k) },
    }), { delayMs: 0 })

    const second = mount()
    expect(second.text()).toContain('count 6')
    second.unmount()
  })

  it('leaves an actionless Button inert: no state, no message (A06)', () => {
    const view = mount('root = Col([Button("plain"), Text("count 3")])')
    expect(() => click(view, 'plain')).not.toThrow()
    expect(view.text()).toContain('count 3')
    cardStates.flush()
    // Nothing was written, so no record exists for this card.
    expect(storage.get(`${STORAGE_PREFIX}${openuiStateKey(view.key)}`)).toBeUndefined()
    view.unmount()
  })

  it('does not run an action during render (A06)', () => {
    // Mounting a card with a @Set action must not apply it: only a click does.
    const view = mount()
    expect(view.text()).toContain('count 3')
    cardStates.flush()
    expect(storage.get(`${STORAGE_PREFIX}${openuiStateKey(view.key)}`)).toBeUndefined()
    view.unmount()
  })

  it('renders a disabled Button without firing it (A06)', () => {
    const view = mount('$n = 1\nroot = Col([Button("go", @Set($n, 9), "primary", null, null, true), Text("n " + @Format($n, "number"))])')
    const target = view.button('go') as HTMLButtonElement
    expect(target.disabled).toBe(true)
    act(() => { target.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(view.text()).toContain('n 1')
    view.unmount()
  })
})

/**
 * A08 — a Button change reaches both conversation surfaces.
 *
 * The toolview and the turn tail mount the same card with the same state key, so
 * a click in one must be what the other reads. This is the same hazard the
 * OpenUI write-merge was built for, exercised through a Button rather than a
 * Slider.
 */
describe('a Button change is visible on both surfaces (A08)', () => {
  /** Mount one card the way a surface does. */
  function surface(label: string) {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const key = cardStateKey('s1', META.path, 'call-1')
    act(() => { root.render(<OpenUICard meta={{ ...META, title: label }} stateKey={key} />) })
    return {
      host,
      key,
      button: (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!,
      unmount: () => { act(() => root.unmount()); host.remove() },
      text: () => host.textContent ?? '',
    }
  }

  it('shows a click from the other surface after a remount', () => {
    const first = surface('toolview')
    act(() => { first.button('inc').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(first.text()).toContain('count 6')
    first.unmount()
    cardStates.flush()

    // The second surface reads the same key: it must start from 6, not 3.
    const second = surface('turn-tail')
    expect(second.text()).toContain('count 6')
    second.unmount()
  })

  it('does not reset the other surface’s value when both are mounted', () => {
    const a = surface('toolview')
    act(() => { a.button('inc').dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(a.text()).toContain('count 6')

    const b = surface('turn-tail')
    expect(b.text()).toContain('count 6')
    cardStates.flush()

    // Reading the record back: still 6, so mounting B did not write a default.
    const record = cardStates.read(openuiStateKey(a.key)) as { values?: Record<string, unknown> } | undefined
    expect(record?.values?.['count']).toBe(6)
    a.unmount()
    b.unmount()
  })
})
