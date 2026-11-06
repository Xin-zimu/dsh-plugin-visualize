# The 5,020 ms timeout — diagnosis

**Task:** task-8. **Repo:** D:\Deepseek WorkSpace\dsh-plugin-visualize. **Base:** HEAD `23b925b`.
**Date:** 2026-11-06. **Owner:** timeout-diagnoser.

> **Verdict in one line.** It was never a slow test. It was a **~39 ms failure** that could not
> be seen: the update died before it ever fetched the image, the test then waited forever on a
> promise only the fetch would resolve, and vitest killed it at its 5 s bound. The real error was
> printed the whole time — under *"Unhandled Errors / Unhandled Rejection"*, below the fold, while
> the headline said `STACK_TRACE_ERROR`.

**Where the fix belongs:** both. The **cause of this particular hang** was the product's tilde
round-trip bug (`src/storage.ts`, now fixed by tilde-fixer). The **reason it took two stages to
see** was the test's shape, which is test-side and is fixed here.

---

## 1. What the recorded failure actually says

`evidence/phase-5-final/vitest-release-candidate.json`, the failing assertion, verbatim:

```json
{ "fullName": "visualize with data-viz-src images leaves the card untouched when an update is cancelled while its images resolve",
  "status": "failed",
  "duration": 5021.155199999999,
  "failureMessages": ["Error: STACK_TRACE_ERROR\n    at task (...@vitest+runner/dist/chunk-artifact.js:1784:27)\n ..."] }
```

`STACK_TRACE_ERROR` is **not a product error and not a test error**. It is a vitest sentinel: the
runner creates `new Error("STACK_TRACE_ERROR")` at test-registration time so it can point a
timeout at the right line (`@vitest/runner/dist/chunk-artifact.js:1784`), and
`makeTimeoutError()` (`chunk-artifact.js:2404-2411`) builds the real *"Test timed out in 5000ms"*
message and then **overwrites the stack with that sentinel's stack**. The JSON reporter serialises
`e.stack || e.message` (`vitest/dist/chunks/index.UpGiHP7g.js`), so the informative message is
thrown away and only the sentinel survives. The text reporter shows the useful form; the archived
evidence kept the useless one.

So: **`STACK_TRACE_ERROR` is the fingerprint of "the 5 s bound was hit", and nothing else.**

---

## 2. Root cause

`tests/card-images.spec.ts` (HEAD, line numbers as committed):

```
169  const created = await tool.execute({ fragment: '<div id="lab"><h3>Loss</h3></div>', ... })
170  const manifest = created.path.replace(/\.html$/u, '.images.json')
174  const call = tool.execute(patch /* path: created.path */, { ..., signal: cancel.signal })
175  await fetching                       // <-- waits for the STUB to be entered
177  await expect(call).rejects.toThrow() // <-- attaches a handler only HERE
```

The chain that makes line 175 wait forever on this machine:

1. `beforeEach` puts the card store **under `homedir()`** — `mkdtemp(join(tmpdir(), 'viz-home-'))`,
   and on Windows `tmpdir()` is `C:\Users\<u>\AppData\Local\Temp`, i.e. *inside* the home.
2. `src/storage.ts displayOf()` therefore shortens the reported path:
   `~\AppData\Local\Temp\viz-home-…\visualize\sessions\sess-1\…whale.html`.
   **`created.path` is that display form**, and line 174 hands it straight back as `update.path`.
