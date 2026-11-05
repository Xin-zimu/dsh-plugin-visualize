# Stage 5 re-verification — measured at HEAD `63dcd92`

- **Date:** 2026-11-06
- **Measured by:** `audit-runner` (MEASURER; no product code, ADR or doc edited)
- **Baseline audited by `docs/reports/PHASE-5-AUDIT.md`:** `8db9598`
- **Measured HEAD:** `63dcd92e64b31ee740267b8043f33fb5c9eb686a`
- **Host:** Windows 11, Node v24.22.1, vitest 4.1.10 win32-x64
- **Verdict: AUDIT NEEDS REVISION** — every *test and type* number reproduces exactly;
  one *build-size* claim in §1.1 is factually wrong (see Finding F1).

Every number below came from a command run in this session. The raw output of each
is a file in this directory, named in the step it belongs to.

---

## 0. The claim "nothing since the baseline touched product code" is FALSE

The task brief said the five commits after `8db9598` "none should touch product
code". Verified with `git diff --stat 8db9598..HEAD -- src tests tools`:

```
 src/client/OpenUICard.tsx            |  86 ++++++++++++++++++++++++++++++++++
 tests/capability-consistency.spec.ts | 114 +++++++++++++++++++++++++++++++++++
 tests/openui-clipboard-4b.spec.tsx   |  28 +++++++++
 tools/assert-platform-result.mjs     | 103 +++++++++++++++++++++++++++++++
 tools/capability-matrix.mjs          |  60 ++++++++++++++++++
 tools/classify-failures.mjs          | 114 +++++++++++++++++++++++++++++++++++
 tools/cross-platform.mjs             |  84 ++++++++++++++++++++++++++
 7 files changed, 589 insertions(+)
```

Raw: `00-env.txt`. Product code **was** touched: `src/client/OpenUICard.tsx` +86 lines
(the `RefusedButton` notice), plus 142 lines of tests. All of it landed in
`6b26aab`, the same commit that added the audit — not in the three commits the brief
named.

**The claim that actually holds, and is stronger**, is against the audit commit:

```
git diff --stat 6b26aab..HEAD -- src tests      -> EMPTY
git rev-parse HEAD:src   = 94937f4b2f3f8bb8e2f7b7bc80459d81e02a2b59
git rev-parse 6b26aab:src= 94937f4b2f3f8bb8e2f7b7bc80459d81e02a2b59   (IDENTICAL)
git rev-parse HEAD:tests = git rev-parse 6b26aab:tests               (IDENTICAL)
6b26aab..HEAD -- tools -> only the 2 new CI comparison scripts (187 insertions)
6b26aab..HEAD -- docs  -> README, PHASE-5-AUDIT, PLATFORM-FAILURES, session-log
```

So: since the audit commit, **`src/` and `tests/` are byte-identical to HEAD**, and the
only `tools/` change is two read-only CI helpers. That is why re-measuring is
meaningful — but the reason is `6b26aab`, not "none touched product code".

`git merge-base --is-ancestor 8db9598 HEAD` -> exit 0, so the baseline is an ancestor.

---

## 1. `npx tsc -p tsconfig.json` — PASS

```
npx tsc -p tsconfig.json
EXIT=0
```

Raw: `01-tsc-node.log` (8 bytes: only the exit line; `tsc` printed nothing).

## 2. `npx tsc -p tsconfig.client.json` — PASS

```
npx tsc -p tsconfig.client.json
EXIT=0
```

Raw: `02-tsc-client.log` (8 bytes).

Both tsconfigs were changed in `6b26aab` to add `tests/capability-consistency.spec.ts`
to the appropriate include/exclude lists; no compiler option changed.

---

## 3. `npx vitest run` — 924 passed / 15 failed / 939 total

```
npx vitest run --reporter=json --outputFile=evidence/phase-5-rc2/vitest.json
VITEST_EXIT=1          (non-zero because the 15 documented Windows failures are red)
DURATION_SECONDS=20.8
```

