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
| 1.2 | Real-browser integration verification | **Done — B01–B11 recorded; three NOT VERIFIED by scope** |
| 2 | OpenUI language core | Not started |
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
B05 (streaming), B08 (dark theme) and B10 (session switching) are **NOT
VERIFIED** by scope, not by failure. Re-rendering the aligned card in a browser
is still outstanding.

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

## Stage 3 — OpenUI render backend

**Goal.** Close the stage-1 gap: an openui card actually appears in the chat.

**In scope.** `src/client/` gains a dispatch on `backend`; the openui React
component tree; `$state`; card-state persistence for openui cards.

**Exit criteria.** A program card renders, its controls change state without a
model call, it survives a page reload, and a legacy `intelligent_ui` meta
replays through the same path.

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