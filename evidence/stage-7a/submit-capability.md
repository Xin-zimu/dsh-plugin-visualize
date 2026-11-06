# Stage 7A — Can a visualise card initiate a submission, and what can it prove?

**Question.** Can a plugin — specifically a card rendered in a session-scope tool slot —
initiate a message submission, and is there a *verifiable* result that distinguishes
(1) the user clicked, (2) the host accepted the request, (3) the request reached the
backend, (4) the message actually entered the target session/turn, (5) the outcome
reported back to the card? And can a card submit into a **different** session than the
one it is mounted in?

**Authoritative source.** Host tree extracted from the running DSH **0.2.2-rc.1**:

```
HOST = <workspace>\tmp\dsh-host-0.2.2-rc.1\dsh\node_modules\@deepseek-ai\
```

`tmp/dsh-host-src` (0.2.1-rc.5) was **not** used. Every `Read` citation below is in `HOST`.
All seven cited packages are version `0.2.2-rc.1` (checked in §11, command R-1).

**Grades.** Every claim is one of:

- **Read** — I read the source at the cited `file:line` in the 0.2.2-rc.1 tree.
- **Type** — the claim comes from a type/contract, not executable code. For 0.2.2-rc.1 this
  is the generated contract catalogue inside `dsh-cordis-client-runner/lib/client.js`
  (the shipped authoring contract, `SERVICE_API` / `TYPE_API` / `SLOT_API` tables).
  Marked **Type\*** when it comes from the plugin's own `node_modules` **0.2.1-rc.5**
  d.ts compile baseline (the known skew — see §10.2); a Type\* claim is never the sole
  basis for an answer.
- **Ran** — the command and its stored output appear in §11.

The extracted host tree ships **no `.d.ts` files at all** (0 files, §11 R-2). That is why
0.2.2 `Type` evidence is the contract catalogue plus runtime code, never a d.ts.

---

## 1. Answer in brief

| # | Sub-question | Verdict |
|---|---|---|
| A | Can a card initiate a submission? | **Yes, indirectly.** A card in `tool.call.toolview` receives the standard prop `inputActions: InputActions` (Type: `runner:7352-7396`; Read: `conversation:22775-22791` and
`dsh-client-ui-renderer/lib/client.js:667-678, 736-741, 773-824`). It can `setDraft(text)` then `submit()`, which runs the real composer submit plane and sends the message. The card never owns the send; it only drives the session's composer machine. |
| B | Is there a **verifiable** result for states 2–5? | **No, not from the card's prop surface.** `inputActions.submit()` is `(): void` — no promise, no callback, no event, no request-id returned (Read `conversation:15392-15394`; Type\* `input.d.ts:258`). The card can only *infer* things from shared session/input snapshots, and cannot correlate them to its own call. |
| C | Are states 2 and 3 distinguishable? | **No, they are the same observable event in this architecture.** The only backend proof is the RPC receipt `{ accepted: true }` (Type `typert.host:2382-2413, 3759-3760`; Read `index.js:4048-4061, 831-874`). It is returned to the code that called `session.prompt()`, which is internal to the composer, never the card. |
| D | Is state 4 ("actually entered the session/turn") observable? | **Not at card level; partly at plugin level.** Internally the client retires submission echoes on *observed* host evidence (`onRetire` reason `"observed"`), but that callback belongs to the composer/plugin that called `beginSubmission`, not to `inputActions` (Read `session-client:2811-2900`, `conversation:4811-4820`). And even `"observed"` does not always mean "turn started" (§5.3). |
| E | Is state 5 (outcome reported back to the card) available? | **No channel exists.** No submission event is emitted by the conversation plugin (`emit(` count = 0, §11 R-3); the failure notice store is injected only into `conversation.composer.bar` (Read `conversation:23095`), not session-scope tool slots (Type `runner:7376-7396` has no notices seat). |
| F | Can a card submit into a **different** session? | **Not through any card prop** — `inputActions` is materialised per session binding, so it is the mount session's composer (Read `conversation:16127-16133, 16149-16198, 22775-22791`). **Yes through plugin code** that resolves the root `sessions` service: retain the target (`sessions.retain`/`using`/`binding`) and call `binding.session.prompt(...)`/`beginSubmission(...)`, or use the target's scoped `conversation.input.for(actx)`. This is plugin-level, not card-prop-level, and is subject to retained-scope, gateway authorization and the archived gate (§8). |

**The single most important line for the card's ceiling:**
`HOST/dsh-client-ui-conversation/lib/client.js:15392-15394` —
`submit: () => { this.submit("queue"); }` — the public action is a fire-and-forget void
that also forces `queue` mode in 0.2.2. Everything state-2..5 verifiability would require is
*inside* the shell (`settleSink`, `applySinkOutcome`, `failSink`) and is discarded there.

---

## 2. What a tool-slot card actually receives

`tool.call.toolview` is a **keyed, `session`-scope** slot:

