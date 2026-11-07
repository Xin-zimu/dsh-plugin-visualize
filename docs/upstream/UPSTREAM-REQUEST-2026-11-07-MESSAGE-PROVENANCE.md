# Upstream request draft — host-validated message provenance

Date: 2026-11-07 · **STATUS: SENT 2026-11-07** — published as a Discussion
(category: Ideas):
https://github.com/deepseek-ai/deepseek-harness/discussions/12542
This file is the canonical copy of what was posted; Part B is the reference
patch plan for maintainers. No issue or PR was opened.

Why a **Discussion** and not an issue/PR:

- `CONTRIBUTING.md` @ `dsh-v0.2.2-rc.1`: *"We are sorry that we cannot accept
  external pull requests at the moment … Identify and report issues or bugs in
  GitHub Discussions."*
- The public repo's API reports `has_issues:false`, `has_pull_requests:false`,
  `has_discussions:true` (`evidence/stage-7c/gate3/01-upstream-identity.txt`).
- So the correct channel is a GitHub Discussion post. Do not open an issue or a
  PR from this repo.

Design evidence: `docs/reports/STAGE-7C-GATE-3-UPSTREAM-PROVENANCE.md` and
`evidence/stage-7c/gate3/`. Everything below is written against the public
release tag `dsh-v0.2.2-rc.1` (`66491b05e3`), which is also the installed host.

**Published at:** https://github.com/deepseek-ai/deepseek-harness/discussions/12542
(category *Ideas*; 2026-11-07). No Issue or PR was opened; the repository
disables both.

---

## Part A — ready-to-send Discussion post

**Title:** Proposal: optional host-validated provenance on `session/prompt`
(one additive field)

**Body:**