Run **once**. Raw: `vitest.json` (306,799 bytes), `03-vitest-timing.txt`,
`03-vitest-stdout.log`.

### Counts, derived from the JSON and asserted to close (`derive-counts.mjs`)

| Quantity | Value |
| --- | --- |
| `numTotalTestSuites` (assertions) | 247 |
| `numPassedTests` | **924** |
| `numFailedTests` | **15** |
| `numPendingTests` (skipped) | **0** |
| `numTodoTests` | 0 |
| `numTotalTests` | **939** |
| `numPassedTestSuites` / `numFailedTestSuites` | 235 / 12 |
| spec files walked | 48 |

```
COUNTS CLOSE: 924 passed + 15 failed + 0 skipped + 0 todo = 939 ; numTotalTests = 939 ; equal = true
assertion results walked: 939   statuses: {"passed":924,"failed":15}
```

Raw: `04-vitest-counts.txt`. **Identical to the audit's §1.1 row** (924/15/939).
Zero skips — the suite is not green by exclusion.

### Failure set vs the published baseline — MATCH, name for name

```
node evidence/lib/failure-set.mjs evidence/phase-5-rc2/vitest.json
{ "counts": { "passed":924, "failed":15, "pending":0, "todo":0, "total":939, "sum":939, "closes":true },
  "failureSet": { "baseline":15, "current":15, "identical":true },
  "onlyInBaseline": [], "onlyInCurrent": [], "verdict": "MATCH" }
EXIT=0
```

Raw: `06-failure-set.txt`. The 15 baseline names it compares against are listed in
`17-baseline-failure-names.txt`; the 15 current names are in `05-failing-tests.json`.
**`onlyInCurrent` is empty: no test is failing now that was not failing at baseline.**
That is the specific claim the brief asked for, and it is measured, not inferred.

*Caveat on the baseline artefact:* `evidence/publish/test-before-publish.txt` is dated
2026-11-04 and records **764** tests (`15 failed | 749 passed`), while the suite is now
**939**. The comparison is therefore on the failure **name set** only — valid for
"did anything new break", not a claim that the totals are unchanged history.

### Root-cause classification — 15/15 classified, 0 blocking

```
node tools/classify-failures.mjs evidence/phase-5-rc2/vitest.json
"unclassified": [], "blocking": 0
byCause: symlink-EPERM 6, home-expansion 4, path-joining 1,
         rename-EPERM 1, mock-fs-shape 1, timeout 1, tool-description 1
EXIT=0
```

Raw: `07-classify-failures.txt`. This reproduces the `docs/testing/PLATFORM-FAILURES.md`
table **cause for cause** (6/4/1/1/1/1/1 = 15). The classifier exits non-zero on any
unclassified failure, so this is a check, not a summary.

Measured detail on the timeout (the one failure whose message is opaque): duration
**5020.7 ms**, message `Error: STACK_TRACE_ERROR`. It is the 5 s bound, and no
assertion was contradicted — consistent with docs §2.3. It is also by far the slowest
assertion in the suite (next slowest: 676 ms and passing).

**A matching failure set proves the change added no failure. It does not make these
15 harmless** — six of them are the symlink-containment tests, and they did not run
here (Windows refuses `fs.symlink` without Developer Mode). That is unproven on this
host, exactly as the audit says.

---

## 4. Build — `npx tsdown` — PASS, deterministic

```
npx tsdown
[ CJS] lib\client.js  450.56 kB | gzip: 119.60 kB
[ CJS] 1 files, total: 450.56 kB
[ ESM] lib\index.js   241.06 kB | gzip:  73.98 kB
[ ESM] lib\index.d.ts 10.07 kB  | gzip:   3.81 kB
[ ESM] 2 files, total: 251.13 kB
TSD_OWN_EXIT=0
```

Raw: `08-build.log`. Output directory is **`lib/`** (per `tsdown.config.ts`,
`outDir: 'lib'` for both presets); there is no `dist/`. `lib/` is gitignored
(`.gitignore: /lib/`), so it is build output, not a committed artefact.