- Type: `runner:7352-7354` — `key`, `kind: "keyed"`, `scope: "session"`.
- Type: `runner:7376-7396` — its `standardProps` list includes
  `useInput: SnapshotSelectorHook<InputState>`, `inputActions: InputActions`,
  `useSession: SessionSnapshotSelector`, `sessionId`, `useAccess`,
  `useSessionAccess`, `useConversation`, `useSessions`, … (the same seat exists on
  `tool.view.cordis`, `runner:7466-7503`).
- Read: `dsh-client-ui-tool/lib/client.js:2013` — the tool row dispatches
  `renderSlot("tool.call.toolview", owner, { entryKey: toolName, ... })`; the *owner*
  props are `ToolCallOwnerProps` (tool call data), not input actions.
- Read: the renderer merges the session standard kit — `dsh-client-ui-renderer/lib/client.js:667-678`
  (`materializeStandardBinding` spreads `binding.props`), `736-741` (`standardKit`),
  `773-790` (`ContextualEntry`/`renderEntry` spread the kit), `811-824`
  (`SessionEntry` uses the session binding). Owner props win, but tool owner props do not
  contain an `inputActions` key, so the standard kit's value survives.
- Read: the value is contributed per session binding by
  `conversation:22775-22791` — `ctx.uiSession.provide({ hooks: ["conversation","input"], props: ["inputActions"], resolve: (binding) => ({ props: { inputActions: shell.actions } }) })`,
  and `shell.actions` is created once per session shell (`conversation:15367-15395`,
  shell cache `16149-16198`).
- Type\*: the compile baseline also types this: `dsh-client-ui-conversation` 0.2.1-rc.5
  `slots.d.ts:423-437` (`SessionStandardProps.inputActions`) composed into every slot's
  props by `dsh-client-ui-slots` 0.2.1-rc.5 `index.d.ts:221-226`.

**Consequence.** `inputActions` is real, reachable and *session-bound to the session the
card is rendered in*. It is not a message API; it is the composer's public action face.

---

## 3. The five-state table

Definitions used: **(1) clicked** = the card's own event handler ran; **(2) accepted** =
the Host's prompt endpoint returned `{accepted:true}` (message enqueued on the agent);
**(3) sent to backend** = the `session/prompt` RPC reached the Host — in this codebase this
is the *same event* as (2); **(4) entered the target session/turn** = the message was
admitted to the target session log / inbox and a turn will consume it; **(5) outcome
reported back** = a result delivered to the code that initiated.

| State | Card can establish it? | What exists, and where | Grade |
|---|---|---|---|
| **1. User clicked** | **Yes — card-locally only.** The card's own React handler ran; the Host has no click signal for a slot button. | No host event exists: the conversation plugin emits none (`emit(` count 0, §11 R-3); the only click-like report is composer analytics `send_button_click`, produced by the composer's own send path, not by cards — Read `conversation:16091-16105`, `16171-16173`. For an iframe card the click must additionally be bridged by the card's own plugin via `postMessage`. | Read (`conversation:16091-16105`) + Ran (§11 R-3) |
| **2. Host accepted the request** | **No direct signal.** Only inference: watch `useInput` (`phase` `sending`→`plain`, `draft` cleared) and/or `useSession.pendingSubmissions` (a matching echo appears). Neither is correlated to the card's `submit()` call, and the echo is not a promise. | Acceptance is `acceptPrompt(requestId)` — Read `session-client:2390-2402`, triggered by the prompt receipt or by observing an Inbox row carrying the rpcId (`session-client:2816-2829`). The result reaches only the caller of `session.prompt` (`session-client:2334-2381`), i.e. `sendSession` inside the composer (`conversation:4765-4838`). Echo publication is gated on acceptance: `acceptedSubmissions` only — Read `session-client:2887-2889`, snapshot field `2913-2918`. | Read; Type (`ISession.prompt` → `RemoteResult<{accepted:true}>`, `runner:2090`) |
| **3. Request sent to backend** | **No separate signal.** The RPC call *is* state 3; its return is state 2. `InputActions.submit()` exposes neither. | Wire contract: `session/prompt` request `{requestId, sessionId, mode, content, clientTimeZone?}` → result `{accepted:true}` — Type `typert.host:2382-2413`, `3755-3760`; runtime call Read `session-client:2340-2348`; host endpoint Read `index.js:4048-4061`. | Type (`typert.host:2382-2413`) + Read (`session-client:2340-2348`) |
| **4. Message entered the target session/turn** | **Not from the card.** Internally there *is* a signal — the submission echo's `onRetire({reason:"observed"})` — but it is delivered only to the `beginSubmission` caller (the composer), and it means different things per placement (see §5.3). The card cannot distinguish "queued in the inbox" from "turn started". | Read `session-client:2811-2815` (`user/message` event with `source.rpcId`), `2816-2842` (Inbox row observation / retired-admitted), `2869-2900` (`"observed"` vs `"failed"`, `onRetire` at 2899). The composer owns the callbacks — Read `conversation:4807-4820`. | Read (`session-client:2811-2900`, `conversation:4811-4820`) |
| **5. Outcome reported back to the card** | **No channel.** No promise, no callback, no event. The failure notice is published to `shell.notices`, which is injected only into `conversation.composer.bar`; `InputState` (the `useInput` snapshot) carries draft/phase/queue only. | Read `conversation:15941-15975` (outcome consumed inside the shell), `16048-16058` (published InputState contents), `23012`/`23095` (notices seat), `15865-15872` (notice store). Type `runner:7376-7396` (no notices in tool-slot standard props). Failure state that *is* visible: `SessionSnapshot.promptError` — Type `runner:2382`, Read `session-client:2372-2377, 2931`. | Read + Type; absence Ran (§11 R-3/R-4) |

