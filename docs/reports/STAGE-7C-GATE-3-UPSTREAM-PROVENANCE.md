# Stage 7C Gate 3 — the upstream DSH change `@ToAssistant` actually needs

Date: 2026-11-07 · Status: **request prepared, nothing sent** · Host source:
DSH **0.2.2-rc.1**, installed build == public release tag `dsh-v0.2.2-rc.1`
(`66491b05e3`). · Evidence: `evidence/stage-7c/gate3/`. · Decision: ADR-016
Option B, with the supplement in §13 of that ADR.

## 0. One-line answer

DSH upstream needs **one additive host change**: `session/prompt` accepts an
optional `origin` claim, the **host** validates it against a durable `tool/call`
in the resolved session, and the validated origin is recorded on the durable
`user/message` source. **No new confirmation API, no new message role, no host
UI change is needed** — the user-bubble badge is rendered by the plugin through
an existing, already-declared Chat slot.

This is narrower than ADR-016 §3 assumed: its "one schema field + one log check
+ **a source kind** + **one bubble badge**" becomes "one schema field + one log
check + one optional field on the existing `'user-rpc'` source". The reasons and
the evidence are §3 and §4 below.

## 1. What was re-verified, and what changed

| Claim | Status | Evidence |
| --- | --- | --- |
| Installed host is 0.2.2-rc.1 | **Ran** | `evidence/stage-7b/real-host/`, and `@deepseek-ai/dsh-*` 0.2.2-rc.1 in the asar |
| The public release tag `dsh-v0.2.2-rc.1` = `66491b05e3` is the same release, and no newer version is published | **Ran** | `01-upstream-identity.txt`: npm `next` = 0.2.2-rc.1, published 2026-11-04 08:58Z; GitHub release `v0.2.2-rc.1`; versions end at 0.2.2-rc.1 |
| The prompt wire has **no** source/origin/call-id field | **Read** | `packages/api/session-controller/src/types.ts:322-330`; anchors verified |
| An undeclared extra field **cannot** smuggle a claim: the prompt parameter codec is strict | **Read** (installed build) | `dsh-api-session-controller/lib/typert.host.js:2395,2401` — `additionalProperties:false` |
| The host builds the source itself (`kind:'user'`, rpcId, timezone, principal) | **Read** | `index.ts:480-488` |
| Source is bound to the exact delivered message | **Read** | `commands.ts:328-340`: `createUserMessage({content, source})` → `agent.followup(message)` |
| Source is durable and survives restore | **Ran** + **Read** | `durable-source-proof.json` (real log: source on `user/message`); `ui-chat …/conversation-nodes/message.ts:127-134` copies the durable source into the rendered node |
| A source-aware decoration slot above the user bubble already exists | **Read** + **Type** | `ui-chat/src/client/contract/slots.ts:230-236,457`; `chat/MessageItem.tsx:226`; shipped occupant `experimental-liveshare SharedSessionOrigin`; registration example in the declaration |
| The plugin can use that slot mechanism already | **Read** | `src/client/index.tsx:27,80-124` registers other slots; `ctx.slots.inject` is the same API |
| Durable `tool/call` record exists to validate a claim | **Read** | `packages/core/session/src/types.ts:369` (`callId`, `name`, `turn`, `step`) |
| A sanctioned history read exists for the validation | **Read** | `commands.ts:222` already calls `ctx.sessionQuery.observeSession(...)`; `dsh-session-query` README: "Use `ctx.sessionQuery` … to read or search session history" |
| Dedupe/echo matching keys on `source.kind === 'user'` + `rpcId` | **Read** | `commands.ts:542-552`; built client bundle `dsh-client-ui-chat/lib/client.js:3438,3579` |
| Upstream accepts reports in GitHub Discussions; **not** external PRs | **Ran** | `01-upstream-identity.txt`; `CONTRIBUTING.md` @ tag |

Consequence: ADR-016's "one bubble badge" item is **not an upstream ask**. The
host already exposes the durable source to a plugin-rendered decoration slot, so
the display half is ours. That keeps the request to one item, as the owner
required.

## 2. Requirements → mechanism mapping

