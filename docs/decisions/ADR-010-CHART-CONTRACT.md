# ADR-010 — The `Chart` parameter contract

- **Status:** accepted
- **Date:** 2026-11-04
- **Supersedes:** —
- **Relates to:** ADR-002 (one backend table), ADR-004 (security boundaries),
  stage 4A-4 (`STAGE.md`), `upstream/open-intelligent-ui/src/lib/components/chart.tsx`

## Context

The upstream project draws charts with **Chart.js**, doing its own parsing,
scaling and SVG/Canvas work behind a React wrapper. The OpenUI backend cannot:
its renderer is a pure function from a descriptor to a React tree, it runs in the
host document, and the component table exposes exactly one signature:

```
Chart(type, data, x?, series?, format?, currency?, stacked?, height?)
```

with `type ∈ { bar, line, area, pie, donut, scatter }`. There is no argument for
a `Chart.js` options object, no `datasets` array, no callback — and adding one
would put an arbitrary JavaScript configuration surface inside a language whose
entire security argument is that it is **closed** (ADR-004).

So the question this ADR decides is what `data` + `x` + `series` **mean**, and
what happens when they are wrong. That second half is the part a chart library
never answers for you.

### What must be decided before code

1. **The shape of `data`.** Upstream takes `{labels, datasets: [{data}]}`.
   That is a library's internal shape leaking into the language. The signature
   says "row objects", which is the shape a model can actually author from a
   table it just computed.
2. **What counts as invalid**, and whether invalid data throws, draws nothing, or
   draws a stated refusal. The project's established answer is stated refusal —
   a blank card is indistinguishable from a broken one (4A-1 defect).
3. **Where axis labels and tick formatting come from**, given there is no
   options object.
4. **How the chart behaves when the numbers are hostile**: `NaN`, `Infinity`,
   `null`, a string where a number belongs, an empty series, a single point.
   A chart that silently draws a 0 for `NaN` is lying about the data.
5. **Whether it renders SVG or Canvas.** Canvas needs a size at paint time and
   cannot be asserted structurally; SVG can be counted, which is what
   `AGENTS.md` §6 requires.

## Decision

**The chart is a structured row contract rendered as SVG. It is not a Chart.js
clone, it does not accept an options object, and it refuses invalid data with a
stated reason rather than drawing a plausible lie.**

### 1. `data` is an array of row objects

```
Chart("bar", [{month: "Jan", sales: 12}, {month: "Feb", sales: 30}], "month", ["sales"])
```

- `x` names the **category key**; when omitted, the row index is the category.
- `series` names the **value keys**; when omitted, every numeric key except `x`
  is a series, in first-seen order.
- A value that is not a finite number is **not** coerced to zero. It becomes a
  **gap** in the series, and the refusal reason lists it. `null` is a gap by
  design (a missing reading); `NaN`, `Infinity`, `undefined` and non-numeric
  strings are gaps **and** a diagnostic.

### 2. Invalid data draws a stated refusal, never a blank or a lie

The component renders a notice naming the reason — the same shape as
`UNRENDERED_STYLE` in 4A-1 and the Link degradation in 4A-2:

| Condition | Result |
| --- | --- |
| `data` empty, or no resolvable rows | notice: "Chart has no data" |
| no numeric series could be found | notice: "Chart found no numeric series" |
| every value in a series is a gap | notice: "Chart series \"x\" has no numeric values" |
| `type` is a pie/donut and there is more than one series | notice naming the rule (a pie is one series by definition) |
| some values are gaps, others are fine | chart draws, gaps are skipped, and the notice **lists the gap count** |
| single data point | draws. A one-point line renders the point; it does not throw or collapse |

A refusal is **visible text**, not a console warning: the reader sees why.

### 3. Formatting is derived, not configured

There is no options object, so:

- `format` (`number | currency | percent`) applies to **value** labels and the
  axis, via the existing formatter the catalogue already uses.
- `currency` names the symbol used when `format` is `currency`.
- Axis tick **counts** are chosen by the renderer from the available height; there
  is no `ticks: {stepSize}` and there will not be one. A model that wants
  different ticks has to change the data, which keeps the contract small.
- Category axis labels are the `x` values, rendered through `@Format` only if
  they are numbers.

### 4. Unknown enum values fall back, and say so

`type` outside the six falls back to `bar` — consistent with every other enum in
this language, where a wrong value "falls back silently" by design. `format`
outside its three falls back to `number`. The fallback is **recorded in the
skill text**, not hidden.

### 5. SVG, for a reason that is about testing

The chart is inline SVG with `role="img"`, an `aria-label` naming the type and
series, and one countable element per bar/point/slice. Two consequences the
project needs:

- A test can assert **how many** bars were drawn, not that "a bar-ish shape
  exists" — the D20 lesson (`AGENTS.md` §6).
- The browser acceptance run can measure the same counts in the host DOM, which
  is how V-series evidence is taken.

Canvas would make both impossible, and would need a paint-time size the
descriptor does not have.

### 6. What is explicitly **not** in scope

No animation, no tooltips, no hover crosshairs, no zoom, no legend interactivity,
no stacked-percentage normalisation beyond `stacked: true` summing the series.
Each of those is a behaviour with its own accessibility and interaction surface;
none is needed to satisfy "the data set is readable". They are recorded here so
a later batch adds them as a decision rather than as a drift.

## Consequences

- **The renderer stays a pure function of the descriptor.** No chart library is
  added to the dependency tree, and the closed-language argument in ADR-004 is
  preserved.
- **The visual vocabulary is the host's tokens**, via the same
  `COLOR_VARS`/`--viz-series-N` bridge 4A-2 established, so both colour schemes
  are inherited rather than re-derived. 4A-2's D22 (AA contrast) applies to axis
  text as much as to `Link`.
- **A chart that cannot be drawn always says why**, and that sentence is evidence
  in the browser run rather than a claim in a report.
- **Tests must assert counts and gaps**, not presence: bar count equals row
  count, a gap produces exactly one fewer drawn element and one more notice.
