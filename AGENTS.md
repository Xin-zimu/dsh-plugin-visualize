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

## 2. One writable tree, one writing session

**A writable working tree belongs to exactly one executing session at a time.**

This is the rule, not a preference, and it has already been paid for once. In
4A-2 a second session edited this same tree while a feature batch was in
progress. It was caught only because a file write was refused for having changed
since it was read — a coincidence, not a mechanism. The same collision could as
easily have produced a commit containing another session's half-finished work, or
a lost change nobody noticed.

### The pre-write check

Before the first edit of a session, establish all four:

```powershell
git log --oneline -2          # what am I building on?
git status --short            # is anything uncommitted?
# are files changing while I am not writing them?
Get-ChildItem -Recurse -File . |
  Where-Object { $_.FullName -notmatch 'node_modules|\\.git\\' -and
                 $_.LastWriteTime -gt (Get-Date).AddMinutes(-15) } |
  Sort-Object LastWriteTime -Descending | Select-Object -First 8
# is anything holding the test server port?
Get-NetTCPConnection -LocalPort 3093 -State Listen -ErrorAction SilentlyContinue
```

If the second command shows changes you cannot account for, **stop and report**.
If the third shows files modified while you were not writing, another session is
active — stop and report. "I will be careful" is not a substitute: the failure
mode is a silent overwrite, not a visible conflict.

### If parallel agents are genuinely needed

Use **separate git worktrees**, never one shared directory:

```powershell
git worktree add ../dsh-plugin-agent-a -b agent-a/4a-3
git worktree add ../dsh-plugin-agent-b -b agent-b/docs
```

Each agent diffs, tests and commits in its own tree; integration happens through
an explicit merge, where a human can see what is being combined.

A worktree isolates **files only**. It does not isolate the `bsk` daemon (one
shared socket), the DSH server, an agent-window tab, or `tmp/`: two sessions
racing for `:3093` is how a server dies with `exit 1` and an empty error log
(§10, and the port check above). A build output is isolated by the worktree;
a browser session is not.

Do not use a worktree as permission to run two agents against one browser.

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

### A passing unit test is not a correct DOM

`expect(html).toContain('Some text')` cannot tell one row from five. Stage 4A-2
shipped a `List` that drew **two** `role="listitem"` elements for one item, and
62 assertions passed while the live card was wrong, because every one of them
asked *"is the expected text present?"* — and it was.

When the claim is about a component, assert the **structure**:

| Question | Helper in `tests/openui-dom-structure.ts` |
| --- | --- |
| How many were drawn? | `countOf(html, selector)` |
| What are the direct children? | `shapeOf(html, selector)` |
| How deep does it sit? | `depthOf(html, selector)` |

```ts
const html = draw('root = List([ListItem("T", "D", "check")])')
expect(countOf(html, '[role="listitem"]')).toBe(1)
expect(shapeOf(html, '[role="list"]')).toEqual(['div[role=listitem]'])
expect(countOf(html, '[role="listitem"] [role="listitem"]')).toBe(0)
```

Presence assertions remain fine for a single value (`expect(html).toContain('42')`).
The rule bites when the subject is a *component*: then the count, the nesting
and the parent-child shape are part of what "renders correctly" means.

**Prove a regression test can fail.** A guard that has never been seen to go red
is a guess. Re-introduce the defect once, confirm the new test catches it, then
restore the fix — the D20 guard was validated exactly that way (3 of 3 new
structural tests failed on the reintroduced defect, including one that only DOM
nesting could detect).

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

## 9. Browser evidence must prove what the browser loaded

Before starting any DSH browser integration test, compare the SHA-256 of the
client bundle the test profile has **installed** with the SHA-256 of the current
build output. If they differ, the browser is not running this tree, and no
product code may be judged FAIL on that run.

```powershell
Get-FileHash tmp/dsh-p3/profiles/p3web/node_modules/@dsh-unified/visualize/lib/client.js -Algorithm SHA256
Get-FileHash lib/client.js -Algorithm SHA256
```

Why this is a rule and not a tip: `dsh plugin add file:...` copies `lib/` at
install time. A build that happens *after* the install leaves the profile on the
old bundle, and the browser then behaves exactly as an unfixed build would. That
happened in P3-06: a correct turn-tail fix looked like a total failure, and the
"defect" was the environment. The trap is that the wrong conclusion is the
believable one — a browser test failing after a fix reads as a real defect.

If a bundle mismatch is found, fix the install and re-run; if a genuine mismatch
cannot be fixed, record the run as **NOT VERIFIED** with the two hashes, never
as FAIL against the code.

## 10. Diagnose the environment before you test the product

This is the rule the stage-4A-1 refactor exists to encode. It is not about
spending fewer tokens; that is a symptom. The rule is:

> **Diagnose the environment, then verify the interaction, then verify the
> product. If a precondition does not hold, stop and say so — repeated trial and
> error is not fault localisation.**

A browser run must begin with the gates, not with a card:

```powershell
node evidence/lib/probe.mjs --what=smoke
```

Four gates, in order, stopping at the first failure: **G0** environment (version
skew, bundle hash, an unreadable session log, a dead agent tab), **G1** input
(`fill` delivers a whole value in one action), **G2** submit (`Enter` submits),
**G3** render (the turn actually paints). Only then:

```powershell
node evidence/lib/probe.mjs --what=card  --title="<card title>"
node evidence/lib/probe.mjs --what=theme --want=dark
node evidence/lib/probe.mjs --what=tokens
```

**Exit code 2 means the environment blocked the run and is never a product
failure.** It may not be added to a FAIL column, a failure count, or a stage
verdict. Exit code 1 is a product failure and is the only one that may be.

The manual is `docs/testing/BROWSER_HARNESS.md`. Three consequences that are easy
to get wrong:

1. **A hanging call is a defect in the harness, not a fact about the product.**
   Every `bsk` subprocess is time-bounded. If something hangs, fix the bound —
   do not background it and keep working. A 20-second check that became a
   three-minute job is what this paragraph is for.
2. **Bulk input, never per character.** `fill` sets a whole value in one action;
   `press('Enter')` submits. A character loop costs one subprocess per glyph and
   was written once in 4A-1 to route around a protocol skew that should have been
   diagnosed and fixed. `evidence/lib/parity.mjs` fails if it comes back.
3. **Read the page before probing it.** If a card does not appear, read
   `document.body.innerText` and the console buffer first. In 4A-1 the host was
   publishing `历史加载失败` in a visible banner, and ten scripts were spent trying
   to make a card appear before anyone read it.

Also binding on test *cost*, for the same reason: run the **single spec** you
touched while iterating, and the **full suite once** before writing numbers down.
A full suite re-run mid-edit buys nothing and costs a full transcript of output.

Keep the authoritative helper in `evidence/lib/cdp.mjs`; the older phase copies
stay as historical record and must not be edited. After changing the helper, run
`node evidence/lib/parity.mjs` — a capability that disappears must be a recorded
decision, not an accident (§4).

## 11. When you are unsure

Write the uncertainty down in `session-log.md` under "open questions" and
ask. Do not guess an architecture, do not invent a component name, and do not
mark a stage complete to make the plan look tidy.
