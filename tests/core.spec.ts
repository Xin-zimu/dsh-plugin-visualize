/**
 * The backend contract, the registry and the router.
 *
 * These are the seams a third backend has to fit through, so they are tested
 * for what they refuse as much as for what they route: an unknown id, a
 * duplicate registration, a blocking finding, a legacy meta that still has to
 * replay.
 */

import { describe, expect, it } from 'vitest'
import {
  BACKEND_IDS, RENDER_SCHEMA_VERSION, descriptorFrom, isBackendId, isRenderMode,
} from '../src/core/render-contract.ts'
import { BackendRegistry, createRegistry, resolveBackend } from '../src/core/registry.ts'
import { dispatch, RenderRejected, resultText } from '../src/core/dispatcher.ts'
import { htmlBackend } from '../src/backends/html/renderer.ts'
import { openuiBackend } from '../src/backends/openui/renderer.ts'

const LIMITS = { maxSourceBytes: 1_000_000 }
const registry = createRegistry([htmlBackend('whale'), openuiBackend()])

describe('render contract', () => {
  it('narrows modes and backends', () => {
    expect(isRenderMode('inline')).toBe(true)
    expect(isRenderMode('page')).toBe(true)
    expect(isRenderMode('huge')).toBe(false)
    expect(isBackendId('html')).toBe(true)
    expect(isBackendId('openui')).toBe(true)
    expect(isBackendId('map')).toBe(false)
    expect([...BACKEND_IDS]).toEqual(['html', 'openui'])
  })

  it('replays a pre-fork dsh-visualize card as an html descriptor', () => {
    const legacy = {
      kind: 'visualize',
      fragment: '<p>hi</p>',
      title: 'Old card',
      mode: 'wide',
      path: 'viz/old.whale.html',
      style: 'whale',
    }
    const descriptor = descriptorFrom(legacy)
    expect(descriptor?.backend).toBe('html')
    expect(descriptor?.mode).toBe('wide')
    expect(descriptor?.title).toBe('Old card')
    expect(descriptor?.payload).toBe(legacy)
  })

  it('declines a value that is not a card', () => {
    expect(descriptorFrom({ kind: 'other' })).toBeUndefined()
    expect(descriptorFrom(undefined)).toBeUndefined()
    expect(descriptorFrom('text')).toBeUndefined()
  })

  it('round-trips an enveloped descriptor', () => {
    const descriptor = {
      schemaVersion: RENDER_SCHEMA_VERSION,
      backend: 'openui' as const,
      title: 'T',
      mode: 'inline' as const,
      payload: { program: 'root = Col([])' },
    }
    const read = descriptorFrom(descriptor)
    expect(read?.backend).toBe('openui')
    expect(read?.payload).toEqual({ program: 'root = Col([])' })
  })
})

describe('backend registry', () => {
  it('registers, reads back and lists in order', () => {
    expect(registry.ids()).toEqual(['html', 'openui'])
    expect(registry.get('openui')?.id).toBe('openui')
    expect(registry.defaultBackend()?.id).toBe('html')
  })

  it('refuses a duplicate id', () => {
    const fresh = new BackendRegistry().register(htmlBackend())
    expect(() => fresh.register(htmlBackend())).toThrow(/already registered/u)
  })

  it('resolves an omitted backend to the default, and an unknown one loudly', () => {
    expect(resolveBackend(registry, undefined).id).toBe('html')
    expect(resolveBackend(registry, 'openui').id).toBe('openui')
    expect(() => resolveBackend(registry, 'map')).toThrow(/must be one of/u)
  })

  it('refuses an id this build does not ship, naming what it has', () => {
    const htmlOnly = createRegistry([htmlBackend()])
    expect(() => resolveBackend(htmlOnly, 'openui')).toThrow(/not available in this build/u)
  })
})

