# Stage 4B-2 — can `@OpenUrl` and `@ToAssistant` be implemented?

- **Date:** 2026-11-05
- **Audit baseline:** `8db9598` (branch `main`; HEAD `e2dbeba`, two CI commits ahead — none touch product code)
- **Host:** DSH 0.2.1-rc.5, Electron desktop app, profile `desktop`
- **Scope:** investigation and design only. **No product code, no tag, no release.** `git diff --stat` is empty.
- **Supersedes:** ADR-014 §3 and ADR-015 §1/§4/§5's *stated reasons*, not their requirements.

---

## 0. The one-line answer

**Both actions are technically implementable today. Neither is available as a finished host
capability, and both have one requirement the host cannot satisfy.**

| Action | Verdict | Blocked on |
| --- | --- | --- |
| `@OpenUrl` | **EXTENDABLE** | A product decision: the only mediated open is a *sidebar tab*, not a browsing context, and it fails unobservably on a real minority of sites |
| `@ToAssistant` | **EXTENDABLE** | Two ADR-015 properties the host cannot provide: card *attribution*, and a *host-rendered confirmation the card cannot fake* |

The prior conclusion — "no host-mediated open exists", "no trusted host submission capability" —
**is false against the installed host.** Both ADRs must be amended. That is the main result of this
round, and it is worth more than the two "Deferred" stamps it replaces.

---

## 1. Method, and how claims are graded

Per `AGENTS.md` §5, three grades are used below and never mixed:

| Grade | Meaning |
| --- | --- |
| **Read** | Source read with file:line. Strong for "what the code does", silent on "whether it runs". |
| **Type** | A compiler accepted/rejected a probe. Strong for contracts, silent on runtime wiring. |
| **Ran** | A command executed and its output is saved under `evidence/4b2/`. |

Two team members investigated independently (`host-nav`, `host-submit`); the Lead re-derived the
decisive findings and ran its own probes. Every dispute was resolved against source, not opinion.
One real correction came out of this: a Lead `grep` initially reported zero `inputActions` hits —
**because ripgrep honours `.gitignore` and `node_modules/` is ignored.** `Select-String` found it.
The finding survived; the method that contradicted it was wrong.

Evidence in `evidence/4b2/`:

| File | What it is |
| --- | --- |
| `openurl-host-findings.md` | 405-line `@OpenUrl` investigation, file:line throughout |
| `openurl-probe.mjs` / `.log` | **Ran.** Read-only live-route probe, exit 0 |
| `toassistant-host-findings.md` | 495-line `@ToAssistant` investigation, file:line throughout |
| `inputactions-type-probe.ts` / `negative-control.ts` / `mutation.ts` / `.log` | **Ran.** The Lead's independent 3-control check (§3.1) |

---

## 2. Why the old conclusion was wrong — one mechanism explains everything

Both investigations converged on the same root cause, and it is a single line of cordis.

`node_modules/@deepseek-ai/cordis/lib/index.js:763-765`

```js
get(name, strict = true) {
    return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
}
```

`getTraceable` (`:84-90`) wraps a `Service` in `createTraceable` (`:123-158`), whose `get` trap
returns **the caller's** context for the tracker property (`:128`). `Service` sets
`tracker.property = "ctx"` (`:1774-1777`). So a service method runs with `this.ctx` rebound to
**whoever called it**.

That matters because the host has a real **session scope**:
`dsh-api-session-controller/lib/types/client/sessions/service.js:365-367` — `scope(id)` returns
`this.scopes.get(id)?.ctx`, a genuine fiber context tagged by `createScope`
(`client/scope.js:16-30`).

```
ctx.sessions.scope(sessionId)   ->   the real session-scope cordis Context
```

**This repo already depends on that chain in production**: `src/client/prompt-bridge.ts:122-135`
(`composerFor`) resolves `ctx.get('sessions').scope(id).get('conversation').input.for(scope)` and
calls `setDraft`/`focus`/`notify` on it today. The capability was never missing. The plugin had
simply never asked for more than the draft.

**Ran** — `tmp/probes/cordis-scope-probe2.mjs` against the installed cordis 4.0.5:

