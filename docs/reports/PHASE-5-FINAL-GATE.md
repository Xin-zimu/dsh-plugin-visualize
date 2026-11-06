# Stage 5 — final release gate

- **Date:** 2026-11-06
- **HEAD audited:** `63dcd92e64b31ee740267b8043f33fb5c9eb686a` (plus one comment-only edit, §2)
- **Host:** Windows 11 · Node 24.22.1 · vitest 4.1.10 · DSH 0.2.1-rc.5
- **Scope:** close the three items the owner named. No feature work, no tag, no release.

---

## Verdict: **GO**, with two conditions the owner should weigh (§7)

All three items are closed. The browser gate that was NOT VERIFIED in the previous
round now **PASSES on a real host running this repository's build**, proved by hash,
by package identity, and by a marker that exists only in this fork.

---

## 1. The three items

| # | Item | Status |
| --- | --- | --- |
| 1 | Fix the stale `@CopyToClipboard` docstring (N5) | **DONE** — hash and tests unchanged, measured not assumed (§2) |
| 2 | Restore real browser verification against *this* build | **DONE** — all four gates pass; four product checks pass (§3) |
| 3 | Adjudicate the 15 baseline failures | **DONE** — all 15 admissible, 3 named caveats (§4) |

---

## 2. Item 1 — the N5 docstring

`src/client/openui-actions.ts:10-12` said `@CopyToClipboard` "is recognised and
refused". It shipped in stage 4B (ADR-013) and is in `SUPPORTED_STEPS`. Corrected,
comment-only: `1 file changed, 5 insertions(+), 3 deletions(-)`, entirely inside the
module docstring.

**The owner required that the bundle impact be measured, not assumed.** It was:

| Check | Result |
| --- | --- |
| `lib/client.js` before → after | `E1BF4A82…456CEB` → `E1BF4A82…456CEB` — **unchanged** |
| `lib/index.js` before → after | `8D4BC669…D8D1CF` → `8D4BC669…D8D1CF` — **unchanged** |
| New docstring text present in bundle? | **No.** tsdown strips comments |
| **Control**: mutate real code (`MAX_CLIPBOARD_TEXT` 32→33 KiB) | hash → `AAE2F13D…376BB9`, **changed** |
| Control restored and rebuilt | back to `E1BF4A82…456CEB` |
| `tsc` node / client | 0 / 0 errors |
| Full suite after the fix | **924 / 15 / 0 / 939**, counts close, failure set **identical** |

The control is the point. An unchanged hash proves nothing on its own — it is equally
consistent with a stale build. The mutation proves the build is live and that only a
**code** change moves the hash. Full detail:
`evidence/phase-5-final/N5-comment-fix-impact.txt`.

---

## 3. Item 2 — real browser verification, against this build

### 3.1 The environment problem, and what actually fixed it

The previous round recorded `bsk` daemon exit 2: *"cannot start an independent Windows
daemon; the Job Object of this process does not allow breakaway"*. The cause was a
**stale `~/.bsk/daemon.json`** naming pid 22524, a process that no longer existed, plus
a detached-start refusal. Fixing it did not require bypassing anything:

1. Confirmed the recorded pid was dead and port 52800 was unbound.
2. Removed the stale `daemon.json` / `daemon.lock`.
3. Started the daemon as a **managed background job in the foreground** —
   `bsk daemon start --foreground`, which is exactly what the daemon's own error text
   recommended. It reported `daemon ready pid=25428 ws_port=52800`, and an Edge browser
   connected on its own.

No 401 was bypassed and no browser security setting was lowered.

### 3.2 Proving the subject is *this* repository, not upstream

This was the owner's central concern, and it needed more than a claim.

**The isolated profile.** `tmp/dsh-p3/profiles/p3web`, with `DSH_HOME=tmp/dsh-p3`,
served on `127.0.0.1:3093`. Its plugin dependency is `file:D:/Deepseek WorkSpace/dsh-plugin-visualize`.

| Identity check | Value |
| --- | --- |
| Package name / version | **`@dsh-unified/visualize` 0.1.0** — this repository |
| Build `lib/client.js` SHA-256 | `E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB` |
| Installed copy SHA-256 | `E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB` |
| AGENTS.md §9 gate | **MATCH**, 450,559 bytes both |
| Loaded page carries `data-openui-refused` (fork-only marker) | **true** |
| Loaded page carries `@nagi-ovo` (upstream marker) | **false** |
| OpenUI cards on the page | 20 |
| Refused-action buttons / copy buttons | 8 / 6 |