> **What this is.** A request from a third-party visualization plugin
> (`@dsh-unified/visualize`, which is itself built as a community package). We
> are not asking for a new capability surface; we are asking for one optional
> field so a message that a plugin submits on the user's behalf can say, durably
> and verifiably, that it came from a specific tool call (a card the model drew),
> instead of being indistinguishable from typed input.
>
> **The need.** A plugin can already do all of the following on 0.2.2-rc.1:
> submit a prompt through the mediated `session.prompt` Remote, obtain a
> host-rendered confirmation with `ctx.userQuestions.ask()` (we verified it works
> outside a turn, before and after one), and rely on the host fixing the message
> role/source. What it cannot do is make the **delivered** message traceable to
> the card that produced it: `session/prompt`'s schema has no provenance field,
> and the host builds `{kind:'user', rpcId, clientTimeZone?, principal?}` itself
> (`packages/api/session-controller/src/index.ts:480-488`). A later reader
> (including the model's own transcript) cannot tell a card-submitted message
> from typed text.
>
> **This is a general capability, not a privilege request.** The field grants no
> authority and carries no session, role or principal. Any plugin that submits a
> message on the user's behalf — action cards, automation/workflow plugins,
> collaboration tools that post a delegated turn — has the same problem: the
> delivered message cannot say where it came from. The host already validates
> identity and role; this change only records a fact the host itself checked.
> Nothing here is specific to this plugin, and no extra confirmation API is
> requested — the existing `userQuestions.ask()` covers consent.
>
> **Proposed change (one item).**
>
> 1. `SessionPromptRequest` (`packages/api/session-controller/src/types.ts:322`)
>    gains an optional claim:
>
>    ```ts
>    readonly origin?: { readonly kind: 'tool-call'; readonly callId: ToolCallId }
>    ```
>
>    It carries no session, role, principal or source kind — the target session is
>    already the request's own `sessionId`.
>
> 2. The host validates the claim against **its own durable log** after it has
>    resolved the Agent (the `commands.prompt` layer is the right place:
>    `packages/api/session-controller/src/commands.ts:304`): the `callId` must
>    match a committed `tool/call` event in that session
>    (`packages/core/session/src/types.ts:369`), and the host derives the tool
>    name and turn from that event, not from the caller. An unknown id is
>    rejected with a stable error code (e.g. `session/origin-unverified`); fail
>    loudly, never silently ignore.
>
> 3. The validated origin is recorded on the durable message source as an
>    **optional field on the existing `'user-rpc'` kind**:
>
>    ```ts
>    'user-rpc': {
>      kind: 'user'; rpcId: SessionRequestId; clientTimeZone?: string; principal?: Principal
>      origin?: { kind: 'tool-call'; callId: ToolCallId; tool: string; turn: number }
>    }
>    ```
>
>    (`packages/api/session-controller/src/types.ts:391`). No new source kind, so
>    dedupe (`hasPromptRequest` matches `kind==='user'` + `rpcId`:
>    `commands.ts:542`) and composer submission-echo observation keep working.
>
> 4. Regenerate the typert declarations/schema. The prompt parameter codec is
>    strict today (`additionalProperties:false`, installed
>    `dsh-api-session-controller/lib/typert.host.js:2401`), which is why an
>    undeclared field cannot work around this; the new field must be declared.
>
> **What this deliberately does not ask for.** No new confirmation API
> (`ctx.userQuestions.ask()` already exists and is enough), no host-rendered
> badge (we render it from the durable source using the already-declared
> `conversation.chat.user.before` slot,
> `packages/client/ui-chat/src/client/contract/slots.ts:457` — the same mechanism
> `experimental-liveshare` uses), no role or permission change, no new message
> kind, no delivery-observability API.
>
> **Trust properties.**
>
> - The claim is display data, never authorisation. The gateway peer/principal
>   remains the authority; a forged claim buys no capability.
> - The frame that draws cards is `<iframe sandbox="allow-scripts">` with an
>   opaque origin and cannot reach `session.prompt`; only trusted page code can
>   set a claim.
> - The host only accepts ids its own log contains and derives the recorded tool
>   name/turn itself, following the same "validate the locator against the log"
>   discipline as `dsh-action-cards`' `act()`.
> - **What the validation proves, and what it does not.** The host can prove
>   that the named `callId` is a committed `tool/call` in the target session, and
>   it derives `tool`/`turn` from that event. That is **membership, not
>   authorship**: it does **not** prove that the submitting caller is the card
>   that made that call. A caller already authorised to submit prompts could name
>   another real call in the same session, so the recorded origin is
>   **display/trace data only — never an authorisation or identity claim**.
>   Consumers must treat it as a hint to read, not a permission to act on.
>
> **Behaviour on the existing traps.** Provenance is recorded on the message, so
> an archived session (prompt accepted, turn blocked, no `user/message`) records
> nothing — which is the honest outcome. Forked sessions validate an inherited
> `callId` against their own prefix, so attribution pins to the fork.
>
> **Compatibility.** Additive optional field; no storage format bump expected
> (the source is durable JSON and already merge-extensible — we re-read a real
> stored session to confirm existing source fields persist). Older clients never
> send it; clients that do not know it ignore it. The client cannot pre-check the
> host version, so a plugin would feature-detect before sending; older hosts
> reject the unknown field by design.
>
> **Acceptance we would look for.**
>
> 1. valid claim → durable `user/message` with host-derived `origin.tool`/`turn`;
> 2. unknown `callId` → stable rejection, no message, no turn;
> 3. `callId` from another session → rejected;
> 4. typed prompts → byte-identical sources to 0.2.2-rc.1;
> 5. undeclared fields still rejected by the strict codec;
> 6. reload/cold restore keeps `origin`; sessions without it still resume;
> 7. archived/fork cases as above.
>
> **Why we think this belongs in core rather than a community package.** The
> trust property requires the host to write the field and validate the locator
> against its own log. A plugin that appends its own `user/message` can fake any
> source it likes, and a non-`'user'` source kind is rendered as an injected
> context row rather than a user bubble
> (`packages/client/ui-chat/src/client/conversation-nodes/message.ts:96-111`), so
> the plugin-only path is not equivalent.
>
> **Offer.** I can provide a reference patch and a test corpus (this proposal is
> deliberately shaped so the implementation is small), or answer questions about
> the plugin side. I understand external PRs are not accepted at the moment.
>
> **Version.** Proposal written against `dsh-v0.2.2-rc.1`
> (`dsh-v0.2.2-rc.1` = `66491b05e3`); line numbers may move in later releases.

---

## Part B — reference patch plan (for maintainers; do not submit as a PR)

| Step | File | What |
| --- | --- | --- |
| 1 | `packages/api/session-controller/src/types.ts` | `PromptOriginClaim`; `origin?` on `SessionPromptRequest`; `origin?` on the `'user-rpc'` augmentation |
| 2 | `packages/api/session-controller/src/commands.ts` | after `resolveAgent`: `sessionQuery.observeSession(sessionId)` (the API already used by `fork` in the same class, `:222`), find `tool/call` with the id; reject `session/origin-unverified` otherwise; build `{...source, origin:{kind,callId,tool:event.data.name,turn:event.data.turn}}`; pass that source to `createUserMessage` |
| 3 | `packages/api/session-controller/src/index.ts` | Remote stays a pass-through; source construction unchanged apart from threading the claim into the command layer |
| 4 | generated typert | rebuild so the strict codec schema includes `origin` (and the remote-client declaration) |
| 5 | tests | the seven acceptance cases above, including cold restore and strict-codec rejection |
| 6 | docs | session-controller README/subsystem page: display-only provenance |

Open implementation choices for upstream:

- **Validation read:** `sessionQuery.observeSession` (sanctioned, already used in
  the same class) vs. a small host-only projection over `tool/call` events
  (cheaper at scale, more code). The synchronous `snapshotEvents` readers are
  deprecated for new production calls and were deliberately not used in the
  proposal.
- **Error code and payload:** `session/origin-unverified` is a suggestion.
- **Compaction:** a claim may point at a `tool/call` that a later compaction
  shadowed; the raw append-only log still contains it, so the id remains
  validatable. If upstream wants to restrict claims to current-surface events,
  that is a policy choice; our use case only needs the card's own call.
- **Rate cost:** one log observation per prompt carrying a claim. Prompts without
  the field pay nothing.

Publication record (all conditions met):

1. Owner approved the wording and the repo identity on 2026-11-07.
2. Release re-checked before posting: npm `next` = `0.2.2-rc.1`, no newer
   release; the post cites tag `dsh-v0.2.2-rc.1` = `66491b05e3`.
3. Posted under Discussions only; no issue, no PR. The posted body links the
   evidence summary, not private session logs.