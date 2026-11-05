# ADR-014 — `@OpenUrl`: opening a URL

- **Status:** **Deferred — host capability unavailable.** Not accepted, and not
  reject-and-forget either: the action stays refused, and the design is kept so a
  later host capability can be evaluated against it rather than rediscovered.
- **Date:** 2026-11-05
- **Relates to:** `ADR-4B-THREAT-MODEL.md`, ADR-008 (the `Link` protocol
  policy), ADR-009 (image source policy), ADR-004

## 1. Current state

`@OpenUrl` is in `UNSUPPORTED_STEPS` and refused by name. The declared form is
`@OpenUrl(url)`.

**A close relative already ships.** `Link` renders an `<a>` whose `href` comes
from `safeHref`, which parses the URL and admits only absolute `http:`/`https:`;
everything else degrades to plain text. That is ADR-008, and it is the strongest
existing precedent in this codebase for the argument grammar this action needs.

The distinction that matters, and that ADR-008 already draws: **`Link` requires
the user to press the link itself.** `@OpenUrl` would let the program decide when
navigation is attempted, which is why it is a different capability and not a
rename.

## 2. Threat analysis

| Threat | Applies how | Decision |
| --- | --- | --- |
| T1 authority by syntax | A program could navigate on render | Gesture only, and no navigation on mount or state change |
| T2 injection via content | The URL may come from rendered untrusted content | Acceptable for `http(s)` after the ADR-008 allowlist; a link to an attacker's page is a phishing risk the user can see in the destination |
| T3 protocol escape | `javascript:`, `data:`, `file:`, `blob:`, `vbscript:` | Parse and allowlist, exactly as `safeHref` does. `javascript:` would execute in the host origin |
| T4 confused deputy | The host opens a URL the card could not | Same allowlist on both sides; there is no host open to confuse (see §3) |
| T10 leak through failure | An error echoing the URL | Generic failure text |
| T11 unbounded payload | A very long URL | Length cap before parsing |
| T12 stale authority | A reused approval | No approval: the gesture is the authority |

## 3. The host capability gap, which is the whole problem

A card can navigate without any host support, in two ways, and **both are the
thing ADR-004 forbids**:

1. `window.open(url)` — the card opens a window. It works, and it means the card
   decides to create a browsing context. Under a popup blocker it silently fails,
   which is worse: the program believes it navigated.
2. `location.assign(url)` — the card navigates **the host document**, replacing
   the conversation with an arbitrary page. This is not a navigation *from* the
   card; it is the card destroying the host's session view.

The threat model (§2) records that no host-mediated open API is exposed to this
plugin. So there are three possible designs, and only the third is acceptable.

## 4. Options considered

### Option A — `window.open` from the card

**Rejected.** It grants the card the authority to create windows, it fails
silently under a popup blocker (the model believes it navigated and the user sees
nothing), and it bypasses any allowlist the host might later want to apply. It is
also indistinguishable from an ad-popup pattern to the browser's heuristics.

Also rejected on the same grounds: `location.assign`, an injected `<a>` clicked
programmatically, and a form POST to `_blank`. All of them are the card reaching
outside itself.

### Option B — treat `@OpenUrl` as sugar for `Link`

Instead of navigating, the action reveals a `Link` the user must press. Nothing
navigates without the user pressing a rendered anchor.

**This is safe and requires no host API.** It is also arguably not the declared
capability: `@OpenUrl` names a navigation, and this version performs none. Whether
that is a faithful implementation or a bait-and-switch is a decision, not a detail.

### Option C — a host-mediated open with the same allowlist

The action asks the host to open a URL; the host applies ADR-008's allowlist,
shows the destination, and performs the open through its own shell API.

**Correct, and blocked.** The host exposes no such API to this plugin. It would
need to be added upstream; this ADR can only record the requirement.

## 5. Recommendation

**Deferred to Option C. The action stays refused until the host provides a mediated
open, and no interim implementation is written.**

