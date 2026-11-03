# Phase 4A-2 report — the text group

**Date:** 2026-11-04
**Stage:** 4A-2 (`STAGE.md`)
**Verdict:** **accepted — PASS** on all six exit-gate items.

## What this batch had to prove

That `Label`, `Badge`, `Link`, `List`, `ListItem`, `Quote` and `Code` draw
correctly in the real DSH host, in both colour schemes — and, for `Link`, that
the first component in this catalogue able to take a reader *somewhere* does so
only where it is allowed to.

The Text group is now complete: 10 of 10 render, and the inventory moves from
**12 / 48** to **19 / 48**, measured from the renderer's own table.

## Result against the exit gate

| # | Item | Result |
| --- | --- | --- |
| 1 | Every component in the batch renders from a real program | **PASS** — all seven in one model-written card |
| 2 | Bound inputs write `$state` and survive a reload (4A-3 onward) | **N/A** — no 4A-2 component binds `$state` |
| 3 | Layout, colour and contrast hold in both colour schemes | **PASS — after fixing three AA failures** |
| 4 | The differential still reports 0 differences | **PASS** — 31/31 |
| 5 | Browser evidence on an isolated profile, with the §9 hash check | **PASS** |
| 6 | `tests/<batch>` added; the 15-failure baseline unchanged | **PASS** — 747 / 15, failure set identical |

## The security decision, made before the renderer existed

`Link` is the first component whose output a reader can **activate**, and the
OpenUI card is mounted in the **host document** — not inside the HTML backend's
sandboxed frame. So a `javascript:` href here would execute in the DSH host's
own origin. That makes this a security decision sitting inside a rendering
batch, and the project's rules say so twice: ADR-004 requires each capability to
declare its own boundary, and `AGENTS.md` §3 forbids improvising one.

**ADR-008** was written first and the renderer followed it. The policy is a
positive, closed allowlist:

```
allow  iff  URL parses  AND  protocol ∈ { http:, https: }
```

Everything else — `javascript:`, `vbscript:`, `data:`, `file:`, `blob:`,
protocol-relative `//host/x`, relative paths, fragments, `mailto:`, `tel:` —
degrades to plain text with no `href`, no `target` and no handler. The label
stays visible, because drawing nothing is the failure this project has already
named.

**Parsed, not pattern-matched.** Upstream uses a regex
(`/^(https?:\/\/|mailto:|tel:|\/|#)/i`). A regex tests the shape of the string
while the browser tests what it will actually do, and where they disagree the
disagreement favours the attacker. The fork calls `new URL` and compares
`protocol`.

**The fork is stricter than upstream, and that is recorded rather than quiet.**
Measured against real inputs, upstream's predicate admits protocol-relative
`//evil.example.com/x`, `mailto:`, `tel:`, `/path` and `#anchor`. The fork
refuses all five; every other refusal is shared. The allowlist is therefore a
strict subset of upstream's — it narrows the surface instead of widening it.

Protocol-relative URLs are the case worth naming: `//host/x` is not a relative
path, it is a full URL to another origin that merely borrows the current scheme.
An allowlist that admits a value it cannot classify is not an allowlist.

## Three defects, all found by measuring rather than reading

### D20 — a nested `ListItem` drew two rows for one item

The batch's most instructive defect, and the one no unit test caught.

A screenshot appeared to show both a bullet *and* a check before "Nested title".
That could have been a rendering artefact of a small image, so it was resolved
from the DOM — where the card turned out to have **five** `role="listitem"`
elements for a four-item program, with markers `1. 2. 3. • ✓`.

The cause: the walker draws a nested `ListItem` into a **complete row**, and
`List` then wrapped that row in a **second** `role="listitem"`. Two rows for one
item, and the outer one got the list's bullet.

The fix gives the renderer signature the raw argument list. `List` now asks
whether an entry *is* a `ListItem` — a property of the descriptor, not of the
node it drew into — and builds the row exactly once.

This is the defect class the project has met before: **what a component looks
like in a test is not what a reader sees.** Every 4A-2 unit test passed while the
live card was wrong. `tests/openui-text-4a2.spec.tsx` now asserts row *counts*,
not merely that the expected text is present.

### D21 — `--font-mono` does not exist in the host

`Code` is the first component here that needs a monospace stack, and
`src/frame-css.ts` declares `--font-mono` — but that is the **frame** vocabulary,
and the host document has never published it. Bridging to it would have been
D17/D18 a fourth time: a `var()` that resolves to nothing still paints a
fallback, so the card looks right while the declaration lies.

This one was caught **before** shipping, by measuring the candidates first. The
host publishes `--dsw-font-markdown-code-font-family`, which resolves to a real
mono stack on the live page. It is now the bridge, and the measured evidence is
`evidence/phase-4a-2/host-mono-tokens.json`.

The 4A-1 spec's verified-token allowlist then **refused** the new name until it
was added with that measurement behind it. That guard was written in 4A-1 to stop
this exact recurrence and it worked.

### D22 — three light-theme colours failed AA

Measured against the effective painted backdrop rather than eyeballed:

| Element | Before | After | Cause |
| --- | --- | --- | --- |
| `Link` | **4.23:1** | **5.39:1** | `--primary` is a brand *surface fill*, sized to carry a paired foreground, not to be read as text |
| Copy button (11px) | **3.71:1** | **5.8:1** | inherited `--muted-foreground`, which bridges to the host's *tertiary* tier |
| List marker | **3.71:1** | **5.8:1** | same |

