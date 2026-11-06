# ADR-015 — `@ToAssistant`: sending content to the assistant

- **Status:** **Deferred — one required property has no host capability.**
  **Amended 2026-11-07 — see §11.** §10.3's claim that no plugin-callable confirmation
  exists is superseded: the installed host is 0.2.2-rc.1 (not the 0.2.1-rc.5 tree §10 read),
  and it provides, in source, a host-rendered confirmation a card cannot fake — with the
  between-turn live-root condition left to verify. The missing property is
  **attribution**. Requirements unchanged; the action stays refused. Decision now tracked in
  `ADR-016-TO-ASSISTANT-STAGE-7A.md` (Proposed).
  **Amended 2026-11-06.** The original stated reason — "trusted host submission
  capability unavailable" — is **false** and was corrected in §10. A turn-submit
  path exists and is reachable from this plugin.
- **Date:** 2026-11-05 (amended 2026-11-06)
- **Relates to:** `ADR-4B-THREAT-MODEL.md`, ADR-004 (boundaries), ADR-006
  (`$state` persistence), `src/client/openui-actions.ts`

> This ADR is written last of the three intentionally and is placed first in
> importance: it is the highest-risk action, and reading it should decide whether
> the other two are worth having.

## 1. Current state

`@ToAssistant` is in `UNSUPPORTED_STEPS`. `applyAction` recognises the name and
refuses it, so a Button carrying it is inert.

**[CORRECTED 2026-11-06]** This paragraph originally read: *"Nothing in the plugin
can submit a turn: there is no session-write or turn-submit API on the host surface
this plugin is given (threat model §2)."* **That is false.** Three real submit paths
exist, one of them already passed to this plugin's own card as a prop. See §10.
The action remains refused because two *properties* this ADR requires cannot be
satisfied — not because the capability is absent.

The declared form is `@ToAssistant(message)`. The message is a string the program
composes, which may include text the card is displaying.

## 2. What makes this different from the other two

Copying and opening are **terminal**: one write, one navigation, and the effect is
visible to the user immediately. Sending a message is not terminal. It enters a
system that will act on it, and it enters a **role hierarchy** the user cannot see
in the card.

Three consequences:

1. **Prompt injection stops being hypothetical.** If a card renders a fetched page,
   a tool result, or a pasted document, its text is attacker-influenced. A button
   that forwards that text is a carrier: the user pressed "summarise this" and the
   assistant received "ignore previous instructions".
2. **Role is part of the payload.** Content delivered as a user turn is a request.
   Content delivered as `system` or `developer` is an instruction. The second is
   privilege escalation and must be structurally impossible, not merely unused.
3. **Loops are cheap and invisible.** A message that triggers a turn which renders
   a card which sends a message costs money and floods the session, and no gesture
   was repeated. This is the only one of the three with a re-entrancy hazard.

## 3. Threat analysis

| Threat | Applies how | Decision |
| --- | --- | --- |
| T1 authority by syntax | A program naming `@ToAssistant` in a Button fires on click, which is a gesture — but the *content* was authored by the model, not the user | Gesture alone is **insufficient**. See §5. |
| T2 injection via content | The card may be displaying text it did not author | The user must see the exact bytes before they are sent |
| T7 role escalation | Sending as anything but the user's own turn | Never. The submit path must accept no role argument at all |
| T8 automatic loop | A card re-rendering after a turn could send again | Single in-flight guard, per-card budget, and a confirm step that a loop cannot satisfy silently |
| T10 leak through failure | An error echoing the message | Generic failure text |
| T11 unbounded payload | A 1 MB message | Hard cap with a stated refusal |
| T12 stale authority | One approval reused | Approval is per send, not per card |

## 4. Options considered

### Option A — turn it on with a gesture check

Button click → submit as a user turn. Simplest, and consistent with how the
other two actions could be built.

**Rejected.** It makes the model's text indistinguishable from the user's own
intent. A single click on a plausible-looking button would forward arbitrary
content. The gesture proves the user pressed something; it does not prove the user
read what would be sent. Every other injection defence in this codebase assumes
the user's turn is the user's words, and this would break that assumption at the
one place where it matters most.

### Option B — no host API, so build a client-side submit through the DOM

