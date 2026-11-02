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
| 3 | OpenUI render backend | Not started |
| 4 | Capability expansion (open-intelligent-ui reference) | Not started |
| 5 | Unified prompt, security review, release | Not started |

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

## Stage 3 — OpenUI render backend, part two

**Goal.** Finish what stage 2 started in the browser: the loop works, but its
state does not survive a reload, Button actions do nothing, and 40 of the 48
components still have no renderer.

**Already done in stage 2** (recorded so this stage is not credited twice): the
card dispatches on the descriptor, draws from the real evaluator, and a bound
Slider re-evaluates the tree. See `docs/reports/PHASE-2-REPORT.md`.

**In scope.** `src/client/` only.
- Persist `$state` so S04 becomes PASS. **Decide where first** — an ADR, not an
  implementation detail.
- Consume action descriptors so `Button` does something.
- Widen the component table from 8 toward 48.

**Out of scope.** Any change to language semantics. The differential run must
still report 0 differences after every stage-3 commit.

**Exit criteria.** A reload restores what the user set; a Button's action changes
state; at least the Inputs group renders; the differential run is unchanged.

---

## Stage 4 — Capability expansion

Driven by `docs/specifications/COMPONENT_CATALOG.md`. Each capability (Map,
SearchImage, HtmlView, Math, YouTube) is its own sub-stage with its own
security review recorded as an ADR, because each one widens either the network
surface or the embedded-content surface.

---

## Stage 5 — Unified prompt, security review, release

Both skills merged into one, with the backend-choice rule; a full security pass
recorded in a new `docs/testing/SECURITY_TEST.md`; packaging, install and
uninstall tests; a `CHANGELOG.md` entry; first tagged release.