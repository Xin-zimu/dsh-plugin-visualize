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
| Status | Not started; stage 1.2 closed first |

## 3. Current progress

**Discussed** — `PLAN.md`, `STAGE.md`, `docs/decisions/`.

- Unified host + dual backends (ADR-001); one tool, backend by argument
  (ADR-002); versioned envelope (ADR-003); per-backend security (ADR-004);
  five-layer documentation (ADR-005).

**Implemented** — in the tree, `tsc` clean.

- Host core, registry, dispatcher, both backend adapters, tokenizer + parser.
- `VisualizationDescriptor = VisualizeMeta | OpenUIMeta`, and `OpenUICard`,
  the second renderer (host components, no iframe, no `eval`).
- `tsdown.config.ts` now reads the bundle id from `package.json`.
- Card body and `Col` stretch their children; `Button` keeps its own width.

**Verified** — ran, output in `evidence/`.

- `npx vitest run`: **467 passed / 15 failed / 482 total**; failure set still
  identical to the upstream baseline.
- `tsc` host + client: clean. `npx tsdown`: builds both halves.
- **In a real browser, in a real DSH session** (`evidence/browser-phase-1/`):
  the plugin loads with an empty console (B01, B11); an OpenUI card drawn by the
  model renders as real components (B03); an HTML card still renders in its
  iframe (B04); `<img onerror>` shows as text with no dialog (B06); the card
  replays after a full reload with no model call (B09).

**Not verified** — do not claim these work.

- B05 streaming: the model emitted the program in one chunk; nothing partial
  was observed. The recovery path is unit-tested only.
- B08 dark theme: only light was exercised.
- B10 session switching: no second session opened.
- The alignment fix (B07) is covered by unit tests only — the corrected card
  was not re-screenshotted in a browser.
- Interaction is inert: `Slider` draws disabled, `Button` has no action.
- Nothing is evaluated. 8 of 48 components, 17 of 73 functions.

## 4. This session's changes

| File | Change | Why |
| --- | --- | --- |
| `tsdown.config.ts` | `PLUGIN_ID` read from `package.json` | a hard-coded id made the host refuse to activate the plugin; only a real load exposed it |
| `src/client/OpenUICard.tsx` | `align-items: stretch`, `Button` `align-self` | a lone Button was centred in the card |
| `tests/openui-card.spec.tsx` | +2 layout tests | lock the alignment contract |
| `evidence/browser-phase-1/` | new | B01–B11 results, logs, screenshots, manifest |

## 5. Test results

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Types | `npx tsc -p tsconfig.json --noEmit` / `-p tsconfig.client.json` | PASS | — |
| Suite | `npx vitest run` | 467 / 15 | `evidence/phase-1/test-fork-after-browser.txt` |
| Baseline parity | normalised FAIL-set diff | IDENTICAL | `evidence/phase-1/MANIFEST.json` |
| Browser B01–B11 | live DSH session at :3081 | 7 PASS, 1 FIXED, 3 NOT VERIFIED | `evidence/browser-phase-1/MANIFEST.json` |

## 6. Open issues

| Issue | Impact | Status |
| --- | --- | --- |
| B05/B08/B10 unverified | Three claims about the card are untested | Stage 3 |
| Alignment fix not re-rendered in a browser | The fix is proven by unit test only | Cheap to close |
| No evaluator | Programs render structure but compute nothing | Stage 2 |
| 15 Windows test failures | Noise that could hide a regression | Accepted; `docs/testing/TEST_PLAN.md` |

## 7. Next step

**Stage 2 — OpenUI language core.** Permitted edits: `src/backends/openui/`
and `tests/`. Do not touch `src/client/`. Done when the exit criteria in
`STAGE.md` are each backed by evidence under `evidence/phase-2/`.

Before that, two cheap closures: re-screenshot the aligned card (B07), and
toggle the theme once to cover B08. Both are minutes, and both remove a
NOT VERIFIED from the record.

---

## History

### Session 3 — 2026-11-02

Stage 1.2: verified the OpenUI card in a real DSH web session on an isolated
profile (viztest12; production untouched). Found and fixed two defects that unit
tests could not catch — a bundle id that only fails at host load, and a flex
alignment default. B01–B11 recorded; three are NOT VERIFIED by scope.

### Session 2 — 2026-11-02

Git initialised; baseline commit `9341c8d`, then `2e5afc9` fixing an unanchored
`.gitignore` that had excluded upstream reference source. Upstream snapshots
committed as plain source. Stage 1.1: the OpenUI render loop closed on the host
and in the renderer, verified server-side.

### Session 1 — 2026-11-02

Fork created from `cf6b3a3`. Three upstream snapshots pinned. Stage 1 implemented
and accepted with the openui rendering gap. Fixed the nested-dispatch card loss
inherited from the base. Documentation system established.
