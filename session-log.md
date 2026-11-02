# Session Log

Current working state. The last session overwrites the top block and appends
to the history. If you are an agent starting work, read this first.

---

## 1. Current version

| Field | Value |
| --- | --- |
| Package | `@dsh-unified/visualize` |
| Version | `0.1.0` (unreleased) |
| Branch | `main` |
| HEAD | see `git log -1` |
| Upstream baseline | dsh-visualize `cf6b3a3`, dsh-intelligent-ui `0b08749`, open-intelligent-ui `16ef264` |

## 2. Current stage

| Field | Value |
| --- | --- |
| Stage | 2 — OpenUI language core |
| Goal | Evaluate programs, not just validate them; widen the tables toward 48/73 |
| Status | Not started |

## 3. Current progress

**Discussed** — `PLAN.md`, `STAGE.md`, `docs/decisions/`.

- Unified host + dual backends (ADR-001); one tool, backend by argument
  (ADR-002); versioned envelope with flat legacy fields (ADR-003); per-backend
  security boundaries (ADR-004); five-layer documentation (ADR-005).
- Order changed: close the OpenUI render loop before migrating 73 functions.

**Implemented** — in the tree, `tsc` clean.

- Everything from session 1 (host core, registry, dispatcher, both backend
  adapters, tokenizer + parser, nested-dispatch fix).
- `VisualizationDescriptor = VisualizeMeta | OpenUIMeta` — an explicit
  discriminant, not a program disguised as a fragment.
- `openuiMetaFrom`, `openuiMetaFromArgs`, `visualizationFrom` in `fragment.ts`,
  including recovery of a program from half-streamed arguments.
- `src/client/OpenUICard.tsx` — the second renderer. Draws host components
  from a component table; no iframe, no `innerHTML`, no `eval`.
- Lazy reference resolution, so a statement may be used before it is defined.
- A second keyed toolview (`intelligent_ui`), so legacy cards replay.

**Verified** — ran, output in `evidence/phase-1/`.

- `tsc` host + client: clean.
- `npx vitest run`: **465 passed / 15 failed / 480 total**.
- Failure set is **identical** to the upstream baseline (15 / 426 → 15 / 465).
- `npx tsdown`: `lib/index.js` 220.42 kB, `lib/client.js` 198.71 kB.
- End to end: a persisted program meta is recognised by `openuiMetaFrom`,
  declined by `visualizeMetaFrom`, dispatched as `intelligent_ui`, and renders
  to a React element tree without error (`e2e-openui-dispatch.txt`).

**Not verified** — do not claim these work.

- **No browser has driven an OpenUI card.** The render is proven server-side
  only. Whether it lays out correctly in the chat, follows the theme, or
  survives a reload is untested.
- Interaction is inert: `Slider` is drawn disabled and `Button` has no action,
  because actions need `$state` and the evaluator (stage 2/3).
- Nothing is evaluated. `@function` calls render as text where the table has a
  component, and as null otherwise; no arithmetic, no `@Each`, no `@Format`.
- 8 of 48 components, 17 of 73 functions.

## 4. This session's changes

| File | Change | Why |
| --- | --- | --- |
| `.gitignore` | root-anchored patterns | an unanchored `lib/` was silently excluding `upstream/open-intelligent-ui/src/lib/` from the baseline commit |
| `src/fragment.ts` | `OpenUIMeta`, `VisualizationDescriptor`, three readers | the client needs an explicit discriminant, not a guessed field |
| `src/client/OpenUICard.tsx` | new | the second renderer |
| `src/client/VisualizeCard.tsx` | dispatch on `kind` | a program card must reach its own renderer |
| `src/client/index.tsx` | second keyed toolview | legacy `intelligent_ui` cards replay |
| `tests/openui-card.spec.tsx` | new, 10 tests | dispatch, boundary, forward references, no-markup-interpretation |
| `tests/prompt-bridge.spec.tsx` | fake made key-aware | the fake keyed by name only; with two keyed toolviews, one shadowed the other |
| docs | manifest, stage, log | this entry |

## 5. Test results

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Types | `npx tsc -p tsconfig.json --noEmit` / `-p tsconfig.client.json` | PASS | — |
| Build | `npx tsdown` | PASS | `evidence/phase-1/build-after-p11.txt` |
| Fork suite | `npx vitest run` | 465 pass / 15 fail | `evidence/phase-1/test-fork-after-p11.txt` |
| Upstream baseline | same, in `upstream/dsh-visualize` | 426 pass / 15 fail | `evidence/phase-1/test-upstream-baseline.txt` |
| No new failures | normalised FAIL-set diff | IDENTICAL | `MANIFEST.json` |
| OpenUI dispatch e2e | `npx vite-node evidence/phase-1/e2e-openui-dispatch.mjs` | PASS | `evidence/phase-1/e2e-openui-dispatch.txt` |

## 6. Open issues

| Issue | Impact | Status |
| --- | --- | --- |
| OpenUI card unverified in a browser | The second backend is server-proven only | Stage 3 |
| No evaluator | Programs render structure but compute nothing | Stage 2 |
| Interaction inert | Slider disabled, Button actionless | Stage 2/3 |
| 15 Windows test failures | Noise that could hide a real regression | Accepted; `docs/testing/TEST_PLAN.md` |

## 7. Next step

**Stage 2 — OpenUI language core.** Permitted edits: `src/backends/openui/`
and `tests/`. Do not touch `src/client/`. Done when the exit criteria in
`STAGE.md` are each backed by evidence under `evidence/phase-2/`.

Before starting, consider closing the browser-verification gap first: loading
the built plugin in a real DSH session and screenshotting one OpenUI card
would turn `openuiRendersInBrowser` from NOT VERIFIED into a real result, and
it is cheaper now than after the language core grows.

---

## History

### Session 2 — 2026-11-02

Git initialised; baseline commit `9341c8d`, then `2e5afc9` fixing an unanchored
`.gitignore` that had excluded upstream reference source. Upstream snapshots
committed as plain source (no `.git`, no `node_modules`). Stage 1.1 done: the
OpenUI render loop is closed on the host and in the renderer, verified
server-side. One regression caught and fixed (a key-blind test fake).

### Session 1 — 2026-11-02

Fork created from `cf6b3a3`. Three upstream snapshots pinned under `upstream/`.
Stage 1 implemented and accepted with the openui rendering gap. Fixed the
nested-dispatch card loss inherited from the base. Documentation system
established.