| Owner requirement | Host mechanism | Status |
| --- | --- | --- |
| 1. host-validated, not plugin-forgeable | strict codec rejects undeclared fields; host validates `origin.callId` against its own `tool/call` log and derives the recorded tool name itself | designed; needs upstream patch |
| 2. bound to the delivered message | `origin` is written into `UserMessage.source` inside `commands.prompt`, the same object passed to `agent.followup/steer`; no message ⇒ no provenance | designed |
| 3. persist, restore, show in transcript | source is part of the durable `user/message` JSON (verified for existing fields); the rendered node receives `event.data.source`; the plugin renders the badge via `conversation.chat.user.before` | persistence **verified** for source; display extension point **read**; origin round-trip is an upstream acceptance test |
| 4. no role/permission change | `role:'user'` and the existing `'user-rpc'` source kind are unchanged; `origin` is display data, never authorisation; gateway authorisation untouched; dedupe/echo logic untouched | designed |
| 5. no new confirmation API; reuse `userQuestions.ask()` | `origin` is orthogonal to confirmation; Gate 2 already verified `userQuestions.ask()` between turns on the real host | **verified in Gate 2** |

## 3. The proposed contract (interface examples)

### 3.1 Wire — one optional field on the prompt request

```ts
// packages/api/session-controller/src/types.ts (near line 322)
/** A provenance claim the Host must verify against its own durable log. */
export interface PromptOriginClaim {
  /** A `tool/call` id already committed in the target Session. */
  readonly kind: 'tool-call'
  readonly callId: ToolCallId
}

export interface SessionPromptRequest {
  readonly requestId: SessionRequestId
  readonly sessionId: SessionId
  readonly mode: 'queue' | 'steer'
  readonly content: readonly PromptContentPart[]
  readonly clientTimeZone?: string
  /** Optional; a claim, never a credential. Omitted for typed prompts. */
  readonly origin?: PromptOriginClaim
}
```

The claim deliberately carries **no** session, role, principal or source kind:
the session is the request's own target and everything else is host-owned.

### 3.2 Durable source — an optional field, not a new kind

```ts
// packages/api/session-controller/src/types.ts (near line 391)
declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'user-rpc': {
      kind: 'user'
      rpcId: SessionRequestId
      clientTimeZone?: string
      principal?: Principal
      /** Host-validated provenance; absent means "typed by the user". */
      origin?: {
        readonly kind: 'tool-call'
        readonly callId: ToolCallId
        /** Derived by the Host from the durable tool/call event, not from the caller. */
        readonly tool: string
        readonly turn: number
      }
    }
  }
}
```

Why `origin` on `'user-rpc'` instead of a new `MessageSourceMap` kind: dedupe
(`hasPromptRequest`, `commands.ts:542-552`) and the composer's submission-echo
observation both match `source.kind === 'user' && 'rpcId' in source`. A new kind
would change transcript classification (see §4.3) and touch those paths. An
optional field changes none of them.

### 3.3 Host validation (the only logic change)

```ts
// packages/api/session-controller/src/commands.ts — inside prompt(), after
// `const agent = await this.resolveAgent(request.sessionId)` and before the
// message is built. Pseudocode against the real APIs.
async prompt(request, source) {
  const agent = await this.resolveAgent(request.sessionId)
  if (hasPromptRequest(agent, request.requestId)) return { accepted: true }

  let validated: MessageSource = source
  if (request.origin !== undefined) {
    using observed = await this.ctx.sessionQuery.observeSession(request.sessionId)
    const call = observed.events.find(event =>
      event.type === 'tool/call' && String(event.data.callId) === String(request.origin.callId))
    if (call === undefined) {
      throw new RemoteError(
        'session/origin-unverified',
        'prompt origin names no tool call in this session',
        { callId: String(request.origin.callId) },
      )
    }
    validated = {
      ...source,
      origin: {
        kind: 'tool-call',
        callId: request.origin.callId,
        tool: call.data.name,      // derived from the log, not from the caller
        turn: call.data.turn,
      },
    }
  }
  // …existing admission; createUserMessage({ content, source: validated })
}
```

Rejection, not silent downgrade: a forged/unknown claim must fail loudly
(ADR-016 §7 case 24). The Remote stays a pass-through; the command layer is used
because only it has the resolved Agent/log (§1, `commands.ts:304-350`).