| File | Bytes | kB (decimal) |
| --- | --- | --- |
| `lib/client.js` | **450,559** | 450.56 |
| `lib/index.js` | 241,055 | 241.06 |
| `lib/index.d.ts` | 10,071 | 10.07 |

- **`lib/client.js` SHA-256:**
  `E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB`
- **Deterministic:** a second `npx tsdown` produced the identical hash
  (`DETERMINISTIC: True`). The hash is also unchanged from the pre-existing
  `lib/` that was on disk before this build.

### FINDING F1 — the audit's "251.13 kB" measures the wrong file

`docs/reports/PHASE-5-AUDIT.md` §1.1 line 23 records:

```
| Build | `lib/client.js` 251.13 kB |
```

`lib/client.js` is **450,559 bytes = 450.56 kB**. 251.13 kB is neither it nor
`lib/index.js` (241.06 kB). The origin is now proven from tsdown's own stdout:

```
[ ESM] lib\index.js    241.06 kB
[ ESM] lib\index.d.ts   10.07 kB
[ ESM] 2 files, total: 251.13 kB      <-- this line
```

`241,055 + 10,071 = 251,126 bytes = 251.13 kB.` Exact to the printed digit.

So this is **possibility (b) from the brief — the figure measured something else
entirely — and that something is mislabelled.** It is the **ESM/node-half total
(`index.js` + `index.d.ts`)**, reported by tsdown as its per-preset summary, and the
audit table attributes it to `lib/client.js`. The same mislabel already exists one
report earlier, in `docs/reports/PHASE-4B-REPORT.md` line 167 — and is corroborated
there by `session-log.md:938`, which records `lib/index.js 240.42 kB` at that time;
`240.42 + ~10.7 = ~251.1`. The error has been copied forward, not re-measured.

It is not an internal inconsistency the audit could have caught by checking itself:
its next row claims bundle hash `E1BF4A82…`, which *is* the 450,559-byte client
bundle. The size and the hash describe two different files.

**Correction needed** (I did not make it — I am the measurer): both tables should read
`lib/client.js 450.56 kB` and, if the ESM total is wanted, it should be labelled
`lib/index.js + lib/index.d.ts 251.13 kB (tsdown ESM total)`.

---

## 5. `npx vitest run tests/capability-consistency.spec.ts` — PASS

```
 ✓ tests/capability-consistency.spec.ts (10 tests) 5ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
EXIT=0
```

Raw: `09-capability-consistency.log`. Matches the audit's "10 tests".

**Re-run after a concurrent edit to a document the gate reads.** The gate does
`readFileSync('docs/specifications/COMPONENT_CATALOG.md')`; that file was being
rewritten by another session at 02:53:39 while I was measuring. I re-ran at 02:55:41
with the catalogue SHA-256 identical before and after the run
(`7FAC1B8E57388E0C…`), plus `skill-actions-consistency.spec.ts`: **14 passed (14)**,
exit 0. Raw: `09b-capability-consistency-rerun.log`, `13-docs-state-at-measure.txt`.

### Docs-vs-code matrix (supporting, `npx unrun tools/capability-matrix.mjs`)

```
components: declared 48, rendered 48, missing [], extra [], status "Supported"
functions:  declared 73
actionsUnclassified: [], actionsInBothSets: []
@OpenUrl -> Deferred, @ToAssistant -> Deferred
@Set/@Reset/@Action/@CopyToClipboard -> Supported
EXIT=0
```

Raw: `12-capability-matrix-unrun.txt`. Confirms the audit's "48/48 components, 73
functions". (Plain `node tools/capability-matrix.mjs` fails with
`ERR_UNKNOWN_FILE_EXTENSION` on the `.tsx` import — it must be run through `unrun`;
recorded in `12-capability-matrix.txt`.)

---

## 6. The two Deferred actions — refusal path still works

