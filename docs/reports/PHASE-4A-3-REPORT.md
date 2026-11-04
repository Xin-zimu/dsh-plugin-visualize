# Phase 4A-3 report — the rest of the Inputs group

**Date:** 2026-11-04
**Stage:** 4A-3 (`STAGE.md`)
**Verdict:** **IMPLEMENTED, not accepted.** No component in this batch has been
seen in a browser. Five of the six exit-gate items are met to the extent this
environment allows; two of them cannot be met here at all, and are recorded as
NOT VERIFIED rather than folded into a pass.

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
| 1 | Every component in the batch renders from a real program | **IMPLEMENTED** — all eleven draw; inventory 30 / 48 |
| 2 | Bound inputs write `$state` and survive a reload | **UNIT TESTED** — the loop is driven through the real card in jsdom; a real reload is untested |
| 3 | Layout, colour and contrast hold in both colour schemes | **NOT VERIFIED** — no host to measure against |
| 4 | The differential still reports 0 differences | **PASS** — 31/31, `differential.json` byte-identical |
| 5 | Browser evidence on an isolated profile, with the §9 hash check | **NOT VERIFIED** — no DSH host, no profile, no `bsk` daemon in this environment |
| 6 | `tests/<batch>` added; the 15-failure baseline unchanged | **PASS, restated** — 809 / 809 on Linux. The "15 failures" baseline was the Windows test rig; 14 of the 15 do not exist on Linux (§4) |

Items 3 and 5 are not "pending": they are **unreachable from where this batch was
closed**, and `AGENTS.md` §5 does not allow relabelling that as a pass.

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

## What this batch did *not* verify, and does not claim

Two risks are specific to this batch, and both are questions about a live
document that jsdom cannot answer — it has no focus model worth trusting and no
composition events at all.

| # | Risk | Why it needs a browser | What to do |
| --- | --- | --- | --- |
| V1 | **IME composition in a bound `Input`.** Every keystroke writes `$state` and re-evaluates the whole program; the field's value *is* that state. Whether a pinyin composition survives the round trip is unmeasured | Composition events and the candidate window do not exist in jsdom | In a real card, type `今天` with a pinyin IME into an `Input(…)` bound to `$t`. Pass: all characters land, no interruption of the candidate window, and a sibling `Text(@Format(…))` agrees |
| V2 | **A ticking `Timer` beside an `Input`.** The countdown writes `$state` once a second, so the whole card re-evaluates once a second. Whether the focused field keeps focus, caret and half-typed text is unmeasured | Focus and caret behaviour under re-render is a browser property | Put `Timer($s, …)` and `Input($n, …)` in one card, focus the input, start the timer, type slowly for 5 s. Pass: focus and caret never move, no character is lost |

Neither has been observed failing. They are recorded as **risks**, not defects,
so that the local acceptance run tests them on purpose instead of by accident.

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
- Two open questions that are *not* this batch's to close: the IME/focus pair
  (above), and the 234-byte `source` redundancy in `session-log.md` §6, which
  needs an ADR rather than a renderer change.
