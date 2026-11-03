// @vitest-environment jsdom

/**
 * Hosts from dsh 0.1.2 fold a finished turn's process rows, visualize cards
 * included, in their default work-details mode. The plugin re-shows the
 * turn's cards on the turn tail — only while the host folds, only cards
 * settled before the closing reply, once per card path — and must keep
 * loading on hosts that have neither the Conversation registry nor a folding
 * preference.
 */

import { act, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { apply } from '../src/client/index.tsx'
import { configFormsFolds, foldingSource, settingsScopeFolds } from '../src/client/folding.ts'
import {
  cardsBefore, foldCard, resetEnclosingTurns, selectTurnCards, TURN_CARDS_KEY, turnCardsDefinition, TurnCards,
  type TurnCard,
} from '../src/client/TurnCards.tsx'
import { STREAM_KEY } from '../src/client/StreamingPreview.tsx'
import { cardStateKey, cardStates, resetCardStates, STORAGE_PREFIX, type StateStorage } from '../src/client/card-state.ts'
import { openuiStateKey } from '../src/client/openui-state.ts'
import type { OpenUIMeta, VisualizeMeta } from '../src/fragment.ts'

/** A well-formed persisted descriptor. */
function meta(path: string, title = path): VisualizeMeta {
  return { kind: 'visualize', fragment: `<div>${title}</div>`, title, mode: 'inline', path, style: 'whale' }
}

/** A `tool/result` event as the host logs it. */
function result(seq: number, callId: string, resultMeta: unknown, isError = false) {
  return {
    type: 'tool/result', seq,
    data: { turn: 1, meta: resultMeta, message: { isError, source: { callId } } },
  } as never
}

const TURN_START = { type: 'turn/start', seq: 0, data: { turn: 1 } } as never

/** A Turn Location whose data store holds the given cards. */
function turnWith(cards: readonly TurnCard[]) {
  return { data: { get: (key: string) => key === TURN_CARDS_KEY ? { cards } : undefined } } as never
}

/**
 * Drive the Definition the way the Conversation engine does for one turn.
 * @param events - events after `turn/start`.
 * @returns the final state.
 */
function reduce(events: readonly never[]) {
  const def = turnCardsDefinition
  let state = def.start({} as never, { event: TURN_START, role: 'start' } as never, {} as never)
  for (const event of events) {
    if (def.match(event) === null) continue
    state = def.update({ state } as never, { event, role: 'update' } as never)
  }
  return state
}

beforeAll(() => {
  // jsdom lacks matchMedia; the frame only subscribes to appearance flips.
  window.matchMedia ??= (() => ({ addEventListener() {}, removeEventListener() {} })) as never
})

describe('turn cards definition', () => {
  it('claims turn starts and successful visualize results only', () => {
    const def = turnCardsDefinition
    expect(def.match(TURN_START)).toEqual({ id: '1', role: 'start' })
    expect(def.match(result(3, 'a', meta('viz/a.html')))).toEqual({ id: '1', role: 'update' })
    expect(def.match(result(3, 'a', meta('viz/a.html'), true))).toBeNull()
    expect(def.match(result(3, 'b', { kind: 'other' }))).toBeNull()
    expect(def.match({ type: 'tool/call', seq: 2, data: { turn: 1 } } as never)).toBeNull()
  })

  it('keeps one card per path, first call id wins, patched cards stay in place', () => {
    const state = reduce([
      result(3, 'a', meta('viz/a.html', 'A1')),
      result(5, 'b', meta('viz/b.html', 'B')),
      result(6, 'a', meta('viz/a.html', 'replaced surface')),
      result(8, 'c', meta('viz/a.html', 'A2')),
    ])
    expect(state.cards.map(card => [card.callId, card.meta.title])).toEqual([['c', 'A2'], ['b', 'B']])
  })

  it('publishes Turn data only, reusing the previous value while unchanged', () => {
    const state = reduce([result(3, 'a', meta('viz/a.html'))])
    const def = turnCardsDefinition
    const context = { state } as never
    expect(def.buildLocationData!(context, 'step', null)).toBeNull()
    const first = def.buildLocationData!(context, 'turn', null)
    expect(first).toEqual({ kind: 'turn', turn: 1, key: TURN_CARDS_KEY, value: { cards: state.cards } })
    expect(def.buildLocationData!(context, 'turn', first)).toBe(first)
  })

  it('folds unrelated cards without touching the list', () => {
    const cards = [{ callId: 'a', seq: 1, meta: meta('viz/a.html') }]
    expect(foldCard(cards, { callId: 'a', seq: 9, meta: meta('viz/z.html') })).toBe(cards)
  })
})

describe('turn tail selection', () => {
  const cards = [
    { callId: 'a', seq: 3, meta: meta('viz/a.html') },
    { callId: 'b', seq: 12, meta: meta('viz/b.html') },
  ]

  it('shows only cards settled before the closing reply', () => {
    expect(cardsBefore(turnWith(cards), 10).map(card => card.callId)).toEqual(['a'])
    expect(selectTurnCards({ turn: turnWith(cards), seq: 2 })).toBeNull()
  })

  it('tolerates hosts without a Turn data store', () => {
    expect(cardsBefore(undefined, 10)).toEqual([])
    expect(cardsBefore({} as never, 10)).toEqual([])
  })
})

describe('folding preference', () => {
  it('reads each host generation by its own rule', () => {
    expect(['compact', 'standard', 'detailed', undefined, 'normal'].map(configFormsFolds)).toEqual([true, true, true, true, true])
    expect(configFormsFolds('verbose')).toBe(false)
    expect([undefined, 'compact'].map(settingsScopeFolds)).toEqual([true, true])
    expect(settingsScopeFolds('normal')).toBe(false)
  })

  it('prefers configForms, falls back to settingsScope, and otherwise never folds', () => {
    const face = (transcriptView: string) => ({ getSnapshot: () => ({ value: { transcriptView } }), subscribe: () => () => undefined })
    const forms = { get: () => face('normal') }
    const scope = { bind: () => face('normal') }
    expect(foldingSource({ get: name => ({ configForms: forms, settingsScope: scope } as Record<string, unknown>)[name] }).getSnapshot()).toBe(true)
    expect(foldingSource({ get: name => (name === 'settingsScope' ? scope : undefined) }).getSnapshot()).toBe(false)
    expect(foldingSource({ get: () => undefined }).getSnapshot()).toBe(false)
  })

  it('forwards live preference changes', () => {
    let view = 'standard'
    const listeners = new Set<() => void>()
    const forms = { get: () => ({ getSnapshot: () => ({ value: { transcriptView: view } }), subscribe: (l: () => void) => { listeners.add(l) } }) }
    const source = foldingSource({ get: name => (name === 'configForms' ? forms : undefined) })
    let seen = 0
    const dispose = source.subscribe(() => { seen += 1 })
    view = 'verbose'
    for (const listener of listeners) listener()
    expect(seen).toBe(1)
    expect(source.getSnapshot()).toBe(false)
    expect(typeof dispose).toBe('function')
  })
})

describe('client registration', () => {
  /**
   * Apply against a fake host.
   * @param services - optional services visible through `get`.
   * @returns what was registered.
   */
  function boot(services: Record<string, unknown>) {
    const registered = new Map<string, { options: Record<string, unknown>; component: ComponentType<Record<string, unknown>> }>()
    const definitions: string[] = []
    const slots = {
      inject(_name: string, install: () => unknown) { install() },
      register(options: Record<string, unknown>, component: ComponentType<Record<string, unknown>>) {
        registered.set(options.name as string, { options, component })
        return () => { registered.delete(options.name as string) }
      },
    }
    const events = { register: (def: { kind: string }) => { definitions.push(def.kind); return () => undefined } }
    const all: Record<string, unknown> = { uiConversation: { events }, ...services }
    const host = {
      slots,
      get: (name: string) => all[name],
      inject(deps: readonly string[], callback: (scope: unknown) => void) {
        if (deps.every(dep => all[dep] !== undefined)) callback(host)
      },
    }
    apply(host as never)
    return { registered, definitions }
  }

  it('registers the stream and turn cards, the latter with both slot shapes, when the registry exists', () => {
    const { registered, definitions } = boot({})
    expect(definitions).toEqual([STREAM_KEY, TURN_CARDS_KEY])
    const tail = registered.get('conversation.chat.turnTail')
    expect(tail?.options.id).toBe('dsh-visualize-cards')
    expect(tail?.options.select).toBe(selectTurnCards)
  })

  it('skips the Definitions and turn cards on a host without the Conversation registry', () => {
    const { registered, definitions } = boot({ uiConversation: undefined })
    expect(definitions).toEqual([])
    expect(registered.has('conversation.chat.turnTail')).toBe(false)
    expect(registered.has('tool.call.toolview')).toBe(true)
    expect(registered.has('conversation.input.dock')).toBe(true)
  })
})

describe('turn cards view', () => {
  /**
   * Render the entry once.
   * @param folds - host folding state.
   * @param cards - the turn's cards.
   * @returns the rendered iframe titles.
   */
  function render(folds: boolean, cards: readonly TurnCard[]): string[] {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const Entry = TurnCards as unknown as ComponentType<Record<string, unknown>>
    act(() => {
      root.render(<Entry turn={turnWith(cards)} seq={10} useVisualizeFolds={<S,>(pick: (value: boolean) => S) => pick(folds)} />)
    })
    const titles = [...host.querySelectorAll('iframe')].map(frame => frame.title)
    act(() => { root.unmount() })
    host.remove()
    return titles
  }

  const cards = [{ callId: 'a', seq: 3, meta: meta('viz/a.html', 'Arch') }]

  it('shows the cards while the host folds', () => {
    expect(render(true, cards)).toEqual(['Arch'])
  })

  it('stays empty when the toolview card is already in view', () => {
    expect(render(false, cards)).toEqual([])
    expect(render(true, [])).toEqual([])
  })
})

/**
 * P3-06 — the turn tail must draw a card of either backend, through the one
 * descriptor reader, and must reach the same saved state the toolview does.
 */
describe('turn tail draws both backends (P3-06)', () => {
  /** A well-formed persisted program card. */
  function program(path: string, title = path, programSource = '$count = 3\nroot = Text("x")'): OpenUIMeta {
    return { kind: 'intelligent_ui', program: programSource, title, mode: 'inline', path, style: 'whale' }
  }

  /**
   * Mount the entry and report what it drew.
   * @param folds - host folding state.
   * @param cards - the turn's cards.
   * @param session - the card's session id.
   * @returns the drawn surfaces.
   */
  function mount(folds: boolean, cards: readonly TurnCard[], session = 's1') {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const Entry = TurnCards as unknown as ComponentType<Record<string, unknown>>
    const draw = (nextCards: readonly TurnCard[]) => act(() => {
      root.render(
        <Entry
          turn={turnWith(nextCards)}
          seq={10}
          visualizeSession={session}
          useVisualizeFolds={<S,>(pick: (value: boolean) => S) => pick(folds)}
        />,
      )
    })
    draw(cards)
    return {
      host,
      draw,
      unmount: () => { act(() => root.unmount()); host.remove() },
      iframes: () => [...host.querySelectorAll('iframe')].map(f => f.title),
      programs: () => [...host.querySelectorAll('[data-openui-card]')],
    }
  }

  it('draws a program card while the host folds (requirement 1)', () => {
    const view = mount(true, [{ callId: 'p1', seq: 3, meta: program('viz/p.openui.html', 'Prog') }])
    expect(view.iframes()).toEqual([])
    expect(view.programs()).toHaveLength(1)
    expect(view.host.textContent).toContain('Prog')
    view.unmount()
  })

  it('keeps HTML cards working alongside program cards (requirement 4)', () => {
    const view = mount(true, [
      { callId: 'h1', seq: 2, meta: meta('viz/a.html', 'Arch') },
      { callId: 'p1', seq: 3, meta: program('viz/p.openui.html', 'Prog') },
    ])
    expect(view.iframes()).toEqual(['Arch'])
    expect(view.programs()).toHaveLength(1)
    expect(view.programs()[0]?.textContent).toContain('Prog')
    view.unmount()
  })

  it('stays empty when the host does not fold, for either backend (requirement 2)', () => {
    const both = [
      { callId: 'h1', seq: 2, meta: meta('viz/a.html', 'Arch') },
      { callId: 'p1', seq: 3, meta: program('viz/p.openui.html', 'Prog') },
    ]
    const view = mount(false, both)
    expect(view.iframes()).toEqual([])
    expect(view.programs()).toHaveLength(0)
    view.unmount()
  })

  it('collects a program result from tool/result and from a nested dispatch (requirement 4)', () => {
    resetEnclosingTurns()
    const def = turnCardsDefinition
    expect(def.match(result(3, 'p1', program('viz/p.openui.html')))).toEqual({ id: '1', role: 'update' })
    def.match({ type: 'tool/call', seq: 2, data: { turn: 1, callId: 'root-9', name: 'run_code' } } as never)
    const nested = {
      type: 'tool/ptc-dispatch', seq: 3,
      data: {
        rootCallId: 'root-9', parentCallId: 'root-9', subCallId: 'root-9:ptc:1',
        name: 'visualize', arguments: '{}', isError: false, content: [], meta: program('viz/nested.openui.html'),
      },
    } as never
    expect(def.match(nested)).toEqual({ id: '1', role: 'update' })
  })

  it('still declines a failed or unrecognised result (requirement 4)', () => {
    const def = turnCardsDefinition
    expect(def.match(result(3, 'p1', program('viz/p.openui.html'), true))).toBeNull()
    expect(def.match(result(3, 'p2', { kind: 'other' }))).toBeNull()
    expect(def.match(result(3, 'p3', { kind: 'intelligent_ui', program: '' }))).toBeNull()
  })
})

/**
 * Requirement 3 — the same card reads the same state from either surface.
 *
 * This is the case the audit warned about: the HTML toolview and turn tail share
 * one key and write whole maps, so a stale view can overwrite a newer one. For
 * OpenUI the risk is sharper, because a *mount* now writes too: hydrating a card
 * with defaults and immediately persisting them would reset a value the reader
 * had already set. So the negative case here is explicit — viewing a card must
 * never turn a stored 6 back into the program's 3.
 */
describe('one card, one state, either surface (requirement 3)', () => {
  const PROGRAM = [
    '$count = 3',
    'root = Col([Slider($count, 1, 10, 1, "count"), Text("count " + @Format($count, "number"))])',
  ].join('\n')

  let storage: Map<string, string>

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
    kind: 'intelligent_ui', program: PROGRAM, title: 'P', mode: 'inline', path: 'viz/shared.openui.html', style: 'whale',
  }

  /** Seed the stored state the way a previous page left it. */
  function seed(count: number) {
    const key = cardStateKey('s1', META.path, 'call-1')
    storage.set(
      `${STORAGE_PREFIX}${openuiStateKey(key)}`,
      JSON.stringify({ t: 1, s: { v: 1, h: 'seeded', values: { count } } }),
    )
  }

  /** Render the turn tail for one program card. */
  function tail(session = 's1') {
    const host = document.createElement('div')
    document.body.append(host)
    const root = createRoot(host)
    const Entry = TurnCards as unknown as ComponentType<Record<string, unknown>>
    act(() => {
      root.render(
        <Entry
          turn={turnWith([{ callId: 'call-1', seq: 3, meta: META }])}
          seq={10}
          visualizeSession={session}
          useVisualizeFolds={<S,>(pick: (value: boolean) => S) => pick(true)}
        />,
      )
    })
    return {
      host,
      unmount: () => { act(() => root.unmount()); host.remove() },
      slider: () => host.querySelector('input[type=range]') as HTMLInputElement | null,
    }
  }

  it('mounting the turn tail does not overwrite a stored value with the default', () => {
    seed(6)
    const view = tail()
    expect(view.host.textContent).toContain('count 6')
    expect(view.slider()?.value).toBe('6')
    cardStates.flush()
    // The stored 6 is still 6: a mount hydrates and writes, but writes what it read.
    const raw = JSON.parse(storage.get(`${STORAGE_PREFIX}${openuiStateKey(cardStateKey('s1', META.path, 'call-1'))}`)!)
    expect((raw.s as { values: Record<string, unknown> }).values['count']).toBe(6)
    view.unmount()
  })

  it('an interaction in the turn tail is what the toolview would see', () => {
    seed(6)
    const view = tail()
    const slider = view.slider()!
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    act(() => {
      setter?.call(slider, '9')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
      slider.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(view.host.textContent).toContain('count 9')
    cardStates.flush()
    // Re-reading the same key returns the value the reader just set.
    const stored = cardStates.read(openuiStateKey(cardStateKey('s1', META.path, 'call-1'))) as { values?: Record<string, unknown> } | undefined
    expect(stored?.values?.['count']).toBe(9)
    view.unmount()
  })

  it('keeps two sessions apart on the turn tail', () => {
    seed(6)
    const view = tail('s2')
    // s2 has no record, so the program default applies and nothing is inherited.
    expect(view.host.textContent).toContain('count 3')
    cardStates.flush()
    const s2Key = `${STORAGE_PREFIX}${openuiStateKey(cardStateKey('s2', META.path, 'call-1'))}`
    const written = storage.get(s2Key)
    if (written !== undefined) {
      expect((JSON.parse(written).s as { values: Record<string, unknown> }).values['count']).not.toBe(6)
    }
    view.unmount()
  })
})

describe('nested dispatch (PTC)', () => {
  /** A `tool/call` event as the host logs it, remembered for dispatch attribution. */
  function call(seq: number, callId: string, turn = 1) {
    return { type: 'tool/call', seq, data: { turn, callId, name: 'run_code' } } as never
  }

  /** A `tool/ptc-dispatch` event: a tool call a program made through the SDK. */
  function dispatch(seq: number, rootCallId: string, subCallId: string, dispatchMeta: unknown, isError = false) {
    return {
      type: 'tool/ptc-dispatch', seq,
      data: {
        rootCallId, parentCallId: rootCallId, subCallId,
        name: 'visualize', arguments: '{}', isError, content: [], meta: dispatchMeta,
      },
    } as never
  }

  it('collects a card a program drew, the way it collects a root call', () => {
    resetEnclosingTurns()
    const def = turnCardsDefinition
    const drawing = dispatch(5, 'root-1', 'root-1:ptc:1', meta('viz/nested.html'))

    expect(def.match(call(4, 'root-1'))).toBeNull()
    expect(def.match(drawing)).toEqual({ id: '1', role: 'update' })

    let state = def.start({} as never, { event: TURN_START, role: 'start' } as never, {} as never)
    state = def.update({ state } as never, { event: drawing, role: 'update' } as never)

    expect(state.cards).toHaveLength(1)
    expect(state.cards[0]?.meta.path).toBe('viz/nested.html')
    expect(state.cards[0]?.callId).toBe('root-1:ptc:1')
  })

  it('declines a dispatch that names no enclosing call it has seen', () => {
    resetEnclosingTurns()
    expect(turnCardsDefinition.match(dispatch(5, 'unknown-root', 'u:ptc:1', meta('viz/x.html')))).toBeNull()
  })

  it('declines a failed dispatch and one whose meta is malformed', () => {
    resetEnclosingTurns()
    turnCardsDefinition.match(call(4, 'root-2'))
    expect(turnCardsDefinition.match(dispatch(5, 'root-2', 'r:ptc:1', meta('viz/a.html'), true))).toBeNull()
    expect(turnCardsDefinition.match(dispatch(6, 'root-2', 'r:ptc:2', { kind: 'other' }))).toBeNull()
  })

  it('attributes each dispatch to the turn its enclosing call belongs to', () => {
    resetEnclosingTurns()
    const def = turnCardsDefinition
    def.match(call(2, 'root-a', 1))
    def.match(call(8, 'root-b', 2))
    expect(def.match(dispatch(9, 'root-b', 'b:ptc:1', meta('viz/b.html')))).toEqual({ id: '2', role: 'update' })
    expect(def.match(dispatch(4, 'root-a', 'a:ptc:1', meta('viz/a.html')))).toEqual({ id: '1', role: 'update' })
  })

  it('shows a nested card on the turn tail once it settles before the closing reply', () => {
    resetEnclosingTurns()
    const def = turnCardsDefinition
    def.match(call(4, 'root-3'))
    const drawing = dispatch(5, 'root-3', 'root-3:ptc:1', meta('viz/nested.html', 'Nested'))
    let state = def.start({} as never, { event: TURN_START, role: 'start' } as never, {} as never)
    state = def.update({ state } as never, { event: drawing, role: 'update' } as never)

    expect(cardsBefore(turnWith(state.cards), 6)).toHaveLength(1)
    expect(cardsBefore(turnWith(state.cards), 5)).toHaveLength(0)
  })
})
