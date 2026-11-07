# STAGE.md — the stage we are in

Updated whenever a stage is entered or exited. This is the document that tells
an agent what it may touch **today**. `PLAN.md` says what the project is;
this says what the current slice is allowed to do.

## Stage status

| Stage | Name | Status |
| --- | --- | --- |
| 0 | Baseline | **Done** |
| 1 | Fork skeleton, dual-backend seat | **Done** |
| 1.1 | OpenUI render loop (was the stage-1 gap) | **Done** |
| 1.2 | Real-browser integration verification | **Done — B01–B11 recorded** |
| 1.3 | Closing B07 (layout) and B08 (dark theme) | **Done — both PASS in a browser** |
| 2 | OpenUI language core | **Done — differential 31/31, browser S01–S03 PASS, S04 PARTIAL** |
| 3 | Persistence and the interaction loop | **PASS — closed 2026-11-03**; `docs/reports/PHASE-3-REPORT.md` |
| 4A | Component catalogue: 48 renderers, in five batches | **PASS — closed 2026-11-05** (48/48); `docs/reports/PHASE-4A-5-REPORT.md` |
| 4B | External actions: `@OpenUrl`, `@CopyToClipboard`, `@ToAssistant` | **PASS — closed 2026-11-05.** `@CopyToClipboard` shipped (ADR-013); the other two Deferred — **reasons corrected 2026-11-06** (4B-2), verdict unchanged |
| 4B-2 | Re-testing the two deferrals against the real host | **CLOSED 2026-11-06 — investigation only.** Both are EXTENDABLE; neither ships. `docs/reports/PHASE-4B-2-INVESTIGATION.md` |
| 5 | Unified prompt, security review, release | **DONE — released `v0.1.0` 2026-11-06** at `40b8241`. Browser gates verified on a real host running this build; 15 failures adjudicated. `docs/reports/PHASE-5-FINAL-GATE.md` |
| 6 | Test reliability and technical debt | **PASS — closed 2026-11-06.** 3 product bugs found and fixed; **946/946 green on CI Linux and CI Windows (0 skipped on either)**, and 942 passed / 4 skipped / 946 locally, where the 4 are the tests that need a symlink privilege this machine lacks. `evidence/stage-6/` |
| 7A | Host capability investigation + `@ToAssistant` ADR | **CLOSED 2026-11-07 — investigation only, no product code.** Installed host is **0.2.2-rc.1** (4B-2 read stale 0.2.1-rc.5). Confirmation now exists; **one** host change left (message attribution). `docs/reports/STAGE-7A-HOST-CAPABILITIES.md`, `docs/decisions/ADR-016-TO-ASSISTANT-STAGE-7A.md` |
| 7B | `@ToAssistant` implementation | **Gate 1 done (owner: Option B). Gate 2 done: real-host pre-validation PASSED** for the confirmation half, with three measured limits (`evidence/stage-7b/real-host/`). **Gate 3 (upstream provenance) not started; no product code yet.** |

**Stage 3 is closed.** Accepted 2026-11-03 on 637 passed / 15 failed (failure set
identical to the upstream baseline), `tsc` clean on both projects, the language
differential at 31/31, and browser evidence for S04, P301–P304, T1–T8 and
A01–A04/A07/A08/A10. Three cases — A05, A06, A09 — are **unit-tested but not
browser-verified** and are recorded that way, not folded into the pass set.

Stage 1.1 closed the gap stage 1 shipped with: the client dispatches on the
card's discriminant. Stage 1.2 then verified it in a real DSH web session — and
found two defects that no unit test could have caught:

- the bundle registered the pre-fork package id, so the host refused to activate
  the plugin at all;
- a lone Button was centred because a flex column defaults to centring.

Both are fixed. B01–B11 are recorded in `evidence/browser-phase-1/MANIFEST.json`;
B05 (streaming) and B10 (session switching) remain **NOT VERIFIED** by scope,
not by failure.

Stage 1.3 then closed B07 and B08 with browser evidence, and found something
bigger than either case: **not one of the 12 CSS variables the OpenUI card
referenced had ever resolved.** The card was written in the frame vocabulary
that only exists inside the HTML backend's sandboxed iframe, so every
`var(--…)` was invalid at computed-value time. The Button had no background,
no border and square corners throughout stage 1.2, while every unit test
passed. Fixed with a `HOST_TOKENS` bridge on the card root; four further
defects (border shorthand, an AA-failing dark button, a divergent title, an
offset palette) went with it. Record: `evidence/browser-phase-1/MANIFEST-1.3.json`.

---

## Stage 2 — OpenUI language core

**Goal.** Make the openui backend able to *evaluate* a program, not merely
accept or reject its syntax.

**Prerequisites.** Stage 1 accepted. `upstream/dsh-intelligent-ui` present at
its pinned commit.

**In scope.**
- `src/backends/openui/evaluate.ts` (new), ported from
  `upstream/dsh-intelligent-ui/src/lang/evaluate.js`.
- `src/backends/openui/functions.ts` (new), ported from
  `upstream/dsh-intelligent-ui/src/lang/functions.js`.
- Widening `src/backends/openui/signatures.ts` toward the full 48 / 73.
- `tests/openui-language.spec.ts`.

**Out of scope.** Do not touch `src/client/`. Do not change the HTML backend.
Do not add components whose renderer does not exist yet.

**Prohibited.** Adding a name to `signatures.ts` that `functions.ts` cannot
evaluate — the whole point of generating the skill text from the tables is that
this cannot happen.

