# Session Log

Current working state. The last session overwrites the top block and appends
to the history. If you are an agent starting work, read this first.

---

## 1. Current version

| Field | Value |
| --- | --- |
| Package | `@dsh-unified/visualize` |
| Version | `0.1.0` (unreleased) |
| Branch | none — the working copy is **not a git repository yet** |
| HEAD | n/a |
| Upstream baseline | dsh-visualize `cf6b3a3`, dsh-intelligent-ui `0b08749`, open-intelligent-ui `16ef264` |

## 2. Current stage

| Field | Value |
| --- | --- |
| Stage | 1 — Fork skeleton, dual-backend seat |
| Goal | One host, one tool, two registered backends, nothing regressed |
| Status | **Accepted, with one recorded gap** |

## 3. Current progress

**Discussed** — recorded in `PLAN.md`, `STAGE.md`, `docs/decisions/`.

- Unified host + dual backends + capability adapter is the chosen architecture
  (ADR-001).
- One tool, backend selected by argument (ADR-002).
- A versioned envelope with flat legacy fields beside it (ADR-003).
- Per-backend security boundaries that are not negotiable (ADR-004).

**Implemented** — in the tree, `tsc` clean.

- `core/render-contract.ts`, `core/registry.ts`, `core/dispatcher.ts`,
  `core/legacy-tool.ts`.
- `backends/html/renderer.ts` — adapter over the inherited lint + fragment rules.
- `backends/openui/{renderer,tokenize,parse,signatures}.ts`.
- `src/tool.ts` — compatibility entry accepting both call shapes.
- `src/index.ts` — registers the registry (HTML first, so it stays the default).
- Client fix: `client/TurnCards.tsx` now collects cards from `tool/ptc-dispatch`.
- `skill.ts` — backend-selection section plus a language reference generated
  from the signature tables.

**Verified** — ran, output saved under `evidence/phase-1/`.

- `npx tsc -p tsconfig.json` and `-p tsconfig.client.json`: clean.
- `npx tsdown`: `lib/index.js` 216.82 kB, `lib/client.js` 159.26 kB.
- `npx vitest run` in the fork: **455 passed, 15 failed, 470 total**.
- The same suite in `upstream/dsh-visualize`: **426 passed, 15 failed, 441 total**.
- The 15 failing tests are **byte-identical** between the two runs
  (sha256 of the sorted failure list matches). Net new tests: 29, all passing.
- Plugin installs into a scratch profile and appears in `--dump-config`.

**Not verified** — do not claim these work.

- **An openui card does not render.** The backend validates, the tool persists
  the envelope, and `descriptorFrom` reads it back — but the browser half still
  reads `visualizeMetaFrom`, which requires `kind === 'visualize'` and a
  `fragment` field. A program card carries `kind: 'intelligent_ui'` and
  `program`, so `visualizeMetaFrom` returns `undefined` and the card falls back
  to generic text. Proven by a runtime probe, not assumed. Stage 3 closes this.
- No openui card has been seen in a browser.
- The evaluator does not exist yet; nothing is evaluated, only validated.
- Only 8 of 48 components and 17 of 73 functions are present.

## 4. This session's changes

| File | Change | Why |
| --- | --- | --- |
| `src/client/TurnCards.tsx` | `match` accepts `tool/ptc-dispatch`; `tool/call` records its turn | A card drawn through `run_code` settled in the fold and never reappeared under the answer |
| `src/core/*` | new | The host core the fork is for |
| `src/backends/html/renderer.ts` | new | HTML behind the neutral contract, rules untouched |
| `src/backends/openui/*` | new | tokenizer + parser ported to TypeScript; signatures table |
| `src/tool.ts` | wrapper | Keeps the pre-fork `(ctx, maxBytes, style, images)` call shape working |
| `src/index.ts` | registry wiring | HTML registered first, so it stays the default |
| `tests/core.spec.ts` | new, 24 tests | The contract, the registry, the router, both validators |
| `tests/turn-cards.spec.tsx` | +5 tests | Regression cover for the nested-dispatch fix |
| Docs | new | This five-layer set |

## 5. Test results

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Host + client types | `npx tsc -p tsconfig.json --noEmit` / `-p tsconfig.client.json` | PASS | — |
| Bundle build | `npx tsdown` | PASS | `evidence/phase-1/build.txt` |
| Fork suite | `npx vitest run` | 455 pass / 15 fail | `evidence/phase-1/test-fork.txt` |
| Upstream baseline | `npx vitest run` in `upstream/dsh-visualize` | 426 pass / 15 fail | `evidence/phase-1/test-upstream-baseline.txt` |
| No new failures | sha256 of sorted FAIL list | IDENTICAL | `evidence/phase-1/failures-*.txt` |

The 15 failures are pre-existing on Windows: assertions that assume `/n`
newlines against a CRLF checkout, and symlink creation that needs a privilege
the runner lacks. They fail identically in the pristine upstream clone.

## 6. Open issues

| Issue | Impact | Status |
| --- | --- | --- |
| openui cards do not render | The second backend is not usable by a user yet | Stage 3 |
| No evaluator | Programs are checked for unknown names only | Stage 2 |
| Working copy is not a git repo | No history, no diffable baseline, `AGENTS.md` rule 2 cannot be followed | **Needs a decision** |
| 15 Windows test failures | Noise that hides a real regression | Accepted; documented in `docs/testing/TEST_PLAN.md` |
| `lib/` is committed next to `src/` | Portable here, but `AGENTS.md` rule 7 wants it release-only | Decide before the first release |

## 7. Next step

**Stage 2 — OpenUI language core.** Permitted edits: `src/backends/openui/`
and `tests/`. Do not touch `src/client/`. Done when the exit criteria in
`STAGE.md` are each backed by evidence under `evidence/phase-2/`.

Before starting: decide whether this directory becomes a git repository. The
rules in `AGENTS.md` assume one, and the fork has no recorded history yet.

---

## History

### Session 1 — 2026-11-02

Fork created from `cf6b3a3`. Three upstream snapshots pinned under
`upstream/`. Stage 1 implemented and accepted with the openui rendering gap.
Fixed the nested-dispatch card loss inherited from the base. Documentation
system established.
