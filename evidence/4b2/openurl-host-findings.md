# @OpenUrl — host navigation capability, re-tested against real source

- **Task:** shared task-1, stage 4B-2. Supersedes ADR-014 §2's "no host-mediated
  open exists".
- **Date:** 2026-11-05
- **Host:** DSH 0.2.1-rc.5, Electron desktop app, profile `desktop`
  (`C:\Users\86139\.dsh\profiles\desktop`, confirmed from the live process
  command line: `dsh-desktop-host/lib/index.js … dsh C:\Users\86139\.dsh\profiles\desktop`).
- **Sources read:** asar-extracted packages under `tmp/dsh-host-src/`
  (extraction helper `tmp/asar-extract-pkgs.mjs`), the Electron `lib/main.js`
  and `lib/preload-app.cjs` extracted with `tmp/asar-tool.mjs`, and the live
  profile YAML.

## Verdict

**EXTENDABLE — the capability exists and is documented for client plugins, but
it is not a browser-window open.** It is a *right-sidebar tab* open, and the
match to `@OpenUrl`'s declared meaning is a product decision, not a technical
blocker. See §6.

ADR-014's central claim — "@OpenUrl is Deferred because no host-mediated open
exists" — is **no longer true as written**. A host-mediated, host-validated
URL-open path is exposed to client plugins and this plugin's client bundle can
reach it. What ADR-014 could not have known is that the mediated open is a
sidebar tab rather than a new browsing context, and that is the only remaining
question.

---

## 1. The API: `ctx.sidebarRight.openTab('browser', { params: { url } })`

It is documented **for client plugins**, in the shipped package's own README:

> "Client plugins can open a tab through
> `ctx.sidebarRight.openTab('browser', { params: { url } })`. The optional URL
> passes the same validation as address-bar input before navigation."
> — `dsh-client-ui-sidebar-browser/README.md:43`

The service is provided on the Cordis context, so it is reachable by ordinary
service resolution from any client plugin's `apply(ctx)`:

- `dsh-client-ui-sidebar-right/lib/client.js:4965` —
  `ctx.reflect.provide("sidebarRightTabs", tabs)`
- `dsh-client-ui-sidebar-right/lib/client.js:4966` —
  `ctx.reflect.provide("sidebarRight", controller)`

`ctx.reflect.provide` is the documented service-registration primitive
(`@deepseek-ai/cordis` `lib/types/reflect.d.ts:29-43`: "Register a service
implementation owned by the current fiber … visible to dependents in the same
isolation scope"). This is the same mechanism the host's own packages use.

Call chain:

| Step | Location | What it does |
| --- | --- | --- |
| `openTab(kind, options)` | `sidebar-right/lib/client.js:2243-2246` | `this.require()` then `this.placeTab(sessionId, actions, kind, options)` |
| `placeTab` | `sidebar-right/lib/client.js:2298-2307` | looks the kind up in the tab-type registry; **throws** if absent; composes a `contentId`; dispatches to `place` |
| `place` | `sidebar-right/lib/client.js:2309-2339` | `actions.openContent(...)` then `this.tabDomain.navigate(sessionId, tabId, { address, params })` — `params` reach the body as `navigation.params` |
| `openContent` | `sidebar-right/lib/client.js:1115-1161` | plans the tab into the layout and **expands the panel** (`planSetExpanded(state, true)`, line 1118) |
| body reads `params.url` | `sidebar-browser/lib/client.js:141`, `:148`, `:156` | `tab.navigation.params?.url` becomes `initialUrl` |
| `start` → `loadUrl` | `sidebar-browser/lib/client.js:617` → `:484-488` → `:498-508` | validates then `page.frame.loadUrl(parsed.target)` |

**The host's own "open a URL" gesture uses exactly this call.**
`dsh-client-ui-chat/lib/client.js:13284-13287`:

```js
openExternalLink: (url) => {
  if (linkOpening.getSnapshot() === "sidebar" && ctx.get("sidebarRightTabs")?.get("browser") !== void 0) ctx.sidebarRight.openTab("browser", { params: { url } });
  else window.open(url, "_blank", "noopener,noreferrer");
},
```

with `linkOpening` defaulting to `"sidebar"`
(`DEFAULT_LINK_OPENING = "sidebar"` at `dsh-client-ui-chat/lib/client.js:12685`,
schema default at `:12689`, live store at `:13152`). So on this deployment the
built-in transcript links already open here, and `window.open` is the *fallback*
the host itself uses only when the sidebar carrier is absent.

## 2. The URL policy is already ADR-014's allowlist — and stricter

`parseBrowserAddress` at `dsh-client-ui-sidebar-browser/lib/client.js:363-407`:

| Check | Line | Behaviour | ADR-014 §5 requirement |
| --- | --- | --- | --- |
| empty | 365-368 | refused, reason `empty` | (implied) |
| length > 16384 | 369-372 | refused **before parsing**, reason `invalid` | "Length cap before parsing" — **satisfied** |
| `new URL` parse | 375-382 | unparsable → refused, `invalid` | "Same grammar as Link: parse with `new URL`" — **satisfied** |
| credentials | 383-386 | `username`/`password` present → refused, `credentials` | not asked for; **stricter** |
| scheme allowlist | 387, 403-406 | only `http:`/`https:`; everything else → `protocol` | "admit only absolute http:/https:" — **satisfied** |
| application origin | 388-393 | the DSH GUI's own origin is **refused**, `application-origin` | not asked for; **stricter** (blocks a card navigating the host's own app view) |

