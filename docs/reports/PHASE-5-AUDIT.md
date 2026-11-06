# Stage 5 — release candidate audit

- **Date:** 2026-11-05
- **Baseline audited:** `8db9598` plus this stage's audit fixes.
- **Verdict: releasable, with three non-blockers and five deferred items. No blocker found.**

This audit answers four questions, then lists every open issue by severity. It does
not authorise a release: that decision belongs to the owner.

## 1. Is the code releasable?

**Yes, on the evidence below, with one caveat stated in §1.3.**

### 1.1 What was measured

| Check | Result |
| --- | --- |
| `tsc -p tsconfig.json` | 0 errors |
| `tsc -p tsconfig.client.json` | 0 errors |
| `vitest run` | **924 passed / 15 failed / 939** |
| Counts close | 924 + 15 = 939, asserted rather than assumed |
| Failure set vs baseline | identical, name by name |
| Build | `lib/client.js` **450.56 kB** (450,559 B); `lib/index.js` + `lib/index.d.ts` 251.13 kB — tsdown's ESM total, not the client bundle (corrected 2026-11-06, see `evidence/phase-5-rc2/RESULTS.md` F1) |
| Bundle hash | `E1BF4A82…`, installed copy identical before measuring (§9) |
| Components rendered | 48 / 48 |
| Functions declared | 73 |
| Browser gates G0–G3 | pass |

### 1.2 The fifteen failures are not a release argument either way

A matching failure set proves the change added no failure. It does not prove the
failures are harmless. So each was classified by the root cause in its own message:
6 × `EPERM` creating symlinks, 4 × a literal `~` in a path, 1 × a drive-qualified
path joined onto another, 1 × `EPERM` renaming over an open file, 1 × a fixture
mock missing `ctx.fs.readText`, 1 × a 5-second timeout, 1 × a description fixture
with no skill provider registered.

**Zero unclassified, zero blocking.** `tools/classify-failures.mjs` exits non-zero
if a failure resists classification, so a new one cannot be absorbed into the
baseline by being ignored. Detail: `docs/testing/PLATFORM-FAILURES.md`.

The part worth flagging: **6 of the 15 are the tests that prove a symlink escape is
refused.** They cannot run on Windows because Windows refuses to create the symlink,
so the containment logic is present and readable but the escape itself is **unproven
on this host**. A non-blocker for a renderer-plus-clipboard release, and a real gap
for anyone claiming the storage layer is verified.

### 1.3 The caveat, which has since been closed

This section originally said the cross-platform claim was **a prediction read from the
failure messages rather than an observation**, because there was no CI and no POSIX
run. That was the honest position and it was not good enough, so both gaps were
closed during this stage.

| Platform | Passed | Failed | Skipped | Total | Where |
| --- | --- | --- | --- | --- | --- |
| WSL Ubuntu 24.04, Node 22.23.4 | **939** | **0** | 0 | 939 | local, fresh clone, frozen lockfile |
| CI ubuntu-latest | **939** | **0** | 0 | 939 | run `42003251408`, gate PASSED |
| CI windows-latest | **932** | **7** | 0 | 939 | run `42003251408`, gate PASSED |
| This Windows box, Node 24.22.1 | 924 | 15 | 0 | 939 | the baseline |

**`failsOnBoth: []`** — no test fails on both platforms. A test failing everywhere
would be a defect the Windows baseline was hiding; there are none.

**Zero skips anywhere.** That is load-bearing: the suite is not green because things
were excluded.

### 1.4 The finding that changed the document

The CI Windows runner reports **7** of the local 15, not 15. The eight that pass
there are exactly the ones needing a working symlink or a POSIX-shaped path —
**including six of the eight symlink containment tests that
`PLATFORM-FAILURES.md` had recorded as unprovable on Windows.**

GitHub's Windows runner can create symlinks; a stock Windows box cannot. So the
containment check is no longer "present and readable" — it **executes and passes on
Windows CI**. That is a stronger claim than this audit originally made, and it came
from running the tests instead of reasoning about them.

## 2. Are there unresolved security or trust-boundary risks?

**No unresolved risk inside the boundaries this release changes. One boundary gap
was found and fixed during this audit.**

### 2.1 The gap that was found and fixed

A Button whose action is refused rendered identically to a working one and did
**nothing** when pressed. The refusal existed only in a diagnostics array no user
can read. A control that looks live and is not is worse than one that explains
itself: the user cannot distinguish a refusal from a rendering bug, so they press
again, or conclude the plugin is broken.

Fixed narrowly: the Button now says which name was declined, on press. Measured in
a real browser — `noticeBeforePress: false`, `noticeAfterPress: true`, text
`@OpenUrl is not available in this build`.

