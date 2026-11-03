# Migration matrix

Every upstream file that matters to this fork, where it went, how faithfully,
and what state it is in.

**Status vocabulary** — do not blur these:

| Status | Means |
| --- | --- |
| `kept` | Copied without change |
| `adapted` | Copied, then changed to fit the new seams |
| `rewritten` | Same behaviour, new implementation |
| `ported` | Translated to another language, behaviour preserved |
| `replaced` | Superseded by something this fork built instead |
| `pending` | Scheduled, not started |
| `dropped` | Deliberately not carried over, with a reason |

A row moves to `verified` only when a named test covers it and its output is
in `evidence/`.

## dsh-visualize (`cf6b3a3`)

| Upstream file | Fork location | How | Status |
| --- | --- | --- | --- |
| `src/index.ts` | `src/index.ts` | adapted — builds the backend registry, registers HTML first | verified (build + install) |
| `src/tool.ts` | `src/core/legacy-tool.ts` | rewritten — routed through the dispatcher | verified (`tests/tool.spec.ts`, `tests/lint-gate.spec.ts`) |
| `src/tool.ts` | `src/tool.ts` | adapted — compatibility wrapper accepting both call shapes | verified (`tests/tool.spec.ts`) |
| `src/fragment.ts` | `src/fragment.ts` | kept | verified |
| `src/lint.ts` | `src/lint.ts` | kept | verified (`tests/lint*.spec.ts`) |
| `src/lint-gate.ts` | `src/lint-gate.ts` | kept; now called before the backend runs | verified (`tests/lint-gate.spec.ts`) |
| `src/shell.ts` | `src/shell.ts` | kept — the HTML security envelope | verified (`tests/shell.spec.ts`) |
| `src/frame-css.ts` | `src/frame-css.ts` | kept | verified |
| `src/window-doc.ts` | `src/window-doc.ts` | kept | verified |
| `src/images.ts` | `src/images.ts` | kept — SSRF guard untouched | verified (`tests/images.spec.ts`, partial on Windows) |
| `src/storage.ts` | `src/storage.ts` | kept | verified (`tests/storage.spec.ts`, partial on Windows) |
| `src/style.ts` | `src/style.ts` | kept | verified |
| `src/style-guide.ts` | `src/style-guide.ts` | kept | verified |
| `src/style-files.ts` | `src/style-files.ts` | kept | verified (partial on Windows) |
| `src/self-repair.ts` | `src/self-repair.ts` | kept | verified (`tests/self-repair.spec.ts`) |
| `src/skill.ts` | `src/skill.ts` | adapted — backend section + generated language reference | pending (no test yet) |
| `src/viz-helper.ts` | `src/viz-helper.ts` | kept | verified |
| `src/client/index.tsx` | `src/client/index.tsx` | kept | verified |
| `src/client/TurnCards.tsx` | `src/client/TurnCards.tsx` | **adapted — nested-dispatch fix** | verified (`tests/turn-cards.spec.tsx`, +5) |
| `src/client/VisualizeCard.tsx` | same | kept | verified |
| `src/client/StreamingPreview.tsx` | same | kept | verified |
| `src/client/*` (rest) | same | kept | verified |
| `assets/visualize-skill.md` | `assets/visualize-skill.md` | kept | — |
| `tsdown.config.ts` | same | kept | verified (build) |

## dsh-intelligent-ui (`0b08749`)

