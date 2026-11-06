# Stage 7A — DSH host capability investigation

Date: 2026-11-07 · Verdict scope: `@ToAssistant` and `@OpenUrl` against the **installed**
DSH host · No product code changed; no runtime/browser execution.

**Evidence:** `evidence/stage-7a/` — `host-provenance.{md,json,mjs}`,
`submit-capability.md`, `attribution-capability.md`, `confirmation-and-openurl.md`,
`host-package-inventory.txt`, `asar-tool.mjs`.
**Design output:** `docs/decisions/ADR-016-TO-ASSISTANT-STAGE-7A.md` (draft, awaiting owner).

## 0. One-line answer

**`@ToAssistant` no longer needs two host changes — it needs one.** A host-rendered
confirmation a card cannot fake **now exists in the 0.2.2-rc.1 source and is
plugin-callable** (new since the 4B-2 baseline; between-turn availability is a Stage 7B
gate), and role escalation is host-enforced. What is still missing is
**message-level attribution**: the host hardcodes every browser submission to
`source.kind: 'user'` and renders it as an unattributed user bubble. Until the host can
carry and render host-validated card provenance, `@ToAssistant` stays **Deferred**
(ADR-016). `@OpenUrl` is unchanged: still no plugin-callable external open.

## 1. Which source this is based on (and why the old one was wrong)

| Fact | Value |
| --- | --- |
| Running desktop host | `@deepseek-ai/dsh-desktop` **0.2.2-rc.1** (asar header), runtime `dsh-desktop-runtime` 0.2.2-rc.1; **331** entries under `@deepseek-ai/`, **321** of them `dsh-*` at 0.2.2-rc.1 (the other 10 — cordis, cosmokit, schemastery, libreoffice-kit, … — carry their own versions) |
| What the app launches | `app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js` (`resources/runtime/cli/bin/dsh.cmd`) |
| 4B-2's tree | `tmp/dsh-host-src` = **0.2.1-rc.5** — *not* the running host; its line numbers do not apply |
| Plugin compile baseline | `node_modules/@deepseek-ai/*` = **0.2.1-rc.5** (devDeps); 0.2.2-rc.1 ships no `.d.ts` |

Consequences recorded in `host-provenance.md`: ADR-015 §10's `file:line` citations name a
tree that is not installed here; `dsh-client-ui-slots` no longer exists as a package (its
`SlotCore` is a web-shell builtin); `dsh-action-cards` / `dsh-client-ui-action-cards` are
new and were investigated separately. Every claim below is from the 0.2.2-rc.1 tree, which
was extracted with per-file SHA-256 verification against the asar.

## 2. The five questions, classified

The requested three-way split. "Plugin" means this plugin's own code (host half in the DSH
process, client half in the host page), as opposed to model-authored iframe content.

| # | Question | Classification | Evidence |
| --- | --- | --- | --- |
| 1 | Plugin-accessible **message submission** | **Exists and is usable** — three plugin surfaces: `inputActions.setDraft/submit` (slot prop), the `session.prompt` Remote via `sessions.retain(...).binding.session.prompt` (`Promise<RemoteResult<{accepted:true}>>`), and node-side `agent.steer` (already used by `src/self-repair.ts`) | `submit-capability.md` §2, §4 |
| 2 | Reliable **session / tool-call / card attribution** | **Partly** — `sessionId` and tool `callId` are host-supplied and not forgeable by the frame; **turn** is only in start-stage blocks, durable events and the turn-tail slot; the card *path* is plugin meta, not host identity; **no message-level attribution exists** | `attribution-capability.md` §1, §3 |
| 3 | Host-level **user confirmation / authorization** | **Exists and is plugin-callable** — approval panel via `tools/pre-execute → {kind:'ask'}` (in-turn, audited) and `ctx.userQuestions.ask()` (out-of-turn, host-rendered, no audit event); both render caller-supplied text, not host-read message bytes | `confirmation-and-openurl.md` §1–§4 |
| 4 | **Verifiable** submission result | **Card: no; plugin: partial.** `inputActions.submit(): void` (queue mode forced); `session.prompt` returns admission `{accepted:true}` only; delivery (`onRetire("observed")`) goes to the composer, and for queued sends "observed" means inbox admission, not turn start; an archived session accepts the prompt then blocks the turn with no error to the caller | `submit-capability.md` §3, §5–§6 |
| 5 | Are these really **open to plugins** (vs host-internal)? | **Mixed:** `inputActions` is a declared slot prop; `userQuestions` is a host service any plugin can `get`; `session.prompt` is a Remote reachable through a retained session; the **approval panel is host-internal plumbing** reachable only from a tool gate, and **only inside an open turn**; `shell.openExternal` is not plugin-exposed at all; **action cards are not composed in this profile and are model-only** | `confirmation-and-openurl.md` §1–§5 |

