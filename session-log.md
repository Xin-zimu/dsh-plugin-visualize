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
| Status | **Done** — ported, differentially matched, verified in a browser with two recorded gaps |

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
- **Stage 2 — the language core** (`evidence/phase-2/`):
  `npx vitest run` = **576 passed / 15 failed**, failure set byte-identical to the
  upstream baseline. The differential run compares **31 programs across 7 fields
  each and finds 0 differences** against the pinned upstream module. Both
  `tsc` projects are clean; `npx tsdown` builds.
- **In a real browser** (`evidence/browser-phase-2/results.json`): a card shows
  `count 3` and `item 0/1/2` computed by `@Count`/`@Format`/`@Each` (S01); a
  bound Slider is draggable (S02); dragging it 3 → 6 changed a sibling to
  `count 6` and grew the list from 3 rows to 6 (S03).

**Not verified** — do not claim these work.

- `$state` is **not persisted**: a reload re-evaluates from defaults (S04 is
  PARTIAL for this reason).
- `Button` actions are inert — `@Set`/`@Reset`/`@OpenUrl` evaluate into
  descriptors that nothing consumes.
- 8 of 48 components render; the language understands all 48.
- B05 streaming and B10 session switching remain unverified from phase 1.

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
| `evidence/browser-phase-1/` | new | B01–B11 results, logs, screenshots, manifests, probes |
| `src/backends/openui/functions.ts` | new, 1652 lines | ported from upstream; 72 implementations, every quirk kept and commented |
| `src/backends/openui/evaluate.ts` | new, 835 lines | ported from upstream; lazy resolution, cycles as diagnostics |
| `src/backends/openui/signatures.ts` | regenerated, 1015 lines | 48 components / 73 functions, names and order identical to upstream |
| `src/backends/openui/parse.ts`, `tokenize.ts` | `line` moved out of the message into the field | an identical error has to compare equal against upstream |
| `src/core/render-contract.ts` | `Diagnostic.line` added | the host, not the backend, decides how to show a location |
| `src/client/OpenUICard.tsx` | cut-down `Scope` replaced with the real evaluator; Slider writes `$state`; positional React keys | two evaluators would drift, and `@Each` siblings shared one key |
| `tests/openui-*` | 5 new specs, 106 tests | functions, evaluate, signatures, render, interaction |

## 5. Test results

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Types | `npx tsc -p tsconfig.json --noEmit` / `-p tsconfig.client.json` | PASS | — |
| Suite | `npx vitest run` | 467 / 15 | `evidence/phase-1/test-fork-after-browser.txt` |
| Baseline parity | normalised FAIL-set diff | IDENTICAL | `evidence/phase-1/MANIFEST.json` |
| Browser B01–B11 | live DSH session at :3081 | 7 PASS, 1 FIXED, 2 NOT VERIFIED | `evidence/browser-phase-1/MANIFEST.json` |
| Browser B07/B08 | live DSH session, both schemes | PASS | `evidence/browser-phase-1/MANIFEST-1.3.json` |
| Differential | `node --experimental-strip-types evidence/phase-2/differential.mjs` | 31/31, 0 differences | `evidence/phase-2/differential.json` |
| Browser S01–S04 | live DSH session at :3082 | 3 PASS, 1 PARTIAL | `evidence/browser-phase-2/results.json` |
| Card unit tests | `npx vitest run tests/openui-card.spec.tsx` | 15 / 15 PASS | — |

## 6. Open issues

| Issue | Impact | Status |
| --- | --- | --- |
| B05/B10 unverified | Two claims about the card are untested | Later stage |
| Light Button pair is 4.23:1 | Below AA for body text; matches the host's own pairing | Recorded, not changed |
| `$state` not persisted | A reload loses what the user set | Stage 3 |
| Button actions inert | `@Set` etc. evaluate but nothing consumes them | Stage 3 |
| 8 of 48 components render | The language knows all 48; the renderer draws 8 | Stage 3 |
| 15 Windows test failures | Noise that could hide a regression | Accepted; `docs/testing/TEST_PLAN.md` |

## 7. Next step

**Stage 3 — OpenUI render backend, part two.** Permitted edits: `src/client/`.
Nothing in stage 3 may change language semantics: if a program evaluates
differently after stage 3, the differential run has regressed.

Scope, in order: card-state persistence (so S04 becomes PASS), Button action
steps, then widening the renderer from 8 components toward 48.

Open question for the user before starting: persisting `$state` means deciding
where it lives — the session store (shared with the card's saved frame state) or
a new per-card key. That is a decision, not an implementation detail, and it
should be recorded as an ADR before code.

---

## History

### Session 5 — 2026-11-02

Stage 2: the OpenUI language core is ported and differentially matched. 31
programs × 7 fields, 0 differences against the pinned upstream module. The
signature table is now generated from upstream (48 / 73, identical names and
order). Three defects in existing code fell out of the port: parse and tokenizer
diagnostics embedded the line in the message, and the client had a second,
cut-down evaluator. All three fixed.

In a real browser a bound Slider now drives other components — 3 → 6 changed a
sibling's `@Count` and grew the `@Each` list from 3 rows to 6. `$state`
persistence, Button actions and 40 unrendered components are the recorded gaps.

Also corrected: the "70 implementations" figure was wrong (a grep for
`Name(args) {` misses `Now()` and `Today()`); the real count is 72, plus `@Each`
in the evaluator, which accounts for all 73 signatures.

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