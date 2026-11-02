# Phase 1 report — fork skeleton, dual-backend seat

**Date:** 2026-11-02
**Stage:** 1 (`STAGE.md`)
**Verdict:** accepted, with one recorded gap.

## What this stage had to prove

That one host can hold two render backends without either losing its own
character, and that nothing that worked before stopped working.

## Result against the exit criteria

| Criterion | Result | Evidence |
| --- | --- | --- |
| A new repo built on `cf6b3a3` | PASS | tree at `D:/work/dsh-plugin-visualize` |
| The base suite runs and matches its baseline | PASS | 15 failed / 455 passed vs 15 / 426; failure sets sha256-identical |
| `RendererAdapter` and `RenderResult` exist | PASS | `src/core/render-contract.ts` |
| The HTML backend is behind the dispatcher, behaviour unchanged | PASS | `tests/tool.spec.ts`, `tests/lint-gate.spec.ts` |
| An openui backend exists and renders Row/Text/Button | PASS (server) | dispatches and renders to elements; **browser unverified** |

## Stage 1.1 — the gap, and how it was closed

The openui backend was complete on the host side: it parsed, diagnosed and
wrote a correct `RenderDescriptor`. The browser half read `visualizeMetaFrom`,
which requires `kind === 'visualize'`; a program card carries
`kind: 'intelligent_ui'`, so it fell back to generic text.

**Closed in stage 1.1** with an explicit discriminant rather than a disguise:

```ts
type VisualizationDescriptor = VisualizeMeta | OpenUIMeta
```

The client switches on `kind` and hands the value to the renderer built for it.
A program is never rewritten into a fragment to satisfy an existing check.

Now, proven by `evidence/phase-1/e2e-openui-dispatch.txt`:

```text
dispatch         : openui
openuiMetaFrom   : recognised
visualizeMetaFrom: declines (correct)
visualizationFrom: intelligent_ui
render error     : none
```

Still open, and recorded as NOT VERIFIED: no browser has driven the card.

## Incidental fix

A card drawn through `run_code` settled as `tool/ptc-dispatch`, which the
turn-tail collector did not read, so the card rendered inside the fold and never
reappeared under the answer. Fixed with 5 regression tests.

## Numbers

| Metric | Value |
| --- | --- |
| Source files added | 9 |
| Tests added | 29 (all passing) |
| Suite delta | +29 passed, +0 failed |
| `lib/index.js` | 216.82 kB |
| `lib/client.js` | 159.26 kB |
| Components / functions shipped | 8 / 17 (of 48 / 73) |

## What the next stage inherits

A contract that has been exercised by two real backends, a router with a
tested default, a replay format that reads three generations of card, and an
honest list of what does not work.
