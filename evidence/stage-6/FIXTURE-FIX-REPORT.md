# task-7 — the two test-fixture defects: what changed and the proof

Author: fixture-fixer.  Date: 2026-11-06.  HEAD at the time of the run: `23b925b`
(v0.1.0). Scope owned: `tests/card-images.spec.ts` (fs fake only), `tests/tool.spec.ts`,
`evidence/stage-6/`. No file under `src/` was touched by this task.

The rule this document answers to is AGENTS.md §6: *prove a regression test can fail.*
Each defect below therefore has a **red** observation, a **green** observation, and — for
the rewritten assertion — a deliberate re-introduction of the defect that was seen to fail
the new test before the fix was restored.

---

## D1 — the fs fake in `tests/card-images.spec.ts` did not implement `readText`

### What was wrong
The `host()` fake at `tests/card-images.spec.ts` implemented `resolve`, `contains`,
`stat` and `readBytes` — but not `readText`. `readText` is a real method of the host
fs seam, not something the product invented:

```
node_modules/@deepseek-ai/dsh-fs/lib/types/index.d.ts:162
  abstract readText(target: FsTarget, signal?: AbortSignal): Promise<string>
```

`src/storage.ts:457` reads a legacy workspace card through it. So the fake was
**incomplete**, and the product's call was correct. This is a fixture defect.

### Red (before)
`tests/card-images.spec.ts` → *re-reads workspace files and carries fetched URLs on update*:

```
TypeError: ctx.fs.readText is not a function
 ❯ Object.read src/storage.ts:457:40
 ❯ execute src/core/legacy-tool.ts:268:29
```
Transcript: `evidence/stage-6/fixtures-before-raw.txt`.

### The fix
One method added to the fake, implemented the way `readBytes` already was — read the
real file behind `targetKey`, return it decoded as UTF-8. No assertion was changed, and
`src/storage.ts` was not touched.

### Isolated proof that the fake was the cause
`evidence/stage-6/prove-fs-mock-readtext.mts` drives the product's own
`cardStore(...).open('viz/a.html')` twice — once with the old fake, once with the fixed
one — and prints what each does:

```
READ FAILED  | old (readText missing)       | ctx.fs.readText is not a function
READ OK      | fixed (readText present)     | <div>legacy card</div>

PROOF OK: the incomplete fake crashed; the completed fake returns the card the real seam returns.
```

### Green (after), and what it now proves
With the fake completed, the `TypeError` is gone. What the test reaches instead is the
**real** defect the fixture had been hiding — an `ENOENT` on a path with a literal `~`
segment inside the workspace (`<workspace>\~\AppData\Local\Temp\viz-home-…`), which is
the tilde round-trip bug owned by task-6. Transcript:
`evidence/stage-6/fixtures-d1-after-mock-raw.txt`.

That is the correct outcome for a fixture fix: the fixture stopped lying, and the product
bug behind it became visible instead of being masked by a `TypeError`. That intermediate
snapshot is `evidence/stage-6/fixtures-d1-after-mock-raw.txt`: 5 failed / 2 passed.

**Not fixed here on purpose — they are other owners' defects, and they did get fixed by
their owners.** In the final run (task-6's `src/storage.ts` round-trip fix and task-8's
cancellation-test repair both landed) the file is **1 failed / 6 passed**, and the one
failure left is the Windows `EPERM` on `symlink` — genuine platform behaviour on a box
without `SeCreateSymbolicLinkPrivilege` (verified independently: a plain
`New-Item -ItemType SymbolicLink` also fails). None of the original five was a fixture
defect, and none was papered over.

---

## D2 — the description assertion could not parse the sentence it was checking

### The diagnosis changed from the task brief, and it matters
The brief proposed either (a) registering a skill provider in the fixture, or (b) asserting
what is actually guaranteed. **Both were wrong**, because the premise was wrong:
`SKILL_BODY_PATH` is a compile-time constant (`src/skill.ts:28`), not something a skill
provider supplies. The description does name the file, with an empty `Context`:

```
... read the same contract from D:/work/dsh-plugin-visualize\assets\visualize-skill.md
    (its relative paths resolve against D:/work/dsh-plugin-visualize\assets\) ...
```

