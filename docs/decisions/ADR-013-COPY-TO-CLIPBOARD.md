# ADR-013 — `@CopyToClipboard`: writing the clipboard

- **Status:** **proposed — the one action with a viable path. Still NOT accepted;
  the action stays refused until its conditions are implemented and tested.**
  ADR-014 and ADR-015 are both Deferred for want of a host capability. This one is
  not, and the difference is worth stating: the capability it needs already exists
  in the browser and is already used by `Code`'s copy button.
- **Date:** 2026-11-05
- **Relates to:** `ADR-4B-THREAT-MODEL.md`, ADR-004, ADR-008 (the `Link`
  precedent for protocol policy), `src/client/openui-actions.ts`

## 1. Current state

`@CopyToClipboard` is in `UNSUPPORTED_STEPS` and refused by name, so a Button
carrying it is inert. The declared form is `@CopyToClipboard(text)`.

**A related capability is already shipped and working.** `Code`'s copy button
calls `navigator.clipboard.writeText` from its click handler, best-effort, with a
refusal swallowed so a denied permission cannot throw into the card. Its comment
draws the line this ADR has to argue across:

> that is an *action* the program can take. A copy button is a user gesture on a
> visible control, which is a different and much narrower capability.

So the question is not "can this be built" but "what does the program gain by
naming it, given a user can already press a button that copies".

## 2. Threat analysis

| Threat | Applies how | Decision |
| --- | --- | --- |
| T1 authority by syntax | A program could copy on render | Gesture only; the dispatcher runs solely from an event handler, and a test asserts a render copies nothing |
| T2 injection via content | Copied text may be attacker-influenced | Acceptable: copying is visible, reversible by re-copying, and the user chose it. Recorded, not mitigated |
| T5 silent overwrite | The user's previous clipboard content is lost | Visible feedback naming what was copied; gesture only |
| T6 clipboard read | A card reads what the user copied | **Not implemented at all.** The signature has no read form and none will be added |
| T10 leak through failure | An error echoing the text | Generic text; the copied string is not printed on failure |
| T11 unbounded payload | A multi-megabyte copy | Length cap, refused not truncated |
| T12 stale authority | An approval reused | No approval exists: the gesture *is* the authority, per press |

## 3. Options considered

### Option A — enable it with a gesture check, mirroring `Code`

Button click → `navigator.clipboard.writeText(text)` → inline "Copied" feedback.

The cheapest option, and it reuses a path that already works in production.

Its weakness: `Code` copies **its own code argument**, which the program also
authored — so the capability being added is "any card can copy an arbitrary
string on a click". That is a real widening. A card displaying a password field's
value could copy it; a card could copy text that looks like a command the user is
about to paste into a terminal.

### Option B — Option A plus a visible preview of what will be copied

The button's own label or an adjacent line states the exact text, or its length
and first line when long, before the press.

This is barely more work and it changes what the user is agreeing to: a press on
"Copy `rm -rf /tmp/build`" is informed; a press on "Copy" is not.

### Option C — route through a host clipboard service

**Rejected: no such service exists** (threat model §2). Inventing one would be a
larger change than the action is worth, and the browser API is already available
to a user gesture.

## 4. Recommendation

**Option B**, with one correction to the framing that has to come first.

### A callable browser API is not an authorisation

`navigator.clipboard.writeText` exists and `Code` already calls it, which makes it
tempting to conclude the capability is authorised. It is not. What `Code`'s button
has is **the user pressing a control the card drew, whose payload is that
component's own visible argument.** `@CopyToClipboard` would hand that same API to
the *programme*, which decides when to invoke it and what to put in it. The API
being present says nothing about whether the programme may drive it.

So the browser API answers "is this possible", and the answer is yes. Whether it is
permitted is decided here, not by the browser — and the conditions below are the
whole of that decision. If they cannot all hold, the action stays refused even
though the API is one call away.

With that stated, enable only when all of the following hold, and the action stays
refused until every one is implemented and tested:

| Property | Requirement |
| --- | --- |
| **Gesture required** | The write happens only inside a user activation. Not on render, not on state change, not from an effect. |
| **Visible target** | The control states what will be copied. A bare "Copy" with no visible subject is refused — the user must be able to see the payload without pressing. |
| **Length cap** | A stated maximum, refused rather than truncated. |
| **Write only** | No read path exists in the signature, the dispatcher or the code. Not now, not later without a superseding ADR. |
| **Visible outcome** | Success and failure both produce visible text; failure is generic and does not echo the payload. |
| **No persistence** | The copied string is never stored, logged or put in `$state`. |
| **Per-instance** | One card's copy cannot be triggered by another card. |
| **Withdrawable** | Returning the name to `UNSUPPORTED_STEPS` disables it in one line, and the refusal test stays. |

The `Visible target` property is the substantive change from `Code`'s precedent
and the main thing this ADR adds. It is also the property most likely to be
dropped during implementation as a UX inconvenience, so it is recorded as a
requirement with its own test rather than as a guideline.

## 5. Security test matrix

| # | Case | Expected |
| --- | --- | --- |
| 1 | Action present but never pressed | Clipboard unchanged — asserted by reading it in the page before and after render |
| 2 | Press | Exactly one write, with the argument's bytes |
| 3 | Render only | No write. A test that mounts and re-renders asserts the clipboard is untouched |
| 4 | State change only | No write |
| 5 | Permission denied | Visible generic failure; the payload is not echoed; the card does not throw |
| 6 | Over the cap | Refused with a stated reason; nothing written |
| 7 | Two rapid presses | Two writes, both visible — repeated copying is legitimate, so there is no in-flight guard here |
| 8 | Read attempt | No API exists; the dispatcher has no read step and refuses any name it does not know |
| 9 | Two cards | Each copies only its own argument |
| 10 | Unmount mid-press | No write after unmount, or a write already in flight completes harmlessly |
| 11 | Control without a visible target | Refused at render with a stated notice |
| 12 | Rollback | Name back in `UNSUPPORTED_STEPS`; all cases inert; refusal asserted |

## 6. Browser acceptance criteria

1. A card with the action shows a control naming what it will copy.
2. Pressing it writes exactly the expected bytes — verified by reading the
   clipboard in the page and comparing, not by trusting the success callback.
3. Loading and re-rendering the card writes nothing.
4. Denying the permission produces visible text and does not break the card.
5. Reloading the card shows no pending state.
6. Two cards copy their own values, not each other's.

## 7. Rollback

Return `CopyToClipboard` to `UNSUPPORTED_STEPS`. The refusal path is already
tested and stays tested after shipping, so rollback is one line.

## 8. Why this is first in the recommended order

Of the three, it is the only one whose effect is **terminal, visible and
reversible**: a clipboard write can be undone by copying something else, the user
sees it happen, and nothing downstream acts on it automatically. It is also the
only one that can be built without a new host capability. That makes it the right
action to prove the whole model on — if the gesture-plus-visible-target pattern
does not hold up here, it will not hold up for the other two.