**The trap that was avoided.** The live GUI on `127.0.0.1:56091` runs
**`@nagi-ovo/dsh-visualize` 0.1.7** — a *different package* (118,874 bytes, SHA
`A1957D85…`), containing none of this fork's symbols. It returns 401 and was never
used, bypassed, or filed as evidence. The previous round's NOT VERIFIED was correct
precisely because that GUI is not this code.

### 3.3 The four gates — fresh, not carried forward

`node evidence/lib/probe.mjs --what=smoke` → **SMOKE PASS, exit 0**

| Gate | Question | Result |
| --- | --- | --- |
| **G0** environment | measurable at all? | pass — daemon 0.4.1 / protocol 1.8, hash match, 20 cards, `draftEditorCrashes: 0`, `unreadableLog: false` |
| **G1** input | one action delivers a whole value? | **sent 31 / received 31** |
| **G2** submit | Enter submits? | composer emptied, echo observed |
| **G3** render | does the turn paint? | **21 paragraphs**, settled |

### 3.4 The product checks, on a card drawn in this session

A fresh card was rendered *during this round* (not replayed from history), then measured:

| Check | Result |
| --- | --- |
| HTML card sandbox | **4 / 4** frames sandboxed, `sandbox="allow-scripts"` |
| Theme tokens really switch | dark `--foreground #f9fafb`, `--card #2c2c2e`, body `rgb(21,21,23)` → light `#0f1115`, `#fff`, `rgb(255,255,255)` → restored |
| Clipboard round-trip | OS clipboard seeded `SENTINEL-BEFORE-COPY` → **`release-gate-token`**, equal to the payload the card displays |
| Refused-action feedback | nothing before press; after press **both** notices appear — `@OpenUrl is not available in this build` and `@ToAssistant is not available in this build`; both auto-expire at 3200 ms; host URL unchanged |
| Card state persistence | 6 keys under `dsh-visualize:state:` |
| Link safety | `rel="noreferrer noopener"`, `target="_blank"` |

**Two probe errors were mine, not the product's, and are recorded because the
distinction matters:**

1. The first clipboard attempt left the sentinel unchanged. Cause: I called
   `element.click()` from script, which is **not** a trusted user gesture, so
   `navigator.clipboard.writeText` correctly refused. With a real CDP click the copy
   succeeded. ADR-013 requires a genuine gesture; the probe was violating that
   requirement, not testing it.
2. The first refusal-notice attempt read an empty list. Cause: the notice self-hides
   after **3200 ms**, and two separate `bsk` CLI invocations take longer than that.
   Reading `RefusedButton` (`OpenUICard.tsx:3999-4002`) explained it; press-and-read in
   one evaluation then passed.

Full artefact: `evidence/phase-5-final/C1-acceptance.json`.

---

## 4. Item 3 — the 15 baseline failures

Full document: **`docs/testing/FAILURE-ADJUDICATION.md`**.

Four admission criteria were stated **before** being applied (environmental cause;
passes on another platform by name; guarded behaviour covered by another passing test;
unchanged from baseline). All 15 were tested against all four.

**Result: `YES-WITH-NAMED-CAVEATS`.** Every one is admissible for a release whose scope
is the OpenUI renderer and the clipboard action.

The evidence that carries the most weight is the real CI run, re-verified this round
with `gh run view`: `conclusion: success`, `headSha 15814e3`, and the Windows leg's own
gate printed:

```
note: 8 baseline failure(s) pass on this runner.
windows: baseline 15, found 7, new 0
GATE PASSED
```

**Three caveats travel with the verdict** and are not folded into the pass column:

| # | Caveat |
| --- | --- |
| **C1** | Six symlink-containment tests cannot run on this machine (`EPERM` creating the symlink in setup). They pass on CI Windows and Linux. **The release therefore depends on CI for that class of defect**, not on the local suite. |
| **C2** | *(RESOLVED in stage 6, 2026-11-06: it was a product bug, not a timeout — see evidence/stage-6/timeout-diagnosis.md.)* One 5,020 ms timeout has no diagnosis. Admissible under all four criteria, but "it is a timeout, not a bug" is close to an assertion about intent. Weakest of the fifteen. |
| **C3** | Two of the fifteen are **fixture defects**, not platform behaviour. `ctx.fs.readText` is a real API (`dsh-fs/lib/types/index.d.ts:162`); the test mock at `tests/card-images.spec.ts:40-51` provides `readBytes` but not `readText`. The product's call is correct. The honest split is **13 platform + 2 fixture**. |