Three mutations confirm the tests guard it: reverting to the silently-inert button
turned **2** tests red, showing the notice before the press turned **1** red,
emptying the message turned **1** red.

### 2.2 The boundaries, re-checked

| Boundary | Finding |
| --- | --- |
| HTML sandbox | 4 of 4 iframes carry `sandbox`; the count equals the frame count, so none is unsandboxed |
| OpenUI in the host origin | No `eval`, no `new Function`; a name absent from the component table can never become an element |
| SVG attributes | Closed allowlist; `d`, `points` and `transform` are validated by their own grammars with length and complexity caps |
| Popover | Inline absolute, no portal, no focus trap, listeners removed on unmount; two cards do not interfere |
| External actions | Default refuse. `@OpenUrl` and `@ToAssistant` are refused at dispatch and asserted so |
| Clipboard | Write-only, one API call, no `execCommand` fallback, gesture-gated, payload shown in full before the press |
| State isolation | Keys are per session and per card path; a state-change re-render writes nothing to the clipboard |
| Escaping to the host | Every `runAction` call site is a click or key handler; nothing calls it from an effect, timer or state change |

**Bypass routes searched for and not found:** no `window.open` or `location`
assignment in card code. The one `window.open` in the repository is
`VisualizeCard.openInWindow`, which the **host UI's own button** calls to open a
`noopener` blob URL — it is not reachable from a program and does not open a
model-supplied address. No `document.execCommand`. No synthetic input events. No
composer writes.

### 2.3 One semantic question for the owner

`@CopyToClipboard` inside `Action([...])` is **refused**, and the other steps still
run. That is deliberate — the composition is unmeasured, so it is declined rather
than attempted — but it means an action chain is **not atomic**. A user reading
`Action([@Set($n, 1), @CopyToClipboard($x)])` may expect both or neither.

Today the card renders as an ordinary Button with no copy control; pressing it
applies the `@Set` and copies nothing. **This is a documentation obligation rather
than a defect**, recorded in the catalogue and the CHANGELOG. Making it atomic
would mean changing how composition reports partial failure — a design decision
larger than a release fix.

## 3. Is the evidence sufficient and reproducible?

**Yes for everything this release changes; the gaps are named rather than covered.**

| Claim | Evidence | Reproducible by |
| --- | --- | --- |
| 48/48 components render | `tests/openui-inventory.spec.tsx` | `npx vitest run` |
| The prompt matches the code | `tests/capability-consistency.spec.ts` (10 tests, 3 mutations) | same |
| The clipboard copies what is shown | `evidence/phase-4b/C1-clipboard.json`, OS clipboard read back after a real click | needs a browser host |
| Refused actions explain themselves | `evidence/phase-5/C1-acceptance.json` | needs a browser host |
| HTML cards are sandboxed | same file, 4/4 frames | needs a browser host |
| Theme tokens really switch | same file, dark and light values differ | needs a browser host |
| Failure counts close | `evidence/lib/failure-set.mjs` | the JSON reporter, then the script |
| Each failure has a root cause | `tools/classify-failures.mjs` | same |

**The tools are part of the evidence.** This audit's predecessor reported
`910 + 15 ≠ 927` because the comparison script read a hard-coded file from hours
earlier and printed `IDENTICAL: true` no matter what changed. Two real failures sat
behind it. Both scripts now take their input as an argument, and `failure-set.mjs`
also asserts the counts add up — the check that would have caught it.

### What was not verified

- **Reload-and-restore in the browser.** Attempted three times; each attempt lost
  the CDP session to a page still settling. Persistence is recorded (6 keys under
  `dsh-visualize:state:`) and the restore path has unit tests, but the browser
  round-trip is **NOT VERIFIED** in this audit.
- **HTML card content.** Frame count and sandbox attribute were measured; what is
  drawn inside the frames was not inspected.
- **Cross-platform.** See §1.3.

## 4. Do the documents match the implementation?

**They do now. They did not when this audit started.**

| Document | State found | State now |
| --- | --- | --- |
| `README.md` | said "Stage 4A-3 of 5", **30 of 48** components, listed `Popover` as missing | 48/48, 4A and 4B complete, both refusals explained, install-before-build warning added |
| `CHANGELOG.md` | ended at stage 1.2; claimed 8/48 components | rewritten for the release candidate, with a *Refused, deliberately* section and known issues |
| `COMPONENT_CATALOG.md` | Actions table said three actions were refused | corrected to four working / two refused |
| `STAGE.md` | 4B "not started" | 4B PASS with exit criteria in a table |
| `PLATFORM-FAILURES.md` | **did not exist** | the 15 failures with root cause, impact and recommendations |

