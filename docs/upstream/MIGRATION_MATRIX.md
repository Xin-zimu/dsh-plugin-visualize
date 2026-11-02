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
| `src/lang/tokenize.js` | `src/backends/openui/tokenize.ts` | ported — diagnostics given codes | implemented, tests pending |
| `src/lang/parse.js` | `src/backends/openui/parse.ts` | ported — typed AST, call collection | verified (`tests/core.spec.ts` parse cases) |
| `src/lang/signatures.js` | `src/backends/openui/signatures.ts` | rewritten — 8 components / 17 functions | pending (stage 2 widens to 48/73) |
| `src/lang/evaluate.js` | `src/backends/openui/evaluate.ts` | pending | pending (stage 2) |
| `src/lang/functions.js` | `src/backends/openui/functions.ts` | pending | pending (stage 2) |
| `src/lang/spec.js` | — | replaced — skill text generated from our tables | done |
| `src/client/**` | — | dropped — the fork uses the host's card shell | dropped |
| `src/client/theme/**` (host token lookup) | `src/client/OpenUICard.tsx` `HOST_TOKENS` | rewritten — the fork mounts the card in the host document, so it must read the host's `--dsw-*` tokens; upstream only ever read its own scope | verified (`evidence/browser-phase-1/MANIFEST-1.3.json`) |
| `index.js` | — | dropped — the fork has one tool, not one per backend | dropped (ADR-002) |
| `scripts/build-client.mjs` | — | dropped — tsdown builds both halves | dropped |
| `test/lang.test.mjs` | `tests/openui-language.spec.ts` | pending — reused as the stage-2 differential oracle | pending |

## Fork-only divergences

Rows here have no upstream counterpart; they exist because the fork changed the
shape of the problem. Recording them keeps "kept from upstream" honest.

| Divergence | Where | Why |
| --- | --- | --- |
| `HOST_TOKENS` bridge | `src/client/OpenUICard.tsx` | The OpenUI card is mounted **in the host document**, not inside a frame. `src/frame-css.ts` declares `--foreground`, `--primary` etc. inside the HTML backend's iframe `srcdoc`; those names do not exist in the host. DSH publishes only `--dsw-alias-*` / `--dsw-static-*`. Using the frame vocabulary on a host-mounted card silently resolves every variable to nothing. |
| `theme.ts` token list as the authority | `src/client/theme.ts` → `OpenUICard.tsx` | One file decides which host token means "foreground"; both renderers read it, so the two backends cannot drift apart again (D6 was exactly that drift). |

## open-intelligent-ui (`16ef264`)

| Upstream capability | Fork location | How | Status |
| --- | --- | --- | --- |
| `src/lib/library.ts` (48 components) | reference | rewritten — see `docs/specifications/COMPONENT_CATALOG.md` | pending |
| `src/lib/functions/` (73 functions) | reference | ported — stage 2 | pending |
| `src/lib/components/map/` | — | pending — needs a network policy ADR first | pending |
| `src/lib/components/media.tsx` (`SearchImage`) | — | pending — needs its own service | pending |
| `src/lib/components/html-view.tsx` | — | pending — its sandbox+CSP pattern is the reference | pending |
| `src/lib/components/chart.tsx` | — | replaced — HTML backend already has Chart.js | replaced |
| `src/app/**` (Next.js shell, API routes) | — | dropped — not installable into DSH | dropped |
| `src/generated/*.json` | — | dropped — our skill text is generated from our tables | dropped |