The refusal reasons are localized user-facing strings, not silent no-ops:
`dsh-client-ui-sidebar-browser/lib/client.js:1473-1480` (`error.empty`,
`error.invalid`, `error.protocol`, `error.credentials`,
`error.application-origin`). That satisfies ADR-014's "A refused URL is visible
text with a reason, not a silent no-op."

**Important subtlety for the plugin:** the host applies this policy on *its*
side, inside the browser tab's own controller (`loadUrl`, line 498-508). A plugin
cannot pre-empt or bypass it, but neither can it obtain a structured refusal
synchronously — `openTab` returns `void`. A refused URL therefore surfaces as
the tab's own visible error, not as an exception the card can catch. That is a
different failure-reporting shape than ADR-014's "the action reports failure",
and it needs a decision (§6, requirement R3).

## 3. What is NOT a URL opener (the "related but wrong" APIs)

Three host mechanisms look like the answer and are not. Distinguishing them is
the point of ADR-4B's three-state table.

### 3.1 `dsh-host-open-in-app` — launches an *application on a directory*

Routes `GET /open-in-app/apps`, `GET /open-in-app/icon/<id>`,
`POST /open-in-app/open` (`dsh-host-open-in-app/lib/index.js:1126`, `:1129`,
`:1132`, registered at `:1271`, `:1283`, `:1320`).

The open route's body is `{ app, path }` (`parseOpenBody`,
`lib/index.js:1205-1218`) where `path` must be **an existing absolute
directory** (`:1370-1389`), and `app` must be a catalog id from the compile-time
table (`lib/types/catalog.js:72-237` — finder, explorer, cursor, vscode, …).
It then runs `openNativePath(path, …)` on that directory
(`lib/index.js:905-924` → `dsh-native-command/lib/index.js:219-221`).

**No URL is accepted anywhere on this path.** Passing `https://example.com`
as `path` is rejected as "path must be an absolute directory path" and then as
"directory does not exist". This is a **file/directory opener, not a URL
opener** — the closest thing to `shell.openExternal` in the host, and it is
narrowed to directories.

The module comment states the trust fence (quoted as the task asked):
> "Security has one home, here. Every route asks the composition's `connection`
> service for a rejection first (`requestRejection`): its Host/Origin fence
> defeats DNS rebinding and cross-site calls, and its browser authentication
> (the login-token cookie) gates every caller before any resolution result,
> icon, or launch is reachable. On top of that fence the open route validates
> its body at the wire: an `application/json` media type, a 64 KiB ceiling,
> string `app`/`path` fields, a resolved-available catalog id, and an absolute
> path naming an existing directory."
> — `dsh-host-open-in-app/lib/index.js:1142-1149`