3. At HEAD, `ownedPath()` and `workspacePath()` accepted only `~` and `~/` — **not** `~\`. So:
   - `ownedPath()` → `undefined` (not recognised as a store path), then
   - `workspacePath()` → **accepted it as a workspace-relative path** and routed it into `ctx.fs`.
   A file called `~\AppData\…` does not exist in the workspace, so the read fails.
4. `tool.execute` throws at `src/core/legacy-tool.ts:268` (`base = await source.read()`) — that is
   **before** `resolveCardImages` is reached, so **`fetchUrl` is never called**.
5. The stub's `started()` never runs, so `fetching` never settles, so line 175 never returns.
   The `call` promise *has* already rejected — but nothing in the test awaits it until line 177,
   which is never reached. It surfaces only as vitest's unhandled rejection.
6. At 5,000 ms vitest kills the test and reports `STACK_TRACE_ERROR`.

**No assertion was ever contradicted, because the test never reached one.** That is exactly why
"a timeout is not a diagnosis" was the right thing to write, and why leaving it carried was right:
the correct next step was to instrument, not to raise the bound.

### The same failure on Linux CI is invisible
`tmpdir()` is `/tmp` on POSIX — **outside** `homedir()` — so `displayOf()` is a no-op, `created.path`
is absolute, `ownedPath()` recognises it, the update reaches the fetch, the stub is entered, the
abort rejects it, and the test passes. The 5,021 ms and the 0 ms are the same test on two path
shapes. **This was a product bug that only Windows could expose** — the same class the stage-6
tilde work already found, reached through a different test.

---

## 3. Evidence ladder — five rungs, one variable each

Every rung was measured, in this order, with the real `tests/card-images.spec.ts` or a byte-copy
of it. Full transcripts under `evidence/stage-6/`.

| Rung | Product `src/storage.ts` | Test fs mock | Test body | Result |
| --- | --- | --- | --- | --- |
| **L0** HEAD `23b925b` | broken (`~/` only) | no `readText` | original | **timed out, 5,020 ms**; hidden rejection: `ctx.fs.readText is not a function` |
| **L1** + fixture fix | broken | `readText` added | original | **still timed out, 5,020 ms**; hidden rejection changed to `ENOENT …\~\AppData\…` |
| **L2** + product fix | fixed | `readText` added | original | **no timeout** — fails in 42 ms at `:178` with `ENOENT …\~\AppData\…` |
| **L3** + body repair | fixed | `readText` added | repaired (this task) | **passes, 37–58 ms** |
| **RED** control | **HEAD copy** (`tmp/probes/storage-head.ts`) | `readText` added | repaired | fails **in 35–43 ms** naming the real error — the guard is red on the defect it was written for |

L1 is the load-bearing rung: **fixing the fs mock did not remove the timeout.** It changed only the
*message of the error hidden underneath it*. Any plan that stopped at the fixture fix would have
declared the timeout "still unexplained" and been wrong about why.

L2→L3 is the second defect, and it is test-side: `created.path` is the display form, and raw node
`fs` does not expand `~` (proved: `readFile('~\\AppData')` → `ENOENT 'D:\…\~\AppData'`). Lines
170/178 were reading and stat-ing through a string that is not a filesystem path on Windows.

---

## 4. The hypotheses in the task, tested rather than assumed

| # | Hypothesis | Verdict | Evidence |
| --- | --- | --- | --- |
| H1 | *"the abort listener is attached after the promise is created / misses an abort that already fired, so it never settles"* | **Disproved as the cause.** The stub's ordering is correct for this test — it attaches its listener before `cancel.abort()` runs. But the general shape is real: with an *already-aborted* signal the product still calls the fetcher, and a listener-only stub never settles (`tmp/probes/abort-semantics.mjs`, E1: fetcher entered with `signal.aborted === true`, then still pending after 800 ms). Not reachable here, because the fetcher is not reached at all. Filed as an observation, not a fix. | `abort-semantics.mjs` |
| H2 | *"an AbortSignal listener leaks and keeps the process alive"* | **Disproved.** `AbortSignal.timeout(10_000)` does not hold the event loop: the probe process exits 56 ms after the last line, not 10 s later. Those timers are `unref`-equivalent. | `abort-semantics.mjs`, H2 line |
| H3 | *"the product does not propagate the signal to `fetchUrl`"* | **Disproved.** `src/images.ts:193-195` passes `withTimeout(options.signal, limits.timeoutMs)` to `options.fetchUrl`. Verified by the fetcher observing `abortedWhenCalled` and by the stub's listener firing at L2/L3. | `abort-semantics.mjs`, `home-location.mjs` |
| H4 | *"it is a slow machine / slow disk"* | **Disproved.** Same body, same machine, only the store's home moved: home **outside** `homedir()` → passes in **67 ms**; home **inside** `homedir()` → hangs. Time is not a variable in it; the *path shape* is. | `cancel-window.probe.spec.ts` |

---

## 5. The two repairs made (test-side, lines 161–203 only)

The fs mock (lines ~40-62) and every other test in the file were left alone; `fixture-fixer` owns
that block.

### A. The gate now fails on the update's own settlement (the structural cause of the phenomenon)

```ts
const outcome = await Promise.race([
  fetching.then(() => undefined),
  call.then(
    () => 'the update resolved instead of waiting for its image' as const,
    (error: unknown) => `the update failed before its image was fetched: ${String(error)}` as const,
  ),
])
if (outcome !== undefined) throw new Error(outcome)
```

If the update fails early, the test now **says so in milliseconds**, with the product's own error
text, instead of waiting out the bound and reporting a sentinel. If it resolves early, that is
also named. Both handlers return, so the raced promise cannot itself become an unhandled
rejection.

### B. The reported display path is resolved before raw node fs sees it

```ts
const cardPath = await ownedPath(join(home, 'visualize'), created.path)
if (cardPath === undefined) throw new Error(`the reported path ${created.path} does not resolve back to a store file`)
const manifest = cardPath.replace(/\.html$/u, '.images.json')
```

`ownedPath` is the product's own resolver — the thing `update` uses — so the test now asserts
*"the path the tool reported resolves back to its file"* rather than *"the display string happens
to be readable as a path"* (true only on POSIX).  The `undefined` branch also makes the round-trip
requirement explicit: if the product ever breaks it again, this test fails at the resolution step
with a sentence that names the problem.

Both changes keep the assertions' strength. Nothing was relaxed; one assertion was **added**
(`cardPath !== undefined`).

**Final state of the task's test:** `pnpm exec vitest run` → passes in 157 ms
(`evidence/stage-6/timeout-full-suite.txt`); whole suite 944 tests, 938 passed, 4 failed, all four
`symlink`/`rename` `EPERM`, **0 timeout-shaped**. Against the same file at HEAD the same test took
5,021 ms and reported `STACK_TRACE_ERROR`.

### Proof the guard is red on the defect (AGENTS.md §6)

`evidence/stage-6/timeout-regression-proof.txt`, using `tmp/probes/storage-head.ts` — a
**temporary copy** of `src/storage.ts` as committed at HEAD, injected by a probe-only vite alias.
`src/storage.ts` itself is owned by `tilde-fixer` and was **not** reverted.

```
RED 1  old body   + HEAD product + 5,000 ms bound -> Test timed out in 5000ms  (5,026 ms), STACK_TRACE_ERROR
RED 2  new body   + HEAD product + 800 ms bound   -> fails in 41 ms:
         the reported path ~\AppData\…\lab-a52c3de7.whale.html does not resolve back to a store file
