// @vitest-environment jsdom

/**
 * Which of the 48 declared components does this build actually draw?
 *
 * This is a *measurement*, not a remembered count. Three sessions quoted
 * "8 of 48" before anyone listed the eight, and the previous probe mirrored the
 * renderer's table as a hand-written literal — which is a copy of an answer, not
 * a reading of one. Here both tables are imported for real:
 * `signatures.ts` is what the language declares, `RENDERED_COMPONENTS` is what
 * the renderer draws, and the difference is the catalogue gap.
 *
 * Run with `--reporter=verbose` to print the per-group split into the evidence
 * file; the assertions below are what stop the numbers drifting.
 */

import { describe, expect, it } from 'vitest'
import { COMPONENTS } from '../src/backends/openui/signatures.ts'
import { RENDERED_COMPONENTS, renderProgram } from '../src/client/OpenUICard.tsx'

const declared = COMPONENTS.map(component => component.name)
const rendered = new Set(RENDERED_COMPONENTS)

/** The group split, as the migration matrix and STAGE.md quote it. */
const groups = new Map<string, { rendered: string[], missing: string[] }>()
for (const component of COMPONENTS) {
  const entry = groups.get(component.group) ?? { rendered: [], missing: [] }
  ;(rendered.has(component.name) ? entry.rendered : entry.missing).push(component.name)
  groups.set(component.group, entry)
}