### 3.2 `sessionController.openWorkspacePath` — opens a *file* on the desktop

`dsh-api-session-controller/lib/types/index.js:417-435`, reached from the browser
through the Typert Remote as `remote.session.openWorkspacePath(request)`
(declared `@Remote('openWorkspacePath')` at `lib/types/index.js:153`; consumed by
`dsh-client-ui-open-in-app/lib/client.js:449` and by the deliverables routes
`dsh-client-ui-deliverables/lib/index.js:135`).

It ultimately calls `openNativeAssociatedPath` (`dsh-native-command/lib/index.js:229-231`)
— again an OS file-association open, and it is gated by
`verifyDesktopPath` (`dsh-api-session-controller/lib/types/index.js:458-470`),
which requires "a verified Host path" via the composed filesystem. **A URL is
not a path and fails that verification.** So this is also not a URL opener.

### 3.3 Electron: `shell.openExternal` IS reachable — but only by renderer policy, not by plugin code

This is the strongest "capability exists but the plugin cannot invoke it" case:

- `lib/main.js:11970-11973` — the main window's window-open handler:
  ```js
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (["http:", "https:"].includes(new URL(url).protocol)) shell.openExternal(url);
    return { action: "deny" };
  });
  ```
- `lib/main.js:12032-12039` — `will-navigate`: a cross-origin http(s)
  navigation is prevented **and** handed to `shell.openExternal`.
- `lib/main.js:6851-6855`, `:11970` are guarded by scheme checks;
  `:8692`, `:10196`, `:11613` deny outright.

So an OS-level open genuinely happens in this app when the renderer calls
`window.open(...)` (or navigates cross-origin). **That is the forbidden path
under ADR-004/ADR-014 Option A, and it is why the plugin must not use it:**
the *card* would be creating the browsing context. It is a renderer policy the
plugin cannot call directly — there is no `dshDesktop.openExternal` in the
preload surface:

- `lib/preload-app.cjs` exposes exactly seven world members
  (`grep exposeInMainWorld`: lines 845, 861, 862, 863, 867, 876, 877):
  `dshOnboarding`, `__DSH_DIRECTORY_PICKER__`, `__DSH_HOST_PATHS__`,
  `dshDesktopBoot`, `dshPlatform` (`open`/`setBounds`/`close` — a *platform
  account page*, not a URL opener), `dshDesktop` (the product API,
  `createProductApi` at `:789-843`: `browser`, `deviceInfo`, `keyboard`,
  `shortcuts`, `updates`), and `__DSH_LOCALE__`. **No open-URL member.**
  `grep openExternal|openUrl|openURL|externalLink` over the whole preload:
  **0 matches.**
- `dshDesktop.browser` is not an opener either: `createDesktopBrowserBridge`
  (`:757-785`) only `acquire`s/`release`s a **webview guest lease** and
  subscribes to *incoming* open requests from inside the guest. It is the
  Desktop carrier for a sidebar browser tab, not a way to open a URL.
- `window.__DSH_BOOT__` is a **boot manifest**, not an IPC bridge: it is parsed
  as `{ rev, release, entries, batches }` and validated for plugin module URLs
  (`dsh-client-modules/lib/client.js:101-176`).

**This is the "available but unauthorised" row, not the "available and
authorised" row.** Nothing enforces it but policy — which is exactly why the
plugin must not go near it.

## 4. Gesture: nothing in the openTab path checks one (finding (d))

`grep` for `userActivation`, `isTrusted`, `requiresGesture` in both
`dsh-client-ui-sidebar-right/lib/client.js` and
`dsh-client-ui-sidebar-browser/lib/client.js`: **0 matches in either.**

Consequences, stated plainly:

1. `ctx.sidebarRight.openTab('browser', { params: { url } })` will work when
   called from a React `useEffect` on mount — **it is not a popup-blockable
   browser API**, because it is a layout/state mutation inside the app, not a
   `window.open`. There is no popup blocker to lose to (which also removes
   ADR-014's "fails silently under a popup blocker" objection against
   *this* path).