**Exit criteria** — all of these, each with evidence:
1. Every one of the 73 functions in the upstream table exists and is callable.
2. Every one of the 48 components exists in the signature table.
3. The upstream language test corpus parses *and* evaluates with the same
   diagnostics as `upstream/dsh-intelligent-ui/test/lang.test.mjs`.
4. A behavioural differential run against upstream shows no unexplained
   difference.

**Verification.** `npx vitest run tests/openui-language.spec.ts` plus a
differential script whose output is saved under `evidence/phase-2/`.

**Evidence location.** `evidence/phase-2/`.

**Promotion condition.** Exit criteria met, `docs/upstream/MIGRATION_MATRIX.md`
rows for the two new files marked *ported and verified*, and a phase report
written at `docs/reports/PHASE-2-REPORT.md` (to be created on exit).

---

## Stage 3 — Persistence and the interaction loop (PASS, closed 2026-11-03)

**Goal.** Finish what stage 2 started in the browser: `$state` did not survive a
reload, Button actions did nothing, and a folded conversation did not show an
OpenUI card at all.

**Verdict: PASS.** Full record: `docs/reports/PHASE-3-REPORT.md`.

| Delivered | Evidence |
| --- | --- |
| `$state` persists through the shared `cardStates` store (ADR-006, A′) | S04, A07 |
| The turn tail draws both backends through one descriptor reader | T1–T6 |
| `@Set`, `@Reset`, `Action([...])` dispatch through the state channel | A01–A04, A08 |
| Session isolation and history replay, in a browser | T7, T8 |

**One exit criterion was formally narrowed rather than quietly reinterpreted.**
The committed criterion (`git show HEAD:STAGE.md`) was *"at least the Inputs
group renders"*, and the measurement is `Button` + `Slider` of 13. The verdict
**PASS stands**, and the criterion is amended by **ADR-007** to what was
actually verified: *one* Inputs component renders **and binds `$state`**,
proving the input → state → re-evaluate → persist loop end to end. The eleven
missing Inputs components are assigned to 4A-3, not dropped. This is a scope
adjustment with a decision record behind it, not a PASS asserted over an unmet
bar.

**Recorded as unit-tested, NOT browser-verified:** A05, A06, A09. Their reasons
are in the report; they are not counted as browser passes.

---

## Stage 4A — The component catalogue (4A-1…4A-5 PASS)

**Goal.** Turn the signatures the language already understands into components
the browser actually draws. Measured inventory — **48 / 48** — from
`tests/openui-inventory.spec.tsx`, which reads the renderer's own table rather
than a hand-kept list.

| Group | Total | Rendered | Missing |
| --- | --- | --- | --- |
| Layout | 9 | Col, Row, Box, Grid, Card, Divider, Spacer, Carousel, Popover | **— complete** |
| Text | 10 | Title, Text, Caption, Label, Badge, Link, List, ListItem, Quote, Code | **— complete** |
| Inputs | 13 | Button, Slider, IconButton, Pressable, Input, TextArea, Select, SegmentedControl, Checkbox, RadioGroup, DatePicker, Timer, Form | **— complete** |
| Drawing | 10 | Svg, G, Circle, Ellipse, Rect, Line, Path, Polyline, Polygon, SvgText | **— complete** |
| Media and data | 4 | Table, Chart, Icon, Image | **— complete** |
| Play | 2 | Flashcard, Celebration | **— complete** |

**In scope.** `src/client/` only, plus each batch's tests.

**Out of scope.** Language semantics. The differential must stay at 31/31 with
0 differences after every batch. No new component may be added to
`signatures.ts` that the renderer cannot draw — the table is the contract.

**Batches, in dependency order.** Each is its own sub-stage with its own
evidence, and none starts until the previous one is accepted:

| Batch | Components | The risk it carries |
| --- | --- | --- |
| **4A-1** | `Box`, `Divider`, `Spacer`, `Grid` | sizing, spacing and theme parity with the frame vocabulary — the class of defect that produced D6/D7 |
| **4A-2** | `Label`, `Badge`, `Link`, `List`, `ListItem`, `Quote`, `Code` | text semantics: a `Link` is the first URL the card can render, so protocol policy lands here |
| **4A-3** | `Input`, `TextArea`, `Select`, `SegmentedControl`, `Checkbox`, `RadioGroup`, `DatePicker`, `Timer`, `Form`, `IconButton`, `Pressable` | every one binds `$state`, so all of them reuse the P3 persistence and `@Set` path — this is where the loop's generality is proven |
| **4A-4** | `Table`, `Chart`, `Icon`, `Image` | data shapes, axes, responsive layout, and image loading under the existing guards |
| **4A-5** | `Svg`, `G`, `Circle`, `Ellipse`, `Rect`, `Line`, `Path`, `Polyline`, `Polygon`, `SvgText`, `Flashcard`, `Celebration`, `Carousel`, `Popover` | drawing primitives and disclosure; `Popover` is the only one that overlays the host document, so it needs its own containment check |

**Exit criteria for each batch** — all of these, each with evidence:
1. Every component in the batch renders from a real program.
2. Bound inputs write `$state` and survive a reload (4A-3 onward).
3. Layout, colour and contrast hold in **both** colour schemes.
4. The differential still reports 0 differences.
5. Browser evidence on an isolated profile, with the `AGENTS.md` §9 hash check.
6. `tests/<batch>` added; the 15-failure baseline unchanged.

**Evidence location.** `evidence/phase-4a-<n>/`, each with a `MANIFEST.json`.

### 4A-1 — layout primitives (PASS, closed 2026-11-03)

