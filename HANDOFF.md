# Handoff — navigation index

A map of where things are. **Nothing here is a status snapshot.** For state, read
`session-log.md` and `STAGE.md`; for what the tree actually is, run `git status`
and `git log`. If this file ever disagrees with those, this file is wrong.

Read in this order: `AGENTS.md` (binding rules) → `session-log.md` §7 (where the
last session stopped) → `STAGE.md` (what this stage may touch).

---

## Where to start

| Question | File |
| --- | --- |
| How do I work in this repo? | `AGENTS.md` — binding, read it first |
| Where did the last session stop? | `session-log.md` §7 |
| What is this stage allowed to touch, and when is it done? | `STAGE.md` |
| What is the project for? | `PLAN.md` |
| How are the layers organised? | `docs/architecture/SYSTEM_ARCHITECTURE.md` |
| Why is it built this way? | `docs/decisions/ADR-00*.md` |
| Where did this code come from? | `docs/upstream/MIGRATION_MATRIX.md`, `UPSTREAM_BASELINE.md` |
| Which components does the renderer draw? | `docs/specifications/COMPONENT_CATALOG.md` |
| How do I verify in a browser? | `docs/testing/BROWSER_HARNESS.md` |
| What was the outcome of a phase? | `docs/reports/PHASE-*.md` |
| What was actually measured? | `evidence/<phase>/MANIFEST.json` |

## Before your first edit

Run the pre-write check in `AGENTS.md` §2. It answers four things: what you are
building on, whether the tree is clean, whether **another session is writing to
it right now**, and whether the test server port is already held.

Two rules that have each already cost a session:

- **One writable tree, one writing session.** Use a git worktree for parallel
  work; a worktree isolates files, not the browser or the daemon.
- **Verify the bundle hash before measuring.** `pnpm install` reports "Already up
  to date" for a `file:` dependency while keeping the old hard-linked copy, so a
  build after an install is not what the browser runs. `AGENTS.md` §9.

## Three things that will look like defects and are not

1. **A stale bundle.** The browser runs the profile's installed `lib/`, not your
   build. Check both hashes (`AGENTS.md` §9) before believing a failure.
2. **A dead or wedged environment.** Exit code `2` from `probe.mjs` means the
   environment blocked the run and may never be filed as a product failure
   (`AGENTS.md` §10). A wedged agent tab reports
   `A page frame is not responding` while `bsk status` stays healthy.
3. **A browser that has not loaded the page.** A fresh agent window opens on
   `about:blank`, and evaluating against it **hangs** rather than failing.

## Mistakes already made, recorded so they are not repeated

| Mistake | Where it is recorded |
| --- | --- |
| Per-character typing (~1 760 calls for 876 chars) | `AGENTS.md` §10; `evidence/lib/parity.mjs` fails if it returns |
| Bridging a CSS variable the host does not publish (D6/D7, D17/D18, D21) | `AGENTS.md` §9/§10; measured-token allowlist in `tests/openui-layout-4a1.spec.tsx` |
| Copying a coverage number instead of measuring it (D19) | `docs/specifications/COMPONENT_CATALOG.md`; read `RENDERED_COMPONENTS` |
| Asserting presence instead of counting DOM structure (D20) | `docs/reports/PHASE-4A-2-REPORT.md`; `tests/openui-dom-structure.ts` |
| Interpolating a program into a prompt (the model rewrites it) | `evidence/phase-4a-2/probe-card-4a2.mjs` |
| Two sessions writing one working tree | `AGENTS.md` §2 |

## Scope note

The toolchain and documentation system are considered mature. Prefer product
capability and real-browser acceptance over further test-infrastructure work
(`session-log.md` §7).
