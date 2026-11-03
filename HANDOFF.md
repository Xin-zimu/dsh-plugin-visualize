# Handoff — read this before your first command

Updated 2026-11-04, at the end of the session that **committed the accepted
backlog** and **closed 4A-2**. Read in this order: this file, then
`session-log.md` §7, then `AGENTS.md` §10.

> **This document is a snapshot, not a source of truth.** Numbers here go stale
> within one session. `git status`, `git log` and `session-log.md` are
> authoritative; if they disagree with this file, they win. Two sections were
> written by a *different* session that was working in this tree at the same
> time — see §9, which is itself the most useful thing here.

---

## 1. Where the tree actually stands

`HEAD` is **`5d2a3e9`** — "close stage 3, 4A-1 and infra-1". It collected three
accepted phases that had been sitting uncommitted on top of `9b46cec` for a whole
session. Before it was made, an independent audit verified it against a clean
export: **683 / 15 / 698**, `tsc` clean on both projects, differential 31/31, no
file under `src/backends/`, and none of `lib/`, `tmp/`, `node_modules/` or
`evidence/.smoke-stamp.json` in it.

On top of that commit, **4A-2 was implemented and accepted in the same session**;
its work was in the working tree at the time this file was written.
Verify with `git status --short` before assuming either way.

| Phase | Verdict | Record |
| --- | --- | --- |
| 3 — persistence and the interaction loop | PASS | `docs/reports/PHASE-3-REPORT.md` |
| 4A-1 — `Box`, `Divider`, `Spacer`, `Grid` | PASS (8/9 items; A9 NOT VERIFIED) | `docs/reports/PHASE-4A-1-REPORT.md` |
| 4A-2 — the seven Text components | PASS (6/6) | `docs/reports/PHASE-4A-2-REPORT.md` |
| infra-1 — browser harness | COMPLETE | `evidence/infra-1/MANIFEST.json` |

`AGENTS.md` §2 says a dirty tree means stop and report. The nuance that matters,
and cost a session: **a dirty tree is legitimate when you can account for every
change in it.** Read `session-log.md` §7 first, then decide. Do not commit
someone else's half-finished work, and do not stop merely because the tree is
dirty.

Do **not** commit `lib/`, `tmp/`, `node_modules/`, or `evidence/.smoke-stamp.json`.

## 2. The browser environment does not survive a session restart

Every one of these was a background job owned by the previous conversation:

```powershell
# 1. daemon — MUST run in a persistent foreground task, or `bsk status` fails
$env:BSK_AUTO_START='0'; bsk daemon start --foreground --session-idle 4h --daemon-idle 8h
# (run that as a background job and keep it alive)

# 2. isolated DSH server — CHECK THE PORT IS FREE FIRST (§2a)
$env:DSH_HOME = (Resolve-Path 'tmp/dsh-p3').Path
dsh --profile p3web --no-open --port 3093 --host 127.0.0.1
# URL is printed to tmp/dsh-p3/web<n>.out.log (n increments; the token changes every start)

# 3. agent-window session — the id changes every time
bsk session start --browser <instance-id> --name <name> --json

# 4. navigate the agent tab, or it stays about:blank and every gate blocks
bsk navigate --session <sid> --tab-id <tab> -- "<the :3093 URL>"
```

Then set `BSK_SESSION=<sid>` for everything below.

**Why the fuss:** `bsk status` from a one-shot shell fails with `cannot start an
independent Windows daemon` — the daemon needs a task that outlives the command.
A fresh agent window opens on `about:blank`, and evaluating against it **hangs**
rather than failing, which once turned a 20-second check into a three-minute
background job.

**`bsk navigate` takes the URL positionally.** `--url` is rejected; `--tab-id` is
required when the session has more than one tab.

### 2a. Only ONE process may hold :3093 — check before you start one

Observed live, twice. A second agent started the same `dsh --profile p3web
--port 3093` command while the first was already running. The port was taken, so
**the earlier server died with `exit 1` and an empty error log** — that failure is
not reported where you would look for it. The symptom reads as "the server
crashed"; the cause is "two servers raced for one port".