**Scope.** `Box`, `Divider`, `Spacer`, `Grid`. Four components, four distinct
layout mechanisms: nested flex with explicit sizing, a hairline rule, elastic
space, and a responsive grid.

**Verdict: PASS.** Full record: `docs/reports/PHASE-4A-1-REPORT.md`.

| Gate item | Result |
| --- | --- |
| All four have real renderers | PASS — inventory 12 / 48, measured from the renderer's own table |
| Arguments match the signature table | PASS |
| Every CSS variable resolves in the real host | PASS — **after fixing two that did not** (D17, D18) |
| Light and dark both pass | PASS — dark entered through the host's own 外观 control |
| Tool view and turn tail both display | PASS — 1 fold + 1 tail |
| Refresh and history replay | Refresh PASS; **cross-generation replay NOT VERIFIED** (A9) |
| No new failures; TypeScript passes | PASS — 683 / 15, failure set identical |
| Build SHA-256 matches the test profile | PASS — both halves |
| Evidence, matrix and report updated | PASS |

**Three defects found, all by measuring rather than reading.** `--dsw-static-purple-500`
and `--dsh-font-family-text-default` do not exist in the DSH host: both resolved
to nothing and silently painted their fallbacks, which is D6/D7 again. The third
was the inventory probe itself — it mirrored the renderer's table as a
hand-written literal and kept reporting "8 / 48" after the renderers existed.
The renderer now exports `RENDERED_COMPONENTS` and a spec asserts against it.

**A9 is recorded as NOT VERIFIED, not as a pass.** The isolated profile's older
session cannot be loaded by this host build at all — its log carries
`job/registered` from a newer harness and `dsh 0.2.0-rc.2` refuses to interpret
it. No claim is made about multi-generation replay; single-session refresh replay
passed.

**Why this batch came first.** These four are the components every later batch
draws *inside*. Getting sizing, spacing and theme parity right here means
4A-2…4A-5 inherit a working layout instead of each rediscovering it.

**Carried into every later batch.** The three-layer variable probe
(`evidence/phase-4a-1/a1-probe.mjs`): a variable must be referenced, declared on
the card root, *and* name a host token that actually resolves. A
`getComputedStyle().color` spot check does not catch this class.

**Prohibited in this batch, and observed.** No host CSS was modified in any run;
no name was added to `signatures.ts`; the differential stayed 31/31.

### 4A-2 — the text group (PASS, closed 2026-11-04)

**Scope.** `Label`, `Badge`, `Link`, `List`, `ListItem`, `Quote`, `Code` — the
seven that complete the Text group.

**Verdict: PASS.** Full record: `evidence/phase-4a-2/MANIFEST.json`.

| Gate item | Result |
| --- | --- |
| All seven have real renderers | PASS — inventory 19 / 48, Text group complete |
| Arguments match the signature table | PASS — every position asserted |
| Every CSS variable resolves in the real host | PASS — **after fixing one that did not** (D21) |
| Light and dark both pass | PASS — dark entered through the host's own 外观 control |
| Tool view and turn tail both display | PASS on the conversation surface |
| Refresh and history replay | Not re-exercised: no 4A-2 component binds `$state` |
| No new failures; TypeScript passes | PASS — 747 / 15 at the verdict; 749 / 15 after the two structural guards added at close |
| Build SHA-256 matches the test profile | PASS — client half, before the accepted run |
| Evidence, matrix and report updated | PASS |

**The security decision this batch carried, and did not improvise.** `Link` is
the first component whose output a reader can activate, and the card is mounted
in the host document rather than inside the HTML backend's frame — so a
`javascript:` href would run in the host's own origin. **ADR-008** decides the
policy before the renderer existed: a positive, closed allowlist of absolute
`http:`/`https:` URLs, **parsed with `new URL` rather than pattern-matched**,
with everything else degrading to plain text. Upstream's looser predicate admits
protocol-relative `//host/x`, `mailto:`, `tel:`, root-relative paths and
fragments; the fork refuses all five and is therefore **stricter, not merely
different**.

**Three defects, all found by measuring rather than reading.**

- **D20 — a nested `ListItem` drew two rows for one item.** `List([ListItem(...)])`
  produced two `role="listitem"` elements because the walker had already drawn
  the `ListItem` into a complete row and `List` then wrapped it in a second one.
  Seen first as a screenshot that seemed to show a bullet *and* a check; resolved
  from the DOM, where the row count was 5 for a 4-item program. Fixed by letting
  `List` consult the raw descriptor. This is the batch's most instructive defect:
  every unit test passed while the live card was wrong.
- **D21 — `--font-mono` does not exist in the host.** The frame vocabulary
  declares it; the host document does not. Bridging to it would have been
  D17/D18 a fourth time. Measured the candidates first and bridged to
  `--dsw-font-markdown-code-font-family`, which does resolve.
- **D22 — three light-theme colours failed AA.** `Link` was 4.23:1 because
  `--primary` is a *surface fill*, and the copy button and list marker were
  3.71:1 because they inherited the tertiary tier. `Link` gained its own
  measured colour (5.39:1 light / 5.42:1 dark); small supporting text gained
  `--muted-foreground-strong` on the host's **secondary** tier (5.8:1 / 12.11:1),
  which is the tier upstream used for exactly these roles.

**Deliberately not changed.** `--muted-foreground` still bridges to the host's
tertiary tier, which measures 3.71:1 on white. `Caption` uses it and `Caption`
is a browser-verified 4A-1 component; a later batch does not get to silently
restyle an accepted one. The new AA-safe tier is additive.