**Bottom line for the design question:** the card can reliably *initiate*; it cannot
reliably *observe its own request*. States 2/3 exist but are consumed by the composer;
state 4 exists but only as an internal retirement callback; state 5 does not exist for a
card. The best a card can do without host changes is a heuristic correlation on
`useInput` + `useSession` (§5.4), which is not a verifiable result.

---

## 4. Submit modes and return values

### 4.1 The card-facing action (`InputActions`)

```js
// HOST/dsh-client-ui-conversation/lib/client.js:15392-15394
submit: () => {
    this.submit("queue");
}
```

- **Returns `undefined`.** Read `conversation:15392-15394`; Type\*
  (`dsh-client-ui-conversation` 0.2.1-rc.5) `input.d.ts:258` `submit(): void`
  (interface at `237`: "stable-identity void callbacks").
- **Mode is forced to `"queue"`** in the 0.2.2 runtime. `SessionInputShell.submit(mode = "queue", source)`
  (Read `conversation:15613`) is called with `"queue"`; a card cannot request steer.
  Contrast the keyboard/Enter path, which resolves queue/steer from the busy-Enter
  preference and passes it: Read `conversation:16357-16361` (resolveSubmitMode),
  `21357-21367` (keyboard.submit). A card cannot reach the steer path.
- **No `source`, no `signal`, no request-id.** The frozen `submission` record built for
  analytics is `{timestamp, mode, state?}` — Read `conversation:15620-15625`.
- **Empty draft/no attachment is a no-op**: the machine returns no effect for
  `trimmed === "" && attachmentIds.length === 0` — Read `conversation:5381-5382`.
  So `submit()` on an empty composer proves nothing and creates no request.
- **Busy phases are refused inside the machine**, not by the action:
  `adjudicating | submitting | sending` → empty effect list — Read `conversation:5368-5369`.
- The action does **not** consult the composer's UI gates (`canSubmit()`, `promptDenied`,
  `locked`): those live in the InputBar only — Read `conversation:21356`, `21762`,
  `21827-21833`. Consequence: a card's `submit()` bypasses the *UI* disable, but not the
  Host's authorization or admission (the same `session.prompt` endpoint is eventually
  called, §6).

### 4.2 What `submit()` does internally (still invisible to the card)

Read `conversation:15613-15644` → `SubmitMachine` (`5284-5477`):

- plain draft, not a slash command → optimistic **default send**: set phase `"sending"`
  synchronously, emit `default-sink` (`5358-5366`, `5384-5392`).
- leading `/command` claim → `adjudicating` (`5384-5391`) → `submitting` → `begin-submit`
  (`16011-16043`) which calls `claim.submit(args, actx, attachments)`; the command
  settlement is a `Promise<SubmitOutcome>` internally (`16016-16031`), but only the
  command's own chip UI consumes it.
- default send path: serialize references, then `deps.defaultSink(...)` →
  `InputHub.sink` → conversation service `sendSession` — Read `conversation:15907-15928`,
  `16278-16281`, `4765-4838`.
- `sendSession` registers the echo before sending, and its result is
  `{kind:"success"}` on Host acceptance / `{kind:"error"}` on refusal — Read
  `conversation:4802-4837` (accept callback `4811-4815`). The shell then applies it:
  success clears the draft/attachments/history; failure keeps them and raises a notice —
  Read `conversation:15941-15974`, `5451-5467`.

### 4.3 The richer facade a *plugin* can reach (not the card)

`conversation.input.for(actx)` resolves the same per-session `SessionInputShell` (Read
`conversation:16127-16133`; returns the shell). It exposes:

- `submit(mode?: 'queue'|'steer', source?: 'click'|'enter'): void` — Type\* `input.d.ts:184`;
  Read `conversation:15613`. **Still void**, but the plugin controls the mode.
- `setDraft`, `addAttachments`, `removeAttachment`, `pruneAttachments`, `notify(level,text)`,
  `focus`, `state` — Read `conversation:15374-15796`.
- The plugin must already hold the session's `actx` (`sessions.scope(id)`; throws unless a
  retained Session scope — Read `conversation:16131`). The repo's own
  `src/client/prompt-bridge.ts:122-135` uses exactly this route to reach the *facade*.

Even from the facade, the *submission outcome* is not returned; `notify` pushes into the
composer's notice store (Read `conversation:15780-15787`), it does not resolve anything to
the caller.

### 4.4 The full plugin-level submission API (has results)

Only by using the Session object (via the root `sessions` service) does a caller get a
result:

