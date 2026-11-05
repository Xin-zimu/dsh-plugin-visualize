/**
 * The CI gate: assert that each platform produced the result it is expected to.
 *
 * Why this exists rather than "does vitest exit 0". The suite is red on Windows —
 * fifteen known platform failures, documented in docs/testing/PLATFORM-FAILURES.md
 * — so a bare exit code is the wrong gate there: it would fail every build, and the
 * tempting fix is to skip the tests, which is exactly what must not happen.
 *
 * This gate is therefore STRICTER than an exit code, not looser:
 *
 *   linux    expects 0 failed and 0 skipped
 *   windows  expects exactly the fifteen baseline failures, by name, and 0 skipped
 *
 * Anything else fails. In particular a test that starts being skipped fails, because
 * a skip is a removed check wearing a passing colour. And a subset of the baseline
 * failing on Linux fails, because that is a real defect.
 *
 * Usage: node tools/assert-platform-result.mjs <report.json> <linux|windows>
 */
import { readFileSync } from 'node:fs'

const [reportPath, platform] = process.argv.slice(2)
if (reportPath === undefined || platform === undefined) {
  console.error('usage: node tools/assert-platform-result.mjs <report.json> <linux|windows>')
  process.exit(2)
}
if (platform !== 'linux' && platform !== 'windows') {
  console.error('platform must be linux or windows, got ' + platform)
  process.exit(2)
}

const NL = String.fromCharCode(10)
const norm = s => s.replace(/\s*>\s*/g, ' ').replace(/\s+/g, ' ').trim()

const report = JSON.parse(readFileSync(reportPath, 'utf8'))
const failed = []
const skipped = []
for (const file of report.testResults) {
  const name = 'tests/' + file.name.split(/[\\/]/).pop()
  for (const assertion of file.assertionResults) {
    const id = norm(name + ' ' + assertion.fullName)
    if (assertion.status === 'failed') failed.push(id)
    if (assertion.status === 'pending' || assertion.status === 'skipped') skipped.push(id)
  }
}
failed.sort()
skipped.sort()

const counts = {
  passed: report.numPassedTests ?? 0,
  failed: report.numFailedTests ?? 0,
  pending: report.numPendingTests ?? 0,
  todo: report.numTodoTests ?? 0,
  total: report.numTotalTests ?? 0,
}
counts.sum = counts.passed + counts.failed + counts.pending + counts.todo
counts.closes = counts.sum === counts.total

const problems = []

// The counts must close on both platforms: a test that vanished is a removed check.
if (!counts.closes) problems.push('counts do not close: ' + counts.sum + ' vs total ' + counts.total)

// A skip is a check that stopped running. It is reported as a failure of this gate.
if (skipped.length > 0) problems.push(skipped.length + ' test(s) were skipped, which removes a check: ' + skipped.join(' | '))

if (platform === 'linux') {
  if (failed.length > 0) problems.push('linux must have no failures, found ' + failed.length + ': ' + failed.join(' | '))
  console.log('linux: expected 0 failures, found ' + failed.length)
} else {
  const baselineRaw = readFileSync('evidence/publish/test-before-publish.txt', 'utf8')
  const baseline = baselineRaw.split(NL)
    .filter(line => line.trim().startsWith('FAIL '))
    .map(line => norm(line.replace(/^\s*FAIL\s+/, '')))
    .sort()
  const newFailures = failed.filter(x => !baseline.includes(x))
  const nowPassing = baseline.filter(x => !failed.includes(x))

  // Only NEW failures are an error. A baseline failure that starts passing is the
  // environment being better, not the code being worse, and turning that into a red
  // build would train people to update the baseline until it agrees — which is how a
  // baseline stops meaning anything.
  //
  // This is not hypothetical. The GitHub Windows runner reports 7 of the baseline 15,
  // because it can create symlinks: the six containment tests that could not run on a
  // stock Windows box execute there and pass. That is the point of running them.
  if (newFailures.length > 0) {
    problems.push('windows has ' + newFailures.length + ' NEW failure(s): ' + newFailures.join(' | '))
  }
  if (nowPassing.length > 0) {
    console.log('note: ' + nowPassing.length + ' baseline failure(s) pass on this runner.')
    console.log('      Not an error: a better environment is not a worse build.')
  }
  console.log('windows: baseline ' + baseline.length + ', found ' + failed.length + ', new ' + newFailures.length)
}

console.log(JSON.stringify({ platform, counts, failureSet: { failed: failed.length, skipped: skipped.length }, problems }, null, 1))

if (problems.length > 0) {
  console.error('GATE FAILED')
  process.exit(1)
}
console.log('GATE PASSED')