```
npx vitest run tests/openui-clipboard-4b.spec.tsx tests/openui-actions.spec.tsx
 ✓ tests/openui-clipboard-4b.spec.tsx (21 tests) 106ms
 ✓ tests/openui-actions.spec.tsx     (24 tests) 105ms
 Test Files  2 passed (2)
      Tests  45 passed (45)
EXIT=0
```

Raw: `10-refusal-path.log`.

Re-run **after** the Lead's mutation test of the same files, to prove the source was
restored: **45 passed (45)**, exit 0, with
`src/client/openui-actions.ts` SHA-256 `792539CAE31A488D…` and
`git diff --quiet -- src` -> exit 0 (`src/` byte-identical to HEAD).
Raw: `10b-refusal-path-post-restore.log`.

### Is `UNSUPPORTED_STEPS` still exactly `['OpenUrl','ToAssistant']`? — YES

Printed from the module the renderer imports (`npx unrun evidence/phase-5-rc2/print-steps.mjs`):

```
UNSUPPORTED_STEPS = ["OpenUrl","ToAssistant"]
UNSUPPORTED_STEPS.size = 2
SUPPORTED_STEPS = ["Set","Reset","Action","CopyToClipboard"]
MATCH = true
EXIT=0
```

Raw: `14-unsupported-steps.txt`. And asserted in the suite at
`tests/openui-actions.spec.tsx:136`:
`expect([...UNSUPPORTED_STEPS].sort()).toEqual(['OpenUrl', 'ToAssistant'])`.

### Does a refused Button still get REFUSED at dispatch? — YES, asserted

`tests/openui-clipboard-4b.spec.tsx:206-213`, *"refuses @OpenUrl and @ToAssistant at dispatch"*:

```ts
const outcome = applyAction({ kind: 'element', name: '@' + name, args: ['x'] }, {})
expect(outcome.patch, name + ' must not write state').toEqual({})
expect(outcome.clipboard, name + ' must not copy').toBeUndefined()
expect(outcome.diagnostics.some(d => d.code === 'action.unsupported'),
       name + ' must be refused by name').toBe(true)
```

### Does it produce the visible "not available in this build" notice? — YES, and it IS unit-tested

`tests/openui-clipboard-4b.spec.tsx:262-277`, *"12. a refused action tells the user, it
is not silently inert > renders a control that says which name was declined, on press"*:

```ts
const button = host.querySelector<HTMLButtonElement>('[data-openui-refused-button="OpenUrl"]')
expect(button, 'a refused action must still draw a control').not.toBeNull()
expect(button!.getAttribute('title'), 'the reason is available before the press').toContain('OpenUrl')
expect(host.querySelector('[data-openui-refused-notice]')).toBeNull()   // nothing before the press
act(() => { button!.click() })
const notice = host.querySelector('[data-openui-refused-notice="OpenUrl"]')
expect(notice, 'pressing it must explain the refusal').not.toBeNull()
expect(notice!.textContent).toContain('OpenUrl')
expect(notice!.textContent).toMatch(/not available/i)
```

The rendered string is built at `src/client/OpenUICard.tsx:3995`:
`const notice = '@' + action + ' is not available in this build'`.

**Three limits on that claim, stated rather than glossed:**

1. The unit test asserts `/not available/i` plus the name, **not the exact sentence**.
   The full string `@OpenUrl is not available in this build` is only recorded by the
   *browser* evidence `evidence/phase-5/C1-acceptance.json`, which was **not re-run
   this session**.
2. The notice is asserted for **`@OpenUrl` only**. For `@ToAssistant` the suite asserts
   the control exists (`data-openui-refused-button="ToAssistant"`), that pressing it
   writes no clipboard, and that no copy control appears — it does **not** click and
   read a notice element for `@ToAssistant` (lines 279-287).
3. This is a **unit/DOM-level** observation. It is not a browser observation.