```
A scopedCtx.conversation.send          -> {"text":"hi","scope":"sess-A"}
B rootCtx.conversation.send            -> {"text":"hi","scope":null}
C sessions.scope(id).get(...).send     -> {"text":"hi","scope":"sess-A"}
D tag visible inside a service method  -> "sess-A"
```

B is the load-bearing control: from a root context the scope is `null`. The scope is not decorative;
it is what the host uses to address a session.

---

## 3. `@ToAssistant` — EXTENDABLE, with two honest blockers

### 3.1 The capability is real, and it is already in scope on the card

Four independent doors exist. The **third** is the one that matters, and it is the Lead-verified one.

| Door | Path | Reachability |
| --- | --- | --- |
| A | `ctx.conversation.send(text)` — `IConversation` (`service.d.ts:26-57`), impl `client.js:4664-4670` | Needs a session-scope ctx (§2) |
| B | `conversation.input.for(scope).submit()` — `contract/input.d.ts:184`, impl `client.js:15202-15256` | Needs a session-scope ctx |
| **C** | **`inputActions` — a declared standard prop on every session-scope slot** | **Already passed to our card** |
| D | node-side `agents.get(id).followup(msg)` (`agent-loop.js:800-814`) | Available, but **rejected** (§3.3) |

**Door C, verified.** The chain:

1. `dsh-client-ui-slots/lib/types/index.d.ts:221` — `ScopeStandardProps<S>` is
   `S extends 'session' ? SessionStandardProps : ...`, and `:226` puts it inside `PropsRuntime`.
2. `dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:423-430` declares
   `SessionStandardProps { useConversation; useInput; inputActions: InputActions }`.
3. `InputActions.submit(): void` — `contract/input.d.ts:258`, implemented at
   `client.js:14964-14966` as `submit: () => { this.submit("queue") }`.
4. `tool.call.toolview` is `scope: 'session'` (`dsh-client-ui-tool/lib/types/client/contract/slots.d.ts:19-23`),
   and `ToolCallViewProps` is built from `PropsRuntime`, so it carries `inputActions`.

**Ran — with a negative control and a mutation, because a green test that cannot go red is a guess**
(`AGENTS.md` §6). `evidence/4b2/inputactions-type-probe.log`:

| Probe | Expect | Outcome |
| --- | --- | --- |
| `p.inputActions.submit()` on `ToolCallViewProps` | clean | **clean, exit 0** |
| `@ts-expect-error` on a property that cannot exist | clean (expect-error satisfied) | **clean, exit 0** |
| `p.inputActions.thisMemberIsNotOnInputActions()` | **TS2339** | **TS2339** — *"does not exist on type 'InputActions'"* |

The third probe is the one that makes the first meaningful: it proves `inputActions` is a real
`InputActions`, not `any` from an unresolved module. Without it, probe 1 would typecheck on any
misspelling.

> **So the card already receives the submit capability as a prop.** `src/client/VisualizeCard.tsx`
> simply never destructures it. That is a one-line discovery, not an architecture change.

**Grade of this claim: Type.** It proves the *contract*. It does not prove the runtime value is
present on a live card — that is the one probe §6 asks for before any implementation.

### 3.2 Role escalation is structurally impossible — stronger than ADR-015 assumed

ADR-015 §5 demanded "role is not an argument" as a *plugin discipline*. The host enforces it
structurally, and this is the most valuable correction in the whole investigation:

- `dsh-api-session-controller/lib/index.js:3218-3231` — the node entry builds the source **itself**:
  `const source = { kind: "user", rpcId: request.requestId, ...principal }`. The wire request has no
  `source` and no `role` field to send.
- `:925-951` — `createUserMessage({ content, source })` then `agent.followup(message)`.
- `dsh-llm` `MessageSourceMap` (`lib/typert.host.js:476`): `'user-rpc': { kind: 'user'; rpcId; ... }` —
  **`user-rpc` IS `kind: 'user'`**.