**Carried forward.** 29 components remain (4A-3…4A-5). The three-layer variable
probe and the measured-token allowlist in `tests/openui-layout-4a1.spec.tsx` both
caught work in this batch — the allowlist refused `--font-mono` and
`--dsw-alias-label-secondary` until each had a measurement behind it.

---

### 4A-3 — the rest of the Inputs group (PASS, closed 2026-11-04)

**Scope.** `Input`, `TextArea`, `Select`, `SegmentedControl`, `Checkbox`,
`RadioGroup`, `DatePicker`, `Timer`, `Form`, `IconButton`, `Pressable` — the
eleven that complete the Inputs group, 13 / 13.

**Verdict: PASS.** Record: `docs/reports/PHASE-4A-3-REPORT.md`; manifest
`evidence/phase-4a-3/MANIFEST.json`. The batch was closed as IMPLEMENTED on a
cloud sandbox with no host; it is accepted here, on a real DSH install, where the
browser half of the gate finally became measurable.

| Gate item | Result |
| --- | --- |
| All eleven have real renderers | PASS — inventory 30 / 48, Inputs group complete, and **all eleven counted by structure in the host DOM** (C1) |
| Arguments match the signature table | PASS — one writable slot per control, always the first, asserted against `BINDING_ARG` |
| Bound inputs write `$state` and survive a reload | PASS in a browser — typed values survived a real reload *and* a history replay (V5) |
| Layout, colour and contrast in both schemes | PASS — both schemes entered through the host's own 外观 control; 21 variables per card all resolve; min contrast 5.8:1 light / 12.11:1 dark (V3) |
| Differential still 0 differences | PASS — 31/31, `differential.json` byte-identical |
| Browser evidence on an isolated profile, with the §9 hash check | PASS — isolated server on :3093 + bsk 0.4.1; G0 compares both SHA-256 values and they match (V4) |
| `tests/<batch>` added; failure baseline unchanged | PASS — 43/43 on the batch spec; Windows 794/15/809 with the failing **set** identical to the recorded baseline, name by name |

**The §9 gate earned its keep on this run.** The profile held the *previous*
bundle (354 465 bytes against a 375 564-byte build): pnpm had reported
"already up to date" for a `file:` dependency while keeping the hard-linked old
copy. Measuring first would have produced a believable failure of a correct
build. The install was refreshed, both hashes matched `4D071A86…`, and only then
was anything measured.

**One state path, reused rather than rebuilt.** Every renderer reads the bound
slot, draws it, and calls `write(name, next)`. No renderer keeps a copy of a
bound value, so none can drift out of sync with `$state`. `IconButton` and
`Pressable` carry their action through `write.runAction`, the channel `Button`
already used — deliberately not a second route into state.

**The two carried risks were closed by measurement, not by argument.**

1. **IME composition (V1).** Driven through `Input.imeSetComposition` over CDP,
   so the browser really entered composition mode — proven by the page recording
   5 `input` events with `isComposing === true`. The pre-edit advanced
   `n → ni → nih → nihao` with no step dropped or reordered, the caret advanced
   monotonically, focus never left the field, the node was never replaced, and
   the commit `你好` landed once and reached `$state`. A synthetic
   `CompositionEvent` would *not* have proved this: the browser does not enter
   composition mode for one, so a component that clobbers the pre-edit still
   looks clean.
2. **A ticking `Timer` beside a focused `Input` (V2).** The timer really ticked
   (8 distinct values, `01:00` → `00:53`). Six characters typed as real key
   events across those ticks: all six landed in order, focus never left, the
   input node was never replaced, and the caret advanced `1…6`.

**One fidelity gap found in the test, not the product.** The unit spec calls
`renderProgram` directly, which skips the backend's name check, so it accepts
`Action([@Set($v, 1)])` where the live path correctly rejects it with
`VZO002 unknown component "Action"`. The skill text documents a bare
`@Set($v, value)` step, so a model never writes the rejected form. Recorded as
observation O1 in the manifest and left for the 4A-4 test batch: it is a
test-only edit and out of this run's minimal-change scope.

**Three defects closed on the way, none in product code.** D23: `pnpm run build`
did not work on a clean machine, because `tsdown` lists `unrun` as an optional
peer and pnpm never installed it — the build depended on the developer's store.
D24: `card-images.spec.ts` carried a meta-size assertion that had never executed
(it failed three lines earlier on Windows) and that measured the host's temp path
instead of the payload. D25: the first `Timer` cleanup test passed for the wrong
reason — a leaked interval writes into a store a reload has already replaced — so
cleanup is now asserted by counting pending timers, a form that goes red when the
cleanup goes.

**Carried forward.** 18 components remain: 4 in 4A-4 (`Table`, `Chart`, `Icon`,
`Image`) and 14 in 4A-5.

---

### 4A-4 — media and data (PASS, closed 2026-11-04)

**Scope.** `Table`, `Chart`, `Icon`, `Image` — the four that complete the Media
and data group, 4 / 4.

**Verdict: PASS.** Record: `docs/reports/PHASE-4A-4-REPORT.md`; manifest
`evidence/phase-4a-4/MANIFEST.json`.

| Gate item | Result |
| --- | --- |
| All four have real renderers | PASS — inventory 34 / 48, Media and data complete, and all four counted by structure in the host DOM |
| Arguments match the signature table | PASS |
| Bound inputs write `$state` and survive a reload | N/A — none of these four is an input. The loop is unchanged since 4A-3 (V5) |
| Layout, colour and contrast in both schemes | PASS — 25 text samples per scheme over chart axis, legend, table head and cells; min contrast 5.8:1 light / 12.11:1 dark |
| Differential still 0 differences | PASS — 31/31, `differential.json` byte-identical |
| Browser evidence on an isolated profile, with the §9 hash check | PASS — isolated host on :3093 + bsk 0.4.1; both halves matched `62AD5817…` before measuring |
| `tests/<batch>` added; failure baseline unchanged | PASS — `tests/openui-media-4a4.spec.tsx` 21/21; Windows 821/15/836 with the failing **set** identical name by name |