**[CORRECTED 2026-11-06]** The premise of the option name — "no host API" — is
false (§10). This option remains **rejected for its own reasons**, which do not
depend on the premise: it is the card reaching into the host's controls, it is
brittle against the composer's ProseMirror implementation, and it produces a
message the host cannot attribute or refuse. A native path exists (§10.1), so
there has never been a reason to take this one.

The card lives in the host document, so it could find the composer and set its
value, or dispatch a submit event.

**Rejected outright, and named here so nobody re-proposes it.** It is the exact
thing ADR-004 forbids: the card reaching outside itself into the host's controls.
It would also be brittle against the composer's ProseMirror implementation, and a
failure mode where the card writes into the composer but does not submit would
leave attacker text sitting in the user's input box.

### Option C — host-mediated submit with an explicit preview and confirmation

The action does **not** send. It opens a confirmation surface showing the exact
text, attributed as "from this card", with Send and Cancel. Only Send, pressed by
the user, submits — as the user's own turn, with the card's path attached.

**[CORRECTED 2026-11-06]** This originally said the needed capability "does not
exist yet". It exists, in part (§10.1): a plugin *can* request a host-mediated turn
submission, and the host delivers it as the user's own turn with the role fixed by
construction. What the host does **not** provide is the rest of Option C:

| Option C requires | Available? |
| --- | --- |
| A host-mediated submit the plugin can request | **Yes** — three doors, §10.1 |
| Delivered as the user's own turn, role not an argument | **Yes** — structural, §10.2 |
| An explicit preview showing the exact bytes | Plugin-side only |
| A **confirmation surface the card cannot fake** | **No** — §10.3 |
| Visible **attribution** that it came from a card | **No** — §10.4 |

So Option C is **half available**: the submission machinery is there and is better
than this ADR assumed, while the two properties that make it *safe to offer to a
user* are not. That is why the action stays refused.

## 5. Recommendation

**Option C, and only if the host provides an attributed submit API. Until then the
action stays refused.**

The properties that make it acceptable, all mandatory:

| Property | Requirement |
| --- | --- |
| **Preview is mandatory** | The exact bytes are shown before sending. A truncated preview is not acceptable: what is shown must equal what is sent, byte for byte. |
| **Role is not an argument** | The submit path accepts no role field at all. The message becomes the user's turn or it is not sent. |
| **Attribution is visible** | The delivered turn says it came from a card, with the card's path. A later reader must be able to tell it was not typed. |
| **All card content is untrusted** | Whatever its origin — a literal, a state variable, a computed expression — the message enters with no instruction authority. There is no provenance check because provenance cannot be established, so the design does not depend on one. |
| **One in flight** | A second send while one is pending is refused and says so. |
| **Per-card budget** | A bounded number per card, and the refusal names the limit. A loop exhausts it and stops. |
| **Length cap** | A stated maximum, refused rather than truncated. Truncation would silently alter what the user approved. |
| **Generic failures** | The error never echoes the message. |
| **Withdrawable** | Returning the name to `UNSUPPORTED_STEPS` disables it in one line, and the refusal test stays. |

### Why the provenance requirement was removed

The first draft of this ADR required the argument to be provably a literal or a
user-set variable, and asserted that no rendered untrusted content could reach it.
**That requirement is withdrawn, because it cannot be honoured.** The evaluator
does not track where a string came from; a check would have been a claim in a
document that the code could not enforce, which is worse than an acknowledged gap.

It is replaced by a position that does not need provenance: **all card-generated
content is untrusted, without exception.** A literal gets no more authority than a
value scraped from a rendered page, so there is nothing for a provenance check to
decide. What protects the user is not knowing where the text came from — it is
that the message can only arrive as an ordinary user-visible turn, after the host
showed it in full and the user chose to send it.

### What the confirmation must be

| Requirement | Why |
| --- | --- |
| **Host-rendered** | The card must not be able to draw the confirmation itself. A card that could fake the prompt could fake the consent. **[CORRECTED 2026-11-06: no plugin-callable host surface for this exists — see §10.3. The requirement is retained, unrelaxed; the owner explicitly rejected downgrading it to a card-rendered confirm.]** |
| **Shows the whole message** | What is approved equals what is sent, byte for byte. No truncation, no summarising. |
| **Names the sender** | The user sees that this came from a card, not from themselves. |
| **Cancellable without side effects** | Cancel sends nothing and leaves the card usable. |

