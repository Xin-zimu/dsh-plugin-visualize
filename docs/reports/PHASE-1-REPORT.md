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

Still open at the end of stage 1.1: no browser had driven the card.

## Stage 1.2 — real browser verification

Run against an isolated profile (`viztest12`) on `http://127.0.0.1:3081/`,
with the model driven live. Full record: `evidence/browser-phase-1/MANIFEST.json`.

| Case | Verdict |
| --- | --- |
| B01 plugin load | PASS |
| B02 both toolviews | PASS |
| B03 OpenUI card displays | PASS |
| B04 HTML card displays | PASS |
| B05 streaming preview | NOT VERIFIED |
| B06 text safety | PASS |
| B07 layout | FAIL then FIXED |
| B08 dark theme | NOT VERIFIED |
| B09 reload / replay | PASS |
| B10 session switching | NOT VERIFIED |
| B11 console clean | PASS |

### Two defects only a browser could find

**D1 (blocker).** The client bundle registered `@nagi-ovo/dsh-visualize` while
the host resolved the plugin as `@dsh-unified/visualize`, so the entry loaded
"without registering" and the plugin never activated. The build was clean and
466 unit tests passed. `tsdown.config.ts` had the pre-fork id hard-coded; it now
reads `package.json`.

**D2 (minor).** A lone Button was centred in the card: a flex column defaults to
`align-items: center` in this renderer's absence of an explicit value. Fixed
with `align-items: stretch` plus `align-self: flex-start` on Button, and two
regression tests.

Both are the same lesson: a server-side render and a green suite cannot see the
host's loader contract or a browser's flex defaults.

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