**The batch's real risk was security, not rendering, and it was decided before
the code.** Two ADRs exist because two components take an argument from the model
that the host acts on:

- **ADR-009 — `Image` source policy.** A real `<img>` only for an absolute
  `http:`/`https:` URL, parsed with `new URL` and never pattern-matched. `data:`,
  `blob:`, `file:`, `javascript:`, protocol-relative and relative sources render
  the alt text in a bordered placeholder naming the reason. This matters more
  here than it did for `Link`: the OpenUI card is mounted in the **host
  document**, not the HTML backend's sandboxed iframe, so a hostile `src` is a
  host-origin question.
- **ADR-010 — `Chart` contract.** Row objects in, countable SVG out. Not a
  Chart.js clone, no options object, no animation or tooltips (recorded as out of
  scope so a later batch adds them as a decision rather than a drift). Invalid
  data draws a **stated refusal**; a non-finite value is a **gap counted in a
  notice**, never a coerced zero. A chart that plots `NaN` as `0` is lying about
  the data.

**`Icon` draws its own name, and says so.** No icon set ships in this build,
which keeps the dependency tree closed for the same reason ADR-010 keeps the
chart contract small. A named glyph renders as its name inside a bordered box —
honest and readable — rather than as an empty square that reads as a rendering
failure. Swapping in a real set later is a substitution, not a rewrite.

**O1 is closed.** 4A-3 recorded that the unit spec bypassed the backend's name
check. `tests/openui-validate-gate.spec.ts` now runs fixtures through
`openuiBackend().validate()`, the same entry the tool path uses, and asserts
both directions: the documented bare `@Set` form is accepted, and `Action([...])`
is rejected with `VZO002`, which is what the live host does.

**Four mutations were used to prove the guards can fail**, and all four were
restored: `Image` accepting every scheme (2 tests red), a chart coercing gaps to
zero (2 red), `Table` not padding a short row (1 red), and the validate gate
stubbed to return no errors (2 red).

**Carried forward.** Nothing. Stage 4A is complete: all 48 declared components
are drawn, and `tests/openui-inventory.spec.tsx` asserts the rendered set equals
the declared set rather than a remembered count.

### 4A-5 — drawing, disclosure and play (PASS, closed 2026-11-05)

**Scope.** `Svg`, `G`, `Circle`, `Ellipse`, `Rect`, `Line`, `Path`,
`Polyline`, `Polygon`, `SvgText`, `Flashcard`, `Celebration`, `Carousel`,
`Popover` — the last fourteen, taking the inventory from 34/48 to 48/48.

**Decisions.** ADR-011 (SVG values are grammar-validated and re-serialised) and
ADR-012 (`Popover` is inline, clamped to the card, non-modal, no focus trap).
Both were written before the renderers.

**Exit criteria, and where the evidence is:**

| Criterion | Evidence |
| --- | --- |
| Every component renders from a real program | `tests/openui-inventory.spec.tsx`, one legal program per name |
| Layout, colour and contrast in both schemes | `evidence/phase-4a-5/C1-drawing-disclosure.json` — 8 paint samples in dark, minimum 5.58:1 |
| Differential still 0 | unchanged; no language semantics were touched |
| Browser evidence on an isolated profile, §9 hash checked | 45/45, bundle hash matched before measuring |
| Batch tests added; 15-failure baseline unchanged | 904 tests, failure set identical name by name |

**Two defects were found here, not by a unit test.** The validator rejected the
documented `Action([...])` form (`VZO002`), and `Celebration` never fired for a
bare-variable condition because the argument arrives as a binding marker and
`boolOf` on that object is constant true. Both were reproduced before being
fixed, both have a mutation-verified regression test, and both are recorded in
`docs/reports/PHASE-4A-5-REPORT.md`.

**Carried forward.** Nothing from this batch.

---
## Stage 4B — External actions (PASS: one shipped, two deferred)

**Closed 2026-11-05.** One action ships; two are deferred for want of a host
capability, which the stage was explicitly allowed to conclude rather than force.

| Action | Outcome | Requirement before it may ship |
| --- | --- | --- |
| `@CopyToClipboard` | **SHIPPED** (ADR-013) | Only from a real user gesture, and the control shows the exact text first; a refused permission is reported, never thrown |
| `@OpenUrl` | **Deferred** (ADR-014) | Needs a host-mediated open. `window.open` and `location.assign` are forbidden: the card must not decide to navigate |
| `@ToAssistant` | **Deferred** (ADR-015) | Needs a host-mediated submit. Never by DOM manipulation or synthetic input, which would produce a message the host cannot attribute or refuse |

**The finding that outlived the stage.** A capability has three states, not two:
*not available*, *available but unauthorised*, and *available and authorised*.
`@CopyToClipboard` is the middle one — `navigator.clipboard` is one call away, so
nothing but policy stands between the program and the effect. **A callable browser
API is evidence of possibility, never of permission.**

**Exit criteria, all met.**