Option B was the interim candidate in the first draft of this ADR: render a link
the user must press, since that navigates nothing by itself. It is **withdrawn**,
for the objection recorded below — it is not this action under another name, it is
`Link`. Shipping it would put a second, differently-named way to render a link into
the language, with no containment gain and no behaviour the existing component
lacks. The cost is real: two spellings for one effect, one of them reachable only
from a `Button`'s action slot.

So the deferred position is deliberate rather than a punt: **the capability is
worth having and cannot be honestly built today.** A navigation that composes into
an action sequence is a different thing from a visible anchor — which is exactly
why it needs a host-mediated open, and exactly why rendering a link in its place
would be a substitution rather than an implementation.

What a future implementation must satisfy, recorded now so the capability is
evaluated against fixed requirements rather than renegotiated from scratch:

| Property | Requirement |
| --- | --- |
| **Host mediates the open** | The card asks; the host opens. No `window.open`, no `location`, no synthetic click on an anchor, no injected `<a>`, no form POST. Each is asserted absent by monkey-patching it in the test. |
| **Same grammar as `Link`** | `safeHref`: parse with `new URL`, admit only absolute `http:`/`https:`. A refused URL is visible text with a reason, not a silent no-op. |
| **Destination visible before the press** | The control shows the host it will reach, so a press is informed. |
| **Length cap before parsing** | A pathological URL is refused without being parsed. |
| **Gesture required** | The programme may not navigate on render or on a state change; only a user act opens anything. |
| **No simulated success** | If the host cannot open, the action reports failure. It must never render as though it worked. |
| **Generic failures** | Never echo the URL on failure. |
| **Withdrawable** | Name back in `UNSUPPORTED_STEPS`, refusal test retained. |

**Why this is worth keeping rather than deleting.** `Link` is a visible navigation
element; this action is a navigation that composes into an interaction sequence —
Step 2 of a two-step confirm, or the tail of a form submission. Those are different
meanings, and the second one has no spelling today. That difference is precisely
why it needs host mediation: a composable navigation is more powerful than an
anchor, so it must not be assembled out of DOM calls the host cannot see.

## 6. Security test matrix

| # | Case | Expected |
| --- | --- | --- |
| 1 | `javascript:alert(1)` | Refused; no anchor with that href; visible reason |
| 2 | `data:text/html,…` | Refused |
| 3 | `file:///C:/Windows/win.ini` | Refused |
| 4 | `blob:https://x/y` | Refused |
| 5 | Protocol-relative `//evil.example/x` | Refused |
| 6 | Relative `figs/a.png` | Refused |
| 7 | Absolute `https://example.com/x` | Admitted; renders a pressable destination |
| 8 | Absolute `http://example.com/x` | Admitted |
| 9 | Action on render | `window.open` and `location.assign` both uncalled — asserted via spies |
| 10 | Action on state change only | Both uncalled |
| 11 | Over the length cap | Refused without parsing |
| 12 | Two cards | Each renders only its own destination |
| 13 | Rollback | Name back in `UNSUPPORTED_STEPS`; everything inert; refusal asserted |

## 7. Browser acceptance criteria

1. A card with the action shows the destination host before any press.
2. Pressing it opens exactly one new context, to that destination — verified by
   counting tab targets before and after.
3. Loading and re-rendering opens nothing — tab count unchanged.
4. Every refused scheme from the matrix produces visible text and opens nothing.
5. The host document's own URL is unchanged after every case (the conversation is
   still on the page).

## 8. Rollback

Return `OpenUrl` to `UNSUPPORTED_STEPS`; one line, with the refusal test kept.

## 9. Why this is second in the recommended order

It has the strongest existing precedent (`Link`/`safeHref`, already tested) and
the smallest new attack surface **if** Option B is accepted — because it performs
no navigation itself. It ranks below `@CopyToClipboard` only because its honest
form may be indistinguishable from a capability that already ships, which is a
product question to settle before any code is written.