| API | Returns | Result meaning | Evidence |
|---|---|---|---|
| `session.prompt(content, mode, signal?, requestId?)` | `Promise<RemoteResult<{accepted:true}>>`; failures set `promptError` and return `{ok:false,error}` | Host admitted the message (inbox/log), **not** turn delivery | Type `runner:2090`; Read `session-client:2334-2381` |
| `session.beginSubmission({mode,text,attachments,onAccept,onRetire})` | `{requestId, abandon()}` | mints the idempotency/identity correlation; `onAccept` = host accepted; `onRetire({reason:"observed"|"failed"})` = client observed it in durable log/Inbox, or dropped it | Type `runner:1909-1910, 2477-2480, 2205-2206`; Read `session-client:2299-2322, 2869-2900` |
| `conversation.send(text)` (scoped ctx) | `Promise<void>`, resolves on acceptance, rejects with the error code | admission only | Type\* `service.d.ts:39`; Read `conversation:4740-4745, 5076-5086` |
| `conversation.sendSession(session,text,ids,mode,signal,accept?)` | `Promise<SubmitOutcome {kind:'success'\|'error'}>` + optional accept callback | admission only | Read `conversation:4765-4838`; Type\* `service.d.ts:112` (0.2.1 signature has no `accept` — skew §10.2) |
| `sessions.updateQueue(itemId,{kind:'steer'})` | `Promise<RemoteResult<{accepted:true}>>` | only for rows already in the inbox | Read `session-client:2425-2431`; host `index.js:903-953` |

**rpcId / request-id generation.** The identity is minted **client-side**:
`randomUUID()` in `beginSubmission` (Read `session-client:2300`), with a fallback
`randomUUID()` inside `prompt` when the caller passes none (`session-client:2343, 2356`).
It travels to the Host as `requestId` (Type `typert.host:2395`), which builds the durable
`user-rpc` message source `{kind:'user', rpcId, clientTimeZone?, principal?}` (Read
`index.js:4053-4059`; Type `typert.host:3344`/`4451` `MessageSourceMap['user-rpc']`).
The card path never sees this id because `inputActions.submit` takes no arguments and
returns nothing.

---

## 5. What a card *can* observe (the inference channels)

A card receives `useInput` and `useSession` (Type `runner:7389-7391`). These are shared,
session-wide snapshots — not per-submission.

### 5.1 `useInput` (`InputState`)

Published state is `compose()` — Read `conversation:16048-16058`:
`{ draft, attachmentIds, draftRev, phase, claim?, occurrences, queue }`.
It has **no** submission id, outcome, error or notice field.
0.2.2 runtime phases include `"sending"` (`conversation:5360`, `15329`, `21829-21830`), while
the 0.2.1-rc.5 compile-baseline type still lists only
`'plain' | 'adjudicating' | 'claimed' | 'submitting'` (Type\* `input.d.ts:276`) — skew §10.2.

So a card can see: phase went `plain → sending → plain` and the draft it set disappeared.
That is *consistent with* host acceptance, but is also what a user's manual send looks like.

### 5.2 `useSession` (`SessionSnapshot`)

Type `runner:2381-2382`: `{ pendingSubmissions, running, promptError, blank,
promptAttempted, awaitingFirstTurn, ... }`.