The Lead's independent mutation (`refusal-guard-mutation.txt`, reproduced in this
directory) showed removing the refusal turns these tests red — so the guard is not
vacuous. It is recorded as the Lead's run, not mine; I verified its precondition and
its aftermath: source restored byte-clean (`git diff --quiet -- src` = 0) and the
45 tests green again.

---

## 7. AGENTS.md §9 — the browser-evidence bundle-hash gate — PASS

```
build   lib/client.js      : E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB
installed p3web client.js  : E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB
build size                 : 450559
installed size             : 450559
MATCH                      : True
```

Raw: `15-ags9-bundle-gate.txt`. The isolated test profile
`tmp/dsh-p3/profiles/p3web/node_modules/@dsh-unified/visualize/lib/client.js` **is**
running this tree. Independently confirmed: the hash is unchanged before and after
my rebuild, and it is the same hash `evidence/phase-5/C1-acceptance.json` recorded:

```
C1-acceptance.json bundle.clientSha256 : E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB
today build lib/client.js SHA256       : E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB
IDENTICAL                              : True
```

Raw: `18-browser-evidence-binding.txt`. **The stage-5 browser evidence is bound to the
current bundle**, which is a real strength of that evidence — it survives the rebuild.

### The live GUI on `127.0.0.1:56091` is a DIFFERENT package — never evidence about this code

```
listener on 56091 : PID 26452, "DeepSeek Harness.exe"
cmdline profile   : C:\Users\86139\.dsh\profiles\desktop
HTTP GET /        : 401 Unauthorized  (auth-fenced)
HTTP GET /plugins/@nagi-ovo/dsh-visualize/client.js : 404
```

The desktop profile's plugin is **not** this fork:

| | Live desktop profile | This tree |
| --- | --- | --- |
| package | `@nagi-ovo/dsh-visualize` **0.1.7** | `@dsh-unified/visualize` 0.1.0 |
| `lib/client.js` | 118,874 bytes | 450,559 bytes |
| SHA-256 | `A1957D85…E6BAF29` | `E1BF4A82…31456CEB` |
| `CopyToClipboard` | 0 occurrences | 9 |
| `UNSUPPORTED_STEPS` | 0 | 5 |
| `OpenUrl` / `ToAssistant` | 0 / 0 | 4 / 3 |
| `data-openui-refused` | 0 | 3 |

Raw: `15-ags9-bundle-gate.txt`, `16-gui-profile.txt`. **Any browser gate run against
the live desktop profile would measure upstream's plugin, not this fork, and must
never be filed as evidence about this code.**

---

## NOT VERIFIED

Recorded as not-verified. None of these is a product failure.

1. **Browser gates G0–G3 (`node evidence/lib/probe.mjs --what=smoke`) — NOT RUN, exit 2.**
   ```
   BLOCKED: bsk daemon is not reachable: Command failed: bsk status --json
   {"verdict":"BLOCKED","reason":"bsk daemon is not reachable: Command failed: bsk status --json"}
   PROBE_EXIT=2
   ```
   `bsk status --json` -> exit 2:
   *"cannot start an independent Windows daemon; the Job Object of this process does
   not allow breakaway ... 拒绝访问。 (os error 5)"*. `BSK_SESSION` is unset.
   Per AGENTS.md §10, **exit 2 means the environment blocked the run and may never be
   counted as a product failure.** Raw: `11-browser-gates.log`, `11-bsk-direct.txt`.
   I did not attempt to work around the daemon restriction.

2. **The live DSH GUI at `http://127.0.0.1:56091` — NOT USABLE as evidence.**
   Returns HTTP 401 (auth-fenced) and serves a different plugin (see §7). Not retried
   or bypassed.

3. **The stage-5 browser measurements were not re-taken this session.** Frame sandbox
   counts (4/4), theme-token switch, clipboard round-trip, and the browser-observed
   `noticeBeforePress: false / noticeAfterPress: true` all come from
   `evidence/phase-5/C1-acceptance.json`, dated 2026-11-05 at the `8db9598` baseline.
   They are **bound to the current bundle hash** (§7), which supports them, but they
   were not re-run. Treat the audit's browser rows as *carried forward, hash-matched*,
   not *re-measured*.

