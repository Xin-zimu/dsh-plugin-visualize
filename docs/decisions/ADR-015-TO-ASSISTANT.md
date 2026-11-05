# ADR-015 — `@ToAssistant`: sending content to the assistant

- **Status:** **Deferred — trusted host submission capability unavailable.** The
  action stays refused, and no interim implementation is written.
- **Date:** 2026-11-05
- **Relates to:** `ADR-4B-THREAT-MODEL.md`, ADR-004 (boundaries), ADR-006
  (`$state` persistence), `src/client/openui-actions.ts`

> This ADR is written last of the three intentionally and is placed first in
> importance: it is the highest-risk action, and reading it should decide whether
> the other two are worth having.

## 1. Current state

`@ToAssistant` is in `UNSUPPORTED_STEPS`. `applyAction` recognises the name and
refuses it, so a Button carrying it is inert. Nothing in the plugin can submit a
turn: there is no session-write or turn-submit API on the host surface this plugin
is given (threat model §2).

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

This needs a host capability that does not exist yet: a way for a plugin to
request a turn submission that the host mediates and attributes. `ADR-4B-THREAT-
MODEL.md` §2 records that gap; this option is what would fill it.

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
| **Host-rendered** | The card must not be able to draw the confirmation itself. A card that could fake the prompt could fake the consent. |
| **Shows the whole message** | What is approved equals what is sent, byte for byte. No truncation, no summarising. |
| **Names the sender** | The user sees that this came from a card, not from themselves. |
| **Cancellable without side effects** | Cancel sends nothing and leaves the card usable. |

### Consent does not raise the content's authority

A confirmed message is still just a message. It enters as a user turn in the
authorised session, with no tool permissions of its own, and it can never become a
`system` or `developer` message. The confirmation answers "did the user mean to
send this?"; it does not answer "is this content safe?", and the design must not
let the first answer imply the second.

### No submission path exists, and none may be improvised

The host exposes no plugin interface for submitting a turn (threat model §2). That
absence is binding: this action may **not** be implemented by manipulating the DOM,
synthesising input events, or driving the composer. Those routes would produce a
message the host did not mediate, could not attribute and could not refuse —
defeating every property in the table above at once. When the interface exists,
this ADR is re-opened; until then the action is refused.

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
