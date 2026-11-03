/**
 * Behaviour parity between the authoritative helper and the copies it replaces.
 *
 * ## Why this file exists
 *
 * The owner's condition for consolidating `cdp.mjs` was: *verify the old and new
 * call behaviour agree before retiring the duplicates.* That is not satisfiable
 * by reading the two files side by side — the old copies differ from each other,
 * and the protocol changed underneath them (1.7 -> 1.8 moved `observation_id`).
 *
 * So this check is mechanical and static: it reads each historical copy, extracts
 * the exported names and the `bsk` subcommands each one issues, and reports what
 * the authoritative helper covers, drops, or adds. Run it after editing
 * `evidence/lib/cdp.mjs`; a dropped capability must be a decision, not an
 * accident (AGENTS §4: no capability disappears silently).
 *
 * Usage: `node evidence/lib/parity.mjs`
 */
import { readFileSync } from 'node:fs'

/** The authoritative helper. */
const CANON = 'evidence/lib/cdp.mjs'

/** Every copy that predates it, oldest first. */
const LEGACY = [
  'evidence/browser-phase-1/probes/cdp.mjs',
  'evidence/browser-phase-2/cdp.mjs',
  'evidence/browser-phase-3/cdp.mjs',
  'evidence/phase-4a-1/cdp.mjs',
]

/**
 * Deliberate omissions from the authoritative helper.
 *
 * Each entry is a decision with a reason, because a silently dropped helper is
 * how a future phase rediscovers the same workaround.
 */
const DROPPED = {
  type: 'per-character typing. It existed only to work around the 0.4.0/0.4.1 protocol skew that made `fill` crash the host draft editor; once the CLI matched the extension, `fill` delivered 876 characters in one action. Kept as a recorded mistake, not as an API: a character loop costs one subprocess per glyph.',
  consoleClear: 'no `console clear` subcommand exists in bsk 0.4.1; the phase-4a-1 copy never called it successfully either. Console reads are cursor-based (`--since`).',
}

/** Exported function names in a module. */
function exportsOf(file) {
  const text = readFileSync(file, 'utf8')
  const names = new Set()
  for (const match of text.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gmu)) names.add(match[1])
  for (const match of text.matchAll(/^export\s+const\s+(\w+)/gmu)) names.add(match[1])
  for (const match of text.matchAll(/^export\s*\{\s*([^}]+)\}/gmu)) {
    for (const part of match[1].split(',')) names.add(part.trim())
  }
  return names
}

/** The `bsk` subcommand paths a module issues, e.g. `step`, `cooperate sync`. */
function commandsOf(file) {
  const text = readFileSync(file, 'utf8')
  const found = new Set()
  for (const match of text.matchAll(/'(status|cooperate|session|tab|step|evaluate|observe|console|network|screenshot|reload|navigate|window|focus|click|install-skill|daemon)'/gu)) {
    found.add(match[1])
  }
  for (const match of text.matchAll(/'cooperate',\s*'(sync|wait)'/gu)) found.add(`cooperate ${match[1]}`)
  for (const match of text.matchAll(/'step',[^)]*?'--action',\s*'(\w[\w-]*)'/gsu)) found.add(`step ${match[1]}`)
  return found
}

const canonExports = exportsOf(CANON)
const canonCommands = commandsOf(CANON)
const canonText = readFileSync(CANON, 'utf8')

const report = { canon: CANON, canonExports: [...canonExports].sort(), copies: [], missingAction: [] }

for (const file of LEGACY) {
  const exports = exportsOf(file)
  const commands = commandsOf(file)
  const absent = [...exports].filter(name => !canonExports.has(name)).sort()
  const absentCommands = [...commands].filter(name => !canonCommands.has(name)).sort()
  report.copies.push({
    file,
    lines: readFileSync(file, 'utf8').split('\n').length,
    exports: exports.size,
    absentExports: absent.map(name => ({ name, decision: DROPPED[name] ?? 'UNEXPLAINED — either add it to the canonical helper or record why it is gone' })),
    absentCommands,
  })
}

// The one capability that must exist: bulk input plus keyboard submit.
const mustHave = ['fill', 'press', 'evaluate', 'click']
for (const name of mustHave) if (!canonExports.has(name)) report.missingAction.push(name)

// A character loop must not come back. This is the specific regression the
// rewrite exists to prevent, so it is asserted rather than remembered.
report.forbidsCharacterTyping = !/for\s*\(\s*const\s+character\s+of/u.test(canonText)
  && !/export\s+(?:async\s+)?function\s+type\b/u.test(canonText)

console.log(JSON.stringify(report, null, 1))

const unexplained = report.copies.flatMap(copy => copy.absentExports.filter(entry => /UNEXPLAINED/u.test(entry.decision)))
const failed = report.missingAction.length > 0 || unexplained.length > 0 || report.forbidsCharacterTyping === false
process.exit(failed ? 1 : 0)
