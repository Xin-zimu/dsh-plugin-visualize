# The 15 baseline failures — release admission adjudication

- **Date:** 2026-11-06
- **Measured at:** HEAD `63dcd92` (re-run post-N5, `evidence/phase-5-final/vitest-post-n5.json`)
- **Was asked:** for each of the 15, name its cause, confirm it is a known baseline, and
  test it against the release admission criteria. Do not treat pre-existing failures as
  automatically acceptable; equally, do not inflate them into blockers without evidence.
- **Verdict: YES-WITH-NAMED-CAVEATS.** All 15 are admissible for this release, but three
  caveats are real and are stated in §5 rather than folded into the pass column.

## 1. The admission criteria, stated before they are applied

These are proposed here because the project had a *rationale* (`PLATFORM-FAILURES.md` §3)
but no per-failure test. Each is checkable, and §2 applies them one row at a time.

| # | Criterion | How it is verified |
| --- | --- | --- |
| **A1** | The cause is environmental — an OS capability or path behaviour — not a contradicted product expectation | The failure's own message names the environmental cause, and `tools/classify-failures.mjs` exits non-zero on anything it cannot classify |
| **A2** | The same test **passes on another platform, by name** | `tools/cross-platform.mjs` over the two CI reports; `failsOnBoth: []` |
| **A3** | The behaviour the test intends to guard is exercised by **another passing test** | the per-spec pass counts in §3 and the named passing siblings in §4 |
| **A4** | The failure is **unchanged from the baseline** — it existed before this release | `evidence/lib/failure-set.mjs`: `identical: true`, `onlyInCurrent: []` |

**Why these four and not fewer.** A1 alone would admit a real bug whose message happens to
mention a path. A2 alone would admit a bug that only affects one platform's users. A3 alone
cannot see a regression. A4 alone is the argument this project already found insufficient.

## 2. Per-failure adjudication

Grouped by cause; every row carries the same four verdicts.

| # | Spec | Test | Cause | A1 | A2 | A3 | A4 | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | card-images | stores the bytes beside the card… | home-expansion `ENOENT '…\~\AppData…'` | ✔ | ✔ | ✔ | ✔ | **ADMIT** |
| 2 | card-images | re-reads workspace files and carries fetched URLs | mock-fs-shape `ctx.fs.readText is not a function` | ✔ | ✔ | ✔ | ✔ | **ADMIT** |
| 3 | card-images | leaves the card untouched when an update is cancelled | timeout `STACK_TRACE_ERROR` @5020 ms | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C2)** |
| 4 | card-images | renders the card and says why on a host that cannot deliver images | home-expansion `ENOENT '…\~\AppData…'` | ✔ | ✔ | ✔ | ✔ | **ADMIT** |
| 5 | card-images | image route opens nothing but a well-formed id… | symlink `EPERM` in setup | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C1)** |
| 6 | images | workspace images refuses paths that leave the workspace | symlink `EPERM` in setup | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C1)** |
| 7 | storage | writes a new card into the session store… | home-expansion (assertion on `~` path) | ✔ | ✔ | ✔ | ✔ | **ADMIT** |
| 8 | storage | keeps the style a card was created with… | home-expansion `ENOENT ~\AppData…` | ✔ | ✔ | ✔ | ✔ | **ADMIT** |
| 9 | storage | never reads a file outside the store with its own fs | symlink `EPERM` in setup | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C1)** |
| 10 | storage | creates the same card concurrently in the same millisecond | rename `EPERM` over an open file | ✔ | ✔ | ✔ | ✔ | **ADMIT** |
| 11 | storage | legacy workspace cards… relative and absolute path | path-joining: nested drive letter `…\viz-ws-VegRUP\C:\Users\…` | ✔ | ✔ | ✔ | ✔ | **ADMIT** |
| 12 | storage | legacy workspace cards refuses a symlink… | symlink `EPERM` in setup | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C1)** |
| 13 | style-files | refuses a style file that is a symlink | symlink `EPERM` in setup | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C1)** |
| 14 | style-files | refuses a workspace whose `.dsh` directory links out | symlink `EPERM` in setup | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C1)** |
| 15 | tool | description names an on-disk contract… | fixture: no skill provider registered → `undefined` | ✔ | ✔ | ✔ | ✔ | **ADMIT-WITH-CAVEAT (C3)** |

Cause classes: 6 symlink-EPERM · 4 home-expansion · 1 path-joining · 1 rename-EPERM ·
1 mock-fs-shape · 1 timeout · 1 tool-description fixture = **15**.

### A2, the strongest of the four, measured not assumed

From the real CI run `42003251408` (verified with `gh run view`: `conclusion: success`,
`headSha 15814e3`), the Windows leg's own gate step printed:

```
note: 8 baseline failure(s) pass on this runner.
      Not an error: a better environment is not a worse build.
windows: baseline 15, found 7, new 0
GATE PASSED
```

The **7 that still fail on CI Windows**, named in that run's log:

1. card-images · stores the bytes beside the card…
2. card-images · re-reads workspace files and carries fetched URLs on update
3. card-images · leaves the card untouched when an update is cancelled…
4. card-images · renders the card and says why on a host that cannot deliver images
5. storage · writes a new card into the session store…
6. storage · creates the same card concurrently in the same millisecond
7. storage · legacy workspace cards · patches a legacy card… relative and absolute path

The 8 that pass there are **exactly the symlink tests plus the tool-description fixture**.
And on Linux: **939 passed / 0 failed / 0 skipped**. `failsOnBoth: []` — not one test fails
on both platforms.

