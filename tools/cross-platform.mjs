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

// A test that fails on BOTH platforms is not a platform limitation — it is a defect
// or a fixture problem that the Windows baseline has been hiding. That is the only
// thing this script treats as an error.
const failsOnBoth = windows.failed.filter(x => posix.failed.includes(x))

// The empty-POSIX case is the expected one and is NOT a failure of this comparison:
// it is the result the audit predicted. Reporting it as a mismatch was a bug in the
// first version of this script written into CI, where it failed every Linux build for
// being too clean.
const posixIsClean = posix.failed.length === 0

const verdict = failsOnBoth.length > 0
  ? 'DEFECT: ' + failsOnBoth.length + ' test(s) fail on both platforms, so their cause is not the platform'
  : posixIsClean
    ? 'PLATFORM-SPECIFIC: every Windows failure passes on POSIX; POSIX is clean'
    : 'MIXED: POSIX has ' + posix.failed.length + ' failure(s) of its own, none shared with Windows'
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
  posixIsClean,
  verdict,
  onlyWindows,
  onlyPosix,
}, null, 1))

process.exit(failsOnBoth.length > 0 ? 1 : 0)