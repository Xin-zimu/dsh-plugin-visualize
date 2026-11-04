# Phase 4A-3 report — the rest of the Inputs group

**Date:** 2026-11-04
**Stage:** 4A-3 (`STAGE.md`)
**Verdict:** **ACCEPTED.** The batch was closed as IMPLEMENTED on a cloud
sandbox with no host. It is accepted here, on a real DSH install, where the
browser half of the gate finally became measurable: all six exit-gate items now
have evidence, including the two that were unreachable before (items 3 and 5) and
the two risks carried forward on purpose (IME composition; a ticking `Timer`
beside a focused `Input`).

## What this batch had to prove

That the eleven components which complete the Inputs group — `Input`, `TextArea`,
`Select`, `SegmentedControl`, `Checkbox`, `RadioGroup`, `DatePicker`, `Timer`,
`Form`, `IconButton`, `Pressable` — make a **bidirectional** loop work, not just
a drawing. A checkbox that renders checked and writes nothing passes every
presence assertion ever written, which is why the interesting assertions in
`tests/openui-inputs-4a3.spec.tsx` are about what the *program* computes next.

The Inputs group is now complete, 13 of 13, and the inventory moves from
**19 / 48** to **30 / 48**, measured from the renderer's own table.

## Result against the exit gate

| # | Item | Result |
| --- | --- | --- |
| 1 | Every component in the batch renders from a real program | **PASS** — all eleven draw in the host, counted by structure; inventory 30 / 48 |
| 2 | Bound inputs write `$state` and survive a reload | **PASS** — a typed value survived a real page reload *and* a history replay |
| 3 | Layout, colour and contrast hold in both colour schemes | **PASS** — both schemes entered through the host's own 外观 control; 21 variables resolve; min contrast 5.8:1 light / 12.11:1 dark |
| 4 | The differential still reports 0 differences | **PASS** — 31/31, `differential.json` byte-identical |
| 5 | Browser evidence on an isolated profile, with the §9 hash check | **PASS** — isolated host on :3093 + `bsk` 0.4.1; both SHA-256 halves matched `4D071A86…` before measuring |
| 6 | `tests/<batch>` added; the 15-failure baseline unchanged | **PASS** — 43/43 on the batch spec; Windows 794/15/809 with the failing **set** compared name-by-name: zero added, zero removed |

Items 3 and 5 were **unreachable from where this batch was closed**, and
`AGENTS.md` §5 did not allow relabelling that as a pass — so they were left NOT
VERIFIED, and the local run measured them instead of assuming them.

## The one state path, reused rather than rebuilt

Every renderer follows the same three lines: read the bound slot, draw it, call
`write(name, next)`. No renderer keeps a copy of a bound value, so none can
drift out of sync with `$state`. Three consequences worth stating, because each
is a defect class that did not happen:

- **One writable argument, always the first.** Upstream's `IUI_B_BINDING_ARG`
  is asserted against `signatures.ts`, not left as a convention — a renderer that
  quietly started writing a second slot would still pass every behavioural test.
- **`IconButton` and `Pressable` carry actions through `write.runAction`**, the
  channel `Button` already used. A second route into state is how two ways to
  change one variable appear.
- **An unbound control still draws, and stays disabled.** It does not vanish
  (which reads as a bug in the program) and does not pretend it can write.

`Timer` is the only control here that writes *without a gesture*, and that
turned out to be a testing problem rather than a rendering one — see D25 below.

## The measurement, concretely

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS, 2.8 s | `evidence/phase-4a-3/` — see `MANIFEST.json` |
| `pnpm run typecheck` | PASS, exit 0, both projects | `tsc-linux.txt` |
| `pnpm run test` | **809 passed / 0 failed / 809**, 40 files | `test-4a3-linux.txt` |
| `pnpm run build` | PASS after `unrun` was declared (D23) | `build-linux.txt` |
| `node --experimental-strip-types evidence/phase-2/differential.mjs` | 31 / 31, 0 differences | `differential-4a3.txt` |
| `pnpm vitest run tests/openui-inventory.spec.tsx` | 30 / 48, Inputs complete | `inventory-linux.txt` |
| `pnpm run typecheck` (Windows) | PASS, exit 0 | `tsc-windows.txt` |
| `pnpm run test` (Windows) | **794 passed / 15 failed / 809** — the 15 are the documented baseline, set compared name-by-name | `test-4a3-windows.txt` |
| `pnpm run build` (Windows) | PASS, `lib/client.js` 375 564 bytes | `build-windows.txt` |
| differential (Windows) | 31 / 31, 0 differences, output byte-identical | `differential-4a3-windows.txt` |
| `node evidence/lib/probe.mjs --what=smoke` | **SMOKE PASS** — G0 (both hashes equal), G1, G2, G3 | G0 fields in the probe output |

