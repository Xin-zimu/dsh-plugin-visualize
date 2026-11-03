// @vitest-environment jsdom

/**
 * ADR-006: an OpenUI card's `$state` survives a reload, without disturbing the
 * HTML backend's store it shares.
 *
 * These are the rules, tested where they live. The pure cases pin the merge and
 * refusal semantics; the component cases use the real card, the real evaluator
 * and the real store over a fake `localStorage`, so "it persisted" means the
 * next mount read it back.
 */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { evaluateProgram } from '../src/backends/openui/evaluate.ts'
import type { EvaluationValue } from '../src/backends/openui/evaluate.ts'
import { parseProgram } from '../src/backends/openui/parse.ts'
import { OpenUICard, stateKeyFor } from '../src/client/OpenUICard.tsx'
import {
  createCardStateStore, cardStateKey, cardStates, resetCardStates, STORAGE_PREFIX, type CardStateStore, type StateStorage,
} from '../src/client/card-state.ts'
import {
  buildRecord, hydrateState, kindOf, mergeValues, openuiStateKey, readRecord, schemaHash,
} from '../src/client/openui-state.ts'
import type { OpenUIMeta } from '../src/fragment.ts'

const META: OpenUIMeta = {
  kind: 'intelligent_ui',
  program: '',
  title: 'T',
  mode: 'inline',
  path: '~/s/card-1.openui.html',
  style: 'whale',
}

/** Defaults of a program, the way the card computes them. */
function defaultsOf(program: string): Record<string, EvaluationValue> {
  const parsed = parseProgram(program)
  return { ...evaluateProgram(parsed, { state: {} }).stateDefaults }
}

/** An in-memory Storage with the same surface the store uses. */
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
/**
 * Bump the page clock and force a flush, the way a reload would.
 *
 * A real page flushes on `pagehide`; jsdom does not fire one, so the pending
 * debounce is flushed explicitly before the store is replaced. Without this the
 * test would read storage before the card had written to it and would be
 * testing its own timing rather than the persistence rule.
 * @returns nothing.
 */
function reload(): void {
  cardStates.flush()
  // A new page: fresh store over the same bytes, nothing in memory.
  resetCardStates(() => storage, { delayMs: 0 })
}

/** Mount a card and return helpers. */
function mount(program: string, meta: Partial<OpenUIMeta> = {}, stateKey?: string) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const render = () => {
    const card = { ...META, ...meta, program }
    const key = stateKey === undefined ? stateKeyFor(card, 's1', 'call-1') : stateKey
    act(() => { root.render(<OpenUICard meta={card} stateKey={key} />) })
  }
  render()
  return {
    host,
    render,
    unmount: () => { act(() => root.unmount()); host.remove() },
    slider: () => host.querySelector('input[type="range"]') as HTMLInputElement | null,
  }
}