## 3. Precondition A — trusted attribution

### 3.1 What is trustworthy today

| Identity | Source | Forgeable by the card's iframe? |
| --- | --- | --- |
| `sessionId` | session-scope standard prop, materialised per session binding; also passed as the `inject(sessionId)` argument | **No** — card messages carry no identity fields |
| tool `callId` | owner prop from the tool row, stable across preparing/start/result | **No** |
| turn number | start-stage `block.turn`, durable `tool/call`/`tool/result` `data.turn`, turn-tail `TurnLocation.turn`; **absent from the settled result block and from the toolview owner props** | **No** |
| card path | plugin's own tool-result meta — not a host concept | n/a (plugin-defined) |

The frame is `<iframe sandbox="allow-scripts">` — opaque origin, `frame-ancestors`/CSP
`default-src 'none'`, no popups. Its only accepted messages are `height`, `prompt`, `state`,
each carrying only a correlation token; the parent checks `event.source` and its own token,
and attaches identity from slot props. A malicious fragment can author text, not identity.

### 3.2 What does not exist: attribution on the message

- `session/prompt`'s wire schema accepts `requestId`, `sessionId`, `mode`, `content`,
  `clientTimeZone` — **no source, no role, no call id**.
- The host builds the source itself: `{ kind: 'user', rpcId, clientTimeZone?, principal }`
  (`dsh-api-session-controller/lib/index.js:4048-4061`, verified).
- `MessageSourceMap` has no card/visualize kind; `'user'` messages render as a plain bubble
  with no provenance; `rpcId` and `principal` appear only in dedupe paths and are never
  rendered.
- Result: a message submitted by a plugin is **indistinguishable from typed input** — the
  exact property ADR-015 §5 requires and does not get.

## 4. Precondition B — confirmation and real submission

### 4.1 The five states, for a card

| State | Observable by the card? |
| --- | --- |
| 1. user clicked | yes, card-locally (no host click signal exists) |
| 2. host accepted the request | **no** direct signal; inference only (draft cleared, `useInput.phase` `sending→plain`, echo appears in `pendingSubmissions`) |
| 3. request reached the backend | same event as (2) — the RPC receipt; consumed by the composer |
| 4. message entered the session/turn | **no**; internal `onRetire("observed")` goes to the composer only, and for queue mode it means inbox admission, not turn start |
| 5. outcome reported back to the card | **no channel** — no promise, callback, event or request id; failure notices go only to `conversation.composer.bar` |

At plugin level, `session.prompt` returns `{accepted:true}` and `beginSubmission` exposes
accept/observe/fail callbacks — so the *plugin* can report states 2–3, not 4, back to a card.

### 4.2 Confirmation surfaces (the important change since 4B-2)

| Surface | Plugin-callable? | Host-rendered outside the card? | Turn-bound? | Audited? | Exact bytes? |
| --- | --- | --- | --- | --- | --- |
| Approval panel via `tools/pre-execute → {kind:'ask'}` | yes (host listener) | yes | **yes — throws outside an open turn** | yes (`approval/asked` + `approval/decided`) | caller text only |
| `ctx.userQuestions.ask()` | yes (host service) | yes | **no turn check in the service**, but the browser answerer answers only a scoped request: it needs `ctx.sessions.scopeOf(owner)` and the exact live root agent | **no durable decision record at all** for a direct plugin ask (the tool-call projection covers only the `ask_user_question` tool) | caller text, re-rendered through `MarkdownText` |
| Action cards (`propose_action`) | kind registration only; proposal is **model-only** | yes | card shown **after** the turn; user acts later | yes (`plugin:action-cards/decision`) | model-written |