A new gate prevents the drift instead of relying on review:
`tests/capability-consistency.spec.ts` reads the same tables the code reads and fails
when the catalogue or the skill text disagrees. Three mutations prove it works: a
catalogue row claiming `@OpenUrl` executes, a skill paragraph losing its refusal
warning, and an action left in neither set each turned one test red.

## 5. Open issues

### BLOCKER

**None.**

### NON-BLOCKER

| # | Issue | Evidence | Recommendation |
| --- | --- | --- | --- |
| N1 | **Action chains are not atomic** when a clipboard step is refused | §2.3; catalogue and CHANGELOG | Keep documenting it. Atomicity is a design decision, not a release fix |
| N2 | **7 failures remain on CI Windows** — the `~` expansion, the path join, the rename lock, the fixture mock, the timeout, the description fixture | `evidence/phase-5/C2-cross-platform.json` | Fix the two fixture causes; investigate the timeout bound; accept the remaining Windows behaviours as documented |
| ~~N3~~ | ~~The 5-second timeout is unexplained~~ | `classify-failures.mjs`, cause `timeout` | **CLOSED 2026-11-06 (stage 6)** — diagnosed as a product bug, not a timeout. Raising the bound would have hidden it. `evidence/stage-6/timeout-diagnosis.md` |
| N4 | **This report's §1.1 build size was mislabelled** — `lib/client.js` is 450.56 kB, not 251.13 kB; the latter is tsdown's ESM total (`index.js` + `index.d.ts`). The same error was copied from `PHASE-4B-REPORT.md:167` | `evidence/phase-5-rc2/RESULTS.md` F1 | **CORRECTED 2026-11-06** in both reports. Worth noting the audit could not catch this itself: the adjacent row quotes the client-bundle hash, so size and hash described different files |
| N5 | **`src/client/openui-actions.ts` docstring is stale** — lines 10-12 still say `@CopyToClipboard` "is recognised and refused", but it shipped in 4B | `evidence/phase-5-rc2/RESULTS.md` §Observation | **Deliberately NOT fixed this round.** Editing `src/` would change the bundle hash `E1BF4A82…` that binds the stage-5 browser evidence (§9 gate). Fix it in the same change that re-runs the browser evidence |

### DEFERRED

| # | Item | Why deferred |
| --- | --- | --- |
| D1 | `@OpenUrl` | **Reason corrected 2026-11-06.** A host-mediated open *does* exist — `ctx.sidebarRight.openTab('browser', {params:{url}})` — but it opens a **sidebar tab, not an external browsing context**, and conceals iframe refusals. That is not this action. `window.open` from card code stays forbidden by ADR-004. Owner chose C2: seek an upstream plugin-callable open-external API. ADR-014 §10; PHASE-4B-2 §4 |
| D2 | `@ToAssistant` | **Reason corrected 2026-11-06.** A submit path *does* exist and is already a prop on this plugin's card; role escalation is structurally impossible because the host builds the message source. What no host API supplies is visible **attribution** and a **confirmation the card cannot fake**. Owner: do not downgrade. ADR-015 §10; PHASE-4B-2 §3 |
| D3 | Composing `@CopyToClipboard` | The user activation's survival through a composed run is unmeasured. Refused rather than attempted |
| D4 | `presentationMeta` stores `fragment` twice | ~234 bytes per HTML card. Checked: no integrity risk, no extra sensitive persistence, no effect on restore, because both copies are written from one value in one operation. Technical debt, not a defect |
| ~~D5~~ | ~~No CI at all~~ | **CLOSED** — `.github/workflows/verify.yml` runs both platforms and compares them |

## 6. What this audit changed

Two findings are worth naming above the rest.

1. **A product gap, found by the boundary review**: refused actions are no longer
   silently inert.
2. **A verification gap, found by a reader adding up the numbers**: the comparison
   script was reading a stale file. That is the more serious of the two, because it
   means every "identical to baseline" claim made before it was unearned.

Plus a capability-consistency gate, a failure classifier that refuses to pass an
unclassified failure, `PLATFORM-FAILURES.md`, and a README and CHANGELOG that
describe the release candidate instead of a stage four phases ago.
---

## 7. Re-verification at HEAD `63dcd92` — 2026-11-06

The audit above was measured at baseline `8db9598`. This section records what was
**re-run** after Stage 5 resumed, and — separately — what was not. Full raw evidence,
28 files: `evidence/phase-5-rc2/`; summary: `evidence/phase-5-rc2/RESULTS.md`.

### 7.1 Verdict of the re-run

**Every test and type number in §1.1 reproduces exactly. One factual line was wrong
and is now corrected (N4). No blocker, no new failure, no product regression.**

