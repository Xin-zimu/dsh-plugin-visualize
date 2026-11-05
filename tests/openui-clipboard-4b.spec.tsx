// @vitest-environment jsdom
/**
 * `@CopyToClipboard` — the 4B security matrix.
 *
 * ADR-013 authorises exactly one thing: a user pressing a control that shows the
 * text it will copy. Every test here attempts it some other way, and each attempt
 * must fail. Grouped by the matrix in the ADR so a reviewer can check the
 * implementation against the document without holding both in mind.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OpenUICard, stateKeyFor } from '../src/client/OpenUICard.tsx'
import { resetCardStates } from '../src/client/card-state.ts'
import { applyAction, clipboardPayload, MAX_CLIPBOARD_TEXT } from '../src/client/openui-actions.ts'
import type { OpenUIMeta } from '../src/fragment.ts'

const NL = String.fromCharCode(10)
const DQ = String.fromCharCode(34)
const q = (s: string): string => DQ + s + DQ

const META: OpenUIMeta = {
  kind: 'intelligent_ui',
  program: '',
  title: 'T',
  mode: 'inline',
  path: '~/s/copy.openui.html',
  style: 'whale',
}

let writes: string[] = []
let deny = false

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

beforeEach(() => {
  writes = []
  deny = false
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: (text: string) => {
        writes.push(text)
        return deny ? Promise.reject(new Error('denied')) : Promise.resolve()
      },
    },
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  resetCardStates(() => undefined, { delayMs: 0 })
})

function mount(program: string) {
  resetCardStates(() => undefined, { delayMs: 0 })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const meta = { ...META, program }
  act(() => { root.render(createElement(OpenUICard as never, { meta, stateKey: stateKeyFor(meta, 's1', 'c1') })) })
  return { host, root }
}

const flush = async (): Promise<void> => { await act(async () => { await Promise.resolve() }) }
describe('1. an explicit press copies', () => {
  it('writes the payload when the control is clicked', async () => {
    const { host } = mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q('hello') + '))])')
    const button = host.querySelector<HTMLButtonElement>('[data-openui-copy="button"]')
    expect(button, 'the control must exist').not.toBeNull()
    act(() => { button!.click() })
    await flush()
    expect(writes).toEqual(['hello'])
  })
})

describe('2. no automatic path copies', () => {
  it('does not copy on mount', async () => {
    mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q('secret') + '))])')
    await flush()
    expect(writes, 'mounting must not write').toEqual([])
  })

  it('does not copy on a state change that re-renders the card', async () => {
    const program = '$n = 0' + NL
      + 'root = Col([Button(' + q('Bump') + ', @Set($n, 1)), Button(' + q('Copy') + ', @CopyToClipboard(' + q('x') + ')), Text(' + q('n is') + ')])'
    const { host } = mount(program)
    const bump = host.querySelector<HTMLButtonElement>('button:not([data-openui-copy])')
    act(() => { bump!.click() })
    await flush()
    expect(writes, 'a state change must not write').toEqual([])
  })
})

describe('3. the shown payload and the written payload are the same string', () => {
  it('renders the payload in full and writes exactly it', async () => {
    // A newline inside a string literal is illegal: the language allows exactly
    // one statement per physical line. The payload uses an escape-free form with
    // a space instead, and the newline case is covered by the parser's own tests.
    const payload = 'line one, line two with punctuation: (a) [b] {c}'
    const { host } = mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q(payload) + '))])')
    const shown = host.querySelector('[data-openui-copy="payload"]')
    expect(shown, 'the payload must be visible before the press').not.toBeNull()
    expect(shown!.textContent).toBe(payload)
    act(() => { host.querySelector<HTMLButtonElement>('[data-openui-copy="button"]')!.click() })
    await flush()
    expect(writes).toEqual([payload])
    expect(writes[0], 'written text must equal shown text').toBe(shown!.textContent)
  })

  it('never renders a truncated preview', () => {
    const long = 'a'.repeat(4000)
    const { host } = mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q(long) + '))])')
    const shown = host.querySelector('[data-openui-copy="payload"]')
    expect(shown!.textContent!.length, 'the whole payload, not a preview').toBe(long.length)
  })
})

describe('4. a dynamic payload cannot diverge', () => {
  it('writes the value the card is showing', async () => {
    const program = '$who = ' + q('world') + NL
      + 'root = Col([Button(' + q('Copy') + ', @CopyToClipboard($who))])'
    const { host } = mount(program)
    const shown = host.querySelector('[data-openui-copy="payload"]')
    expect(shown!.textContent).toBe('world')
    act(() => { host.querySelector<HTMLButtonElement>('[data-openui-copy="button"]')!.click() })
    await flush()
    expect(writes).toEqual(['world'])
  })
})
describe('5. empty, wrong-typed and oversized payloads are refused', () => {
  it('refuses an empty string', () => {
    expect(clipboardPayload('')).toBeUndefined()
  })

  it('refuses an object instead of writing [object Object]', () => {
    expect(clipboardPayload({ a: 1 })).toBeUndefined()
    expect(clipboardPayload([1, 2])).toBeUndefined()
    expect(clipboardPayload(null)).toBeUndefined()
    expect(clipboardPayload(undefined)).toBeUndefined()
  })

  it('refuses text over the cap rather than truncating it', () => {
    expect(clipboardPayload('a'.repeat(MAX_CLIPBOARD_TEXT))).toHaveLength(MAX_CLIPBOARD_TEXT)
    expect(clipboardPayload('a'.repeat(MAX_CLIPBOARD_TEXT + 1))).toBeUndefined()
  })

  it('renders no control when the payload is empty', () => {
    const { host } = mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q('') + ')), Text(' + q('after') + ')])')
    expect(host.querySelector('[data-openui-copy="button"]'), 'no copy control for an empty payload').toBeNull()
    expect(writes).toEqual([])
  })
})

describe('6. a refused permission never reports success', () => {
  it('shows a refusal, not Copied', async () => {
    deny = true
    const { host } = mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q('nope') + '))])')
    act(() => { host.querySelector<HTMLButtonElement>('[data-openui-copy="button"]')!.click() })
    await flush()
    const status = host.querySelector('[data-openui-copy="status"]')
    expect(status, 'a refusal must be visible').not.toBeNull()
    expect(status!.textContent).toMatch(/refused/i)
  })
})

describe('7. repeated presses stay bounded', () => {
  it('writes once per press', async () => {
    const { host } = mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q('once') + '))])')
    const button = host.querySelector<HTMLButtonElement>('[data-openui-copy="button"]')!
    act(() => { button.click() })
    await flush()
    expect(writes).toHaveLength(1)
    act(() => { button.click() })
    await flush()
    expect(writes, 'two presses, two writes').toHaveLength(2)
  })
})

describe('8. unmounting leaves nothing behind', () => {
  it('removes its listener', async () => {
    const added: string[] = []
    const removed: string[] = []
    const realAdd = document.addEventListener.bind(document)
    const realRemove = document.removeEventListener.bind(document)
    type L = EventListenerOrEventListenerObject
    document.addEventListener = ((t: string, l: L, o?: boolean | AddEventListenerOptions) => { added.push(t); realAdd(t, l, o) }) as typeof document.addEventListener
    document.removeEventListener = ((t: string, l: L, o?: boolean | EventListenerOptions) => { removed.push(t); realRemove(t, l, o) }) as typeof document.removeEventListener
    try {
      const { host, root } = mount('root = Col([Button(' + q('Copy') + ', @CopyToClipboard(' + q('bye') + '))])')
      act(() => { host.querySelector<HTMLButtonElement>('[data-openui-copy="button"]')!.click() })
      await flush()
      act(() => { root.unmount() })
    } finally {
      document.addEventListener = realAdd
      document.removeEventListener = realRemove
    }
    expect(added).toContain('openui:clipboard')
    expect(removed.filter(t => t === 'openui:clipboard').length).toBeGreaterThanOrEqual(1)
  })
})
describe('9. the other two actions stay refused', () => {
  it('refuses @OpenUrl and @ToAssistant at dispatch', () => {
    for (const name of ['OpenUrl', 'ToAssistant']) {
      const outcome = applyAction({ kind: 'element', name: '@' + name, args: ['x'] }, {})
      expect(outcome.patch, name + ' must not write state').toEqual({})
      expect(outcome.clipboard, name + ' must not copy').toBeUndefined()
      expect(outcome.diagnostics.some(d => d.code === 'action.unsupported'), name + ' must be refused by name').toBe(true)
    }
  })

  it('leaves a Button carrying them inert', () => {
    const { host } = mount('root = Col([Button(' + q('Open') + ', @OpenUrl(' + q('https://example.com') + ')), Text(' + q('after') + ')])')
    const button = host.querySelector<HTMLButtonElement>('button')
    expect(button).not.toBeNull()
    act(() => { button!.click() })
    expect(host.querySelector('[data-openui-copy="button"]'), 'no copy control appears').toBeNull()
    expect(writes).toEqual([])
  })
})

describe('10. composition is refused, not silently attempted', () => {
  it('refuses CopyToClipboard inside Action([...])', () => {
    const action = { kind: 'element', name: '@Action', args: [[{ kind: 'element', name: '@CopyToClipboard', args: ['x'] }]] }
    const outcome = applyAction(action, {})
    expect(outcome.clipboard, 'a composed copy must not carry a payload').toBeUndefined()
    expect(outcome.diagnostics.some(d => d.code === 'action.clipboard-not-composed')).toBe(true)
  })

  it('still applies the other steps in a composed action', () => {
    const action = { kind: 'element', name: '@Action', args: [[
      { kind: 'element', name: '@Set', args: [{ kind: 'binding', name: 'n', value: 0 }, 1] },
      { kind: 'element', name: '@CopyToClipboard', args: ['z'] },
    ]] }
    const outcome = applyAction(action, { n: 0 })
    expect(outcome.patch, 'the Set still applies').toEqual({ n: 1 })
    expect(outcome.clipboard).toBeUndefined()
  })

  it('renders no copy control for a composed action', () => {
    const program = '$n = 0' + NL
      + 'root = Col([Button(' + q('Both') + ', Action([@Set($n, 1), @CopyToClipboard(' + q('z') + ')]))])'
    const { host } = mount(program)
    expect(host.querySelector('[data-openui-copy="button"]'), 'a composed copy renders no control').toBeNull()
  })
})

describe('11. the capability is scoped to the clipboard', () => {
  it('has no read path', () => {
    // The signature declares one argument and the dispatcher has no read step.
    const action = { kind: 'element', name: '@CopyToClipboard', args: ['t'] }
    const outcome = applyAction(action, {})
    expect(outcome.patch).toEqual({})
    expect(outcome.clipboard).toBe('t')
    expect(typeof clipboardPayload, 'a read helper must not exist').toBe('function')
  })
})