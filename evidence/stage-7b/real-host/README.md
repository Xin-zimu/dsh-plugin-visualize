# Stage 7B Gate 2 — real-host pre-validation on DSH 0.2.2-rc.1

Date: 2026-11-07. Purpose: before asking DSH upstream for the one provenance change
(ADR-016 Option B), measure the three B-risks on a **real host**:

1. can `ctx.userQuestions.ask()` be used **outside an AI turn** (before any turn and after a
   turn ends)?
2. does the confirmation show **exactly the bytes that get submitted**?
3. is the **submission result observable**, and what happens to an **archived** session and
   to **duplicate submissions**?

Also, independently: does this repository's built plugin actually **run** on 0.2.2-rc.1
(peer compatibility is not a typecheck question).

**Verdict: Gate 2 PASSES for B's confirmation half; three residual limits are recorded
below and do not invalidate B.** No upstream API change was needed for any test to run.

## Environment (all verified, not assumed)

| Item | Value |
| --- | --- |
| Host | installed desktop asar, `@deepseek-ai/dsh-desktop` **0.2.2-rc.1** |
| Home | isolated `tmp/dsh-022` (`DSH_HOME`), profile `p22web` = `dsh-base` + `dsh-web-app` + probe + this plugin |
| Host URL | `http://127.0.0.1:3094` (isolated; the live GUI on :50270 was never used) |
| Browser | bsk daemon 0.4.1, Edge agent window, CDP via `evidence/lib/cdp.mjs` |
| Probe | `tmp/v7b-probe/` — **test-only** cordis plugin, registers `POST /api/visualize-probe/op` on the host's authenticated `/api` channel; ops: `roots`, `session`, `ask`, `prompt`, `archive`, `events` |
| Plugin under test | `@dsh-unified/visualize` **0.1.1**, installed from this repo |
| Installed vs build bundle | SHA-256 `E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB`, 450,559 B — **match** (AGENTS.md §9 gate) |

The probe is not product code and is never shipped. `prompt`/`events` use host-internal
readers (`sessionController.commands.prompt`, `session.snapshotEvents`) **for measurement
only**; the product path remains the mediated client `session.prompt` Remote (ADR-016 §6).

## Results

### 1. `userQuestions.ask()` outside a turn — PASS

| Case | Result | File |
| --- | --- | --- |
| idle session, no turn ever run | host question card rendered; selected Cancel; answer `{answers:[{id:'v7b-q',selected:['Cancel']}]}` returned in **1,340 ms**; agent `idle` | `10-ask-idle.json` |
| after a real model turn ended (turn 1, agent idle again) | same card; answer in **2,030 ms**; agent `idle` | `30-ask-after-turn.json`, `22-turn1-events.json` |

The browser answerer requires the live root agent and a resolved session scope, and in this
host an open session keeps a live idle root **between turns**. The card appears as a
composer takeover (`.wnLwla_frame`) with option radios and a 提交 button.

### 2. Confirmation bytes vs submitted bytes — PASS on the question-title path, with a clamp limit

Input `PARITY **bold** \`code\` <b>tag</b> & amp 中文😀\n第二行 line two`:

| Check | Result |
| --- | --- |
| rendered title `textContent` vs asked | **byte-equal** (`titleEqualsAsked: true`) |
| rendered `innerText` vs asked | **byte-equal** (`titleInnerTextEqualsAsked: true`) — markdown markers, backticks, `<b>`, `&`, emoji, newline all preserved as **text** |
| durable `user/message` content after submitting the same string through the composer | **byte-equal** (`storedContent[0].text === asked`) |
| long message (10 lines / 680 bytes) | DOM full text intact, **but visually clipped by default**: title `maxHeight: 68px`, `clientHeight 68`, `scrollHeight 222`; an `展开` toggle exists (`81-long-metrics.json`, `80-long-card.json`) |

Consequence for the design: keep the approved text short enough to fit the 68 px preview
(≈2–3 short lines), or accept that long messages need one expansion click before the reader
has seen all bytes. The 7B length cap must be chosen against this measured limit, not
assumed.

### 3. Archived session — the trap is real, and worse than "accepted"

| Step | Observation | File |
| --- | --- | --- |
| archive an idle session via `workspaceRegistry.archiveSession` | state shows `archived: true` | `74-archive.json`, `75-state-archived.json` |
| submit one prompt to that archived session | `{accepted: true}` in **13 ms** | `76-archived-prompt.json` |
| what the durable log shows | `turn/start` (turn 4) immediately followed by `turn/end {kind:'blocked'}`; **no `user/message` is appended**, no assistant message, **no error returned to the caller** | `77-archived-turn4.json`, `78-archived-state-after.json`, `79-seq.json` |
| archiving a session that is currently open in the UI | the composer and session view disappear (submitting from that view is no longer possible at all) | earlier attempt, `50…`/`52…` first-run files |

