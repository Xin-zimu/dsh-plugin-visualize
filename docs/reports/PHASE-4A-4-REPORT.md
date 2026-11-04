# Phase 4A-4 report — media and data

**Date:** 2026-11-04
**Stage:** 4A-4 (`STAGE.md`)
**Verdict:** **PASS.** `Table`, `Chart`, `Icon` and `Image` render from real
programs in a real DSH host, in both colour schemes, and the inventory moves from
**30 / 48** to **34 / 48**. All six exit-gate items have evidence.

## What this batch had to prove

Three of these four are ordinary rendering work. The batch is not ordinary,
because two of them take an argument the **host acts on** rather than merely
draws: a `Chart` decides what data means, and an `Image` decides what the
browser will fetch. The `Link` precedent (ADR-008) says such a decision is made
in an ADR before the renderer exists, and that is what happened here.

| Component | The question it raised | Where it was decided |
| --- | --- | --- |
| `Image` | may the model make the host load an arbitrary URL? | **ADR-009** |
| `Chart` | what is the data contract, and what happens when it is wrong? | **ADR-010** |
| `Table` | structure: does one row of data become one row of cells? | in the renderer |
| `Icon` | what is drawn when no icon set ships? | in the renderer |

## ADR-009 — `Image` may load only an absolute http/https URL

The temptation was to reuse `src/images.ts`, which already solves this hazard for
the HTML backend with magic-byte sniffing, a size cap, a redirect cap and a DNS
check performed inside the socket's lookup. It cannot be reused, and the reason
is the reason ADR-008 exists:

| | HTML backend | OpenUI backend |
| --- | --- | --- |
| Where the card renders | inside a **sandboxed iframe** | in the **host document** |
| How an image arrives | `<img data-viz-src>` resolved node-side at execute time, bytes stored, served back by id | a descriptor argument evaluated in the browser |
| Who can fetch | node, at execute time, with `ctx.fs` and a real resolver | the browser, with the host's own origin |

The OpenUI renderer is a pure function of the descriptor and has no execute step
to hang node-side resolution on. So the policy is the same one `Link` uses: a
**positive, closed allowlist**, parsed with `new URL` rather than pattern-matched,
because a regex tests the shape of a string while the browser tests what it will
do — and the two disagree exactly where it matters.

| `src` | Outcome |
| --- | --- |
| absolute `http:` / `https:` | a real `<img>`, with `loading=lazy`, `decoding=async`, `referrerPolicy=no-referrer` |
| `data:`, `blob:`, `file:`, `javascript:` | the alt text plus the reason, and **no `<img>` element at all** |
| protocol-relative `//host/x`, relative `figs/a.png` | same refusal |
| a load that fails anyway | the same visible refusal — never a broken-image glyph with no explanation |

**Workspace paths are deliberately unsupported**, and the ADR says so rather than
leaving it to be discovered: a model that wants a workspace figure must use the
HTML backend, which has both the node-side reader and the sandbox that make it
safe. Porting that containment check into a browser-side renderer is not
possible, because the renderer does not run on the node.

## ADR-010 — the `Chart` contract

Upstream draws charts with Chart.js. Copying that would have put an arbitrary
JavaScript configuration surface inside a language whose entire security
argument is that it is **closed** (ADR-004), and it would have made the component
untestable: a Canvas needs a size at paint time and cannot be asserted
structurally.

So the contract is rows in, countable SVG out:

- `data` is an array of row objects; `x` names the category key and `series` the
  value keys. No `datasets`, no options object.
- **Invalid data draws a stated refusal**, never a blank and never a plausible
  lie: empty data, no numeric series, a pie given several series, and every
  value unreadable each render a sentence naming the problem.
- **A non-finite value is a gap, not a zero.** It is skipped in the drawing and
  counted in a notice. A chart that plots `NaN` as `0` asserts a reading that
  does not exist.
- A single data point draws. A one-point line renders the point rather than
  collapsing.
- SVG, for a testing reason: one `data-chart-mark` element per bar, point, line
  and slice, so the count *is* the assertion — the D20 lesson, applied before
  the defect instead of after it.
- Animation, tooltips, hover crosshairs, zoom and legend interactivity are
  **recorded as out of scope**, so a later batch adds them as a decision.

## `Icon`: drawing its own name, and saying why

No icon set ships in this build. The choice is between a dependency and an empty
box; an empty box reads as a rendering failure, which is the exact confusion the
4A-1 unrendered-notice exists to remove. So a named glyph renders its own name
(first two characters) inside a bordered square, carries `role="img"` and the
full name as its accessible label, and honours all four sizes. Replacing this
with a real icon set later is a substitution, not a rewrite.

## The measurement, concretely