- `system`/`developer` are separate, separately-validated event families
  (`dsh-session/lib/types/surface.d.ts:90-96` rejects developer roles). No `prompt`-shaped wire type
  produces either.

**T7 in the 4B threat model is mitigated by the host, not by us.** That should be recorded, because
it is a guarantee we can rely on rather than assert.

### 3.3 The two things that are genuinely NOT available

Neither is a capability gap that more engineering closes. Both are *missing host concepts*.

**(1) Attribution — ADR-015 §5 requires the turn to say it came from a card. No such capability.**
The only distinguishing field is `rpcId` (+ optional `principal`), and the transcript never renders
it. In `dsh-client-ui-chat/lib/client.js`, `rpcId` appears at `:2722-2737`, `:2826-2841`, `:2846-2847`
— all three use it purely to **suppress duplicate optimistic echoes**. Grep for `user-rpc` across
`ui-chat` and `ui-conversation`: **zero rendering hits**. A message sent this way is
indistinguishable from typed input.

**(2) A host-rendered confirmation the card cannot fake — ADR-015 §5 requires it. Not plugin-callable.**
The approval panel exists (`dsh-client-ui-approval/lib/client.js:344-354`) but is driven by the host
waterfall — `ctx.remote.$on("approval/request", ...)` (`:355-357`) — with answerers composed by the
deployment. `dsh-user-approval` says plainly *"the service itself never prompts a human"*, and
`request()` **throws outside an open turn** (`lib/types/index.js:121-127`). `dsh-user-questions` is a
tool-side service keyed by `ToolCallId`.

So ADR-015's requirement that the confirmation be something the card *cannot* draw is unsatisfiable.
A plugin can render a *host-styled* dialog, but it is still the card's surface — the exact thing the
ADR forbids. **This is a real weakening and needs an explicit human decision, not a workaround.**

### 3.4 Loop control — one correction that would have caused a bug

**Do not use `InputState.phase` as an in-flight guard.** A plain (non-command) send sets `phase` and
then leaves it `'plain'` for the whole flight — `beginDetached` sets it (`client.js:5148-5155`) and the
machine's `onEnter` default branch never reaches `'submitting'` (`:5168-5191`). A guard keyed on
`phase` would be permanently open.

**Use** `useSession().running` + `pendingSubmissions` (`SessionSnapshot`, declared at
`dsh-cordis-client-runner/lib/client.js:2210`), because `beginSubmission` appends its echo
**synchronously, before the first await** (`dsh-api-session-controller/lib/types/client/sessions/session.js:148-163`)
— so the card sees its own send in the very next snapshot. Plus a per-card latch and budget, which
the host enforces neither of.

**One soft spot to design around:** an **archived** session *accepts* the prompt, then ends the turn
`blocked` (`archived-session-gate.js:17-25`). Optimistic card UI would lie. The card must not
show "sent" from its own state alone.

### 3.5 Node-side submission — exists, and should be rejected

`agents.get(id).followup(msg)` is real (`agent-loop.js:800-814`), and this repo already uses the
sibling `steer` at `src/self-repair.ts:402-418`. It is **worse on every axis that matters**: it
bypasses composer mediation, bypasses the `rpcId`/`principal` audit trail, forces the plugin to
*forge* a message source, and inverts the authority relationship — the plugin becomes the submitter
instead of asking the host to submit. Reject.

---

## 4. `@OpenUrl` — EXTENDABLE, blocked on a product decision

### 4.1 A documented, host-mediated open exists

`dsh-client-ui-sidebar-browser/README.md:43`:

> "Client plugins can open a tab through `ctx.sidebarRight.openTab('browser', { params: { url } })`.
> The optional URL passes the same validation as address-bar input before navigation."

Provided at `dsh-client-ui-sidebar-right/lib/client.js:4966` (`ctx.reflect.provide("sidebarRight", ...)`).

**The host's own link gesture uses exactly this call** — `dsh-client-ui-chat/lib/client.js:13284-13287`:

```js
if (linkOpening.getSnapshot() === "sidebar" && ctx.get("sidebarRightTabs")?.get("browser") !== void 0)
    ctx.sidebarRight.openTab("browser", { params: { url } });
else window.open(url, "_blank", "noopener,noreferrer");
```

