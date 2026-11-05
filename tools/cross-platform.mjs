/**
 * Compare the Windows and POSIX failure sets name by name.
 *
 * A count is not a comparison. The claim under audit is that the fifteen Windows
 * failures are platform-shaped, and the only way to move that from argument to
 * evidence is to run the same suite on both and read the two sets side by side.
 *
 * Usage: node tools/cross-platform.mjs tmp/final.json /tmp/posix.json
 */
import { readFileSync } from 'node:fs'

const NL = String.fromCharCode(10)
const [winPath, posixPath] = process.argv.slice(2)
if (winPath === undefined || posixPath === undefined) {
  console.error('usage: node tools/cross-platform.mjs <windows.json> <posix.json>')
  process.exit(2)
}

/** Normalise a suite+test name so the two reporters' formats compare equal. */
const norm = s => s.replace(/\s*>\s*/g, ' ').replace(/\s+/g, ' ').trim()

function read(path, label) {
  const report = JSON.parse(readFileSync(path, 'utf8'))
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
  const counts = {
    passed: report.numPassedTests,
    failed: report.numFailedTests,
    pending: report.numPendingTests,
    todo: report.numTodoTests,
    total: report.numTotalTests,
  }
  counts.closes = counts.passed + counts.failed + counts.pending + counts.todo === counts.total
  return { label, counts, failed: failed.sort(), skipped: skipped.sort() }
}

const windows = read(winPath, 'windows')
const posix = read(posixPath, 'posix')

const onlyWindows = windows.failed.filter(x => !posix.failed.includes(x))
const onlyPosix = posix.failed.filter(x => !windows.failed.includes(x))

// Each Windows failure must be absent on POSIX for the platform claim to hold. If a
// test fails on both, the cause is not the platform and the classification is wrong.
const failsOnBoth = windows.failed.filter(x => posix.failed.includes(x))

const verdict = posix.failed.length === 0 && failsOnBoth.length === 0
  ? 'PLATFORM-SPECIFIC: every Windows failure passes on POSIX'
  : failsOnBoth.length > 0
    ? 'NOT PLATFORM-SPECIFIC: ' + failsOnBoth.length + ' test(s) fail on both'
    : 'INCONCLUSIVE'

console.log(JSON.stringify({
  inputs: { windows: winPath, posix: posixPath },
  counts: { windows: windows.counts, posix: posix.counts },
  failureSet: {
    windows: windows.failed.length,
    posix: posix.failed.length,
    onlyWindows: onlyWindows.length,
    onlyPosix: onlyPosix.length,
    failsOnBoth,
  },
  skipped: { windows: windows.skipped.length, posix: posix.skipped.length },
  verdict,
  onlyWindows,
  onlyPosix,
}, null, 1))

process.exit(verdict.startsWith('PLATFORM-SPECIFIC') ? 0 : 1)