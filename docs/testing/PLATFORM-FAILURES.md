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

## 4. What this document does not establish

It does **not** establish that the product works on Windows. It establishes that
these fifteen failures are platform-shaped rather than product-shaped, and that
nothing in this release changed them.

It also does not establish the reverse for other platforms. **There is no CI in
this repository, so "the same test passes on POSIX" is a prediction, not an
observation.** No POSIX run of this suite exists in `evidence/`. Treat the
POSIX-green expectation as untested until a run is recorded (see §5).

## 5. Recommendations

| Priority | Action |
| --- | --- |
| **NON-BLOCKER, before a public release** | Run the suite once on a POSIX host and record the output under `evidence/`. Until then the cross-platform claim rests on reading, not measurement. |
| **NON-BLOCKER** | Add `describe.skipIf(process.platform === 'win32')` to the six symlink tests, so the suite stops reporting them as failures and the skip is *visible* rather than a matching count. |
| **NON-BLOCKER** | Fix the `~` fixtures to use `os.homedir()` instead of a literal `~`, which is what the product already does. |
| **DEFERRED** | Add CI with a Windows job and a Linux job. Without it, the baseline-matching argument is the only guard, and it cannot detect a platform-specific regression. |

None of these is a release blocker for a version whose scope is the OpenUI
renderer and the clipboard action, because none of them touches either.