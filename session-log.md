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
| Status | Not started; stages 1.2 and 1.3 closed first |

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
- **B07 and B08, closed in stage 1.3** (`evidence/browser-phase-1/MANIFEST-1.3.json`):
  every card child sits at `leftOffset: 0` with the Button at its own 88.8px
  width; 7 of 7 bridged CSS variables resolve in both schemes; text measures
  17.45–18.9:1 and the Button 5.61:1 in dark. Both themes were switched through
  the host's own Settings → 通用设置 → 外观 control.

**Not verified** — do not claim these work.

- B05 streaming: the model emitted the program in one chunk; nothing partial
  was observed. The recovery path is unit-tested only.
- B10 session switching: no second session opened.
- Interaction is inert: `Slider` draws disabled, `Button` has no action.
- Nothing is evaluated. 8 of 48 components, 17 of 73 functions.

**Known, not fixed** — the light Button pair is 4.23:1, below AA for body text.
This is the host's own pairing (its send button and "1017" badge use the same
`#4176e6`/`#fff`), so it is recorded rather than changed unilaterally.

## 4. This session's changes

| File | Change | Why |
| --- | --- | --- |
| `tsdown.config.ts` | `PLUGIN_ID` read from `package.json` | a hard-coded id made the host refuse to activate the plugin; only a real load exposed it |
| `src/client/OpenUICard.tsx` | `align-items: stretch`, `Button` `align-self` | a lone Button was centred in the card |
| `src/client/OpenUICard.tsx` | `HOST_TOKENS` bridge declared on the card root | none of the 12 CSS variables resolved: the card used the frame vocabulary, which only exists inside the HTML backend's iframe |
| `src/client/OpenUICard.tsx` | Button border longhands; `--primary-foreground` → `--dsw-alias-label-primary-foreground` | a shorthand conflict erased the border; the `*-inverted` token failed AA (3.59:1) |
| `src/client/OpenUICard.tsx` | title in foreground at 0.65 opacity; series palette realigned | the title was 2.13:1 and the two backends disagreed; `success`/`warning`/`danger` were offset by one |
| `tests/openui-card.spec.tsx` | +5 tests (2 layout, 3 token/colour) | lock the alignment, the token bridge and the colour semantics |
| `evidence/browser-phase-1/` | new | B01–B11 results, logs, screenshots, manifiests, probes |

## 5. Test results

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Types | `npx tsc -p tsconfig.json --noEmit` / `-p tsconfig.client.json` | PASS | — |
| Suite | `npx vitest run` | 467 / 15 | `evidence/phase-1/test-fork-after-browser.txt` |
| Baseline parity | normalised FAIL-set diff | IDENTICAL | `evidence/phase-1/MANIFEST.json` |
| Browser B01–B11 | live DSH session at :3081 | 7 PASS, 1 FIXED, 2 NOT VERIFIED | `evidence/browser-phase-1/MANIFEST.json` |
| Browser B07/B08 | live DSH session, both schemes | PASS | `evidence/browser-phase-1/MANIFEST-1.3.json` |
| Card unit tests | `npx vitest run tests/openui-card.spec.tsx` | 15 / 15 PASS | — |

## 6. Open issues

| Issue | Impact | Status |
| --- | --- | --- |
| B05/B10 unverified | Two claims about the card are untested | Later stage |
| Light Button pair is 4.23:1 | Below AA for body text; matches the host's own pairing | Recorded, not changed |
| No evaluator | Programs render structure but compute nothing | Stage 2 |
| 15 Windows test failures | Noise that could hide a regression | Accepted; `docs/testing/TEST_PLAN.md` |

## 7. Next step

**Stage 2 — OpenUI language core.** Permitted edits: `src/backends/openui/`
and `tests/`. Do not touch `src/client/`. Done when the exit criteria in
`STAGE.md` are each backed by evidence under `evidence/phase-2/`.

The two cheap closures are done (stage 1.3). They cost more than "minutes"
because closing them exposed five defects, one of which meant the card had never
been styled at all. That is the argument for closing a known gap while you are
still standing in the code that owns it.

---

## History

### Session 4 — 2026-11-02

Stage 1.3: closed B07 and B08 with browser evidence on an isolated profile
(`vizb78`; production untouched). Closing them found that **no CSS variable on
the OpenUI card had ever resolved** — the card used the HTML backend's frame
vocabulary, which only exists inside its iframe. The Button had no background,
no border and square corners for the whole of stage 1.2, and every unit test
passed. Five defects fixed (D3–D7), 3 regression tests added. B05 and B10 stay
NOT VERIFIED by scope.

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
