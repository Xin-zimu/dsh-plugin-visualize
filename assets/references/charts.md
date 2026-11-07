# Charts

## Choosing the tool

- **Standard chart shapes** — line, area, bar, scatter, doughnut — use
  Chart.js, starting from `../examples/interactive-simulator.html`. The
  library owns axis layout, tick spacing, and label collision, and its first
  render animates by default (lines sweep in, bars grow), so charts arrive
  with the entrance the design calls for at zero extra code. A curve with a
  baseline annotation or a second comparison series is still standard.
- **Custom visuals** — bespoke diagrams, spatial layouts, anything a chart
  library genuinely cannot express — hand-roll SVG per the rules below,
  starting from `../examples/comparison-chart.html`.
- D3 (pinned: `https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js`) remains
  available for data-heavy custom work: scales, shapes, and geo projections.

## Chart.js setup

Load the pinned build:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js"></script>
```

Canvas cannot resolve CSS variables (`'var(--viz-series-1)'` paints
nothing) and cannot inherit the CSS font. Create every chart through
`dshViz.chart`, which bridges both and applies the card style's chart
defaults — font family and size, text and grid colours, which axes carry
gridlines, dash pattern, axis lines, line width, point style:

```js
var plot = dshViz.chart('#my-viz-plot', function (theme) {
  return {
    type: 'line',
    data: { datasets: [{ borderColor: theme.series[0] }] },
  };
});
dshViz.bind('#my-viz', function (p) {
  plot.update(labelsFor(p), valuesFor(p));
});
```

- The chart is created once the card's fonts have loaded (Chart.js measures
  labels once). `plot.update(labels, data0, data1, …)` sets the labels
  (`undefined` keeps them) and each dataset's data in order; before the
  chart exists it only stores them, so the first draw animates in with the
  latest values. No existence check, no separate first-draw path.
- `dshViz.chart` fills in `responsive: true, maintainAspectRatio: false` and
  drops the legend for a single dataset; set either yourself to override.
  `plot.chart` is the Chart once `plot.ready` resolves.
- `theme` holds resolved colours — `series[0..5]`, `context`, `foreground`,
  `muted`, `primary`, `grid`, `axis` — plus `fontFamily`, `fontSize`,
  `lineWidth`, `alpha(color, a)` for translucent fills, and `fade(color)`
  for the gradient area fill. Chart.js has no palette default, so give each
  dataset its `borderColor` from `theme`. `dshViz.color('--token', alpha,
  root)` resolves any other colour token.
- Do not re-set gridlines, axis lines, font family, or text colour in the
  chart options: the defaults carry the card style. Override them only where
  the chart needs it (a second y axis, a dashed target line). If
  you must set a font, read it from `theme.fontFamily`; never `'inherit'` or
  a CSS variable, which canvas rejects in favour of `10px sans-serif`, and
  never below 11px.
- Size through the container: a wrapping `div` with an explicit height.
  Never fix the canvas width.
- First render animates by itself — do not disable it. Control-driven changes
  go through `plot.update(…)`, which transitions in place instead of
  replaying the entrance. Exactly the wanted behavior, free.
- Give the entrance two beats: a ~300ms fade on the chart container lets the
  axes settle first, then the data sweeps across them. One CSS `@keyframes`
  on the wrapper, as in the simulator example.
- A gradient area fill under a single measure: `backgroundColor:
  theme.fade(theme.series[0]), fill: true` (the series colour at 0.25
  fading to transparent down the plot area).
- Tooltips and legends come themed via the defaults above.
- A chart library or setup `dshViz.chart` does not fit still calls
  `dshViz.chartDefaults(Chart, root)` once and draws after
  `dshViz.fontsReady(labelText, root)`.

## Math function plots (y = f(x))

A function plot is **not** a Chart.js chart: Chart.js measures categories along
x and owns the axes, which is exactly what a function needs to control itself.
For any card that plots `y = f(x)` — polynomials, roots, trig, exponentials —
hand-roll the SVG and start from `../examples/quadratic-explorer.html`.

The rules below are **composition rules**, not a test suite: apply them while
writing the fragment, in one pass. Do not build scripts, harnesses or Node/DOM
stubs to measure or simulate them; do not sweep parameter grids to prove them.
The `visualize` tool's lint/render reply is the only runtime check — once it says
the card rendered, the task is done and you reply to the user. A static re-read
of your own SVG while composing is enough.

**The window is the plot.** A fixed `x ∈ [-10, 10]` as a constant is the
standard way to ship a clipped parabola or one tiny arc in a sea of margin.
Choose the window from the function and the parameters:

- Quadratic `y = ax² + bx + c`: `h = -b/(2a)`, `k = c - b²/(4a)`. Symmetric
  x-window around `h`. For `a > 0`, put the vertex at ~22-28% of the plot
  height above the bottom and let each branch leave the window near the top
  edge at ~80-90% of the half-width; mirror vertically for `a < 0`. Keep a
  little room beyond the vertex so `y = 0` can be in view when the curve
  crosses it. Never centre on `0` when the vertex is far from the origin —
  centre on `h`.
- `|a| < 1e-6` is a **line** (`y = bx + c`), a separate 1-2 point branch; do
  not divide by `a`. `|b| < 1e-6` with `a > 0` is symmetric about `x = 0`.
- No clipping of the vertex or the branches' exit points, and no large blank
  margins: every part of the plot area should carry either curve, grid or
  axis, and the curve should reach the top/bottom edge where it leaves.
- **Stability while dragging.** Do not recompute the window on every slider
  frame — it twitches. Keep the current window only while it still **fits well**:
  it must contain the new vertex and both branch-exit points with ≥8% margin,
  **and** its span must stay within ~1.4× (not smaller than ~0.75×) of a freshly
  computed ideal window on both axes, **and** the vertex must remain in its
  intended vertical band (roughly 10-40% above the bottom for `a > 0`, mirrored
  for `a < 0`). A window inherited from an intermediate slider state can contain
  the final curve and still waste half the plot — containment alone is not a
  reason to keep it. Fade ~200ms on a genuine change. Do not add a "fit" button
  unless the card would otherwise clutter; the auto-window should be enough.
- **Label the numbers, not a claim.** Ticks state the window; do not write
  "constant aspect" or a hard-coded range in prose.

**Axes.** Draw the x-axis only when `y = 0` is in the window, the y-axis only
when `x = 0` is in it — never draw a fake origin at the plot edge. When both
are visible they meet at the origin and `0` is labelled once. For each axis that is in view, draw its arrowhead and its `x`/`y` letter,
emitted as an SVG `<text>` element carrying the classes `axis-label-x` /
`axis-label-y`. If an axis is out of view, omit its letter; never fake an
origin and never change the mathematical window just to show a label. Nice ticks 1-2-5×10ᵏ: at most ~9 x
labels and ~7 y labels; skip colliding labels rather than shrinking the text.
Grid `--viz-grid` at 1px; axes `--viz-axis` at 1.5px so the axes are visibly
stronger; **tick numbers 11px in `--foreground`** (never caption grey — they must
stay legible), axis letters 13px bold in `--viz-axis`, and a plot clip so a steep
branch cannot paint into the header. Estimate a tick label at ~6.2px per glyph
and skip labels whose projected spacing is tighter than the label + 8px;
collisions are dropped, never overlapped. Every colour from tokens, so light and
dark both work.

**Marks.** Vertex dot + `顶点 (h, k)` label at 1 decimal. Dashed symmetry axis
`x = h` in `--viz-axis` (a dash pattern, not a colour). Real roots only when
they are inside the window. Equation readout is rebuilt from the sliders and
matches the plotted coefficients at 1 decimal.

## Hand-rolled SVG rules

- Compute the domain from the data with padding; never hard-code it.
- Size from the measured container and redraw on `ResizeObserver`.
- Keep every mark inside the plot area; clip if a path can escape.
- Draw gridlines in `--viz-grid` and axis lines in `--viz-axis`, and follow
  the card style's guide on which ones to draw.
- After drawing, check that tick and value labels do not overlap; drop ticks
  or re-anchor labels rather than shipping a collision.
- Entrance, once: line draws in via `stroke-dashoffset` (~500ms ease-out),
  fills fade up behind it, labels after their marks. Guard with a flag so
  redraws never replay it; skip under `prefers-reduced-motion`.
- The soft vertical gradient under a single-measure curve (series color at
  ≈0.25 opacity fading to transparent) is the house look for area charts.