```powershell
# Before starting: is something already on the port?
Get-NetTCPConnection -State Listen | Where-Object { $_.LocalPort -eq 3093 } |
  Select-Object LocalPort, OwningProcess
# If so, reuse it. Read ITS token from the newest log; do not start another.
Get-ChildItem tmp/dsh-p3/web*.out.log | Sort-Object LastWriteTime |
  Select-Object -Last 1 | Get-Content -Tail 1
```

**The token changes on every start and the log filename increments**, so never
reuse a token from this document, from `session-log.md`, or from an older phase's
evidence. `web9.out.log` in particular records a **dead** instance — a URL taken
from it will simply fail to connect, which is expected and not a defect.

### 2b. A stale bundle is the first thing to check — and `pnpm install` lies

This cost a full measurement cycle. For a `file:` dependency pnpm reports
**"Already up to date"** and keeps the hard-linked old copy in the profile, so a
build that happened after the install is *not* what the browser runs:

```powershell
Remove-Item -Recurse -Force tmp/dsh-p3/profiles/p3web/node_modules/@dsh-unified/visualize
cd tmp/dsh-p3/profiles/p3web; pnpm install
# then PROVE it (AGENTS.md §9) before measuring anything
Get-FileHash lib/client.js -Algorithm SHA256
Get-FileHash tmp/dsh-p3/profiles/p3web/node_modules/@dsh-unified/visualize/lib/client.js -Algorithm SHA256
```

A server started before the rebuild is also serving the old bundle — restart it.
Repeated restarts can wedge the agent tab (`A page frame is not responding`);
`bsk status` stays healthy, which is how you know it is the tab and not the
daemon. A fresh agent-window session clears it.

## 3. Start with the gates, not with a card

```powershell
node evidence/lib/probe.mjs --what=smoke
```

Four gates, stopping at the first failure: **G0** environment, **G1** input,
**G2** submit, **G3** render. Measured: **0.3 s** to report a blocked
environment, **11.6 s** to pass.

| Exit | Meaning | May it be filed as a product failure? |
| --- | --- | --- |
| `0` | pass | — |
| `1` | product failure | **yes** |
| `2` | environment blocked | **never** |
| `3` | usage error | no |

Only after a fresh smoke pass (45 min TTL, same session) may you run:

```powershell
node evidence/lib/probe.mjs --what=card   --title="<your card title>"
node evidence/lib/probe.mjs --what=theme  --want=dark
node evidence/lib/probe.mjs --what=tokens
```

Default stdout is a summary; `--out <file>` keeps the full detail. Use it.

Two warnings the tests cannot give you, both learned by measuring:

- **Driving the host's Settings control leaves the Settings dialog open**, which
  paints a dimming overlay. Close it before screenshotting, or compare computed
  styles rather than pixels.
- **`evaluate()` and `step()` both retry transient `observation_changed` refusals**
  (fixed in 4A-2, D23). A refusal that is *not* transient surfaces immediately —
  do not paper over one with a retry loop.

The manual is `docs/testing/BROWSER_HARNESS.md`; the rule is `AGENTS.md` §10.

## 4. Six mistakes this project has already made — do not repeat them

1. **Per-character typing.** `fill` sets a whole value in one action;
   `press('Enter')` submits. A character loop cost ~1 760 subprocess calls and
   seven minutes for 876 characters. `evidence/lib/parity.mjs` fails if it returns.
2. **Guessing a host token.** `--dsw-static-purple-500`,
   `--dsh-font-family-text-default` and the frame vocabulary's `--font-mono` **do
   not exist** in the DSH host. All three "worked" because the fallback painted.
   The measured allowlist in `tests/openui-layout-4a1.spec.tsx` is what turns this
   from advice into a failing test; it refused two names in 4A-2 until each was
   measured.
3. **Trusting a hand-written coverage number.** The inventory said "8 of 48" for
   three sessions *after* the renderers existed, because it mirrored the table by
   hand. Coverage is read from `RENDERED_COMPONENTS`. Never copy a count.
4. **Asserting presence instead of counting.** 4A-2 shipped a `List` that drew two
   rows for one item while 62 assertions passed, because they asked "is the title
   in the markup?" rather than "how many rows were drawn?" (D20). Count what was
   rendered.