| Upstream file | Fork location | How | Status |
| --- | --- | --- | --- |
| `src/lang/tokenize.js` | `src/backends/openui/tokenize.ts` | ported — diagnostics given codes | verified (differential: `evidence/phase-2/differential.json`) |
| `src/lang/parse.js` | `src/backends/openui/parse.ts` | ported — typed AST, call collection | verified (`tests/core.spec.ts` parse cases) |
| `src/lang/signatures.js` | `src/backends/openui/signatures.ts` | generated from the upstream module — 48 components / 73 functions, names and order identical | verified (`tests/openui-signatures.spec.ts`) |
| `src/lang/evaluate.js` | `src/backends/openui/evaluate.ts` | ported — lazy resolution, cycles as diagnostics, stateDefaults independent of caller state | verified (`tests/openui-evaluate.spec.ts`, 25 tests) |
| `src/lang/functions.js` | `src/backends/openui/functions.ts` | ported — 72 implementations, every upstream quirk kept and commented | verified (`tests/openui-functions.spec.ts`, 64 tests) |
| `src/lang/spec.js` | — | replaced — skill text generated from our tables | done |
| `src/client/**` | — | dropped — the fork uses the host's card shell | dropped |
| `src/client/theme/**` (host token lookup) | `src/client/OpenUICard.tsx` `HOST_TOKENS` | rewritten — the fork mounts the card in the host document, so it must read the host's `--dsw-*` tokens; upstream only ever read its own scope | verified (`evidence/browser-phase-1/MANIFEST-1.3.json`) |
| `index.js` | — | dropped — the fork has one tool, not one per backend | dropped (ADR-002) |
| `scripts/build-client.mjs` | — | dropped — tsdown builds both halves | dropped |
| `test/lang.test.mjs` | `evidence/phase-2/differential.mjs` + `tests/fixtures/openui-corpus.json` | replaced — the corpus is extracted from it and run against the live upstream module | verified (31/31 programs, 0 differences) |

## Fork-only divergences

Rows here have no upstream counterpart; they exist because the fork changed the
shape of the problem. Recording them keeps "kept from upstream" honest.

| Divergence | Where | Why |
| --- | --- | --- |
| `HOST_TOKENS` bridge | `src/client/OpenUICard.tsx` | The OpenUI card is mounted **in the host document**, not inside a frame. `src/frame-css.ts` declares `--foreground`, `--primary` etc. inside the HTML backend's iframe `srcdoc`; those names do not exist in the host. DSH publishes only `--dsw-alias-*` / `--dsw-static-*`. Using the frame vocabulary on a host-mounted card silently resolves every variable to nothing. |
| `theme.ts` token list as the authority | `src/client/theme.ts` → `OpenUICard.tsx` | One file decides which host token means "foreground"; both renderers read it, so the two backends cannot drift apart again (D6 was exactly that drift). |
| OpenUI `$state` persistence | `src/client/openui-state.ts` (new), `src/client/OpenUICard.tsx` | Upstream dsh-intelligent-ui keeps `$state` in React only, so a reload re-evaluates from defaults. The fork persists it through the host's existing card-state store under a `:openui` key (ADR-006). Upstream has no equivalent, and no code was carried over: the record shape, hash and merge rules are original. |
| Action dispatch | `src/client/openui-actions.ts` (new) | Upstream runs actions from `30-render.js:599-647` against a mutable store. The fork's dispatcher is pure — it returns a patch that the card applies through its one state channel — so a Button and a Slider cannot diverge in validation or persistence. `@Set` and `Action([...])` keep upstream's semantics, including its pre-click snapshot contract. |
| `@Reset(...)` arguments | `src/client/openui-actions.ts` | **Divergence reproduced, not introduced.** Upstream's executor calls `store.reset()` with no argument (`20-store.js:112-118`), so `@Reset($a, $b)` resets everything and its bindings are never read. The fork does the same and emits an `action.reset-ignores-args` note so the gap is recorded; selecting variables by argument would be a semantic change needing its own decision. |

## Component coverage — 12 of 48 render

The language parses and evaluates all 48 (`src/backends/openui/signatures.ts`);
the renderer draws 12. Measured, not remembered: `tests/openui-inventory.spec.tsx`
imports the renderer's own `RENDERED_COMPONENTS` and the language's table and
prints the split. A name may only appear in the *rendered* column if it is in
`COMPONENTS` — the probe asserts that no renderer name is phantom.

(The previous probe, `evidence/phase-3/component-inventory.mjs`, mirrored the
renderer's table as a hand-written literal and still reported 8 / 48 after the
4A-1 renderers existed. It is superseded; see D19 in the 4A-1 manifest.)