/** Drag a slider the way a pointer would. */
function drag(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

/** The stored OpenUI record for a card, if any. */
function storedRecord(key: string): unknown {
  const raw = storage.getItem(STORAGE_PREFIX + openuiStateKey(key))
  return raw === null ? undefined : (JSON.parse(raw) as { s: unknown }).s
}

const SLIDER = [
  '$count = 3',
  'root = Col([Slider($count, 1, 10, 1, "n"), Text("count " + @Format($count, "number"))])',
].join('\n')

describe('schemaHash', () => {
  it('digests names and kinds, not values', () => {
    // Same names, same kinds, different defaults: one digest.
    expect(schemaHash({ a: 1, b: 'x' })).toBe(schemaHash({ a: 999, b: 'y' }))
    // A different name, or a different kind, is a different surface.
    expect(schemaHash({ a: 1 })).not.toBe(schemaHash({ a: 1, b: 1 }))
    expect(schemaHash({ a: 1 })).not.toBe(schemaHash({ a: '1' }))
    expect(schemaHash({ a: 1 })).not.toBe(schemaHash({ a: true }))
  })

  it('is stable across statement order', () => {
    expect(schemaHash({ a: 1, b: 2 })).toBe(schemaHash({ b: 2, a: 1 }))
  })

  it('does not see a dynamic default change (case 18)', () => {
    // The reason this matters: a card with @Now() in it must not migrate its
    // state every time the clock moves.
    const program = '$t = @Now()\n$n = 1\nroot = Text("x")'
    const first = defaultsOf(program)
    const second = { ...first, t: String(first['t']) + '-later' }
    expect(kindOf(first['t'])).toBe('string')
    expect(schemaHash(first)).toBe(schemaHash(second))
  })

  it('treats the evaluator’s own descriptors as non-data', () => {
    expect(kindOf({ kind: 'binding', name: 'a', value: 1 })).toBe('other')
    expect(kindOf({ kind: 'element', name: 'Text', args: [] })).toBe('other')
    expect(kindOf({ plain: 1 })).toBe('object')
  })
})

describe('hydrateState', () => {
  const defaults = { count: 3, label: 'hi', on: false }

  it('restores matching values (cases 1 and 2)', () => {
    const record = { v: 1, h: schemaHash(defaults), values: { count: 6, on: true } }
    expect(hydrateState(record, defaults).state).toEqual({ count: 6, on: true })
  })

  it('keeps old values when a variable is added (case 3)', () => {
    const grown = { ...defaults, extra: 1 }
    const record = { v: 1, h: schemaHash({ count: 3, label: 'hi' }), values: { count: 6 } }
    const result = hydrateState(record, grown)
    expect(result.state).toEqual({ count: 6 })
    // The new variable is simply absent, so the evaluator uses its default.
    expect(result.state).not.toHaveProperty('extra')
  })

  it('drops a variable the program no longer declares, and asks for repair (case 4)', () => {
    const record = { v: 1, h: schemaHash(defaults), values: { count: 6, gone: 1 } }
    const result = hydrateState(record, defaults)
    expect(result.state).toEqual({ count: 6 })
    expect(result.dropped).toEqual([{ name: 'gone', reason: 'unknown' }])
    expect(result.needsRepair).toBe(true)
  })

  it('falls back on a type change but keeps its siblings (case 5)', () => {
    const changed = { ...defaults, count: '3' }
    const record = { v: 1, h: schemaHash(defaults), values: { count: 6, on: true } }
    const result = hydrateState(record, changed)
    expect(result.state).toEqual({ on: true })
    expect(result.dropped).toEqual([{ name: 'count', reason: 'kind' }])
  })

  it('refuses a binding descriptor rather than repairing it (case 11)', () => {
    const record = {
      v: 1, h: schemaHash(defaults),
      values: { count: { kind: 'binding', name: 'count', value: 6 } },
    }
    const result = hydrateState(record, defaults)
    expect(result.state).toEqual({})
    expect(result.dropped[0]?.reason).toBe('unsafe')
  })

  it('reads corrupt, foreign and over-large data as nothing saved (case 15)', () => {
    for (const raw of [
      undefined, null, 'nonsense', [], {},
      { v: 2, h: 'x', values: { count: 6 } },          // unknown version
      { v: 1, h: 5, values: { count: 6 } },            // malformed hash
      { v: 1, h: 'x', values: [1, 2] },                // values not an object
    ]) {
      expect(hydrateState(raw, defaults).state).toEqual({})
    }
    // A single oversized value drops on its own.
    const big = { v: 1, h: schemaHash(defaults), values: { label: 'x'.repeat(5000), count: 6 } }
    const result = hydrateState(big, defaults)
    expect(result.state).toEqual({ count: 6 })
    expect(result.dropped[0]?.reason).toBe('size')
  })

  it('does not mutate the defaults it is given (case 12)', () => {
    const before = JSON.stringify(defaults)
    hydrateState({ v: 1, h: 'x', values: { count: 6, label: 'a', on: true } }, defaults)
    expect(JSON.stringify(defaults)).toBe(before)
  })
})

describe('record and merge', () => {
  it('builds a record only from variables the program declares', () => {
    const record = buildRecord('h', { count: 6, unknown: 1, fn: () => 1 }, { count: 3 })
    expect(record).toEqual({ v: 1, h: 'h', values: { count: 6 } })
    expect(buildRecord('h', {}, { count: 3 })).toBeUndefined()
  })

  it('merges two views with the newer value winning per key (case 16)', () => {
    expect(mergeValues({ count: 2, on: true }, { count: 6 })).toEqual({ count: 6, on: true })
  })

  it('round-trips a record through readRecord', () => {
    const record = { v: 1, h: 'abc', values: { count: 6, on: true } }
    expect(readRecord(record)).toEqual(record)
    expect(readRecord({ ...record, values: { count: 6, bad: undefined } })?.values).toEqual({ count: 6 })
  })
})

describe('the card persists $state', () => {
  it('restores a Slider value after a reload (case 1, the acceptance case)', () => {
    const first = mount(SLIDER)
    expect(first.host.textContent).toContain('count 3')
    drag(first.slider()!, '6')
    expect(first.host.textContent).toContain('count 6')
    first.unmount()
    reload()

    const second = mount(SLIDER)
    expect(second.host.textContent).toContain('count 6')
    expect(second.slider()!.value).toBe('6')
    second.unmount()
  })

  it('keeps two cards in one session apart (case 7)', () => {
    const a = mount(SLIDER, { path: '~/s/a.openui.html' })
    drag(a.slider()!, '9')
    a.unmount()
    const b = mount(SLIDER, { path: '~/s/b.openui.html' })
    expect(b.host.textContent).toContain('count 3')
    b.unmount()
    reload()
    const again = mount(SLIDER, { path: '~/s/a.openui.html' })
    expect(again.host.textContent).toContain('count 9')
    again.unmount()
  })

  it('keys state by session, so two sessions never mix (case 6)', () => {
    const one = mount(SLIDER, {}, cardStateKey('s1', META.path, 'call-1'))
    drag(one.slider()!, '8')
    one.unmount()
    reload()
    const other = mount(SLIDER, {}, cardStateKey('s2', META.path, 'call-1'))
    expect(other.host.textContent).toContain('count 3')
    other.unmount()
  })

  it('persists nothing without a session, and still works (case 14)', () => {
    const card = mount(SLIDER, {}, stateKeyFor(META, undefined, 'call-1'))
    drag(card.slider()!, '7')
    expect(card.host.textContent).toContain('count 7')
    expect([...storage.items.keys()]).toEqual([])
    card.unmount()
  })

  it('persists nothing for a streaming card', () => {
    expect(stateKeyFor({ ...META, path: 'streaming' }, 's1', 'call-1')).toBeUndefined()
    const card = mount(SLIDER, { path: 'streaming' }, stateKeyFor({ ...META, path: 'streaming' }, 's1', 'call-1'))
    drag(card.slider()!, '7')
    expect([...storage.items.keys()]).toEqual([])
    card.unmount()
  })

  it('survives rapid interaction and keeps only the last value (case 8)', () => {
    const card = mount(SLIDER)
    for (const value of ['4', '5', '6', '7', '8']) drag(card.slider()!, value)
    expect(card.host.textContent).toContain('count 8')
    card.unmount()
    reload()
    const again = mount(SLIDER)
    expect(again.host.textContent).toContain('count 8')
    again.unmount()
  })

  it('renders and stays interactive when storage refuses everything (case 9)', () => {
    const throwing: StateStorage = {
      length: 0,
      key: () => null,
      getItem: () => { throw new DOMException('denied', 'SecurityError') },
      setItem: () => { throw new DOMException('denied', 'SecurityError') },
      removeItem: () => undefined,
    }
    resetCardStates(() => throwing, { delayMs: 0 })
    const card = mount(SLIDER)
    expect(() => drag(card.slider()!, '6')).not.toThrow()
    expect(card.host.textContent).toContain('count 6')
    card.unmount()
  })

  it('repairs a record left by an older program (case 4, end to end)', () => {
    // A card that used to declare `extra`, now does not.
    const key = cardStateKey('s1', META.path, 'call-1')
    storage.setItem(`${STORAGE_PREFIX}${openuiStateKey(key)}`, JSON.stringify({
      t: 1, s: { v: 1, h: schemaHash({ count: 3, extra: 1 }), values: { count: 6, extra: 42 } },
    }))
    const card = mount(SLIDER)
    expect(card.host.textContent).toContain('count 6')
    card.unmount()
    cardStates.flush()
    // The dead name is gone from the stored record.
    expect(readRecord(storedRecord(key))?.values).toEqual({ count: 6 })
  })

  it('keeps a value when only the program’s text changed (case 13)', () => {
    const first = mount(SLIDER)
    drag(first.slider()!, '6')
    first.unmount()
    reload()
    // Same variables, reworded label and different default.
    const reworded = [
      '$count = 5',
      'root = Col([Slider($count, 1, 10, 1, "amount"), Text("total " + @Format($count, "number"))])',
    ].join('\n')
    const second = mount(reworded)
    expect(second.host.textContent).toContain('total 6')
    second.unmount()
  })
})

describe('the two backends share one ledger', () => {
  /** A store over the same bytes, so records from both backends are visible. */
  function sharedStore(): CardStateStore {
    return createCardStateStore(() => storage, { delayMs: 0 })
  }

  it('keeps the HTML and OpenUI records on distinct keys (case 17)', () => {
    const cardKey = cardStateKey('s1', META.path, 'call-1')
    const htmlKey = STORAGE_PREFIX + cardKey
    const uiKey = STORAGE_PREFIX + openuiStateKey(cardKey)
    expect(htmlKey).not.toBe(uiKey)
    // The HTML record keeps its own shape at its own key.
    storage.setItem(htmlKey, JSON.stringify({ t: 1, s: { 'keep:r': '7' } }))
    const card = mount(SLIDER)
    drag(card.slider()!, '6')
    card.unmount()
    cardStates.flush()
    expect(JSON.parse(storage.getItem(htmlKey)!).s).toEqual({ 'keep:r': '7' })
  })

  it('counts both record shapes against one total cap (case 17)', () => {
    // A small budget: the HTML record and the OpenUI record compete for it.
    let clock = 0
    const small = createCardStateStore(() => storage, { totalMaxChars: 220, now: () => ++clock })
    const htmlKey = STORAGE_PREFIX + 's1|a.html'
    const uiKey = STORAGE_PREFIX + openuiStateKey('s1|b.html')
    small.write('s1|a.html', { 'keep:r': 'x'.repeat(20) })
    small.flush()
    small.write(openuiStateKey('s1|b.html'), { v: 1, h: 'h', values: { count: 'y'.repeat(20) } })
    small.flush()
    // Both fit for now.
    expect(storage.getItem(htmlKey)).not.toBeNull()
    expect(storage.getItem(uiKey)).not.toBeNull()
    // A third card overflows the shared budget and evicts the oldest change.
    small.write('s1|c.html', { 'keep:r': 'z'.repeat(60) })
    small.flush()
    expect(storage.getItem(htmlKey)).toBeNull()
    expect(storage.getItem(uiKey)).not.toBeNull()
    expect([...storage.items.keys()].every(k => k.startsWith(STORAGE_PREFIX))).toBe(true)
  })

  it('applies the same per-card cap to an OpenUI record', () => {
    const store = createCardStateStore(() => storage, { cardMaxChars: 60, delayMs: 0 })
    const key = openuiStateKey('s1|big.html')
    store.write(key, { v: 1, h: 'h', values: { count: 'x'.repeat(200) } })
    store.flush()
    expect(storedRecord('s1|big.html')).toBeUndefined()
  })
})