### Consent does not raise the content's authority

A confirmed message is still just a message. It enters as a user turn in the
authorised session, with no tool permissions of its own, and it can never become a
`system` or `developer` message. The confirmation answers "did the user mean to
send this?"; it does not answer "is this content safe?", and the design must not
let the first answer imply the second.

### The submission path may not be improvised

**[CORRECTED 2026-11-06]** This heading read *"No submission path exists, and none
may be improvised"*, and the paragraph below it asserted that *"the host exposes no
plugin interface for submitting a turn"*. **That is false** — see §10.1. A native,
host-mediated submit path exists and is reachable from this plugin.

What survives unchanged, and is the point of the original paragraph, is the
prohibition: this action may **not** be implemented by manipulating the DOM,
synthesising input events, or driving the composer. Those routes would produce a
message the host did not mediate, could not attribute and could not refuse —
defeating every property in the table above at once. That remains binding, and it
is now a *choice* rather than a necessity: a native path exists, so there has never
been a reason to take a DOM-shaped one.

The action is **not** re-opened by the correction, because the native path does not
supply §10.3's unforgeable confirmation or §10.4's attribution. It re-opens when
both exist.

## 6. Security test matrix

Each row is a test that must exist and fail loudly if the behaviour regresses.

| # | Case | Expected |
| --- | --- | --- |
| 1 | Program names `@ToAssistant` on a Button | Nothing is sent; a preview would be required (or a refusal, while refused) |
| 2 | Action present on a non-interactive component | No preview, no send, no error thrown into render |
| 3 | Re-render while an action is pending | Exactly one confirmation surface; no duplicate |
| 4 | Cancel | Nothing sent; the card is unchanged |
| 5 | Send after cancel | Requires a new gesture; no cached approval |
| 6 | Two rapid clicks | At most one in flight; the second is refused visibly |
| 7 | Message over the cap | Refused with a stated reason; nothing truncated and sent |
| 8 | Failure path | Generic text; the message is not echoed |
| 9 | Unmount with a pending confirmation | Confirmation closes; nothing is sent later |
| 10 | Two cards | Each has its own confirmation and budget |
| 11 | Role field | Structurally impossible: the submit call has no such parameter |
| 12 | Loop | Budget exhaustion stops it and says so |
| 13 | Rollback | With the name back in `UNSUPPORTED_STEPS`, every case above becomes inert, and the refusal is asserted |

## 7. Browser acceptance criteria

1. A card with `@ToAssistant` shows a confirmation naming the exact text.
2. Cancelling leaves the conversation unchanged — asserted by comparing the
   message count before and after, not by reading a flag.
3. Sending delivers exactly one turn, as a user turn, with visible card
   attribution.
4. The delivered text equals the previewed text, compared byte for byte.
5. No message appears without a press on the confirmation's Send.
6. Reloading a card with the action shows nothing pending.
7. The fifth rapid press in a row is refused with the limit named.

## 8. Rollback

Return `ToAssistant` to `UNSUPPORTED_STEPS`. The dispatcher's refusal path already
exists and is already tested; the rollback is one line plus deleting the new code.
The confirmation surface is additive, so removing it cannot affect the other two
actions.

## 9. What this action can never do

- Send without a user pressing Send on a confirmation that showed the text.
- Send as any role other than the user's own turn.
- Read the conversation.
- Choose its own recipient or session.
- Act on another card's behalf.
- Retry itself after a failure.
---

## 10. Amendment 2026-11-06 — the stated reason was false; no requirement relaxed

Appended, not substituted. The text above records what was decided on 2026-11-05;
where it is now known to be wrong it is marked in place **and** corrected here.
Nothing was deleted.

**Full investigation:** `docs/reports/PHASE-4B-2-INVESTIGATION.md`.
**Evidence:** `evidence/4b2/`.

### 10.1 What was wrong: the capability exists, through three doors

The §1 claim that no turn-submit API exists is false against DSH 0.2.1-rc.5.

| Door | Path | Reachable because |
| --- | --- | --- |
| A | `ctx.conversation.send(text)` — `IConversation`, `dsh-client-ui-conversation/lib/types/client/service.d.ts:26-57`, impl `lib/client.js:4664-4670` | Needs a session-scope context |
| B | `conversation.input.for(scope).submit()` — `contract/input.d.ts:184`, impl `lib/client.js:15202-15256` | Needs a session-scope context |
| **C** | **`inputActions` — a declared standard prop carrying `submit()`** | **Already passed to this plugin's card** |

