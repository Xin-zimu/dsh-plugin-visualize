# ADR-016 — `@ToAssistant`: one host change left, and what it must be

- **Status:** **Accepted — Option B (owner, 2026-11-07).** Gate 2 (real-host
  pre-validation on DSH 0.2.2-rc.1) is **done** and passed for B's confirmation half, with
  three measured limits recorded in §12. Gate 3 (upstream provenance change) has not
  happened; **no product implementation is authorised until it lands**, and the action stays
  refused in the meantime.
- **Date:** 2026-11-07 (Stage 7A)
- **Supersedes:** ADR-015's *stated blockers*, not its requirements. ADR-015 remains the
  normative list of mandatory properties; this ADR re-derives the capability status against
  the **installed** host and narrows the upstream ask.
- **Evidence:** `docs/reports/STAGE-7A-HOST-CAPABILITIES.md` + `evidence/stage-7a/`.
- **Relates to:** ADR-004 (boundaries), ADR-014 (`@OpenUrl`, unchanged), ADR-015,
  `src/client/openui-actions.ts`, `src/client/prompt-bridge.ts`.

## 1. Context — what changed since ADR-015

ADR-015 §10 concluded `@ToAssistant` needed **two** host capabilities: a host-rendered
confirmation the card cannot fake, and message attribution. Stage 7A re-read the host and
found three things:

1. **The 4B-2 baseline was the wrong host.** It read `tmp/dsh-host-src` = DSH **0.2.1-rc.5**;
   the installed desktop host is **0.2.2-rc.1** (`dsh-desktop`; 331 `@deepseek-ai` entries,
   321 of them `dsh-*` at 0.2.2-rc.1, the other 10 independently versioned). Every old
   `file:line` is stale.
2. **The confirmation requirement has a source-level answer without a host change.**
   `ctx.userQuestions.ask()` is a host-side service any plugin can call; the service has
   **no turn check**, the host renders the question in its own composer UI (outside the card
   iframe), and returns the user's answer to the caller. `dsh-base` composes the host half
   (`dsh-base/cordis.patch.yml:79-80`), `dsh-web-app` the browser half
   (`dsh-web-app/cordis.patch.yml:461-462`). **Three conditions are unverified and are
   Stage 7B gates:** the browser answerer needs the live root agent and a resolved session
   scope (`ctx.sessions.scopeOf(owner)`; an unscoped ask ends `NO_PROVIDER`); `detail` is
   re-rendered through `MarkdownText`, so preview bytes may not equal submitted bytes; and a
   direct ask leaves no durable decision record. The approval panel (via
   `tools/pre-execute → {kind:'ask'}`) is a second, audited surface, but it **throws outside
   an open turn** and therefore cannot serve a card click between turns.
3. **The attribution requirement is still not available.** The prompt wire schema has no
   source/role/origin field; the host hardcodes `{kind:'user', rpcId, clientTimeZone,
   principal}` (`dsh-api-session-controller/lib/index.js:4048-4061`); `MessageSourceMap` has
   no card kind; a `'user'` message renders as a plain unattributed bubble. A submission is
   still indistinguishable from typing.

So the question is no longer "does the host have a confirmation surface?" (it does) but
"how narrow can the remaining upstream ask be?" — and whether the product accepts the
residual limits.

## 2. ADR-015's mandatory properties, re-scored

| # | Property (ADR-015 §5) | Status against 0.2.2-rc.1 | Needs host change? |
| --- | --- | --- | --- |
| 1 | Preview mandatory, exact bytes | plugin can pass the exact text as `userQuestions.ask` `detail`; display goes through `MarkdownText`, so byte-equality of the preview is unverified; long-text layout untested | no |
| 2 | Role is not an argument | **host-enforced** — the client cannot send a role/source; the host builds `kind:'user'` | no |
| 3 | **Attribution is visible** | **absent** — no provenance field, no renderer, no source kind | **yes** |
| 4 | All card content is untrusted | design invariant; enforced by the frame → plugin boundary | no |
| 5 | One in flight | plugin-side (host half can hold the latch across the whole round trip) | no |
| 6 | Per-card budget | plugin-side, keyed by `(sessionId, callId)` | no |
| 7 | Length cap | plugin-side; must also fit the confirmation UI at long lengths | no |
| 8 | Generic failures | plugin-side | no |
| 9 | Withdrawable | one line back into `UNSUPPORTED_STEPS` | no |
| C1 | Confirmation host-rendered, card cannot fake | **verified in Gate 2** (real host, before and after a turn) via `userQuestions.ask`; host chrome outside the iframe | no |
| C2 | Shows the whole message | **byte-equal on the title path** (Gate 2); long text is visually clipped at 68 px by default, so the length cap must fit that preview or accept one expand click | no (measured cap) |
| C3 | Names the sender | the question text is plugin-authored ("from card…"); host does not know the card | no |
| C4 | Cancellable without side effects | the answer returns to the caller; nothing is sent until the plugin acts | no |