New tests: 43 in `tests/openui-inputs-4a3.spec.tsx` (37 before this session; six
Timer clock cases added, one replaced a test that asserted nothing).

## Three defects, all found by measuring rather than reading

### D23 — the build depended on a peer nobody declared

`pnpm install --frozen-lockfile && pnpm run build` failed on a clean machine:

```
ERROR  Error: Failed to import module "unrun". Please ensure it is installed.
```

`tsdown@0.22.14` lists `unrun` as an **optional** peer — it needs it to load
`tsdown.config.ts` — and pnpm does not install optional peers that were never
asked for. So the build worked on the machine where it had been installed by
hand and would fail on every other one. That is the difference between "works
here" and "works", and it belongs in `package.json`, not in someone's shell
history. Fixed in `chore(build)`, verified with `node_modules` deleted.

**How it was nearly missed.** It was first reported as an environment problem —
inside a takeover brief whose instruction was "distinguish a failed environment
from a real failure". It is neither: the environment was fine, the manifest was
incomplete.

### D24 — an assertion that measured the temp path, and had never run

`tests/card-images.spec.ts` asserted `metaBytes < FRAGMENT.length + 600`. The
measured value is 972 for a 212-character fragment.

Two separate faults, and the second is the interesting one:

1. **The constant was wrong.** The persisted meta stores the fragment twice
   (`fragment`, plus the pre-fork `source` the OpenUI reader falls back to), an
   absolute path, and two 73-character content addresses. The real constant is
   ~760, not 600 — and most of it is not the fragment, so the assertion was
   measuring the host's temp path length as much as the payload.
2. **It had never executed.** On Windows the test failed three lines earlier
   (`ENOENT` on the card file), in both the 4A-2 and 4A-3 baselines. Nobody had
   ever seen this assertion pass *or* fail; it was counted among "the 15 known
   failures" by name only.

Now it asserts the claim it is named for — `metaBytes < FIGURE.byteLength / 50`,
i.e. a reference rather than a copy of a 204 KB figure — which does not move
with the path, the fragment length, or the platform. Validated by re-introducing
the defect: appending the figure's bytes to `source` turns it red with
`expected 205772 to be less than 4096.32` (`mutation-check.txt`, M2).

### D25 — the cleanup test that passed for the wrong reason

`Timer`'s interval is cleared on unmount. The first version of the test proved it
by starting the countdown, unmounting, waiting, and remounting to read the value
back. Deleting `clearInterval` left that test **green**: a leaked interval writes
into the store it captured, and a reload had already replaced that store, so the
write landed nowhere observable.

Cleanup is now asserted by counting pending timers (`vi.getTimerCount()` returns
to its idle value after unmount), which goes red the moment the cleanup goes.
Recorded here because the failure mode — a guard that cannot fail — is the same
one D20 was about, one layer down.

`Math.max(0, remaining - 1)` inside the tick is the honest remainder: it is
unreachable from a mounted timer (the tick that would go negative is the tick
that stops it), and deleting it leaves the file green. Noted in the test rather
than covered by an assertion that would never fire.

## The two carried risks, closed by measurement

Both were questions about a live document that jsdom cannot answer — it has no
focus model worth trusting and no composition events at all. Both were measured
in a real host, and both **PASS**.

| # | Risk | Result | What was actually measured |
| --- | --- | --- | --- |
| V1 | **IME composition in a bound `Input`** | **PASS** | Driven with `Input.imeSetComposition` over CDP, so the browser really entered composition mode — proven by the page recording 5 `input` events with `isComposing === true` (7 composition events in total). The pre-edit advanced `startn → startni → startnih → startnihao` with no step dropped or reordered; the caret advanced 5→6→7→8→10 monotonically; focus never left the field; the node was never replaced; the commit `你好` landed once and reached `$state`; the other bound field stayed at `n0` |
| V2 | **A ticking `Timer` beside a focused `Input`** | **PASS** | The timer really ticked — 8 distinct values, `01:00` → `00:53`. Six characters typed as real key events across those ticks: all six landed in order, focus never left, the input node was never replaced, the caret advanced 1→2→3→4→5→6 and ended at the end of the text |

**Why a synthetic `CompositionEvent` would not have counted.** Dispatching one
from page script does not put the browser into composition mode, so a component
that clobbers the pre-edit would still look clean. The `isComposing === true`
requirement is what separates a real composition from a theatrical one, and it is
the reason V1 needed its own CDP driver rather than the existing `bsk` actions.

