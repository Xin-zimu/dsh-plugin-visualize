# Stage 7A — confirmation surfaces and `@OpenUrl` against DSH 0.2.2-rc.1

Date: 2026-11-07. Read-only source investigation (no runtime execution, no network).
Source of truth: the installed desktop asar `C:/Users/<user>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar`
(root package `@deepseek-ai/dsh-desktop` 0.2.2-rc.1, main `lib/main.js`; bundled runtime
`dsh/package.json` = `@deepseek-ai/dsh-desktop-runtime` 0.2.2-rc.1), extracted with
`evidence/stage-7a/asar-tool.mjs`, which verifies every file against the archive's own SHA-256.
The stale `tmp/dsh-host-src` (0.2.1-rc.5) tree is **not** cited anywhere below.

## Grade legend

- **Read** — read from the extracted 0.2.2-rc.1 file at the cited line.
- **Type** — read from a type declaration. Note the skew: 0.2.2-rc.1 packages in the asar ship
  `lib/client.js`, `lib/index.js`, `lib/typert.host.js` but **no `.d.ts`**; the only `.d.ts` on this
  machine are the plugin's devDependency copies at **0.2.1-rc.5** (`node_modules/@deepseek-ai/*`).
  Every Type row says which version it came from.
- **Ran** — a command whose output is quoted. Not used for product behaviour: nothing here was
  executed in the host or in a browser.

Method: PowerShell `Select-String` / `Get-ChildItem` over the extracted tree (ripgrep tools return
false zeroes on gitignored `tmp/`). The asar root was additionally extracted to
`tmp/dsh-host-0.2.2-rc.1/app-asar-root/` (packages `lib/`, `renderer/`) because `@deepseek-ai/*`
packages do not contain the Electron main/preload that performs external opens.

### Packages extracted for this investigation (all integrity-verified, 0.2.2-rc.1)

`dsh-base`, `dsh-web-app`, `dsh-official-bundles`, `dsh-experimental-agent-team-profile`,
`dsh-host-open-in-app`, `dsh-client-ui-open-in-app`, `dsh-desktop-host`, `dsh-web-frontend`,
`dsh-personalized-recommendations`, `dsh-experimental-auto-review`, `dsh-tools`, `dsh-native-command`,
plus `app-asar-root/{lib,renderer}` from the asar root.

---

# PART 1 — confirmation / authorization

## 1. Verdict (short)

**Yes, a host-rendered decision surface that a model-authored card cannot draw or fake exists and is
plugin-callable from a host plugin** — two of them:

1. **The approval panel** (`dsh-user-approval` + `dsh-client-ui-approval`), reached from a plugin tool
   by returning `{ kind: 'ask' }` from a `tools/pre-execute` listener. Chain, all 0.2.2-rc.1:
   plugin listener → `dsh-tools/lib/pipeline.js:386-387` → `ApprovalService.request`
   (`dsh-tools/lib/pipeline.js:608-631`) → `approval/request` waterfall
   (`dsh-user-approval/lib/index.js:201`) → Agent-scoped Remote Event
   (`dsh-client-ui-approval/lib/client.js:475-477`) → host-rendered composer takeover
   (`…/client.js:468-474`, `173-184`) → user press resolves the waterfall
   (`…/client.js:259-265`) → host appends `approval/asked`/`approval/decided`
   (`dsh-user-approval/lib/index.js:156-167`). The card lives in
   `<iframe sandbox="allow-scripts">` with its own CSP (`src/window-doc.ts:20`, `src/shell.ts:34-38`),
   so it can neither draw nor answer that panel.
2. **The user-questions composer** (`dsh-user-questions` + `dsh-client-ui-user-questions`), reached
   from a tool by `ctx.userQuestions.ask({ questions, agent: exec.agent, signal: exec.signal })`.
   The browser renders the question (and its `detail` text) and returns a structured answer to the
   waiting host call. 0.2.2-rc.1 validates a dedicated `intent: 'approval'` presentation
   (`dsh-user-questions/lib/index.js:684-706`), advertised on the wire
   (`dsh-user-questions/lib/typert.host.js:276`; `dsh-api-session-controller/lib/typert.host.js:190`).

**But the exact-bytes property does not exist.** Neither surface takes a reference to a durable
message and shows host-read bytes. Both render **caller-supplied plain text** (`reason` /
`displayReason`, or `question.detail`) as text; the host does not verify that the text matches any
message. The only host-read approval detail is `conversation.approval.detail`, keyed by `callId`, and
the shipped renderer extracts only `args.command` from the correlated tool call
(`dsh-client-ui-chat/lib/client.js:151-172`, registered at `:15577`). For a non-shell tool it renders
nothing. So: **unforgeable consent — yes; host-verified exact message bytes — no API.**

