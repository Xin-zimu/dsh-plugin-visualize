# ADR-012 — `Popover` containment, focus and event isolation

- **Status:** accepted
- **Date:** 2026-11-05
- **Supersedes:** —
- **Relates to:** ADR-004 (security boundaries), ADR-006 (state persistence),
  `AGENTS.md` §3 (frozen decisions), stage 4A-5 (`STAGE.md`)

## Context

`Popover(trigger, content)` is the first component in the catalogue that draws
**over** other content. Every one of the other 47 occupies its own box in the
card's flow; a popover is by definition a box that overlaps something.

`STAGE.md` singles it out for that reason: "the only one that overlays the host
document, so it needs its own containment check". This ADR decides what the
containment actually is, before the renderer exists.

### The shape of the risk

1. **Covering the host's own interface.** The OpenUI card is mounted in the
   **host document** (ADR-004), not in the HTML backend's sandboxed frame. A
   layer mounted on `document.body` with `position: fixed` is not "inside the
   card" in any sense the user can see: it can sit on top of DSH's composer, its
   menus, its window controls. Model-authored content would be deciding what the
   user can click.
2. **Focus loss and keyboard traps.** A panel that takes focus and does not give
   it back strands a keyboard user. The mirror-image mistake is worse in this
   host: an **unnecessary** focus trap in a non-modal panel breaks DSH's own
   Tab navigation, because Tab is how the user reaches the rest of the
   application.
3. **Event leakage across cards and across time.** A `document` listener added
   on open and not removed on unmount accumulates, and a listener that closes
   "the popover" rather than "this popover" makes two cards interfere.

### The trap in the obvious answer

"Use `position: absolute` inside the card" is **not** by itself containment.
An absolutely positioned box overflows its containing block freely — it is only
*positioned* relative to it, not *clipped* to it. A tall panel opened near the
bottom of a short card will hang out of the card exactly as a fixed one would.
The containment has to be **computed and clamped**, and then verified in a real
browser, which is why §5 below is part of this ADR rather than a test detail.

## Decision

**The popover is an inline, non-modal disclosure: absolutely positioned inside
the card, clamped to the card's measured rectangle, with no portal and no focus
trap.**

### 1. Positioning surface

| Property | Decision |
| --- | --- |
| Positioning | `position: absolute` |
| Containing block | the component's own wrapper, `position: relative` |
| Clamp target | the **card** rectangle, measured |
| Portal to `document.body` | forbidden |
| `position: fixed` | forbidden |
| `document.body` append | forbidden |
| Covers host UI | forbidden, and verified by measurement (§5) |

No portal, no portal library, no floating-position engine. The card is the
world this component lives in.

### 2. Placement is a pure function, and it is clamped

The renderer measures three rectangles — the card, the trigger, and the panel —
and hands them to a **pure** placement function. Pure because a jsdom unit test
has no layout engine: the arithmetic is the thing that can be wrong, so the
arithmetic is the thing that is tested.

Order of preference:

1. **Below** the trigger, left-aligned with it.
2. **Above** the trigger, when the panel does not fit below inside the card.
3. **Horizontal clamp**: when the panel would leave the card on either side, it
   is shifted inward. Alignment yields to containment; a panel that is flush to
   the card edge is correct, a panel that hangs over the host is not.
4. **Height clamp**: when neither side can hold the panel, it is given the
   larger of the two spaces as a `max-height` and scrolls internally.
5. **Cover fallback**: when even that space is below a legibility floor, the
   panel expands over the card's own rectangle — still inside the card, still
   inside the host's layout, with internal scrolling. This is the "non-floating
   expansion inside the card" case, and it is a deliberate last resort rather
   than a failure.

Every branch keeps the panel inside the card's rectangle. That is the property
the acceptance run measures.

### 3. Non-modal, and therefore no focus trap

| Behaviour | Decision |
| --- | --- |
| Escape closes | required |
| Outside click closes | required |
| Focus returned to the trigger on close | required, for the close paths the trigger did not cause |
| Focus trap | **none**, by design |
| `role` | `dialog` with `aria-modal="false"` |
| Trigger announcements | `aria-expanded`, `aria-controls` |

A focus trap belongs to a **modal** dialog. This panel does not block the rest
of the host, so trapping Tab inside it would fight the host's own keyboard
navigation — the user would be unable to reach DSH's controls from a card, which
is a worse accessibility failure than the one a trap is meant to prevent.
`aria-modal="false"` states the same thing to assistive technology: the content
outside remains available.

### 4. Listener lifetime is exactly the open interval

- Listeners are attached **when the panel opens** and removed when it closes.
- One `pointerdown` on `document` in the capture phase closes on an outside
  press; one `keydown` on `document` handles Escape.
- Each handler closes **its own** instance only. A press outside card A's
  popover does not close card B's, and twice-opened panels in one program are
  independent React states.
- Unmounting the card while a panel is open removes both listeners; the effect
  cleanup is the only place they are removed, so there is no path where one
  survives.
- Repositioning listens to `resize` and to scroll on the card's ancestors while
  open, under the same lifetime.

This is the 4A-3 `Timer` lesson applied before the fact: a component that
acquires a global resource must show, in code, the one place that releases it.

### 5. Verification obligations

Because `position: absolute` proves nothing on its own, 4A-5 accepts this
component only with real-browser measurements, taken on an isolated profile
under the `AGENTS.md` §9 hash check:

| # | Obligation |
| --- | --- |
| P1 | The panel's `getBoundingClientRect()` is inside the card's rectangle, in both schemes and at a narrow width. |
| P2 | Opening and closing does not change the card's or the host's layout: the panel is out of flow. |
| P3 | Escape closes the panel and returns focus to the trigger. |
| P4 | A `pointerdown` outside closes it; a press inside does not. |
| P5 | Two cards with open popovers do not close or reposition each other. |
| P6 | After the card unmounts, a `document` listener count taken before/after shows no residue, and Escape no longer does anything. |

P6 is measured by instrumenting `addEventListener`/`removeEventListener` on
`document` in the page before the card mounts, not by asserting in code that
the cleanup exists — the code is what is under test.

### 6. What the language cannot express, recorded rather than improvised

`Popover` has no `open` argument, so:

- the panel always starts closed, and a reload reproduces a closed popover;
- its open state is **not** in `$state` and is not persisted (ADR-006 covers
  `$state`, not transient UI);
- a program cannot open or close it except by the user pressing the trigger.

Adding `open` would make the popover a bound input and would need a persistence
decision; that is a superseding ADR, not an argument added to this one.

### 7. Out of scope

No arrow/caret, no auto-flip library, no animation, no dismiss-on-scroll, no
nested popovers, no focus trap, no `modal` argument. Recorded so that a later
batch adds them as a decision rather than as drift.

## Consequences

- **The host stays in control of its own interface.** The strongest claim this
  component can make — that a card cannot occlude DSH's controls — is a measured
  rectangle comparison, not an architectural intention.
- **The placement function is testable without a browser**, so the containment
  arithmetic is covered on every run and the browser run confirms the wiring
  rather than discovering the maths.
- **A popover can be clipped in a very short card** — by scroll, not by
  overflow. That is the price of the inline decision and it is accepted: the
  alternative puts model content over the host's own chrome.
- **`position: relative` on the card root** is a one-line change this ADR
  authorises; it does not alter flow and it is what makes the containing block
  the card rather than the nearest positioned ancestor inside it.