| Check | Command | Exit | Result |
| --- | --- | --- | --- |
| Node typecheck | `npx tsc -p tsconfig.json` | **0** | 0 errors |
| Client typecheck | `npx tsc -p tsconfig.client.json` | **0** | 0 errors |
| Full suite | `npx vitest run --reporter=json` | 1 (15 known) | **924 / 15 / 0 / 939**, counts close |
| Failure set vs baseline | `node evidence/lib/failure-set.mjs` | **0** | `identical:true`, `onlyInCurrent:[]` |
| Root causes | `node tools/classify-failures.mjs` | **0** | 15/15 classified, 0 blocking |
| Build | `npx tsdown` | **0** | `client.js` 450,559 B, SHA `E1BF4A82…`, deterministic |
| Docs-vs-code gate | `npx vitest run tests/capability-consistency.spec.ts` | **0** | 10/10 |
| Refusal path | clipboard-4b + actions specs | **0** | 45/45 |

**`onlyInCurrent` is empty** — no test fails now that did not fail at baseline. That is
the specific claim a release gate needs, and it is measured rather than inferred.

### 7.2 What changed between the baseline and HEAD

The earlier note that no post-baseline commit touched product code was **wrong**:
`git diff --stat 8db9598..HEAD -- src tests tools` shows `src/client/OpenUICard.tsx`
+86 lines (the refused-button notice) and two test files +142. All of it landed in
`6b26aab`, the commit that added this audit.

The claim that *does* hold, and is stronger: **`6b26aab..HEAD` leaves `src/` and
`tests/` byte-identical** (`git rev-parse HEAD:src` == `git rev-parse 6b26aab:src`),
with only two read-only CI scripts added under `tools/`. That is why re-measuring is
meaningful.

### 7.3 The bundle-hash gate (§9) holds — and it binds the browser evidence

`lib/client.js` and the isolated test profile's installed copy are **both**
`E1BF4A82B3C80889…` at 450,559 bytes. That is also the exact hash
`evidence/phase-5/C1-acceptance.json` recorded. So the stage-5 browser measurements
are bound to the bundle this tree builds, and the rebuild reproduces it byte for byte.

> **The live GUI on `127.0.0.1:56091` is NOT this plugin.** It runs
> `@nagi-ovo/dsh-visualize` 0.1.7 (118,874 bytes, SHA `A1957D85…`), which contains
> none of this fork's symbols. Any browser gate run against it measures upstream's
> code and must never be filed as evidence about this tree.

### 7.4 The refusal feedback, proved rather than assumed

Both Deferred actions still refuse at dispatch, and `UNSUPPORTED_STEPS` is still
exactly `['OpenUrl','ToAssistant']` (printed from the module the renderer imports).

The guard was **mutation-tested**: re-inserting the two names into `SUPPORTED_STEPS`
turned **6 tests red across 3 files** — including the one that reads the rendered
`[data-openui-refused-notice]` element — then the file was restored byte-identically
and all 59 pass again (`evidence/phase-5-rc2/refusal-guard-mutation.txt`).

**Three limits on what that proves**, recorded rather than glossed:

1. The notice is asserted for **`@OpenUrl`**. For `@ToAssistant` the suite asserts
   dispatch refusal, control presence and no-copy — it does not click and read a
   notice element.
2. The unit test matches `/not available/i` plus the name, **not the exact sentence**.
   The literal `@OpenUrl is not available in this build` is recorded only by the
   browser artefact, which was not re-run.
3. This is **DOM-level, not browser**. See §7.5.

### 7.5 NOT VERIFIED in this re-run

Stated as gaps, not covered.

| Item | Why |
| --- | --- |
| **Browser gates G0–G3** | `probe.mjs --what=smoke` → **exit 2 BLOCKED**: the `bsk` daemon cannot start (`Job Object of this process does not allow breakaway`, `os error 5`). Per `AGENTS.md` §10, **exit 2 is an environment block and may never be counted as a product failure.** Not worked around |
| Live GUI `127.0.0.1:56091` | Returns 401 (auth-fenced) and serves a different plugin. Not bypassed |
| §1.1 browser rows (4/4 sandboxed frames, theme tokens, clipboard round-trip, notice before/after press) | **Carried forward, hash-matched — not re-measured.** They come from `evidence/phase-5/C1-acceptance.json`; §7.3 is why they remain credible |
| Reload-and-restore | Remains NOT VERIFIED, as the original audit says |
| The 6 symlink-containment tests | Still cannot execute on this host (`EPERM` creating symlinks). Claimed verified on CI, which was not re-run |

### 7.6 What this re-verification does NOT do

**It does not declare the release.** It establishes that the numbers are real and
reproducible at the audited commit, that the corrected documents match the code, and
that the two refusals still hold. The release decision belongs to the owner, and two
browser-dependent rows remain carried forward rather than re-measured.