| Criterion | Evidence |
| --- | --- |
| One ADR per action | ADR-013 (accepted), ADR-014 and ADR-015 (Deferred), plus the shared `ADR-4B-THREAT-MODEL.md` |
| Every refused path has a test | `tests/openui-clipboard-4b.spec.tsx`, 19 tests across the ten ADR categories |
| Guards proved able to fail | 7 mutations, each turning 1–6 tests red |
| Browser evidence the allowed path works | OS clipboard read back after one real CDP click: sentinel → `sk-live-SHOULD-NOT-LEAK` |
| Browser evidence the refused paths do nothing | `@OpenUrl` clicked: tab count unchanged, clipboard unchanged |
| The other two stay refused | asserted at dispatch and by an inert Button |

Also fixed, from an earlier stage: `Code`'s copy button reported "Copied" even
when the write was denied.

---

## Stage 4B-2 — the two deferrals re-tested (CLOSED 2026-11-06, investigation only)

**Scope, set by the owner:** determine whether the two Deferred actions can be
implemented honestly, and at what cost. Not to implement them, not to relax a
requirement, and not to re-stamp "Deferred" without investigating.

**Result: both are EXTENDABLE. Neither ships.** The stated reasons in ADR-014 and
ADR-015 were **false** and are corrected; the verdicts stand. Full report:
`docs/reports/PHASE-4B-2-INVESTIGATION.md`; evidence in `evidence/4b2/`.

