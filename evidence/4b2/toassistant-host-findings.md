# @ToAssistant — host turn-submission capability investigation

- **Task:** task-2. **Date:** 2026-11-05. **Host:** DSH 0.2.1-rc.5 (Electron app.asar).
- **Scope:** read-only source investigation. **No product code was edited.**
- **Sources:** `node_modules/@deepseek-ai/*` (installed, real `.d.ts` + compiled `lib/client.js`) and
  `tmp/dsh-host-src/dsh/node_modules/@deepseek-ai/*` (288 files extracted from the installed
  `app.asar`), plus `tmp/dsh-host-src/agent-loop.js` / `agent-index.js` extracted this session.
- **Verdict up front: EXTENDABLE.** The host capability ADR-015 Option C asked for **exists and is
  reachable** — but the *attribution* and *host-rendered confirmation* properties it also demands do
  **not**. See §7.

Prior conclusion under test: "no trusted host submission capability exists" (ADR-015 §1, ADR-4B §2).
**That conclusion is refuted.** Three distinct real submit paths exist (§2–§4).

---

## 1. The finding that unlocks everything: `ctx.get()` returns a CALLER-SCOPED service

`node_modules/@deepseek-ai/cordis/lib/index.js:763-765`:

```js
get(name, strict = true) {
    return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
}
```

`getTraceable` (line 84-90) wraps a `Service` in `createTraceable` (line 123-158) whose `get` trap
returns **the caller's** context for the tracker property:

```js
if (prop === tracker.property) return ctx;   // line 128
```

`Service`'s constructor sets `tracker.property = "ctx"` (`index.js:1774-1777`). So
`svc.method()` executes with `this.ctx` rebound to **the context the caller called from**. This is
not a plugin-visible hack: cordis applies the same wrapping to plain property access (line 675
`if (Reflect.has(target, prop)) return getTraceable(ctx, ...)`).

**Consequence:** a plugin holding only the *root* client ctx can obtain a **session-scope** Context:

```
ctx.sessions.scope(sessionId)  ->  the real session-scope cordis Context
```

`tmp/dsh-host-src/.../dsh-api-session-controller/lib/types/client/sessions/service.js:365-367`:

```js
scope(id) {
    return this.scopes.get(id)?.ctx;
}
```

The scope is a genuine fiber context — `client/scope.js:16-30` builds it with
`fiber.ctx.extend({ [kScope]: { sessionId }, [Context.filter](...) })`, and `scopeOf(ctx)` reads that
symbol. This repo **already relies on exactly this chain at runtime**:
`src/client/prompt-bridge.ts:122-135` (`composerFor`) and `:146-163` (`promptSinkFor`) resolve
`ctx.get('sessions').scope(id).get('conversation').input.for(scope)` and call `setDraft`/`focus`/
`notify` on it today. The only gap is that it never calls `submit`.

---

## 2. Path A — `ctx.conversation.send(text)` (REAL, documented, scope-addressed)

**Declaration** — `lib/types/client/service.d.ts:26-57`, `IConversation`:

```ts
readonly input: SessionInputResolver;
readonly blocks: ComposerBlocks;
send(text: string): Promise<void>;
updateQueue(itemId: MessageId, action: QueueAction): Promise<void>;
cancel(): Promise<void>;
loadOlder(): Promise<void>;
```

Registered as the `conversation` service at `lib/client.js:4643` (`super(ctx, "conversation")`) and
reachable from a scoped context — the host's own error text says so.

**Implementation** — `node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js:4664-4670`:

```js
async send(text) {
    const result = await this.scopedSession("send").prompt([{ type: "text", text }], "queue");
    if (!result.ok) throw new Error(`conversation.send failed: ${result.error.code}: ${result.error.message}`);
}
```

`scopedSession` (`4949-4954`) → `scopeId` (`4956-4960`) → `requireSessions().scopeOf(this.ctx)`. The
root-context failure message is explicit and names the supported route
(`client.js:4958`):

> `conversation.${op} requires a session scope — address one via ctx.sessions.scope(id).conversation`

**Delivery**: mode is hard-coded `"queue"`. The node half receives
`remote.session.prompt({ requestId, sessionId, mode, content, clientTimeZone })`
(`dsh-api-session-controller/lib/types/client/sessions/session.js:173-229`, prompt at 186-192).