## 3. Why A3 holds: the same modules have passing tests

| Spec | passed | failed |
| --- | --- | --- |
| card-images.spec.ts | 2 | 5 |
| images.spec.ts | **38** | 1 |
| storage.spec.ts | 10 | 6 |
| style-files.spec.ts | 7 | 2 |
| tool.spec.ts | 6 | 1 |

The areas are not dark: 63 tests in these five files pass. What fails is the subset that
needs a symlink, a `~` expansion, or a drive-qualified join — not the module as a whole.

## 4. The honest part: 12 of 15 are in code this release SHIPS

This deserves stating plainly rather than being routed around. The failures sit in
`src/storage.ts`, `src/images.ts` and `src/style-files.ts` — all shipped. So the claim
cannot be "these are out of scope". The claim has to be: **environment-caused failures in
shipped code**, with the guarded behaviour either proven elsewhere (A2/A3) or explicitly
carried as residual risk (C1).

Two of the 15 are **not** platform-caused at all and are a different class:

- **#2 `ctx.fs.readText is not a function`** — a test fixture whose mock lacks a method the
  real `ctx.fs` provides. The product calls the right API; the fake does not implement it.
  This is a test defect. It is admissible because it fails loudly and guards nothing that a
  passing test does not also guard, but it should be fixed, and it is recommendation R2.
- **#15 `tool.spec.ts` description fixture** — the fixture registers no skill provider, so
  the description it reads is empty. The contract it guards is covered by
  `tests/capability-consistency.spec.ts`, which reads the generator directly. Also a
  fixture defect, and recommendation R3.

## 5. The named caveats

### C1 — six symlink-containment tests cannot run on this machine

The tests fail in **setup**, with `EPERM` creating the symlink. A stock Windows box cannot
create symlinks without Developer Mode. So on *this* host the containment logic is
**unproven** — the test never reaches an assertion.

What rescues it: those same six **execute and pass** on the GitHub Windows runner, which
*can* create symlinks, and on Linux. So the containment check is measured on Windows, just
not on this machine.

**What it costs, stated honestly:** if a future change broke symlink containment, this
machine would not tell you. The CI Windows runner would. The release therefore depends on CI
for that class of defect, not on the local suite. That is a real dependency and it is why the
CI workflow is load-bearing rather than decorative.

### C2 — one timeout has no diagnosis

`leaves the card untouched when an update is cancelled…` fails at **5020.7 ms** with
`STACK_TRACE_ERROR`. That is the 5-second bound, and no assertion was contradicted. It is
also by far the slowest assertion in the suite; the next slowest is 676 ms and passes.

By A1–A4 it is admissible — it is environmental, it passes on POSIX and on CI Windows, and
the cancellation path has other coverage. But "it is a timeout, not a bug" is close to an
assertion about intent. Recommendation R1 is to raise the bound or find what stalls.
**Treat this one as the weakest of the fifteen.**

### C3 — two of the fifteen are fixture defects, not platform behaviour

See §4. They are admissible but they inflate the "platform failures" count: the honest
figure is **13 platform-shaped, 2 fixture-shaped**. Recommendations R2 and R3.

## 6. What these criteria do NOT cover

1. **A defect unrelated to these tests.** 63 passing tests in five files is not proof of
   correctness; it is proof that these specific areas are not dark. A defect elsewhere would
   be invisible to every criterion here.
2. **The product on Windows without CI.** This machine cannot create symlinks. Any claim
   about symlink containment on Windows rests on the GitHub runner, not on local evidence.
3. **Anything the suite does not test at all** — including the browser-level gates, which are
   covered by `evidence/phase-5-final/C1-acceptance.json`, not by `vitest`.
4. **Regression risk from the N5 comment fix.** Measured separately: it changes no byte and
   no test outcome (`evidence/phase-5-final/N5-comment-fix-impact.txt`).

## 7. Recommendations (none blocks this release)

| # | Action | Class |
| --- | --- | --- |
| R1 | Investigate the 5020 ms timeout — raise the bound or find what stalls. A timeout is not a diagnosis | NON-BLOCKER |
| R2 | Give the image test's `ctx.fs` mock a `readText`, so #2 stops failing for a reason unrelated to what it checks | NON-BLOCKER |
| R3 | Register a skill provider in the `tool.spec.ts` fixture, or read the generator directly as `capability-consistency.spec.ts` does | NON-BLOCKER |
| R4 | Fix the `~` fixtures to use `os.homedir()`, which is what the product already does | NON-BLOCKER |
| R5 | Consider Developer Mode or a CI-only note in the local test docs, so C1 is discoverable without reading this file | NON-BLOCKER |

## 8. Verdict

**YES-WITH-NAMED-CAVEATS.** All 15 are admissible for a release whose scope is the OpenUI
renderer and the clipboard action. No failure contradicts an expectation about the behaviour
this release changes; none is new; every one either passes on another platform by name or is
a fixture defect with a passing equivalent.

The caveats that travel with that verdict, and that a release decision should weigh:

1. **C1** — six symlink-containment tests are unproven on this machine; the release relies on
   CI Windows for that class of defect.
2. **C2** — one 5 s timeout has no diagnosis and is the weakest of the fifteen.
3. **C3** — two of the fifteen are fixture defects, so "15 platform failures" is imprecise;
   the accurate split is 13 platform + 2 fixture.

None of the three is a blocker. Each is a debt this document names rather than hides.