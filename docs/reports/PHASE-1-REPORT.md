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
| B07 layout | FAIL then FIXED, then **PASS** in 1.3 |
| B08 dark theme | NOT VERIFIED, then **PASS** in 1.3 |
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

## Stage 1.3 — closing B07 and B08

Full record: `evidence/browser-phase-1/MANIFEST-1.3.json`.

Stage 1.2 left two cases marked NOT VERIFIED and one fix proven only by unit
test. Closing them did not simply confirm the fixes; it found that the card had
never been styled at all.

### The finding

`getComputedStyle` on the card returned **0 of 12** declared CSS variables.
Every `var(--foreground)`, `var(--primary)`, `var(--border)`, `var(--radius)`
the component table used was empty.

The card had been written in the *frame* vocabulary — the names
`src/frame-css.ts` declares inside the HTML backend's sandboxed iframe document.
A host-mounted card has no such document. DSH publishes its palette only as
`--dsw-alias-*` and `--dsw-static-*` design tokens; 458 custom properties reach
the card and not one of them is called `--foreground`.

A `var()` that does not resolve makes the whole declaration invalid at
computed-value time, so each one fell back to its initial value. That is why the
Button had **no background, no border and square corners** while every unit test
and every server-side render passed.

It hid for a whole stage because text *inherits* its colour from the chat. The
card looked plausible in the stage-1.2 screenshot; only the screenshot of the
*aligned* card made the unstyled Button obvious, and only a computed-style probe
explained it.

### What was fixed

| Id | Severity | Defect | Fix |
| --- | --- | --- | --- |
| D3 | major | No CSS variable resolved on the card | `HOST_TOKENS` bridge on the card root, reusing the token names `theme.ts` already used for the HTML backend |
| D4 | minor | Button `border` shorthand fought its own `borderColor` longhand | use the three longhands consistently |
| D5 | major | Primary Button measured 3.59:1 in dark — below AA | bridge `--primary-foreground` to `--dsw-alias-label-primary-foreground` (5.61:1), not to the `*-inverted` token |
| D6 | minor | Card title was 2.13:1 and did not match the HTML card | same treatment as `VisualizeCard.tsx`: foreground at 0.65 opacity; `--muted-foreground` moved to the tertiary tier |
| D7 | minor | `success`/warning`/danger` were offset by one against the series palette | realigned with the order `frame-css.ts` uses |

D5 is the subtle one. The obvious-looking bridge,
`--dsw-alias-label-primary-inverted`, is *not* the text colour the host pairs
with its brand fill: in dark mode it resolves to `#353638`, a dark grey, because
"inverted" there means inverted against the page. The host's real pairing is
`--dsw-alias-label-primary-foreground`.

### Result

| Case | Verdict | Evidence |
| --- | --- | --- |
| B07 layout | **PASS** | every leaf at `leftOffset: 0`; Button 88.8px wide, not stretched; `screenshots/b07-aligned-light.png` |
| B08 dark theme | **PASS** | 7/7 variables resolve in both schemes; text 17.45–18.9:1, Button 5.61:1; `screenshots/b08-dark.png` |

Both themes were switched through the host's own Settings → 通用设置 → 外观
control, so the change under test is the host's, not a class a probe added.

The light Button pair measures 4.23:1, which is below AA for body text. That is
the host's own choice, not this plugin's: DSH paints its send button and its
"1017" badge with the identical `#4176e6`/`#fff` pairing. Recorded here rather
than "fixed" unilaterally, because matching the host matters more than being
locally more correct than it.

## Incidental fix

A card drawn through `run_code` settled as `tool/ptc-dispatch`, which the
turn-tail collector did not read, so the card rendered inside the fold and never
reappeared under the answer. Fixed with 5 regression tests.

## Numbers

| Metric | Value |
| --- | --- |
| Source files added | 9 (stage 1), 0 (1.1–1.3) |
| Tests added | 32 (29 in stage 1, 3 in stage 1.3) |
| Suite delta | +32 passed, +0 failed |
| `lib/index.js` | 220.42 kB |
| `lib/client.js` | 201.65 kB |
| Components / functions shipped | 8 / 17 (of 48 / 73) |

## What the next stage inherits

A contract that has been exercised by two real backends, a router with a
tested default, a replay format that reads three generations of card, and an
honest list of what does not work.

Stage 1.3 adds a concrete warning. Five of this stage's seven defects were
invisible to the suite: a bundle id only the host loader checks, a flex default
only a browser applies, a CSS variable only a real host fails to publish, a
border shorthand conflict only resolved styles show, and a contrast ratio only
measurement computes. **Server-side rendering and green tests are not evidence
that a card looks right.** Every visual claim in the next stages needs a
browser check under `evidence/`.

Still open, deliberately: B05 (streaming preview) and B10 (session switching).
