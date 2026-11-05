# Phase 4B report — external actions

- **Status:** PASS for one action, Deferred for two. Stage 4B closes as
  *"security review complete, one capability delivered, two deferred"*.
- **Date:** 2026-11-05
- **Delivered:** `@CopyToClipboard`, from `UNSUPPORTED_STEPS` to shipped.
- **Not delivered, by decision:** `@OpenUrl`, `@ToAssistant`.

## 1. What this stage was actually about

Stage 4A rendered. Every failure mode stayed inside the card. Stage 4B is the
first point where a model-authored program can cause an effect outside the
document, and the boundary is one sentence:

> **A model may propose an action. It may not acquire the authority to execute
> one merely by emitting a syntactically valid program.**

The most useful thing this stage produced is not the clipboard action. It is the
distinction between three states a capability can be in, which the first draft of
the threat model got wrong by treating it as a yes/no question:

| State | Meaning | Consequence |
| --- | --- | --- |
| **Not available** | No interface exists, and nothing card-reachable does either | Cannot be built honestly. Defer. |
| **Available but unauthorised** | Something reachable could act, and the program has no permission | Refused **by policy**. A check must enforce it, because nothing else will. |
| **Available and authorised** | A host interface mediates and attributes the effect | May be implemented. |

The middle row is `@CopyToClipboard`. `navigator.clipboard.writeText` is one call
away and `Code`'s copy button already uses it — **a callable browser API is
evidence of possibility, never of permission.** Where the API exists, policy is
the only thing standing between the program and the effect.

## 2. What shipped

`@CopyToClipboard(text)` copies its text when the user presses the control, and
the card shows that text **in full** beforehand.

The acceptance criteria were made structural rather than stylistic:

| Requirement | How it is guaranteed |
| --- | --- |
| The reader sees exactly what will be copied | `copyPayloadOf` reads the evaluated descriptor once; `CopyButton` uses that one string for both the `<pre>` and the write. They cannot diverge — there is only one value. |
| No truncated preview | The `<pre>` renders `payload` whole, with `maxHeight` and scrolling. A test asserts a 4 000-character payload arrives complete. |
| A gesture is required | Every `runAction` call site is an `onClick` or `onKeyDown` handler. Nothing calls it from an effect, timer or state change. |
| No composition | `CopyToClipboard` at depth > 0 is refused with `action.clipboard-not-composed`, and `copyPayloadOf` does not unwrap `Action`, so a composed button renders as an ordinary button. |
| Bounded payload | 32 KiB cap, **refused rather than truncated**. Chosen, not derived: far above any legitimate card text, far below what makes a silent overwrite harmful. |
| A refusal never reads as success | `writeClipboard` reports `copied` only from the promise's success branch. |
| No hidden-textarea fallback | `document.execCommand` is not used anywhere. It is the standard way to make a copy succeed, and it would convert a permission refusal into an invisible success. |
| Write only | No read path exists in the signature, the dispatcher or the code. |

### A defect fixed on the way

`Code`'s copy button showed **"Copied" unconditionally**. A denied permission told
the reader the clipboard held their code when it did not — the exact failure ADR-013
names. It now reports all three outcomes. This was a shipped defect from an earlier
stage, found because this stage wrote down what the behaviour should be.

### A palette defect deliberately not inherited