Two deployment caveats that decide whether the surface is reachable at all:

- **Approval policy.** The base bundle composes `dsh-user-approval` with
  `policy: (DSH_PERMISSION_MODE ?? 'workspace-write') === 'danger-full-access' ? 'never' : 'ask'`
  (`dsh-base/cordis.patch.yml:259-262`). This session's runtime-context snapshot contains the
  service's `NEVER_SENTENCE` ("Approval prompts are disabled in this session: … rejected
  automatically", source `dsh-user-approval/lib/index.js:39`), i.e. **the session is on `never`**;
  under `never` `request()` returns `rejected` before any answerer (`…/index.js:200`), so the panel is
  intentionally not reachable in this session. Switch to the `workspace-write` / `read-only` preset
  (`dsh-base/cordis.patch.yml:264-276`) to get `ask`.
- **Turn binding.** `request()` throws outside an open turn (`dsh-user-approval/lib/index.js:153-155`);
  a tool execute is inside a turn, so the normal path is fine. `userQuestions.ask()` has **no** turn
  check (only live-root and an answerer requirement).

## 2. Capability table

| Surface | API / trigger | Who may call it | Turn-bound? | Host-rendered, card-forgeable? | Durable record / persistence |
| --- | --- | --- | --- | --- | --- |
| Approval panel — `ctx.approval.request()` | `dsh-user-approval` service (`super(ctx,'approval')` at `lib/index.js:97`), waterfall `approval/request` (`:201`) | Host-side only (0 `Remote` decorators in the package). Consumers: tools pipeline, sandbox escalation, a plugin's own `tools/pre-execute` listener, or a plugin that injects/`get`s `approval` | **Yes**, throws outside an open turn (`:153-155`) | Host React composer takeover; the sandboxed card cannot draw or answer it. Request content is caller text (`toolName`, `reason`, `displayReason`, optional `callId`) | `approval/asked` + `approval/decided` appended to the session log; outcome vocabulary is one-shot only (`allowed-once`/`rejected`/`cancelled`/`unavailable`, `:30-35`); pending promises/grants are process-local (README:164-168) |
| Approval panel — declarative tool gate | `ctx.on('tools/pre-execute', async (exec, next) => …)` returning `{ kind:'ask', reason?, displayReason? }` | **Any host plugin**; the tools pipeline resolves it (`dsh-tools/lib/pipeline.js:386-387`, `608-661`). Shipped precedent: `dsh-experimental-auto-review/lib/index.js:565-598, 537-543` | Yes — the gate runs in `prepare()` of a dispatched call, inside the turn | Same panel as above; the plugin never touches DOM or the browser | Same audit pair, appended by the approval service |
| User questions — `ctx.userQuestions.ask()` / `askTimed()` | `dsh-user-questions` service (`:492`), waterfall `user-questions/request` (`:709`) | Host-side plugins/tools (`ask`/`askTimed` are **not** Remote: `dsh-user-questions/lib/typert.host.js:213,220`); browser side may only `answer`/`attachWait` (`:199,206`) | **No** turn check. Requires a live root agent when an agent is supplied (`:539, :680`); a browser answerer must be connected | Host composer question card; question text, `detail` and options rendered by host UI (`dsh-client-ui-user-questions/lib/client.js:1139-1142`). No approval audit event | Blocking ask: answer returns to the caller; not persisted. Tool-call asks: the `userQuestions` projection derives questions from the logged tool call + result + reply; a timed pending question becomes `continued` and is answered via Remote `answer()` with a steered `user-question-reply` message (README:27,35,40) |
| `dsh-authorization` (credentials) | `ctx.authorization.registerFlow()`, `begin()`, `cancel()` (`lib/types/index.js:74,143,121`) | Any host plugin/surface; the caller passes the interaction (`request.interaction`) | No turn binding; one attempt per credential key | **Not a consent surface**: notices/prompts go only to the interaction the caller supplied (`:173, :257-269`); headless interactions decline | A successful flow must commit a credential record through `ctx.credentials`; `authorized` means the record is really stored (`README:65,113`); attempts are process-local and not resumable (`README:148`) |
| `dsh-permission-presets` (policy selector) | `ctx.permissionPresets` (`set`, `current`, `catalog`); client selector | Host plugins and the shipped selector; client reads a Remote catalog | Session-level write at switch time | **Not a confirmation**; it configures sandbox+approval | Appends `permission/preset` and writes knobs through `setApprovalPolicy` (`lib/index.js:229,351,362`); approval policy is the durable `approval/policy` event |
| Action cards — `dsh-action-cards` + `dsh-client-ui-action-cards` | Host: `ctx.actionCards.register(kind)` (`types/index.js:211`), `record()` (`:256`), Remote `act()` (`:282`); model tool `propose_action` (`:130-149`); browser: `ctx.remote.actionCards.act(sessionId, callId, verb, payload)` (`client.js:868`) | Kind registration/record: host plugin. `act`: browser (Remote). `propose_action`: **model only**, live root agent, kind skill loaded this turn, one card per turn, no queued messages, main conversation only (`types/index.js:359-390`) | Card is shown **after the turn ends** (`client.js:448-460`); user action occurs between turns | Host React card in `conversation.chat.turnTail`; kind `Body` may add controls; user press goes through the host Remote call. Card content (`title`, `brief`, `details`) is model-supplied | `plugin:action-cards/decision` appended by `record()` (`:352`), reported to the model next step (`:178-199`). **Not composed in this desktop profile** (see §5) |