**This is the shortest honest path.** It needs no editor state, no composer, no DOM, no synthetic
event. It is one call on a documented service.

---

## 3. Path B — `SessionInput.submit()` (REAL, and also reachable — via two doors)

### 3.1 It is a genuine native submit, not a stub

`lib/types/client/contract/input.d.ts:170-202` declares `SessionInput`; the submit member is:

```ts
/**
 * THE complexity sink: enter adjudication, submit transaction, and the default sink live inside.
 * @param mode - delivery intent retained through asynchronous adjudication and serialization.
 */
submit(mode?: InputSubmitMode, source?: 'click' | 'enter'): void;    // line 184
```

The compiled implementation is `SessionInputShell.submit` at
`lib/client.js:15202-15256`. It is **real end-to-end**, not a shim:

1. `15203` refuses only when `this.disposed`.
2. `15206-15214` snapshots submission facts and freezes a `MessageSubmission`
   `{ timestamp, mode, source?, state? }`.
3. `15215-15239` handles the attachment-only branch via `deps.defaultSink`.
4. `15245-15250` dispatches a real `{ type: 'enter', mode, draft, submission }` into the pure
   `SubmitMachine`.
5. The machine (`client.js:5168-5192` `onEnter`) either enters `adjudicating` (slash-command path) or
   produces `default-sink` + `commit-draft` effects; `execute` (`15482-15505`) runs them:
   `defaultSink` = `sinkSerialized` (`15524-15566`) → `deps.defaultSink(...)`.
6. `InputHub.shellFor` wires that dep (`15843`): `defaultSink: (text, attachmentIds, mode, signal) =>
   this.sink(session, text, attachmentIds, mode, signal)`, and `sink` (`15939-15942`) calls
   `this.conversation().sendSession(session, text, attachmentIds, mode, signal)`.
7. `ConversationController.sendSession` (`client.js:4685-4740`) does
   `session.beginSubmission({...})` → `await nextPaint()` → `session.prompt(content, mode, signal, submission.requestId)`.

So `submit()` reaches **the same `session.prompt`** as `conversation.send()`, through the composer's
own adjudication machinery. It is heavier (it reads and clears the real editor draft,
`commitDraft` at `15511-15517`) but it is the *native* path — the same one the Send button uses.

### 3.2 Door 1: the facade is on the public `conversation` service

`service.d.ts:27-28`: `readonly input: SessionInputResolver;` — and
`contract/input.d.ts:203-215`:

```ts
export interface SessionInputResolver {
    for(actx: Context): SessionInput;
    requestDraftInitialization(binding, options): DraftInitializationResult;
}
```

`IConversation`'s doc comment (`service.d.ts:21-25`) is decisive about intent:

> The outward conversation face (`ctx.conversation`): the scope-addressed verbs and the input
> registry **other plugins may reach** — and exactly what a test fake must supply.

`InputHub.for(actx)` (`client.js:15793-15799`) requires the context be a *retained* session scope
(it throws `"conversation.input.for requires a retained Session scope"` otherwise) — which §1 gives us.
The d.ts also documents this usage at `contract/input.d.ts:186-190`: *"resolving the facade via
SessionInputResolver.for(actx) lands the notice on that session's composer"*.

**So `input.for(scope).submit()` is callable by a third-party plugin.** `SessionInput` is exported
from the package's public type entry (`lib/types/client/index.d.ts:47`).

### 3.3 Door 2 (stronger): `inputActions` is a DECLARED STANDARD PROP on session-scope slots

`contract/slots.d.ts:423-430`:

```ts
interface SessionStandardProps {
    useConversation: UseConversation;
    useInput: SnapshotSelectorHook<InputState>;
    /** Stable public input actions for this Session. */
    inputActions: InputActions;
}
```

`InputActions` (`contract/input.d.ts:237-259`) ends with:

```ts
/** Enter submission (adjudication / claim transaction / default sink inside). */
submit(): void;                                        // line 258
```

And `renderEntry` in the renderer spreads the standard kit straight into the component
(`node_modules/@deepseek-ai/dsh-client-ui-renderer/lib/client.js:792-798`):

```js
if (slotInjected.slotHookFactories === void 0) return jsx(Comp, {
    ...kit, ...injected, ...slotInjected.props, ...ownerProps
});
```

