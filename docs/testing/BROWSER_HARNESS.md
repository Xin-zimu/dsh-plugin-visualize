# Browser verification harness

One helper, one probe, four gates. This document is the operating manual; the
rule itself lives in `AGENTS.md` §10.

## The problem this replaces

4A-1 spent most of its budget not on verification but on **debugging a broken
environment by trial and error**. The numbers, from that phase's own folder:

| | 4A-1 |
| --- | --- |
| Scripts written | 41 (`evidence/phase-4a-1/`), 31 of them numbered `a1-s2`…`a1-s32` |
| `cdp.mjs` copies in the tree | 4, between 50 and 159 lines, drifted apart |
| Scripts that produced accepted evidence | 6 |
| Root cause of most of the discarded work | the host refused to load its own session (`job/registered` written by a newer harness), plus a CLI/extension protocol skew |
| Time to state that root cause | most of the phase |
| Time it takes now | **0.3 s** (G0 below) |

The waste was never "too many tests". It was that a dead host was treated as a
**product defect** and worked around with more scripts. Every one of those
scripts was written, run, and read — which is where the tokens went.

## Layout

| Path | What it is |
| --- | --- |
| `evidence/lib/cdp.mjs` | **The one authoritative helper.** Edit here only. |
| `evidence/lib/probe.mjs` | The parameterized probe: gates + measurements. |
| `evidence/lib/parity.mjs` | Static check that the helper covers the copies it replaces. |
| `evidence/browser-phase-*/cdp.mjs`, `evidence/phase-4a-1/cdp.mjs` | **Historical record.** What those runs actually executed. Do not edit, do not delete. |

The old copies are kept because rewriting them would falsify the evidence they
belong to (`AGENTS.md` §5). They are read-only history, not a library.

## The four gates

`--what=smoke` runs these in order and **stops at the first failure**.

| Gate | Question | Blocks on |
| --- | --- | --- |
| **G0** environment | Can this environment be measured at all? | daemon unreachable; CLI/extension version skew; no session; agent tab still `about:blank`; bundle hash ≠ installed hash; page refuses its session log (`历史加载失败`, `job/registered`); host draft-editor crash in the console |
| **G1** input | Does `fill` deliver a whole value in **one** action? | composer empty, truncated, or transformed |
| **G2** submit | Does `Enter` actually submit? | composer still holds the text, or the message never appears in the conversation |
| **G3** render | Does the conversation paint? | fewer than two paragraphs, or the turn never settles |

G0 is ordered cheapest-first so the common failures are reported before anything
is dispatched at the page. That ordering is not cosmetic: **evaluating against an
`about:blank` tab does not fail, it hangs** — that is how a 20-second check once
became a three-minute background job. `tab list` needs no cooperation context, so
the "no page loaded" case is answered without touching the page.

## Usage

```sh
# Always first. Writes evidence/.smoke-stamp.json on success.
node evidence/lib/probe.mjs --what=smoke

# Product measurements. Refuse to run without a fresh smoke pass.
node evidence/lib/probe.mjs --what=card   --title="A1 layout"
node evidence/lib/probe.mjs --what=theme  --want=dark
node evidence/lib/probe.mjs --what=tokens

# Full detail to a file, summary on stdout.
node evidence/lib/probe.mjs --what=card --out=evidence/phase-4a-2/card-light.json
```

Environment: `BSK_SESSION` (required), `BSK_CALL_TIMEOUT_MS` (default 20000).
The daemon is started and owned by the operator; every call sets
`BSK_AUTO_START=0`.

## Exit codes are the verdict, not a detail

| Code | Meaning | May it be filed as a product failure? |
| --- | --- | --- |
| `0` | gate or measurement passed | — |
| `1` | a **product** check failed | yes |
| `2` | the **environment** blocked the run | **no — never** |
| `3` | usage error | no |

`2` versus `1` is the whole point. "The component is broken" and "the host cannot
load its session" must never land in the same column of a phase report.

`--force` bypasses the smoke stamp for diagnosis, prints a warning, and marks the
result `forced: true` so it cannot be mistaken for a gate-backed run.

## Output rules

Default output is a **small structured summary**. Detail goes to `--out`.

The reason is not tidiness. In 4A-1 the accessibility tree was printed whole
about six times (≈2 000 tokens each) and a console dump carrying kilobyte plugin
URLs twice. A probe result should answer one question with a number, and the
evidence file should hold the rest.

Measured on a real card (the 4A-1 layout card, 21 variables, 4 Boxes, 4 Grids):

| Mode | stdout before this rule | stdout now | Detail file |
| --- | --- | --- | --- |
| `tokens` | 3 307 lines | **15** | 470 host variables, complete |
| `card` | 261 lines | **26** | every box, grid, divider, spacer, variable |

A `detail` key is written to the evidence file and **not** printed. That is the
rule applied to the harness itself: the tables are worth recording, and are noise
in a transcript.

## Parity, and how to add to the helper

```sh
node evidence/lib/parity.mjs
```

It reads every historical copy, extracts exported names and issued `bsk`
subcommands, and reports anything the canonical helper does not cover. A dropped
capability must be listed in `DROPPED` **with a reason** — the check fails on
`UNEXPLAINED`, which is `AGENTS.md` §4 ("never delete an upstream capability
silently") applied to tooling.

Measured state after the refactor: every copy's exports are covered; the one
absence is `type`, the per-character typing helper, and it is recorded as a
mistake rather than an API.

## Two things the harness deliberately will not do

**It will not type character by character.** `fill` sets a whole value in one
action. The character loop in 4A-1 cost roughly 1 760 subprocess calls and seven
minutes to deliver 876 characters, and it was written before the actual fault
(protocol skew) was fixed. `parity.mjs` asserts the loop does not return. If
`fill` fails, the fault is the environment — diagnose it.

**It will not force the theme.** `--what=theme` drives the host's own
Settings → 通用设置 → 外观 control and refuses to set `data-ds-dark-theme`
directly. A forced attribute measures a theme the host does not actually render;
`probe` reports BLOCKED instead of producing an unfaithful pass.

## Cost accounting

Recorded so the 4A-2 comparison is measured, not asserted:

| Metric | 4A-1 (manual) | Refactored harness |
| --- | --- | --- |
| Scripts to run a smoke pass | 0 (no such thing existed) | 1 |
| Time to detect a dead session | tens of minutes | **0.3 s** |
| Time for passing G0–G3 | — | **11.6 s** |
| Subprocess calls to deliver one prompt | ~1 760 | **2** (`fill` + `press`) |
| `cdp.mjs` copies | 4 | **1** authoritative + 4 historical |
| `card` stdout | (no equivalent) | **26 lines** — 261 before the detail split |
| `tokens` stdout | (no equivalent) | **15 lines** — 3 307 before the detail split |

4A-2 will record the same five metrics (`script count`, `bsk tool calls`, `output
tokens`, `wall time`, `failed retries`) in its manifest so the comparison is real
data rather than an estimate.