describe('dispatcher', () => {
  it('routes an html fragment to the html backend', () => {
    const dispatched = dispatch(registry, {
      backend: 'html',
      title: 'Chart',
      source: '<div id="a"><p>p99</p></div>',
    }, LIMITS)
    expect(dispatched.adapter.id).toBe('html')
    expect(dispatched.descriptor.backend).toBe('html')
    expect(dispatched.warnings).toEqual([])
  })

  it('routes a program to the openui backend', () => {
    const dispatched = dispatch(registry, {
      backend: 'openui',
      title: 'Tip',
      source: 'root = Col([Title("Tip splitter")])\n$bill = 120',
    }, LIMITS)
    expect(dispatched.adapter.id).toBe('openui')
    expect(dispatched.descriptor.backend).toBe('openui')
    expect(dispatched.descriptor.payload).toMatchObject({ kind: 'intelligent_ui' })
  })

  it('defaults to the first registered backend', () => {
    expect(dispatch(registry, { source: '<p>hi</p>' }, LIMITS).adapter.id).toBe('html')
  })

  it('rejects a fragment with a document skeleton, before anything is written', () => {
    expect(() => dispatch(registry, { backend: 'html', source: '<!doctype html><p>x</p>' }, LIMITS))
      .toThrow(RenderRejected)
  })

  it('rejects a program with an unknown component', () => {
    let caught: unknown
    try {
      dispatch(registry, { backend: 'openui', source: 'root = Col([Map("sf")])' }, LIMITS)
    } catch (error) { caught = error }
    expect(caught).toBeInstanceOf(RenderRejected)
    expect((caught as RenderRejected).diagnostics[0]?.message).toMatch(/unknown component/u)
  })

  it('rejects a program that never defines root', () => {
    expect(() => dispatch(registry, { backend: 'openui', source: 'x = 1' }, LIMITS)).toThrow(RenderRejected)
  })

  it('rejects an empty program', () => {
    expect(() => dispatch(registry, { backend: 'openui', source: '   ' }, LIMITS)).toThrow(/required/u)
  })

  it('rejects a mode outside the enum', () => {
    expect(() => dispatch(registry, { backend: 'html', source: '<p>x</p>', mode: 'huge' }, LIMITS))
      .toThrow(/must be one of/u)
  })

  it('names the backend in the confirmation, so the model knows what drew the card', () => {
    const dispatched = dispatch(registry, { backend: 'openui', title: 'T', source: 'root = Col([])' }, LIMITS)
    const text = resultText(dispatched, 'create', '~/x.openui.html')
    expect(text).toContain('openui-lang program')
    expect(text).toContain('~/x.openui.html')
  })
})

describe('openui backend validation', () => {
  const openui = openuiBackend()

  it('reports a multi-line statement with a located error', () => {
    const report = openui.validate({
      backend: 'openui', title: 'T', mode: 'inline',
      source: 'root = Col([\n  Title("x")\n])',
    }, LIMITS)
    expect(report.errors.length).toBeGreaterThan(0)
    // The location is a field, not part of the message: a message that embeds
    // "line 1: " can never be compared against a backend that does not, and the
    // differential run against upstream depends on the two agreeing.
    expect(report.errors[0]?.line).toBe(1)
    expect(report.errors[0]?.message).toMatch(/expected "\]"/u)
    expect(report.errors[0]?.message).not.toMatch(/^line \d+:/u)
  })

  it('reports a non-ASCII bare object key', () => {
    const report = openui.validate({
      backend: 'openui', title: 'T', mode: 'inline',
      source: 'root = Col([])\nrow = {年份: 1}',
    }, LIMITS)
    expect(report.errors.some(finding => /unexpected character/u.test(finding.message))).toBe(true)
  })

  it('accepts a quoted non-ASCII key', () => {
    const report = openui.validate({
      backend: 'openui', title: 'T', mode: 'inline',
      source: 'root = Col([])\nrow = {"年份": 1}',
    }, LIMITS)
    expect(report.errors).toEqual([])
  })

  it('rejects a named argument, since the language is positional', () => {
    const report = openui.validate({
      backend: 'openui', title: 'T', mode: 'inline',
      source: 'root = Col([Text("a")], gap: 2)',
    }, LIMITS)
    expect(report.errors.some(finding => /positional/u.test(finding.message))).toBe(true)
  })

  it('accepts every component and function its own table teaches', () => {
    const report = openui.validate({
      backend: 'openui', title: 'T', mode: 'inline',
      source: 'root = Card([Row([Title("t"), Caption("c")])])\n$n = 3\nx = @Format(@Sum([1, 2]), "number")',
    }, LIMITS)
    expect(report.errors).toEqual([])
  })

  it('rejects an unknown function', () => {
    const report = openui.validate({
      backend: 'openui', title: 'T', mode: 'inline',
      source: 'root = Text(@NoSuchFn(1))',
    }, LIMITS)
    expect(report.errors.some(finding => /unknown function/u.test(finding.message))).toBe(true)
  })

  it('rejects a program over the ceiling', () => {
    const report = openui.validate({
      backend: 'openui', title: 'T', mode: 'inline', source: 'root = Col([])',
    }, { maxSourceBytes: 4 })
    expect(report.errors[0]?.code).toBe('VZO003')
  })
})