## 3. Options

### Option A — implement on today's host, no upstream change

Card click → plugin host half calls `ctx.userQuestions.ask()` with the exact text → on
approve the plugin submits through the mediated path (`session.prompt` via a retained
session, with a client-minted `requestId`) → result relayed back to the card. Cost: only
plugin code. Consequence: **the delivered message is a normal user turn with no marker on
it.** To keep "a later reader can tell it was not typed", the plugin could append a
separate context notice row (the `dsh-action-cards` / `createUserMessage` pattern), but that
is a *different* turn, not attribution on the delivered message.

**Rejected under the current requirements**: ADR-015 §5 requires the delivered turn to say
it came from a card, and the owner explicitly declined to downgrade that. It remains the
fallback if the owner ever accepts a notice-row UX.

### Option B — one upstream change: host-validated card provenance (recommended)

Everything in Option A, plus one addition to the prompt admission path and one renderer:

1. **Wire:** the `session/prompt` request gains an optional claim, e.g.
   `origin?: { kind: 'card'; callId: string }`. It carries **no** session, role, source
   kind or principal — the client may not name any of those.
2. **Host validation:** the named `callId` must be a logged `tool/call` in the **resolved**
   session (the host resolves the session itself; the claim cannot redirect it). Reuse the
   `dsh-action-cards` `act()` discipline: the locator is validated against the log, never
   trusted as a credential.
3. **Source:** the host records the origin on the durable message source (a new
   `MessageSourceMap` member, or an optional field on `'user'`).
4. **Render:** `dsh-client-ui-chat` shows it on the user bubble ("sent from a card", tool
   call id; the card's file path is plugin meta, so the plugin can put the path in the
   message text it asks the user to approve, or the host renders only the call id).
5. **Trust:** display-only, never authorisation. The gateway peer/principal remains the
   authority; a forged claim buys a badge, not a capability. The iframe cannot reach
   `session.prompt` at all, so only the plugin's trusted page code can set the claim.

Effort: one schema field + one server-side log check + a source kind + one bubble badge.

### Option C — two upstream changes: also a dedicated confirmation API

Option B plus a first-class, turn-independent confirmation surface that is message-bound
and audited: the host takes a **reference** to the text being approved (or a submission
token) and renders host-read bytes at decision time, writing a decision event. This removes
the "caller supplies the text" residual and the "no decision audit event" gap in
`userQuestions`, and survives future UI churn.

Cost: a new host surface; more upstream goodwill; not needed to satisfy ADR-015 as written.

### Option D — rejected outright

- Node-side `agent.followup` / `agent.steer` as the submission path: bypasses composer
  mediation and the `rpcId` audit trail, inverts authority, forces the plugin to forge a
  source. (Re-read: `session.prompt` is the mediated path; use that.)
- Card-drawn confirmation: the card is model-authored; a card that can draw the consent
  can fake it. ADR-015 §5 forbids it, and the owner declined the downgrade.
- DOM / synthetic input / composer manipulation: forbidden and unnecessary — a native path
  exists.

## 4. Comparison

| | A (plugin-only) | **B (one host change)** | C (two host changes) |
| --- | --- | --- | --- |
| Delivered turn marked "from a card" | **no** | **yes** | yes |
| Code needs `UNSUPPORTED_STEPS` change | yes | yes | yes |
| Host work required before shipping | none | small | medium |
| Confirmation card cannot fake | source-level yes (`userQuestions`); between-turn live-root unverified | same, verified in 7B | yes (dedicated) |
| Host-read exact bytes | no (caller text) | no (caller text) | yes |
| Decision audit event | no | no | yes |
| Meets ADR-015 §5 unchanged | **no** | **yes** | yes |
| Fits a patch release | — | yes (after host work) | no |
| **Compatibility cost** | none today; must note the host is 0.2.2-rc.1 while the plugin compiles against 0.2.1-rc.5 (`peerDependencies: ^0.2.1-0` does not admit `0.2.2-rc.1` under strict semver; 0.2.2 ships no `.d.ts`) | same skew, plus a new wire field the plugin can only type via its own declaration until upstream types exist | same, plus a new confirmation contract to type and version |

