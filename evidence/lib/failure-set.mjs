/**
 * Compare the current suite's failures against the published baseline, and make
 * the counts close.
 *
 * This exists because the first version of it did not. That version read a
 * hard-coded `tmp/full-after.json`, a capture taken once; every later run compared
 * the tree against that stale file and printed `IDENTICAL: true` regardless of
 * what had actually changed. Two genuine failures introduced by stage 4B stayed
 * hidden behind it until a reader added the numbers up and noticed 910 + 15 != 927.
 *
 * A comparison that names its own input instead of taking one is not a check.
 *
 * Usage:
 *   npx vitest run --reporter=json --outputFile=tmp/run.json
 *   node evidence/lib/failure-set.mjs tmp/run.json
 *
 * Exit 0 only when the failure set matches name for name AND the counts add up.
 */
import { readFileSync } from 'node:fs'

const target = process.argv[2]
if (target === undefined) {
  console.error('usage: node evidence/lib/failure-set.mjs <vitest-json-report>')
  process.exit(2)
}

const BS = String.fromCharCode(92)
const NL = String.fromCharCode(10)

/** The text reporter joins suite and test with ' > '; JSON joins them with a space. */
const norm = s => s.replace(/\s*>\s*/g, ' ').replace(/\s+/g, ' ').trim()

const baseRaw = readFileSync('evidence/publish/test-before-publish.txt', 'utf8')
const base = baseRaw.split(NL)
  .filter(line => line.trim().startsWith('FAIL '))
  .map(line => norm(line.replace(/^\s*FAIL\s+/, '')))
  .sort()

const report = JSON.parse(readFileSync(target, 'utf8'))
const current = []
for (const file of report.testResults) {
  const name = 'tests/' + file.name.split(/[\\/]/).pop()
  for (const assertion of file.assertionResults) {
    if (assertion.status === 'failed') current.push(norm(name + ' ' + assertion.fullName))
  }
}
current.sort()

const onlyBaseline = base.filter(x => !current.includes(x))
const onlyCurrent = current.filter(x => !base.includes(x))

// Counts must close. A report where passed + failed + pending + todo is not the
// total means tests disappeared, and a disappearing test is a silent removal of a
// check — exactly the failure mode this file was written to catch.
const passed = report.numPassedTests ?? 0
const failed = report.numFailedTests ?? 0
const pending = report.numPendingTests ?? 0
const todo = report.numTodoTests ?? 0
const total = report.numTotalTests ?? 0
const sum = passed + failed + pending + todo

const identical = JSON.stringify(base) === JSON.stringify(current)
const closes = sum === total

console.log(JSON.stringify({
  input: target,
  counts: { passed, failed, pending, todo, total, sum, closes },
  failureSet: { baseline: base.length, current: current.length, identical },
  onlyInBaseline: onlyBaseline,
  onlyInCurrent: onlyCurrent,
  verdict: identical && closes ? 'MATCH' : 'MISMATCH',
}, null, 1))

process.exit(identical && closes ? 0 : 1)