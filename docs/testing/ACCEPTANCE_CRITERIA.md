# Acceptance criteria

What makes a claim true here. `AGENTS.md` §5 defines the vocabulary; this file
applies it per area.

## Vocabulary

| Word | Requires |
| --- | --- |
| Discussed | an entry in `PLAN.md`, `STAGE.md` or an ADR |
| Implemented | in the tree, `tsc` clean |
| Verified | a command ran and its output is under `evidence/` |
| Accepted | verified **and** the stage's other exit criteria met |

## Stage 1 — accepted with a gap

| # | Criterion | Verdict | Evidence |
| --- | --- | --- | --- |
| 1 | Repo built on `cf6b3a3` | PASS | the tree |
| 2 | Base suite parity | PASS | `MANIFEST.json` — failure sets sha256-equal |
| 3 | Contract exists | PASS | `src/core/render-contract.ts` |
| 4 | HTML behind the dispatcher, behaviour unchanged | PASS | `test-fork.txt` |
| 5 | OpenUI backend renders in a browser | **NOT VERIFIED** | the client rejects `kind: intelligent_ui` |

Criterion 5 is why the verdict is "accepted with a gap" and not "complete".

## Standing criteria for every future stage

1. The failure set never grows relative to the previous stage without an
   explicit, written reason.
2. Every new public behaviour has a test that fails when it is removed.
3. Every ported upstream file has a `MIGRATION_MATRIX.md` row at `ported` or
   `verified`, never left at `pending`, once the stage exits.
4. No claim of completion without a file under `evidence/`.
5. A known gap is written down in four places — `session-log.md`, `STAGE.md`,
   the phase report, and the ADR that owns the design — or it is not known.