## 5. Recommendation

**Option B.** The remaining upstream ask is a single, small, durable change; everything
else — submission, role enforcement, and a host-rendered confirmation in source — exists in
0.2.2-rc.1 (the confirmation's between-turn availability is a Stage 7B gate, listed in
§10.1). Ask for Option C's extra surfaces only if upstream prefers to land a complete
confirmation concept rather than a provenance field alone.

Do **not** ship Option A under the current requirements. If upstream declines B, the action
stays refused, and this ADR records why.

## 6. Plugin-side design if B is approved (Stage 7B, not authorised yet)

Trust boundary first:

- The frame may send **text only**, through the existing `postMessage` relay (source check +
  token + focus/user-activation, length-capped).
- The parent attaches `sessionId` (its slot prop) and `callId` (tool owner prop) from its own
  context; **neither ever comes from the frame**.
- The host half re-validates `(sessionId, callId)` against the session log and that the call
  is this plugin's `visualize` tool result, before asking the user.
- One in-flight latch and a per-card budget live in the host half, keyed `(sessionId,
  callId)`; the client half is untrusted for those limits.

Flow: click → relay → client half calls the host half (authenticated plugin channel) → host
validates → `userQuestions.ask({ questions, agent, signal })` for the session's **live root
agent** (the browser answerer answers only a scoped request, so the exact live root is a
gate, not an assumption) → on Send the **client half** submits through the mediated Remote
(`sessions.retain(...).binding.session.prompt(content, 'queue', signal, requestId)` +
`origin:{kind:'card', callId}` once upstream lands) → `{accepted:true}` relayed to the card;
failures are generic.

The wait must be bounded: `ask()` blocks, so the plugin passes an `AbortSignal` and treats
an abort as "cancelled / no answerer". (`askTimed(request, callId, timeoutMs)` exists for a
callId-keyed foreground wait, but it requires the same live root and a call id; use it only
if 7B finds a reason to.)

Details to decide in Stage 7B: the channel between the plugin's two halves (a Remote or an
authenticated route — this plugin already registers routes), how the card displays
"accepted / failed", the exact length cap (must fit the confirmation rendering), and how the
Markdown re-render of `detail` is shown to equal the submitted bytes.

## 7. Security test matrix (extends ADR-015 §6)

New cases forced by this design; all must exist and fail loudly:

| # | Case | Expected |
| --- | --- | --- |
| 14 | Frame sends a payload naming another session/call id | ignored; parent-supplied identity wins, or the message is refused |
| 15 | Card from session A, click after switching to session B | host validation refuses or scopes to A; never sends to B |
| 16 | `callId` that is not a logged `visualize` call in that session | refused before the confirmation appears |
| 17 | Forked session: inherited `callId` reused | attribution resolves to the fork; no cross-session submission |
| 18 | Archived session | refused with a stated reason, or accepted only after the host rejects archived prompts |
| 19 | Confirmation cancelled | nothing submitted; card remains usable |
| 20 | Confirmation timeout / answerer gone | generic failure; no submission, no leaked text |
| 21 | Double click while a confirmation is pending | one confirmation, one in flight, second refused visibly |
| 22 | Budget exhausted | refused, limit named |
| 23 | Exact-bytes equality | the text shown in the confirmation equals the submitted content byte for byte |
| 24 | Attribution claim forged by a non-card path | display-only; no authority change; host validation rejects an unknown callId |
| 25 | Long message over the cap | refused before confirmation; never truncated |

## 8. Acceptance criteria (Stage 7B, after approval)

1. The host change is in place and the message source records the validated card origin.
2. A card button opens a **host-rendered** confirmation outside the card iframe; the card
   cannot draw it, and a screenshot shows the exact text.
3. Cancel sends nothing (message count unchanged); Send delivers exactly one user turn.
4. The delivered text equals the confirmed text byte for byte.
5. The delivered turn visibly says it came from a card.
6. No message appears without a press on the host confirmation.
7. Two rapid clicks produce at most one send; the budget refusal names the limit.
8. Reload leaves nothing pending; a stale card cannot send after a session switch.
9. `@ToAssistant` back in `UNSUPPORTED_STEPS` makes every case inert, and the refusal test
   stays.

## 9. Rollback

Return `ToAssistant` to `UNSUPPORTED_STEPS`; the dispatcher refusal path already exists and
is already tested. The confirmation/submission code is additive and does not touch the
other actions.

## 10. Open questions

