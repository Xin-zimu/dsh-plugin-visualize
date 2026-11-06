# Stage 7A — what identity a card can trust, and whether a message can say "from a card"

Date: 2026-11-07 · author: `attribution-investigator` (read-only source investigation)
Scope: DSH host **0.2.2-rc.1 only**, plus the visualization plugin's own source for the
data-flow question. No runtime, no browser, no network, no host execution.
Output file: this file (the only thing written).

Citation prefixes used below:

- `$HOST/…` = `tmp/dsh-host-0.2.2-rc.1/dsh/node_modules/@deepseek-ai/…` — the
  integrity-verified 0.2.2-rc.1 extraction. **Every host line number in this file is
  from this tree.** Provenance: `evidence/stage-7a/host-provenance.md`.
- `$RC5/…` = `node_modules/@deepseek-ai/…` — the plugin's devDependency **0.2.1-rc.5**
  type declarations. Used only where 0.2.2-rc.1 ships no `.d.ts`; every such use is
  marked **[version-skewed]**.
- `src/…` = this repository's plugin source (the code whose design question this is).

Grades: **Read** = source read at the cited file:line. **Type** = type/declaration only,
no implementation. **Ran** = a command executed (command and result shown). No behaviour
in this file was executed; nothing here is "verified" in the AGENTS.md sense.

---

## 0. Verdict (the short version)

1. **A card's two anchoring ids both come from the host, not from the frame:**
   `sessionId` (session-scope standard prop) and the tool `callId` (owner prop, stable
   across every tool stage). A turn number is *not* a direct key on the settled (`result`)
   toolview props — it lives inside `block` only for preparing/start stages, and on the
   durable events and the `conversation.chat.turnTail` owner props. `[Read]`
2. **Frame content cannot forge any identity.** The frame is a sandboxed, opaque-origin
   iframe; every accepted message type (`height`, `prompt`, `state`) carries only a
   correlation token, and the parent checks `event.source === frame.contentWindow` plus a
   token it chose. Identity is attached parent-side from slot props (`sessionId` from
   `inject`, `callId` from owner props). `[Read]`
3. **Card attribution on a submitted message is not renderable today.** A browser
   submission is always recorded by the host as `source.kind: 'user'` (plus a client-minted
   `rpcId`, a validated `clientTimeZone`, and a gateway-derived `principal`), and the
   transcript renders a `'user'` message as a plain user bubble with no attribution. The
   client cannot choose the source kind, and the prompt Remote has no field for it.
   `[Read]`
4. The only shipped card-like attribution machinery is `dsh-action-cards` — and it is an
   **injected context notice** (`source.kind: 'action-cards'`, `form: 'notice'`, rendered
   as a context row labelled `action-cards`), not attribution on the user's own message.
   `[Read]` / `[Type]`
5. **No host change is required for trustworthy identity.** A host change *is* required if
   the product needs "this user message was sent from card X" rendered on the message. A
   plugin-only fallback (a separate, plugin-rendered notice row) exists but is not the same
   UX. §6.

---

## 1. Q1 — what identity a card in `tool.call.toolview` receives

### 1.1 The slot contract in 0.2.2-rc.1