where `kit` comes from `standardKit` → `standardProps` → `materializeStandardBinding(binding,...)`
which copies `binding.props` (`client.js:667-677`). `SessionEntry` (`811-817`) uses
`standardKit(host, entry, "session", rootBinding, binding)`.

The shell publishes those props at `lib/client.js:19912-19928`:

```js
ctx.uiSession.provide({
    hooks: ["conversation", "input"],
    props: ["inputActions"],
    resolve: (binding) => { ... return { hooks: {...}, props: { inputActions: shell.actions } } }
});
```

and `shell.actions.submit` is (`14964-14966`):

```js
submit: () => {
    this.submit("queue");
}
```

**Our card's slot already qualifies**: `tool.call.toolview` is `scope: 'session'`
(`node_modules/@deepseek-ai/dsh-client-ui-tool/lib/types/client/contract/slots.d.ts:19-23`), and the
installed slot catalog lists `"inputActions: InputActions"` among its `standardProps`
(`tmp/dsh-host-src/.../dsh-cordis-client-runner/lib/client.js:6825-6843`). Our component
`src/client/VisualizeCard.tsx:580` receives `ToolCallViewProps` and simply does not destructure it.

> **So the capability is one property access away, already in scope on the running card.**
> `function VisualizeCard({ ..., inputActions }: ToolCallViewProps)` → `inputActions.submit()`.
> It works from a session-scope registration, needs no `sessions` lookup and no scope juggling, and
> does not touch the DOM. Nothing was hidden; this repo simply never looked.

---

## 4. Path C — node-side: `ctx.agents.get(id).followup(msg)` (REAL, but bypasses the client)

`tmp/dsh-host-src/agent-index.js:331-332` registers the `agents` service; `agents.get(id)` is at
line 596. The agent object has (`tmp/dsh-host-src/agent-loop.js:800-814`):

```js
send(message, target, wakeup) { ... this.inbox.splice(resolvedTarget, Infinity, 0, [message]); ... }
followup(input) { this.send(input, "next-turn", true); }
steer(input)    { this.send(input, "next-step", true); }
inject(input)   { this.send(input, "next-step", false); }
```

This repo **already uses the sibling primitive** `agent.steer` in
`src/self-repair.ts:402-418`. The node half could therefore queue a message with no client at all.

**But it is strictly worse, and I recommend against it** — see §6.

---

## 5. Role escalation: structurally impossible (VERIFIED, and stronger than ADR-015 assumed)

The full path, quoted end to end:

**a) Node entry** — `dsh-api-session-controller/lib/index.js:3218-3231`:

```js
async prompt(request, signal) {
    signal.throwIfAborted();
    if (!hasPromptContent(request.content)) throw new RemoteError("gateway/bad-request", ...);
    ...
    const principal = principalOf(this.ctx.invocation);
    const source = {
        kind: "user",
        rpcId: request.requestId,
        ...(clientTimeZone === void 0 ? {} : { clientTimeZone }),
        ...(principal === void 0 ? {} : { principal })
    };
    return this.commands.prompt(request, source);
}
```

**b) Admission** — `index.js:925-951` (`commands.prompt`):

```js
const message = createUserMessage({ content: ..., source });
...
if (request.mode === "steer") agent.steer(message);
else agent.followup(message);
```

`source` is **built by the host**, from `request.requestId` and the caller's principal. It is not
derived from anything the caller supplies — the wire `PromptRequest` has no `source`/`role` field at
all. `createUserMessage` fixes `role: 'user'`.

**c) Vocabulary** — `dsh-llm MessageSourceMap` (extracted declaration,
`dsh-llm/lib/typert.host.js:476`):

```
user: { kind: 'user' }
'user-rpc': { kind: 'user'; rpcId: SessionRequestId; clientTimeZone?; principal? }
```