1. **Live agent during an idle session — RESOLVED in Gate 2.** On the real host an open
   session keeps a live idle root between turns: ask returned in 1,340 ms before any turn
   and 2,030 ms after a turn ended.
2. **Confirmation layout and Markdown re-render at long text — MEASURED in Gate 2.** The
   title is rendered as plain text (byte-equal), but long text is visually clamped at
   68 px with an `展开` toggle; the length cap must be chosen against that limit.
   (`detail` is not used by this design.)
3. **What the host renders as attribution.** The card's file path is plugin meta and cannot
   be host-verified. Decide whether the host shows "sent from a card" + tool call id and the
   plugin carries the path in the approved text.
4. **`userQuestions` has no durable decision record for a direct ask.** The tool-call
   projection covers only the `ask_user_question` tool; a plugin's own `ask()` leaves
   nothing durable. Acceptable for consent? Option C would fix it; say so explicitly if
   accepted without it.
5. **Upstream shape.** Provenance as a field on `'user'` versus a new `MessageSourceMap`
   member — the ADR does not prescribe, only the validation and rendering requirements.

## 11. What this ADR does not authorise

It does not change `UNSUPPORTED_STEPS`, does not add a card↔host channel, does not touch
the dispatcher, and does not move the tag or release anything. Implementation starts in
**Stage 7B Gate 4**, only after the owner's decision here **and** the upstream provenance
change of §3.

---

## 12. Gate 2 — real-host pre-validation (executed 2026-11-07)

Owner decision: "先验证现有确认机制在真实 DSH 中能否正常工作，再向上游提出修改请求."
Evidence: `evidence/stage-7b/real-host/` (isolated DSH 0.2.2-rc.1 host, `tmp/dsh-022`,
profile `p22web`, real model turns, bsk/CDP). The probe (`tmp/v7b-probe/`) is test-only.

| Gate 2 question | Verdict |
| --- | --- |
| Can `userQuestions.ask()` run **outside a turn**? | **Yes.** Before any turn (idle agent, no turn ever run) it returned in 1,340 ms; after a real turn ended it returned in 2,030 ms. Host-rendered card, options, and 提交 button all present. C1 is now **verified**, not merely source-read. |
| Confirmation bytes vs submitted bytes | **Byte-equal on the question-title path**, including `**bold**`, backticks, `<b>`, `&`, emoji and newlines — the title is rendered as text, not Markdown. The durable `user/message` after submitting the same string is byte-equal too. **Limit:** long text is visually **clipped at 68 px** by default (`scrollHeight` 222 px for 10 lines) with an `展开` toggle; the 7B length cap must fit the measured preview or accept one expansion click. |
| Cancelled confirmation | Returns the answer to the caller; nothing is submitted. Verified with the Cancel option. |
| Archived session | **Trap confirmed.** The prompt returns `{accepted:true}` in 13 ms, then `turn/start` and `turn/end {kind:'blocked'}` with **no `user/message` appended and no error**. `{accepted:true}` must never be reported as delivery. Archiving the open session also removes its composer/view. |
| Duplicate submission | **No content dedupe.** Two identical prompts with different `requestId`s produced two `user/message` events (host idempotency is `rpcId`-keyed only). The one-in-flight latch must be plugin-side. |
| Result observability | Admission only from the call. A **plugin** can verify delivery from the durable log: `user/message` with its `rpcId`, `turn/start`, `turn/end.reason`. The card itself has no channel. |

**Design consequence (new, binding on 7B Gate 4):** the plugin must report
"sent, delivered/unconfirmed" from a durable observation, never from `{accepted:true}`:
after submission, watch for the caller's `rpcId` in `user/message` and a `turn/start`; a
`turn/end {blocked}` without the message is "not delivered". Generic failure text otherwise.

**Compatibility finding (independent issue, owner-prioritised).** This repo's plugin
**runs** on 0.2.2-rc.1: `visualize` was called and its OpenUI card rendered end to end
(`compat-card.png`, `compat-15-events-turn4.json`), the style route answered 200, and the
installed bundle equals the build (`E1BF4A82…`, 450,559 B). But `pnpm peers check` **fails**
(unmet peer `@deepseek-ai/cordis`: installed 4.1.0 vs `~4.0.5` wanted by 0.2.1-rc.5 copies
pnpm resolved into the profile), and `peerDependencies: ^0.2.1-0` does not admit
`0.2.2-rc.1` under strict semver. Runtime compatibility is proven; **declared**
compatibility is not, and the ranges must be updated before support is claimed.