### 3.4 Plugin-side read (no host UI change)

```ts
// our client half, Stage 7B Gate 4 — on the existing chat slot
ctx.slots.inject('conversation.chat.user.before', () => ctx.slots.register(
  {
    name: 'conversation.chat.user.before',
    select: ({ source }) =>
      isToolCallOrigin(source) && source.origin.tool === 'visualize' ? source.origin : null,
  },
  ({ matched }) => React.createElement(CardOriginBadge, { origin: matched }),
))
```

The slot receives `{ source, kind }`; `matched` is the selector's non-null
result. The badge is plugin-owned copy ("sent from a visualisation card"), but
the fact it renders is host-validated and durable.

## 4. Alternatives considered and why they are not enough

### 4.1 Plugin appends its own `user/message` with a custom source (no host change)

Rejected. The source map is merge-extensible, so a plugin *could* declare
`'visualize-card'` and append a user message from its host half. But:
(a) nothing host-side validates the association — this is exactly the
"plugin-forged" provenance requirement 1 forbids; (b) the message source kind is
no longer `'user'`, so Chat classifies it as an injected **context** row, not a
user bubble (`message.ts:96-111`); (c) `rpcId` dedupe/echo observation
(`commands.ts:542-552`, client `3438`/`3579`) does not apply. That is ADR-016
Option D, and the host-side classification makes the UX wrong, not just the
trust story.

### 4.2 New `MessageSourceMap` kind (e.g. `'user-card'`)

Rejected as unnecessary churn: it changes row classification and dedupe keys for
zero additional trust. An optional field on the existing source is smaller and
backwards-compatible.

### 4.3 A host-rendered badge

Not required. The `conversation.chat.user.before` slot already exists precisely
to let producers decorate a user bubble from the durable source, with a shipped
precedent (`SharedSessionOrigin`). Asking upstream to hard-code our badge would
be a second ask and would bake a plugin's UX into core.

### 4.4 A dedicated confirmation API

Not required by this change and explicitly out of scope per ADR-016 Option B;
Gate 2 verified `userQuestions.ask()` outside turns on the real host.

## 5. Modified-file list (upstream, at `66491b05e3`)

| File | Change | Anchor |
| --- | --- | --- |
| `packages/api/session-controller/src/types.ts` | add `PromptOriginClaim`; add `origin?` to `SessionPromptRequest`; add `origin?` to the `'user-rpc'` augmentation | `:322-330`, `:391-400` |
| `packages/api/session-controller/src/index.ts` | keep building the source; pass `request.origin` through (the command layer validates) | `:464-489` |
| `packages/api/session-controller/src/commands.ts` | validate the claim after `resolveAgent`; merge the host-derived origin into the source before `createUserMessage`; stable error code | `:304-350`, `:542-552` (unchanged semantics) |
| generated `lib/typert.host.js` (+ remote-client declarations) | regenerate: the strict codec JSON schema must include `origin` (`additionalProperties:false` today) | installed `:2382-2414`; `sourceLocation: index.ts:465:9` |
| tests under `packages/api/session-controller/` | new cases: valid claim; unknown callId; cross-session callId; archived session; fork-inherited callId; codec round-trip; cold restore | n/a |
| user docs (`packages/api/session-controller/README*`, subsystem docs) | document the field as display-only provenance | n/a |

No change is needed in `@deepseek-ai/dsh-llm`'s `src/message.ts` (the map is
merge-extensible via the augmentation above) and no change in
`packages/client/ui-chat` (the slot exists).

## 6. Acceptance criteria (Gate 4 contract for us; upstream test list)