`'user-rpc' IS `kind: 'user'`. And `dsh-llm/lib/types/message.d.ts:95-100` states the rule:

> Where a message (or injected content) came from... Merge-extensible sum type — each producer
> declares its own `kind` in its own module; **there is no shared catch-all `plugin` kind.**

**d) `system`/`developer` are separate, gated paths.** `system/message` and `developer/message` are
distinct `SessionEventMap` members (`dsh-session/lib/types/types.d.ts:297-320`) with their own
validators (`dsh-session/lib/types/surface.d.ts:90-96`: *"Reject noncanonical request-header fields,
**developer roles/content**, and contradictory tool failure metadata"*). No `prompt`-shaped wire type
produces either.

> **ADR-015 §5 property "Role is not an argument" is satisfied by the HOST, structurally — not by
> plugin discipline.** That is a stronger result than the ADR assumed, and it is the single most
> important correction this investigation makes.

---

## 6. What is still NOT satisfied — the honest gap list

### 6.1 Attribution is a REAL, UNFILLED gap (ADR-015 §5 "Attribution is visible")

ADR-015 §5 requires: *"The delivered turn says it came from a card, with the card's path. A later
reader must be able to tell it was not typed."*

**No host capability delivers this.** The only distinguishing field is `rpcId` (+ optional
`principal`), and the transcript **does not render it**. Verified in
`dsh-client-ui-chat/lib/client.js`:

- `2722-2737` `observedInputs`: reads `source.kind === "user" && "rpcId" in source` and only adds the
  id to a `Set` used to **suppress duplicate optimistic echoes**.
- `2826-2841` `pendingInputs`: same — `rpcId` maps an inbox item to a local submission echo.
- `2846-2847`: `steeringId` — again identity, not presentation.

A `grep` for `user-rpc` across `dsh-client-ui-chat` and `dsh-client-ui-conversation` returns **zero**
rendering hits. There is no attribution slot, no card-source concept, no "from a card" label.

**Consequence:** a turn submitted through Path A or B appears in the transcript **exactly** as if the
user had typed it. ADR-015's attribution requirement **cannot be met** with the current host API.
A plugin can *add* attribution only by putting it in the message text itself (e.g. a visible
"_(from card …)_" prefix) — which is honest but is the card decorating its own content, not host
attribution.

### 6.2 Host-rendered confirmation is NOT available to a plugin

ADR-015 §5: *"Host-rendered — The card must not be able to draw the confirmation itself. A card that
could fake the prompt could fake the consent."*

There **is** a host-styled confirmation surface — `dsh-client-ui-approval` renders a composer
takeover (`lib/client.js:344-354`, a `conversation.composer` chain entry selecting a
`PendingApproval`). But it is driven by the **host approval waterfall**, not by plugins:

```
dsh-client-ui-approval/lib/client.js:355-357
ctx.remote.$on("approval/request", function (request, next) {
    return answerApproval(ctx, this, request, next, registerPendingInteraction);
});
```

and `dsh-user-approval`'s README states plainly: *"The service itself never prompts a human"* and
*"No built-in answerer"* — answerers are `approval/request` **waterfall listeners**, composed by the
deployment, and the request is only valid inside an open turn. `dsh-user-approval/lib/types/index.js:
121-127` — `request()` **throws outside an open turn** (idle or between-turn callers throw before
auditing anything).

**So a plugin cannot open a host-styled consent dialog.** It can only:
- draw its own confirmation in the card (forbidden by ADR-015 §5), or
- render its own dialog into a session-scope slot using host primitives — which is *styled* like the
  host but is still the card's own surface, so it does not satisfy "host-rendered" in the sense the
  ADR means (consent the card cannot fake).

`dsh-user-questions` (`ctx.userQuestions.ask`) is likewise a **tool-side** service: *"Use
ctx.userQuestions when a tool or permission flow needs a structured answer"* — it is driven from a
tool call, has a `ToolCallId`-shaped lifecycle, and the shipped Web answerer routes *"only when the
request carries a live Agent scope"*. It is not a general plugin UI primitive.

### 6.3 Re-entrancy: readable, but the useful guard is NOT `phase`

Question (c) — what can a plugin read to stop a loop? Three candidate signals, costed:

| Signal | Source | Cost / reliability |
|---|---|---|
| `InputState.phase` | `inputActions`→`useInput` / `input.state.getSnapshot().phase` | **Weak.** `phase` is `'plain'\|`'adjudicating'\|`'claimed'\|`'submitting'` (`contract/input.d.ts:276`). A plain send goes `plain → plain` *immediately*: `beginDetached` sets `this.phase = "plain"` (`client.js:5149-5155`) and the machine's `onEnter` default branch returns detached effects without ever entering `submitting` (`5168-5191`). So `phase` reads `plain` while a send is in flight. **Do not use it as the in-flight guard.** |
| `SessionSnapshot.running` + `pendingSubmissions` | session standard props `useSession` | **Good.** `SessionSnapshot` (declared `dsh-cordis-client-runner/lib/client.js:2210`) carries `running: boolean` and `pendingSubmissions: readonly PendingSubmission[]`. `beginSubmission` appends an echo **synchronously, before the first await** (`session.js:148-163`, comment: *"Synchronous through markDirty: the echo is in the very next snapshot"*). So a card can see its own in-flight send in the next snapshot. |
| `InputState.queue` | `input.state.getSnapshot().queue` (`contract/input.d.ts:287`) | **Also good**, overlaid from the Agent Inbox next-turn list (`facade.d.ts:38-39`), i.e. messages that will get their own turn. |