4. **Reload-and-restore in a browser** remains NOT VERIFIED, as the audit itself says.

5. **The 6 symlink-containment tests still cannot execute on this host.** They are red
   with `EPERM ... symlink` in setup. Their containment logic is unverified here; it is
   claimed verified on CI (`evidence/phase-5/C2-cross-platform.json`), which I did not
   re-run.

---

## Observation (not a finding against the audit, but worth a look)

`src/client/openui-actions.ts` lines 10-12 still say, in the module docstring:
*"`@OpenUrl`, `@CopyToClipboard` and `@ToAssistant` are recognised and refused"*.
`@CopyToClipboard` **shipped** in stage 4B and is in `SUPPORTED_STEPS`. The
capability-consistency gate does not catch this because it reads `languageReference()`
and `COMPONENT_CATALOG.md`, not source docstrings. Cosmetic, in product code, and **I
did not edit it** — recording it for whoever owns the file.

---

## Summary table

| # | Check | Command | Exit | Result |
| --- | --- | --- | --- | --- |
| 0 | Product code unchanged since audit commit | `git diff --stat 6b26aab..HEAD -- src tests` | 0 | EMPTY; `HEAD:src` tree hash == `6b26aab:src` |
| 1 | Node typecheck | `npx tsc -p tsconfig.json` | **0** | 0 errors |
| 2 | Client typecheck | `npx tsc -p tsconfig.client.json` | **0** | 0 errors |
| 3 | Full suite | `npx vitest run --reporter=json` | 1 (15 known) | **924 / 15 / 0 / 939**, counts close |
| 3b | Failure set vs baseline | `node evidence/lib/failure-set.mjs …` | **0** | `identical:true`, `onlyInCurrent:[]` |
| 3c | Root causes | `node tools/classify-failures.mjs …` | **0** | 15/15 classified, 0 blocking, 0 unknown |
| 4 | Build | `npx tsdown` | **0** | client.js **450,559 B**, SHA `E1BF4A82…`, deterministic |
| 5 | Docs-vs-code release gate | `npx vitest run tests/capability-consistency.spec.ts` | **0** | 10/10 (re-run post-edit: 14/14) |
| 6 | Refusal path | `npx vitest run tests/openui-clipboard-4b.spec.tsx tests/openui-actions.spec.tsx` | **0** | 45/45 (re-run post-restore: 45/45) |
| 7 | AGENTS.md §9 hash gate | `Get-FileHash` on both client bundles | 0 | MATCH, 450,559 B both |
| — | Browser gates G0–G3 | `node evidence/lib/probe.mjs --what=smoke` | **2** | **NOT VERIFIED** (blocked, not a product failure) |

## Verdict

**AUDIT NEEDS REVISION.**

The audit's test and type numbers are correct at `63dcd92` and reproduce exactly:
924/15/939, counts closing, failure set identical name-for-name with nothing new
failing, all 15 classified, 0 errors from either `tsc`, a deterministic build, the
capability gate green (re-verified after a concurrent doc edit), `UNSUPPORTED_STEPS`
exactly `['OpenUrl','ToAssistant']`, and the Deferred-action refusal asserted at both
the dispatch and the rendered-notice level.

What needs revision is **one factual line**: §1.1 `| Build | lib/client.js 251.13 kB |`
is wrong. 251.13 kB is tsdown's `[ESM] 2 files, total` — `lib/index.js` +
`lib/index.d.ts` — not `lib/client.js`, which is **450.56 kB** (450,559 bytes). The
same mislabel is in `PHASE-4B-REPORT.md` line 167 and was carried forward unmeasured.
Also worth correcting: the claim that no post-baseline commit touched product code is
false for `8db9598..HEAD` (it touched `src/client/OpenUICard.tsx`); it is true, and
better stated, for `6b26aab..HEAD`.

No blocker. No new test failure. No product regression found.