`linkOpening` defaults to `"sidebar"`. So `window.open` is the host's *fallback*; the sidebar tab is
its *preference*. A plugin calling the first is using the host's own chosen path.

### 4.2 The URL policy already is ADR-014's allowlist — and stricter

`parseBrowserAddress`, `dsh-client-ui-sidebar-browser/lib/client.js:363-407`:

| Check | Line | ADR-014 §5 asked for | Host does |
| --- | --- | --- | --- |
| length cap **before** parsing | 369-372 | yes | yes, 16384 |
| `new URL` parse | 375-382 | yes | yes |
| credentials refused | 383-386 | — | **stricter** |
| http/https only | 387, 403-406 | yes | yes |
| **DSH app origin refused** | 388-393 | — | **stricter** |

Refusals are localized, visible strings (`:1473-1480`), not silent no-ops. T3/T4/T10/T11 from the 4B
threat model are enforced by the host, not by us.

### 4.3 Failure is loud where it matters, and unobservable where it hurts

- **Registered check:** `placeTab` **throws** when no type is registered as `"browser"`
  (`:2298-2300`) — catchable, stable message. Satisfies "no simulated success" for that class.
- **No mounted surface:** `this.require()` throws `sidebarRight: no session surface is mounted`
  (`:2594-2602`). The `rightbar` slot renders unconditionally
  (`dsh-client-ui-layout/lib/client.js:339`), so a card in a visible conversation is expected to
  work; a card under a **global panel** throws. *Source inference, not browser-verified.*
- **The real problem:** once the tab opens, an **iframe refusal is invisible**.
  `sidebar-browser/README.md:107` — *"Browsers conceal many iframe failures for security: DNS, TLS,
  mixed-content, CSP, and X-Frame-Options failures may emit load or no actionable event instead of
  error."* Plus `:104`: an HTTPS app blocks public HTTP pages as mixed content.

### 4.4 Deployment and gesture

- **Registered here: yes.** `dsh-web-app/cordis.patch.yml:296-298` — `disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"`; the live profile is `desktop`. **Ran**: `openurl-probe.log` distinguishes registered routes (401 from the connection fence) from unregistered (404) — 3 registered, 2 controls, all PASS, exit 0.
- **Gesture: not enforced by the host.** Zero matches for `userActivation`/`isTrusted`/`requiresGesture` in either sidebar package. `openTab` is a **layout state mutation, not a popup-blockable browser API** — it fires happily from a `useEffect` on mount. **ADR-4B T1 rests entirely on our dispatcher rule.** That is now a load-bearing constraint, and must be tested as one.
- **Electron `shell.openExternal` is reachable but not plugin-callable.** `lib/main.js:11970-11973` and `:12032-12039` hand http(s) to `shell.openExternal` on `window.open`/cross-origin navigation — that is *why* `window.open` remains forbidden. The preload exposes exactly seven world members (`preload-app.cjs:845-880`); `grep openExternal|openUrl|openURL|externalLink` over it: **0 matches**. "Available but unauthorised", never "available and authorised".

### 4.5 The product question that decides it

| Aspect | ADR-014 §7 acceptance | `openTab('browser', …)` |
| --- | --- | --- |
| Where the page appears | "one new context", counted by browser tab targets | **right-sidebar dock, inside the DSH window** |
| Browser tab count | +1 | **unchanged** |
| Host document URL unchanged (§7.5) | required | **satisfied** |
| Site refuses iframes | works | **fails, possibly unobservably** |

If `@OpenUrl` means *"the user's browser shows this page"*, the sidebar tab is **not** that, and
shipping it under that name repeats ADR-014 Option B's error in a new costume. If it means *"the card
can cause this page to be shown to the user, host-mediated, under ADR-004's policy"*, it **is** that —
and it is a better fit than `window.open` on every axis the threat model cares about, **except that
its failure mode is silent**.

---

## 5. What each verdict means for the next round

Neither action is "Deferred" any more in the sense the ADRs used the word. Both are **EXTENDABLE**:
a real mechanism exists, and the remaining gaps are specific and nameable.