| Group | Total | Rendered | Missing (stage 4A batch) |
| --- | --- | --- | --- |
| Layout | 9 | Col, Row, Box, Grid, Card, Divider, Spacer | Carousel, Popover (4A-5) |
| Text | 10 | Title, Text, Caption | Label, Badge, Link, List, ListItem, Quote, Code (**4A-2**) |
| Inputs | 13 | Button, Slider | Input, TextArea, Select, SegmentedControl, Checkbox, RadioGroup, DatePicker, Timer, Form, IconButton, Pressable (**4A-3**) |
| Drawing | 10 | — | Svg, G, Circle, Ellipse, Rect, Line, Path, Polyline, Polygon, SvgText (**4A-5**) |
| Media and data | 4 | — | Table, Chart, Icon, Image (**4A-4**) |
| Play | 2 | — | Flashcard, Celebration (4A-5) |

**Status: 12/48 `ported`; 36 pending.** Each batch moves its own rows to
`verified` only when its exit criteria are met, browser evidence included — the
same rule as every other row in this file.

### 4A-1 rows (browser-verified)

| Upstream | Fork location | How | Status |
| --- | --- | --- | --- |
| `Box` (`layout-text.js:687-712`) | `src/client/OpenUICard.tsx` | **rewritten** — longhand border resolution so a shorthand cannot erase it, `box-sizing: border-box`, radius clips content only when set, semantic `background` painted as a 14% tint of its series | verified (`evidence/phase-4a-1/`, A1, A2) |
| `Grid` (`:714-737`) | same | **rewritten** — the three track branches (count / explicit CSS / `auto-fit`) keep upstream's intent; the `min(100%, …)` floor is added so a wide `minChildWidth` cannot overflow a narrow card | verified (A3, A4) |
| `Divider` (`:773-779`) | same | **adapted** — same role/aria contract, painted from the bridged `--border` rather than a frame-only class | verified (A5) |
| `Spacer` (`:781-787`) | same | **adapted** — `flex: 1 1 0` with a 4px floor, as upstream | verified (A6) |

Two bridged host tokens were **wrong** on first browser run and are recorded as
D17/D18 in the 4A-1 manifest: `--dsw-static-purple-500` and
`--dsh-font-family-text-default` do not exist in the DSH host. Both had
fallbacks, so the card looked correct while resolving to nothing — the D6/D7
defect class. Fixed and re-verified in both themes.

### External actions — recognised, refused, not implemented

`ACTION_STEPS` declares six steps; three execute. The other three are listed in
`UNSUPPORTED_STEPS` (`src/client/openui-actions.ts`) so a program that uses one
gets an `action.unsupported` refusal naming it, rather than a silent no-op.

| Action | Upstream behaviour (`30-render.js`) | Fork status | Gate |
| --- | --- | --- | --- |
| `@Set` | `store.set(binding.name, value(args[1]))` (`:609-616`) | **implemented**, reproduced | — |
| `@Reset` | `store.reset()`, arguments ignored (`:618-620`) | **implemented**, divergence recorded | — |
| `Action([...])` | runs each step in order (`:639-642`) | **implemented**, reproduced | — |
| `@OpenUrl` | protocol-checked `window.open` (`:622-629`) | **refused** | protocol allowlist; needs its own ADR (4B) |
| `@CopyToClipboard` | `navigator.clipboard.writeText` + legacy fallback (`:631-634`, `:649-…`) | **refused** | real-gesture-only, permission refusal reported (4B) |
| `@ToAssistant` | `toAssistant(utilRawText(...))` (`:635-638`) | **refused** | fill the composer, never auto-submit (4B) |

## open-intelligent-ui (`16ef264`)

| Upstream capability | Fork location | How | Status |
| --- | --- | --- | --- |
| `src/lib/library.ts` (48 components) | `src/client/OpenUICard.tsx` `COMPONENTS` | rewritten — 12 of 48 drawn; the coverage table above is the authority | 12 ported / 36 pending |
| `src/lib/functions/` (73 functions) | `src/backends/openui/functions.ts` | ported — stage 2 | verified (differential) |
| `src/lib/components/map/` | — | pending — needs a network policy ADR first | pending |
| `src/lib/components/media.tsx` (`SearchImage`) | — | pending — needs its own service | pending |
| `src/lib/components/html-view.tsx` | — | pending — its sandbox+CSP pattern is the reference | pending |
| `src/lib/components/chart.tsx` | — | replaced — HTML backend already has Chart.js | replaced |
| `src/app/**` (Next.js shell, API routes) | — | dropped — not installable into DSH | dropped |
| `src/generated/*.json` | — | dropped — our skill text is generated from our tables | dropped |