So `{accepted:true}` is admission only; it must never be reported as delivery. The card's
plugin must verify a durable marker (its own `rpcId` appearing in a `user/message`, or the
requested turn starting) before saying "sent", and otherwise say "unconfirmed".

### 4. Duplicate submission — no content-level dedupe

Two identical prompts, different client-minted `requestId`s → **two** durable
`user/message` events (seq 51 and 60), each with its own `rpcId`
(`62-probe-prompts.json`, `63-probe-duplicate-events.json`). The host's idempotency is
`rpcId`-keyed only, so a double click that mints a new id per click sends twice. The
one-in-flight latch must be plugin-side (ADR-016 §5).

### 5. Result observability

- The mediated path returns `{accepted:true}` to the plugin, and `beginSubmission` can
  expose accept/observe/fail to the client composer — but "accepted" ≠ "turn started" (see
  archived case) and the card prop surface has no channel at all (Stage 7A).
- Durable observability exists and is usable by a **plugin**: `user/message` with the
  caller's `rpcId`, `turn/start`, `turn/end.reason`. A plugin can therefore report
  "accepted, delivery pending" → "delivered" (rpcId observed + turn started) → "blocked"
  (turn ended blocked without the message). That is more than the card gets, and it is the
  honest ceiling without a host change.

## Independent issue: plugin runtime compatibility with 0.2.2-rc.1

**Runtime: works.** On the same host, this repo's plugin loaded and worked end to end:

| Check | Result | File |
| --- | --- | --- |
| tool registered and callable | model loaded the `visualize` skill and called the tool: `{"title":"Stage 7B compat","backend":"openui",...}` → tool result "Rendered … via the openui-lang program backend" | `compat-15-events-turn4.json` |
| card rendered by the client | 2 `[data-openui-card]` nodes after the turn; screenshot `compat-card.png` shows the card and answer on 0.2.2-rc.1 | `compat-14-markers-after.json`, `compat-card.png` |
| plugin host half / routes | `GET /api/dsh-visualize/style-files` → 200 JSON | `compat-00-style-route.json`, `compat-18-style-route-result.json` |
| console errors during load/turn | none recorded | `compat-01-console.json` |

**Install-time peer resolution: still skewed.** `pnpm peers check` fails:
unmet peer `@deepseek-ai/cordis` — installed **4.1.0**, wanted `~4.0.5` by
`@deepseek-ai/dsh-*@0.2.1-rc.5` copies that pnpm resolved into the profile's store
(3 such package dirs). The plugin's own `peerDependencies` are `^0.2.1-0`, which under
strict semver does not admit `0.2.2-rc.1`. Runtime works despite this, but "typecheck /
compile passes" is not the compatibility claim; the manifest must be updated to a range
that admits the 0.2.2 line, and the skew warning re-checked before support is claimed.

## Limits of this evidence

- One host version, one profile, one Windows machine. No 0.2.1 comparison run here.
- The probe's `prompt` op is a measurement path, not the product path; the product will use
  the client `session.prompt` Remote through a retained session.
- No client-side submission code exists yet, so "the card can show accepted/delivered" is
  not measured — only what the host log and plugin API can observe.
- UI `fill` was unreliable on a stopped/streaming conversation (`fill_target_changed`); the
  compatibility prompt was therefore injected through the host admission command (same
  admission command the Remote uses). That is an accepted limitation for this gate, not a
  product defect.
- Nothing here is a security acceptance test; ADR-016 §7 cases remain for Gate 4.

## Reproduce

```powershell
$env:DSH_HOME = (Resolve-Path tmp/dsh-022).Path
dsh --profile p22web --no-open --port 3094 --host 127.0.0.1
# then, in a persistent task:
bsk daemon start --foreground
bsk session start --name v7b --json
bsk navigate --session <id> "http://127.0.0.1:3094/?token=<printed token>"
$env:BSK_SESSION = '<id>'; $env:BSK_AUTO_START = '0'
node tmp/v7b/run.mjs askidle      # ask outside a turn
node tmp/v7b/run.mjs turn         # one real model turn
node tmp/v7b/run.mjs askafter     # ask after it ended
node tmp/v7b/run.mjs parity       # bytes and clamp
node tmp/v7b/run.mjs archived2    # archived admission
node tmp/v7b/run.mjs dup2         # duplicate prompts
node tmp/v7b/compat2.mjs          # this plugin end to end
```

`tmp/` is gitignored; the probe, driver scripts and isolated DSH home live there and are
reconstructable from this page.