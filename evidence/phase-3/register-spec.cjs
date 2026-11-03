// Register the new DOM spec in both tsconfig project lists.
// The host project excludes DOM-dependent tests by name; a spec listed in
// neither include nor exclude pulls src/client into a DOM-free compile.
const fs = require('node:fs')

const TARGET = 'tests/openui-state.spec.tsx'
const ADDED = 'tests/openui-state.spec.tsx", "tests/openui-actions.spec.tsx'

for (const file of ['tsconfig.json', 'tsconfig.client.json']) {
  const raw = fs.readFileSync(file, 'utf8')
  if (raw.includes('openui-actions.spec.tsx')) {
    console.log(file, '- already listed')
    continue
  }
  if (!raw.includes(TARGET)) {
    console.log(file, '- TARGET NOT FOUND, skipping')
    continue
  }
  fs.writeFileSync(file, raw.replace(TARGET, ADDED))
  console.log(file, '- updated')
}