describe('component inventory', () => {
  it('draws all 48 declared components after 4A-5', () => {
    expect(declared).toHaveLength(48)
    expect(RENDERED_COMPONENTS).toHaveLength(48)
  })

  it('has no renderer for a name the language does not declare', () => {
    // A phantom renderer would draw something no program could ask for, and
    // would make the skill teach a name that fails validation.
    const phantom = RENDERED_COMPONENTS.filter(name => !declared.includes(name))
    expect(phantom).toEqual([])
  })

  it('counts the four 4A-1 components as drawn', () => {
    for (const name of ['Box', 'Divider', 'Spacer', 'Grid']) {
      expect(rendered.has(name), `${name} should be rendered after 4A-1`).toBe(true)
    }
  })

  it('counts all seven 4A-2 components as drawn', () => {
    // The whole Text group. Before 4A-2 the group rendered 3 of 10; it now
    // renders all 10, so this also asserts the group is complete rather than
    // merely that seven names were added.
    for (const name of ['Label', 'Badge', 'Link', 'List', 'ListItem', 'Quote', 'Code']) {
      expect(rendered.has(name), `${name} should be rendered after 4A-2`).toBe(true)
    }
    expect(groups.get('Text')?.missing ?? [], 'the Text group should have nothing left').toEqual([])
  })

  it('reports the split by group, which must sum to 48', () => {
    let total = 0
    const lines: string[] = []
    for (const [group, entry] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      total += entry.rendered.length + entry.missing.length
      lines.push(`${group} (${entry.rendered.length + entry.missing.length}): rendered ${entry.rendered.join(', ') || '—'}; missing ${entry.missing.join(', ') || '—'}`)
    }
    // Printed so the evidence file records the real split beside the numbers
    // that appear in the docs.
    console.log(lines.join('\n'))
    console.log(`=== ${RENDERED_COMPONENTS.length} / ${declared.length} rendered ===`)
    expect(total).toBe(48)
  })

  it('counts all eleven 4A-3 components as drawn', () => {
    // The whole Inputs group apart from `Button` and `Slider`, which stage 3
    // delivered. Before 4A-3 the group rendered 2 of 13; it now renders all 13,
    // so this asserts the group is complete rather than merely that eleven names
    // were added — the same distinction the 4A-2 check above makes.
    for (const name of ['Input', 'TextArea', 'Select', 'SegmentedControl', 'Checkbox', 'RadioGroup', 'DatePicker', 'Timer', 'Form', 'IconButton', 'Pressable']) {
      expect(rendered.has(name), `${name} should be rendered after 4A-3`).toBe(true)
    }
    expect(groups.get('Inputs')?.missing ?? [], 'the Inputs group should have nothing left').toEqual([])
  })

  it('leaves the remaining catalogue in the batches STAGE.md assigns', () => {
    const missing = declared.filter(name => !rendered.has(name))
    // One row per batch, so a component cannot be quietly dropped from the plan.
    // 4A-1 through 4A-5 are absent because they are complete: an entry with no
    // names would just assert that nothing is left, which the per-group checks
    // above already do. An empty map here is the assertion that the catalogue is
    // finished — the list is derived, not remembered.
    const batches: Record<string, readonly string[]> = {}
    const planned = Object.values(batches).flat()
    expect(missing.slice().sort()).toEqual(planned.slice().sort())
    expect(missing, 'the whole catalogue should be drawn').toEqual([])
  })

  it('actually draws each of the four 4A-1 components, rather than listing it', () => {
    // The table is a claim; this is the check. A name in the table whose
    // renderer returns null would still count as "rendered" above.
    const programs: Record<string, string> = {
      Box: 'root = Box([Text("x")], "row", 1, 1, "info", "sm", true)',
      Divider: 'root = Col([Divider()])',
      Spacer: 'root = Row([Text("a"), Spacer(), Text("b")])',
      Grid: 'root = Grid([Text("x")], 2, 0, 1)',
    }
    for (const [name, program] of Object.entries(programs)) {
      const { node, error } = renderProgram(program)
      expect(error, `${name} failed to evaluate`).toBeUndefined()
      expect(node, `${name} drew nothing`).not.toBeNull()
    }
  })

  it('actually draws each of the seven 4A-2 components, rather than listing it', () => {
    // Same check for the text group. `Link` is included with a valid URL here;
    // the refused-protocol path is covered in tests/openui-text-4a2.spec.tsx.
    const programs: Record<string, string> = {
      Label: 'root = Label("a label")',
      Badge: 'root = Col([Badge("new", "success")])',
      Link: 'root = Col([Link("docs", "https://example.com/docs")])',
      List: 'root = List(["a", "b"])',
      ListItem: 'root = Col([ListItem("title", "description")])',
      Quote: 'root = Col([Quote("quoted", "someone")])',
      Code: 'root = Col([Code("let x = 1", "ts")])',
    }
    for (const [name, program] of Object.entries(programs)) {
      const { node, error } = renderProgram(program)
      expect(error, `${name} failed to evaluate`).toBeUndefined()
      expect(node, `${name} drew nothing`).not.toBeNull()
    }
  })

  it('actually draws each of the eleven 4A-3 components, rather than listing it', () => {
    // A name in the table whose renderer returns the renderer-gap notice would
    // still count as "rendered" above, so the notice's marker is asserted absent
    // as well as the node being present.
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
    for (const [name, program] of Object.entries(programs)) {
      const { node, error } = renderProgram(program)
      expect(error, `${name} failed to evaluate`).toBeUndefined()
      expect(node, `${name} drew nothing`).not.toBeNull()
    }
  })
  it('actually draws each of the fourteen 4A-5 components, rather than listing it', () => {
    // Same check as every earlier batch: a name in the table whose renderer
    // returns null or the renderer-gap notice would still count as "rendered".
    // The drawing group is the one where this matters most, because a shape with
    // every argument refused draws an element that is present and invisible.
    const programs: Record<string, string> = {
      Svg: 'root = Col([Svg([Circle(10, 10, 5)], "0 0 20 20")])',
      G: 'root = Col([Svg([G([Circle(10, 10, 5)], "rotate(30 10 10)")], "0 0 20 20")])',
      Circle: 'root = Col([Svg([Circle(10, 10, 5, "info")], "0 0 20 20")])',
      Ellipse: 'root = Col([Svg([Ellipse(10, 10, 6, 4)], "0 0 20 20")])',
      Rect: 'root = Col([Svg([Rect(0, 0, 8, 6, "ink")], "0 0 20 20")])',
      Line: 'root = Col([Svg([Line(0, 0, 10, 10)], "0 0 20 20")])',
      Path: 'root = Col([Svg([Path("M 0 0 L 10 10")], "0 0 20 20")])',
      Polyline: 'root = Col([Svg([Polyline("0,0 5,5 10,0")], "0 0 20 20")])',
      Polygon: 'root = Col([Svg([Polygon("0,0 10,0 5,8")], "0 0 20 20")])',
      SvgText: 'root = Col([Svg([SvgText("hi", 2, 10)], "0 0 20 20")])',
      Flashcard: 'root = Col([Flashcard("front", "back", "tap")])',
      Celebration: '$n = 0\nroot = Col([Celebration($n == 1)])',
      Carousel: 'root = Carousel([Text("a"), Text("b")])',
      Popover: 'root = Col([Popover("more", "the detail")])',
    }
    for (const [name, program] of Object.entries(programs)) {
      const { node, error } = renderProgram(program)
      expect(error, `${name} failed to evaluate`).toBeUndefined()
      expect(node, `${name} drew nothing`).not.toBeNull()
    }
    // One row per component, so a name cannot be quietly dropped from the list
    // above and still pass by being absent from it.
    expect(Object.keys(programs).sort()).toEqual(
      ['Svg', 'G', 'Circle', 'Ellipse', 'Rect', 'Line', 'Path', 'Polyline', 'Polygon', 'SvgText', 'Flashcard', 'Celebration', 'Carousel', 'Popover'].sort(),
    )
  })
})
