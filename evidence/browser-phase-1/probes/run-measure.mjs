import { measure } from './measure.mjs'
import { writeFileSync } from 'node:fs'
const result = measure(process.argv[2] ?? 'light')
const out = process.argv[3]
if (out) writeFileSync(out, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
