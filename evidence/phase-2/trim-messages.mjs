// Remove the leading space left where the "line N: " prefix used to be.
import { readFileSync, writeFileSync } from 'node:fs'
const path = 'src/backends/openui/parse.ts'
let text = readFileSync(path, 'utf8')
const before = text
// message: ` X  ->  message: `X
text = text.replace(/(message: `)\s+/g, '$1')
writeFileSync(path, text)
console.log('leading-space messages trimmed:', (before.match(/message: `\s+/g) ?? []).length)