### `@ToAssistant` — recommend a third round, and a decision on two properties

The blocker is no longer technical feasibility; it is **two ADR-015 properties that the host cannot
satisfy**, both requiring a human decision:

| ADR-015 property | Status | Honest options |
| --- | --- | --- |
| Role not an argument | **Met by the host, structurally** | Record it. Nothing to do. |
| One in flight / per-card budget | Plugin's job | Implement + test; do not use `phase` (§3.4). |
| Length cap, generic failures, withdrawable | Plugin's job | Straightforward. |
| **Attribution is visible** | **Not available** | (a) In-message provenance line — what the user approves is byte-for-byte what is sent, and the transcript carries the mark. Honest, slightly noisy. (b) Upstream: a `source.kind = 'card'` + transcript rendering. Clean, needs DSH. |
| **Host-rendered confirmation the card cannot fake** | **Not available** | (i) Downgrade to "card-rendered, host-styled, exact bytes shown" — **a genuine weakening**, needs explicit sign-off. (ii) Upstream: a plugin-callable consent surface. |

**Recommended path:** implement against **Door C** (`inputActions`, already a prop — no scope
juggling, no DOM), with in-message provenance (a), and do **not** ship until the confirmation
question is decided. Add the one runtime probe from §6 first.

### `@OpenUrl` — recommend staying refused, but rewrite ADR-014's reason

ADR-014's claim that no host-mediated open exists is **false and must be corrected** — leaving it
would poison the next reader's search. But the capability that exists changes the action's meaning
and trades a *visible* failure mode (popup blocker) for an *invisible* one (iframe refusal), which is
the precise failure ADR-014 was written to prevent.

Two honest forwards: **C1** — accept sidebar semantics and re-specify the action as
"show this page beside the conversation", implemented against `openTab` with a plugin-side gesture
check and a visible cannot-be-shown state; or **C2** — request a true upstream `openExternal` plugin
API (small: the Electron side already does it at `lib/main.js:11970-11973`).

**Do not implement `@OpenUrl` as a sidebar tab without renaming it.** That is a product decision.

---

## 6. What remains unverified, and the one probe to run next

Per `AGENTS.md` §5, everything above is **Read** or **Type**. Nothing is **Verified** for either
action's end-to-end behaviour, and the report does not claim otherwise.

| Claim | Grade | How to close it |
| --- | --- | --- |
| Card's props carry `inputActions.submit` | **Type** | — (done, 3 controls) |
| A live card's `inputActions` is a real object | Read | One G0/G3-gated browser run: log `typeof inputActions.submit` from a card click |
| `submit()` delivers exactly one user turn | Read | Same run: message count before/after, compare text byte-for-byte |
| `openTab` works from a visible card | Read | Same run, with the sidebar browser enabled (it is) |
| iframe refusal is unobservable | Read | Point the tab at an `X-Frame-Options: DENY` host |

**The single next probe** (no product change): a scratch card whose click handler logs
`typeof inputActions.submit`, `session.pendingSubmissions.length` before/after, and the message
count delta. That converts every "Read" row above to **Ran** and would let a third round start from
evidence rather than inference.

---

## 7. Execution boundary — what this round did and did not do

**Did:**
- Read host source from the installed asar (`tmp/dsh-host-src/`), read the live profile config.
- Ran a cordis scope-rebinding probe (4 cases) and two type probes (positive + negative control + mutation).
- Ran a read-only live-route probe against `127.0.0.1:52851` (5 cases, exit 0).
- Wrote findings and evidence under `evidence/4b2/`.

**Did not:**
- Modify any product code, test, or frozen ADR. `git diff --stat` is **empty**; the only untracked
  addition is `evidence/4b2/` (plus a pre-existing handoff zip).
- Create a tag or release.
- Use `window.open`, `location.assign`, a synthetic anchor, or any chat-composer DOM manipulation as
  an implementation. `window.open` appears only as a *fact about the host's fallback path*.
- Restore Stage 5. That decision is yours, and this report is where it gets made.