So the ADR-015 §5 "host-rendered confirmation the card cannot fake" has a **source-level
answer in 0.2.2-rc.1**: `userQuestions.ask` is host-side, host-rendered, and the approval
panel is a second audited surface. Three conditions are **not yet verified** and are Stage
7B gates, not today's guarantees: (i) the browser answerer needs the **live root agent**
and a session scope — whether that holds between turns for an idle conversation is
unproven; (ii) `question.detail` is rendered through `MarkdownText`, so a markdown
re-render could change *displayed* bytes even when the submitted string is identical —
byte-equality of the preview is a test to write, not a property to assume; (iii) a direct
plugin ask leaves **no durable decision record**. What is *not* provided at all is a
host-read rendering of a durable message's bytes; the plugin passes the text it will send.
Layout/truncation at long lengths is also a Stage 7B verification item.

Two deployment facts: this session runs the `never` approval policy (danger-full-access
preset), so the approval panel is disabled here by design; `userQuestions` **is** composed
(`dsh-base/cordis.patch.yml:79-80` for the host half, `dsh-web-app/cordis.patch.yml:461-462`
for the browser half), while action cards are not composed in this profile (only the
personalized-recommendations bundle mounts them).

## 5. `@OpenUrl` — record only

**No plugin-callable external open exists in 0.2.2-rc.1.** `shell.openExternal` is Electron
main renderer policy on `window.open`/cross-origin navigation (`app-asar-root/lib/main.js:20139,
20205`); the preload exposes no open member. The only mediated web open is
`ctx.sidebarRight.openTab('browser', {params:{url}})` — in-app iframe tab, `void` result,
unobservable failures. The `open-in-app` packages — present in **both** 0.2.1-rc.5 and
0.2.2-rc.1, so not new — open **directories** only, through authenticated routes and a
fixed catalog. `session.openWorkspacePath` opens verified workspace paths, not URLs.
ADR-014's blocker is unchanged; the upstream ask stands.

## 6. What must change in the host — the direct answer

**`@ToAssistant`: yes, one change.** A minimal, host-validated provenance on the prompt
admission path, plus transcript rendering:

1. The prompt request gains an optional origin claim, e.g. `origin?: { kind: 'card'; callId }`.
2. The host validates it against **its own log** (a logged `tool/call` with that id in the
   **resolved** session — the client never names a session for the claim), then records it
   in the message source (new `MessageSourceMap` member or a field on `'user'`).
3. The transcript renders it on the user bubble ("sent from a card", with the tool call id;
   the card path is plugin meta and can be shown by the plugin, not the host).
4. Display-only, never authorization: the gateway peer/principal remains the authority;
   the claim only changes what the reader sees.

Not required **in principle**: a host-rendered confirmation surface exists
(`userQuestions.ask`, subject to the three conditions in §4.2 that Stage 7B must verify),
role enforcement (host already fixes it), submission initiation (three paths exist).
Optional hardening to request alongside: reject prompts to archived sessions with a
distinguishable error, and expose delivery state (`accepted → observed`) per submission
instead of composer-only callbacks.

**`@OpenUrl`: yes, one change** — a plugin-callable external open with a distinguishable
result and host-owned URL policy. Unchanged from ADR-014 §10.4.

## 7. Grades and limits

- Everything above is **Read** (source, file:line in the 0.2.2-rc.1 tree) or **Type**
  (0.2.2 `typert.host.js` declaration strings, or the 0.2.1-rc.5 `.d.ts` baseline, marked as
  skew). **Nothing is Ran against the live host** — no capability here is claimed as
  verified behaviour.
- `dsh-agent` was not extracted, so the Agent contract behind `followup`/`steer` and
  `agent/pre-step` is unread.
- `dsh-client-ui-workspace` was not extracted, so whether an ordinary card can observe
  archivedness is open.
- The desktop profile's composed bundles were read from `cordis.patch.yml`, not observed at
  runtime.

## 8. Files

| File | What it is |
| --- | --- |
| `host-provenance.md` / `.json` / `host-provenance.mjs` | asar identity, 0.2.2-rc.1 vs stale 0.2.1-rc.5 tree, integrity-checked reads |
| `asar-tool.mjs` | list/extract from the asar with per-file SHA-256 verification |
| `host-package-inventory.txt` | 331 `@deepseek-ai` entries: 321 `dsh-*` at 0.2.2-rc.1, 10 independently versioned (cordis, cosmokit, schemastery, libreoffice-kit, …) |
| `submit-capability.md` | five-state table, submit modes/returns, failures, duplicate/replay, cross-session |
| `attribution-capability.md` | trustworthy identity, frame trust boundary, source kinds, staleness/replay |
| `confirmation-and-openurl.md` | approval panel chain, user questions, action cards, `@OpenUrl` record |