## 3. `tools/pre-execute` → approval: the exact plugin-callable chain

This is the only plugin-callable path that reaches the **approval panel** with a real audit pair,
without the plugin touching the UI.

1. Plugin host half registers a waterfall listener (auto-review precedent, Read):
   `dsh-experimental-auto-review/lib/index.js:565` — `ctx.on('tools/pre-execute', async (exec, next) => …)`.
2. The listener returns `{ kind: 'ask', reason?: string, displayReason?: { en, [locale] } }`
   (`:537-543`). The decision vocabulary is **Type** at 0.2.1-rc.5:
   `node_modules/@deepseek-ai/dsh-tools/lib/types/index.d.ts:436-460` — "`ask` runs only after an
   approval service returns `allowed-once` and otherwise denies; its `reason` is the audited approval
   reason and its optional `displayReason` is the localized prompt text". 0.2.2-rc.1 consumes the same
   vocabulary (Read, `dsh-tools/lib/pipeline.js:387`).
3. Pipeline: `dsh-tools/lib/pipeline.js:386-387` runs the waterfall and, for `ask`, calls
   `serviceAsk()` (`:608`); `serviceAsk` resolves `ctx.get('approval')` (`:609`), degrades closed if
   absent (`:610-616`) or if the execution has no agent (`:617-623`), then calls
   `approval.request({ agent, toolName: exec.name, callId: exec.callId, reason?, displayReason?, signal: exec.signal })`
   (`:624-631`). Outcome mapping is one-to-one (`:632-657`).
4. Host: `ApprovalService.request()` enforces the open turn (`dsh-user-approval/lib/index.js:153-155`),
   appends `approval/asked` (`:156-162`), races the answerer waterfall (`:201`), appends
   `approval/decided` (`:164-167`).
5. Browser: `dsh-client-ui-approval` is an Agent-scoped Remote-Event consumer —
   `ctx.remote.$on('approval/request', …)` (`lib/client.js:475-477`). It parks a `PendingApproval`
   (`:197-297`, fields `toolName/callId/reason/displayReason` at `:223-231`), registers a composer
   takeover that selects it (`:468-474`), and renders the shared card with Allow once / Reject
   (`:173-184`; card at `:41-165`). The detail region is an optional slot
   `conversation.approval.detail` keyed by `callId` (`:46`); the shipped occupant only renders
   `args.command` (`dsh-client-ui-chat/lib/client.js:151-172`).
6. On press, `PendingApproval.answer(outcome)` resolves the pending promise (`:259-265`), which
   resolves the `$on` handler, which resolves the host waterfall, which returns `allowed-once` to
   `serviceAsk`, which allows the tool body to run.

Why a card cannot forge it: the card is a document inside
`<iframe sandbox="allow-scripts">` with `FRAME_CSP` starting at `default-src 'none'`
(`src/window-doc.ts:20`, `src/shell.ts:34-38`). It has an opaque origin, no host DOM access, no
popups and no access to `ctx.remote`; the only messages it can send are the plugin's own
`postMessage` relays. The approval UI is host React chrome outside the frame and its answers exist
only as the resolved waterfall value.

Limits of this path (Read):

- The request names **no tool arguments** — README:`165-166` states the request carries only tool
  name, reason and optional call id ("The request carries no tool arguments"). So the panel cannot
  show the exact bytes of the call it is gating unless the plugin supplies them as `reason` /
  `displayReason` text.
- One-shot only: `OUTCOMES` has no `allow-always` (`lib/index.js:30-35`); README:`165`. The
  `onAlways` affordance in the shared card exists (`client.js:45,152-159`) but no shipped 0.2.2-rc.1
  caller passes it (no other `renderFactorySlot('conversation.approval.card', …)` caller in the
  extracted tree; grep for `onAlways` finds only the UI package).
- `never` policy rejects before dispatch (`lib/index.js:200`), and this session is on `never`.
- Pending requests are process-local and are not checkpointed (`README:167-168`).

## 4. `dsh-user-questions` + `dsh-tool-ask-user` + `dsh-client-ui-user-questions`