**Recommended guard:** check `session.pendingSubmissions`/`running` (from `useSession`) **and** keep a
local per-card in-flight latch + budget. Do not rely on `phase`. This matches ADR-015 §5's "One in
flight" and "Per-card budget", both of which must be plugin-implemented — the host enforces neither.

### 6.4 Path A/B failure visibility — YES, it fails visibly (question b)

- `conversation.send` throws on any non-ok result (`client.js:4669`), and `scopedSession` throws when
  the session has no retained binding (`4952`: `session "${id}" resolved no binding`) or when called
  from a root ctx (`4958`). `sessions.scope(id)` returns `undefined` once `retireScope` has dropped
  the record (`service.js:459-469`, `this.scopes.delete(id)`), so a disposed/closed session yields a
  `TypeError`-free, catchable `undefined` → plugin shows its own generic failure. Good.
- On the node side, `resolveAgent` folds failures into stable `RemoteError` codes — `session/not-found`,
  `session/writer-held`, `session/agent-busy` (`dsh-api-session-controller/lib/index.js:221-243`), and
  the client mirrors them into `SessionSnapshot.promptError` (`sessions/session.js:215-220`).
  `session.prompt` rejection sets `promptError` and returns `{ok:false}`.
- Archived sessions: `ArchivedSessionGate` (`lib/types/archived-session-gate.js:17-25`) rejects at
  `agent/pre-step` — so the *prompt is accepted* but the turn ends `blocked` with no request. That is
  a **silent-looking success at send time**, and it is the one place a card's optimistic UI could lie.

### 6.5 Path C (node-side) is worse — do not use it

`agents.get(id).followup(msg)` would:
- **bypass every client-side guard** — no `inputActions`, no composer, no adjudication, no
  `promptError`; the plugin must re-implement all of ADR-015 §5 in the node half;
- **bypass the user's own turn boundary** — `followup` splices directly into the inbox
  (`agent-loop.js:800-808`), which is exactly the "message the host did not mediate" failure mode
  ADR-015 §5 warns about, in a new disguise;
- **lose the audit trail** that `user-rpc` gives (the client path at least records `rpcId` +
  `principal`; a raw `followup` records whatever source the plugin forges — this repo's own
  `self-repair.ts:371-378` shows a plugin can forge `source.kind`);
- put the plugin in the position of *being* the submitter rather than asking the host to submit.

**Verdict on (d): the node path is strictly worse for attribution and strictly larger in blast
radius. Reject it.**

---

## 7. Verdict

**EXTENDABLE — not DIRECTLY IMPLEMENTABLE, and no longer INFEASIBLE.**

ADR-015's *blanket* premise ("no session-write or turn-submit API on the host surface this plugin is
given", §1; ADR-4B §2 row 3) is **false against the installed 0.2.1-rc.5**. What actually exists:

| Capability | State (ADR-4B §2 taxonomy) | Evidence |
|---|---|---|
| Submit a turn as **the user's own turn**, role not an argument | **Available and authorised** | §5 above; `index.js:3218-3231`, `925-951` |
| Reachable from a third-party client plugin | **Available** — two independent doors | §3.2 (`conversation.input.for(scope).submit()`) and §3.3 (`inputActions` standard prop) |
| Reachable from the node half | **Available** | §4 (`agents.get(id).followup`) |
| **Host-mediated attribution ("from this card")** | **NOT AVAILABLE** | §6.1 — `rpcId` is dedupe-only, never rendered |
| **Host-rendered confirmation a card cannot fake** | **NOT AVAILABLE** | §6.2 — approval waterfall is deployment-composed; `request()` throws outside an open turn |
| Re-entrancy guard provided by the host | **NOT AVAILABLE** | §6.3 — `phase` is useless for a plain send; budget/in-flight must be plugin-owned |

