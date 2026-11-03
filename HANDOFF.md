# Handoff — read this before your first command

Written 2026-11-03 at the end of the session that closed **4A-1** and built the
**browser harness**. It exists because some things a new session needs are not in
the usual documents, and two of them will cost you real time if you skip them.

Read in this order: this file, then `session-log.md` §7, then `AGENTS.md` §10.

---

## 1. The tree is dirty, and that is expected

`git status --short` shows **three dozen uncommitted changes**. `AGENTS.md` §2 says a dirty
tree means stop and report. **Do not stop on these** — they are the accepted work
of three phases:

| Phase | Verdict | Record |
| --- | --- | --- |
| 3 — persistence and the interaction loop | PASS | `docs/reports/PHASE-3-REPORT.md` |
| 4A-1 — `Box`, `Divider`, `Spacer`, `Grid` | PASS (8 of 9 gate items; A9 NOT VERIFIED) | `docs/reports/PHASE-4A-1-REPORT.md` |
| infra-1 — browser harness | COMPLETE | `evidence/infra-1/MANIFEST.json` |

**Your first productive act is to commit them**, before starting any feature work.
`HEAD` is `9b46cec` (stage 2, 2026-11-02) — three accepted phases sit on top of it
uncommitted. One commit or three, but nothing work-in-progress is in there.

Do **not** commit `lib/`, `tmp/`, `node_modules/`, or `evidence/.smoke-stamp.json`.

If you find changes that do not match the descriptions above, *then* stop and
report — that would be someone else's work.

## 2. The browser environment does not survive a session restart

Every one of these was a background job owned by the previous conversation:

```powershell
# 1. daemon — MUST run in a persistent foreground task, or `bsk status` fails
$env:BSK_AUTO_START='0'; bsk daemon start --foreground --session-idle 4h --daemon-idle 8h
# (run that as a background job and keep it alive)

# 2. isolated DSH server
$env:DSH_HOME = (Resolve-Path 'tmp/dsh-p3').Path
dsh --profile p3web --no-open --port 3093 --host 127.0.0.1
# URL is printed to tmp/dsh-p3/web9.out.log (the token changes on every start)

# 3. agent-window session — the id changes every time
bsk session start --browser <instance-id> --name <name> --json

# 4. navigate the agent tab, or it stays about:blank and every gate blocks
bsk navigate --session <sid> "<the :3093 URL>"
```

Then set `BSK_SESSION=<sid>` for everything below.

**Why the fuss:** `bsk status` from a one-shot shell fails with `cannot start an
independent Windows daemon` — the daemon needs a task that outlives the command.
And a fresh agent window opens on `about:blank`; evaluating against it **hangs**
rather than failing, which once turned a 20-second check into a three-minute
background job.

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

The manual is `docs/testing/BROWSER_HARNESS.md`; the rule is `AGENTS.md` §10.

## 4. Four mistakes this project has already made — do not repeat them

1. **Per-character typing.** `fill` sets a whole value in one action; `press('Enter')`
   submits. A character loop cost ~1 760 subprocess calls and seven minutes for
   876 characters, and it was written to route around a protocol skew that should
   have been fixed first. `evidence/lib/parity.mjs` fails if it returns.
2. **Guessing a host token.** `--dsw-static-purple-500` and
   `--dsh-font-family-text-default` **do not exist** in the DSH host. Both still
   "worked" because the fallback painted. If you add a token, verify it against
   the host's real set — `--what=tokens` does exactly that.
3. **Trusting a hand-written coverage number.** The inventory said "8 of 48" for
   three sessions *after* the renderers existed, because it mirrored the table by
   hand. Coverage is now read from `RENDERED_COMPONENTS`. Never copy a count.
4. **Believing the wrong conclusion.** A browser test failing after a fix reads as
   a new defect; twice it was the environment (a stale bundle, a protocol skew).

## 5. Where the next slice starts

**4A-2**: `Label`, `Badge`, `Link`, `List`, `ListItem`, `Quote`, `Code`. Scope in
`STAGE.md` §Stage 4A. Two things specific to this batch:

- **`Link` is the first component that can render a URL.** Protocol policy lands
  here: http/https only; `javascript:`, `data:`, `file:` and protocol-relative
  targets degrade to plain text, matching upstream. This is a security decision
  inside a rendering batch — record it, do not improvise it.
- After this batch, 7 of the 36 unrendered components become drawn, and the
  `data-openui-unrendered` notices for them disappear.

Baseline to protect, unchanged by the refactor: **683 passed / 15 failed / 698**,
failure set byte-identical to the upstream baseline, `tsc` clean on both projects,
differential **31/31**, bundle hash `0C72613C…` on both halves.

## 6. Two claims you must NOT quietly upgrade

- **A9 (4A-1) is NOT VERIFIED.** Cross-generation history replay cannot be run:
  the profile's older session log carries `job/registered` from a newer harness and
  `dsh 0.2.0-rc.2` refuses to load it. Single-session refresh replay passed. Do not
  let a later summary call this a pass.
- **A05, A06, A09 (stage 3) are unit-tested only**, never browser-verified.

A tooling change or a new phase does not get to move a finding. If you make one of
these pass, say so explicitly, with the evidence file.

## 7. Cost accounting, so the next comparison is data

`evidence/infra-1/MANIFEST.json` records the measured baseline. 4A-2 should record
the same five metrics in its manifest: **script count, bsk tool calls, output
tokens, wall time, failed retries**. The previous session's honest estimate was
"about 1/5 the cost" — that was never measured, and the new harness exists partly
so it can be.