| Action | Verdict | Why it still does not ship |
| --- | --- | --- |
| `@OpenUrl` | EXTENDABLE | A host-mediated open exists, but it is a **sidebar tab**, not an external open, and its iframe refusals are unobservable — the silent failure ADR-014 exists to prevent. Owner chose **C2**: keep the real meaning, seek an upstream plugin-callable open-external API |
| `@ToAssistant` | EXTENDABLE | Submission **is** reachable (`inputActions` is already a prop on this plugin's card) and role escalation is structurally impossible. Two ADR-015 properties remain unavailable: transcript **attribution**, and a **confirmation the card cannot fake**. Owner: **do not downgrade** |

**Exit criteria.**

| Criterion | Evidence |
| --- | --- |
| Host surface read, not inferred | `evidence/4b2/openurl-host-findings.md`, `toassistant-host-findings.md` — file:line into the installed asar |
| The decisive mechanism proved | `tmp/probes/cordis-scope-probe2.mjs` — 4 cases including a root-context negative control |
| The card's submit prop proved by type | `evidence/4b2/inputactions-type-probe.log` — positive probe + satisfied `@ts-expect-error` + a mutation that fails `TS2339` |
| No product code, no requirement relaxed | `git diff --stat` at the time: docs and evidence only |

**The finding that outlived this stage**, and it is a correction to 4B's own
three-state table: *the host having a capability* and *the host having it with the
safety properties an action needs* are different findings. Both actions moved from
"the API is missing" to "the API exists but cannot be offered to a user safely."
That is a better position: the remaining work is now specific enough to ask for.

**Two traps recorded so they are not rediscovered.** `InputState.phase` cannot be
used as an in-flight guard — a plain send leaves it `'plain'` for the whole flight.
And an archived session *accepts* a prompt and then blocks the turn, so optimistic
card UI would lie about delivery.

---

## Stage 5 — Unified prompt, security review, release

Both skills merged into one, with the backend-choice rule; a full security pass
recorded in a new `docs/testing/SECURITY_TEST.md`; packaging, install and
uninstall tests; a `CHANGELOG.md` entry; first tagged release.

### Resumed 2026-11-06 after 4B-2

The audit was paused to investigate the two deferrals. It resumes on **the original
release scope**, which is unchanged: neither Deferred action is in this release, and
4B-2 does not widen it. Two things were required before resuming, and both are done:

1. **The false premise was corrected** in ADR-014, ADR-015 and the shared
   `ADR-4B-THREAT-MODEL.md`, in `README.md`, `CHANGELOG.md` and the component
   catalogue. The original text is preserved and marked in place; each ADR carries
   an amendment section. **Neither ADR was promoted to Accepted**, and no requirement
   was relaxed.
2. **The refusal feedback still works**, and that is now proved rather than assumed:
   re-inserting the two names into `SUPPORTED_STEPS` turns **6 tests red** across
   3 files, then the file was restored byte-identically and all 59 pass again
   (`evidence/phase-5-rc2/refusal-guard-mutation.txt`).

**Evidence grades are kept separate** and are not interchangeable:

| Grade | What it can support | Where |
| --- | --- | --- |
| **Read** | "the source says X" | `evidence/4b2/*-findings.md` |
| **Type** | "the compiler agrees the contract is X" | `evidence/4b2/inputactions-type-probe.*` |
| **Ran** | "a command produced X, and its output is saved" | `evidence/phase-5-rc2/*` |

4B-2 is **Read and Type only**. No browser was driven this round; nothing in it is
claimed as verified behaviour, and it must not be cited as such.

**Exit criteria for Stage 5** are the original ones plus one: every release-gate
claim has a **Ran** artefact on the current HEAD, and anything not re-run is listed
as NOT VERIFIED rather than inherited from the earlier audit.

**This stage does not declare the release.** It produces the evidence; the decision
belongs to the owner.


---

## Stage 6 — Test reliability and technical debt

**Opened 2026-11-06**, immediately after `v0.1.0`. No new components, no new actions.
The release standard was met; this stage exists because it was met with 15 red tests and
three known caveats, and a suite nobody trusts stops being a safety net.

### The premise this stage corrected on day one

The Stage 5 close-out described the 15 failures as platform-shaped. Investigating them
found that **one of them is a real product bug that Windows merely exposed**, and that the
failure list's own framing had been hiding it:

> `displayOf()` (`src/storage.ts:429-432`) shortens a home-prefixed path to `~` plus the
> remainder. On Windows the remainder starts with a backslash, so it emits
> `~\AppData\Local\Temp\...`. Both consumers (`:150`, `:219`) only accept `~` or `~/`.
> **So the tool hands back a path it will refuse when the model returns it.**

Why Linux CI never saw it: `tmpdir()` is `/tmp` on Linux, **outside** `homedir()`, so
`displayOf()` is a no-op for every temp-based test path. On Windows `tmpdir()` is
`C:\Users\<u>\AppData\Local\Temp`, **inside** `homedir()`, so every temp path is
shortened and the bug fires. The tests were right; the product was wrong.

This is the third time in this project that a "known platform failure" turned out to be a
product defect once someone read it instead of counting it.

### Work items

| Priority | Item | Note |
| --- | --- | --- |
| **P0** | fs mock missing `readText` | The fake is incomplete, not the product: `readText` is declared at `dsh-fs/lib/types/index.d.ts:162` |
| **P0** | `tool.spec.ts` description fixture | No skill provider registered, so the description cannot name a contract. Fix the fixture, not the assertion |
| **P0** | The 5,020 ms timeout | Carried for two stages as "a timeout is not a diagnosis". Diagnose it |
| **P1** | `~` round-trip bug | **Product code.** Regression test must be seen red first |
| **P1** | Symlink containment coverage | See below — the honest answer is not "make it green" |
| **P2** | `@ToAssistant` runtime probe | Deferred to a later session; not started here |
| **P2** | `@OpenUrl` upstream request | Deferred; continues as a separate workstream |

### The symlink item, decided rather than dodged

Six failures are symlink-containment tests. On this machine `fs.symlink` fails with
`EPERM`: creating a symlink needs Developer Mode or elevation. Measured, not assumed:

| Capability | Result |
| --- | --- |
| file symlink (`fs.symlink`) | **EPERM** |
| directory symlink (`type: 'dir'`) | **EPERM** |
| directory **junction** (`type: 'junction'`) | **OK** |
| file **hardlink** (`fs.link`) | **OK**, but not a substitute (below) |
| junction `realpath()` | **resolves through** — the containment logic sees it |

So the directory-escape half of each test **can** run here: replace the directory symlink
with a junction, a genuine reparse point that `realpath` resolves through. That preserves
the security assertion instead of skipping it.

A **hardlink is not a substitute** for the file half. A hardlink shares an inode, so the
file is not "reached through a link that leaves the tree" — `realpath` cannot see it, and
the containment property under test does not hold at all. Substituting one would test a
different property while appearing to cover the original. That is the failure mode
`PLATFORM-FAILURES.md` already warns about: *a skip added to hide a failure keeps hiding
whatever comes after it.*

**Decision:** split each test at the capability boundary. Directory escapes run everywhere
using a junction where a directory symlink is unavailable. The file-link escape keeps its
real symlink, gains a capability guard that is **visible as a skip with a stated reason**,
and continues to run on CI Windows and Linux, where the privilege exists. No test is
deleted, no assertion weakened, and the local suite's skip count becomes an honest number
rather than zero-by-omission.

### Exit criteria — status 2026-11-06

| # | Criterion | Status |
| --- | --- | --- |
| 1 | Local Windows green | **MET** — 942 passed / **0 failed** / 4 skipped / 946, counts close, `vitest` exit 0 |
| 2 | Every skip explicit and capability-stated | **MET** — 4 skips, all `it.skipIf(!linkCapability().fileSymlink)`, reason names `SeCreateSymbolicLinkPrivilege` |
| 3 | No security test weakened | **MET** — containment assertions unchanged; directory escapes still run here via junctions; traversal re-attacked (16 attempts, 0 escapes) |
| 4 | Every fix seen red first | **MET** — 35 artefacts under `evidence/stage-6/` |
| — | CI Windows + CI Linux | **MET** — run `42154196690` on `8788ee0`: both platforms **946 passed / 0 failed / 0 skipped**, `BUILDS IDENTICAL` |

The criteria, as originally written:

1. **Local Windows, CI Windows and CI Linux are all green** — not "fewer red".
2. **The skip count is explicit and justified**, one line per skip naming the missing OS
   capability. Zero skips is not the goal where the capability does not exist; an
   *unexplained* skip is.
3. **No security test weakened.** The containment assertions keep their exact expectations
   (`/through a symlink/u`, `/is not a card visualize can patch/u`). If a substitution
   cannot preserve an assertion, the test skips visibly instead of being reworded.
4. **Every fix has a regression test seen to fail first** (`AGENTS.md` §6), recorded under
   `evidence/stage-6/` with the red output kept.

### What this stage will not do

- It will not reopen Stage 5, and it will not touch the released tag.
- It will not implement `@OpenUrl` or `@ToAssistant`. Their ADRs are settled; the runtime
  probe and the upstream request are separate workstreams.
- It will not raise the 5 s test timeout as a fix. If the wait is real work it gets
  diagnosed; if the bound is simply too low, that is a finding stated with numbers.

---

## Stage 7A — Host capability investigation and the `@ToAssistant` ADR

**Closed 2026-11-07 — investigation only.** Scope set by the owner: find out what the
installed DSH host actually offers, design `@ToAssistant`'s two preconditions as an ADR,
record `@OpenUrl`, and answer one question: **does this require changing the DSH host?**
No product code, no tag move, no release.

### The premise this stage corrected on day one

The Stage 4B-2 investigation read `tmp/dsh-host-src`, which is **0.2.1-rc.5**. The host
installed here is **0.2.2-rc.1** (`@deepseek-ai/dsh-desktop`; 331 `@deepseek-ai` entries, 321 `dsh-*` at 0.2.2-rc.1;
the app launches `app.asar/.../dsh-desktop-host/lib/cli.js`). Every 4B-2 `file:line` was
therefore stale, `dsh-client-ui-slots` no longer exists as a package, and `dsh-action-cards`
/ `dsh-client-ui-action-cards` are new. Provenance: `evidence/stage-7a/host-provenance.md`.

### The answer

| Question | Answer |
| --- | --- |
| Does `@ToAssistant` require a host change? | **Yes — one.** Host-validated, rendered **message attribution**. Submission, role enforcement and a host-rendered confirmation the card cannot fake already exist. |
| Does `@OpenUrl` require a host change? | **Yes, unchanged** — no plugin-callable external open exists in 0.2.2-rc.1. |

The confirmation no longer needs asking for: `ctx.userQuestions.ask()` is a host service with
**no turn check**, renders in the host composer outside the card iframe, and returns the
answer. The approval panel is a second, audited surface but is turn-bound (it throws outside
an open turn), so it cannot serve a card click between turns. Message attribution is the
remaining gap: the prompt wire has no source field, the host hardcodes `kind:'user'`, and
the transcript renders it as an unattributed bubble.

### Three-way classification (full table in the report)

| Capability | State |
| --- | --- |
| Message submission from plugin code | **exists and is usable** (`inputActions`, `session.prompt`, `agent.steer`) |
| Session + tool-call identity, frame cannot forge it | **exists and is usable** (slot props; opaque-origin iframe) |
| Host-rendered confirmation (plugin-callable) | **exists and is usable** (`userQuestions.ask`; approval panel in-turn only) |
| Verifiable submission result | **partial** — admission at plugin level; nothing at card level; delivery not observable per submission; archived sessions accept then block |
| Message-level card attribution | **absent** |
| Plugin-callable external open (`@OpenUrl`) | **absent** |

### Exit criteria — all met

| Criterion | Evidence |
| --- | --- |
| Host surface read from the installed host, not inferred | `evidence/stage-7a/host-provenance.{md,json}`, `asar-tool.mjs` (per-file SHA-256 against the asar) |
| Every conclusion carries source path / interface / call chain, graded Read/Type/Ran | `submit-capability.md`, `attribution-capability.md`, `confirmation-and-openurl.md` |
| Three-way classification (usable / internal-only / absent) | report §2 |
| At least two comparable design options, responsibilities, minimal interfaces, trust boundary, failure/cancel/timeout, security and compatibility cost, test methods | `ADR-016` §3–§8 |
| `@OpenUrl` recorded, not re-pointed at an unequal semantic | report §5; ADR-014 unchanged |
| **The exit question answered explicitly** | report §6: one host change (`@ToAssistant` attribution), one for `@OpenUrl` |
| No product code, no tag, no release | `git diff --stat` for this stage: docs + evidence only |

### Stage 7B — Gate 2 done, Gates 3–4 pending

Owner decision (2026-11-07): **ADR-016 Option B**, but validate the existing confirmation
mechanism on a real host **before** asking upstream, and do not pre-emptively add a second
host API (Option C).

| Gate | State |
| --- | --- |
| **1. Decision recorded** | **DONE** — Option B accepted in ADR-016; no implementation authorised by the decision alone |
| **2. Real-host pre-validation** | **DONE — PASSED** on an isolated DSH 0.2.2-rc.1 host (`evidence/stage-7b/real-host/`) |
| **3. Upstream provenance change** | **Not started** — one host-validated `origin` claim on the prompt admission path + rendered marker (ADR-016 §3) |
| **4. Implementation + security acceptance** | Not started; blocked on Gate 3; ADR-016 §7 cases + §8 criteria |

**What Gate 2 measured, and what it changes:**

1. `userQuestions.ask()` works **outside a turn** — before any turn (1,340 ms) and after a
   real turn ended (2,030 ms), with the host-rendered card and a returned answer. B's
   confirmation half is **verified**, not just source-read.
2. The confirmation title is **byte-equal** to the submitted string (markdown markers,
   backticks, `&`, emoji, newline all preserved as text) and the durable message is
   byte-equal too. **New constraint:** long text is visually clamped at **68 px** by default
   (`scrollHeight` 222 px for 10 lines, `展开` toggle), so the length cap must be chosen to
   fit the measured preview, or the design accepts one expand click.
3. **Archived session: the trap is real.** The prompt returns `{accepted:true}` in 13 ms,
   then `turn/start` + `turn/end {kind:'blocked'}` with **no `user/message` and no error**.
   Consequence: the plugin must verify delivery from the durable log (`rpcId` in
   `user/message` + `turn/start`) and otherwise report "unconfirmed"; `{accepted:true}` is
   never delivery. Archiving the open session also removes its composer/view.
4. **Duplicate submission has no content dedupe** (two identical prompts, different
   `requestId` → two messages), so the one-in-flight latch is plugin-side.
5. **Plugin runtime compatibility on 0.2.2-rc.1: works** — `visualize` called, OpenUI card
   rendered end to end (`compat-card.png`), style route 200, installed bundle hash = build
   hash. But `pnpm peers check` fails (unmet peer `cordis`, 4.1.0 vs `~4.0.5` from
   0.2.1-rc.5 copies) and `peerDependencies: ^0.2.1-0` does not admit `0.2.2-rc.1`; the
   declared ranges must be updated before support is claimed.

**Gate 3's ask is unchanged and still one item** — host-validated, persisted, rendered
message provenance bound to the actual delivered message. `@OpenUrl` continues as a separate
upstream request (ADR-014).
