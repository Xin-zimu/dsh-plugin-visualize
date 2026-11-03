# Phase 3 report — persistence and the interaction loop

**Date:** 2026-11-03
**Stage:** 3 (`STAGE.md`)
**Verdict:** **accepted — PASS**, with three cases recorded as unit-tested only.

## What this stage had to prove

That an OpenUI card is a *working interactive surface* in the real conversation,
not merely a parsed program: it draws, it responds, it survives a reload, and it
reappears where the reader actually looks after the host folds a finished turn.

Stage 2 had closed the loop inside the card. Stage 3 had to close it in the
product.

## Result against the exit criteria

| Criterion | Result | Evidence |
| --- | --- | --- |
| A reload restores what the user set | **PASS** | S04, T2, A07 — browser |
| A Button's action changes state | **PASS** | A01–A04, A08 — browser |
| At least the Inputs group renders | **PARTIAL** | `Button` + `Slider` render; 11 Inputs components still missing (4A-2) |
| The differential run is unchanged | **PASS** | 31/31, 0 differences |

The third criterion is the one that is not fully met, and it is recorded that way
rather than reinterpreted. What stage 3 delivered is the *loop*, not the
catalogue.

## The four sub-stages

| Step | What it added | Verdict |
| --- | --- | --- |
| P3-01 | ADR-006 accepted as A′ | decided |
| P3-02…03 | `openui-state.ts`: record, key, hash, per-variable hydrate, self-repair | PASS |
| P3-04 | `intelligent_ui` toolview receives a session id | PASS |
| P3-05 | save/restore wired into the card | **S04 PARTIAL → PASS** |
| P3-06 | turn tail draws both backends through one descriptor reader | PASS |
| P3-07 | `@Set`, `@Reset`, `Action([...])` dispatch | PASS |

## Acceptance numbers

| Metric | Value |
| --- | --- |
| `npx vitest run` | **637 passed / 15 failed / 652** |
| Failure set vs the stage-2 baseline | **byte-identical** (15 vs 15, `Compare-Object` empty) |
| `tsc` host + client | both exit 0 |
| Language differential | **31/31 programs, 0 differences** |
| Browser checks passed | S04, P301–P304, T1–T8, A01–A04, A07, A08, A10 |
| Browser checks unit-only | **A05, A06, A09** — see below |
| Start of stage | 467 passed (end of stage 1) |

Closing run, re-executed at close rather than quoted from the previous session:
`evidence/phase-3/test-stage3-close.txt`,
`evidence/phase-3/differential-stage3-close.txt`.

## The browser record, and what it does not cover

Every claim above marked *browser* was measured on an isolated profile
(`tmp/dsh-p3`, `:3093`) with **no CSS overrides**, against a build whose SHA-256
was verified against the installed client bundle first (`AGENTS.md` §9). The
production desktop app on `:61582` was never touched.

**Three cases are unit-tested and browser-NOT-VERIFIED**, and are recorded that
way rather than folded into the pass count:

| Case | Why it is not browser-verified |
| --- | --- |
| A05 — invalid variable binding | Not expressible in openui-lang: the evaluator only produces a binding descriptor for a legal `$variable`. Tested against hand-built descriptors. |
| A06 — unsupported action has no side effect | Proving a negative requires observing a *missing* navigation or clipboard write, which the harness cannot see. |
| A09 — HTML regression | No HTML card was re-driven through its frame this session; it rests on `tests/frame-state.spec.tsx` (17/17, including the new cross-view pins). |

This distinction is the one the owner asked to keep explicit, and it matches
`AGENTS.md` §5: a passing unit test is not an accepted feature.

## Three decisions worth carrying forward

### 1. Upstream semantics are reproduced, not improved

`@Reset($a, $b)` carries bindings the upstream executor never reads
(`20-store.js:112-118`, `30-render.js:618-620`). The fork resets everything, the
same as upstream, and emits `action.reset-ignores-args` so the gap is visible in
a diagnostic. Extending the semantics would have been easy and wrong.

