// @vitest-environment jsdom
/**
 * Celebration must burst when its condition is a BARE VARIABLE.
 *
 * This is the regression test for the defect the 4A-5 browser run found. Every
 * existing Celebration test used the comparison form `Celebration($n == 1)`,
 * whose argument is already a boolean, so none of them exercised the path where
 * the argument is a binding marker. `Celebration($done)` — the form the skill text
 * shows — passed that marker to `boolOf`, which returned `Boolean({...})`, i.e.
 * constant true. The component then never saw a false-to-true transition and never
 * drew a burst, while `$done` demonstrably moved to true in the persisted state.
 *
 * The two forms are asserted side by side so a future change cannot fix one and
 * break the other.
 */
import { describe, expect, it, beforeAll, afterEach } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { OpenUICard, stateKeyFor } from '../src/client/OpenUICard.tsx'
import { resetCardStates } from '../src/client/card-state.ts'
import type { OpenUIMeta } from '../src/fragment.ts'

beforeAll(() => {
  window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as never
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})
afterEach(() => { document.body.innerHTML = '' })

const NL = String.fromCharCode(10)
const DQ = String.fromCharCode(34)
const META: OpenUIMeta = {
  kind: 'intelligent_ui',
  program: '',
  title: 'T',
  mode: 'inline',
  path: '~/s/celebration-bare.openui.html',
  style: 'whale',
}

function mount(program: string) {
  resetCardStates(() => undefined, { delayMs: 0 })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const meta = { ...META, program }
  const key = stateKeyFor(meta, 's1', 'call-x')
  act(() => { root.render(createElement(OpenUICard as never, { meta, stateKey: key })) })
  return { host, root }
}

const bursts = (host: HTMLElement): number => host.querySelectorAll('[data-openui-celebration]').length;

describe('Celebration fires from a bare-variable condition', () => {
  it('bursts when a bare @Set moves the bound variable to true', () => {
    const { host, root } = mount('$done = false' + NL
      + 'root = Col([Button(' + DQ + 'Go' + DQ + ', @Set($done, true)), Celebration($done)])')
    expect(bursts(host), 'nothing before the click').toBe(0)
    act(() => { (host.querySelector('button') as HTMLButtonElement).click() })
    expect(bursts(host), 'a burst after the click').toBe(1)
    act(() => { root.unmount() })
  })

  it('still bursts when the condition is a comparison', () => {
    // The form every earlier test used. It must keep working: the fix is in the
    // unwrap, not in a replacement of one form by the other.
    const { host, root } = mount('$n = 0' + NL
      + 'root = Col([Button(' + DQ + 'go' + DQ + ', @Set($n, 1)), Celebration($n == 1)])')
    act(() => { (host.querySelector('button') as HTMLButtonElement).click() })
    expect(bursts(host)).toBe(1)
    act(() => { root.unmount() })
  })

  it('does not burst for a bare false condition', () => {
    const { host, root } = mount('$done = false' + NL + 'root = Col([Celebration($done)])')
    expect(bursts(host)).toBe(0)
    act(() => { root.unmount() })
  })
})