| Command | Result | Evidence |
| --- | --- | --- |
| `pnpm run typecheck` | PASS, exit 0, both projects | — |
| `pnpm run test` | **821 passed / 15 failed / 836**; the 15 are the documented baseline | failing set compared name by name |
| `pnpm run build` | PASS, `lib/client.js` rebuilt to `62AD5817…` | — |
| differential | **31 / 31**, 0 differences, output byte-identical | — |
| inventory | **34 / 48**, Media and data complete | `tests/openui-inventory.spec.tsx` |
| `tests/openui-media-4a4.spec.tsx` | **21 / 21** | — |
| `tests/openui-validate-gate.spec.ts` | **6 / 6** — the O1 gate | — |
| `probe.mjs --what=smoke` | **SMOKE PASS** — G0 with both hashes equal | G0 fields |

## Browser acceptance

| Run | Claim | Result | Evidence |
| --- | --- | --- | --- |
| C1 | all four render from one real program in the host | PASS | `C1-four-components.json`, `screenshot-four-components.png` |
| V3 | layout, colour and contrast in both schemes | PASS | `V3-themes.json` |
| V4 | the browser ran this build (§9) | PASS | `MANIFEST.json` → `hashGate` |

**C1 counted structure, not text.** `Table` drew 1 table, 2 headers, 3 body
rows and 6 cells. The bar chart produced exactly 3 `data-chart-mark="bar"`
elements for 3 data points; the line chart produced 2 paths for 2 series, with a
legend naming `a` and `b` and category labels `Jan`/`Feb` on the axis. Three
icons each carried their own accessible name. And **exactly one `<img>` existed
on the card**, its `src` the `https:` URL — the `javascript:` source produced a
refusal notice reading *"javascript: is not an allowed scheme (http or https
only)"* and zero image elements. That last pair is the security claim, and it is
only meaningful measured in the host document, because that is where a hostile
`src` would have executed.

**V3 measured the new small-text class.** Chart axis labels and the legend are
11px text, which is precisely the shape of 4A-2's D22 (3.71:1 on white, passing
every presence assertion). 25 text samples per scheme across axis, legend, table
head and table cells: minimum contrast **5.8:1 light / 12.11:1 dark**, both above
AA 4.5:1. Both schemes were entered through the host's own 外观 control.

**§9 caught a stale bundle again** — the second consecutive batch. The profile
held the 4A-3 bundle (`4D071A86…`) against a `62AD5817…` build, because pnpm
reports a `file:` dependency as up to date while keeping the hard-linked old
copy. The install was refreshed and both halves matched before anything was
measured.

## Four mutations, because a guard that cannot fail is a guess

| Mutation | What went red |
| --- | --- |
| `allowedImageUrl` accepts every scheme (the ADR-009 defect) | 2 tests: the refused-scheme test and the reason test |
| `chartSeries` coerces an unreadable value to `0` (the ADR-010 lie) | 2 tests: no-numeric-series, and the gap-not-zero test |
| `Table` draws only the cells that exist (column shifting) | 1 test: short-row padding |
| the validate gate stubbed to return no errors (the O1 bypass) | 2 tests: `Action([...])` rejection and unknown-`@function` |

All four were restored and the suites re-run green.

## O1 is closed

4A-3 recorded that the unit spec called `renderProgram`, bypassing the backend's
name check, so it accepted `Action([@Set($v, 1)])` where the live host returns
`VZO002`. `tests/openui-validate-gate.spec.ts` now calls
`openuiBackend().validate()` — the same entry the tool path uses — and asserts
both directions, so the two cannot silently disagree again.

## What 4A-5 inherits

- A green baseline of **34 / 48** with **821 / 15 / 836** on Windows, and the
  instruction that a red run is investigated by cause.
- **Two ADRs that constrain the drawing batch only lightly**, but two patterns
  that do carry over: parse URLs rather than matching them, and make a refusal
  visible text rather than an empty box.
- The **countable-mark** pattern: if 4A-5 draws anything with repetition
  (the SVG primitives), give each drawn element a `data-*` attribute so the test
  can assert how many, not merely that one exists.
- `Popover` is the only remaining component that overlays the host document; it
  needs its own containment check, in the shape ADR-009 took.

## What this batch does not claim

- **No SSRF protection.** A remote `https:` image is still fetched by the
  reader's browser, so an attacker-chosen host in a program receives a request
  from the reader's machine. That is inherent to an `<img>` in a host document
  and cannot be fixed here; what is fixed is that the scheme set is closed.
  ADR-009 records that a future move to node-side resolution must cite it and add
  the `isPublicAddress` check `images.ts` already implements.
- **No real icons.** `Icon` draws its name. That is visible and honest, not
  finished.
- **No chart interaction.** Tooltips, hover and legend toggling are out of scope
  by ADR-010, recorded rather than omitted.
