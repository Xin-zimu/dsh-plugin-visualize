# ADR-005 — Five-layer documentation system

- **Status:** accepted
- **Date:** 2026-11-02
- **Supersedes:** —

## Context

This project merges three repositories and will keep absorbing upstream
changes. Work happens in sessions that can end without warning, and an agent
may enter at any point with no memory of the last one. Two failure modes
follow if documentation is written after the code:

1. Nobody can tell whether a feature is *discussed*, *implemented* or
   *actually verified* — the three are routinely conflated, and "the files were
   copied" reads exactly like "the migration is done".
2. Nobody can trace a line of code back to the upstream commit it came from, so
   an upstream upgrade means blind overwriting.

## Decision

Five layers, each with exactly one job, and no fact maintained in two places:

| Layer | File(s) | Answers | Changes |
| --- | --- | --- | --- |
| Charter | `PLAN.md` | what the project is, what it refuses to be | rarely |
| Stage | `STAGE.md` | what may be touched now, and when it is done | per stage |
| Handover | `session-log.md` | where the last session actually stopped | every session |
| Technical | `docs/**` | how it works, why, what is tested | with the code |
| Provenance | `docs/upstream/**`, `NOTICE` | where each line came from | per upstream move |

Plus `AGENTS.md`, which is binding on agents, and `docs/decisions/` (ADRs),
which freeze decisions so they are not re-litigated from memory.

## The rule that makes it work

**Implemented is not verified.** A claim needs a file under `evidence/` with
the command and its real output. A known gap gets written in four places
(`session-log.md`, `STAGE.md`, the phase report, the owning ADR) so it cannot
be quietly forgotten.

## Consequences

- Every session ends by updating `session-log.md`; an agent that skips it
  breaks the handover for the next one.
- A change that invalidates a document is not finished until the document is
  updated (see the matrix in `AGENTS.md` §8).
- Documents are created when a stage needs them, not up front: no empty
  placeholders that pretend a topic has been handled.
- The evidence directory is committed; `tmp/` is not.

## Re-evaluate when

The project gains more than one regular contributor and needs a review process,
or the evidence directory outgrows a size worth committing.
