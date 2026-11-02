# AGENTS.md — working rules for coding agents

This file is binding for any agent that edits this repository. Read it before
the first change of a session; if a rule here conflicts with a direct
instruction from the user, the user wins, and say so in `session-log.md`.

## 1. Read before you write

At the start of every session, in this order:

1. `session-log.md` — where the last session actually stopped.
2. `STAGE.md` — what this stage is allowed to touch, and when it is done.
3. `PLAN.md` — what the project is, so a local fix does not contradict it.
4. `docs/architecture/SYSTEM_ARCHITECTURE.md` — the layers you are changing.
5. `docs/upstream/MIGRATION_MATRIX.md` — before touching anything under
   `src/backends/`, so you know what was ported and what was rewritten.

Do not infer the project's direction from the code alone. The code is one
stage behind the plan at any moment.

## 2. Check the tree before you edit

Run `git status --short` first. If it is not clean and the change is not
yours, stop and report it rather than building on top of it. Never commit
someone else's half-finished work.

## 3. Frozen decisions

Decisions recorded in `docs/decisions/` are frozen until an ADR supersedes
them. In particular:

- **One tool, one wire name.** `visualize` stays the only visualisation tool.
  Do not add a second tool per backend; add a backend to the registry.
- **Backends own validate + describe only.** Do not move routing, storage,
  theming, security or replay into a backend.
- **`core/` never imports a backend.** Registration is the only way a backend
  becomes reachable.
- **Security boundaries are not negotiable per backend.** The HTML backend
  keeps its sandboxed iframe and CSP; the OpenUI backend keeps whitelist
  evaluation and never `eval`/`new Function`. Shadow DOM is not a sandbox.

To change any of these, write an ADR first, get it decided, then edit code.

## 4. Never delete an upstream capability silently

`upstream/` holds three pinned snapshots. Do not edit them. Do not delete a
capability the fork inherited without recording, in `MIGRATION_MATRIX.md`,
that it is dropped and why. "It looked unused" is not a reason.

## 5. Evidence, not claims

The distinction below is the point of this whole documentation system:

| Claim | Required to say it |
| --- | --- |
| **Discussed** | it appears in `PLAN.md`, `STAGE.md` or an ADR |
| **Implemented** | the code is in the tree and `tsc` passes |
| **Verified** | a test or command ran, and its output is saved under `evidence/` |

Never write "done", "works", "complete" or "verified" in `session-log.md`
without the third row. Copying files is not migrating. Compiling is not
working. A passing unit test is not an accepted feature.

## 6. Run the tests you touched, and say what you ran

Every session ends with the commands you actually executed and their real
output. If something fails, record the failure as a failure. A red test is
information; a hidden red test is a defect.

The baseline is 15 pre-existing failures on Windows (CRLF and symlink
assumptions). See `docs/testing/TEST_PLAN.md`. Do not "fix" them by making
the assertions weaker without saying so in the session log.

## 7. Keep the working tree clean

Do not commit `node_modules/`, `lib/` build output, `tmp/`, cache
directories, or editor state. `lib/` is committed only when releasing, and
that is a deliberate decision recorded in the session log.

## 8. Documentation update matrix

A change is not finished until the documents it invalidates are updated.

| What happened | Must update |
| --- | --- |
| Architecture changed | `PLAN.md`, `SYSTEM_ARCHITECTURE.md`, a new ADR |
| Stage scope or exit criteria changed | `STAGE.md` |
| Session ended, any work done | `session-log.md` |
| Upstream code ported or rewritten | `MIGRATION_MATRIX.md` |
| Test outcome changed | `session-log.md` + a file under `evidence/` |
| Released a version | `CHANGELOG.md` |
| New component or function shipped | `docs/specifications/` catalog |

## 9. When you are unsure

Write the uncertainty down in `session-log.md` under "open questions" and
ask. Do not guess an architecture, do not invent a component name, and do not
mark a stage complete to make the plan look tidy.
