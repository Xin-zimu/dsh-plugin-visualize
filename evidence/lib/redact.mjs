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
//
// The username and machine id are deliberately NOT written here as literals:
// a redaction tool that hard-codes the value it removes leaks it in the repo.
// They are read from the environment when available, and the home-directory
// rule below catches the common case without knowing them.
const USER = process.env.REDACT_USER ?? null
const EMAIL = process.env.REDACT_EMAIL ?? null

const SUBS = [
  [/[A-Za-z]:(?:\\\\|\\|\/)+(?:Deepseek|work)(?:\\\\|\\|\/)+dsh-plugin-visualize/g,
    'D:/work/dsh-plugin-visualize'],
  [/[A-Za-z]:(?:\\\\|\\|\/)+Users(?:\\\\|\\|\/)+[^\\/\s'"]+/g, 'C:/Users/<user>'],
]

if (USER) SUBS.push([new RegExp(`(?<![0-9])${USER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9])`, 'g'), '<user>'])
if (EMAIL) SUBS.push([new RegExp(`\\b${EMAIL}\\b`, 'g'), '<email>'])

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
  // count how many of the rules actually fired, without naming their contents
  const n = SUBS.reduce((acc, [rx]) => acc + (before.match(rx) ?? []).length, 0)
  console.log(`redacted ${f} (${n} path token(s))`)
  changed++
}
process.exit(0)