**Door C is the one that matters**, because it needs no lookup and no scope
juggling: `dsh-client-ui-slots/lib/types/index.d.ts:221,226` puts
`SessionStandardProps` inside `PropsRuntime`; `dsh-client-ui-conversation/
lib/types/client/contract/slots.d.ts:423-430` declares `inputActions: InputActions`
on it; `InputActions.submit(): void` is at `contract/input.d.ts:258`; and
`tool.call.toolview` — the slot this plugin's card registers under — is
`scope: 'session'`. **The card already receives the submit capability as a prop.**

The mechanism behind doors A and B is one line of cordis: `get()` returns a
caller-scoped proxy (`cordis/lib/index.js:763-765`, trap at `:128`), so
`ctx.sessions.scope(id)` yields a real session-scope context
(`dsh-api-session-controller/lib/types/client/sessions/service.js:365-367`).
**This plugin already relies on that chain** — `src/client/prompt-bridge.ts:122-163`
resolves the composer facade through it and calls `setDraft`/`focus`/`notify`
today. It simply never called `submit`.

### 10.2 One requirement turned out to be stronger than assumed

§5's mandatory property **"Role is not an argument"** is not merely satisfiable —
it is **enforced by the host, structurally**:

- `dsh-api-session-controller/lib/index.js:3218-3231` — the node entry builds the
  source itself: `const source = { kind: "user", rpcId: request.requestId, ...principal }`.
  The wire request has **no** `source` and no `role` field to send.
- `:925-951` — `createUserMessage({ content, source })` then
  `agent.followup(message)` (or `agent.steer` in steer mode).
- `dsh-llm MessageSourceMap` (`lib/typert.host.js:476`):
  `'user-rpc': { kind: 'user'; rpcId; ... }` — **user-rpc *is* kind:'user'**.
- `system`/`developer` are separate, separately-validated event families
  (`dsh-session/lib/types/surface.d.ts:90-96`). No `prompt`-shaped wire type
  produces either.

**T7 in the 4B threat model is therefore mitigated by the host, not by us.** That
should be recorded as a guarantee we can rely on rather than assert.

### 10.3 What is genuinely missing (1): a confirmation the card cannot fake

§5 requires the confirmation to be **host-rendered**, because *"a card that could
fake the prompt could fake the consent."* **No plugin-callable surface for this
exists.**

There *is* a host-styled approval panel
(`dsh-client-ui-approval/lib/client.js:344-354`), but it is driven by the host's
approval waterfall — `ctx.remote.$on("approval/request", …)` (`:355-357`) — with
answerers composed by the deployment. `dsh-user-approval` states that *"the service
itself never prompts a human"*, and `request()` **throws outside an open turn**
(`lib/types/index.js:121-127`). `dsh-user-questions` is a tool-side service keyed
by `ToolCallId`.

A plugin can render a *host-styled* dialog in a session-scope slot. It is still the
card's own surface, so it is **exactly the thing this ADR forbids**. The owner has
explicitly rejected downgrading this requirement to "card-rendered, exact bytes":
a card's content may be model-generated, it cannot prove its confirmation UI belongs
to a trusted host, and a card-drawn confirm does not solve attribution either.

### 10.4 What is genuinely missing (2): attribution

§5 requires the delivered turn to say it came from a card. **No host capability
delivers this.** The only distinguishing field is `rpcId` (+ optional `principal`),
and the transcript never renders it: in `dsh-client-ui-chat/lib/client.js` it appears
at `:2722-2737`, `:2826-2841` and `:2846-2847`, all three using it purely to
**suppress duplicate optimistic echoes**. A grep for `user-rpc` across `ui-chat`
and `ui-conversation`: **zero rendering hits**. A message submitted this way is
indistinguishable from typed input.

### 10.5 Two implementation traps, recorded so they are not rediscovered