**A note the adjudication insists on.** Twelve of the fifteen are in modules this release
**ships** — the failing specs import `src/storage.ts`, `src/images.ts`,
`src/style-files.ts`, `src/tool.ts` and `src/fragment.ts` (verified by reading their import
lines). So the claim cannot be "out of scope"; it has to be "environment-caused failure in
shipped code", which is what A1-A4 actually test. The guarded behaviour is either proven
on another platform (A2) or covered by another passing test (A3) — 63 tests pass across
those five spec files. What fails is the subset needing a symlink, a `~` expansion, or a
drive-qualified join, not the module as a whole.

---

## 5. Evidence grades — kept separate, as required

| Grade | Meaning | Where |
| --- | --- | --- |
| **Ran now** | a command ran this round and its output is saved | `evidence/phase-5-final/`, `evidence/phase-5-rc2/` |
| **Carried forward** | recorded earlier, re-bound by hash, **not** re-measured | `evidence/phase-5/C2-cross-platform.json` (CI reports) |
| **NOT VERIFIED** | not measured, and not claimed | §6 |

**Ran this round:** typechecks (both projects), full suite twice (pre- and post-N5),
build ×4 including a mutation control, four browser gates, sandbox/theme/clipboard/refusal
checks, identity and hash checks, CI run verification via `gh`.

**Carried forward with hash binding:** the cross-platform CI comparison. It is not a
guess — the run was re-verified to exist with the stated conclusion and SHA — but the
suite was not re-run on Linux or on GitHub's Windows runner this round.

---

## 6. NOT VERIFIED

| Item | Why |
| --- | --- |
| Reload-and-restore **in a browser** | Unchanged from the earlier audit. Card state is recorded (6 keys) and the restore path has unit tests, but the browser round-trip was not reproduced. |
| HTML card **content** | Frame count and `sandbox` attribute measured; what is drawn inside the frames was not inspected. |
| Local POSIX run | WSL was not re-run this round; the 939/939 figure is carried forward from CI and the earlier local run. |
| The 7 failures that persist on CI Windows | Named in the adjudication, causes documented, but not individually fixed — recommendations R1–R5. |

---

## 7. Conditions on the GO

**GO** means: the release candidate is releasable on the evidence above. Two conditions
are attached, and neither invalidates the evidence.

1. **The commit must include the N5 comment fix and nothing else in `src/`.**
   `git diff --stat -- src` is `1 file changed, 5 insertions(+), 3 deletions(-)`, all
   inside a docstring, with the bundle hash unchanged and a control proving the build
   is live. If any other product change rides along, this audit does not cover it.
2. **`lib/client.js` must still hash to `E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB`
   at tag time.** That is the exact bundle measured in the browser this round, and the
   exact bundle the CI comparison and the earlier stage-5 browser artefacts are bound to.
   A different hash voids these claims and requires re-measurement.

**What is not a condition:** the three caveats in §4. They are debt, named. None
contradicts an expectation about the behaviour this release changes.

---

## 8. What would make this NO-GO

Stated so the boundary is explicit rather than implied:

- a **new** test failure (`onlyInCurrent` non-empty) — not present;
- a bundle hash that differs from the one measured in the browser — not present;
- a product change beyond N5 riding along — not present;
- browser gates failing on a real host — they pass;
- a failure contradicting an expectation about the renderer or the clipboard action —
  none of the 15 does.

---

## 9. Reproduce

```powershell
npx tsc -p tsconfig.json
npx tsc -p tsconfig.client.json
npx vitest run --reporter=json --outputFile=evidence/phase-5-final/vitest-post-n5.json
npx tsdown
Get-FileHash lib/client.js -Algorithm SHA256

# browser gates (daemon must be started as a foreground background job)
bsk daemon start --foreground
$env:DSH_HOME='<repo>\tmp\dsh-p3'; dsh p3web --port 3093 --no-open
bsk session start --browser <instance> --name stage5-final-gate --json
bsk navigate --session <id> 'http://127.0.0.1:3093/'
$env:BSK_SESSION='<id>'; $env:BSK_AUTO_START='0'
node evidence/lib/probe.mjs --what=smoke
node <probe>/final-acceptance.mjs
```

**This report does not release anything.** It produces the release recommendation; the
tag, the release, and the push remain the owner's decision.