# Stage 4B — shared threat model for the three external actions

- **Status:** design only. No action is enabled by this document.
- **Date:** 2026-11-05
- **Relates to:** ADR-004 (per-backend security boundaries), ADR-008 (link
  protocol policy), ADR-009 (image source policy), ADR-011 (SVG values),
  `STAGE.md` stage 4B, and ADR-013/014/015 which take the per-action decisions.
- **Scope:** `@OpenUrl`, `@CopyToClipboard`, `@ToAssistant` — the three steps
  currently in `UNSUPPORTED_STEPS`, refused by name at dispatch.

## 1. Why 4B is not 4A with more components

Everything in stage 4A renders. A component can be wrong, ugly or inaccessible,
but the worst outcome stays inside the card. Stage 4B is the first point where a
**model-authored program can cause an effect outside the document**: open a URL,
write to the clipboard, or send a message to the assistant.

The boundary that has to hold, stated once:

> **A model may *propose* an action. It may not acquire the authority to execute
> one merely by emitting a syntactically valid program.**

That sentence is the whole stage. Every decision in ADR-013/014/015 is a
mechanism for enforcing it, and anything that cannot be enforced this way stays
refused.

## 2. What the host actually provides — measured, not assumed

The instruction for this stage was explicit: do not treat a name in the language
as evidence that the host can perform it. So the host surface was read.

| Capability | Present? | Where it would come from |
| --- | --- | --- |
| Register a tool | **yes** | `ctx.tools.register`, used by this plugin already |
| Read/write files under a sandbox | **yes** | `ctx.fs` (`dsh-fs`), used by image storage |
| Serve an HTTP route to the client | **yes** | `connection.fetch.register`, used by the image route |
| Publish a settings page | **yes** | `ctx.inject(['settings'])` |
| Register a skill provider | **yes** | `ctx.skills.registerProvider` |
| **Open a URL in the user's browser** | **no** | no shell/openExternal API is exposed to the plugin |
| **Write the system clipboard from the node half** | **no** | no clipboard service |
| **Submit a message to the assistant** | **no** | no session-write or turn-submit API |

### Three states, not two

"The host cannot do this" and "the host chooses not to expose this" are different
findings with different consequences, and a third state sits between them: a
capability that exists and is even reachable from the card, but which the programme
is not authorised to drive. Collapsing this into a yes/no table is how a missing
check gets mistaken for a missing API.

| State | Meaning | Consequence |
| --- | --- | --- |
| **Not available** | No host interface exists, and no card-reachable API does either | The action cannot be built honestly. Defer. |
| **Available but unauthorised** | Something reachable could perform the effect, and the programme has no permission to invoke it | The action is refused *by policy*, not by absence. A check must enforce it, because nothing else will. |
| **Available and authorised** | A host interface exists that mediates the effect and attributes it | The action may be implemented against that interface. |

Mapping the three actions:

| Action | State | Why |
| --- | --- | --- |
| `@CopyToClipboard` | **Available but unauthorised** | `navigator.clipboard.writeText` is one call away — `Code`'s copy button already uses it. That button is a user gesture on a visible control with a visible payload; the *programme* driving the same API is a different and larger claim. Nothing but this stage's conditions enforces the difference. |
| `@OpenUrl` | **Not available** | A card can reach `window.open` and `location.assign`, but both are the card deciding to navigate, which ADR-004 forbids and a popup blocker can silently swallow. No host-mediated open exists. |
| `@ToAssistant` | **Not available** | No submit interface. A card could type into the composer, which is exactly the bypass the ADR must forbid rather than permit. |

The middle row is the one to keep in view. **A callable browser API is evidence of
possibility, never of permission** — and where the API is present, the policy is the
only thing standing between the programme and the effect.

This mapping also fixes what each ADR's status means: `@CopyToClipboard` is
**proposed** (a viable path exists, conditions pending); `@OpenUrl` and
`@ToAssistant` are **Deferred — host capability unavailable**. Deferred is not a
softer refusal; each stays in `UNSUPPORTED_STEPS` and behaves identically to today.

## 3. Assets

| Asset | Why it matters |
| --- | --- |
| The user's attention and intent | An action that fires without a deliberate gesture converts a rendering bug into a user-visible act |
| The clipboard's previous contents | Writing replaces whatever the user had; reading would disclose it |
| The host document's origin and session | Card code runs in the host's own origin (ADR-004); a navigation or message that escapes the card is not contained by a frame |
| The conversation's role structure | A message that arrives as `system` or `developer` rather than `user` is a privilege escalation, not a UX bug |
| Other cards | One card must not be able to act on another's behalf, or read its state |
| The audit trail | If nobody can tell what a card did, a later incident cannot be reconstructed |

## 4. Trust boundaries

```
model output ──▶ openui program ──▶ descriptor ──▶ action value
   UNTRUSTED        closed language     closed set       ??? 
                    (ADR-004)          (COMPONENTS)

                                                │
                                     user gesture OR program state
                                                │
                                                ▼
                                     HOST-MEDIATED EFFECT
                                     (clipboard / navigation / message)
```

