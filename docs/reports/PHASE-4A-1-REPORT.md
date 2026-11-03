# Phase 4A-1 report — layout primitives

**Date:** 2026-11-03
**Stage:** 4A-1 (`STAGE.md`)
**Verdict:** **accepted — PASS**, on 8 of 9 exit-gate items; the ninth is recorded
as NOT VERIFIED with its reason rather than counted.

## What this batch had to prove

That `Box`, `Divider`, `Spacer` and `Grid` lay out correctly in the real DSH
host, in both colour schemes — not merely that they emit plausible HTML.

The batch exists because this project has already shipped a component that looked
right in every unit test and had **no background, no border and square corners**
in the browser (D6/D7). Four layout primitives are precisely the components where
that failure mode is most available: a missing `var()` falls back to an initial
value, and the result still *looks* like a layout.

## Result against the exit gate

| # | Item | Result |
| --- | --- | --- |
| 1 | All four components have real renderers | **PASS** — 12 / 48, measured |
| 2 | Arguments match the signature table | **PASS** — every position asserted |
| 3 | Every CSS variable resolves in the real host | **PASS — after fixing two that did not** |
| 4 | Light and dark both pass | **PASS** — dark entered via the host's own control |
| 5 | Tool view and turn tail both display | **PASS** — 1 fold + 1 tail |
| 6 | Refresh and history replay pass | **PASS** for refresh; **A9 NOT VERIFIED** |
| 7 | No new failures; TypeScript passes | **PASS** — 675 / 15, identical failure set |
| 8 | Build SHA-256 matches the test profile | **PASS** — both halves |
| 9 | Evidence, matrix and report updated | **PASS** |

## The three defects this batch found

All three were found by measuring, not by reading, and all three are worth naming
because each one was invisible to the tests that existed.

### D17 — `--dsw-static-purple-500` does not exist

`--viz-series-4` was bridged to a host token the host has never published. In the
browser it resolved to **nothing** and silently painted its fallback. Every unit
test passed: the fallback is a perfectly good purple.

The host's static scale is deepseek, blue, amber, green and red. There is no
purple anywhere in its 509 custom properties. So this slot has no host token, and
pretending otherwise was the bug. It is now declared directly as a `light-dark()`
literal, with a comment saying why — the one series colour the host cannot supply.

### D18 — `--dsh-font-family-text-default` does not exist

`--font-sans` named a `--dsh-*` token that is not published. Same silent failure,
same invisible-looking result: the text rendered in the fallback stack, which
happens to look almost identical to the host's own stack. The correct token is
`--dsw-font-family`, which the host does publish and which resolves to the same
system stack.

### D19 — the inventory probe was a copy, not a measurement

`evidence/phase-3/component-inventory.mjs` mirrored the renderer's component table
as a **hand-written literal**. After this batch's renderers were added it still
reported "8 / 48", because it was reporting an old answer rather than reading the
code. The renderer now exports `RENDERED_COMPONENTS` and
`tests/openui-inventory.spec.tsx` asserts against it.

This one is the most instructive: the batch's own instruction was "batches are
derived from the real signature table and renderer coverage, not remembered", and
the tool built to enforce that was itself remembering.

## The measurement, concretely

Every number below was read from the live page, with no host CSS modified.

| What | Light | Dark |
| --- | --- | --- |
| Unresolved CSS variables on the card | **0** | **0** |
| Box nesting (Title + Row of two Texts) | 680×71, bg tint, 12px padding, 10px radius, 0.67px border | same geometry, dark tint, `rgba(255,255,255,0.12)` border |
| Box fixed width 240 | **240px** | 240px |
| Box flex 1 | **680px** → **367px** after the card narrowed | 367px |
| Divider | 1px, `rgba(0,0,0,0.1)`, opacity 1 | 1px, `rgba(255,255,255,0.12)`, opacity 1 |
| Spacer | `flex: 1 1 0`, 589px in a 680px row → neighbours **605px apart** | 298px in a 367px row |
| Grid `minChildWidth: 180` | 3 cols @680/560, **2 @440, 1 @320** | — |
| Grid `columns: 3` | 3 tracks at **every** width | — |
| Empty `Grid` | `display: grid`, 0 children, no notice | same |
| Unrendered notices | 0 | 0 |

The Grid row is the one worth reading twice: the `minChildWidth` grid drops
columns as the card narrows while the explicit 3-column grid does not. That is
the responsive mechanism working, and it is invisible in generated HTML — which is
why the owner asked for it to be measured in a browser.

## Surfaces, refresh and replay

2 copies of the card exist — one inside the tool fold, one on the turn tail —
before and after a full reload. The replayed card is not merely present: its grid
tracks, divider and Spacer geometry are **identical** across the reload
(`evidence/phase-4a-1/replay.txt`). At the narrower tail width the
`minChildWidth` grid correctly collapses to a single column, which is the same
mechanism observed at 320px in the width sweep.

## A9 — history replay, NOT VERIFIED

The isolated profile's original session **cannot be loaded by this host build at
all**. Its log contains event type `job/registered`, and `dsh 0.2.0-rc.2` refuses
to interpret a log written by a newer harness:

```
历史加载失败：... contains event type "job/registered" (seq 91) unknown to this
harness and not marked ignorable; refusing to interpret the log — it was likely
written by a newer harness
```

That session is therefore unavailable for a multi-generation replay, and no claim
is made about one. Single-session refresh replay (A8) passed on a session this
build can read. A9 needs a session written by a compatible harness; it is an
environment gap, not a 4A-1 defect.

## Two environment problems, recorded

**The host's conversation pane failed on the first session.** `DraftEditorRuntime.setDraft`
threw `TypeError: text.replace is not a function`, taking the whole
`conversation.session` slot with it: three prompts returned HTTP 200 and painted
nothing, before and after a reload. This is a host/session defect. The same flow
worked in a fresh session, same profile, same build — which is how it was
distinguished from a 4A-1 regression rather than assumed to be one.

**browser-skill had a protocol skew.** CLI 0.4.0 against extension 0.4.1
(`version_skew: true`); every `fill` crashed the host's editor. Updating the CLI
to 0.4.1 and restarting the daemon cleared it. This was fixed *before* any
measurement was recorded, so no number here was taken across the skew.

## What 4A-2 inherits

- A working layout vocabulary: `Box`, `Grid`, `Divider`, `Spacer` can be used
  inside the text components 4A-2 adds, and vice versa.
- The `data-openui-unrendered` notice, so an undrawn component is visible instead
  of blank — 4A-2 removes seven of those notices.
- The **three-layer variable probe** (`evidence/phase-4a-1/a1-probe.mjs`), which
  is the check that would have caught D6, D7, D17 and D18. Every later batch
  should run it rather than a `getComputedStyle().color` spot check.
- An honest inventory: 12 / 48, measured from the renderer's own table.

## What this batch did *not* change

- No file under `src/backends/`: the language differential is still **31/31, 0
  differences** (`evidence/phase-4a-1/differential-4a1.txt`).
- No host CSS was modified, at any point, in any run.
- No component was added to `signatures.ts`; all four were already declared, and
  this batch made the renderer catch up with the table.