`Link` gained its own measured colour. No single host token clears AA in both
schemes — `--primary` is 4.23:1 on white, and the static brand steps are
3.39–3.53:1 on the dark surface — so it is declared as a `light-dark()` pair
drawn from the host's brand scale, for the same reason as the series-4 literal
in 4A-1. A `var()` bridge here would have looked authoritative and failed in one
scheme.

Small supporting text gained `--muted-foreground-strong` on the host's
**secondary** tier: 5.8:1 light, 12.11:1 dark. That is the tier upstream used for
exactly these roles (`.iui-lt-code__copy`, `.iui-lt-li__marker`,
`.iui-lt-quote__cite`, `.iui-lt-li__desc`).

**What was deliberately not changed.** `--muted-foreground` still bridges to the
tertiary tier and still measures 3.71:1 on white. `Caption` uses it, and
`Caption` is a browser-verified 4A-1 component. A later batch does not get to
silently restyle an accepted one, so the change is additive.

## The measurement, concretely

Read from the live page, with no host CSS modified, on an isolated profile whose
installed bundle hash matched the build (`AGENTS.md` §9).

| What | Light | Dark |
| --- | --- | --- |
| Card width | 369px | 908px |
| List rows / markers | **4** — `1. 2. 3. ✓` | **4** — same |
| Anchors in the card | **1** (the permitted URL) | **1** |
| `javascript:` in the rendered DOM | **false** | **false** |
| Unresolved CSS variables | **0** | **0** |
| Dangling bridged host tokens | **0** | **0** |
| Unrendered notices | 0 | 0 |
| Host variables declared | — | 473 |
| Link contrast | 5.39:1 | 5.42:1 |
| Badge (11px) | 18.9:1 | 17.45:1 |
| Code body (12px) | 18.9:1 | 13.34:1 |
| Copy button (11px) | 5.8:1 | 9.25:1 |
| List marker | 5.8:1 | 12.11:1 |

The mono stack resolves to the host's own:
`"SF Mono", "JetBrains Mono", "Fira Code", Consolas, "Liberation Mono", Menlo,
Courier, "PingFang SC", "Microsoft YaHei"`.

## What this batch did *not* verify, and does not claim

- **A9 (4A-1) remains NOT VERIFIED.** Cross-generation history replay still
  cannot run on this profile: its older session log carries `job/registered` from
  a newer harness. Nothing here changes that finding.
- **A05, A06, A09 (stage 3) are still unit-tested only.** Unchanged.
- **A reload was not exercised as a persistence test**, because no 4A-2 component
  binds `$state`. The stored card did survive several server restarts and
  re-rendered identically — that is observed, but it is not A8 and is not filed
  as A8.
- **The folded tool-view copy was not separately measured.** The card was
  measured on the conversation surface.

## Environment problems, recorded as environment

Two cost real time and are recorded so they are not mistaken for defects:

**The §9 hash check caught a stale bundle before any measurement.** The profile
still had the 4A-1 bundle installed (`0C72613C…`) because `pnpm install` reports
"Already up to date" for a `file:` dependency — it hard-links the old copy into
the profile. Removing the profile's `node_modules/@dsh-unified/visualize` entry
and reinstalling fixed it. Nothing was measured across the mismatch, which is the
whole point of the rule.

**Repeated server restarts wedged the agent tab.** After several
kill-and-restart cycles the tab stopped responding
(`A page frame is not responding`) and an evaluation hung. Diagnosed rather than
retried: `bsk status` was healthy, so the fault was the tab, and a fresh
agent-window session cleared it. That session id was `ggbi` — the id changes on
every start, and the fresh window opens on `about:blank`, which is why the
harness's G0 answers "is a page loaded?" before dispatching anything.

A third, smaller one is now a harness fix rather than a habit: `evaluate()` did
not retry the transient `observation_changed` refusal that `step()` already
retried, so one repaint could fail a whole run. **D23** — the retry is now in
`evaluate()` too, and `parity.mjs` still exits 0.

## Cost, against 4A-1

Recorded in `evidence/phase-4a-2/MANIFEST.json` under `costAccounting`, as
infra-1 asked, so the next comparison is data rather than the "about 1/5"
estimate that was never measured.

| Metric | 4A-1 | 4A-2 |
| --- | --- | --- |
| Scripts written | 41 | **14**, each named for one question |
| Subprocess calls to deliver one prompt | ~1 760 | **2** (`fill` + `press`) |
| Generic measurements | new script each time | `probe.mjs` modes: `smoke`, `card`, `theme`, `tokens` |
| Time to detect a dead environment | tens of minutes | **0.3 s** (G0) |
| Failed retries | most of the phase went to them | **6**, each with a stated cause |

The harness did not make the *work* smaller — three defects still had to be found
by measuring. It made the failures cheaper to attribute, which is what
`AGENTS.md` §10 is for.

## What 4A-3 inherits

- An AA-checked supporting-text tier and a measured link colour, both recorded
  with the numbers behind them.
- The measured-token allowlist, which now covers `--font-mono` and the secondary
  tier and will refuse the next plausible-looking `--dsw-*` name until it is
  measured.
- The **row-count** lesson: assert that the renderer drew *N* things, not that
  the expected strings are somewhere in the markup.
- A renderer signature that hands the raw arguments through, so a component that
  needs to know what a descriptor *was* does not have to guess from what it drew.
- 29 components left across 4A-3, 4A-4 and 4A-5.
