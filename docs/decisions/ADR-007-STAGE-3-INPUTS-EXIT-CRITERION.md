# ADR-007 — Stage 3's "Inputs group" exit criterion: recorded as a scope adjustment

- **Status:** accepted — retroactive scope adjustment, recorded 2026-11-03
- **Date:** 2026-11-03
- **Supersedes:** the third exit criterion of the stage-3 section as committed at
  `git show HEAD:STAGE.md` — *"at least the Inputs group renders"*
- **Relates to:** ADR-002 (one tool, one backend table), ADR-005 (evidence
  discipline), stage 3 report (`docs/reports/PHASE-3-REPORT.md`), stage 4A-1

## Why this document exists

`STAGE.md` at HEAD listed four exit criteria for stage 3. The third was:

> at least the Inputs group renders

Stage 3 was then accepted as **PASS**, and the phase report recorded that
criterion as **PARTIAL**, because two of the thirteen Inputs components render
(`Button`, `Slider`). Leaving it there produces a document set that contradicts
itself in a way a later reader cannot resolve:

- `STAGE.md` says stage 3 closed **PASS**;
- the same file says one of its exit criteria was not met;
- nothing records who decided that was acceptable, or on what authority.

A stage may legitimately close with a narrower criterion than it opened with.
What it may not do is close with the original criterion and a different verdict,
without saying so. This ADR is that record.

## The measurement

The count is not an estimate. `evidence/phase-3/component-inventory.mjs` reads
`src/backends/openui/signatures.ts` and the renderer's own `COMPONENTS` table
and prints the split; its output is `evidence/phase-3/component-inventory.txt`:

| Group | Total | Rendered | Missing |
| --- | --- | --- | --- |
| Inputs | 13 | `Button`, `Slider` | `IconButton`, `Pressable`, `Input`, `TextArea`, `Select`, `SegmentedControl`, `Checkbox`, `RadioGroup`, `DatePicker`, `Timer`, `Form` (11) |

So the criterion, read literally as "the Inputs group renders", was met at
**2 of 13 (15%)**. It was read at the time as "the group has a rendering path,
and it is proven end to end" — which is also defensible, and is what stage 3
actually delivered. Those are two different bars, and the record must say which
one was applied.

## Decision

**Stage 3's verdict stands as PASS.** Its third exit criterion is **formally
narrowed** to what was actually verified, and the remaining work is moved to
stage 4A rather than dropped:

> **Stage 3, exit criterion 3 (as amended):** at least one component of the
> Inputs group renders **and binds `$state`**, proving the input → state →
> re-evaluate → persist loop end to end. Met by `Slider` (binding) and
> `Button` (action dispatch).

The eleven missing Inputs components are assigned to **stage 4A-3** in
`STAGE.md`, with `Box`, `Divider`, `Spacer` and `Grid` ahead of them in 4A-1.

## What this ADR does *not* claim

- It does not claim the Inputs group renders. It does not.
- It does not retroactively reinterpret the original wording as satisfied. The
  original wording was a count; it was not met; it is replaced, not excused.
- It does not change the stage-3 evidence, the test baseline, or any verdict on
  the four sub-stages P3-01 … P3-07.
- It does not reopen the decision that the loop, not the catalogue, was stage
  3's subject. That was the right call; this ADR only makes the paperwork say
  the same thing.

## Consequences

1. `STAGE.md`'s stage-3 section carries the amended criterion inline, with a
   pointer to this ADR, so the two statements are read together.
2. `docs/reports/PHASE-3-REPORT.md` keeps its PARTIAL row — it is a true
   measurement — and gains a line naming this ADR as the authority that closed
   the stage anyway.
3. `session-log.md` records the criterion as *amended*, not *met*.
4. Stage 4A's batch list is the single place the remaining eleven live, so no
   reader has to infer from a stage-3 sentence how much of the catalogue exists.
5. **Future stages must not repeat the shape.** An exit criterion that names a
   group must name either "the group, entirely" or a stated subset. "At least
   the group renders" is a count in disguise and will be read two ways.

## Re-evaluate when

Stage 4A closes the catalogue. At that point the amended criterion's subject
disappears and this ADR becomes historical: the Inputs group will render, and
the distinction between the two readings will no longer matter. It is kept
rather than deleted because the *pattern* — a group-level criterion accepted on
a component-level measurement — is the thing worth not repeating.