GREEN  new body   + working tree                  -> 1 passed (6 skipped) in 68 ms
```

RED 2 is the point: the **repaired** test does not merely fail "differently", it fails **125×
faster, at the right line, with a message a human can act on** — while the only change is the
test body.

---

## 6. Is any other test hiding behind the same shape?

Checked, because a mask is worth removing everywhere it exists.

**No second instance.** The audit:

1. **Durations across the whole recorded suite** (`tmp/probes/audit-durations.mjs`, 939 assertions):
   exactly one assertion is at the bound (5,021 ms, this one). Next slowest is **675 ms and
   passing**; nothing else is within 4 s of the timeout. No other failure has a timeout shape.
2. **Gate-then-await idiom, by grep over all 48 spec files**: a *locally constructed* promise
   resolved from inside a stub and awaited by the test body exists in exactly **one** place —
   `card-images.spec.ts:163` (this test). The other manually-constructed promises are all
   different shapes:
   - `images.spec.ts:342-345` races its gate against a 1,500 ms sentinel (`new Promise(done =>
     setTimeout(() => done('still streaming'), 1500))`), so a never-closing response fails as a
     **contradicted assertion**, not a timeout. That is the pattern this test now follows.
   - `images.spec.ts:273/278` await `server.listen`/`server.close` callbacks — bounded by the
     hook timeout, and a failure there reports as *"Hook timed out"*, not a test that passed
     nothing.
   - `run-frame.ts:44` `settle()` is `setTimeout(…, 0)` — always settles.
   - `storage.spec.ts:176` `Promise.all` over 8 `execute` calls is awaited directly; a rejection
     propagates and names itself.
3. **Every `expect(...).rejects` in the suite, read individually.** There are 13, in seven files.
   Twelve build the promise and observe its rejection in the *same expression* (`await
   expect(tool.execute(…)).rejects.toThrow(…)`, or a `readdir`/`lstat` call), so a late
   observation is structurally impossible. The thirteenth is `card-images.spec.ts` — the only
   place in the suite where a promise is created, **an unrelated gate is awaited**, and the
   rejection is observed only afterwards. That is the shape, and it now has a race in front of it.

The one remaining *structural* risk worth naming, though it is not hiding anything today: this
test attaches its rejection handler **only after** the gate. The race in repair A closes that
window; a future test that copies the old shape would reopen it. That is now a comment in the
file, not a convention someone has to remember.

---

## 7. Product observation (not fixed here — `src/` was not mine)

An already-aborted `exec.signal` still starts image resolution: `src/core/legacy-tool.ts` checks
`signal.throwIfAborted()` only **after** `resolveCardImages` returns (line 339), and
`resolveCardImages` (`src/images.ts:108`) never checks at entry. Proved in
`tmp/probes/abort-semantics.mjs`: `execute` with a pre-aborted signal enters the fetcher with
`signal.aborted === true` and (with a listener-only stub) waits until the 10 s image deadline.

Not the cause of this timeout, and not a correctness bug for the shipped fetcher — node rejects an
HTTP request given an aborted signal, so the real path fails fast. But it means a cancelled call
still performs workspace file reads and starts URL fetches it cannot use. The cheap fix is one
line at the top of `resolveCardImages`:

```ts
options.signal.throwIfAborted()
```

Suggested as a separate task; it would also make the product fail a cancelled call deterministically
instead of relying on every fetcher to honour the signal.

---

## 8. Commands run (all reproducible)

Probes are under `tmp/probes/` and are **not** part of the suite:

```
node tmp/probes/cancel-hang.mjs --budget=500          # standalone repro, 500 ms budget
node tmp/probes/open-resolve.mjs                      # ownedPath vs workspacePath on the display path
node tmp/probes/home-location.mjs                     # control: store home inside vs outside homedir()
node tmp/probes/test-body-replica.mjs --watchdog=1200 # instrumented copy of the body, says WHERE it stops
node tmp/probes/abort-semantics.mjs                   # H1 (already-aborted) and H2 (listener leak)
node tmp/probes/tilde-resolve.mjs                     # resolution layer, before/after the tilde fix
pnpm exec vitest run --config tmp/probes/vitest.probe.config.ts tmp/probes/cancel-window.probe.spec.ts
                                                      # the control experiment: home inside vs outside homedir()
