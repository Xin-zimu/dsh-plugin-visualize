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
| Build | `lib/client.js` 251.13 kB |
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
| N3 | **The 5-second timeout is unexplained** | `classify-failures.mjs`, cause `timeout` | Raise the bound or find what stalls; a timeout is not a diagnosis |

### DEFERRED

| # | Item | Why deferred |
| --- | --- | --- |
| D1 | `@OpenUrl` | No host-mediated open exists; `window.open` from card code is forbidden by ADR-004 and a popup blocker swallows it silently. ADR-014 records the conditions |
| D2 | `@ToAssistant` | No submit API exists; reaching the composer through the DOM would produce a message the host could not attribute or refuse. ADR-015 |
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