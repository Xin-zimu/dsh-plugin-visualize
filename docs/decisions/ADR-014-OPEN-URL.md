# ADR-014 — `@OpenUrl`: opening a URL

- **Status:** **Deferred — no host capability with this action's semantics.**
  Not accepted, and not reject-and-forget either: the action stays refused, and the
  design is kept so a later host capability can be evaluated against it rather than
  rediscovered.
  **Amended 2026-11-06.** The original stated reason — "host capability
  unavailable" — is **false** and is corrected in §10. A host-mediated open does
  exist; it opens a sidebar tab rather than a browsing context, so it is not this
  action. The *status* is unchanged. The *reason* was never right.
- **Date:** 2026-11-05 (amended 2026-11-06)
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
plugin. **[CORRECTED 2026-11-06: this claim is false — a documented, host-mediated
open *is* exposed to client plugins. See §10. It performs a sidebar-tab open, not a
browsing-context open, which is why the recommendation does not change.]**
So there are three possible designs, and only the third is acceptable.

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

**Correct, and still unavailable — for a narrower reason than first recorded.**

**[CORRECTED 2026-11-06]** The sentence that stood here — "the host exposes no
such API to this plugin" — is false. See §10. What actually holds:

- A **host-mediated open with this ADR's allowlist does exist**:
  `ctx.sidebarRight.openTab('browser', { params: { url } })`, documented for
  client plugins, with a URL parser stricter than §5 asked for.
- But it opens **a tab inside the host's right sidebar**, not a new browsing
  context, so it is **not Option C**. Option C requires the open to leave the
  application; this does not.
- A true external open **is** what the Electron layer performs for `window.open`
  and cross-origin navigation — but that is renderer policy, not a
  plugin-callable API (§10.3). Reaching it from card code is Option A, which
  stays rejected.

So the capability this ADR was written for remains upstream work. What changed is
that the requirement is now **specific**: not "add URL opening", but "add a
plugin-callable external open that reports success, refusal and failure".

## 5. Recommendation

**Deferred to Option C. The action stays refused until the host provides a mediated
open, and no interim implementation is written.**

**[AMENDED 2026-11-06 — the decision stands, the reason is narrower]** The owner
re-affirmed this decision after §10's investigation, and chose the *upstream* route
(C2): keep `@OpenUrl`'s real meaning — open an external URL — and ask DSH for a
plugin-callable external open. The existing sidebar-browser API is **not** adopted
as `@OpenUrl` under another name, for the reason given in §10.2.

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
---

## 10. Amendment 2026-11-06 — the stated reason was false; the decision stands

This section is appended, not substituted. The text above is the record of what was
decided and why on 2026-11-05; where it is now known to be wrong, it is marked in
place **and** corrected here. Nothing above was deleted.

**Full investigation:** `docs/reports/PHASE-4B-2-INVESTIGATION.md`.
**Evidence:** `evidence/4b2/`.

### 10.1 What was wrong

The original §3 said: *"The threat model (§2) records that no host-mediated open API
is exposed to this plugin."* That is false against DSH 0.2.1-rc.5.

A host-mediated open **is** exposed and **is** documented for client plugins
(`dsh-client-ui-sidebar-browser/README.md:43`):

