# Stage 6 — three product defects, found by investigating "platform failures"

Date: 2026-11-06. Head at the start of the round: 23b925b (v0.1.0).

Stage 5 adjudicated 15 Windows failures as 13 platform-shaped + 2 fixture defects, and
accepted them. Investigating them properly found **three real product defects** and
**one false accusation** among those classifications. The lesson is not that the
adjudication was dishonest; it is that classifying failures by their error message
produces stable, confident, and wrong conclusions.

---

## Defect 1 — the `~` round trip is broken on Windows

`displayOf()` (`src/storage.ts:429-432`) emits `~` + the path remainder, which on
Windows begins with a backslash: `~\AppData\Local\Temp\...`. Its consumers
(`:150`, `:219`) accepted only `~` or `~/`. **The tool handed back a path it would
refuse.**

Reachable by any Windows user whose DSH home or workspace sits under their home
directory, which is the normal case.

**Why Linux CI could not see it:** `tmpdir()` is `/tmp` on POSIX, outside `homedir()`,
so `displayOf()` is a no-op for every temp-based path. On Windows `tmpdir()` is inside
`homedir()`, so every temp path is shortened and the bug fires. Same test, different
path shape. The tests were correct; the product was not.

## Defect 2 — the 5,020 ms "timeout" was a 39 ms failure wearing a mask

It was never slow. The chain:

1. `created.path` is the `~` display form, and the test hands it straight back as
   `update.path`.
2. `ownedPath()` refused it, then `workspacePath()` **accepted** it as a
   workspace-relative path, because the literal `~` directory appears inside the
   workspace. The update was misrouted into the legacy workspace branch and died there.
3. `resolveCardImages` was never reached, so the test's `fetchUrl` stub was never
   called, so the promise the test awaited could never settle.
4. The update had already rejected, but nothing awaited it until after the gate. It
   surfaced only as an unhandled rejection while vitest killed the test at its bound.
5. `STACK_TRACE_ERROR` is vitest's own sentinel for a timeout, which overwrites the
   useful message in the JSON reporter. **The real error was printed in the same output,
   under "Unhandled Errors", and was ignored for two stages.**

Control: identical test body, only the store home moved. Outside `homedir()` it passes
in 47 ms; under `homedir()` it waits out the bound. Machine speed was never a variable.

**Stage 5 wrote "a timeout is not a diagnosis". That was right, and the diagnosis had
been sitting in the output the whole time.**

## Defect 3 — a cancelled call still does the work

`legacy-tool.ts:339` calls `signal?.throwIfAborted()` **after**
`resolveCardImages(...)` returns, and `resolveCardImages` (`images.ts:108`) never
checks at entry. So a call cancelled before it starts still performs workspace reads,
starts image fetches, and **writes to the image store** — then discards the result.

Reproduced (`tmp/probes/abort-entry.mts`), with a signal already aborted before the
call:

    signal.aborted at entry : true
    fetcher was entered     : true
    images stored           : 1
    failures                : []

Not a security hole — the work is bounded and the result is thrown away — but it is
wasted I/O on a path whose entire purpose is to stop early.

## The false accusation — the tool description test

Classified in Stage 5 as a fixture defect: "no skill provider registered, so the
description cannot name the contract". **Both halves of that were wrong.**

`SKILL_BODY_PATH` is a compile-time constant (`src/skill.ts:28`); no provider affects
it, and the description *does* name the file. The assertion's `(\S+\.md)` simply cannot
match a path containing a space, and this checkout is `D:\Deepseek WorkSpace\...`. The
test only ever passed on space-free checkouts — it was never a statement about the
product.

Replaced with a **stronger** assertion: the captured path must be absolute, exist, be a
regular `.md`, and its directory must contain the three relative references the
sentence promises. Nothing was relaxed.

---

## What this means for the failure taxonomy

| Stage 5 label | Reality |
| --- | --- |
| 6 symlink tests, platform | platform — **confirmed**, capability genuinely absent (except one that was a directory link, now covered via a junction) |
| 4 `~` path failures, platform | **product defect 1** |
| 1 timeout, platform | **product defect 2**, and the mask came from a test shape |
| 1 rename EPERM, platform | **product defect 3-adjacent**: distinct temps are not enough on Windows; concurrent renames to one destination return EPERM. The code comment asserting otherwise was wrong |
| 1 fs mock, fixture | fixture, **confirmed** — `readText` is a real API |
| 1 description fixture, fixture | **false accusation**: the assertion was mis-written |

Three of the five "platform" causes were product bugs. The pattern: an error message
that names an OS mechanism reads as environmental even when the product is what put it
in that position.

## Regression guards

Each fix has a test seen red first, recorded under `evidence/stage-6/`:

| Fix | Guard | Red proof |
| --- | --- | --- |
| `~` round trip | `storage.spec.ts` native-separator round trip | `tilde-red-without-fix.txt` |
| timeout mask | race the update's settlement in the cancellation test | `timeout-regression-proof.txt` |
| description assertion | stronger path capture | `fixtures-d2-mutation-red-raw.txt` |
| fs mock | isolated probe over `cardStore().open()` | `prove-fs-mock-readtext.mts` |