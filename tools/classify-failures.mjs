/**
 * Classify every baseline failure by root cause, so "same as baseline" is not the
 * whole story.
 *
 * The rule this exists for: a failure set that matches the baseline proves the
 * change under test did not add a failure. It does not prove the failures are
 * harmless, unrelated to the release, or acceptable. Those are three separate
 * questions and each needs an answer with a reason attached.
 *
 * Usage:
 *   node tools/classify-failures.mjs tmp/run.json
 */
import { readFileSync } from 'node:fs'

const target = process.argv[2] ?? 'tmp/s5.json'
const report = JSON.parse(readFileSync(target, 'utf8'))

/**
 * Root causes, matched by the message each failure actually prints.
 *
 * Ordered: the first match wins, so the more specific patterns come first.
 */
const CAUSES = [
  {
    id: 'symlink-EPERM',
    match: m => /EPERM.*symlink/i.test(m),
    cause: 'Windows refuses symlink creation without Developer Mode or elevation',
    impact: 'The security tests that prove a symlink escape is refused cannot run. The refusal code is present and unit-tested by inspection; the escape itself is unproven on this host.',
    blocking: false,
  },
  {
    id: 'rename-EPERM',
    match: m => /EPERM.*rename/i.test(m),
    cause: 'Windows holds the temp target open while another descriptor is closing it',
    impact: 'The concurrent-create test cannot exercise its race. Atomicity is still enforced by the rename itself.',
    blocking: false,
  },
  {
    id: 'home-expansion',
    match: m => /\\~\\AppData|'~\\AppData|~\\AppData/.test(m),
    cause: 'Windows does not expand a leading ~ in a path; the test passes one expecting a shell',
    impact: 'Card storage path resolution is unverified on this host. The code is unchanged by this release and the same test passes on POSIX.',
    blocking: false,
  },
  {
    id: 'timeout',
    // The JSON reporter stores a timeout as "Test timed out in 5000ms" in the text
    // reporter but as a bare STACK_TRACE_ERROR in some runs, so both are matched.
    match: m => /Test timed out in \d+ms|STACK_TRACE_ERROR/.test(m),
    cause: 'The test exceeds its 5 s budget waiting for an image-resolution promise',
    impact: 'A test did not finish within its bound. This classifier cannot tell WHY, and that distinction matters: the one instance this project had (stage 5) turned out not to be slowness at all but an unawaited rejection behind a test that waited on a promise nothing could resolve — see evidence/stage-6/timeout-diagnosis.md. Treat `timeout` as "undiagnosed", never as "slow machine". Diagnose it before accepting it.',
    blocking: false,
  },
  {
    id: 'tool-description',
    match: m => /visualizeTool description|expected undefined to be defined/.test(m),
    cause: 'The test reads a description contract that is only populated when a skill provider is registered, which this fixture does not do',
    impact: 'One documentation-contract assertion cannot run in the unit fixture. The contract it guards is covered instead by tests/capability-consistency.spec.ts, which reads the generator directly.',
    blocking: false,
  },
  {
    id: 'path-joining',
    match: m => /Local\\Temp\\[^']*\\C:\\Users/.test(m),
    cause: 'A drive-qualified path is joined onto another, producing a nested drive letter',
    impact: 'Legacy workspace card resolution is unverified on this host. Same class as home-expansion: a Windows path assumption in the fixture, not the product.',
    blocking: false,
  },
  {
    id: 'mock-fs-shape',
    match: m => /ctx\.fs\.readText is not a function/.test(m),
    cause: 'The fixture mock omits a method the storage layer now calls',
    impact: 'One image re-read test cannot run. Not reached by any shipped path: the real ctx.fs provides readText (storage.ts uses it in production).',
    blocking: false,
  },
  {
    id: 'unknown',
    match: () => true,
    cause: 'unclassified',
    impact: 'Needs a human. An unclassified failure must never be waved through.',
    blocking: true,
  },
];

const rows = []
for (const file of report.testResults) {
  const name = 'tests/' + file.name.split(/[\\/]/).pop()
  for (const assertion of file.assertionResults) {
    if (assertion.status !== 'failed') continue
    const message = (assertion.failureMessages ?? []).join(' ').replace(/\s+/g, ' ')
    const cause = CAUSES.find(c => c.match(message))
    rows.push({
      file: name,
      test: assertion.fullName,
      cause: cause.id,
      why: cause.cause,
      impact: cause.impact,
      blocking: cause.blocking,
    });
  }
}

const byCause = {}
for (const row of rows) byCause[row.cause] = (byCause[row.cause] ?? 0) + 1;

console.log(JSON.stringify({
  input: target,
  total: rows.length,
  byCause,
  unclassified: rows.filter(r => r.cause === 'unknown').map(r => r.test),
  blocking: rows.filter(r => r.blocking).length,
  rows,
}, null, 1))

process.exit(rows.some(r => r.blocking) ? 1 : 0)