The failure was the assertion's own regex: `(\S+\.md)` cannot match a path containing a
space, and this checkout lives at `D:\Deepseek WorkSpace\…`. Proof
(`evidence/stage-6/prove-description-assertion.mts`):

```
OLD REGEX on the real description -> undefined
OLD REGEX with the space removed -> D:/work/dsh-plugin-visualize\assets\visualize-skill.md
```

So the old test was passing only on checkouts whose path has no space. It was not a
statement about the product at all.

### The fix — stronger, not weaker
The assertion now captures the whole path and then requires, in order:

| Check | Why it is what the sentence promises |
| --- | --- |
| the sentence names a `.md` file | the whole point of the clause |
| the path is absolute | usable from any working directory |
| the path exists and is a regular file | it is the *shipped* contract |
| its directory is a real directory | the parenthetical promise |
| `references/charts.md`, `references/design.md`, `examples/interactive-simulator.html` exist under it | the relative references the sentence says resolve there |
| `do not search for it anywhere else` is present | the original surviving assertion, unchanged |

### Red → green → red → green (AGENTS.md §6)
1. **Red at HEAD:** `AssertionError: expected undefined to be defined`
   (`evidence/stage-6/fixtures-before-raw.txt`).
2. **Green after the fix:** 7/7 in `tests/tool.spec.ts`
   (`evidence/stage-6/fixtures-d2-tool-after-raw.txt`).
3. **Red again, on purpose:** the old weak regex was put back into the spec and the suite
   re-run — `AssertionError: the description must name the contract file: expected null
   not to be null`, 1 failed / 6 passed (`evidence/stage-6/fixtures-d2-mutation-red-raw.txt`).
   The fix was then restored and the suite re-run green.
4. **Three further reintroduced defects** were fed to the same assertion in
   `evidence/stage-6/prove-description-assertion.mts` — no contract sentence, a mistyped
   path, a dropped resource-dir clause — and **all three went red** while the real
   description stayed green.

---

## Commands actually run, and their results

| Command | Result |
| --- | --- |
| `npx vitest run tests/card-images.spec.ts tests/tool.spec.ts` (**before**) | **6 failed / 8 passed (14)** — `evidence/stage-6/fixtures-before-raw.txt` |
| `npx vitest run tests/card-images.spec.ts tests/tool.spec.ts` (after D1+D2, tilde fix not yet in) | **5 failed / 9 passed (14)** — `evidence/stage-6/fixtures-after-raw.txt` |
| `npx vitest run tests/card-images.spec.ts tests/tool.spec.ts` (**final**, with task-6's fix also in the tree) | **1 failed / 13 passed (14)** — `evidence/stage-6/fixtures-final-raw.txt` |
| `npx vitest run tests/tool.spec.ts` | **7 passed (7)** |
| `npx tsc -p tsconfig.json` | **exit 0** |
| `node evidence/lib/redact.mjs evidence/stage-6/…` | every transcript redacted before it stayed in the tree |

### The single remaining `card-images.spec.ts` failure is the Windows platform baseline

```
Error: EPERM: operation not permitted, symlink 'C:/Users/<user>\AppData\Local\Temp\viz-ws-…\secret.png'
 -> 'C:/Users/<user>\AppData\Local\Temp\viz-home-…\visualize\sessions\sess-1\images\02a3e298….png'
```

That is the `SeCreateSymbolicLinkPrivilege` baseline defect recorded in
`docs/testing/TEST_PLAN.md` — the test cannot create the symlink it needs to prove the
image route refuses one, so it errors before asserting anything. It is **not** a fixture
defect that a fixture change can repair, and relaxing or skipping it would be exactly the
failure mode AGENTS.md §6 warns about, so it is left red and named here instead.

## Files touched by this task

- `tests/card-images.spec.ts` — the `readText` method on the `host()` fake **only**
  (frozen after the Lead partitioned the file; test bodies in it belong to task-6/task-8).
- `tests/tool.spec.ts` — the description assertion.
- `evidence/stage-6/fixtures-*`, `evidence/stage-6/prove-*`, `evidence/stage-6/diag-desc.mts`.
