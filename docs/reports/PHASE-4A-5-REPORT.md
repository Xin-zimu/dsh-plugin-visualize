# Phase 4A-5 report — the last fourteen components

- **Status:** PASS. Browser acceptance 45/45 on an isolated profile.
- **Date:** 2026-11-05
- **Scope:** `Svg`, `G`, `Circle`, `Ellipse`, `Rect`, `Line`, `Path`, `Polyline`,
  `Polygon`, `SvgText`, `Flashcard`, `Celebration`, `Carousel`, `Popover`.
- **Inventory:** 34/48 → **48/48**, measured by `tests/openui-inventory.spec.tsx`
  from the renderer's own table.

## 1. Decisions taken before code

| ADR | Decision |
| --- | --- |
| ADR-011 | SVG values are parsed by their own grammar and re-serialised. Geometry is numbers; `transform`, `d` and `points` are tokenised; paint is a closed list and `url(` is refused. Colour goes into `style`, not a presentation attribute. |
| ADR-012 | `Popover` is inline and non-modal: absolute positioning inside the card, no portal, no focus trap, placement clamped to the card's measured rectangle. |

ADR-011 deliberately does **not** claim that an SVG string could execute
JavaScript in this backend, because it could not: the renderer builds props from
an explicit argument table and nothing parses markup. The risks it does address
are resource references (`url(...)` making the host issue a request) and unbounded
work. An over-claimed security conclusion is as harmful as a missed one, and it
is what a later reader would rely on.

## 2. Components

| Group | Added | Notes |
| --- | --- | --- |
| Drawing | `Svg`, `G`, `Circle`, `Ellipse`, `Rect`, `Line`, `Path`, `Polyline`, `Polygon`, `SvgText` | Every free-form string passes `src/client/openui-svg.ts` and reaches the DOM only as a re-serialised value. A refused argument is dropped and recorded as `data-openui-svg-refused`, with one exception: an unreadable `viewBox` draws a visible notice, because then there is no drawing left to protect. |
| Layout | `Carousel`, `Popover` | `Carousel` is a snap scroller with a focusable track. `Popover` follows ADR-012 and places itself via the pure function in `src/client/openui-popover.ts`. |
| Play | `Flashcard`, `Celebration` | `Flashcard` keeps both faces mounted and hides the inactive one from assistive technology. `Celebration` fires on the false→true transition and clears its own timer. |

## 3. Two defects found by the browser run

Both were invisible to the unit suite, and both were found only by looking at a
real host document. Neither was fixed by guessing: each was reproduced first.

### 3.1 The validator rejected a documented action form

`signatures.ts` declares `Action` in `ACTION_STEPS`, the component catalogue
teaches `Action([...])`, and `openui-actions.ts` implements it — but
`checkNames` only consulted the action table for names beginning with `@`, so the
sigil-less form fell through to `VZO002: unknown component "Action"`.

The damage was not a missing feature. The prompt told a model to write a form the
validator refused; a model that obeyed was rejected, and one that silently
"corrected" the program succeeded. That is the contract drift ADR-002 exists to
prevent, and it needed a real model to surface it, because every fixture had been
written by someone who already knew which form passed.

Fix: `if (ACTION_NAMES.has(call.name)) continue` in `src/backends/openui/renderer.ts`,
plus a regression test in `tests/openui-validate-gate.spec.ts` that was**reversed**
from asserting rejection to asserting acceptance — recorded in the test itself, so
a reader sees the change of position rather than a suspiciously convenient edit.
Mutation-verified: commenting the line out fails two tests.

Reviewed for the same shape elsewhere: `FUNCTION_NAMES` and `ACTION_NAMES` are the
only two closed vocabularies `checkNames` consults, and both are now reachable in
their documented spellings. No further instance was found.

### 3.2 `Celebration` never fired for a bare-variable condition

`Celebration($done)` — the form the skill text shows — passes a **binding marker**,
not a boolean. `boolOf` received that object and returned `Boolean({...})`, i.e.
constant `true`. The component therefore never observed a false→true transition
and never drew a burst, while `$done` demonstrably moved to `true` in the persisted
state.