1. **`InputState.phase` is useless as an in-flight guard.** A plain (non-command)
   send sets `phase` and leaves it `'plain'` for the whole flight —
   `beginDetached` (`lib/client.js:5148-5155`) and `onEnter`'s default branch
   (`:5168-5191`) never reach `'submitting'`. A guard keyed on it is permanently
   open. Use `running`/`pendingSubmissions` (`SessionSnapshot`,
   `dsh-cordis-client-runner/lib/client.js:2210`), whose echo is appended
   **synchronously before the first await**
   (`dsh-api-session-controller/lib/types/client/sessions/session.js:148-163`).
2. **An archived session accepts the prompt, then blocks the turn**
   (`archived-session-gate.js:17-25`). Optimistic card UI would lie about delivery.

### 10.6 The node-side path exists and is rejected

`agents.get(id).followup(msg)` is real (`agent-loop.js:800-814`), and this repo
already uses the sibling `steer` (`src/self-repair.ts:402-418`). It is **worse on
every axis that matters**: it bypasses composer mediation, bypasses the
`rpcId`/`principal` audit trail, forces the plugin to *forge* a message source, and
inverts the authority relationship — the plugin becomes the submitter instead of
asking the host to submit. **Rejected.**

### 10.7 The decision, and what is authorised next

**`@ToAssistant` stays refused. Every §5 requirement is retained, unrelaxed.**

Authorised, as an **isolated runtime probe only** — not an implementation:

1. From a card's own context, read `typeof inputActions.submit`.
2. In a dedicated test session, perform one controlled submission.
3. Confirm the message reaches the intended session.
4. Observe repeated clicks, session switching, and failure behaviour.
5. **Do not** wire it into the action registry, and **do not** make it reachable by
   a program or available to users by default.

> **Note on what step 1 can prove.** Reading `typeof` proves a function exists at
> runtime. It says nothing about whether submitting is correct, attributed, or safe.
> Steps 2–4 are what test behaviour; step 1 only rules out an absent value.

**Release still requires** both of §10.3 and §10.4. The upstream ask is therefore
narrow and specific — it may be satisfied by an existing host mechanism this
investigation did not find, not necessarily a new API:
a **plugin-callable confirmation surface the card cannot forge**, and a **message
source that is rendered as card-originated**.

**Evidence grade: Read and Type only.** The type claim was checked with a positive
probe, a satisfied `@ts-expect-error` negative control, and a mutation that fails
with `TS2339 … does not exist on type 'InputActions'`
(`evidence/4b2/inputactions-type-probe.*`). **No runtime submission was
performed**, and nothing here is claimed as verified behaviour.

---

## 11. Amendment 2026-11-07 — Stage 7A re-read the **installed** host

Appended, not substituted. §10 read `tmp/dsh-host-src`, which is DSH **0.2.1-rc.5**; the
installed desktop host is **0.2.2-rc.1** (asar header; 331 `@deepseek-ai` entries, 321 `dsh-*` at 0.2.2-rc.1). Every
`file:line` in §10 is therefore from a tree that is not running. Stage 7A re-derived the
§10.3/§10.4 blockers against the installed host:

| §5 property | §10 said | Against 0.2.2-rc.1 |
| --- | --- | --- |
| A host-rendered confirmation the card cannot fake | no plugin-callable surface | **available in source** — `ctx.userQuestions.ask()` is a host service with no turn check, rendered in the host composer outside the card iframe (`evidence/stage-7a/confirmation-and-openurl.md`); the browser answerer requires the live root agent, so between-turn availability is a Stage 7B gate. The approval panel is a second, audited surface but throws outside an open turn, so it cannot serve a card click between turns |
| Attribution visible on the delivered turn | no host capability | **still absent** — the prompt wire has no provenance field and the host builds `kind:'user'` (`dsh-api-session-controller/lib/index.js:4048-4061`); the transcript renders no marker |
| Role is not an argument | host-enforced | still host-enforced |

**One of the two stated blockers is superseded; no requirement is relaxed and the action
stays refused.** The open decision — including the recommended shape of the remaining
upstream attribution change — is `ADR-016-TO-ASSISTANT-STAGE-7A.md` (Proposed, awaiting the
owner); the full investigation is `docs/reports/STAGE-7A-HOST-CAPABILITIES.md`.

Also superseded by the version change: `dsh-client-ui-slots` no longer exists as a package
(its `SlotCore` is a web-shell builtin), 0.2.2 packages ship no `.d.ts`, and
`dsh-action-cards` is a new host mechanism (post-turn, model-proposed — not a general
confirmation channel).

