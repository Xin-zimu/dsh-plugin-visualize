// Reads the vitest JSON report and derives counts + the failure name set.
// Written by the audit-runner (MEASURER) for task-3. Reads only; writes only
// under evidence/phase-5-rc2/.
import { readFileSync, writeFileSync } from 'node:fs'

const p = process.argv[2] ?? 'evidence/phase-5-rc2/vitest.json'
const j = JSON.parse(readFileSync(p, 'utf8'))

const lines = []
const say = (s) => { lines.push(s); console.log(s) }

say('report: ' + p)
say('numTotalTestSuites: ' + j.numTotalTestSuites)
say('numPassedTestSuites: ' + j.numPassedTestSuites)
say('numFailedTestSuites: ' + j.numFailedTestSuites)
say('numPendingTestSuites: ' + j.numPendingTestSuites)
say('numTotalTests: ' + j.numTotalTests)
say('numPassedTests: ' + j.numPassedTests)
say('numFailedTests: ' + j.numFailedTests)
say('numPendingTests: ' + j.numPendingTests)
say('numTodoTests: ' + j.numTodoTests)
say('success: ' + j.success)
say('startTime: ' + j.startTime + ' (' + new Date(j.startTime).toISOString() + ')')

const sum = j.numPassedTests + j.numFailedTests + j.numPendingTests + (j.numTodoTests || 0)
say('')
say('COUNTS CLOSE: ' + j.numPassedTests + ' passed + ' + j.numFailedTests + ' failed + ' +
    j.numPendingTests + ' skipped + ' + (j.numTodoTests || 0) + ' todo = ' + sum +
    ' ; numTotalTests = ' + j.numTotalTests + ' ; equal = ' + (sum === j.numTotalTests))
if (sum !== j.numTotalTests) { say('COUNTS DO NOT CLOSE — hard stop'); process.exitCode = 2 }

const statuses = {}
const fails = []
let assertionTotal = 0
for (const f of (j.testResults || [])) {
  const rel = String(f.name).replace(/\\/g, '/').replace(/^.*dsh-plugin-visualize\//, '')
  for (const a of (f.assertionResults || [])) {
    assertionTotal++
    statuses[a.status] = (statuses[a.status] || 0) + 1
    if (a.status === 'failed') {
      fails.push({
        fullName: a.fullName,
        file: rel,
        status: a.status,
        firstLine: String((a.failureMessages || []).join('\n')).split('\n')[0] || '',
      })
    }
  }
}
say('assertion results walked: ' + assertionTotal)
say('statuses: ' + JSON.stringify(statuses))
say('suite files walked: ' + (j.testResults || []).length)
say('')
say('=== THE ' + fails.length + ' FAILING TESTS (full names) ===')
fails.forEach((f, i) => say((i + 1) + '. ' + f.fullName + '\n   file: ' + f.file + '\n   msg:  ' + f.firstLine))

writeFileSync('evidence/phase-5-rc2/05-failing-tests.json', JSON.stringify(fails, null, 2) + '\n')
writeFileSync('evidence/phase-5-rc2/04-vitest-counts.txt', lines.join('\n') + '\n')
console.log('')
console.log('wrote evidence/phase-5-rc2/04-vitest-counts.txt and 05-failing-tests.json')
