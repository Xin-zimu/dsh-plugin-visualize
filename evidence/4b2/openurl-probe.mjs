#!/usr/bin/env node
/**
 * evidence/4b2/openurl-probe.mjs — read-only probe of the LAN *reachability*
 * half of the @OpenUrl investigation (stage 4B-2, task-1).
 *
 * What it proves, and what it does not:
 *   PROVES: a route registered on the host's web server is distinguishable from
 *   an unregistered one even behind the Connection trust fence — a registered
 *   route answers 401 (fence), an unregistered one answers 404 (no route). So
 *   "the open-in-app routes exist in THIS deployment" is a measurable fact, not
 *   a reading of a patch file.
 *   DOES NOT PROVE anything about opening a URL. Those routes take a *path*,
 *   not a URL; see openurl-host-findings.md section 3.
 *
 * It never sends credentials, never attempts the open, and never mutates state:
 * every request is an unauthenticated GET, which the fence refuses.
 *
 * Usage: node evidence/4b2/openurl-probe.mjs [--origin=http://127.0.0.1:52851]
 */

const DEFAULT_ORIGIN = 'http://127.0.0.1:52851'

/** Routes whose existence in this deployment is the claim under test, plus controls. */
const CASES = [
  { path: '/open-in-app/apps', expect: 'registered', why: 'GET application catalog (dsh-host-open-in-app)' },
  { path: '/open-in-app/open', expect: 'registered', why: 'POST launch route (path-only; NOT a URL opener)' },
  { path: '/api/present.host', expect: 'registered', why: 'deliverables desktop metadata' },
  { path: '/open-in-app/no-such-route', expect: 'absent', why: 'control: registered prefix, unregistered child' },
  { path: '/definitely-not-a-route-4b2', expect: 'absent', why: 'control: nothing registered at all' },
]

/** 401 means "fenced, therefore present"; 404 means "no such route". */
function classify(status) {
  if (status === 401 || status === 403) return 'registered'
  if (status === 404) return 'absent'
  return `unexpected-${status}`
}

async function main() {
  const originArg = process.argv.find(a => a.startsWith('--origin='))
  const origin = originArg === undefined ? DEFAULT_ORIGIN : originArg.slice('--origin='.length)

  const rows = []
  let failures = 0
  for (const testCase of CASES) {
    let status
    try {
      const response = await fetch(new URL(testCase.path, origin), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      })
      status = response.status
      await response.arrayBuffer()
    } catch (error) {
      rows.push({ ...testCase, status: 'ERROR', verdict: `error: ${error.message}`, pass: false })
      failures += 1
      continue
    }
    const verdict = classify(status)
    const pass = verdict === testCase.expect
    if (!pass) failures += 1
    rows.push({ ...testCase, status, verdict, pass })
  }

  console.log(`# openurl-probe — origin ${origin} (date ${new Date().toISOString()})`)
  console.log('#')
  console.log('# 401/403 => a route is registered and the Connection fence refused us')
  console.log('# 404     => no route at that path')
  console.log('')
  const width = Math.max(...rows.map(r => r.path.length))
  for (const row of rows) {
    console.log(
      `${row.pass ? 'PASS' : 'FAIL'}  ${String(row.status).padEnd(5)} ` +
      `${row.path.padEnd(width)}  expect=${row.expect.padEnd(10)} got=${row.verdict.padEnd(10)}  ${row.why}`,
    )
  }
  console.log('')
  console.log(failures === 0 ? 'RESULT: all cases classified as expected' : `RESULT: ${failures} unexpected`)
  // Exit 2 = environment blocked the run (host not listening), never a product verdict.
  const envBlocked = rows.some(r => r.status === 'ERROR')
  process.exitCode = envBlocked ? 2 : failures === 0 ? 0 : 1
}

await main()