Read evidence:

- Service: `dsh-user-questions/lib/index.js:453` (class), `:492` (`super(ctx,'userQuestions')`),
  `:560` `answer()`, `:604` `attachWait()`, `:621` `askTimed()`, `:676` `ask()`.
- Contract (Type, 0.2.2-rc.1 declaration strings): `lib/typert.host.js:199`
  `@Remote answer(agent, callId, answer): boolean`; `:206` `@Remote({mode:'stream'}) attachWait`;
  `:213` `askTimed`; `:220` `ask` (**not Remote**); `:276` `AskUserQuestionIntent =
  plan-review | approval {approve, reject, always?, subject?, display?}`; `:933` the scoped
  waterfall signature `'user-questions/request'(this: Scoped<Agent>, request, next)`.
- Ask validation for `intent: 'approval'` (`lib/index.js:684-706`): one question, no multiSelect,
  no timed wait, distinct labels `[approve, reject, always?]` exactly covering the offered options,
  and `detail` required as the "scope detail". `plan-review` needs `approve` among its options.
  Errors are `BAD_INTENT`; no answerer is `NO_PROVIDER` (`:707`).
- **No turn check** anywhere in `ask()`; it only requires live-root when an agent is supplied
  (`:680`, `:539`), and an accepting answerer (`:707-710`).
- Model-facing tool: `dsh-tool-ask-user/lib/index.js:216` injects `['tools','userQuestions']`;
  legacy `execute` at `:304-320` calls `ask()`; timed mode at `:180-199` calls `askTimed(...)` and
  passes `wait: { callId: exec.callId }` (`:195-197`).
- Projection: `dsh-user-questions/lib/types/projection.js:6` (`ASK_USER_QUESTION_TOOL`), `:25-26`
  (arguments schema), `:277` (`foldUserQuestions`); README:`27` "the `userQuestions` projection
  derives durable questions from the tool call, its result, and the eventual reply".
- Browser: `dsh-client-ui-user-questions/lib/client.js:2277-2279`
  `ctx.remote.$on('user-questions/request', …)`; `answerQuestion()` at `:2100-2156` keys the card by
  `request.wait?.callId` (`:2103`), builds a waterfall channel, and renders it; the composer takeover
  is registered at `:2259-2269`; `PendingQuestion` keys a named call as
  `question:<sessionId>:<callId>` and an unnamed one randomly (`:182-204`); `question.detail` is
  rendered as plain text (`:1139-1142`).

What this means for a plugin confirmation:

- A **plugin tool can ask the user a structured question during its own execution** and receive the
  answer (`ask()` blocks; `exec.agent` + `exec.signal` are available as Type at 0.2.1-rc.5,
  `dsh-tools/lib/types/index.d.ts:216-241`).
