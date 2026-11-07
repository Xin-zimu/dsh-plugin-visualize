# Stage 7D — math-function plot quality (quadratic card)

Date: 2026-11-07 · Trigger: the owner's first daily-use quality complaint, "二次函数
交互卡片的图像显示效果不理想". Scope was deliberately narrow: one renderer token
bug, one reference recipe, one worked example — no refactors.

## 1. Diagnosis (confirmed from the owner's own artifact)

**A. Generation strategy — fixed window.** The owner's generated card
(`…\session-2a720189…\visualization-66ac87cd.whale.html`) hard-codes
`var XMIN = -10, XMAX = 10` and derives the y-scale from the canvas aspect
(`ySpan = 20 * plotH/plotW`). Re-opened in a real browser at card width and driven
to `a=1.1, b=-6.8, c=10` (the owner's slide), the curve path's SVG bounding box is
`y = -5047…156, height 5203` around a 300px plot: the visible result is a short
arc near the top, the branches clipped, and half the plot is empty margin
(`tmp/quad-issue/frame-before-owner-owner.png`, sha256 `C1C2D8FA…`). The same
fixed window yields 15 tick labels regardless of the function.

**B. Docs gap.** `assets/references/charts.md` framed "standard chart → Chart.js"
and the only hand-rolled rule was the generic "never hard-code the domain". A
function plot is not a Chart.js chart (categorical x, no origin/axis control), and
there was no recipe for choosing a window, axes or marks. The daily session log
shows the model read `charts.md` before generating (seq 42), so the docs are on
the generation path.

**C. Renderer defect — grid and axis were the same colour.** `src/client/theme.ts`
`TOKEN_BRIDGE` bridged only foreground/card/page/muted-foreground/border/primary/
primary-foreground; `src/style.ts` whale vars are `{}`. Therefore in the default
whale style `--viz-grid` and `--viz-axis` both fell back to the host
`--dsw-alias-border-l2` (`#0000001a`) and `--viz-context` to caption
(`#adb2b8`, ~2.1:1). Measured: host tokens on 0.2.2-rc.1 are
`--dsw-alias-border-l2 #0000001a`, `--dsw-alias-border-l1 #0000000a`,
`--dsw-alias-label-tertiary #81858c`, `--dsw-alias-label-caption #adb2b8`.
Before-fix screenshot: every full-width guide row measures `rgb(229,229,229)` —
grid and axis are literally the same pixel colour. After-fix frame document:
grid stroke `rgba(0,0,0,0.04)` 1px vs axis `rgb(129,133,140)` 1.5px.

## 2. Change (four product lines, one example, docs)

| File | Change |
| --- | --- |
| `src/client/theme.ts` | **+3 bridge entries**: `grid → --dsw-alias-border-l1`, `axis → --dsw-alias-label-tertiary`, `context → --dsw-alias-label-caption` (all three host tokens verified present on 0.2.2-rc.1) |
| `src/frame-css.ts` | `--viz-axis` fallback `var(--border)` → `color-mix(in oklab, var(--foreground) 55%, transparent)` so axis ≠ grid even without a host theme |
| `assets/references/charts.md` | new **§Math function plots (y = f(x))** before the hand-rolled rules: not Chart.js; auto-window for quadratics (`h=-b/2a`, `k=c-b²/4a`, symmetric window around h, vertex ~22-28% above bottom, branches exit at 80-90% of half-width, mirror for a<0, separate linear branch for \|a\|<1e-6, no fake origin); hysteresis (keep the window until vertex/branches no longer fit with ≥8% margin); axes only where y=0 / x=0 are in view, arrowheads, 1-2-5 ticks, ≤9 x / ≤7 y labels, 11px text; grid 1px vs axis 1.5px; vertex dot + label, dashed symmetry axis, in-view roots; equation readout |
| `assets/examples/quadratic-explorer.html` | **new reference implementation** (~330 lines): a/b/c sliders (-2..2 / -10..10 / -10..10, step .1), 320px 100%-width plot, auto-window + hysteresis, all of the above marks, `data-viz-keep`, `dshViz.bind`, reduced motion, base classes/tokens only, no dependencies |
| `assets/visualize-skill.md` | Resources list gains the example; 5 lines before chart guidance: for any `y=f(x)` read the math section and start from `quadratic-explorer.html`; never Chart.js; axes/ticks/window are mandatory |
| `assets/references/design.md` | **unchanged** (no need) |

No other `src/` or test file touched.

## 3. Verification

| Check | Result |
| --- | --- |
| `pnpm run typecheck` | exit 0, both tsconfig projects |
| `pnpm run build` | exit 0; `lib/client.js` 450.73 kB, sha256 `B03974D7B7FCF5DDE9DF0CAA0C5039A13245A85E3820202893C27A73A5DBC756` |
| `npx vitest run` | **942 passed / 4 skipped (946)**, 48 files, exit 0 — same baseline |
| AGENTS §9 bundle gate | installed profile `client.js` sha256 == build sha256 `B03974D7…` (the p7c package files are hard-linked to this repo, so the build is what the host loads) |
| probe smoke (G0–G3) | exit 0 on the isolated host |
| real host | DSH 0.2.2-rc.1 desktop CLI, isolated home `tmp/dsh-7c`/profile `p7c`, `127.0.0.1:3096`; owner's exact prompt re-generated a card; both cards rendered in the chat |

**In-chat before/after** (primary evidence, real DSH):
`tmp/quad-issue/before-initial.png` (sha256 `9179301…`) vs
`tmp/quad-issue/after-default.png` (sha256 `DB245BE…`). Both show the generated
card in the conversation; after-fix the axes are visibly stronger than the grid.

**Scenario runs.** The generated cards are HTML-backend cards in a sandboxed
iframe (`sandbox="allow-scripts"`, cross-origin), so their sliders are not
driveable from the DSH page. The exact frame documents were taken from the live
iframe `srcdoc` (real plugin output, host theme variables baked in), opened in a
real bsk browser tab at 640px width, and the sliders driven with real
`input`/`change` events. Labelled honestly: these scenario shots are the plugin's
real frame document, but the in-chat shots above are the host-rendered evidence.
Frames: `frame-after.html`, `frame-before-owner.html` (the owner's original
fragment inside the current frame shell — this isolates the *generation* defect,
not the token bug), `frame-before-generated.html`.

| After scenario | Equation shown | x ticks | tick overlaps | curve height / plot |
| --- | --- | --- | --- | --- |
| default (1,0,0) | `y = x²` | 8 | 0 | 0.79 |
| owner slide (1.1,−6,6; the card's sliders clamp the requested −6.8/10 to its own range) | `y = 1.1x² − 6x + 6` | 10 | 0 | 0.67 |
| neg-a (−1,0,2) | `y = −x² + 2` | 7 | 0 | 0.63 |
| linear (0,1,0) | `y = x` | 7 | 0 | 0.66 |
| far vertex (0.5,−10,10) | `y = 0.5x² − 6x + 6` | 9 | 0 | 0.79 |
| near-zero a (0.1,1,0) | `y = 0.1x² + x` | 5 | 0 | 0.62 |

Before, same frame path: `y = 1.1x² − 6.8x + 10`, **15 ticks**, curve bbox
`y=-5047…156 h=5203` on a 300px plot (clipped), 0 overlaps but half the card is
margin (`frame-before-owner-owner.png`, sha256 `C1C2D8FA…`). After at the closest
slider values the curve occupies 0.67 of the plot height and the window is
`x≈[-1,5]`, `y≈[-5,15]` — vertex, symmetry axis, roots and equation all correct
(2.73, −2.18 / x=2.73 / Δ=9.6 / roots 1.32, 4.14 for the clamped 1.1,−6,6).

Screenshot hashes for every scenario are in `evidence/stage-7d/manifest.json`;
the PNGs stay in gitignored `tmp/quad-issue/` as the task requires.

## 4. What worked, what did not (honesty)

- The **renderer fix is directly verified**: before grid == axis (`229,229,229`
  rows) and after 1px `rgba(0,0,0,.04)` grid vs 1.5px `rgb(129,133,140)` axis,
  from `getComputedStyle` in the real frame document plus pixel rows in the in-chat
  screenshots.
- The **generation fix is not deterministic**: the owner's card used a fixed
  `[-10,10]` window; on re-generation at current HEAD with the old docs the model
  happened to produce an auto-fitted card by itself (14,100 B). The docs change
  removes the gap that allowed the bad pattern and gives a concrete example, but
  one model run is not proof every future generation is good. The after card is
  itself a model output from the new docs and passes all six measured scenarios.
- **Scenarios use the after card's own slider ranges**, so the owner case is
  `(1.1, −6, 6)` not `(1.1, −6.8, 10)`; the original card shows the exact owner
  values and the clipping.
- **Dark theme is NOT VERIFIED.** `probe.mjs --what=theme --want=dark` returned
  `BLOCKED: the host's 深色 control is not in the accessibility tree` and the
  `更多` menu exposed no theme entry in this build; the probe deliberately refuses
  to force `data-ds-dark-theme`, because a forced theme is not the host's theme.
  No dark host screenshot was taken; the token bridge uses host tokens that exist
  in both schemes, and the dark path is covered by the existing theme unit tests,
  not by a new capture.
- The frame documents for scenarios are rendered in a browser tab, not inside the
  DSH chat (the sandbox forbids access); this is why both kinds of evidence are
  reported separately.

## 5. Reproducing / refreshing the owner's installed copy

Temporary scripts live in `tmp/quad-issue/` (gitignored): `capture.mjs`,
`extract-all-frames.mjs`, `build-frames2.cjs`, `scenarios.mjs`, `pixels.py`.
Host commands used:

```powershell
$env:DSH_HOME='D:\Deepseek WorkSpace\dsh-plugin-visualize\tmp\dsh-7c'
& 'C:\Users\86139\AppData\Local\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd' --profile p7c --no-open --port 3096 --host 127.0.0.1
```

To refresh the owner's daily copy after this change (the app must be quit first):

```powershell
pnpm install; pnpm run build
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop install
& "$env:LOCALAPPDATA\Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop peers check
```

Then restart the app and re-ask the original prompt. The daily profile was not
touched in this stage; the GUI on `:55142` was never navigated or restarted.

## 6. Close-out round (2026-11-07, after review)

The first review found three gaps; this round closes or honestly records them.

**Axis direction letters.** The skill now states the requirement as a graded
checklist and gives the two SVG lines verbatim (classes `axis-label-x` /
`axis-label-y`); `charts.md` says the same. Result on the second regeneration
(fresh session): the model card carries **both** labels —
`<text class="axis-label axis-label-x">x</text>` and
``axis-label-y`` — visible in `tmp/quad-issue/after2-inchat-light.png`
(sha256 `DC80DFDA…`) and `after2-inchat-dark.png` (sha256 `E3C239CC…`), and in
the scenario shots `after3-*.png` (owner scenario exact values 1.1/−6.8/10,
vertex (3.1,−0.5), roots 2.41/3.77, 0 tick overlaps).

**Tick legibility.** The reference example now uses `fill: var(--foreground)`
for ticks and vertex/root labels; measured contrast **18.08:1** light /
**16.47:1** dark; grid vs axis guide contrast 3.4:1. The model's regenerated card
still uses the caption tier for ticks (`rgb(173,178,184)`, **2.04:1** light) —
so tick legibility in a *model-generated* card is **NOT VERIFIED**; the template
that the model copies meets the requirement. The skill/charts text says
`--foreground` at 11px, but the model's output ignored that one detail in this
run.

**Reference example hardened** (from review): tick-label collision thinning
(~6.2px/glyph + 8px gap, drop rather than overlap), a `clipPath` on the plot rect
for curve and symmetry axis, symmetric `[-4,4]` window for the linear branch, and
bold 13px axis letters with the named classes. Measured on the real frame
document opened as a tab: owner case equation `y = 1.1x² − 6.8x + 10`, vertex
(3.1,-0.5), symmetry x=3.1, roots 2.41/3.77, 7 x-ticks, 0 overlaps, curve fills
~98% of the plot height (`example-owner.png`, sha256 `9F35235B…`); default case
`example-default.png` sha256 `55ADB25B…`.

**Dark theme.** Produced through the host's own mechanism:
`document.body.setAttribute('data-ds-dark-theme','')` on the isolated host page,
then cards re-rendered by switching sessions so `resolveTheme` bakes the dark
tokens. Body corner changes `rgb(249,250,251)` → `rgb(27,27,28)`; the dark frame
document carries `--dsh-viz-foreground: #f9fafb`, `--dsh-viz-card: #232324`,
`--dsh-viz-grid: #ffffff0f`, `--dsh-viz-axis: #adb2b8` and both axis labels.
Capture: `after2-inchat-dark.png` (sha256 `E3C239CC…`). This is a host-mechanism
capture, **not** a settings-UI toggle — the 深色 control is not in the
accessibility tree in this build.

**Still NOT VERIFIED.** (a) tick colour in model-generated cards (2.04:1 in this
run; the example is 18:1); (b) deterministic generation — two attempts needed for
the axis letters, and the model can still copy only part of the recipe;
(c) the dark capture used the attribute mechanism above, published as such.