The generated slot catalogue shipped in `dsh-cordis-client-runner` is the only readable
statement of the 0.2.2-rc.1 slot contract (the package's `.d.ts` are not shipped).

- `$HOST/dsh-cordis-client-runner/lib/client.js:7352-7463` — `tool.call.toolview`:
  `kind: 'keyed'`, **`scope: 'session'`** (7354), required `key` = tool wire name
  (7357-7362), owner props `ToolCallCommonProps` + `ToolCallPhaseProps` (7363-7366),
  standard props list (7376-7396).
- `$HOST/dsh-cordis-client-runner/lib/client.js:7376-7396` — session standard props
  advertised for this slot: `useRemoteAccess`, `useResource`, `useContextMenu`,
  `useWorkspaces`, `usePanelInfo`, `useSessions`, `useSessionStatus`,
  `useSessionRetainInfo`, `useSessionAccess`, `useWorkspaceAccess`, `useChat`,
  `useConversation`, `useInput`, **`inputActions`**, `useSession`, **`sessionId`**,
  `useProjection`, `useAccess`, `useTrajectory`.
- Owner props text: `callId` "Call identity, stable across all stages"; `toolName`;
  `cwd`; `home`; `openFile`; `loadImage`; `useDisclosure`; `inspect`; and the stage union
  `preparing | start | result` with the matching `block` (7363-7366).

### 1.2 Where those props are actually produced (runtime, 0.2.2-rc.1)

Owner props (the card's business currency):

- `$HOST/dsh-client-ui-tool/lib/client.js:1984-2017` — `ToolCall` builds
  `owner = { callId, toolName, ...call, openFile, cwd, home, loadImage, useDisclosure, inspect }`
  (1985-1996) and renders
  `renderSlot('tool.call.toolview', owner, { entryKey: toolName, fallback })` (2013-2016).
  The same call row also stamps `data-chat-anchor-key="call:<callId>"` and
  `data-chat-call-id=<callId>` on its container (2011-2012) — those are DOM anchors, not
  additional identity.
- **No `sessionId` and no turn are placed into this owner object by the tool layer.**

Standard session props (merged on top of owner props):

- `$HOST/dsh-client-ui-session/lib/client.js:755-764` — `BUILTIN_SOURCE` for the session
  scope: `hooks: ['session']`, `keyedHooks: ['projection']`, **`props: ['sessionId']`**, and
  `resolve: … props: { sessionId: binding.sessionId }`.
- `$HOST/dsh-client-ui-session/lib/client.js:1130` — `ctx.slots.installScope('session',
  service.adapter)` installs that binding source.
- `$HOST/dsh-client-ui-conversation/lib/client.js:22775-22790` — the conversation adapter's
  `ctx.uiSession.provide(...)`: `hooks: ['conversation','input']`,
  **`props: ['inputActions']`**, resolved from `shell.actions` per session binding.
- `$HOST/dsh-client-ui-renderer/lib/client.js:663-702` — `standardProps(scope, rootBinding,
  scopeBinding)` materialises root + scope frames; session frame props include `sessionId`
  from the source above.
- `$HOST/dsh-client-ui-renderer/lib/client.js:736-767, 784-791` — `standardKit` + prop
  precedence: `kit` → entry `inject` → slot inject → **owner props last** (owner wins,
  line 789).
- `$HOST/dsh-client-ui-renderer/lib/client.js:507-518` (with `425-441`) — entry `inject`
  results are memoised **per (entry × scope binding)**; `runInject` passes
  `binding.key` (the session id) as the first inject argument (435-441). A session switch
  produces a new binding object, hence a fresh `inject(sessionId)`.

**Consequence for this plugin:** `src/client/index.tsx:80-87, 94-101` registers the two
toolviews with `inject: (sessionId: unknown) => sessionInjection(promptSinkFor(ctx,
sessionId), sessionId)`, and `src/client/VisualizeCard.tsx:632-636` turns that into the
`visualizeSession` prop. That is the same mechanism the shipped `dsh-client-ui-action-cards`
uses (`$HOST/dsh-client-ui-action-cards/lib/client.js:859-872` for the turn tail,
`:873-877` for its `propose_action` row).

### 1.3 The settled tool block has no turn — precise shape

The plugin compiles against the 0.2.1-rc.5 declarations; 0.2.2-rc.1 ships no `.d.ts`
(`Ran`: recursive search for `*.d.ts` under the extracted `@deepseek-ai` tree → **0**).

- `[version-skewed]` `$RC5/dsh-client-ui-conversation/lib/types/client/contract/records.d.ts:257-295`
  — `ToolCallHead` carries `callId` (259), `parentCallId?` (261), `name` (262),
  **`turn` (263), `step` (264)**, `time` (265), `subCalls` (268), `args` (270);
  `PreparingToolCall` (284), `StartedToolCall` (288).
- `[version-skewed]` `$RC5/dsh-client-ui-conversation/lib/types/client/contract/records.d.ts:157-186`
  — `ToolResultNode` has `kind/seq/time/callId/parentCallId?/name/args/call/callTime/
  content/isError/error/meta/subCalls` and **no `turn`, no `step`**.
- Confirmed independently in the 0.2.2-rc.1 implementation: the settled node is built in
  `$HOST/dsh-client-ui-chat/lib/client.js:12295-12316` (`rootResult`) with no `turn`;
  preparing/start nodes do carry them (`12278-12279`, `12325-12326`). `[Read]`
- The turn is available on the **turn-tail** owner props instead:
  `$HOST/dsh-cordis-client-runner/lib/client.js:3065-3091` — `turn: TurnLocation`,
  `seq: number`, `openFile`; turn is a plain integer
  `[version-skewed]` `$RC5/dsh-client-ui-conversation/lib/types/client/contract/conversation.d.ts:86-95`
  (with `StepLocation.turn/step` at `:76-85`). No branded `TurnId` exists in either tree.
- The durable turn is on the events: `tool/call` / `tool/result` event data carry `turn`
  (`$HOST/dsh-action-cards/lib/types/projection.js:18,88` reads `event.data.turn` for a
  `tool/call`), and the plugin's own fold already relies on that
  (`src/client/TurnCards.tsx:125-143`: `tool/result` → `data.turn`,
  `MessageSource.callId`; `tool/call` → `data.turn`+`data.callId` for PTC attribution).
  `[Read]`

### 1.4 Trustworthy-identity table

Trusted = supplied by the host from its own context (slot binding / owner props / durable
event) and not settable by frame content. "Card path" is listed for completeness: it is
**not** host identity.

| Identity | Value for a card | Where it comes from | Frame-forgeable? | Grade |
| --- | --- | --- | --- | --- |
| `sessionId` | branded `SessionId` string | session-scope standard prop, `dsh-client-ui-session` `BUILTIN_SOURCE` (`$HOST/dsh-client-ui-session/lib/client.js:755-764`); catalogue `:7392`; also the `inject(sessionId)` arg (`dsh-client-ui-renderer/lib/client.js:435-441`) | **No** — frame messages carry no identity field | Read |
| tool `callId` | string, stable across preparing/start/result | owner prop from `ToolCall` (`$HOST/dsh-client-ui-tool/lib/client.js:1985-2013`); catalogue `:7364` | **No** | Read |
| `toolName` | wire tool name = keyed dispatch key | owner prop (`:1987`, `:2014`) | **No** | Read |
| tool `parentCallId` | parent call for PTC/nested dispatches | start/result blocks (`$HOST/dsh-client-ui-chat/lib/client.js:12321,12337`; rc.5 `records.d.ts:261`) | No | Read / Type |
| turn number | integer | **only** preparing/start blocks (`$HOST/dsh-client-ui-chat/lib/client.js:12278-12279`); turn-tail `TurnLocation.turn` (catalogue `:3091`); durable `tool/call`/`tool/result` `data.turn` | No | Read |
| step number | integer | preparing/start blocks (`:12242,12279`); not on result | No | Read |
| result `seq` | session sequence (monotonic per session) | settled result node (`$HOST/dsh-client-ui-chat/lib/client.js:12299-12300`) | No | Read |
| session lifecycle (`removed`, `openState`, `running`, `blank`, …) | snapshot | `useSession` standard hook; field list in catalogue `$HOST/dsh-cordis-client-runner/lib/client.js:2381-2382` | No | Read / Type |
| workspace / home / cwd | strings | owner props `cwd`, `home` (`$HOST/dsh-client-ui-tool/lib/client.js:1990-1991`); global `useWorkspaces` | No | Read |
| input actions (`setDraft`, `submit`, `insertQuote`, …) | stable object | `inputActions` standard prop; runtime object at `$HOST/dsh-client-ui-conversation/lib/client.js:15367-15395` (`submit()` at 15392-15394) | No | Read |
| **card path** | plugin-defined `meta.path` | **not host identity.** It is the plugin's persisted tool-result meta (`src/fragment.ts:51-61,334-388`; read back by `src/client/VisualizeCard.tsx:615`) . The host has no card-path concept at all. `[Read]` plugin, absence host | No | Read |
| card state key | `sessionId\|path` (or `call:` id) | chosen parent-side in `src/client/card-state.ts:71-73`; "the message never names one" `:23-27` | No | Read |

### 1.5 The old `SessionStandardProps` / `inputActions` contract: moved, not renamed

- **`dsh-client-ui-slots` is gone as a package in 0.2.2-rc.1**, but the contract was not
  deleted. Its `SlotCore` is compiled into the web shell bundle:
  `$HOST/dsh-web-frontend/dist/assets/index-BgUyXZcc.js` contains a loader builtin table
  `"@deepseek-ai/dsh-client-ui-slots": MI` (builtin table at line 196 of the asset), and
  `MI` exports `SlotCore, SlotOwnershipError, StaleAuthorizationError, resolveSlotLabel,
  standardHookPropName` (same asset, `const MI=Object.freeze(...)` line). `[Read]`
  `Ran`: `Select-String -Path tmp/.../asar-entries.txt -Pattern 'slots'` → **0 hits**;
  `Test-Path …/@deepseek-ai/dsh-client-ui-slots` → **False**; but
  `$HOST/dsh-client-ui-renderer/lib/client.js:11` still
  `require('@deepseek-ai/dsh-client-ui-slots')` and gets that shell builtin.
- `SessionStandardProps` in 0.2.2-rc.1 is the same **empty, merge-extensible base** it was
  in rc.5: catalogue declaration `$HOST/dsh-cordis-client-runner/lib/client.js:2385-2387`
  (`export interface SessionStandardProps {}`), with
  `ScopeStandardProps<S> = (S extends 'session' ? SessionStandardProps : …) & GlobalStandardProps`
  (`:2293-2294`). The concrete members are contributed per package (session id/session
  hook/projection by `ui-session`; conversation/input/inputActions by `ui-conversation`;
  `useChat` by `ui-chat`) and are *documented per slot* by the catalogue's `standardProps`
  arrays.
- **`inputActions` still exists and is still a session standard prop** — same name, same
  role, now supplied by `ctx.uiSession.provide` in `dsh-client-ui-conversation`
  (`$HOST/dsh-client-ui-conversation/lib/client.js:22775-22790`) rather than by a
  `ui-slots` package export. Its type declaration exists only in the older tree:
  `[version-skewed]` `$RC5/dsh-client-ui-conversation/lib/types/client/contract/input.d.ts:237-259`
  (`copy` of members: `captureInsertion`, `insertText`, `setDraft`, `persistDraft`,
  `addAttachments`, `removeAttachment`, `pruneAttachments`, `submit`).
- **What is version-skewed for this plugin's *typecheck***: `package.json` devDeps pin
  `dsh-client-ui-chat`/`dsh-client-ui-conversation`/`dsh-client-ui-tool`/`dsh-client-ui-slots`
  at **0.2.1-rc.5**; the package that declares `sessionId: SessionId` on
  `SessionStandardProps` (`dsh-client-ui-session`) is **not** a devDependency, so the
  plugin correctly types `inject` as `(sessionId: unknown)` and narrows at runtime. At
  runtime the value is the branded session id string. `[Read]` / `[Type]`

---

## 2. Q2 — the frame → host trust boundary

### 2.1 What the frame is

- `src/window-doc.ts:19-20` — `FRAME_SANDBOX = 'allow-scripts'`; an iframe with
  `sandbox="allow-scripts"` and no `allow-same-origin` is an **opaque origin**: it cannot
  read the host DOM, host `localStorage`, cookies, or call the plugin/host services.
  `src/client/VisualizeCard.tsx:3-5, 365-371` — the card renders the model-written fragment
  with `sandbox={FRAME_SANDBOX}`, `referrerPolicy="no-referrer"`, `srcDoc`.
- `src/shell.ts:35-48` — frame CSP: `default-src 'none'`, constrained script/style/img
  sources, `frame-src 'none'`, `object-src 'none'`, `base-uri 'none'`,
  `form-action 'none'`.
- The OpenUI backend is the opposite case by design: `src/backends/openui/evaluate.ts`
  evaluates a whitelist in the **host** document (no iframe), and its action dispatcher
  supports only `Set`, `Reset`, `Action`, `CopyToClipboard`, explicitly refusing
  `@OpenUrl` and `@ToAssistant` (`src/client/openui-actions.ts:67-80`). So the OpenUI card
  has no message-submission path at all in this build.

### 2.2 Every message the frame may send

| Message | Frame sends | Parent accepts only if | Payload identity fields | Grade |
| --- | --- | --- | --- | --- |
| height report | `{type, token, height}` | `event.source === frame.contentWindow`? — height handler checks token only (`src/client/VisualizeCard.tsx:349-360`); clamps to `HEIGHT_CAP` | none | Read |
| prompt request | `{type:'dsh-visualize:prompt', token, text}` (`src/viz-helper.ts:245-251`) | `event.source === frame.contentWindow` **and** token match **and** `readerIsInFrame` (focus + user activation) **and** rate limit (`src/client/VisualizeCard.tsx:315-331`); payload parsed by `readPromptMessage` → only `type/token/text`, length ≤2000, control chars stripped (`src/client/prompt-bridge.ts:25-72`) | none | Read |
| state snapshot | `{type:'dsh-visualize:state', token, state}` (`src/viz-helper.ts:253-266`) | `event.source === frame.contentWindow` + token (`VisualizeCard.tsx:292-304`); key chosen parent-side from props (`card-state.ts:71-73,112-…`) | none | Read |

- The token is the **host-chosen callId** (or `turn-tail:<callId>`, `thumb:<callId>`,
  `window:<callId>`, `streaming-preview`), embedded into the frame document
  (`src/shell.ts:76, 138-141, 145`; `src/client/VisualizeCard.tsx:134`). The plugin's own
  comments are explicit that the token is *not* a secret: "the token is readable by the
  fragment" (`src/client/prompt-bridge.ts:8-9`, `src/client/VisualizeCard.tsx:307-309`),
  so it is used only for correlation, never authentication.
- The frame is therefore **unable to name a session, turn or tool call**. It cannot either
  forge or suppress identity: identity never travels in the message. `[Read]`

### 2.3 Who supplies identity, and where the trust decision is

1. Slot renderer gives the card component `sessionId` (from the per-session binding) and
   `callId` (owner prop) — §1.2.
2. `src/client/index.tsx:62-65, 80-87` builds the prompt sink **per session id it was
   injected with** (`promptSinkFor(ctx, sessionId)`).
3. On a frame prompt, `src/client/prompt-bridge.ts:146-163` resolves the facade for that
   same captured session id on every call (`composerFor(host, sessionId)`, `:122-135`), and
   writes only a **draft** (`draftPrompt`, `:98-109`). Nothing is ever sent on the frame's
   behalf: the reader must press send.
4. If the reader then sends, the composer calls the host Remote `session.prompt`
   (`[version-skewed]` `$RC5/dsh-client-ui-conversation/lib/types/client/contract/input.d.ts:257-258`
   for `submit()`; runtime `$HOST/dsh-client-ui-conversation/lib/client.js:15392-15394`),
   and the host builds the message source itself — §3.2.

So the trust boundary is: **frame → draft/message text only; host → every identity field.**
For the state/height relays the "identity" is the save key/height cap, both parent-chosen.

### 2.4 Could a malicious fragment do anything identity-adjacent?

What the source shows: it can call `dshViz.prompt(text)` only while the frame holds focus
during a user activation (`readerIsInFrame`, `src/client/prompt-bridge.ts:84-88`), its
text is capped and stripped, and the result is a composer draft in *its own* session (the
session id captured by the card's registration, never one named by the message). It cannot
post into a sibling frame (child `postMessage` targets its parent window only), cannot
touch host storage, and cannot reach any plugin/host service because of the opaque origin
and CSP. `[Read]`

---

## 3. Q3 — can a submitted message carry a source kind / metadata that renders "from a card"?

### 3.1 The message source model in 0.2.2-rc.1

`MessageSourceMap` is the vocabulary. Full declaration (0.2.2-rc.1):
`$HOST/dsh-llm/lib/typert.host.js:495-496`:

```ts
user: { kind: 'user' }
model: ModelMessageSource
tool: ToolMessageSource
'system-prompt': SystemPromptMessageSource
'model-selection': { kind: 'model-selection' } & ContextFormed
'tool-registry': { kind: 'tool-registry' }
'action-cards': { kind: 'action-cards'; through: SessionSeq } & ContextFormed
'runtime-context': { kind: 'runtime-context' } & ContextFormed
'user-rpc': { kind: 'user'; rpcId: SessionRequestId; clientTimeZone?: string; principal?: Principal }
'working-directory': { kind: 'working-directory' }
'user-approval': { kind: 'user-approval' } & ContextFormed
'agent-message': AgentMessageSource
'subagent-settled': SubagentSettledMessageSource
'skill-invocation': SkillInvocationSource
'ptc-mode': { kind: 'ptc-mode' }
'compact-checkpoint': CompactionCheckpointSource
'cordis-host-runner': { kind: 'cordis-host-runner' }
'user-question-reply': { kind: 'user-question-reply'; callId: ToolCallId; outcome: 'answered' }
'team-message': TeamMessageSource
goal: GoalMessageSource
'plan-mode': { kind: 'plan-mode' } & ContextFormed
schedule: { kind: 'schedule' } & ContextFormed
'session-reference': SessionReferenceSource
webhook: { kind: 'webhook'; provider; source; deliveryId; ruleId; form: 'notice'; summary: string }
```

Related declarations in the same catalogue: `ContextFormed` `:327-328`
(`instructions | catalog | snapshot | notice+summary | relay | recall`, optional form);
`AgentMessageSource` = `{kind:'agent-message', form:'relay', senderSessionId}`;
`TeamMessageSource` = `{kind:'team-message', teamId, messageId, senderId, senderName}`;
`SubagentSettledMessageSource` = `{kind:'subagent-settled', form:'notice', summary,
senderSessionId}`; `WebhookSource` etc. `[Read]`

**There is no card/visualize/plugin-card source kind.** `[Read]` (full map above)

### 3.2 A browser submission is always `kind: 'user'` — the client cannot choose

- The prompt Remote's wire schema is the whole client's vocabulary:
  `$HOST/dsh-api-session-controller/lib/typert.host.js:1473-1491` (and the strict form at
  `1761-1779`): `requestId`, `sessionId`, `mode: 'queue'|'steer'`, `content`, optional
  `clientTimeZone`. **No source field, no turn, no call id, no principal.**
- The host constructs the source server-side:
  `$HOST/dsh-api-session-controller/lib/index.js:4048-4061`:

  ```ts
  const principal = principalOf(this.ctx.invocation);
  const source = { kind: 'user', rpcId: request.requestId,
                   ...(clientTimeZone ? { clientTimeZone } : {}),
                   ...(principal ? { principal } : {}) };
  return this.commands.prompt(request, source);
  ```

  `rpcId` is the client-minted `requestId` ("Client-minted identity persisted on the exact
  accepted user message"); `principal` comes from the **gateway invocation**, not the
  request body.
- Peer/principal provenance: `$HOST/dsh-client-connection/lib/index.js:646-684`
  ("Its creator fixes the principal it speaks for; Gateway hands it to each Remote call as
  `invocation.peer`"), browser connections share an authenticated owner peer
  `this.browserPeer = new Peer(ctx, { principal: { kind: 'owner' } })` (`:714`, admission
  `:742-750`); Gateway: "Every call names the Peer it speaks for … the Gateway never
  supplies a default Peer" (`$HOST/dsh-api-gateway/README.md:33`).
- `[version-skewed]` the design intent is stated verbatim in the 0.2.1-rc.5 type docs:
  "Merge-extensible sum type — each producer declares its own `kind` in its own module;
  there is no shared catch-all `plugin` kind. … user messages carry any producer's kind,
  and consumers fall through unknown kinds."
  (`$RC5/dsh-llm/lib/types/message.d.ts:95-108`). The 0.2.2-rc.1 catalogue carries the same
  shape with many more members (§3.1); 0.2.2-rc.1 has no `.d.ts`, so the runtime source
  construction is read from its implementation (`lib/index.js:4048-4061`).

### 3.3 What the transcript does with each source kind

Two renderers matter, and both act only on non-`'user'` sources:

- **Classification**: `$HOST/dsh-client-ui-chat/lib/client.js:11951-12005`
  (`messageDefinition`). `user/message` with `source.kind === 'user'` becomes a `user`
  bubble (or `steering` when claimed into a running step). Any other kind becomes a
  `context` node; a context message **claimed by the inbox as the message that woke the
  turn** becomes a `turn-trigger` node (`:11964-11972`, `:11997-12004`). `[Read]`
- **Context row renderer** (`$HOST/dsh-client-ui-chat/lib/client.js:5747-5809`,
  body switch `:5668-5713`): title is `message.contextInjection` (or
  `message.contextRecall` for the recall role); the *producer label* is
  `contextProducer(source)`; the expanded body is chosen by `source.form`
  (`instructions|catalog|snapshot|notice|relay|recall`, unknown → opaque JSON body).
  `contextProducer` (`:9831-9856`) maps `session-reference` → reference labels,
  `agent-instructions` → paths, `skill-invocation` → skill name, and **`default: {role:
  'inject', label: kind}`** — i.e. an unknown kind is rendered as its **raw kind string**.
  `[Read]`
- **Turn-trigger row** (`$HOST/dsh-client-ui-chat/lib/client.js:9077-9123`,
  `9162-9217`): a fixed `kind → title key + icon` switch:
  `goal | agent-message | team-message | subagent-settled | webhook | schedule |
  tool-jobs | cordis-host-runner`, default `message.trigger.request` (English strings
  `:6779-6789`: "Continuing goal", "Task message received", "Team message received",
  "Subtask status updated", "GitHub event received", "External event received",
  "Automation task", "Background task updated", **"Plugin status updated"**, "Execution
  requested"). Any unknown kind falls to "Execution requested". `[Read]`
- `relay` form (`:5561-5582`): renders "From session {senderSessionId}" — the only
  host-rendered *sender* label. `[Read]`
- `rpcId` / `principal` rendering: `Ran` — `Select-String -Pattern 'principal'` over
  `$HOST/dsh-client-ui-chat/lib/client.js` → **0** hits; over
  `$HOST/dsh-client-ui-conversation/lib/client.js` → **0** hits. `rpcId` appears in chat
  only for optimistic-echo dedupe (`:3438, :3579-3582`) and in conversation only for
  pending/queue dedupe (`:19631, :19634`). Neither is ever displayed. `[Read]` + `Ran`

### 3.4 The new packages, and whether they give attribution

**`dsh-action-cards` (host) / `dsh-client-ui-action-cards` (browser)** — a *different*
card mechanism from the visualize card, and the closest shipped precedent.

- Purpose: the model calls a shipped tool `propose_action` to offer one optional action
  under an answer; the card appears after the turn, nothing runs until the user acts; each
  decision is recorded and reported to the model on its next request
  (`$HOST/dsh-action-cards/README.md:12`).
- Card identity: `(callId, turn)` from the logged `propose_action` call plus successful
  result; projection at `$HOST/dsh-action-cards/lib/types/projection.js:10-47,53-121`
  (schema `callId` 17, `turn` 18; admits a call on successful `tool/result` at 90-105).
- The browser frame gets the **session id** and a bound `act(verb, payload?)` from its
  registration (`$HOST/dsh-client-ui-action-cards/lib/client.js:859-877`), and the act calls
  the Remote with `(sessionId, callId, verb, payload)` (`:863-870`). The host validates
  owner, live root and card before acting (`README.md:60`); the callId is a *locator
  validated against the log*, not a credential.
- Attribution it produces: a **status notice** — a host-injected `user/message` created at
  `agent/pre-step`: `$HOST/dsh-action-cards/lib/types/index.js:195-198`:

  ```ts
  messages: [...decision.messages, createUserMessage({
    source: { kind: 'action-cards', through: SessionSeq(...), form: 'notice',
              summary: 'Action card status updated' }, … })]
  ```

  In the transcript that is a **context row** titled by `message.contextInjection`, labelled
  `action-cards`, with the summary text — *not* a "sent from card X" mark on the user's own
  message and not a turn trigger. `[Read]` (`createUserMessage` accepts a caller-supplied
  source: `$HOST/dsh-llm/lib/index.js:54-64`.)
- `dsh-session` admits it: source validation requires only a non-empty `kind` for
  user-role messages (`$HOST/dsh-session/lib/types/index.js:246-298`; role-specific checks
  exist only for system/assistant/tool). So **plugin-defined source kinds are durable-log
  legal**; what is missing is a host path that writes the *user's submission* with one.
- The shipped replay/extension precedent for rendering such a message is
  `dsh-client-ui-user-questions`: it claims `user/message` with its own source kind
  (`user-question-reply`) through a Conversation Definition
  (`$HOST/dsh-client-ui-user-questions/lib/client.js:1551-1598`), emits a new view-node kind
  `question-reply` (`:1588`), and registers a keyed `conversation.chat.node` occupant for
  that kind (occupant list `$HOST/dsh-cordis-client-runner/lib/client.js:2975`). The
  plugin's browser half already registers Conversation Definitions the same way
  (`src/client/index.tsx:106-108, 115-119`; `src/client/TurnCards.tsx:167-201`).

**`dsh-message-quotes`** — *not* attribution. It is the "quote selected text" interaction:
a `conversation.chat.text-interaction` action whose click calls
`inputActions.insertQuote(text)` (`$HOST/dsh-message-quotes/lib/client.js:29-53, 181-185`),
a Markdown blockquote matcher/renderer (`:63-121, 186-190`), and a no-op host entry
(`$HOST/dsh-message-quotes/lib/index.js:1-6`). It never creates a message or a source kind.
`[Read]`

### 3.5 Direct answer

- **Can a submitted message carry a source kind the transcript renders as "from a card"?**
  Not through any client path in 0.2.2-rc.1. The source kind is fixed to `'user'` by the
  host prompt path (§3.2), and the transcript deliberately renders `'user'` as an
  unattributed bubble (`:11974-11992`; `UserMessageNodeView` `$HOST/dsh-client-ui-chat/lib/client.js:6268-6288`
  renders bubble + actions only).
- **Can it carry metadata?** Only `requestId(rpcId)`, `clientTimeZone`, validated content,
  and (for non-`'user'` injected messages created host-side) whatever `source` object the
  host code chooses. `principal` is gateway-derived, never client-set. None of it is
  rendered.
- **Is there a host-rendered "from a plugin" attribution at all?** Yes, one generic one:
  a turn-trigger row with title "Plugin status updated" for
  `source.kind === 'cordis-host-runner'` (`:9113-9116`), plus "Execution requested" for
  unknown kinds. A card cannot produce either kind, and neither names a card.

---

## 4. Q4 — staleness and replay: which identifiers change, and what a naive design gets wrong

### 4.1 The identifiers and their lifetimes

| Identifier | Stable across restart? | Session switch | Fork (child) | Archive / restore | Grade |
| --- | --- | --- | --- | --- | --- |
| `sessionId` | **yes** — durable header `id` (`$HOST/dsh-api-session-controller/lib/typert.host.js:3643-3644`: `SessionHeader {version, id, createdAt, cwd?, parentSession?, isSeeded, origin?…}`) | the card's bound value changes with the binding | **new id**; child inherits the event prefix, not the id (`$HOST/dsh-session/lib/types/fork.js:18-27`) | **unchanged** — archive is a workspace-registry flag, not identity (`$HOST/dsh-api-session-controller/lib/types/archived-session-gate.js:35-51`) | Read |
| tool `callId` | **yes** — persists in the log and is re-derived from `tool/result.message.source.callId` (`$HOST/dsh-client-ui-chat/lib/client.js:12302`) | unchanged | **unchanged** — fork copies the source event objects, so inherited calls keep callId (and seq) exactly (`fork.js:18-27`) | unchanged | Read |
| turn (integer) | yes, from the log; preparing/start blocks and `data.turn` | n/a | **inherited-turn events keep their `turn` numbers** (events copied verbatim) | unchanged | Read |
| `seq` | yes, monotonic per session | n/a | inherited prefix keeps the same seq values as the parent (`fork.js:18-19`) — so `(sessionId, seq)` is unique, `seq` alone is not | unchanged | Read |
| `removed` (session snapshot) | a fresh resident instance defaults to `false` (`$HOST/dsh-api-session-controller/lib/client.js:2217`) | per session | — | `removed` is set on `session/disposed` → `api-session/removed` (`$HOST/dsh-api-session-controller/lib/index.js:3828-3830`; client `handleRemoved` `$HOST/dsh-api-session-controller/lib/client.js:2647-2650`), **not** on archive | Read / Type |
| turn data fold (`TurnCards` location data) | rebuilt from replayed events; the module-level `enclosingTurns` map (`src/client/TurnCards.tsx:95`) is in-memory and repopulated only from the loaded window | — | inherited prefix replayed again | — | Read |

Not in the identity model at all: a persisted SessionSnapshot has no `archived` field
(`$HOST/dsh-cordis-client-runner/lib/client.js:2381-2382`); archive state lives in the
workspace registry and is enforced by refusing model steps for archived lineage
(`archived-session-gate.js:17-25`). The client package that exposes archive to the sidebar
(`dsh-client-ui-workspace`) is **not** part of the extracted subset, so this stage cannot
cite how (or whether) an ordinary card can observe archivedness. `[Read]` + limitation.

### 4.2 What a naive implementation gets wrong

1. **Reading `block.turn` on a settled card.** `turn` exists only on preparing/start
   blocks; the settled `ToolResultNode` has no turn (§1.3). A card that renders from the
   result meta and reads `block.turn` gets `undefined`, so any turn-keyed lookup (or a
   `turn === 0` comparison) mis-attributes every finished card. Correct source: the durable
   `tool/result`/`tool/call` event (`data.turn`) or the turn-tail `TurnLocation`.
2. **Treating `callId` as global.** It is only a branded string
   (`$HOST/dsh-llm/lib/typert.host.js:643-644`); uniqueness is per session by contract,
   and **fork copies callIds into a different session**. Any module-level map keyed by
   callId alone (the plugin's own `enclosingTurns` is exactly that, `TurnCards.tsx:95`)
   collides when a fork and its parent are both opened. It also breaks after a partial
   history load where the enclosing `tool/call` is outside the loaded window.
3. **Keying saved state by callId only (or by path only).** The plugin's chosen key is
   `sessionId|path` (falling back to `call:callId`) `src/client/card-state.ts:71-73`.
   Path-only leaks state across sessions; callId-only loses state across an `update` patch
   (same path, new call); a React key/index resets it on every remount.
4. **Assuming one mount per card.** A card can be mounted twice at once: the toolview frame
   (token = bare `callId`) and the turn-tail frame (token = `turn-tail:<callId>`)
   (`src/client/TurnCards.tsx:263-273`; thumbnail `thumb:<callId>`, window `window:<callId>`
   `VisualizeCard.tsx:134, 507`). Height/state relays are kept apart by the token and by
   the shared *state* key; a naive single token or two different state keys would either
   cross-talk or duplicate state.
5. **Deriving identity from the frame.** Covered by §2; any design that lets
   `dshViz.prompt` carry a session/turn/call field would be forging host identity from
   model-written script. The current accepted payloads have no such field.
6. **Caching `sessionId` in a singleton.** The host's `inject` is memoised per
   (entry × binding) (`$HOST/dsh-client-ui-renderer/lib/client.js:507-518`), so the value is
   correct per session — but a plugin that captures the first `sessionId` into module scope
   (or into a module-level `Map` without a session key, cf. `cardDrafts` in
   `src/client/prompt-bridge.ts:169` which *is* keyed by sessionId, and `enclosingTurns`
   which is not) leaks across a session switch.
7. **Confusing archive with removal.** Archive leaves the session id, log and cards intact
   and opens cold; `removed` means the session was disposed (`api-session/removed`). A card
   that treats "archived" as "deleted" would hide a still-readable card; a card that treats
   it as "live" would offer promptable controls whose step is then rejected by the host
   gate (`archived-session-gate.js:21-24`).
8. **Reopen after restart.** All host ids come back from the log/header; localStorage state
   (`dsh-visualize:state:` prefix, `card-state.ts:38,71-73`) comes back only for the same
   browser profile + origin; another profile/device starts clean (`card-state.ts:7-13`).
   The only per-page mutable registry that must be rebuilt is the PTC enclosing-turn map,
   and it can only be rebuilt from the events that happen to be loaded.

---

## 5. Evidence, grades and searches

### 5.1 Principal readings (all 0.2.2-rc.1 unless marked)

| Claim | Evidence | Grade |
| --- | --- | --- |
| Slot spec and standard props for `tool.call.toolview` | `$HOST/dsh-cordis-client-runner/lib/client.js:7352-7463` | Read |
| Owner object has no direct sessionId/turn key; turn is reachable via `block` (start/preparing only) | `$HOST/dsh-client-ui-tool/lib/client.js:1984-2016` | Read |
| `sessionId` standard prop source | `$HOST/dsh-client-ui-session/lib/client.js:755-764, 1130` | Read |
| `inputActions` standard prop source | `$HOST/dsh-client-ui-conversation/lib/client.js:22775-22790, 15367-15395` | Read |
| Standard-prop merge and owner-wins precedence | `$HOST/dsh-client-ui-renderer/lib/client.js:663-702, 736-767, 784-791` | Read |
| inject cached per (entry × session binding) | `$HOST/dsh-client-ui-renderer/lib/client.js:425-441, 507-518` | Read |
| Settled result block has no turn | `$HOST/dsh-client-ui-chat/lib/client.js:12295-12316` vs `12278-12279` | Read |
| Turn-tail owner props carry `turn` | `$HOST/dsh-cordis-client-runner/lib/client.js:3065-3091` | Read |
| Turn is a plain integer, no TurnId | `$RC5/dsh-client-ui-conversation/lib/types/client/contract/conversation.d.ts:76-95` **[version-skewed]** | Type |
| Message source vocabulary | `$HOST/dsh-llm/lib/typert.host.js:495-496` (+ `:327-328` ContextFormed) | Read |
| Prompt request has no source field | `$HOST/dsh-api-session-controller/lib/typert.host.js:1473-1491, 1761-1779` | Read |
| Host builds `kind:'user'` source, gateway principal | `$HOST/dsh-api-session-controller/lib/index.js:4048-4061` | Read |
| Peer principal fixed at admission; owner browser peer | `$HOST/dsh-client-connection/lib/index.js:646-684, 742-750` | Read |
| User bubble renders no attribution | `$HOST/dsh-client-ui-chat/lib/client.js:6268-6288, 11974-11992` | Read |
| Context rows label by raw kind; forms | `$HOST/dsh-client-ui-chat/lib/client.js:5561-5582, 5668-5713, 5747-5809, 9831-9856` | Read |
| Turn-trigger kind→label table, no card kind | `$HOST/dsh-client-ui-chat/lib/client.js:9077-9123, 9162-9217, 6779-6789` | Read |
| Action-cards notice source and shape | `$HOST/dsh-action-cards/lib/types/index.js:195-198`; `README.md:12,60` | Read |
| action-cards card identity `(callId,turn)` | `$HOST/dsh-action-cards/lib/types/projection.js:10-47, 53-121` | Read |
| action-cards browser registration/act | `$HOST/dsh-client-ui-action-cards/lib/client.js:859-877` | Read |
| Message-quotes = composer quote, no message/source | `$HOST/dsh-message-quotes/lib/client.js:29-53, 63-121, 181-190`; `lib/index.js:1-6` | Read |
| user-question-reply is a package-owned source kind + own node renderer | `$HOST/dsh-client-ui-user-questions/lib/client.js:1551-1598` | Read |
| Durable log admits arbitrary non-empty source kind for user messages | `$HOST/dsh-session/lib/types/index.js:246-298` | Read |
| `createUserMessage` takes caller-supplied source | `$HOST/dsh-llm/lib/index.js:54-64` | Read |
| Fork copies events (same callId/turn/seq), new session id | `$HOST/dsh-session/lib/types/fork.js:18-27`; `SessionHeader` `$HOST/dsh-api-session-controller/lib/typert.host.js:3643-3644` | Read |
| Archive is a workspace flag, not snapshot identity | `$HOST/dsh-api-session-controller/lib/types/archived-session-gate.js:17-51`; snapshot fields catalogue `:2381-2382`; removal relay `lib/index.js:3828-3830` | Read |
| Frame sandbox / CSP / relay gating | `src/window-doc.ts:19-20`; `src/shell.ts:35-48`; `src/client/VisualizeCard.tsx:292-360`; `src/client/prompt-bridge.ts:62-109, 146-163`; `src/client/card-state.ts:23-27, 71-73, 112-150` | Read |
| OpenUI actions cannot send to assistant | `src/client/openui-actions.ts:67-80` | Read |

### 5.2 Absence claims — commands and results

All run in PowerShell from the workspace root; `HOST` as defined at the top.

1. **`dsh-client-ui-slots` is not a package in 0.2.2-rc.1.**
   `Ran`:
   `Select-String -Path evidence/stage-7a/host-package-inventory.txt -Pattern
   'ui-slots|client-web|ui-workspace|dsh-web-frontend|dsh-client-ui-primitives|dsh-agent@'`
   → matches `dsh-agent@0.2.2-rc.1`, `dsh-client-ui-workspace@0.2.2-rc.1`,
   `dsh-web-frontend@0.2.2-rc.1` only; **no** `ui-slots`, `client-web` or
   `client-ui-primitives` line in the 331-package inventory. `Test-Path` on the extracted
   `dsh-client-ui-slots` → `False`; the older asar directory listing
   (`tmp/asar-entries.txt`) also has **0** `slots` hits. Its `SlotCore` is nevertheless
   present as a web-shell builtin:
   `Select-String -Path $HOST/dsh-web-frontend/dist/assets/index-BgUyXZcc.js -Pattern 'dsh-client-ui-slots'`
   → line 196 builtin table `"@deepseek-ai/dsh-client-ui-slots": MI`, `MI` exports
   `SlotCore, SlotOwnershipError, StaleAuthorizationError, resolveSlotLabel, standardHookPropName`.
   `[Ran]`
2. **No `.d.ts` in the 0.2.2-rc.1 extracted tree.**
   `Get-ChildItem $HOST -Recurse -File -Include *.d.ts` → **0 files**; 115 `lib/types/*.js`
   runtime files. `[Ran]`
3. **`SessionStandardProps` has no concrete members in 0.2.2-rc.1.**
   The only declaration found is the empty interface at
   `$HOST/dsh-cordis-client-runner/lib/client.js:2385-2387`; concrete members exist only in
   per-slot `standardProps` lists and runtime `provide` calls (§1.2). `[Read]`
4. **`principal` is not rendered.**
   `Select-String -Path $HOST/dsh-client-ui-chat/lib/client.js -Pattern 'principal'` → 0;
   same for `$HOST/dsh-client-ui-conversation/lib/client.js` → 0. `[Ran]`
5. **`rpcId` is only used for dedupe.**
   `rpcId` hits in chat: `3438`, `3579`, `3580`, `3581`, `3582` (optimistic submission
   dedupe) and in conversation: `19631`, `19634` (queue dedupe); no render site. `[Read]`
6. **No card/visualize source kind.**
   Full `MessageSourceMap` read (§3.1); no `'visualize'`, `'card'`, or plugin-card kind.
   The turn-trigger switch (§3.3) has no card branch; unknown kinds render
   `message.trigger.request` = "Execution requested". `[Read]`
7. **No archived bit in the session snapshot.**
   `SessionSnapshot` declaration `$HOST/dsh-cordis-client-runner/lib/client.js:2381-2382`
   lists no archived field; archive lives in the workspace registry
   (`archived-session-gate.js:35-51`). The client package that would expose it
   (`dsh-client-ui-workspace`) is not in the extracted subset. `[Read]` + limitation.
8. **No turn on the settled tool block.**
   The `rootResult` construction (`$HOST/dsh-client-ui-chat/lib/client.js:12295-12316`)
   has no `turn` property; preparing/start nodes do (`:12278-12279`). `[Read]`

### 5.3 What was *not* examined

- No execution of the host, the browser, or the plugin: no behaviour is "verified" here.
- `dsh-agent` (the Agent API behind `agent.steer` / `agent/pre-step` messages / inbox
  splices) is present in the installed asar inventory (`dsh-agent@0.2.2-rc.1`, 331-package
  list) but **not** in the extracted subset, so the exact source kind assigned by a
  host-side `agent.steer()` (used by this plugin at `src/self-repair.ts:414`) cannot be
  cited from 0.2.2-rc.1. The action-cards code proves the `agent/pre-step` message channel
  exists and is used by shipped code; the Agent layer's own contract is unread.
- `dsh-client-web` (the shell library that installs the slot renderer/scope adapters in the
  real page) is not a shipped package in the 331-package inventory (it is a build-time
  dependency of `dsh-web-frontend`), and `dsh-client-ui-workspace` (the sidebar that would
  expose archivedness to an ordinary card) is *shipped* but was not extracted. The
  renderer-side standard-prop assembly was therefore read from `dsh-client-ui-renderer`,
  and the shell's slot-core presence was confirmed only as a bundle builtin (above).

---

## 6. What the host must change, if anything

### 6.1 Identity: nothing

The 0.2.2-rc.1 slot contract already gives a card the two trustworthy ids it needs
(`sessionId` + `callId`), plus turn on the start-stage block and on the turn-tail slot.
The only gap is ergonomic: the settled toolview block has no turn, so a card that wants
the turn after settlement must read the durable `tool/result`/`tool/call` event (as the
plugin's `TurnCards` fold already does) or be mounted on the turn tail as well. If the
host wanted to remove that lookup it could add `turn`/`step` to `ToolResultNode`, but no
trust or correctness bug follows from the current state.

### 6.2 Message attribution: a host change is required for true attribution; a plugin-only fallback exists

**Requirement if the product wants "this message was sent from card X" rendered on the
user's message:** the host must add provenance to the user-message source model because
the client cannot write it and the transcript does not render it. Minimum shape:

1. Extend the prompt admission path (`session.prompt` → `commands.prompt`) with a
   *host-verifiable* provenance claim, e.g. `origin?: { kind: 'card'; callId }`, validated
   server-side: the claimed `callId` must name a logged tool call in **the same resolved
   session** whose tool produced the card, and `sessionId` must be the resolved session
   (never a client-named one). Do not accept a session id, principal, turn or source kind
   from the browser — only a locator the host can check in its own log. Mirror
   `dsh-action-cards`' `act()` discipline ("checks the owner, the live root and the card",
   `$HOST/dsh-action-cards/README.md:60`) and the prompt schema's existing pattern (the
   client may mint only `requestId`; the host builds the rest, §3.2).
2. Add a new `MessageSourceMap` member (e.g. `'card-action': { kind: 'card-action';
   callId: ToolCallId; … }`) or an optional field on the `'user'` source, and render it in
   the user bubble (`UserMessageNodeView`, `$HOST/dsh-client-ui-chat/lib/client.js:6268-6288`)
   — today that renderer shows content/actions only, and `contextProducer`/turn-trigger
   rendering only applies to non-`'user'` kinds (§3.3).
3. Because the frame's token (callId) is readable by model-written script, the host must
   treat card provenance as **display attribution only**, never as authorization: the
   action's authority still comes from the gateway peer/principal and the session's remote
   access policy.

**Plugin-only fallback that needs no host change** (different UX): the plugin's host half
can append a separate injected notice — the action-cards pattern
(`$HOST/dsh-action-cards/lib/types/index.js:195-198`, `createUserMessage` with a
plugin-defined `source.kind`, durable-log legal per
`$HOST/dsh-session/lib/types/index.js:246-298`) — and its browser half can render that
notice with its own `conversation.chat.node` occupant + Conversation Definition, exactly as
`dsh-client-ui-user-questions` does for `user-question-reply`
(`$HOST/dsh-client-ui-user-questions/lib/client.js:1551-1598`; the plugin already uses this
register/Definition API at `src/client/index.tsx:106-119`). What this cannot do is mark the
user's own bubble, and it still needs a host-side trigger that can attribute the pending
submission to a card (an `act`-style Remote carrying `(sessionId, callId)` before the host
appends the notice — again the action-cards shape).

---

## 7. Open questions to carry into the design

1. Does the product need attribution **on the user bubble**, or is a separate "sent from
   card X" notice row acceptable? Only the first needs a host change (§6.2).
2. If the plugin-only path is chosen, where does the host half learn that a card caused a
   submission? Today the frame only drafts text; the reader's send is indistinguishable
   from typing. A card action would have to go through a Remote like `actionCards.act`
   (host-validated `(sessionId, callId)`), not through the composer draft.
3. The Agent-layer contract behind `agent/pre-step` message injection and `agent.steer`
   source kinds is unread (`dsh-agent` not extracted). Confirm it in the 0.2.2-rc.1 asar
   before relying on a custom `source.kind` surviving into the log and reaching the chat
   fold, even though the session validator admits it.