/**
 * Which of the 48 components have a renderer, and which do not?
 *
 * The stage-4A batches must be derived from the signature table and the
 * renderer's own table, not from a remembered count: "8 of 48" was quoted for
 * three sessions before anyone listed the eight.
 *
 * This probe used to mirror the renderer's table as a hand-written literal here.
 * That made it a copy of an answer rather than a measurement of one: when a
 * renderer was added, this file kept saying it was missing, and when a name was
 * removed it would have kept claiming it drew. It now reads both tables for
 * real, so the output cannot agree with itself dishonestly.
 *
 * Usage: `node --experimental-strip-types evidence/phase-4a-1/component-inventory.mjs`
 */
import { COMPONENTS } from '../../src/backends/openui/signatures.ts'
import { RENDERED_COMPONENTS } from '../../src/client/OpenUICard.tsx'

const RENDERED = new Set(RENDERED_COMPONENTS)

const byGroup = new Map()
for (const component of COMPONENTS) {
  const group = component.group ?? 'Ungrouped'
  if (!byGroup.has(group)) byGroup.set(group, [])
  byGroup.get(group).push({ name: component.name, rendered: RENDERED.has(component.name) })
}

let total = 0
let rendered = 0
const missing = []
for (const [group, items] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const have = items.filter(i => i.rendered).map(i => i.name)
  const lack = items.filter(i => !i.rendered).map(i => i.name)
  total += items.length
  rendered += have.length
  missing.push(...lack)
  console.log(`\n${group} (${items.length})`)
  if (have.length > 0) console.log('  rendered :', have.join(', '))
  if (lack.length > 0) console.log('  missing  :', lack.join(', '))
}

console.log(`\n=== ${rendered} / ${total} rendered; ${missing.length} missing ===`)

// Every rendered name must exist in the signature table, or the renderer draws
// something the language does not declare — the drift ADR-002 exists to prevent.
const declared = new Set(COMPONENTS.map(c => c.name))
const phantom = [...RENDERED].filter(name => !declared.has(name))
console.log('renderer names not in the signature table:', phantom.length === 0 ? 'none' : phantom.join(', '))