**Recommendation:** re-open ADR-015. Do **not** ship `@ToAssistant` yet — but amend the *reason*.
The blocker is no longer "the host cannot submit". It is a **narrower, actionable** pair:

1. **Attribution** — the host has no card-attribution concept. Either
   (a) accept in-message attribution (card writes a visible provenance line into the text, so what
   the user approves is byte-for-byte what is sent and the transcript carries the mark), or
   (b) track an upstream request for a `source.kind = 'card'`/`interaction` message source + transcript
   rendering, which is the clean fix.
2. **Confirmation** — "host-rendered, card cannot fake" is **not achievable today**. The honest
   options are (i) keep the confirmation in the card and *downgrade* that ADR property to
   "card-rendered, host-styled, with the exact bytes shown", accepting that a compromised card could
   fake it — which is a genuine weakening and needs an explicit decision — or (ii) wait for a
   plugin-callable host consent surface.

Constraints that **do** hold and can be relied on without any plugin discipline:
- the delivered message is a user turn, always (§5);
- `system`/`developer` are unreachable from any submit path (§5);
- the message is durable and visible to the model as an ordinary request (§6.1 — a *defect* for
  attribution, a *guarantee* for role).

---

## 8. Answers to the lead's specific questions

**(a) Is `conversation.send()` reachable in practice from THIS plugin's `dsh.client` bundle? Any gate?**
**Yes. No gate.** `@deepseek-ai/cordis` and `@deepseek-ai/dsh-client-ui-slots` are already
`CLIENT_EXTERNALS` (platform module table) in `tsdown.config.ts:27-37`, so the client bundle can
`require` the cordis runtime and reach services on the root ctx. `ctx.get('sessions')` is
feature-detected unsafely-tolerant code we already ship (`prompt-bridge.ts:125`). There is **no
typert/Remote authorization check on the client side** — typert access control applies to *Remote
endpoints* (`dsh-typert-protocol` README: *"Peer principals"*, and
`dsh-api-session-controller` README: *"Every Remote endpoint is access-controlled: a Peer whose
principal is not the owner…"*). In-process client services are not Remote endpoints. The bundle is
the host's own trust domain — which is itself worth stating in the ADR.

**(b) Does `send()` throw visibly?** Yes — §6.4. Root/scoped both throw catchable `Error`s;
`promptError` is mirrored into the session snapshot; the one soft spot is an **archived** session,
where the prompt is accepted and the turn later ends `blocked` (§6.4, `archived-session-gate.js:17-25`).

**(c) Loop control** — §6.3. Use `useSession().running`/`pendingSubmissions` (synchronous echo before
first await) **plus** a local latch and budget. **Do not use `InputState.phase`** — a plain send
leaves it `'plain'` the whole time.

**(d) Node-side alternative** — §6.5. Exists (`agents.get(id).followup`), and this repo already uses
the sibling `steer` in `src/self-repair.ts:402-418`. **Worse**, not better: bypasses mediation,
bypasses `rpcId`/`principal`, forces the plugin to forge a source, and inverts who is submitting.

**(e) Verdict: EXTENDABLE.** Blockers narrowed to attribution + confirmation (§7).

---

## 9. What this investigation did NOT do

- No product code edited, no test added, no card behaviour changed.
- No runtime probe was executed in this session against the live page; every claim above is a
  **source** claim with file:line. `ctx.get()` caller-scoping is proven by reading
  `cordis/lib/index.js:84-90,123-158,763-765`; the lead has separately measured it
  (`tmp/probes/cordis-scope-probe2.mjs`). **The two doors in §3.2/§3.3 have not been exercised at
  runtime** — that is the next step if the ADR re-opens.
- `INPUT`/`INPUTACTIONS` were confirmed present on the *declared* props and in the installed slot
  catalog, and the renderer path that spreads them was read (`renderer/lib/client.js:792-798,
  811-817`); the runtime value was not observed in a live card.

## 10. Next step if ADR-015 re-opens

One honest runtime probe, no product change: from a card's click handler, read
`inputActions` (already a prop) and log `typeof inputActions.submit` plus
`session.pendingSubmissions.length` before/after a `submit()` on a scratch session. That converts
§3.3 from "source-verified" to "verified" per AGENTS.md §5.