Host side (upstream's own tests):

1. A valid `origin` produces a durable `user/message` whose `source.origin` has
   host-derived `tool`/`turn` and the caller's `callId`.
2. An unknown `callId` is rejected with a stable code (no message, no turn).
3. A `callId` from a different session is rejected (the claim cannot redirect).
4. Typed prompts (no `origin`) produce byte-identical sources to 0.2.2-rc.1.
5. A prompt with an undeclared field is still rejected by the strict codec.
6. Restore/replay of a session containing `origin` shows it unchanged; older
   sessions without it still resume.
7. A forked session validates an inherited `callId` against its own prefix;
   attribution pins to the fork (ADR-016 §7 case 17).
8. Archived-session behaviour is unchanged: `{accepted:true}`, turn blocked, no
   `user/message` ⇒ no provenance recorded (Gate 2 trap).

Plugin side (Gate 4, after an upstream release ships it):

9. Card click → `userQuestions.ask()` (Gate 2 verified) → submission with
   `origin:{kind:'tool-call',callId}` → reload → the same bubble still shows the
   host-derived origin; no model call needed for the badge.
10. A card from session A cannot annotate a message in session B (the plugin
    attaches its own callId; the host resolves the session).
11. Cancel sends nothing and opens no path to the provenance field.
12. `@ToAssistant` returned to `UNSUPPORTED_STEPS` leaves every case inert.

## 7. Compatibility and migration cost

- **Wire:** additive optional field; the strict codec is regenerated from the
  type. Clients that do not send it are unaffected. A plugin must feature-detect
  the host version before sending it (older hosts reject unknown fields), which
  fits the plugin's existing host-version gating.
- **Storage:** no format bump expected — `source` is durable JSON and already
  extensible; the field rides the `user/message` event. Upstream should still
  assert cold-restore round-trip (acceptance test 6).
- **Roles/permissions:** unchanged (`kind:'user'`, `role:'user'`; gateway
  principal unchanged; display-only).
- **Host UI:** none. Older clients without the plugin's badge simply never see
  it — the durable field is inert.
- **Cost:** one type, one validation block, one test group, regenerated
  declarations. No new package, no new service, no new API surface.

## 8. Trust boundary

- The claim is **display data**, never authorisation; the gateway peer/principal
  stays authoritative.
- The frame (`<iframe sandbox="allow-scripts">`, opaque origin) cannot reach
  `session.prompt`; only trusted page/plugin code can set a claim.
- The host only accepts a `callId` that its own log contains, and derives the
  recorded `tool` and `turn` itself.
- **Residual, stated honestly:** a caller already authorised to submit prompts
  can still point at a *different real* call in the same session. The badge then
  misattributes within the same user/session; it cannot invent a call, cannot
  redirect the session, and cannot gain authority. This is the same discipline
  as `dsh-action-cards` (`act()` validates a locator against the log, never
  trusts it as a credential).

## 9. What this request deliberately does **not** ask for

1. No dedicated confirmation API (owner requirement 5; Gate 2 verified the
   existing one).
2. No host-rendered badge (existing slot; §4.3).
3. No role/source-kind change (requirement 4; §3.2).
4. No fix for the archived-session trap and no delivery-observability API —
   useful, but separate asks; the plugin already reports "unconfirmed" from the
   durable log (Gate 2 finding).
5. No `@OpenUrl` work (ADR-014 unchanged).

## 10. Verification status

**VERIFIED** (ran, evidence saved)

- Upstream identity/channel: npm `next`=0.2.2-rc.1, release tag
  `dsh-v0.2.2-rc.1`=`66491b05e3`, no newer version; reports go to Discussions
  and external PRs are not accepted (`01-upstream-identity.txt`).
- All 15 cited source anchors re-fetched and asserted:
  `anchors-verified.json` — 15/15.
- The installed prompt codec is strict (`additionalProperties:false`), so an
  unknown `origin` field cannot work without a host change
  (`02-wire-and-validation.txt` §F).
- A real Gate-2 session log stores `user/message` sources durably
  (`durable-source-proof.json`; metadata only).
- Gate 2's `userQuestions.ask()` confirmation result stands (unchanged by this
  request).

**NOT VERIFIED** (deliberately, because the host change does not exist)

- That an added `origin` field survives their persistence schema and cold
  restore. **Read** suggests yes (source is extensible JSON); it is listed as
  upstream acceptance test 6 and Gate 4 case 9.
- Any end-to-end card→prompt-with-origin flow: impossible on 0.2.2-rc.1 because
  the strict codec rejects the field.
- That upstream accepts the shape: the Discussion is a draft, not sent, per the
  owner's instruction.

## 11. Where the draft lives

`docs/upstream/UPSTREAM-REQUEST-2026-11-07-MESSAGE-PROVENANCE.md` — a ready-to-
send GitHub **Discussion** post plus a reference patch plan. It is **not** sent.