2. Therefore **the gesture requirement is entirely the plugin's to enforce.**
   ADR-4B T1 ("authority by syntax") is not mitigated by the host here. The
   dispatcher's "runs only from an event handler" rule is the *only* thing
   standing between a program and a navigation. That is a load-bearing
   constraint that must be implemented and tested, not assumed.

## 5. Deployment: is the browser tab registered here? (finding (a))

**Yes — confirmed two ways.**

**(i) Static — the shipped bundle patch.**
`@deepseek-ai/dsh-web-app/cordis.patch.yml` (extracted to
`tmp/4b2-web-app.cordis.patch.yml`), lines 296-298:

```yaml
- id: ui-sidebar-browser
  name: '@deepseek-ai/dsh-client-ui-sidebar-browser'
  disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"
```

with the comment at line 295: "Web profiles opt in; Desktop retains sandboxed
HTTP(S) Browser tabs." `profileContext.name` is the profile name
(`dsh/lib/profile-boot-C14i-8IN.js:290-291`: `const profileContext = { name:
options.profile, … }`, provided at `:304`). The live host process runs
`… dsh C:\Users\86139\.dsh\profiles\desktop` and `dsh-desktop-host` passes
`profile: "desktop"` (`dsh-desktop-host/lib/index.js:228-230`). **So the
expression is `'desktop' !== 'desktop'` = `false` = enabled.**

**(ii) Runtime — measured, not read.** `evidence/4b2/openurl-probe.mjs`
(exit 0, log `evidence/4b2/openurl-probe.log`) distinguishes a registered route
(401 from the Connection fence) from an unregistered one (404) on the live
origin:

```
PASS  401   /open-in-app/apps            expect=registered got=registered
PASS  401   /open-in-app/open            expect=registered got=registered
PASS  401   /api/present.host            expect=registered got=registered
PASS  404   /open-in-app/no-such-route   expect=absent     got=absent
PASS  404   /definitely-not-a-route-4b2  expect=absent     got=absent
RESULT: all cases classified as expected
```

**What a plugin sees if it is NOT registered:** `placeTab`
(`sidebar-right/lib/client.js:2298-2300`) throws
`sidebarRight: no tab type is registered as "browser"`. That is a **catchable
synchronous throw with a stable message** — a real, reportable failure, not a
no-op. `dsh-client-ui-chat` guards against it by feature-detecting
`ctx.get('sidebarRightTabs')?.get('browser') !== void 0` before calling
(`:13285`), which is the pattern this plugin should copy.

## 6. The product question: a sidebar tab is not a new browsing context (finding (b))

**This is the one finding that can still make the action Deferred, and it is a
product decision, not an engineering one.**

What `openTab('browser', …)` actually does, user-visibly:

| Aspect | `@OpenUrl` as declared / ADR-014 §7 | `openTab('browser', …)` as shipped |
| --- | --- | --- |
| Where the page appears | "opens exactly one new context … verified by counting tab targets before and after" (ADR-014 §7.2) | The right-sidebar dock, **inside the DSH window** |
| New browser window/tab | yes | **no** — `document` count and browser tab count are unchanged |
| Host document URL | must be unchanged (ADR-014 §7.5) | unchanged — **satisfied** |
| Leaves the app | yes | no |
| Survives card unmount / session switch | n/a | The tab is layout state; `keepMounted` retains it (`sidebar-browser/README.md:71`) |
| Site that refuses iframes / needs downloads | works (real browser) | **may fail silently-ish**: "Browsers conceal many iframe failures … DNS, TLS, mixed-content, CSP, and `X-Frame-Options` failures may emit `load` or no actionable event instead of `error`" (`sidebar-browser/README.md:107`) |
| Mixed content | n/a | "An HTTPS application can also block public HTTP pages as mixed content" (`:104`) |

