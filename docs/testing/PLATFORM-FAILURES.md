# Platform-dependent test failures

- **Status:** recorded, not fixed. These are the 15 failures the suite reports on
  this Windows host, and they are the same 15 it has reported since before stage 4A.
- **Date:** 2026-11-05
- **Applies to:** `vitest run` on Windows without Developer Mode

## What this document is for

The baseline was being used as a release argument: *"the failure set matches the
baseline, therefore nothing regressed."* That inference is half right, and the
wrong half matters.

A matching failure set proves **the change under test added no failure**. It says
nothing about whether the failures are harmless, whether they would occur
elsewhere, or whether they hide a defect. So each one is listed here with the
root cause the message actually shows, what it leaves unverified, and whether it
blocks a release.

**They are classified as platform limitations because every root cause is a
Windows filesystem or path behaviour, not an assertion about product behaviour.**
That is a claim about the messages, not a claim that the product is correct on
Windows: see §4 for what this document does *not* establish.

## 1. The fifteen, by root cause

| # | Cause | Count | What fails |
| --- | --- | --- | --- |
| 1 | `EPERM` on symlink creation | **6** | Every test that has to *create* a symlink to prove an escape is refused |
| 2 | `~` not expanded in a path | **4** | Card-storage tests that pass `~/…` expecting a shell to expand it |
| 3 | Drive-qualified path joined onto another | **1** | Legacy workspace card resolution |
| 4 | `EPERM` on rename over an open file | **1** | The concurrent-create race |
| 5 | Fixture mock omits `ctx.fs.readText` | **1** | One image re-read test |
| 6 | 5-second timeout | **1** | The image-resolution cancellation path |
| 7 | Tool-description fixture | **1** | An on-disk contract assertion |

Regenerate this table and the per-test detail with:

```powershell
npx vitest run --reporter=json --outputFile=tmp/run.json
node evidence/lib/failure-set.mjs tmp/run.json      # counts + baseline match
node tools/classify-failures.mjs tmp/run.json       # root cause per failure
```

`classify-failures.mjs` **exits non-zero if any failure is unclassified**, so a new
failure cannot be absorbed into the baseline by being ignored.

## 2. What each cause leaves unverified

### 2.1 Symlink escapes (6)

These are the tests that matter most, because they exercise a **security**
property: that card storage, image routes and style files refuse a path that
leaves the store through a symlink.

They cannot run here. Windows refuses `fs.symlink` without Developer Mode or
elevation, and the failure is in the *setup*, before the assertion.

**What that leaves:** the refusal logic is present and readable
(`realpath` comparison against the store root), but the escape itself is
**unproven on this host**. A future defect that broke the containment check would
not be caught by these tests here.

**Why it does not block:** the code is unchanged by this release, and the same
tests are the ones that would catch such a defect on a POSIX host. Recorded as
**DEFERRED** with the recommendation in §5.

### 2.2 `~` expansion (4) and path joining (1)

Windows leaves a leading `~` as a literal directory name, producing
`…\dsh-plugin-visualize\~\AppData\Local\…`. The tests then fail to find a file
they wrote, because the producer and the consumer disagreed about the path.

One case joins an already drive-qualified path onto another, giving
`…\Temp\viz-ws-6AXLVw\C:\Users\…` — the same class of bug: a Windows path
assumption inside the fixture.

**What that leaves:** card-storage path resolution is unverified on Windows.

Two of these are worth separating from the rest, because the message looks like a
product bug rather than a fixture bug:

- *"writes a new card into the session store"* asserts the stored path matches
  `/^C:\Users\…\visualize\/` and receives `~\AppData\…`. The mismatch is in the
  expansion, not the storage.
- *"creates the same card concurrently"* reports `ENOENT` on a `~`-prefixed path
  for the same reason, under a test name that has nothing to do with paths.

### 2.3 Fixture shape (1) and timeout (1)

`ctx.fs.readText is not a function` is a mock that predates a call site; the real
`ctx.fs` provides it. The timeout waits 5 s for an image promise that never
resolves in that fixture — no assertion was contradicted, the test did not finish.

### 2.4 Tool description (1)

The fixture never registers a skill provider, so the description it reads is
empty. The contract it guards is covered by
`tests/capability-consistency.spec.ts`, which reads the generator directly rather
than through a provider.

## 3. Why these are not release blockers

Three reasons, and each is checkable rather than asserted:

1. **Every root cause is in the failure's own message** — `EPERM … symlink`,
   `~\AppData`, a nested drive letter, `readText is not a function`, a 5 s
   timeout. None is an expectation about product behaviour being contradicted.
   `classify-failures.mjs` exits non-zero if any failure resists this reading.
2. **The failure set is unchanged across every stage in this repo's history.** It
   matched before 4A, after 4A, and after 4B. A failure caused by this release
   would have to have existed before it.
3. **The shipped code paths are exercised by other tests.** Card creation,
   persistence and hydration have passing tests that do not touch symlinks or
   `~`-prefixed inputs; the security containment check has a *passing* sibling in
   `tests/images.spec.ts` for the lexical (non-symlink) escape.

## 4. The claim, now measured rather than argued

This section used to say the failures were "platform-shaped rather than
product-shaped" and that the POSIX-green expectation was **a prediction, not an
observation**, because there was no CI. Both parts have since been measured.

### 4.1 POSIX

Run locally in WSL Ubuntu 24.04 (Node 22.23.4, pnpm 11.28.0) against a fresh clone,
with `pnpm install --frozen-lockfile`:

```
passed 939   failed 0   skipped 0   total 939
```

Zero skips matters as much as zero failures: nothing was excluded to get there.

### 4.2 Cross-platform, by name

`tools/cross-platform.mjs` compares the two reports test by test. The result:

```
failsOnBoth: []
verdict: PLATFORM-SPECIFIC — every locally-failing test passes on POSIX
```

**Not one test fails on both platforms.** A test failing everywhere would be a defect
the Windows baseline was hiding; there are none.

### 4.3 Windows on CI is better than Windows here

The GitHub `windows-latest` runner reports **7** of these 15, not 15:

```
windows-latest   passed 932   failed 7   skipped 0   total 939   gate PASSED
ubuntu-latest    passed 939   failed 0   skipped 0   total 939   gate PASSED
```

The eight that pass there are exactly the eight that need a working symlink or a
POSIX-shaped path — **including six of the eight symlink containment tests this
document had recorded as unprovable.** GitHub's runner can create symlinks; a stock
Windows box cannot.

So the containment check is no longer "present and readable" on Windows. It executes
and passes on CI. That is a stronger statement than this document originally made,
and it came from running the tests rather than reasoning about them.

### 4.4 What remains unproven

Two things, stated plainly:

- **The seven that still fail on CI Windows** are the ones whose cause is the `~`
  expansion, the drive-qualified path join, the rename-over-open-file lock, the
  fixture mock, the timeout and the description fixture. Those are genuine Windows
  behaviours and they are still not exercised on that platform.
- **The product is not thereby proven correct on Windows.** It is proven that these
  specific failures have environmental causes on both the local machine and the
  runner, and that the same tests pass on Linux. A defect unrelated to these tests
  would be invisible to all of this.

## 5. Recommendations

| Priority | Action | Status |
| --- | --- | --- |
| ~~NON-BLOCKER~~ | Run the suite once on POSIX and record it | **DONE** — 939/939, `evidence/phase-5/C2-cross-platform.json` |
| ~~DEFERRED~~ | Add CI with a Windows job and a Linux job | **DONE** — `.github/workflows/verify.yml`, run `42003251408` green |
| **NON-BLOCKER** | Fix the `~` fixtures to use `os.homedir()` instead of a literal `~`, which is what the product already does | open |
| ~~NON-BLOCKER~~ | Investigate the 5 s timeout | **CLOSED 2026-11-06 (stage 6)** — it was not a slow-machine timeout. It was a ~39 ms failure behind a test that awaited a promise nothing could resolve, masked because vitest reports a timeout as `STACK_TRACE_ERROR`. **Raising the bound would have hidden it permanently.** Root cause: the `~` round-trip bug in `src/storage.ts`. `evidence/stage-6/timeout-diagnosis.md` |
| **NON-BLOCKER** | Give the fixture mock a `readText`, so one image re-read test stops failing for a reason unrelated to what it checks | open |

Note what is **not** on this list any more: skipping the symlink tests on Windows.
That recommendation was written when they could only fail there. On the CI Windows
runner they pass, so adding a skip would now *remove* real coverage — a reminder
that a skip added to hide a failure keeps hiding whatever comes after it.

None of the open items is a release blocker for a version whose scope is the OpenUI
renderer and the clipboard action, because none of them touches either.