**Recorded, not defended.** The design writes `$state` on every `input`, the
pre-edit included. That is a defect only if it disturbs the composition, which
the six assertions above measure directly. It did not, and the behaviour is
written down here so a later reader does not rediscover it as a suspicion.

## Browser runs, and where the evidence lives

| Run | Claim | Result | Evidence |
| --- | --- | --- | --- |
| C1 | all eleven components render from one real program | PASS | `C1-eleven-components.json`, `screenshot-eleven-components.png` |
| V1 | IME composition survives the round trip | PASS | `V1-ime-composition.json` |
| V2 | a ticking Timer does not disturb a focused Input | PASS | `V2-timer-focus.json` |
| V3 | layout, colour and contrast in both schemes | PASS | `V3-themes.json` |
| V4 | the browser ran this build (§9) | PASS | `MANIFEST.json` → `hashGate` |
| V5 | edits survive refresh and history replay | PASS | `V5-persistence.json` |

Each probe refuses to run without a fresh smoke stamp and exits **2** when the
environment — not the product — is what failed, so an environment problem can
never be filed as a component failure.

**The §9 gate paid for itself on this run.** The profile held the *previous*
bundle: 354 465 bytes installed against a 375 564-byte build, because pnpm had
reported "already up to date" for a `file:` dependency while keeping the
hard-linked old copy. Measuring first would have produced a believable failure of
a correct build. The install was refreshed, both halves matched `4D071A86…`, and
only then was anything measured.

## One fidelity gap in the tests, not in the product (O1)

The unit spec calls `renderProgram` directly, which is `drawProgram` without the
backend's name-check pass. It therefore accepts `Action([@Set($v, 1)])` as an
`IconButton` action, while the live path correctly rejects that shape with
`VZO002 unknown component "Action"` — verified against the real validator. The
skill text generated from the signature tables documents a bare
`@Set($v, value)` step, so a model following it never writes the rejected form.

This is a **test-fidelity gap, not a live defect**: nothing a user can do reaches
it. It is recorded rather than fixed because changing the fixtures is a test-only
edit that belongs with the 4A-4 batch, not with an acceptance run whose charter
was minimal change.

## Environment problems, recorded as environment

The batch was closed on Linux, which is not where 4A-1 and 4A-2 were closed, so
the test baseline had to be rebuilt before any of the above meant anything.

**The Windows baseline of 15 failures does not exist on Linux: 14 of the 15
disappear.** They were all properties of the Windows test rig — 7 `EPERM` on
symlink/rename, 5 from `D:/work/...\~\AppData\...` path joining, 1 from a
`ctx.fs.readText` stub taking a different branch, 1 a cascade timeout, 1 a
description assertion. The fifteenth was D24.

Two consequences worth carrying:

- **A failure count is not portable; a failure *set* is.** "Unchanged at 15"
  was the right gate on Windows and is meaningless on Linux. What carried over
  was that each failure had a name and a cause.
- **"Known failure" needs an expiry.** D24 sat in that set by name for two
  phases without ever having run. The restated gate for later batches is the
  failure *set*, normalised, with each entry saying whether it has been seen to
  fail for the stated reason.

## What 4A-4 inherits

- A green baseline of **809 / 809** on Linux, and the instruction that a red run
  is investigated by cause, not compared to a number from another platform.
- `Timer` as the precedent for a component with **side effects on a clock**: the
  count and cleanup assertions in `tests/openui-inputs-4a3.spec.tsx` are the
  pattern for anything else that writes without a gesture.
- The IME/focus pair is **closed**, not inherited — see the measurement table
  above. What remains open is the 234-byte `source` redundancy in
  `session-log.md` §6, which needs an ADR rather than a renderer change.
- **The browser acceptance shape**, as working code: `probe-v1-ime-cdp.mjs`,
  `probe-v2-timer-focus.mjs`, `probe-v3-themes.mjs`, `probe-v5-persistence.mjs`
  and `probe-c1-eleven.mjs` in `evidence/phase-4a-3/`. Each refuses to run
  without a fresh smoke stamp and exits 2 for an environment failure, and
  `cdp-ime.mjs` is the minimal CDP driver for anything `bsk` cannot express —
  reuse them rather than rewriting the discovery.
- **A test-fidelity warning (O1)**: the jsdom spec bypasses the backend's name
  check, so it is slightly more permissive than the host. New fixtures in 4A-4
  should use the documented action form.