5. **Believing the wrong conclusion.** A browser test failing after a fix reads as
   a new defect; three times now it was the environment (a stale bundle, a
   protocol skew, a wedged tab).
6. **Never interpolate code into a prompt.** The model rewrites what it is given
   as text. Describe the program and let it author openui-lang; pasting it made
   the model "improve" the layout and report doing so.

## 5. Where the next slice starts

**4A-3**: `Input`, `TextArea`, `Select`, `SegmentedControl`, `Checkbox`,
`RadioGroup`, `DatePicker`, `Timer`, `Form`, `IconButton`, `Pressable`. Scope in
`STAGE.md` §Stage 4A. Two things specific to this batch:

- **Every one of them binds `$state`.** This is where stage 3's persistence and
  the `@Set` path prove their generality, so "renders" is not the bar: a bound
  input must write `$state` and survive a reload.
- **`IconButton` and `Pressable` are action carriers**, like `Button`. They must
  go through `write.runAction`, the same single channel, or a second route into
  state appears and ADR-006's invariant stops holding.

Baseline to protect: **747 passed / 15 failed / 762**, failure set identical to
the upstream baseline (the 15 are pre-existing Windows CRLF/symlink failures);
`tsc` clean on both projects; differential **31/31**; bundle hash verified per
`AGENTS.md` §9 on both halves.

## 6. Two claims you must NOT quietly upgrade

- **A9 (4A-1) is NOT VERIFIED.** Cross-generation history replay cannot be run:
  the profile's older session log carries `job/registered` from a newer harness and
  `dsh 0.2.0-rc.2` refuses to load it. Single-session refresh replay passed.
  4A-2 did not change this.
- **A05, A06, A09 (stage 3) are unit-tested only**, never browser-verified.

A tooling change or a new phase does not get to move a finding. If you make one of
these pass, say so explicitly, with the evidence file.

Also unclaimed from 4A-2: **no `$state` bindings were tested** (4A-2 has none),
and **the folded tool-view copy of the card was not separately measured**.

## 7. Cost accounting, so the next comparison is data

`evidence/infra-1/MANIFEST.json` records the measured baseline;
`evidence/phase-4a-2/MANIFEST.json` records 4A-2's five metrics — **14 scripts,
~60 bsk calls, ~50 min wall time, 6 failed retries**, each with a stated cause.
4A-3 should record the same five: **script count, bsk tool calls, output tokens,
wall time, failed retries**.

The honest reading of 4A-2: the harness did not make verification smaller — three
defects still had to be found by measuring — it made the failures cheaper to
attribute. Do not reduce evidence collection to improve the ratio.

## 8. `Link` — the security decision that lives in a rendering batch

`Link` is the first component whose output a reader can **activate**, and the
OpenUI card is mounted in the **host origin**, so a `javascript:` href would run
there. The policy is **ADR-008**: a positive, closed allowlist of absolute
`http:`/`https:` URLs, **parsed with `new URL` rather than pattern-matched**, with
everything else degrading to visible plain text.

Upstream's regex also admits protocol-relative `//host/x`, `mailto:`, `tel:`,
`/path` and `#anchor`; the fork refuses all five. Its allowlist is a strict
**subset** of upstream's, so this narrows the surface rather than widening it.

**Do not "fix" this to match upstream.** If a future component genuinely needs one
of those targets, it gets its own decision — not an inherited regex.

## 9. This file was edited by more than one session

Worth knowing, because it is the situation §1 describes. While one session was
committing the backlog and implementing 4A-2, a **second session was editing this
same tree**, and at 23:54 it rewrote this file to warn the next reader that
"another agent may be working in this same tree right now". It was right — but
the "other agent" was the one that went on to finish 4A-2.

The practical lesson is not "coordinate better", it is two concrete rules:

1. **`git status` is not a lock, and it is not a lie either.** It tells you the
   tree changed; it does not tell you whether the change is finished. Check
   `session-log.md` §7 and the phase manifests before concluding.
2. **Re-read a file immediately before you rewrite it.** The write tool refused
   this file once because it had changed since it was read — that refusal is the
   only reason the concurrent session's warnings in §1a/§2a were noticed rather
   than overwritten. Preserve what a concurrent writer added; the cost of a
   merge is a moment, the cost of a lost warning is a session.