Every existing test used `Celebration($n == 1)`, whose argument is already a
boolean, so none of them touched the binding path. The passing test and the failing
browser were both true.

Fix: `fieldOf(props[0]).current` in `src/client/OpenUICard.tsx`, plus
`tests/celebration-repro.spec.tsx` which asserts the bare-variable form, the
comparison form, and a bare-false non-fire side by side. Mutation-verified: with
the old form restored, exactly the bare-variable test fails and the other two pass,
which is what makes it a regression test for this defect rather than a general
smoke test.

## 4. Verification

| Check | Result |
| --- | --- |
| `tsc -p tsconfig.json` | 0 errors |
| `tsc -p tsconfig.client.json` | 0 errors |
| `vitest run` | 889 passed / 15 failed / 904 |
| Failure set vs baseline | **identical, name by name** |
| Build | `lib/client.js` 438.21 kB, `lib/index.js` 240.42 kB |
| Bundle hash | `client.js` `A0E744D1…`, installed copy identical (§9) |
| Browser acceptance | **45 / 45** |
| Inventory | **48 / 48** |

The 15 failures are the pre-existing Windows environment set (symlink privilege,
path joining) recorded in `evidence/publish/test-before-publish.txt`. They are not
new, and no assertion was weakened to reach this report.

## 5. Browser acceptance — what was measured

The probe is `evidence/phase-4a-5/probe-c1-drawing.mjs`; its output is
`C1-drawing-disclosure.json`. Both P4 and Celebration were first measured with a
**step-per-invocation** probe (`probe-p4-step.mjs`, `probe-celebration-step.mjs`),
because a single chained script cannot distinguish "the product is wrong" from
"the probe read too early" — and the first chained attempt reported both as defects.

| Area | Evidence |
| --- | --- |
| Drawing group | one `svg`, one `g`, one each of `circle`/`ellipse`/`rect`/`line`/`path`/`polyline`/`polygon`/`text`; `viewBox` normalised to `0 0 200 120`; `transform` `translate(0 0)`; path and points re-serialised; circle `fill` resolved to `rgb(86, 134, 254)` |
| Refusals | zero `data-openui-svg-refused` markers on a valid drawing; a hostile program containing `url(...)` produces **no** `url(` in the DOM |
| Popover P1 | panel inside the card, `position: absolute` (not `fixed`), not a `document.body` child, `aria-modal="false"` |
| Popover P2 | opening does not move the card |
| Popover P3 | Escape closes it and focus returns to the trigger |
| Popover P4 | inside press keeps it open; outside press closes it (1 → 0), and the same result was measured on `document.body` and on a real host element |
| Popover P6 | no document listener leaked across an open/close cycle or an unmount-while-open |
| Popover containment | the panel does not cover the host composer |
| Flashcard | flips front→back, exactly one face visible, hint preserved |
| Carousel | three items at 140 px, `overflow-x: auto`, `tabindex=0` |
| Celebration | 36 pieces at 60/200/400/800 ms, gone by 1500 ms (the 2.2 s clear) |
| Dark scheme | 8 paint samples, all resolved, minimum contrast **5.58:1** |

## 6. Probe defects found and fixed (not product defects)

Recorded because the distinction is the point of the phase. Each of these once
looked like a product failure:

1. A whole program written across ten physical lines. The language requires one
   statement per line, so the host correctly refused to draw it.
2. `evaluate` already JSON-parses its result; a second `JSON.parse` threw
   `[object Object] is not valid JSON`.
3. Clicking and reading in the same page script reads the pre-render DOM, because
   React renders after the handler returns. This reported a flashcard that would
   not flip and a confetti burst that never appeared.
4. Counting `[data-openui-popover]` counts triggers **and** panels; one trigger
   plus one panel read as "two open panels".
5. A card whose persisted `$done` was already `true` cannot fire a false→true
   transition, so pressing Finish correctly produced no burst.

## 7. Still open

- The 15 Windows baseline failures, unchanged and out of scope.
- `presentationMeta` stores `fragment` twice (234 bytes per html card). Needs an
  ADR, not a renderer change; unchanged from 4A-4.
- `IconButton`'s placeholder glyph is still not wired to `Icon`. Recorded in 4A-4
  as deliberate, not an oversight.
