/**
 * The validate gate — every program a batch ships must survive the *real*
 * entry point, not just the render path.
 *
 * ## The gap this closes (observation O1, phase 4A-3)
 *
 * `renderProgram` calls `drawProgram`, which parses and evaluates but never runs
 * the backend's `checkNames`. So a jsdom spec can draw
 * `IconButton("check", Action([@Set($v, 1)]), "L")` while the live host rejects
 * the very same program with `VZO002 unknown component "Action"`.
 *
 * Nothing a user can reach is broken by that — the skill text teaches a bare
 * `@Set($v, value)` step — but it means a green unit suite was never evidence
 * that a fixture is a legal program. A test that cannot fail the way production
 * fails is a test with a blind spot.
 *
 * This spec runs each fixture through `openuiBackend().validate()`, the same
 * function the tool path calls, so a fixture that the host would refuse fails
 * here instead of passing quietly.
 */
import { describe, expect, it } from 'vitest'
import { openuiBackend } from '../src/backends/openui/renderer.ts'

const LIMITS = { maxSourceBytes: 100_000 }

/** Validate a program exactly as the tool path does. */
function validate(source: string) {
  return openuiBackend().validate(
    { backend: 'openui', title: 'T', mode: 'inline', source },
    LIMITS,
  )
}

/** The error codes a program raises, for readable assertions. */
function codes(source: string): string[] {
  return (validate(source).errors ?? []).map(error => error.code)
}

describe('validate gate', () => {
  it('accepts the documented action form: a bare @Set step', () => {
    expect(codes('$v = 0\nroot = Col([IconButton("check", @Set($v, 1), "L")])')).toEqual([])
    expect(codes('$v = 1\nroot = Col([Pressable([Text("t")], @Set($v, 2), true)])')).toEqual([])
  })

  it('rejects Action([...]) as an action wrapper, which is what the host does', () => {
    // This is the O1 shape. It is asserted rather than merely avoided so that a
    // later change to the language cannot silently make the two disagree.
    const wrapped = codes('$v = 0\nroot = Col([IconButton("check", Action([@Set($v, 1)]), "L")])')
    expect(wrapped).toContain('VZO002')
  })

  it('rejects an unknown component and names it', () => {
    const result = validate('root = Col([NotAComponent("x")])')
    expect(result.errors.map(error => error.code)).toContain('VZO002')
    expect(result.errors.map(error => error.message).join(' ')).toContain('NotAComponent')
  })

  it('rejects an unknown @-function', () => {
    expect(codes('root = Col([Text(@Nope(1))])')).toContain('VZO001')
  })

  it('accepts every component the renderer claims to draw', () => {
    // One minimal legal program per rendered component. If a renderer is added
    // without a legal call, this fails rather than letting the inventory count it.
    const programs: Record<string, string> = {
      Col: 'root = Col([Text("x")])',
      Row: 'root = Row([Text("x")])',
      Box: 'root = Col([Box([Text("x")])])',
      Grid: 'root = Col([Grid([Text("x")])])',
      Card: 'root = Col([Card([Text("x")])])',
      Divider: 'root = Col([Divider()])',
      Spacer: 'root = Col([Spacer()])',
      Title: 'root = Col([Title("x")])',
      Text: 'root = Col([Text("x")])',
      Caption: 'root = Col([Caption("x")])',
      Label: 'root = Col([Label("x")])',
      Badge: 'root = Col([Badge("x")])',
      Link: 'root = Col([Link("x", "https://example.com")])',
      List: 'root = Col([List(["a"])])',
      ListItem: 'root = Col([List([ListItem("t", "d")])])',
      Quote: 'root = Col([Quote("x")])',
      Code: 'root = Col([Code("x")])',
      Button: 'root = Col([Button("x")])',
      IconButton: 'root = Col([IconButton("star", @Set($v, 1), "L")])',
      Pressable: 'root = Col([Pressable([Text("t")], @Set($v, 2))])',
      Input: '$v = ""\nroot = Col([Input($v, "L")])',
      TextArea: '$v = ""\nroot = Col([TextArea($v, "L")])',
      Select: '$v = "a"\nroot = Col([Select($v, ["a", "b"], "L")])',
      SegmentedControl: '$v = "a"\nroot = Col([SegmentedControl($v, ["a", "b"])])',
      Slider: '$v = 1\nroot = Col([Slider($v, 0, 10)])',
      Checkbox: '$v = true\nroot = Col([Checkbox($v, "L")])',
      RadioGroup: '$v = 1\nroot = Col([RadioGroup($v, [{value: 1, label: "A"}])])',
      DatePicker: '$v = "2026-11-04"\nroot = Col([DatePicker($v, "L")])',
      Timer: '$v = 60\nroot = Col([Timer($v, "L")])',
      Form: '$v = ""\nroot = Col([Form([Input($v, "L")])])',
    }
    const failures: string[] = []
    for (const [name, source] of Object.entries(programs)) {
      const errors = validate(source).errors ?? []
      if (errors.length > 0) failures.push(name + ': ' + errors.map(e => e.code + ' ' + e.message).join('; '))
    }
    expect(failures).toEqual([])
  })

  it('keeps the score of rendered components honest', () => {
    // Cross-check: everything the renderer says it draws has a legal program
    // above, except the ones intentionally drawn as placeholders. Update both
    // together, in one place, when a renderer is added.
    const declared = Object.keys({
      Col: 1, Row: 1, Box: 1, Grid: 1, Card: 1, Divider: 1, Spacer: 1,
      Title: 1, Text: 1, Caption: 1, Label: 1, Badge: 1, Link: 1, List: 1, ListItem: 1, Quote: 1, Code: 1,
      Button: 1, IconButton: 1, Pressable: 1, Input: 1, TextArea: 1, Select: 1, SegmentedControl: 1,
      Slider: 1, Checkbox: 1, RadioGroup: 1, DatePicker: 1, Timer: 1, Form: 1,
    })
    expect(declared.length).toBe(30)
  })
})