### 2. An action reads the render-time snapshot

`Action([@Set($n, $n + 1), @Set($n, $n + 1)])` yields `n + 1`, not `n + 2`:
steps apply in order, the later write wins, and no step re-reads what an earlier
one wrote. Not the most intuitive semantics, but it is upstream's, and it is
pinned by `tests/openui-actions.spec.tsx` so a future change must be a deliberate
compatibility decision.

### 3. A browser run must prove which bundle it loaded

`AGENTS.md` §9, added this stage. It earned its place on first use: the P3-07
run opened with a hash mismatch — the profile still held the P3-06 bundle — and
the check stopped the measurement before any product code was called FAIL.

The rule exists because the wrong conclusion is the *believable* one: a browser
test failing after a fix reads as a new defect, when the actual fault was an
install that never picked the fix up. That is exactly what happened in P3-06.

## Defects found and fixed

| Id | Defect | How it surfaced |
| --- | --- | --- |
| D11 | A merge-based state write could resurrect a variable hydration had refused, so self-repair never settled | reasoning about the repair loop; now `buildRecord` validates as `hydrateState` does |
| D12 | `readRecord` silently dropped a persisted descriptor instead of reporting it | the "unsafe" refusal reason was unreachable; values are now read as `unknown` and refused per variable |
| D13 | The new state spec was in neither tsconfig DOM list, so the host project compiled `card-state.ts` without `lib.dom` | `tsc` failure on `window` |
| D14 | `TurnCards` read cards with `visualizeMetaFrom`, dropping every OpenUI card | a browser run: the card existed in the DOM and never painted |
| D15 | `drawValue` resolved action descriptors as components, returning `null`, so every Button was inert | probing what the card actually rendered |
| D16 | A test fixture used a multi-line `Col([...])`, which the language forbids | `VZO125` from the parser |

D14 and D15 share a shape worth naming: **a narrower reader than the contract
drops a variant silently**. D14 dropped a backend; D15 dropped a value class.
Both were invisible to unit tests that only exercised the paths that worked.

## What stage 4 inherits

**4A — the component catalogue: 8 of 48 render.** Verified inventory
(`evidence/phase-3/component-inventory.txt`):

| Group | Total | Rendered | Missing |
| --- | --- | --- | --- |
| Layout | 9 | Col, Row, Card | Box, Grid, Carousel, Popover, Divider, Spacer |
| Text | 10 | Title, Text, Caption | Label, Badge, Link, List, ListItem, Quote, Code |
| Inputs | 13 | Button, Slider | IconButton, Pressable, Input, TextArea, Select, SegmentedControl, Checkbox, RadioGroup, DatePicker, Timer, Form |
| Drawing | 10 | — | Svg, G, Circle, Ellipse, Rect, Line, Path, Polyline, Polygon, SvgText |
| Media and data | 4 | — | Image, Icon, Table, Chart |
| Play | 2 | — | Flashcard, Celebration |

**A usability gap that belongs to 4A, found while closing this stage.** An
unrendered component is *accepted* by validation and drawn as an empty
container: `signatures.ts` declares all 48, so `Grid`, `Table` and `Chart` pass
with zero errors, and only a name the language does not know (`Map`) is rejected
(`evidence/phase-3/unrendered-component-check.txt`). The catalog said otherwise
and has been corrected. A card may therefore look blank while the program was
legal — until 4A is finished. Rejecting declared names would be worse: it would
split the validator from the table it is generated from.

**4B — three external actions**, each refused by name today:
`@OpenUrl` (protocol allowlist), `@CopyToClipboard` (real gesture only,
permission refusal handled), `@ToAssistant` (fill the composer, never
auto-submit).

## What this stage did *not* change

- No file under `src/backends/`: language semantics are untouched.
- No edit to any of the three upstream snapshots.
- No change to the storage architecture after ADR-006 was accepted.
- No new ADR: P3-06 and P3-07 were implementation gaps in an existing decision,
  not new decisions.