**Honest judgement.** If `@OpenUrl`'s contract is "the user's browser shows this
page", the sidebar tab **is not** that, and shipping it under that name would be
ADR-014 §4-Option-B's error in a new costume: a differently-named way to do
something the product already does. If the contract is "the card can cause this
page to be shown to the user, mediated by the host, under the ADR-004 policy",
it **is** that, and it is a *better* fit than `window.open` on every axis the
threat model cares about (T3/T4/T10/T11 are all enforced by the host's parser;
T1 is the plugin's remaining job).

The decisive asymmetry: **there is no popup-blocker failure mode here, and there
is a hard `X-Frame-Options`/mixed-content failure mode there instead.** A card
that says "open this docs page" will work for most sites and fail for a real
minority — and per the README it may fail without an actionable event, which is
precisely the "silent failure" ADR-014 was written to prevent.

**Recommendation: keep the action Deferred, and rewrite ADR-014 §3/§5 with this
finding.** Not because no API exists — that claim is now false and must be
corrected — but because the only existing mediated open changes the capability's
user-visible meaning (§6 table) and its failure mode (unobservable iframe
refusal). Option C is *partially* available: a host-mediated open exists, but it
is a sidebar open. The honest options for a future ADR are:

- **C1:** accept the sidebar semantics, rename or re-specify the action
  accordingly (e.g. "show this page beside the conversation"), implement against
  `openTab`, and add a plugin-side gesture check + a visible "could not be
  shown" state for the cases the host cannot report.
- **C2:** request upstream a true external open (an `openExternal`-shaped
  plugin API). That is a small upstream addition — the Electron side already
  does `shell.openExternal` for `window.open` (`lib/main.js:11970-11973`) — but
  it does not exist today and must not be simulated.

## 7. Reachability when no right-sidebar surface is mounted (finding (c))

`openTab` calls `this.require()` first (`sidebar-right/lib/client.js:2244`),
which throws `sidebarRight: no session surface is mounted` when
`this.mounted.getSnapshot()` is `undefined` or the session has no adopted store
(`:2594-2602`).

`mounted` is driven from the layout selection, not from whether the user has
ever opened the right column:

- `sidebar-right/lib/client.js:4951-4964` — an effect subscribes to the view
  selection and `layout.panelInfo`, and calls
  `show(panelInfo.activePanelId === null ? selected?.sessionId : undefined)`.
- `show` simply sets the on-screen store (`:2149-2151`).
- The adopted store per session is minted when the `rightbar.session` slot
  renders for that session (`:5042-5077` declares `store`, `scope: "session"`,
  and the slot framework creates the per-session store instance, which
  `adopt()` registers at `:4992`). The `rightbar` slot is rendered
  **unconditionally** by the app frame:
  `dsh-client-ui-layout/lib/client.js:339` passes `renderSlot("rightbar", {…})`
  as a plain child, and `RightbarColumn` itself
  (`dsh-client-ui-layout/lib/client.js:126-132`) is an unconditional `<div>` —
  neither is gated on `rightbarShown`. The panel's CSS only translates it
  off-frame (`transform: translateX(var(--dsh-sidebar-width)); visibility:
  hidden`, `SidebarRight.module.css` as inlined at
  `sidebar-right/lib/client.js:1258`); it never unmounts. So the seat exists
  before the user ever opens the column.

**Consequences, stated as bounds rather than as a promise:**

1. A card in a **visible conversation** (a normal `tool.call.toolview` card or a
   turn-tail card) is inside the session-scope subtree, so the `rightbar.session`
   slot for that session exists and its store is adopted. The call is expected to
   work. **This is a source-level inference, not a measured browser fact** — it
   needs a G3 render gate on the real GUI before it can be called verified.
2. A card rendered while a **global panel** replaces the conversation
   (`panelInfo.activePanelId !== null`) makes `mounted` `undefined` → the call
   throws. This is a live failure mode that must be handled, not discovered.
3. Because the failure is a **synchronous throw**, the plugin can catch it and
   report a real failure. That satisfies ADR-014's "No simulated success"
   requirement for *this* class of failure.

Note the contrast with (`dsh-client-ui-chat`, `:13285`), which calls
`ctx.sidebarRight.openTab` **without** a try/catch: the host itself accepts a
throw here. A plugin action with a user-visible control cannot.

## 8. Answers to the ADR-014 §5 requirement table

| Requirement | State against the real host |
| --- | --- |
| **Host mediates the open** | **Met.** The host validates and performs the navigation; the card only names a URL. No `window.open`, no `location`, no synthetic click needed. |
| **Same grammar as `Link`** | **Met, and stricter** — `parseBrowserAddress` (`:363-407`). |
| **Destination visible before the press** | **Met by the plugin**, not the host: the control must render the host (the built-in `Link`'s `safeHref` already renders the destination). |
| **Length cap before parsing** | **Met by the host** (16384, `:369-372`). |
| **Gesture required** | **NOT met by the host** — nothing checks `userActivation` (§4). Purely the plugin's job. |
| **No simulated success** | **Partially.** Unregistered-kind and no-surface cases throw and are catchable. A URL the parser refuses, and an iframe-refused page, are reported **inside the tab**, asynchronously, not to the caller. |
| **Generic failures** | Plugin-side. |
| **Withdrawable** | Unchanged — `UNSUPPORTED_STEPS` stays. |

## 9. Three-state classification (ADR-4B §2), corrected

| Mechanism | State | Why |
| --- | --- | --- |
| `ctx.sidebarRight.openTab('browser', {params:{url}})` | **Available and authorised** | Documented for client plugins; host-parsed allowlist; host performs the navigation. Not a new browsing context (§6). |
| `window.open` / `location.assign` / synthetic anchor | **Available but unauthorised** | Reaches `shell.openExternal` via `lib/main.js:11970-11973`; forbidden by ADR-004/ADR-014 Option A. Only policy stops it. |
| `shell.openExternal` as a plugin API | **Not available** | No `contextBridge` member (`preload-app.cjs:845-880`); no host service exposes it. |
| `/open-in-app/open` | **Not available for a URL** | Takes `{app, path}`, path must be an existing directory. |
| `openWorkspacePath` | **Not available for a URL** | OS file-association open behind `verifyDesktopPath`. |

## 10. Reproduction

```powershell
node evidence/4b2/openurl-probe.mjs        # exit 0 = routes classified as expected
```

Source extraction used (all read-only, asar never modified):

```powershell
node tmp/asar-extract-pkgs.mjs "C:\Users\86139\AppData\Local\Programs\DeepSeek Harness\resources\app.asar" tmp/dsh-host-src dsh-client-ui-deliverables dsh-desktop-host dsh-host-frontend-static dsh-web-app dsh-api-workspace-files dsh-host-directory-picker dsh-client-ui-directory-picker-native dsh-client-ui-sidebar-files dsh-client-ui-sidebar-documentpreview dsh-api-gateway dsh-typert-loader dsh-api-remotes dsh-api-remote-access dsh-tool-present dsh-client-ui-sidebar-browser dsh-client-ui-sidebar-right dsh-client-ui-layout dsh-client-locale dsh-app-boot
node tmp/asar-tool.mjs save "<app.asar>" "/lib/main.js" tmp/4b2-electron-main.js
node tmp/asar-tool.mjs save "<app.asar>" "/lib/preload-app.cjs" tmp/4b2-preload-app.cjs
node tmp/asar-tool.mjs save "<app.asar>" "/dsh/node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml" tmp/4b2-web-app.cordis.patch.yml
```

## 11. What is still unverified

1. **The mounted-surface inference (§7.1).** Needs a live GUI run: does a card in
   a visible conversation successfully call `openTab`? G0/G3 gate first per
   AGENTS.md §10.
2. **The iframe-refusal failure mode.** §6 cites the package's own README; it has
   not been reproduced on a hostile site here.
3. **Cell-level facts of the live profile.** The bundle patch is read from the
   asar, and the profile's own patch
   (`C:\Users\86139\.dsh\profiles\desktop\cordis.patch.yml`) does not touch
   `ui-sidebar-browser` — verified by reading that file, 124 lines, no such id.