- The shipped **desktop browser only special-cases `plan-review`** (`client.js:42-61`); the
  `approval` intent is validated and advertised on the wire but falls through to the generic option
  flow in this bundle (a real presentation gap in 0.2.2-rc.1's shipped UI, Read). Generic rendering
  still shows the question text, `detail` text and the caller's option labels, so it is still
  host-rendered and still unforgeable — only the "fixed reject/allow/always actions" promise of the
  service README is not realised by this client.
- No approval audit event is written: the answer is a value returned to the caller (while the call is
  open) or a steered `user-question-reply` user message (continued/timed). The user-questions README
  is explicit that "the caller continues to own authorization and persistence" (`README:31`).

## 5. New in 0.2.2: `dsh-action-cards` / `dsh-client-ui-action-cards`

Read evidence:

- Host service `actionCards`: `dsh-action-cards/lib/types/index.js:101`
  `static inject = ['tools','agents','sessionProjections','remoteAccess']`, `:124`
  `super(ctx,'actionCards')`. Type declarations (Read from 0.2.2's `lib/typert.host.js`):
  `:156` `register<Details>(kind): () => void`, `:163` `record(agent, decision): void`,
  `:177` `@Remote act(agent, callId, verb, payload?): Promise<ActionCardResult>`.
- The only way a card exists is the model tool `propose_action` (`:130-149`, declared only while a
  registered kind's skill was loaded by the agent this turn); constraints in `propose()`
  (`:359-390`): root agent only, not dispatched from code, no subagent, queued-message limit, one
  card per turn, details validated by the kind's zod schema, blank title/brief refused.
- The card is **host-rendered React** in the chat turn tail: `dsh-client-ui-action-cards/lib/client.js:452-460`
  (`ActionCardTail` returns null while the turn is open or ended without answer text), `:466-497`
  (frame, `data-action-card={callId}`, title/brief as text), `:504-549` (fallback body = Not now).
  Registration: `:859-872` (`conversation.chat.turnTail`), presses call
  `ctx.remote.actionCards.act(sessionId, callId, verb, payload)` (`:868`); a process row is added at
  `:873-877`.
- Decisions are recorded host-side: `ctx.actionCards.record()` refuses unregistered actions and
  derived phases (`:256-263`) and appends `plugin:action-cards/decision` (`:352`); a status notice is
  injected at the next `agent/pre-step` (`:178-199`).
- Composition: only the **personalized-recommendations** bundle mounts it —
  `dsh-personalized-recommendations/cordis.patch.yml:2-5` (`action-cards`, `client-ui-action-cards`).
  The desktop profile's bundle list is `dsh-base`, `dsh-web-app`, `dsh-context`,
  `@wxg-prc-cpg/browser-skill-dsh-plugin`, `@nagi-ovo/dsh-visualize`,
  `dsh-experimental-agent-team-profile` (`C:/Users/<user>\.dsh\profiles\desktop\package.json:13-20`);
  `personalized-recommendations` is absent, and a grep for `action-cards` in the composed bundle
  patches (`dsh-base`, `dsh-web-app`, `dsh-experimental-agent-team-profile`) returns 0 rows (Ran,
  Part 2 §5). **So action cards are not loaded in this desktop session.**

Does it change the Part 1 verdict? **No.** Action cards are a *post-turn, model-proposed,
kind-registered deferred action* surface, not a way for a plugin to ask "may I do X now?":

1. The plugin cannot call `propose_action` — only the model can, and only after loading the kind's
   skill; the tool refuses calls from code and from subagents (`:363-367, :371-390`).
2. The card appears only after the turn ends with a final answer (client `:452-460`), and a user
   action is a Remote call that runs the kind handler *later* (possibly many turns later). This is
   consent for a deferred action, not an in-turn gate.
3. Even as a deferred consent record it is real and host-verified: the user's press is host UI, the
   decision is appended by the host service, and the card cannot be forged. It would be the right
   seam if the design wanted "propose, then the user starts it from the card".
4. Its visible content is still model-written (`title`, `brief`, kind-validated `details`), not a
   host-verified rendering of a specific message; and the one-per-turn, root-only, skill-activation
   constraints make it unsuitable as a general confirmation channel.

## 6. Summary table for the design question

| Requirement | `approval` via `tools/pre-execute` ask | `userQuestions.ask` | action cards |
| --- | --- | --- | --- |
| Plugin-callable without touching browser code | Yes (host listener) | Yes (host tool/plugin) | Kind registration only; proposal is model-only |
| Host-rendered, outside the card iframe | Yes | Yes | Yes |
| User press is genuine (card cannot fake it) | Yes | Yes | Yes |
| Blocks the action until the answer | Yes — the tool body does not run | Yes for `ask()` | No — action executes after the turn, from the card |
| Audited in the session log | Yes (`approval/asked` + `approval/decided`) | Only tool-call projection; no decision event | Yes (`plugin:action-cards/decision`) |
| Carries host-verified exact message bytes | **No** — caller text only | **No** — caller text only | **No** — model-written title/brief/details |
| Available in this session/profile | No — policy `never` here; also not composed in this profile | Yes (composed by `dsh-base:79-80`) | No — bundle not enabled |

---

# PART 2 — `@OpenUrl` record (no design)

Question: in 0.2.2-rc.1, is there a plugin-callable open-external path (`shell.openExternal`, preload
exposure, `sidebarRight.openTab('browser', …)`, any new `open-in-app` package)?

**Recorded answer: no plugin-callable *external URL* open exists.** The only external open is
renderer policy in the Electron main process, reached by `window.open`/cross-origin navigation from
page code; the only plugin-callable web open is the in-app sidebar browser tab; the new `open-in-app`
packages open *directories* in a fixed application catalog behind authenticated host routes; the
Session Remote `openWorkspacePath` opens a verified workspace *file/dir path* with the OS default
application. None accepts an arbitrary URL with a distinguishable result for a plugin.

## 1. Electron: `shell.openExternal` exists, but only as renderer policy

Read, from the asar root (`app-asar-root/lib/main.js`, extracted from the 0.2.2-rc.1 app.asar):

- Main window creation — `:20138-20141`:
  ```js
  window.webContents.setWindowOpenHandler(({ url }) => {
      if (["http:", "https:"].includes(new URL(url).protocol)) shell.openExternal(url);
      return { action: "deny" };
  });
  ```
- Main window navigation — `:20200-20207`: any navigation that is not `dsh-app:` and not same-origin
  http is `preventDefault()`ed and, if `http:`/`https:`, handed to `shell.openExternal`.
- Account/platform view — `:13083-13087`: `https:` only, no username/password.
- Other uses: `:18124`, `:20400` (platform-login flows).

Preload exposes **no** open member — Read, `app-asar-root/lib/preload-app.cjs:1875-1943`
(`createProductApi()` = fileActions save/clipboard-image, browser acquire/release/onOpenRequested,
fileDrag, deviceInfo, keyboard, shortcuts, updates) and `:1944-1976` (`exposeInMainWorld` for
`dshDesktop`, `dshPlatform`, `__DSH_DIRECTORY_PICKER__`, `__DSH_HOST_PATHS__`, `dshDesktopBoot`,
`__DSH_LOCALE__`, `dshOnboarding`). Ran: grep `openExternal|openUrl|openURL|externalLink` over the
extracted `app-asar-root/lib/*.cjs` → **0 matches**.

Consequences: `window.open(url, …)` in the SPA is what reaches `shell.openExternal` on the desktop.
That is exactly what the shipped chat client does for a link when the sidebar carrier is absent —
Read `dsh-client-ui-chat/lib/client.js:15498-15500`:
```js
openExternalLink: (url) => {
  if (linkOpening.getSnapshot() === "sidebar" && ctx.get("sidebarRightTabs")?.get("browser") !== void 0)
    ctx.sidebarRight.openTab("browser", { params: { url } });
  else window.open(url, "_blank", "noopener,noreferrer");
}
```
A plugin *client half* can also call `window.open` (it is trusted page code), but that is browser
API, not a host-mediated capability: no allowlist, no result, no audit, and it is the path ADR-004 /
ADR-014 Option A forbids for card code. A card cannot do it: its frame is
`<iframe sandbox="allow-scripts">` (`src/window-doc.ts:20`) with `FRAME_CSP` anchored at
`default-src 'none'` (`src/shell.ts:34-38`) — no `allow-popups`, no top navigation, no host origin.

## 2. Plugin-callable mediated web open: only the sidebar browser tab

Read `dsh-client-ui-sidebar-browser/README.md:43`:

> `Client plugins can open a tab through ctx.sidebarRight.openTab('browser', { params: { url } }).`
> `The optional URL passes the same validation as address-bar input before navigation.`

- Call site type: `ctx.sidebarRight.openTab('browser', { params: { url } })`; shipped editor/browser
  code uses it (`dsh-client-ui-sidebar-browser/lib/client.js:157-160`, `:1763`; sidebar-right
  `:2249-2250`).
- Validation: `parseBrowserAddress` — `dsh-client-ui-sidebar-browser/lib/client.js:358-407`:
  16 KiB cap before parse, `new URL`, refuses embedded credentials, only `http:`/`https:`, refuses
  the DSH application origin. Refusals are visible strings, not silent no-ops.
- Result: `openTab` is a layout/navigation state mutation returning `void`; it reports nothing to the
  caller, and iframe load failures can be unobservable (sidebar README:104,107, cited by ADR-014
  §10.2).
- It opens an iframe **inside the host window**, not a browsing context. ADR-014 §10.2's reasons for
  not treating it as `@OpenUrl` still stand in 0.2.2-rc.1 (the API is unchanged).

## 3. `dsh-host-open-in-app` + `dsh-client-ui-open-in-app` (present in both 0.2.1-rc.5 and 0.2.2-rc.1; not new)

Composed in the Web app bundle (`dsh-web-app/cordis.patch.yml:73-78` host with deadlines, `:84-85`
client) and present in the runtime package set. Read:

- Host half registers **three raw webServer routes**, not a Cordis service:
  `GET /open-in-app/apps`, `GET /open-in-app/icon/<id>`, `POST /open-in-app/open`
  (`dsh-host-open-in-app/lib/index.js:1126-1132`, `1271-1401`). It injects
  `['webServer','connection','subprocess']` (`:1160-1164`).
- Every route first asks the composition's `connection` service for a rejection
  (`requestRejection`, `:1264-1270`), i.e. Host/Origin fence + browser authentication; the open route
  additionally requires `application/json`, a 64 KiB body cap, a resolved-available **catalog id**
  and an **absolute existing directory** path (`:1320-1400`, checks at `:1329-1389`). The catalog is a
  compile-time whitelist of editors/Git GUIs/terminals/file managers (`lib/types/catalog.js`), and
  launches are verified launchers spawned without a shell (`:348` onward, `:905-928`).
- Client half posts `{ app, path }` (`dsh-client-ui-open-in-app/lib/client.js:392-424`) and uses the
  Session Remote for file controls (`session.workspacePathApplications`, `session.openWorkspacePath`).
  Its **URL context menu** offers sidebar open, external open, and copy —
  `:227-258`; the external item is literally `window.open(url, "_blank", "noopener,noreferrer")`
  (`:244`), which is the Electron-main path of §1, not a host open API.
- So `open-in-app` is: directory-only, fixed catalog, authenticated HTTP route, no URL, no result
  contract for the model/plugin beyond HTTP status, and not reachable as `ctx.*`. The package
  README even names the non-existent-in-0.2.2 `dsh-apiproxy.openPath` as the path opener
  (`dsh-host-open-in-app/README.md:32`); `dsh-apiproxy` is **not** in the 0.2.2-rc.1 package
  inventory (Ran, Part 2 §5).

## 4. Host-side path open (files/directories), also not a URL open

- `dsh-native-command` exports `openNativePath(path, signal)` and
  `openNativeAssociatedPath(path, signal)` (`lib/types/path-opener.js:198-209`), dispatching per
  platform (`:144-169`): macOS `open`, Windows Explorer via a file URI, Linux `xdg-open`, WSL
  `wslpath` — argv, never a shell string; path only, never a URL.
- `dsh-api-session-controller` exposes them to the browser as Session Remote methods:
  `@Remote canOpenWorkspacePath(): boolean` and `@Remote openWorkspacePath(request, signal)`
  (`lib/index.js:3451-3452`, `3958`, `3980`; the method verifies the path through the composed
  filesystem first — `verifyDesktopPath`, `:4011`; `openPath` is `openNativeAssociatedPath`,
  `:3795`). Request shape carries `path`, optional `action: 'reveal'`, optional `application`
  (`lib/types/index.js:420-458`). **Path only, and it must map to the host filesystem** — no URL, and
  no differing result kinds beyond success/throw.

## 5. Absence checks (Ran)

| Claim | Command (PowerShell, over the extracted 0.2.2-rc.1 tree) | Result |
| --- | --- | --- |
| No literal `@OpenUrl` in the host | `Get-ChildItem tmp/dsh-host-0.2.2-rc.1/dsh/node_modules/@deepseek-ai -Recurse -File -Include *.js,*.json,*.md \| Select-String 'OpenUrl' -SimpleMatch` | 4 matches, all macOS `NSWorkspace.URLForApplicationToOpenURL` in `dsh-native-command` (`lib/index.js:739,741`, `lib/types/file-applications.js:13,15`) — **0** for `@OpenUrl` |
| No plugin-visible `openExternal` in runtime packages | same tree, `Select-String 'openExternal' -SimpleMatch` over `*.js,*.cjs` | 5: `dsh-client-ui-chat/lib/client.js:3451,3664,15498` (the `openExternalLink` symbol) and 2 minified false positives in `dsh-web-frontend/dist/assets/index-BgUyXZcc.js:168,175` |
| `shell.openExternal` lives only in the Electron app | `app-asar-root/lib/main.js` | `:13085,18124,20139,20205,20400` — all `shell.openExternal`; none in `@deepseek-ai/*` packages |
| No preload open member | `app-asar-root/lib/*.cjs` grep `openExternal\|openUrl\|openURL\|externalLink` | 0 matches |
| No `open-in-app`/`openExternal` Cordis service | runtime tree grep `super(ctx, "open` and `openInApp` | 0 service constructors; `openInApp` appears only in the client package's menu ids |
| No `dsh-apiproxy` package | `Select-String 'apiproxy' evidence/stage-7a/host-package-inventory.txt` | 0 rows (README reference is stale for 0.2.2-rc.1) |
| Action cards not in the composed bundles | grep `action-cards` in `dsh-base/cordis.patch.yml`, `dsh-web-app/cordis.patch.yml`, `dsh-experimental-agent-team-profile/cordis.patch.yml` | 0 rows; only `dsh-personalized-recommendations/cordis.patch.yml:2-5` |
| Approval service has no Remote surface | grep `Remote` in `dsh-user-approval/lib/**` | 0 matches |

## 6. Security constraints recorded (Read)

1. The Electron external open is gated by protocol only: `http:`/`https:` (`main.js:20139,20205`); the
   account view also refuses URLs with credentials (`:13085`). There is no caller identity, no
   allowlist beyond protocol, and no result to the initiating code.
2. `openTab('browser')` validation is stricter than the Electron one (16 KiB cap, no credentials,
   http(s) only, no application origin) but opens in-app and returns nothing.
3. `open-in-app` routes are behind the connection Host/Origin + authentication fence, fixed catalog,
   absolute existing directory, JSON + 64 KiB cap (`host-open-in-app/lib/index.js:1142-1149,1329-1389`).
4. `openWorkspacePath` verifies the path through the composed filesystem and the host mapping
   (`dsh-api-session-controller/lib/index.js:4011-4030`).
5. A card frame cannot initiate any of these: `sandbox="allow-scripts"` (no popups/top navigation)
   and `FRAME_CSP` `default-src 'none'` with `script-src 'unsafe-inline' 'unsafe-eval' …`
   (`src/window-doc.ts:20`, `src/shell.ts:34-38`). The shipped build refuses `@OpenUrl` at dispatch
   (`src/client/openui-actions.ts:55-57`, `UNSUPPORTED_STEPS = {'OpenUrl','ToAssistant'}`) and the
   skill text tells the model not to use it (`src/backends/openui/signatures.ts:1020-1023`).

---

# What the host must change, if anything

## For the confirmation surface

The design's stated need has two halves. They resolve differently:

1. **"A host-rendered confirmation the model-generated card cannot draw or fake."**
   **Nothing must change.** 0.2.2-rc.1 already provides it, plugin-callable, in-turn, audited:
   declare an `ask` from `tools/pre-execute`, or call `ctx.userQuestions.ask()` from the tool body.
   The approval panel is host chrome outside the card iframe and its answer is a resolved host
   waterfall plus an `approval/asked`/`approval/decided` audit pair.
   Two deployment conditions must hold: approval policy `ask` (this session is on `never` because the
   sandbox is danger-full-access — a user-selectable preset, not a host gap), and the browser client
   `dsh-client-ui-approval` composed (it is, `dsh-web-app:325-326`).

2. **"The message's exact bytes are shown by the HOST."**
   **This is the missing piece.** No 0.2.2-rc.1 API takes a durable message reference and displays
   host-read bytes at decision time:
   - `approval.request` accepts `toolName`, `reason`, `displayReason`, `callId` only; no payload and
     no message id (`dsh-user-approval/lib/index.js:156-162`; README:166).
   - The only host-read detail slot, `conversation.approval.detail`, receives only `callId` and the
     shipped occupant renders only `args.command` (`dsh-client-ui-chat/lib/client.js:151-172`).
   - `userQuestions` renders caller-supplied `question`/`detail` text; it has no message reference.
   So today a plugin can show the exact bytes only by passing them *as text* into `reason` /
   `displayReason` / `question.detail`; the host faithfully renders that text as text (no HTML
   injection), but the host is not the one asserting that the text is the message. A change is
   required only if the design demands that the host, not the caller, supply the displayed bytes:
   e.g. an approval-request field naming a session event/seq + a host-rendered detail region for it,
   or a documented rule that the approved bytes are the correlated tool call's own arguments (which
   the host does log) with a detail renderer for non-shell arguments. Neither exists in 0.2.2-rc.1.
   (A plugin could register its own `conversation.approval.detail` occupant — the slot manifest marks
   it a single-occupant slot with `replaceRisk: "shadows-shipped-ui"` —
   `dsh-cordis-client-runner/lib/client.js:2683-2720`; that is plugin UI reading host state, not a
   host guarantee, and it is not exercised here.)

## For `@OpenUrl`

**The host must add a plugin-callable external open with a distinguishable result.** None of the
0.2.2-rc.1 surfaces qualify:

| Candidate | Why it is not `@OpenUrl` |
| --- | --- |
| `shell.openExternal` in the Electron main | Renderer policy on `window.open`/cross-origin navigation; no plugin API, no allowlist-of-caller, no result; the preload exposes no open member. Reaching it means Option A (card code calling `window.open`), forbidden by ADR-004/ADR-014 §4. |
| `ctx.sidebarRight.openTab('browser', {params:{url}})` | In-app iframe tab, `void` result, unobservable failures; not a browsing context. |
| `POST /open-in-app/open` | Directory-only, fixed catalog, not a Cordis API, no URL. |
| `session.openWorkspacePath` | Verified workspace path opened by the OS association; no URL, no caller-visible refusal taxonomy beyond throw. |

The requirement stays as ADR-014 §10.4 recorded it (host performs the open; URL policy host-owned and
reusing `parseBrowserAddress`; success/refusal/failure separable; no plugin access to browsing
contexts). The 0.2.2-rc.1 source adds no new candidate.

---

# Caveats and limits of this page

- Nothing here was executed in the host or a browser; no behaviour is claimed as verified. All
  claims are Read/Type/Ran as tagged.
- The 29 originally extracted `@deepseek-ai` packages had no `.d.ts`; every Type row is either a
  0.2.2-rc.1 `typert.host.js` declaration string or a **0.2.1-rc.5** devDependency `.d.ts`, marked.
- The desktop profile composes `dsh-base` + `dsh-web-app` (+ four others); composition claims come
  from those bundles' `cordis.patch.yml` and `~/.dsh/profiles/desktop/package.json`, not from the
  presence of a package in the runtime `node_modules` (all 331 packages are present there).
- This session is on the `never` approval policy, so the approval panel cannot be exercised here
  without a preset change; that is recorded as a deployment condition, not a capability verdict.
- The asar root extraction added files under `tmp/dsh-host-0.2.2-rc.1/app-asar-root/`; no product
  file was modified by this investigation.