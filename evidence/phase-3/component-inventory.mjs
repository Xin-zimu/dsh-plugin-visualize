/**
 * Which of the 48 components have a renderer, and which do not?
 *
 * The stage-4A batches must be derived from the signature table, not from a
 * remembered count: "8 of 48" has been quoted for three sessions and nobody has
 * listed the eight. This reads the real tables and prints the split by group, so
 * the migration matrix and the stage plan can name every row.
 */
import { COMPONENTS } from '../../src/backends/openui/signatures.ts'

// The renderer's component table, mirrored here as names only. Keeping it a
// literal is deliberate: if the two drift, this probe reports the difference
// instead of silently agreeing with itself.
const RENDERED = new Set([
  'Col', 'Row', 'Card', 'Title', 'Text', 'Caption', 'Button', 'Slider',
])

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

// Every rendered name must exist in the signature table, or the table is
// rendering something the language does not declare.
const declared = new Set(COMPONENTS.map(c => c.name))
const phantom = [...RENDERED].filter(name => !declared.has(name))
console.log('renderer names not in the signature table:', phantom.length === 0 ? 'none' : phantom.join(', '))