> "Client plugins can open a tab through `ctx.sidebarRight.openTab('browser',
> { params: { url } })`. The optional URL passes the same validation as
> address-bar input before navigation."

The service is provided at `dsh-client-ui-sidebar-right/lib/client.js:4966`. The
host's **own** transcript link gesture calls exactly this
(`dsh-client-ui-chat/lib/client.js:13284-13287`), with `window.open` only as the
fallback when the sidebar carrier is absent.

Its URL policy is **stricter than §5 asked for**
(`dsh-client-ui-sidebar-browser/lib/client.js:363-407`):

| Check | Line | §5 required | Host does |
| --- | --- | --- | --- |
| Length cap before parsing | 369-372 | yes | yes, 16 KiB |
| `new URL` parse | 375-382 | yes | yes |
| Embedded credentials | 383-386 | — | **refused** |
| Scheme allowlist | 387, 403-406 | http/https | http/https |
| The DSH app's own origin | 388-393 | — | **refused** |

Refusals are localized, visible strings (`:1473-1480`), not silent no-ops. T3, T4,
T10 and T11 of the 4B threat model are enforced by the host, not by us.

### 10.2 Why this still does not satisfy the ADR

The finding above is real, and it is **not** the capability this ADR describes.

1. **It opens a sidebar tab, not a browsing context.** §7.2's acceptance test —
   "counting tab targets before and after" — would be **unchanged**. The page
   renders in an iframe docked inside the DSH window. If `@OpenUrl` means "the
   user's browser shows this page", this is a different product behaviour.
2. **Its failure mode is worse, not better.** `sidebar-browser/README.md:107`:
   *"Browsers conceal many iframe failures for security: DNS, TLS, mixed-content,
   CSP, and X-Frame-Options failures may emit `load` or no actionable event instead
   of `error`."* And `:104`: an HTTPS app blocks public HTTP pages as mixed
   content. So the popup-blocker risk §4-Option-A rejects is not eliminated — it is
   **traded for an unobservable one**, which is the precise failure this ADR exists
   to prevent.
3. **The host enforces no gesture requirement.** Zero matches for
   `userActivation`/`isTrusted`/`requiresGesture` in either sidebar package.
   `openTab` is a layout state mutation, **not** a popup-blockable browser API, so
   it fires happily from a `useEffect` on mount. §5's "Gesture required" row would
   rest entirely on this plugin's dispatcher — that is our job, but it is worth
   recording that the host does not help.
4. **The destination is not shown by the host before a press.** §5 requires it; a
   sidebar tab appearing after the press is not a preview.

There is also a true external open in the deployment — Electron hands http(s) to
`shell.openExternal` on `window.open` and on cross-origin navigation
(`lib/main.js:11970-11973`, `:12032-12039`) — but it is **renderer policy, not a
plugin API**: the preload exposes seven world members and none of them opens a URL
(`grep openExternal|openUrl|openURL|externalLink` over `preload-app.cjs`: zero
matches). Reaching it from card code is Option A, which stays rejected.

### 10.3 The corrected three-state classification

ADR-4B §2 insists on three states rather than two. Applying them here:

| Mechanism | State | Why |
| --- | --- | --- |
| `ctx.sidebarRight.openTab('browser', …)` | **Available and authorised** | Documented for plugins; host-parsed allowlist; host performs the navigation. But it is a sidebar open, not this action. |
| `window.open` / `location.assign` / synthetic anchor | **Available but unauthorised** | Reaches `shell.openExternal`; forbidden by ADR-004 and §4-Option-A. Only policy stops it. |
| A plugin-callable external open | **Not available** | No preload member, no host service. This is what the upstream request asks for. |
| `/open-in-app/open` | **Not available for a URL** | Takes `{app, path}`; the path must be an existing directory. |
| `openWorkspacePath` | **Not available for a URL** | OS file-association open behind `verifyDesktopPath`. |

### 10.4 The upstream request this ADR now records

Asked of DSH (decision C2, owner, 2026-11-06):

- **The host performs the external open.** The plugin names a URL; the host opens it.
- **A distinguishable result**: success, refusal, and failure must be separable by
  the caller. Today `openTab` returns `void`, so a refused URL is reported *inside
  the tab*, asynchronously — not to the caller.
- **The URL policy stays the host's**, including the visible-feedback requirement.
  ⚠ The existing validator must be **reused, not reimplemented** — this ADR's §5
  grammar and the host's `parseBrowserAddress` already agree.
- **No plugin access to browser windows.** The plugin must not create or drive a
  browsing context; it asks, the host acts.

The sidebar-browser API also **remains available as a separate capability** — a
"show this page beside the conversation" feature. It is a reasonable product
feature on its own terms. It is not `@OpenUrl`, and must not be shipped under that
name.

### 10.5 What did not change

- The action stays in `UNSUPPORTED_STEPS` and stays refused.
- Every property in §5's table is retained as a requirement, unrelaxed.
- Option A and Option B remain rejected for their original reasons.
- The security test matrix (§6) and browser acceptance criteria (§7) stand.

**Evidence grade of this amendment: Read and Type only.** No browser run was
performed, and nothing here is claimed as verified behaviour. The plugin's own
refusal path is unaffected and remains covered by its existing tests.