- `pendingSubmissions` = **accepted echoes only** (`session-client:2887-2889`,
  `2913-2918`). The chat view consumes it for the "sending/optimistic" rows
  (`dsh-client-ui-chat/lib/client.js:3564-3568`, `6439-6440`). A rejection publishes **no**
  echo (0.2.2 README: "A refused or failed submission publishes no echo and leaves the
  draft in the composer with an error notice" — `dsh-client-ui-conversation/README.md:123`).
- `promptError` — set on any failed prompt in that session (`session-client:2372-2377`,
  `2931`); not per-submission.
- `running`/`awaitingFirstTurn` — indirect evidence that *something* started a turn.

### 5.3 The echo retirement rules (why "observed" ≠ "delivered to a turn")

Read `session-client:2791-2815, 2816-2842, 2851-2861, 2869-2900`:

- **transcript** placement (session idle at registration): retires when the durable
  `user/message` with that `rpcId` is observed (`admitted` path, `2840-2841`) — this *is*
  evidence the message entered the session log.
- **queued** placement (session running, queue mode): retires when the message appears in
  the **Inbox projection** (`2837`, `2851-2861`) — evidence of queue admission, **not** of
  turn start.
- **steering** placement: retires via the admitted/durable path or inbox-splice handling
  (`2807`, `2840`).
- **failed**: accepted echo later removed/canceled from the Inbox or a turn ended without
  the message being admitted (`2793-2799`, `2810-2811`, `2881-2886`).

The `reason` (`"observed"` vs `"failed"`) is delivered only through
`onRetire` to the `beginSubmission` caller (Read `2899`), which is the composer
(`conversation:4807-4820`). It is **not** in `SessionSnapshot.pendingSubmissions`.

### 5.4 Best-case heuristic available to a card today

1. choose a unique marker text, `inputActions.setDraft(marker)`, `inputActions.submit()`;
2. watch `useInput`: `phase === "sending"` proves the machine started an attempt;
3. watch `useSession((s) => s.pendingSubmissions.find(p => p.text === marker))`:
   appearance ⇒ Host accepted (state 2/3); absence + `promptError`/notice ⇒ refusal;
4. disappearance of the echo ⇒ *either* observed admission *or* a post-accept failure;
   `useInput.draft` still holding the marker ⇒ failure, cleared ⇒ acceptance.

This distinguishes "attempted", "accepted" and "failed" with heuristics, but not state 4
reliably, and it is text-matching (the same matcher the composer uses for its own echo
dedupe — `dsh-client-ui-conversation/README.md:64`). It is not a verifiable result, because
nothing ties the observations to the card's call and a concurrent user/other-plugin send
can supply them.

---

## 6. Failure paths

### 6.1 Host admission failures (`session/prompt`)

Read `index.js:4048-4061` (Remote wrapper) and `831-874` (command body):

| Failure | Code | Where |
|---|---|---|
| empty/whitespace-only content | `gateway/bad-request` | `index.js:4050` |
| invalid `clientTimeZone` | `session/invalid-time-zone` | `index.js:4051-4052` |
| target session not resolvable/resumable | `session/not-found` (or resume error) | `index.js:967-971`, `192-216` |
| subagent-origin session addressed as an ordinary session | `session/agent-busy` ("use subagent delivery") | `index.js:143`, `194-196` |
| session writer held by another owner | `session/writer-held` | `index.js:214` |
| staged file receipt unknown | `session/attachment-invalid` (`FILE_NOT_STAGED`) | `index.js:1004` |
| model cannot take images | `session/attachment-invalid` (`MODEL_DOES_NOT_SUPPORT_IMAGES`) | `index.js:844-849` |
| any other admission throw | `session/agent-busy` "prompt rejected" | `index.js:866-870` |

**Archived session — the important trap.** The archived gate does **not** reject the
prompt. `ArchivedSessionGate` is an `agent/pre-step` hook that rejects the *model step*:
Read `index.js:3249-3265` (`underArchivedSession` `3277-3290`). The comment states a late
delivery to an archived Session "proposes a step the gate rejects, which the loop ends as
`blocked` without a request" (`3249-3255`). Therefore:

- state 2/3 can be **true** (prompt accepted, `{accepted:true}`),
- state 4 can be **false forever** (no turn will run until unarchived),
- no error is reported to the prompt caller. A card cannot detect this at all.

The only client-visible archived-related code is the **create** path
(`!archivedSessionIds.includes` — `index.js:680`), not prompt.

### 6.2 Client-side failures before/around the RPC

- command drafted with attachments but the claim refuses them → composer notice, no
  submit (`conversation:15627-15630`).
- reference serialization failure / missing serializer → `failSink` → draft kept + notice
  (`conversation:15911-15927`, `15966-15975`).
- attachment preparation failures reject inside `sendSession` and are turned into a
  failed sink (`conversation:4788-4832`, `15941-15947`).
- shell disposed or attempt aborted → late settlements are dropped **silently**
  (`conversation:16044-16047`).
- access denied: the composer UI pre-checks `useAccess("session/prompt")`
  (`conversation:21762`) but `inputActions.submit` does not; the Host endpoint is
  access-controlled (README `dsh-api-session-controller/README.md:36`) and rejects as an
  ordinary prompt failure.

**Visibility of failures to the card:** none directly. The notice is composer-scoped
(`conversation:23095`); `SessionSnapshot.promptError` is session-wide
(`session-client:2372-2377, 2931`); the draft staying in `useInput.draft` is a hint.
None is correlated to the card's call.

---

## 7. Duplicate and replay behaviour

**In-flight duplicate (`inputActions.submit()` twice in the same tick).** The machine sets
`phase="sending"` synchronously for a plain draft (`conversation:5358-5360`) and refuses a
second `enter` while `sending`/`submitting`/`adjudicating`
(`conversation:5368-5369`). Result: the second call is a silent no-op. Grade Read.

**Duplicate after success.** The committed draft is cleared in the same settlement
(`conversation:5427-5439`, `5451-5459`); a second `submit()` with an empty draft is a
no-op (`conversation:5381-5382`). Grade Read.

**Retry after failure.** Draft and attachments are kept on failure
(`conversation:5451-5467`, `15941-15975`), so `submit()` again starts a **new** attempt
with a **new** `requestId` (`session-client:2299-2301`). The Host's idempotency cannot
merge them — it keys strictly on `requestId`. Grade Read.

**Host idempotency (same requestId).** A prompt whose `requestId` is already queued or
logged returns the original acceptance without inserting another message:
Read `index.js:831-833` + `hasPromptRequest` `1011-1022` (checks `inbox.nextTurn`,
`inbox.nextStep`, and durable `user/message` events by `source.rpcId`);
documented in `dsh-api-session-controller/README.md:36` ("Prompt retries whose `requestId`
is already queued or logged return the original acceptance without inserting another
message"). Grade Read.

**Card cannot use that idempotency.** `inputActions.submit(): void` exposes no
`requestId` (§4.1), so the card cannot make a retry idempotent. Only plugin code using
`beginSubmission` + `prompt(..., requestId)` can. Grade Read.

**No content fingerprinting.** `hasPromptRequest` is the only prompt dedupe and it is
rpcId-only (Read `index.js:1011-1022`); sending identical text twice with two ids sends
two messages. Grade Read.

**Replay of an echo.** The client publishes only accepted echoes and retires each exactly
once (`session-client:2887-2900`; `retiring` latch `2872, 2884`). The chat view additionally
dedupes by `rpcId` against observed nodes (`dsh-client-ui-chat/lib/client.js:3565-3571`).
Grade Read.

---

## 8. Cross-session targeting

### 8.1 Through card props — **No**

`inputActions` (and `useInput`/`useSession`) are materialised **per Session binding**
from the slot's scope binding. `uiSession.provide` resolves `shell.actions` for
`binding.sessionId` (`conversation:22775-22791`), the shell cache is keyed by binding
(`16149-16198`), and the renderer passes that binding's standard kit to the slot entry
(`dsh-client-ui-renderer/lib/client.js:680-702, 811-824`). A card's prop is therefore
always its mount session's composer. Grade Read.

`useSessionAccess(sessionId, action)` is available (Type `runner:7385`, `7330`) and can
**check** access to another session, but it cannot send.

### 8.2 Through plugin code — **Yes, within constraints**

The root `sessions` service is provided at `session-client:3856`
(`rootCtx.reflect.provide("sessions", this, void 0)`) and is documented as
`ctx.sessions` for plugins (Type `runner:1422-1514`; `TYPE_API` `ISessions` `2093-2094`).
From it:

1. **Resolve/retain the target**: `sessions.retain(target, {source, signal?})` →
   `SessionReference` (`{sessionId, binding, ready, release}`), or `sessions.using(...)`,
   or `sessions.binding(id)` for an already-retained generation
   (Read `session-client:3858-3910`, `4029-4074`; Type `runner:2353-2390`).
   `source` is `'controllerOperation' | 'gateway'` (Type `runner:2361-2374`) — i.e. plugin
   code can legitimately retain an arbitrary known session id, but **`binding(id)`
   returns `undefined` unless the session is already retained** (`session-client:4072-4074`).
2. **Submit**: `reference.binding.session.prompt(content, mode, signal, requestId)` →
   `RemoteResult<{accepted:true}>`, or `beginSubmission(...)` for the
   accepted/observed/failed callbacks (Type `runner:2090`, `1909-1910`, `2477-2480`;
   Read `session-client:2299-2381`).
3. **Or the target's scoped composer facade**: `sessions.scope(targetId)` →
   `scope.get('conversation').input.for(scope)` (Read `conversation:16127-16133`; the repo
   uses this exact chain in `src/client/prompt-bridge.ts:122-135`), then
   `setDraft`/`submit(mode)`.

Constraints, all Read/Type:

- target must be an ordinary session or a subagent **address** (`SessionTarget` Type
  `runner:2389-2390`); addressing a subagent-origin session as ordinary is
  `session/agent-busy` (`index.js:143, 194-196`);
- target must resolve/resume (writer lock, migration) — `index.js:181-217`;
- the gateway is access-controlled per resource/principal (README
  `dsh-api-session-controller/README.md:36`); the local owner peer is the owner, so local
  use is not denied, but a card cannot bypass policy;
- archived targets accept the prompt and never run it (§6.1);
- **for a dynamic cordis plugin** the `sessions` service is reachable via `ctx.get('sessions')`
  without a declaration (Read guard `runner:484-514`; `SERVICE_API.sessions` listed
  `1422-1514`), but the `conversation` service is **not** in the plugin `SERVICE_API`
  catalogue — the shipped precedent reaches it through
  `sessions.scope(id).get('conversation')` (Type/Read, repo `prompt-bridge.ts:122-135`).

**Does the card itself see that?** No. The card's props are per-mount; only the plugin
that registered the slot can reach `sessions` and bridge a result into the card. So
"a card can submit into another session" is **false at the card surface** and **true at the
plugin surface** — an important distinction for the design.

---

## 9. What would have to change in the host (if anything)

Nothing is required to *initiate* a submission from a card — `inputActions.setDraft` +
`submit()` already does it (Read §4.1). Everything below is required to make the result
**verifiable**, in increasing order of change:

1. **Return the admission outcome from the card action.** `inputActions.submit` is
   `(): void` (`conversation:15392-15394`); the outcome object already exists one layer
   down (`sendSession` returns `{kind:'success'|'error'}`, `conversation:4834-4837`, and
   the machine settles on it, `5451-5467`). Change it to
   `submit(options?: {mode?: 'queue'|'steer'; signal?: AbortSignal}): Promise<SubmitOutcome>`
   (or add a sibling `sendMessage(...)`), and expose `SubmitOutcome` on the slot prop
   surface. Note: mode is currently **forced to `"queue"`**; the richer facade
   (`conversation:15613`) already accepts a mode, so the prop wrapper is the only blocker.
2. **Return or accept the submission identity.** `requestId` is minted inside
   `beginSubmission` (`session-client:2300`) and never surfaces. Either return it from the
   new action, or accept a caller-supplied id so cards can use the Host's existing
   rpcId idempotency (`index.js:1011-1022`).
3. **Expose delivery state, not just acceptance.** The client already computes
   accepted/observed/failed (`session-client:2869-2900`), but only the composer sees it.
   Publish a per-submission view (e.g. `pendingSubmissions` entry gains a lifecycle:
   `accepted → observed`, or an explicit `retireReason`), or route `onRetire` to the
   initiating action. Today the retirement `reason` is dropped from the snapshot
   (`session-client:2913-2918`).
4. **Distinguish "queued in the inbox" from "turn started".** A queued echo retires on
   Inbox observation (`session-client:2837, 2851-2861`), which is *not* a turn. If the
   design needs real "the message entered the turn", the host must expose the rpcId→
   `turn/start` correlation (or a per-submission state), not just echo retirement.
5. **Expose failure text to session-scope slots.** `shell.notices` is injected only into
   `conversation.composer.bar` (`conversation:23095`); tool slots receive none
   (Type `runner:7376-7396`). Add a notices hook to the session standard props, or return
   the error in the new action's result.
6. **Cross-session, if required.** Either (a) document/bless the existing
   `sessions.retain → binding.session.prompt / beginSubmission` route as a supported
   plugin API (its types are already in `TYPE_API`, `runner:2093-2094`), or (b) add a
   session-addressed submit action to the standard props
   (e.g. `submitTo(sessionId, ...)`) with the gateway authorization applied. Today the
   prop surface is strictly per-mount (`conversation:22775-22791`).
7. **Not needed:** a new Host endpoint. `session/prompt` already takes a caller-minted
   `requestId` and returns `{accepted:true}` (Type `typert.host:2382-2413`); everything
   missing is client-side plumbing plus a delivery-state surface.

**Cheapest adequate change for the stated goal** (card knows accepted vs. failed vs.
delivered): item 1 + item 3 for transcript sends (idle composer), plus item 5 for the
failure text. The archived trap (§6.1) is orthogonal: even a perfect client result cannot
tell that an archived session will never run; that would need a Host-side admission
answer (e.g. reject prompts to archived sessions with `session/target-archived` — the code
exists for schedules, `RemoteErrorDetailsMap`, `typert.host:3484`).

---

## 10. Limits, version skew, open questions

### 10.1 What is *not* in the extracted tree

`dsh-agent` (the service behind `agent.followup`/`agent.steer`, `index.js:857-858`) is
**not** among the 40 extracted packages. So how a `followup` becomes a queued turn, and
the exact `agent/pre-step` → `blocked` behaviour for archived sessions, are cited from the
controller’s call site and comments only — **not** read in the agent implementation.
Claims about "message enters the turn" therefore stop at "the controller enqueued it on the
Agent" and at the client’s observation of Inbox/durable events.

### 10.2 Known version skew (compile baseline vs. running host)

- Running host and every cited package: **0.2.2-rc.1** (§11 R-1).
- Plugin `node_modules/@deepseek-ai/*` (the types this repo compiles against):
  **0.2.1-rc.5** (`dsh-client-ui-conversation`, `dsh-session`, `dsh-llm`; no
  `dsh-api-session-controller`/`dsh-cordis-client-runner` locally at all).
- Concrete skews found:
  - 0.2.1-rc.5 `InputState.phase` has no `"sending"`
    (Type\* `input.d.ts:276`); 0.2.2 runtime adds it (`conversation:5360, 15329, 21829`).
  - 0.2.1-rc.5 `InputActions` has no `insertQuote` (Type\*
    `input.d.ts:237-258`); 0.2.2 runtime exposes it (`conversation:15369`), and the 0.2.2
    README documents it (`README.md:64`).
  - 0.2.1-rc.5 `sendSession` type has no `accept` callback (Type\* `service.d.ts:112`);
    0.2.2 runtime passes one (`conversation:4765-4838`).
  - 0.2.1-rc.5 `InputActions.submit(): void` matches the 0.2.2 runtime
    (`conversation:15392-15394`) — this one is **not** skewed.
  - 0.2.2 `dsh-client-ui-conversation/README.md:123` mentions an admission code
    `session/prompt-rejected` that does not exist anywhere in the extracted 0.2.2 JS
    (§11 R-5); it presumably belongs to the missing `dsh-agent` admission stage.
  Treat any Type\* claim above as "compile baseline", not as the running contract.

### 10.3 Open questions

1. Does the Host apply any per-message rate/consent gate when a prompt arrives without a
   composer draft (a card calling `session.prompt` directly)? None was found in the
   extracted controller; the gateway access check is the only gate cited.
2. Is `conversation` (the service) intended to be plugin-reachable? Its `IConversation`
   face is exported (Type\* `service.d.ts`), but it is absent from the dynamic-plugin
   `SERVICE_API` catalogue (`runner:1281-1514`); the shipped precedent reaches it through
   `sessions.scope(id).get('conversation')`. If a supported route is meant, it should be
   documented in the catalogue.
3. Whether a card submitting through the composer should count as the reader’s own action
   for audit/analytics: `inputActions.submit` carries no `source` and the analytics hook
   receives an undefined `source` (`conversation:15620-15625`, `16091-16105`); no
   distinguishing signal exists.

---

## 11. Search commands and stored results (`Ran`)

All commands run in PowerShell from the workspace root (the local absolute path is redacted
to the Session 27 convention); `$root` =
`tmp\dsh-host-0.2.2-rc.1\dsh\node_modules\@deepseek-ai`.

**R-1 — package versions (7 packages cited, all 0.2.2-rc.1).**

```powershell
foreach ($p in 'dsh-client-ui-conversation','dsh-api-session-controller','dsh-cordis-client-runner',
  'dsh-client-ui-tool','dsh-client-ui-chat','dsh-client-ui-session','dsh-session') {
  (Get-Content "$root\$p\package.json" -Raw | ConvertFrom-Json).version }
```

Result: `dsh-client-ui-conversation = 0.2.2-rc.1`, `dsh-api-session-controller = 0.2.2-rc.1`,
`dsh-cordis-client-runner = 0.2.2-rc.1`, `dsh-client-ui-tool = 0.2.2-rc.1`,
`dsh-client-ui-chat = 0.2.2-rc.1`, `dsh-client-ui-session = 0.2.2-rc.1`,
`dsh-session = 0.2.2-rc.1`.

**R-2 — no d.ts in the extracted host tree (absence claim: 0.2.2 Type evidence cannot be a d.ts).**

```powershell
(Get-ChildItem $root -Recurse -File -Include *.d.ts | Measure-Object).Count
```

Result: `0`.

**R-3 — no submission event / result channel in the conversation plugin.** (absence claim)

```powershell
(Select-String -Path "$root\dsh-client-ui-conversation\lib\client.js" -Pattern '\.emit\(' | Measure-Object).Count
Select-String -Path "$root\dsh-client-ui-conversation\lib\client.js" -Pattern 'onAccept|onRetire'
Select-String -Path "$root\dsh-client-ui-conversation\lib\client.js" -Pattern 'messageSubmitted'
(Select-String -Path "$root\dsh-cordis-client-runner\lib\client.js" -Pattern 'name: ".*submit|submit/|/submit' | Measure-Object).Count
```

Result: `0` emits; `onAccept|onRetire` only at `4811` and `4816` (the composer's
`sendSession`); `messageSubmitted` only at `15932`/`16171` (product analytics, no
result); `0` submission-named events in the contract catalogue.

**R-4 — notices are injected only into the composer bar.** (absence claim: tool slots get none)

```powershell
Select-String -Path "$root\dsh-client-ui-conversation\lib\client.js" -Pattern 'notices: shell\.notices|notices: ABSENT'
```

Result: `conversation:23012: notices: ABSENT_NOTICES,` and
`conversation:23095: notices: shell.notices,` — both inside the
`conversation.composer.bar` registration; the `tool.call.toolview` standard-props list
(`runner:7376-7396`) has no notices seat.

**R-5 — `prompt-rejected` appears only in 0.2.2 docs, not in extracted JS.** (absence claim)

```powershell
Get-ChildItem $root -Recurse -File | Select-String -Pattern 'prompt-rejected' -List | Select-Object -ExpandProperty Path
```

Result: only
`...\dsh-client-ui-conversation\README.md` and `README.zh.md` (2 files).
No JS match in the extracted tree.

**R-6 — the card action's exact body and the absence of a promise.**

```powershell
Select-String -Path "$root\dsh-client-ui-conversation\lib\client.js" -Pattern 'submit: \(|submit\(mode'
```

Result: `15392: submit: () => {`, `15613: submit(mode = "queue", source) {`,
`21356: canSubmit: () => ...`, `21357: submit: (accelerated) => ...` — the public prop
entry at `15392` is an arrow that calls the internal method and returns nothing.

**R-7 — `insertQuote` exists in 0.2.2 runtime but not in the 0.2.1-rc.5 InputActions type.**

```powershell
(Select-String -Path "$root\dsh-client-ui-conversation\lib\client.js" -Pattern 'insertQuote').LineNumber
```

Result: `15186 15369 15465 15467` (runtime), while the local 0.2.1-rc.5
`input.d.ts:237-258` `InputActions` has no `insertQuote`.

**R-8 — local compile-baseline versions (skew source).**

```powershell
foreach ($p in 'dsh-client-ui-conversation','dsh-session','dsh-llm') {
  (Get-Content "node_modules\@deepseek-ai\$p\package.json" -Raw | ConvertFrom-Json).version }
```

Result: all `0.2.1-rc.5`. Also: `dsh-api-session-controller` and
`dsh-cordis-client-runner` are **absent** from the local `node_modules` (they are not
compile-baseline dependencies of this repo).

---

*Method note: no browser, network, runtime or product-code edit was performed. Only
PowerShell directory/file reads and `Select-String` searches (recorded above) plus `read`
of the cited files.*