// Redact local paths from a saved transcript. The suite prints absolute Windows
// paths in its failure output, so a transcript captured straight to a file
// carries the username and the machine's directory layout.
//
// Use it on any new evidence transcript before committing:
//   node evidence/lib/redact.mjs evidence/<phase>/test-*.txt
//
// Kept as ESM because package.json declares "type": "module".
import fs from 'node:fs'

// Order matters: the absolute repo path first, so its own segments are
// consumed before the generic home-directory rule runs.
const SUBS = [
  [/[A-Za-z]:(?:\\\\|\\|\/)+(?:Deepseek|work)(?:\\\\|\\|\/)+dsh-plugin-visualize/g,
    'D:/work/dsh-plugin-visualize'],
  [/[A-Za-z]:(?:\\\\|\\|\/)+Users(?:\\\\|\\|\/)+[^\\/\s'"]+/g, 'C:/Users/<user>'],
  [/(?<![0-9])<user>(?![0-9])/g, '<user>'],
  [/\b<email>\b/g, '<email>'],
]

export function redactString(s) {
  let out = s
  for (const [rx, rep] of SUBS) out = out.replace(rx, rep)
  return out
}

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: node evidence/lib/redact.mjs <file>...')
  process.exit(2)
}

let changed = 0
for (const f of files) {
  const before = fs.readFileSync(f, 'utf8')
  const after = redactString(before)
  if (after === before) {
    console.log(`clean    ${f}`)
    continue
  }
  fs.writeFileSync(f, after, 'utf8')
  const n = (before.match(/<user>|work/g) ?? []).length
  console.log(`redacted ${f} (${n} path token(s))`)
  changed++
}
process.exit(changed === 0 ? 0 : 0)