The copy control uses `BUTTON_KINDS.outline`, not `primary`. Primary is
white-on-blue at **4.23:1** in the light scheme, below AA. That is a recorded and
accepted defect of the existing Button palette (`session-log`: "Light Button pair is
4.23:1", *recorded, not changed*), and changing it is not this stage's to do — but a
new control must not copy it. Measured after the switch, in a real browser:

| Scheme | Control | Payload |
| --- | --- | --- |
| Dark | **17.45:1** | 13.34:1 |
| Light | **18.9:1** | 18.9:1 |

## 3. What was deliberately not built

### `@OpenUrl` — Deferred, host capability unavailable

A card can reach `window.open` and `location.assign`, but both are the card
deciding to navigate, which ADR-004 forbids; a popup blocker also swallows the
first one silently, so the program believes it navigated while the user sees
nothing. No host-mediated open exists.

The first draft recommended an interim "render a link the user must press". It is
withdrawn: that is not this action under another name, it is `Link`. Shipping it
would add a second spelling for one effect with no containment gain.

### `@ToAssistant` — Deferred, trusted host submission capability unavailable

The highest-risk of the three, and the only one with a re-entrancy hazard.

Its first draft required proving the message could not have come from rendered
untrusted content. **That requirement is withdrawn because it cannot be honoured** —
the evaluator does not track provenance, so it would have been a claim in a
document that the code could not enforce. It is replaced by a position that needs
no provenance: **all card-generated content is untrusted, without exception.** A
literal gets no more authority than a value scraped from a page.

What protects the user is not knowing where the text came from. It is that the
message can only arrive as an ordinary user turn, after a **host-rendered**
confirmation showed it in full and the user chose to send it.

## 4. Security test matrix

`tests/openui-clipboard-4b.spec.tsx`, 19 tests across the ten ADR categories.

| # | Category | Proves |
| --- | --- | --- |
| 1 | Explicit press | A click writes the payload |
| 2 | Automatic paths | Mount writes nothing; a state change writes nothing |
| 3 | Shown vs written | Same string, compared directly; no truncation at 4 000 chars |
| 4 | Dynamic state | A `$state`-derived payload writes what is displayed |
| 5 | Empty / type / length | Empty, object, list, `null`, over-cap all refused; an object is never `String()`-ed into `[object Object]` |
| 6 | Permission refused | Shows a refusal, never "Copied" |
| 7 | Repeat | One write per press, not one per render |
| 8 | Unmount | Its `openui:clipboard` listener is removed |
| 9 | Other two actions | Still refused at dispatch; a Button carrying them is inert |
| 10 | Composition | Refused inside `Action([...])`, the other steps still apply, no control is rendered |
| 11 | Scope | No read path exists |

### Mutation results — every guard was made to fail

| Mutation | Tests that went red |
| --- | --- |
| Copy on mount | **6** |
| Report success before the write resolves | 1 |
| Truncate the displayed payload | 3 |
| Allow composition (remove the depth guard) | 2 |
| Remove the length cap | 1 |
| Coerce objects instead of refusing | 1 |
| Let `@OpenUrl` through | 1 |

All restored. No guard is asserted without having been seen to fail.

## 5. Browser acceptance

`evidence/phase-4b/C1-clipboard.json`. Bundle hash checked **before** measuring
(§9): `E2B0ED7B…`, build and installed copy identical.

The decisive measurement, chosen because jsdom cannot make it:

```
system clipboard before : SENTINEL-FINAL
one real CDP click      : card control "Copy the token"
system clipboard after  : sk-live-SHOULD-NOT-LEAK
shown on the card       : sk-live-SHOULD-NOT-LEAK
card status line        : Copied
```

The clipboard is read **from the operating system**, not through the page. That is
what any other application would paste, and it does not depend on the page's own
permission model. A mocked `navigator.clipboard` in jsdom can only prove a mock was
called.

Also measured:

- **No automatic path**: reloading the page with a sentinel on the clipboard left
  the sentinel untouched.
- **`@OpenUrl` is inert**: clicked, and neither the tab count nor the clipboard
  changed.
- **Contrast** in both schemes, above.

## 6. Verification

| Check | Result |
| --- | --- |
| `tsc -p tsconfig.json` | 0 errors |
| `tsc -p tsconfig.client.json` | 0 errors |
| `vitest run` | 910 passed / 15 failed / 927 |
| Failure set vs baseline | **identical, name by name** |
| Build | `lib/client.js` 251.13 kB |
| Bundle hash | `E2B0ED7B…`, installed copy identical |
| Browser acceptance | copy verified against the OS clipboard |
| Inventory | 48 / 48, unchanged |

## 7. Harness lessons recorded

1. `navigator.clipboard.readText()` **cannot** be awaited from a script without a
   user activation: the promise never settles and the CDP call hits its 20 s
   bound. Reading the OS clipboard is both simpler and stronger evidence.
2. `sync → observe → act` fails: `observe` consumes the context the action needs.
   The order is **observe → sync → act**.
3. A session fixes its control policy at creation, so `--policy strict` cannot be
   added to an existing one.
4. A card is a list item in the VOM with a stable ref; a real `step click` on it is
   what produces a genuine user activation.

## 8. What Stage 4B does not claim

- It does not claim `@OpenUrl` or `@ToAssistant` are safe to enable. Both stay in
  `UNSUPPORTED_STEPS` and a test asserts it.
- It does not claim the clipboard capability is free of risk. It claims one narrow
  thing: a user pressing a control that shows the exact text can write that text,
  and nothing else can.
- It does not claim the composition question is answered. `CopyToClipboard` inside
  `Action([...])` is **refused pending measurement** of user activation in a
  composed run, not because composition is known to be unsafe.