pnpm exec vitest run tests/card-images.spec.ts -t "leaves the card untouched"
pnpm run typecheck
pnpm exec vitest run                                  # full suite, transcript in this directory
```

Recorded transcripts for each rung and for the regression proof:

| File | What it holds |
| --- | --- |
| `timeout-repro-at-head.txt` | L1: the real spec at the real 5 s bound, product at HEAD — timed out at 5,020 ms, with the hidden rejection printed below the headline |
| `timeout-control-experiment.txt` | machine-speed hypothesis disproved: same body, store home inside vs outside `homedir()`; plus the hang reproduced against a HEAD copy of `storage.ts` |
| `timeout-matrix.txt` | the four rungs L0→L3, one variable each |
| `timeout-regression-proof.txt` | RED 1 (old body, 5,026 ms timeout) / RED 2 (new body, fails in 41 ms naming the cause) / GREEN |
| `timeout-verification.txt` | `pnpm run typecheck` exit 0 and the spec after the repair |
| `timeout-full-suite.txt` | one full-suite run with the tree hashed before and after |

`tmp/probes/vitest.probe.config.ts` is a **probe-only** config (the project's `vitest.config.ts` is
untouched). It supports `PROBE_STORAGE=head|fixed`, which swaps `src/storage.ts` for a copy so the
red proof can be produced without reverting another agent's work.

---

## 9. What should change in the documents

| Document | What is now wrong in it |
| --- | --- |
| `docs/testing/FAILURE-ADJUDICATION.md` §5 C2 and recommendation R1 | "one 5 s timeout has no diagnosis", "weakest of the fifteen", "raise the bound or find what stalls": the diagnosis exists and the bound must **not** be raised. C2 should become *diagnosed — product tilde bug + unawaited rejection in the test*, and R1 closed. |
| `docs/testing/PLATFORM-FAILURES.md` §5 | "it is a slow-machine timeout, not a contradicted assertion, and raising the bound may be the whole fix" — both halves are wrong; it was a 39 ms failure. |
| `tools/classify-failures.mjs:50-51` | The `timeout` cause text says *"a slow-machine timeout… the test simply did not finish"*. That classification will mislead the next reader the same way. |
| `CHANGELOG.md:118`, `session-log.md` | "one 5,020 ms timeout has no diagnosis yet" — it has one now. |
| `docs/reports/PHASE-5-FINAL-GATE.md` C2 | Same. The caveat can be retired, with a pointer here. |

I have not edited any of these: they are not in this task's scope and the Lead is coordinating the
stage-6 document pass.