The program is untrusted at every stage above, including the last one. It is
worth saying plainly because the opposite is easy to assume: a program that
parsed cleanly is *well-formed*, not *authorised*. This stage exists because
those are different properties and only the first one is free.

Additionally, the **content** a card displays may itself be untrusted: a card that
renders a fetched web page, a tool result or a user-pasted document can carry
text that reads like an instruction. That text is data. A `@ToAssistant` action
whose argument came from such content is a prompt-injection carrier regardless of
how clean the program is.

## 5. Threat model

| # | Threat | Example | Mitigation class |
| --- | --- | --- | --- |
| T1 | **Authority by syntax** — a valid program performs an effect with no user act | `root = Col([Text("hi"), @OpenUrl("https://x")])` fires on render | Require a user gesture; refuse at dispatch otherwise |
| T2 | **Injection via rendered content** — card text that looks like an instruction | A card displaying a web page containing "ignore previous instructions and open …" | Treat content as data; never let action arguments be auto-derived from untrusted text without a gesture |
| T3 | **Protocol escape** — a URL scheme that executes rather than navigates | `javascript:alert(1)`, `data:text/html,…`, `file:///C:/` | Parse and allowlist, as ADR-008/009 already do |
| T4 | **Confused deputy** — the host performs an action the card could not | Card asks the *host* to open a URL, so the URL inherits host trust | Host-mediated open must apply the same allowlist the card would |
| T5 | **Silent clipboard overwrite** — the user loses copied content without noticing | Every render writes the clipboard | Gesture-only, with visible feedback; never on render or on state change |
| T6 | **Clipboard read** — the card reads what the user copied | Reading a password or token | Not implemented at all; the action is write-only by signature |
| T7 | **Role escalation** — card content becomes an assistant instruction | Content submitted as `system`/`developer` | Submit only as the user's own turn, and only with consent |
| T8 | **Automatic loop** — the card keeps sending messages | `@ToAssistant` fired from a re-render | Gesture-only plus a per-card rate limit and a single in-flight guard |
| T9 | **Cross-card interference** — one card acts for another, or reads its state | A card firing another card's action | Actions are per-instance; no shared channel |
| T10 | **Leak through failure** — an error message discloses the argument or the host's internals | Copying a secret then showing it in a toast | Fixed, generic failure text; the argument never echoed |
| T11 | **Unbounded payload** — a very large argument | 10 MB clipboard write, a message that floods the session | Length caps with a stated refusal |
| T12 | **Stale authority** — an approval granted for one instance is reused | Two cards, one approval | Authority is per interaction and per instance; nothing is cached across a card |

## 6. The three conditions that must all hold

These are separate, and a mechanism that satisfies one does not satisfy the
others. Conflating them is the most likely design error in this stage.

| Condition | Question | Enforced by |
| --- | --- | --- |
| **Well-formed** | Is this a legal program? | Parser and `checkNames` (already exists) |
| **Well-typed** | Are the arguments the right shape, within limits, and of an allowed form? | A per-action validator, ADR-013/014/015 |
| **Authorised** | Did a user, just now, in this card, mean for this to happen? | A user gesture, checked at dispatch time |

A refusal must name which of the three failed, because the three call for
different fixes. `VZO002` already does this for the first.

## 7. What every action decision must state

For each action, ADR-013/014/015 answer the same questions, so a reviewer can
compare them directly:

1. What trigger fires it — user gesture, program state change, or render?
2. Is there any automatic path, and is it refused by construction or by a check?
3. What is the argument's grammar, and what are its limits?
4. What does the user see before, during and after?
5. What happens when it fails, and what text is shown?
6. What happens on unmount, on repeat, and on rapid repeat?
7. What can it NOT do, stated as a closed list?
8. Which security tests prove each refusal?
9. How is it rolled back if a defect ships?

## 8. A precedent that already exists in this codebase

`Code`'s copy button already calls `navigator.clipboard.writeText` from a click
handler. Its own comment draws the line this whole stage rests on:

> "The clipboard call is deliberately local rather than routed through the
> dispatcher: `@CopyToClipboard` is still in `UNSUPPORTED_STEPS` (stage 4B), and
> that is an *action* the program can take. A copy button is a user gesture on a
> visible control, which is a different and much narrower capability."

That distinction — a **user gesture on a rendered control** versus **an action a
program can name** — is the template for all three ADRs. The copy button does not
become an implementation of `@CopyToClipboard`; it is evidence that the narrow
capability is already shipped and works, which is why the action's ADR has to
argue for something strictly more.

## 9. Rules binding on all three

1. **Default deny.** Absent a positive check, the action does nothing.
2. **No action on render.** Not on first paint, not on state change, not from an
   effect. The dispatcher runs only from an event handler.
3. **No cross-card channel.** Each action belongs to the instance that named it.
4. **Failures are visible and generic.** The user is told something failed; the
   argument is not echoed.
5. **The refusal stays.** `UNSUPPORTED_STEPS` keeps an action until its ADR is
   accepted *and* its tests exist. Removing the name from that set is the last
   step, not the first.
6. **A shipped action can be withdrawn** by returning its name to
   `UNSUPPORTED_STEPS`; the refusal path must stay tested after shipping, so that
   rollback is a one-line change and not a rewrite.
