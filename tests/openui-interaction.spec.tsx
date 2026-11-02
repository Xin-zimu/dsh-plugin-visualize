// @vitest-environment jsdom

/**
 * The interaction loop, asserted at the level the user experiences it.
 *
 * A Slider that renders but cannot move, or moves without changing anything
 * else, is not an interaction. These tests drive the real component tree with
 * the DOM and check that state propagates.
 */

import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { OpenUICard } from '../src/client/OpenUICard.tsx'

const META = {
  kind: 'intelligent_ui' as const,
  program: '',
  title: 'T',
  mode: 'inline' as const,
  path: '~/x.openui.html',
  style: 'whale' as const,
}

/**
 * Mount a card and return the container plus an unmount.
 * @param program - the program.
 * @returns the mounted container.
 */
function mount(program: string) {
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  act(() => { root.render(createElement(OpenUICard, { meta: { ...META, program } })) })
  return { host, unmount: () => { act(() => root.unmount()); host.remove() } }
}

/** Fire a native input event the way a drag would. */
function drag(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  act(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

const PROGRAM = [
  '$n = 2',
  'rows = @Range(0, $n)',
  'root = Col([Slider($n, 1, 5, 1, "n"), Text("count " + @Format(@Count(rows), "number")), @Each(rows, "i", Text("row " + @Format(i, "number")))])',
].join(String.fromCharCode(10))

describe('$state interaction loop', () => {
  it('renders a bound Slider as enabled', () => {
    const { host, unmount } = mount(PROGRAM)
    const slider = host.querySelector('input[type="range"]') as HTMLInputElement | null
    expect(slider).not.toBeNull()
    expect(slider?.disabled).toBe(false)
    unmount()
  })

  it('leaves an unbound Slider read-only rather than pretending', () => {
    const { host, unmount } = mount('root = Col([Slider(3, 1, 5)])')
    const slider = host.querySelector('input[type="range"]') as HTMLInputElement | null
    expect(slider?.disabled).toBe(true)
    unmount()
  })

  it('re-evaluates OTHER components when the slider moves', () => {
    const { host, unmount } = mount(PROGRAM)
    const slider = host.querySelector('input[type="range"]') as HTMLInputElement
    expect(host.textContent).toContain('count 2')
    expect(host.textContent).toContain('row 1')
    expect(host.textContent).not.toContain('row 2')

    drag(slider, '4')

    // The point: the Slider's variable drove @Count and @Each in other nodes.
    expect(host.textContent).toContain('count 4')
    expect(host.textContent).toContain('row 3')
    unmount()
  })

  it('keeps the program itself unchanged while state moves', () => {
    const { host, unmount } = mount(PROGRAM)
    const slider = host.querySelector('input[type="range"]') as HTMLInputElement
    drag(slider, '3')
    // A rebuild, not a patch: the same program produced a different tree.
    expect(host.querySelectorAll('input[type="range"]').length).toBe(1)
    expect(host.textContent).toContain('count 3')
    unmount()
  })
})
