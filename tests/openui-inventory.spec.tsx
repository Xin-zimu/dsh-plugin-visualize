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
  it('draws 12 of the 48 declared components after 4A-1', () => {
    expect(declared).toHaveLength(48)
    expect(RENDERED_COMPONENTS).toHaveLength(12)
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

  it('leaves the remaining catalogue in the batches STAGE.md assigns', () => {
    const missing = declared.filter(name => !rendered.has(name))
    // One row per batch, so a component cannot be quietly dropped from the plan.
    const batches: Record<string, readonly string[]> = {
      '4A-2': ['Label', 'Badge', 'Link', 'List', 'ListItem', 'Quote', 'Code'],
      '4A-3': ['Input', 'TextArea', 'Select', 'SegmentedControl', 'Checkbox', 'RadioGroup', 'DatePicker', 'Timer', 'Form', 'IconButton', 'Pressable'],
      '4A-4': ['Table', 'Chart', 'Icon', 'Image'],
      '4A-5': ['Svg', 'G', 'Circle', 'Ellipse', 'Rect', 'Line', 'Path', 'Polyline', 'Polygon', 'SvgText', 'Flashcard', 'Celebration', 'Carousel', 'Popover'],
    }
    const planned = Object.values(batches).flat()
    expect(missing.slice().sort()).toEqual(planned.slice().sort())
  })

  it('actually draws each of the four, rather than listing it', () => {
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
})
