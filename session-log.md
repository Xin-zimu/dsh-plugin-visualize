# Session Log

Current working state. The last session overwrites the top block and appends
to the history. If you are an agent starting work, read this first.

---

## 1. Current version

| Field | Value |
| --- | --- |
| Package | `@dsh-unified/visualize` |
| Version | `0.1.1` — **released 2026-11-06**, tag `v0.1.1` at `50b6b54` |
| Branch | `main` |
| HEAD | see `git log -1` |
| Upstream baseline | dsh-visualize `cf6b3a3`, dsh-intelligent-ui `0b08749`, open-intelligent-ui `16ef264` |
| **Installed DSH host** | **0.2.2-rc.1** (`@deepseek-ai/dsh-desktop`; asar header; 331 `@deepseek-ai` entries, 321 `dsh-*` at 0.2.2-rc.1) |
| **Plugin compile baseline** | 0.2.1-rc.5 (`node_modules/@deepseek-ai/*` devDeps) — a recorded skew, see §6 |

## 2. Current stage

| Field | Value |
| --- | --- |
| Stage | **7A CLOSED 2026-11-07** — host capability investigation + `@ToAssistant` ADR, investigation only. **7B not started**, blocked on the owner's ADR-016 decision and an upstream change. |
| Goal | Restore the two deferred external actions honestly: `@ToAssistant` first, then `@OpenUrl`. |
| Status | **`@ToAssistant` needs exactly one host change** (host-validated message attribution); submission, role enforcement and a host-rendered, card-unforgeable confirmation already exist in 0.2.2-rc.1. **`@OpenUrl` is unchanged**: still no plugin-callable external open. Deliverables: `docs/reports/STAGE-7A-HOST-CAPABILITIES.md`, `docs/decisions/ADR-016-TO-ASSISTANT-STAGE-7A.md`, `evidence/stage-7a/`. **No product code was changed; the action stays refused.** Earlier stages: 6 closed (946/946 CI), v0.1.1 released 2026-11-06, 4B-2 closed 2026-11-06. |

## 2a. Published, and what publishing cost

The repo is public at https://github.com/Xin-zimu/dsh-plugin-visualize.

Getting there required rewriting history, because 8 of the 9 commits contained
the owner's Windows username and the working tree carried 22 full-window
screenshots. **Verified before the rewrite:** no credential, token, cookie or
API key was ever present — that scan came back clean, and it is the only reason
this was a privacy job rather than an incident.

Removed, from every commit, not merely from `HEAD`:

- 22 PNGs under `evidence/**/` — each was a **full-viewport** capture, so they
  carried conversation text, the model's reasoning, the sidebar's project list
  (12 unrelated private projects) and the account display name. Not redactable
  in place; the fix is the deletion.
- `upstream/open-intelligent-ui/docs/openui-chatgpt-comparison.{mp4,jpg}` — a
  third-party-marked asset that Thesys's MIT grant cannot convey, and one the
  plugin never used. Also removed 17 MB from a 21 MB payload.

Redacted in place, every commit: `C:/Users/<user> → `C:/Users/<user> the
absolute repo path → `D:/work/dsh-plugin-visualize`. No file under `src/` or
`tests/` contained either literal, so nothing functional changed.

Licence defects found by audit and fixed: there was **no root `LICENSE`** while
`package.json` claimed BSD-3-Clause (GitHub would have shown the repo as
unlicensed); `NOTICE` asserted that it reproduced the upstream licence texts but
reproduced none of them and named no copyright holder for the two MIT
upstreams; `package.json` `files[]` listed a `LICENSE` that did not exist and
shipped `dsh-intelligent-ui`-derived code with no MIT text; `MIGRATION_MATRIX`
credited `open-intelligent-ui` with porting `functions.ts`, which a
implementation-level comparison shows came from `dsh-intelligent-ui`;
`PROVENANCE.md` claimed the `upstream/*/.git` directories were kept, and they
are not.

**Evidence removed is not evidence lost:** what remains under `evidence/` is the
assertion data — manifests, JSON measurements, probe scripts, test transcripts,
the two `.log` files. Those are what the claims in this file rest on. The
screenshots were illustration, and their removal is recorded here rather than
papered over.

Rehearsed on a throwaway clone before touching the real tree; the bundle is at
`../dsh-plugin-visualize-BACKUP-20261104-010334.bundle`.

### 2a.1 One mistake, and one residual risk

The first publish was too hasty: I saved the vitest transcript to
`evidence/publish/test-before-publish.txt` **after** the pre-push scan had run,
and the 15 known Windows failures print absolute temp paths in their stack
traces. So a file containing the username went out in the first push. The
post-push scan caught it within minutes; the history was rewritten again and
force-pushed, and the in-repo tool `evidence/lib/redact.mjs` now exists so the
next transcript is cleaned before it is committed rather than after.

Three lessons worth keeping:

- **Scan after the last write, not before the first push.** A scan is only
  valid for the tree that existed when it ran.
- **A redaction tool must not hard-code what it removes.** Two of the rewrite
  rounds failed because `redact.mjs` contained the Windows account name as a
  literal; the out-of-tree filter carries the literals, the in-repo tool reads
  them from `REDACT_USER` / `REDACT_EMAIL`.
- **`git filter-branch` swallows a filter that crashes.** It reported success
  while a `EPERM` on the worktree `.git` gitlink aborted the script mid-run.
  Verify the result, never the exit status.

**Residual risk, stated plainly:** three pre-rewrite commits (`6b0c445`,
`d10e927`, `58ab17a`) are no longer on any branch but are **still fetchable by
SHA** from the GitHub API, and `58ab17a` still serves the transcript containing
the username. Purging them requires deleting and re-creating the repository,
which needs the `delete_repo` OAuth scope. The token in this session does not
have it and approval prompts are disabled, so it could not be done here. The
exposure is a Windows account name, not a credential; if that is unacceptable,
run `gh auth refresh -h github.com -s delete_repo` and re-create the repo.

## 3. Current progress

**Discussed** — `PLAN.md`, `STAGE.md`, `docs/decisions/`.

- Unified host + dual backends (ADR-001); one tool, backend by argument
  (ADR-002); versioned envelope (ADR-003); per-backend security (ADR-004);
  five-layer documentation (ADR-005).
- **ADR-006 (accepted)** — OpenUI `$state` persists through the existing
  `cardStates` store, with a per-backend record shape and a `:openui` key
  suffix. `docs/decisions/ADR-006-OPENUI-STATE-PERSISTENCE.md`.
- **ADR-007 (accepted)** — stage 3's third exit criterion ("at least the Inputs
  group renders") was met at 2 of 13. The PASS verdict stands; the criterion is
  formally **narrowed** to "one Inputs component renders and binds `$state`",
  and the eleven missing components move to 4A-3 rather than being dropped.
  `docs/decisions/ADR-007-STAGE-3-INPUTS-EXIT-CRITERION.md`.

**Implemented** — in the tree, `tsc` clean.

- Host core, registry, dispatcher, both backend adapters, tokenizer + parser.
- `VisualizationDescriptor = VisualizeMeta | OpenUIMeta`, and `OpenUICard`,
  the second renderer (host components, no iframe, no `eval`).
- `tsdown.config.ts` now reads the bundle id from `package.json`.
- Card body and `Col` stretch their children; `Button` keeps its own width.
- **`$state` persistence (ADR-006, P3-02…P3-05).** `src/client/openui-state.ts`
  (record, `:openui` key, `schemaHash` from names+kinds, per-variable hydrate,
  self-repair, write-merge); `OpenUICard` hydrates once per program+key and
  writes through the shared store; `VisualizeCard` and the `intelligent_ui`
  toolview pass a `stateKey`; that toolview now receives a `sessionId` inject.
- **Turn-tail dispatch (P3-06).** `TurnCards` reads every card through
  `visualizationFrom` instead of `visualizeMetaFrom`, and draws it with
  `Frame` or `OpenUICard` by discriminant. Same state key on both surfaces.
- **Button actions (P3-07).** `src/client/openui-actions.ts` (new) dispatches
  `@Set`, `@Reset` and `Action([...])` against the declared variables and
  returns a patch; `@OpenUrl`, `@CopyToClipboard`, `@ToAssistant` are recognised
  and refused. `OpenUICard` hands action descriptors through `drawValue`
  untouched and applies the patch through the same `WriteChannel` a Slider uses.
- **4A-1 layout primitives (P4A1-01…05).** `Box`, `Grid`, `Divider` and `Spacer`
  added to `COMPONENTS`; helpers `length`, `radiusOf`, `borderOf` (longhands, not
  the shorthand), `alignOf`, `justifyOf`, `directionOf`, `wrapOf`, `flexOf`,
  `paintOf` (semantic `background` → a 14% tint of its series). `Box` is
  `border-box` and clips to its radius only when a radius is set; `Grid` has
  three track branches and a `min(100%, …)` floor so a wide `minChildWidth`
  cannot overflow a narrow card.
- **A declared-but-undrawn component now says so.** `drawValue` used to return
  `null`, making a renderer gap indistinguishable from an intentionally empty
  container. It now draws a muted `X is not drawn by this build` notice carrying
  `data-openui-unrendered`, sourced from `COMPONENT_NAMES` so the notice cannot
  disagree with the table. A name the language does not declare still renders
  nothing (the host rejects it at validation, VZO002).
- **The renderer's table is exported** (`RENDERED_COMPONENTS`), so coverage is
  measurable instead of being copied.

**Verified** — ran, output in `evidence/`.

- `npx vitest run`: **683 passed / 15 failed / 698 total**; failure set still
  identical to the upstream baseline (15 vs 15, `Compare-Object` empty after
  stripping ANSI).
- `tsc` host + client: clean. `npx tsdown`: builds both halves.
- **In a real browser, in a real DSH session** (`evidence/browser-phase-1/`):
  the plugin loads with an empty console (B01, B11); an OpenUI card drawn by the
  model renders as real components (B03); an HTML card still renders in its
  iframe (B04); `<img onerror>` shows as text with no dialog (B06); the card
  replays after a full reload with no model call (B09).
- **B07 and B08, closed in stage 1.3** (`evidence/browser-phase-1/MANIFEST-1.3.json`):
  every card child sits at `leftOffset: 0` with the Button at its own 88.8px
  width; 7 of 7 bridged CSS variables resolve in both schemes; text measures
  17.45–18.9:1 and the Button 5.61:1 in dark. Both themes were switched through
  the host's own Settings → 通用设置 → 外观 control.
- **Stage 2 — the language core** (`evidence/phase-2/`):
  `npx vitest run` = **576 passed / 15 failed**, failure set byte-identical to the
  upstream baseline. The differential run compares **31 programs across 7 fields
  each and finds 0 differences** against the pinned upstream module. Both
  `tsc` projects are clean; `npx tsdown` builds.
- **In a real browser** (`evidence/browser-phase-2/results.json`): a card shows
  `count 3` and `item 0/1/2` computed by `@Count`/`@Format`/`@Each` (S01); a
  bound Slider is draggable (S02); dragging it 3 → 6 changed a sibling to
  `count 6` and grew the list from 3 rows to 6 (S03).
- **Stage 3 — `$state` persistence** (`evidence/phase-3/`, `evidence/browser-phase-3/`):
  - `npx vitest run` = **602 passed / 15 failed / 617**; the FAIL set is
    byte-identical to the stage-2 baseline (`+26 passed`, `+0 failed`).
  - `tsc` host + client both exit 0; `npx tsdown` builds both halves.
  - **S04 is now PASS, in a real browser, on an isolated profile (`p3web` /
    `:3093`; production `:61582` untouched).** A model-drawn OpenUI card with
    `Slider($count, 1, 10, 1, "count")` was dragged **3 → 6**; a reload restored
    **6** and the text `count 6` — not the default 3. Two further reloads and a
    session reopen left it at 6.
  - The stored record is one entry under `…|…p3-persistence-461c4c27.whale.html:openui`
    with `{"v":1,"h":"18bcb949","values":{"count":6}}`; `h` stayed constant across
    reloads, so a load is not mistaken for a schema change.
  - The key begins with the real session id, which is only possible because the
    `intelligent_ui` toolview now receives `sessionId` (P3-04).
- **P3-06, the display path** (`evidence/browser-phase-3/MANIFEST-P306.json`),
  in a real browser on the same isolated profile, **with no CSS overrides**:
  - a freshly drawn OpenUI card is visible **without expanding the fold**: the
    tail mounted its own copy, splitting surfaces 3 inside folds / 3 outside;
  - dragging the **tail** copy 6 → 8 persisted `{v:1,h:18bcb949,values:{count:8}}`
    and, after a full reload, the tail card still read **`count 8`**;
  - expanding the fold left the split at 2 / 2 — the toolview copy is the call's
    record and the tail keeps exactly one copy, never two;
  - the HTML control card behaved as before (one inside the fold, one in the
    tail), so the HTML path is unchanged.
  - `npx vitest run` = **610 passed / 15 failed / 625** (+8 against P3-05,
    failure set still byte-identical); the language differential re-ran at
    **31/31, 0 differences**.
- **P3-07, the action loop** (`evidence/browser-phase-3/MANIFEST-P307.json`),
  same isolated profile, **no CSS overrides**:
  - clicking `set6` (`@Set($count, 6)`) moved the card from `count 3` to
    `count 6` and left `step` alone;
  - `reset` (`@Reset()`) returned every declared variable to its default;
  - `combo` (`Action([@Set($count, 2), @Set($step, 5)])`) applied both writes in
    one re-evaluation;
  - after a reload, **both** the toolview copy and the tail copy read
    `count 6 step 5`, from the shared record
    `{"v":1,"h":"6ca2203e","values":{"count":6,"step":5}}`;
  - clicking every Button on a fresh page produced **0 console entries**;
  - **T7** (session switching) and **T8** (history replay) are now PASS in the
    browser, closing two cases left NOT VERIFIED after P3-06.
  - `npx vitest run` = **637 passed / 15 failed / 652** (+27); differential
    **31/31, 0 differences**.
- **4A-1 — layout primitives** (`evidence/phase-4a-1/MANIFEST.json`):
  - the model drew one card through the real tool path exercising all four
    components; **2 copies render** — 1 inside the fold, 1 on the turn tail;
  - **0 unresolved CSS variables** in light *and* dark, after fixing two that
    did not resolve (D17, D18);
  - Box fixed width measured **240px**, elastic measured **680px → 367px** as
    the card narrowed; never collapsed, never overflowed;
  - `minChildWidth: 180` grid measured **3 → 2 → 1 columns** at card widths
    680 / 440 / 320, while the explicit 3-column grid held 3 at every width —
    the responsive mechanism, measured rather than inferred from markup;
  - Divider paints **1px** at `rgba(0,0,0,0.1)` light / `rgba(255,255,255,0.12)`
    dark, opacity 1, visibility visible;
  - Spacer took **589px** of a 680px row, leaving its two neighbours **605px
    apart** (8px without it);
  - the empty `Grid` draws as a real grid with 0 children and **no** unrendered
    notice — a legal empty container is distinct from a missing renderer;
  - after a full reload both copies return with **identical** geometry; the
    model was not called again;
  - dark theme was entered through the host's own 外观 control
    (`data-ds-dark-theme` false→true, `color-scheme` light→dark), with **no host
    CSS modified** at any point;
  - `npx vitest run` = 683 / 15 with an identical failure set;
    differential **31/31, 0 differences**.
- **infra-1 — the browser harness** (`evidence/infra-1/MANIFEST.json`): one
  authoritative `evidence/lib/cdp.mjs`, one parameterized `evidence/lib/probe.mjs`
  with four gates, and `evidence/lib/parity.mjs` to keep the helper honest.
  Measured, not asserted:
  - **G0 fails in 0.3 s** on an agent tab still on `about:blank`, with the exact
    reason and exit 2. Before the timeout was added, the same case *hung* and the
    run had to be backgrounded and killed.
  - **G0–G3 pass in 11.6 s** against the live app: 31/31 characters delivered by
    one `fill`, `Enter` submitted, the turn painted.
  - **blocking works**: no smoke stamp → exit 2; a stamp from a different session
    → exit 2; unknown `--what` → exit 3. Exit 2 is never a product failure.
  - **parity exits 0**: every historical copy's exports are covered; the single
    absence is the per-character `type` helper, recorded as a mistake.
  - `card` and `tokens` reuse the existing 4A-1 card and report 0 unresolved
    variables and 0 dangling host tokens in ~0.2 s; `theme --want=dark` drives the
    host's own 外观 control and matches the 4A-1 record, then restores light.
  - **the harness obeys its own output rule.** First drafts printed 3 307 lines
    for `tokens` and 261 for `card` — the very defect this refactor exists to
    remove. Detail now goes to `--out` only: **15** and **26** lines on stdout,
    with the complete tables (470 variables; every box, grid, divider, spacer)
    preserved in the evidence file.
  - `npx vitest run` after the refactor = **683 / 15**, failure set byte-identical
    to the 4A-1 baseline. **No product file was modified**: the newest `src/` and
    `tests/` timestamps are still 01:55–02:01, hours before the 23:2x refactor.

**Not verified** — do not claim these work.

- **A9, cross-generation history replay.** The isolated profile's older session
  cannot be loaded by this host at all: its log carries `job/registered` from a
  newer harness, and `dsh 0.2.0-rc.2` refuses to interpret it. Single-session
  refresh replay passed; multi-generation replay is untested, not failed.
- 36 of 48 components still have no renderer (4A-2…4A-5).
- B05 streaming and B10 session switching remain unverified from phase 1.
- Cross-card, cross-session and corrupt-record behaviour are **unit-tested**;
  session switching is also browser-verified (T7), but cross-card isolation
  and corrupt-record recovery remain unit-only.
- A **pre-fork `dsh-intelligent-ui` card** replaying on the turn tail is
  unit-tested through the reader; no genuine pre-fork card exists to replay.
- **A05, A06 and A09** in the P3-07 matrix are NOT VERIFIED in the browser: an
  invalid binding cannot be expressed in openui-lang, refusing an unsupported
  action would require observing a *missing* side effect, and no HTML card was
  re-driven through a frame. All three are unit-tested.
- The HTML backend's own card state was not re-driven in the browser; it rests
  on its 25 passing unit tests.

**Known, not fixed** — the light Button pair is 4.23:1, below AA for body text.
This is the host's own pairing (its send button and "1017" badge use the same
`#4176e6`/`#fff`), so it is recorded rather than changed unilaterally.

## 4. This session's changes

| File | Change | Why |
| --- | --- | --- |
| `docs/decisions/ADR-006-OPENUI-STATE-PERSISTENCE.md` | new, then **accepted as A′** | Design gate for `$state` persistence; records the audit, the decision and the two fixed details (shared caps, hash from structure) |
| `src/client/openui-state.ts` | **new, 300 lines** | Record type, `:openui` key suffix, `schemaHash` over names+kinds, per-variable `hydrateState`, `buildRecord`, write-merge |
| `src/client/OpenUICard.tsx` | hydrate once per program+key; write through the shared store | Closes S04; no `useEffect` on state alone, so a drag does not reload the card |
| `src/client/VisualizeCard.tsx` | pass `stateKey` to the OpenUI card | The card could not persist anything without an identity |
| `src/client/index.tsx` | `intelligent_ui` toolview gains `inject: sessionInjection(...)` | Approved in ADR-006; without it a replayed program card has no session and persists nothing |
| `tests/openui-state.spec.tsx` | **new, 26 tests** | The 18 planned cases: hash, hydrate, repair, isolation, rapid input, storage failure, shared ledger |
| `tsconfig.json`, `tsconfig.client.json` | new spec listed in both | The host project excludes DOM tests; a spec missing from both lists pulled `card-state.ts` into a DOM-free build |
| `src/client/TurnCards.tsx` | **P3-06** — reads via `visualizationFrom`; draws `Frame` or `OpenUICard` by discriminant | The tail dropped every OpenUI card, so a persisted card was invisible in the conversation |
| `tests/turn-cards.spec.tsx` | +8 tests (26 total) | P3-06: both backends on the tail, no duplication, one state key, session isolation |
| `src/client/openui-actions.ts` | **P3-07, new** — `applyAction` dispatcher | `@Set`/`@Reset`/`Action` against a fixed vocabulary; returns a patch, never writes |
| `src/client/OpenUICard.tsx` | **P3-07** — action descriptors pass through `drawValue`; `WriteChannel` gains `patch`/`runAction`; Button wired | Without the pass-through the action resolved to `null` and every Button was inert |
| `tests/openui-actions.spec.tsx` | **new, 24 tests** | A01–A08 plus the ordering contract and every refusal |
| `tests/frame-state.spec.tsx` | +3 tests (17 total) | Pins the HTML cross-view last-writer-wins hazard, as agreed |
| `AGENTS.md` | new §9 | A browser run must prove which bundle it loaded before code may be called FAIL |
| `evidence/phase-3/` | baseline + tsc + suite + manifests + probes | Every claim below has a file |
| `evidence/browser-phase-3/` | scripts, three manifests, 7 PNGs | P3-05, P3-06 and P3-07 acceptance, on an isolated profile |
| `docs/architecture/SYSTEM_ARCHITECTURE.md` | two-surfaces and one-state-loop sections; gap table | The display and action paths are architecture now, not accidents |
| `docs/decisions/ADR-006…`, `STAGE.md`, `session-log.md` | updated | AGENTS §8 documentation matrix |
| `src/client/OpenUICard.tsx` | **4A-1** — `Box`, `Grid`, `Divider`, `Spacer` renderers + nine argument helpers | Four components the language declared but nothing drew |
| `src/client/OpenUICard.tsx` | **4A-1** — `unrenderedNotice` + `data-openui-unrendered` | A renderer gap used to draw nothing, indistinguishable from an intentionally empty container |
| `src/client/OpenUICard.tsx` | **4A-1** — `RENDERED_COMPONENTS` export; `--font-sans` reads `--dsw-font-family`; `--viz-series-4` declared directly | D17/D18: two bridged tokens the host never published; D19: coverage was copied, not measured |
| `tests/openui-layout-4a1.spec.tsx` | **new, 40 tests** | Nesting, sizing, the three Grid branches, Divider, Spacer, empty-vs-missing, and the three-layer CSS-variable guard |
| `tests/openui-inventory.spec.tsx` | **new, 6 tests** | Coverage read from the renderer's own table (12 / 48); 4A-1 rows drawn, not just listed |
| `tests/openui-card.spec.tsx` | 1 assertion corrected + 2 added | It asserted `--dsh-font-family-text-default`, a token the host does not publish (D18) |
| `tsconfig.json`, `tsconfig.client.json` | both new specs registered | D13 again: a spec in neither list pulls DOM code into the host build |
| `docs/decisions/ADR-007-STAGE-3-INPUTS-EXIT-CRITERION.md` | **new** | Records the stage-3 scope adjustment the owner asked for |
| `docs/reports/PHASE-4A-1-REPORT.md` | **new** | Batch verdict, the three defects, and A9 recorded as not verified |
| `evidence/phase-4a-1/` | probes, manifests, 2 PNGs, baseline | Every 4A-1 claim has a file |
| **all of the above** | **committed as `5d2a3e9`** | Three accepted phases sat uncommitted on top of `9b46cec` for a session. One commit rather than three because stage 3 and 4A-1 both rewrite `OpenUICard.tsx`; a split would produce intermediate commits that fail `tsc` |
| `docs/decisions/ADR-008-LINK-PROTOCOL-POLICY.md` | **new (4A-2)** | `Link` is the first component whose output a reader can activate, in the host origin. A positive allowlist of absolute `http:`/`https:`, parsed with `new URL`, decided before the renderer was written |
| `src/client/OpenUICard.tsx` | **4A-2** — seven renderers: `Label`, `Badge`, `Link`, `List`, `ListItem`, `Quote`, `Code` | The Text group is complete; inventory 12 → 19 of 48 |
| `src/client/OpenUICard.tsx` | **4A-2** — `safeHref`, `markerNode`, `listRow`, `listEntryRow`, `CodeBlock` | The seven share one URL policy, one marker vocabulary and one row builder, so they cannot drift apart |
| `src/client/OpenUICard.tsx` | **4A-2 / D20** — `Renderer` gains the raw argument list; `List` reads the descriptor | A nested `ListItem` drew **two** rows: the walker drew a complete row and `List` wrapped it in a second one. Found by reading the live page, not by a test |
| `src/client/OpenUICard.tsx` | **4A-2 / D21** — `--font-mono` bridged to `--dsw-font-markdown-code-font-family` | The frame vocabulary's `--font-mono` does not exist in the host. Measured first, so this is not D17/D18 a fourth time |
| `src/client/OpenUICard.tsx` | **4A-2 / D22** — `LINK_LITERAL`, `--link`, `--muted-foreground-strong` | `Link` was 4.23:1 and the 11px supporting text 3.71:1 on white. Both now clear AA in both schemes |
| `src/client/OpenUICard.tsx` | **4A-2** — `Label` renders; `Badge` carries colour by dot + tint | Tinted text at 11px is what upstream records as having failed contrast |
| `tests/openui-text-4a2.spec.tsx` | **new, 64 tests** | The seven components, the 17 refused URL forms, and the three-layer variable guard. The `List` assertions were rewritten to check DOM **structure**, not text presence |
| `tests/openui-dom-structure.ts` | **new (maintenance)** | `countOf` / `shapeOf` / `depthOf` / `describeShape` — the D20 lesson made reusable. `AGENTS.md` §6 makes structure the required assertion for a component claim |
| `tests/openui-inventory.spec.tsx` | 12 → 19; 4A-2 batch row removed | Measured from `RENDERED_COMPONENTS`; the Text group now asserts *complete*, not *seven added* |
| `tests/openui-layout-4a1.spec.tsx` | verified-token allowlist + 2 entries | The guard refused `--font-mono` and `--dsw-alias-label-secondary` until each had a measurement. That is the guard working |
| `evidence/lib/cdp.mjs` | **D23** — `evaluate()` retries transient refusals | The documented policy was implemented in `step()` only, so one repaint could fail a run. `parity.mjs` still exits 0 |
| `tsconfig.json`, `tsconfig.client.json` | new spec and the structure helper registered in both | D13 again |
| `docs/reports/PHASE-4A-2-REPORT.md` | **new** | Batch verdict, ADR-008 summary, the three defects, and what is *not* verified |
| `evidence/phase-4a-2/` | manifest, 4 PNGs, contrast/token/theme JSON, 14 probes | Every 4A-2 claim has a file |
| `AGENTS.md` | **§2 rewritten** (tree ownership + pre-write check + worktrees); **§6 gained** the DOM-structure rule | Two owner decisions at 4A-2 close: a shared writable tree is a hazard, and a passing unit test is not a correct DOM |
| `HANDOFF.md` | **downgraded to a navigation index** | It was carrying HEAD, test counts and workflow state — a second source of truth that goes stale and can be trusted over the real one |
| `session-log.md` | §7 records the two changes above | AGENTS §8 |

**No change under `src/backends/`.** Language semantics are untouched; the
differential was re-run and still reports **31/31, 0 differences**
(`evidence/phase-4a-2/differential-4a2.txt`).

## 5. Test results

| Test | Command | Result | Evidence |
| --- | --- | --- | --- |
| Suite (4A-3, Linux) | `pnpm run test` | **809 / 809** (40 files) — 43 in the batch spec, up from 37; the one pre-existing failure fixed (D24) | `evidence/phase-4a-3/test-4a3-linux.txt` |
| Types (4A-3) | `pnpm run typecheck` | PASS, exit 0, both projects | `evidence/phase-4a-3/tsc-linux.txt` |
| Build (4A-3) | `pnpm run build` | PASS after `unrun` was declared (D23); re-verified with `node_modules` deleted | `evidence/phase-4a-3/build-linux.txt` |
| Language differential (4A-3) | `node --experimental-strip-types evidence/phase-2/differential.mjs` | **31/31, 0 differences**; output byte-identical | `evidence/phase-4a-3/differential-4a3.txt` |
| Inventory (4A-3) | `pnpm vitest run tests/openui-inventory.spec.tsx` | **30 / 48**, Inputs group complete | `evidence/phase-4a-3/inventory-linux.txt` |
| Mutation checks (4A-3) | two defects re-introduced on purpose, spec re-run, source restored | **both new guards went red** (Timer cleanup; meta size 205772 > 4096) | `evidence/phase-4a-3/mutation-check.txt` |
| Suite (4A-4, Windows) | `pnpm run test` | **821 / 15 / 836** — the failing **set** compared name-by-name with the baseline: **zero added, zero removed**; new spec 21/21 | `evidence/phase-4a-4/MANIFEST.json` |
| Browser 4A-4 — four components | isolated profile, host DOM counted by structure | **PASS** — Table 1/2/3/6; 2 charts (3 bar marks, 2 line paths, legend a+b); 3 icons; **exactly 1 `<img>`** and a `javascript:` src produced none | `evidence/phase-4a-4/C1-four-components.json`, `screenshot-four-components.png` |
| Browser 4A-4 — V3 themes | host's own 外观 control, both directions | **PASS** — 25 text samples per scheme over chart axis, legend, table head and cells; min contrast **5.8:1 light / 12.11:1 dark** | `evidence/phase-4a-4/V3-themes.json` |
| Browser 4A-4 — §9 hash gate | `Get-FileHash` before any measurement | **MATCH** `62AD5817…` — after finding a stale 4A-3 bundle (`4D071A86…`); **second consecutive batch §9 caught it** | `evidence/phase-4a-4/MANIFEST.json` → `hashGate` |
| 4A-4 mutation checks | four defects re-introduced, restored after | **all four went red**: Image scheme (2), chart gap coercion (2), table padding (1), validate-gate stub (2) | `MANIFEST.json` → `mutationChecks` |
| O1 validate gate | `pnpm vitest run tests/openui-validate-gate.spec.ts` | **6 / 6 PASS** — fixtures now run through `openuiBackend().validate()` | — |
| Browser 4A-3 — eleven components | isolated profile, host DOM counted by structure | **PASS** — all eleven counted; `data-openui-unrendered` empty | `evidence/phase-4a-3/C1-eleven-components.json`, `screenshot-eleven-components.png` |
| Browser 4A-3 — V1 IME | genuine `Input.imeSetComposition` over CDP | **PASS** — 5 `input` events with `isComposing=true`; pre-edit `startn→startni→startnih→startnihao` intact; caret 5→6→7→8→10; focus held; commit 你好 reached `$state` | `evidence/phase-4a-3/V1-ime-composition.json` |
| Browser 4A-3 — V2 Timer focus | real key events across 8 ticks | **PASS** — timer 01:00 → 00:53; six characters all landed in order; focus and node identity held; caret 1→6 | `evidence/phase-4a-3/V2-timer-focus.json` |
| Browser 4A-3 — V3 themes | host's own 外观 control, both directions | **PASS** — 21 variables per card all resolve; min contrast **5.8:1 light / 12.11:1 dark** | `evidence/phase-4a-3/V3-themes.json` |
| Browser 4A-3 — V4 hash gate (§9) | `Get-FileHash` build vs installed, before any measurement | **MATCH** `4D071A86…` — after finding and fixing a **stale N-1 bundle** (354465 vs 375564 bytes) | `MANIFEST.json` → `hashGate` |
| Browser 4A-3 — V5 persistence | real reload + history replay | **PASS** — a typed value survived both; the default is `start` | `evidence/phase-4a-3/V5-persistence.json` |
| Suite (4A-3, Windows) | `pnpm run test` | **794 / 15 / 809** — the 15-failure **set** compared name-by-name with the recorded baseline: **zero added, zero removed**; batch spec 43/43 | `evidence/phase-4a-3/test-4a3-windows.txt` |
| Types (host) | `npx tsc -p tsconfig.json --noEmit` | PASS, exit 0 | `evidence/phase-4a-2/tsc-host.txt` |
| Types (client) | `npx tsc -p tsconfig.client.json --noEmit` | PASS, exit 0 | `evidence/phase-4a-2/tsc-client.txt` |
| Suite (4A-2) | `npx vitest run` | **749 / 15** (764) — phase verdict was reached on 747; the 2 extra are the structural guards added at close | `evidence/phase-4a-2/test-4a2-maintenance.txt` |
| Suite (pre-publish, after the history rewrite) | `npx vitest run` | **749 / 15 / 764** — identical to 4A-2 after removing 22 screenshots and the vendored mp4; the rewrite touched no file under `src/` or `tests/` | `evidence/publish/test-before-publish.txt` |
| Language differential (4A-2) | `node --experimental-strip-types evidence/phase-2/differential.mjs` | **31/31, 0 differences** | `evidence/phase-4a-2/differential-4a2.txt` |
| New 4A-2 spec | `npx vitest run tests/openui-text-4a2.spec.tsx` | **64 / 64 PASS** | same suite file |
| **D20 guard validated** | defect re-introduced on purpose, spec re-run, fix restored | **3 of the new structural tests failed on it**, incl. `listitem inside listitem`; then back to 64/64 | this log; no artefact kept, because keeping a deliberately broken build would be worse |
| Inventory | `npx vitest run tests/openui-inventory.spec.tsx` | **19 / 48**, Text group complete | same suite file |
| Harness parity | `node evidence/lib/parity.mjs` | exit 0; no capability lost, character typing still forbidden | `evidence/lib/parity-report.json` |
| Browser 4A-2 | isolated profile, **no CSS overrides**, both schemes | **all six exit items PASS** | `evidence/phase-4a-2/MANIFEST.json` |
| Bundle hash (§9) | `Get-FileHash` build vs installed | **MATCH** before the accepted run | `MANIFEST.json` |
| Baseline (pre-commit) | `npx vitest run` | 683 / 15 (698) — matches the committed claim | `evidence/phase-4a-1/test-4a1-final.txt` |
| Suite | `npx vitest run` | **683 / 15** (698) | `evidence/phase-4a-1/test-4a1-final.txt` |
| Baseline parity | normalised FAIL-set diff vs baseline | **IDENTICAL** (15 vs 15, diff empty) | same file |
| New spec | `npx vitest run tests/openui-layout-4a1.spec.tsx` | **40 / 40 PASS** | `evidence/phase-4a-1/test-4a1-final.txt` |
| New spec | `npx vitest run tests/openui-inventory.spec.tsx` | **6 / 6 PASS** | `evidence/phase-4a-1/component-inventory.txt` |
| Build | `npx tsdown` | both halves build | — |
| Bundle hash (AGENTS §9) | `Get-FileHash` on profile vs build | MATCH on both halves, re-checked after the final rebuild | `evidence/phase-4a-1/MANIFEST.json` |
| Language differential | `node --experimental-strip-types evidence/phase-2/differential.mjs` | **31/31, 0 differences** | `evidence/phase-4a-1/differential-4a1.txt` |
| Host token scan | live host, all custom properties | **509 declared**; 2 bridged names did not resolve | `evidence/phase-4a-1/host-tokens.json` |
| Browser 4A-1 | isolated profile `p3web`, **no CSS overrides** | **A1–A8 PASS**; A9 NOT VERIFIED | `evidence/phase-4a-1/MANIFEST.json` |
| Earlier phases | — | unchanged, not re-run | `evidence/phase-1/`…`evidence/browser-phase-3/` |

## 6. Open issues

| Issue | Impact | Status |
| --- | --- | --- |
| B05/B10 unverified | Two claims about the card are untested | Later stage |
| Light Button pair is 4.23:1 | Below AA for body text; matches the host's own pairing | Recorded, not changed |
| `$state` not persisted | A reload loses what the user set | **Fixed and browser-verified** — S04 PASS |
| `path` is content-addressed | A regenerated card starts from defaults; only an `update` patch keeps state | Existing behaviour, documented in ADR-006 A3; unchanged by design |
| State is `localStorage` only | Does not sync across devices, browsers or profiles | Recorded in ADR-006 §Limitation; inherited from the HTML backend |
| HTML cross-view overwrite risk | Toolview + turn tail share one key and post whole maps | **Not fixed** (as decided). OpenUI has the write-merge; HTML is still last-writer-wins. Now **pinned by 3 regression tests** so it cannot widen unnoticed |
| Turn tail dropped OpenUI cards | A persisted card was invisible in the folded conversation | **Fixed in P3-06 and browser-verified** (T1–T6) |
| Button actions inert | `@Set` etc. evaluate but nothing consumes them | **Fixed in P3-07 and browser-verified** (A01–A04, A07, A08, A10) |
| `@OpenUrl`/`@CopyToClipboard`/`@ToAssistant` refused | A card cannot open, copy or message | Deliberate; each needs a security review (4B) |
| Two bridged tokens do not exist in the host | `--viz-series-4` and `--font-sans` resolved to nothing and silently used fallbacks | **Fixed in 4A-1 and re-verified in both themes** (D17, D18) |
| A declared-but-undrawn component drew nothing | A renderer gap looked like an intentionally empty card | **Fixed in 4A-1** — an explicit notice, pinned by tests (A7) |
| 12 of 48 components render | The language knows all 48; the renderer draws 12 | **Closed** — 19 after 4A-2, 30 after 4A-3, 34 after 4A-4, **48 of 48 after 4A-5** |
| Cross-generation replay unverified | A9 cannot be run on the profile's older session | Log written by a newer harness; recorded, not counted. **Unchanged by 4A-2** |
| 15 Windows test failures | Noise that could hide a regression | Accepted; `docs/testing/TEST_PLAN.md` |
| Small supporting text was 3.71:1 on white | 11px meta text (`Copy`, markers, citations) was below AA | **Fixed in 4A-2** — `--muted-foreground-strong` on the host's secondary tier, 5.8:1 / 12.11:1 (D22) |
| `--muted-foreground` is still 3.71:1 on white | `Caption` and `color: "muted"` inherit it | **Deliberately not changed.** `Caption` is a browser-verified 4A-1 component; restyling it needs its own decision, not a side effect of 4A-2 |
| `Link` colour has no host token that passes AA in both schemes | A `var()` bridge would fail in one scheme | Recorded in ADR-008; declared as a measured `light-dark()` pair (`LINK_LITERAL`) |
| Protocol-relative URLs allowed upstream, refused here | A recorded divergence, not a drift | ADR-008; the fork's allowlist is a strict subset of upstream's |
| `Mailto:`/`tel:` links degrade to text | A card cannot start an email or a call | Deliberate in ADR-008; nothing in the catalogue needs them, and they invoke OS handlers |
| A Windows account name survives in two **published** commits | `b2e0064` and `f65cf41` quote it in a session-log sentence. It is a name, not a credential, and `74ca8f7` already reworded the same sentence in later history | **Recorded, deliberately not rewritten.** Rewriting published history was ruled out by the owner; the value is unreachable from any current file |
| The persisted meta stores the fragment twice | 234 bytes a card; for a html card nothing reads `source` (`visualizeMetaFrom` needs `fragment`, `openuiMetaFrom` returns early when it is present) | **Recorded, deliberately not changed in 4A-3.** Removing it changes the persisted shape and needs an ADR |
| The build needed an undeclared optional peer | `pnpm install --frozen-lockfile && pnpm run build` failed on any clean machine | **Fixed in 4A-3** — `unrun` declared as a dev dependency (D23) |
| "15 known failures" was a Windows-rig count | A count carried across platforms hides what actually changed; one of the 15 had never run at all | **Restated in 4A-3** — 14 of the 15 do not exist on Linux, and the 15th was D24. The portable gate is the failure *set*, each entry named and caused |
| A Timer cleanup test passed for the wrong reason | A leaked interval writes into a store a reload has already replaced, so the leak is invisible to a value-based test | **Fixed in 4A-3** — cleanup asserted by counting pending timers (D25) |
| The validator rejected the documented `Action([...])` form | The prompt taught a form `checkNames` refused, so an obedient model was rejected and a "correcting" one succeeded | **Fixed in 4A-5** — the action table is consulted for the sigil-less form too; the old test was reversed, not deleted |
| `Celebration` never fired for a bare-variable condition | `Celebration($done)` passes a binding marker; `boolOf` on that object is constant true, so the transition never happened. Every test used the comparison form, so none touched it | **Fixed in 4A-5** — `fieldOf` unwraps the binding; three regression cases, mutation-verified |
| An idle bsk session is recycled after 5 minutes | The Agent Window and its browser close with it, which looks like a crashed environment | Recorded in 4A-5; start sessions with a longer `--session-idle` for a long acceptance run |
| A fresh agent tab is `about:blank` and cannot be synced | `cooperate sync` fails with "Receiving end does not exist" until the tab navigates, because the content script is not injected | Recorded in 4A-5; navigate before the first sync |
| R2's "an aborted call writes nothing" check did not discriminate | The same assertion passes with the fix absent, because `legacy-tool.ts:339` throws after image resolution in both versions | **Closed 2026-11-07 for the workspace-image create path** — the mutant control shows the pre-fix shape reads the workspace image and leaves an orphan image file; the shipped build does neither (`evidence/stage-7-pre/r2-mutant-control.json`) |
| Tag `v0.1.1`'s own `CHANGELOG.md` still carries the removed temp-file-leak sentence | Anyone reading the tagged tree sees text that main has corrected | **Deliberate, not a defect to fix by releasing.** The tag was not moved; the corrections are a later commit on main (`cdc9868`) and the GitHub Release page was edited in place. A v0.1.2 would ship byte-identical `lib/` and would not change the v0.1.1 tree |
| **Host version skew** | The plugin compiles against 0.2.1-rc.5 types but runs on the installed **0.2.2-rc.1** desktop host; 0.2.2 ships no `.d.ts`, and `peerDependencies: ^0.2.1-0` does not admit `0.2.2-rc.1` under strict semver | **Recorded 2026-11-07 (Stage 7A).** Runtime compatibility is unverified; the v0.1.1 browser evidence ran on the 0.2.1-rc.5 host. Needs its own stage before claiming 0.2.2 support |
| **`@ToAssistant` still refused** | Needs one upstream host change: host-validated message attribution | **ADR-016 Proposed, awaiting owner.** No implementation authorised |
| **No host-read bytes in the confirmation** | `userQuestions.ask` renders caller-supplied `detail`; the host does not verify it equals a durable message | Accepted residual in ADR-016 §10; the plugin must show the same string it submits, and a test must pin byte equality |
| **`@OpenUrl` still refused** | No plugin-callable external open in 0.2.2-rc.1 | Unchanged; upstream ask stands (ADR-014 §10.4) |

## 7. Next step

**v0.1.1 stays the current release; no v0.1.2.** Tag `v0.1.1` at `50b6b54`,
GitHub Release published 2026-11-06; `main` carries documentation commits after
it (this session's included). The R2 control that was left open at the v0.1.1
close is now **discriminating for the workspace-image create path** (Session 28);
it required no product change, so it also gives no reason to cut a release.

**Why not v0.1.2:** the only outstanding misstatement lives in the *tagged*
`CHANGELOG.md`, which a new tag cannot edit — the only fix would be moving
`v0.1.1`, which the owner deliberately declined. A patch release would ship
byte-identical `lib/` (the version string does not enter the bundle) and would
announce a change to users while the v0.1.1 tree still reads as before. The
correction is already on `main` (`cdc9868`) and on the Release page.

**Stage 7A is CLOSED (2026-11-07). The decision now needed is ADR-016's.**
The host investigation is done against the installed **0.2.2-rc.1** — not the stale
0.2.1-rc.5 tree that 4B-2 read — and it narrows `@ToAssistant` from two host gaps to one:

1. **`@ToAssistant`** — submission (three plugin paths), role enforcement (the host builds
   `kind:'user'`) and a host-rendered confirmation the card cannot fake
   (`ctx.userQuestions.ask`; no turn check in the service, but the between-turn live-root
   gate is unverified) all exist. **The one missing piece is
   message attribution**: the prompt wire has no provenance field, the host hardcodes the
   source, and the transcript renders an unattributed user bubble. `ADR-016` proposes
   **Option B** — request that one upstream change, then implement. It is **Proposed,
   awaiting the owner**; the action stays refused until a decision is recorded.
2. **`@OpenUrl`** — unchanged: still no plugin-callable external open in 0.2.2-rc.1. The
   sidebar tab is not this action, and the upstream ask stands (ADR-014 §10.4).

No implementation is authorised by Stage 7A. Stage 7B begins only after (a) the owner's
ADR-016 decision and (b) the upstream attribution change, if Option B is chosen.

~~Stage 4A is closed at 48 / 48.~~ — historical, kept for the shape of the note.
~~4A-4 is accepted. Next is 4A-5~~ — the fourteen that remain: the ten SVG
drawing primitives plus `Flashcard`, `Celebration`, `Carousel` and `Popover`.
Three things carry forward:

1. **`Popover` is the only remaining component that overlays the host document.**
   It needs its own containment check, in the shape ADR-009 took: decide the
   boundary in an ADR before the renderer exists.
2. **Countable marks.** `Chart` gives every drawn element a `data-chart-mark`
   attribute, so a test (and the browser probe) can assert *how many* were drawn.
   The SVG primitives should do the same — the D20 lesson, applied before the
   defect this time.
3. **`IconButton`'s placeholder glyph** still draws its own `icon` name. `Icon`
   now exists but draws its name too, so there is nothing to gain by wiring them
   together until a real icon set lands. Recorded so it is not mistaken for an
   oversight.

Two things from the 4A-3 run still apply:

1. **Carry the documented action form into the fixtures.** The 4A-3 unit spec
   calls `renderProgram` directly, which skips the backend's name check, so it
   accepts `Action([@Set($v, 1)])` while the live path rejects it with
   `VZO002 unknown component "Action"`. The skill text documents a bare
   `@Set($v, value)` step and a model writes that, so nothing is broken — but a
   jsdom spec that is more permissive than the host is a trap worth closing.
   Observation **O1** in `evidence/phase-4a-3/MANIFEST.json`.
2. **Reuse the probes, do not rewrite them.** `probe-v1-ime-cdp.mjs`,
   `probe-v2-timer-focus.mjs`, `probe-v3-themes.mjs`, `probe-v5-persistence.mjs`
   and `probe-c1-eleven.mjs` in `evidence/phase-4a-3/` are the working shape for
   browser acceptance: each refuses to run without a fresh smoke stamp and exits
   2 when the environment — not the product — is what failed.

Everything below is the previous session's note, kept because its lessons still
apply to the local run.

**The working tree was dirty and is now committed.** The three accepted phases
(stage 3, 4A-1, infra-1) sat on top of `9b46cec` for a session and were committed
as **`5d2a3e9`** at the start of this one. A separate audit confirmed the commit
is self-contained: no `lib/`, `tmp/`, `node_modules/` or
`evidence/.smoke-stamp.json`, no file under `src/backends/`, and its baseline is
reproducible from a clean export.

**4A-2 is closed (PASS).** Record: `docs/reports/PHASE-4A-2-REPORT.md`, manifest
`evidence/phase-4a-2/MANIFEST.json`. Baseline to protect: **749 passed / 15
failed / 764** — the phase verdict was reached on 747 / 762, and the two extra
tests are the D20 structural guards added at close. The failure set is identical
to the 4A-1 baseline after normalising
timings; `tsc` clean both projects; differential **31/31**.

### Before 4A-3 starts: two maintainability changes, already made

These are **not a new infra phase**. They are the two things the owner asked for
at close, and both are done:

1. **`HANDOFF.md` no longer carries dynamic state.** It is now a navigation index
   only — where things are, and the three things that look like defects but are
   not. It records no HEAD, no test count, no workflow state. State lives in
   `STAGE.md` (what this stage may touch), `session-log.md` (what happened), and
   `git status`/`git log` (what the tree is). One fact, one owner.
2. **`AGENTS.md` §2 is now "one writable tree, one writing session"**, with a
   pre-write check (HEAD, dirty files, files changing while you are not writing,
   the server port) and git worktrees as the supported way to run parallel
   agents. The worktree caveat is stated there too: it isolates files, not the
   `bsk` daemon, the DSH server, the browser tab, or `tmp/`.

### D20 is now a standing rule, not just a fixed defect

`AGENTS.md` §6 gained **"A passing unit test is not a correct DOM"**, backed by a
new `tests/openui-dom-structure.ts` (`countOf`, `shapeOf`, `depthOf`,
`describeShape`). The `List` tests were rewritten to assert structure rather than
the presence of strings, and the guard was **validated by re-introducing the
defect**: 3 of the new structural tests failed on it, including
`listitem inside listitem`, which no regex over raw markup can detect. The fix was
then restored and the spec returned to green.

That validation matters more than the tests: a regression guard that has never
been seen to go red is a guess about what it protects.

### 4A-3 is next

`Input`, `TextArea`, `Select`, `SegmentedControl`, `Checkbox`, `RadioGroup`,
`DatePicker`, `Timer`, `Form`, `IconButton`, `Pressable`. Scope and gates are in
`STAGE.md` §Stage 4A. Two things specific to that batch:

- **Every one of them binds `$state`.** This is where the P3 persistence and
  `@Set` path prove their generality, so "renders" is not the bar — a bound input
  must write `$state` and survive a reload, which is exit criterion 2.
- **`IconButton` and `Pressable` are action carriers**, like `Button`. They must
  go through `write.runAction`, the same channel, or a second way for a control
  to reach state appears.

**Scope note.** The toolchain and documentation system are mature enough. Prefer
product capability and real-browser acceptance over more test-infrastructure
work; `infra-1` is closed and 4A-3 is a feature batch, not an infra one.

### What 4A-2 learned the hard way, and 4A-3 should not re-learn

1. **Assert counts, not presence.** `List([ListItem(...)])` drew two rows for one
   item and every unit test passed, because the tests only checked that the
   expected strings were somewhere in the markup. Assert how many things were
   drawn (D20).
2. **Measure a token before using it.** `--font-mono` looks obviously real — it
   is declared in `src/frame-css.ts` — and the host has never published it. The
   frame vocabulary is not the host vocabulary (D21).
3. **A colour is not a metaphor.** `--primary` is a *surface fill*; as 16px text
   it is 4.23:1. Contrast has to be measured against the effective backdrop, and
   11px text is the case that fails first (D22).
4. **A dialog dims the page.** Driving the host's Settings control leaves the
   Settings dialog open, which greys the card in a screenshot. Close it before
   capturing, or compare computed styles rather than pixels.

### Operational state that does not survive the session

These were started by this conversation and die with it. A new session must
re-create them; nothing in the repo can.

| Thing | How it was started | Evidence of life |
| --- | --- | --- |
| `bsk` daemon | `$env:BSK_AUTO_START='0'; bsk daemon start --foreground --session-idle 4h --daemon-idle 8h` as a background job | `bsk status --json` → daemon 0.4.1, protocol 1.8, `version_skew: false` |
| Isolated DSH server on :3093 | `$env:DSH_HOME=(Resolve-Path 'tmp/dsh-p3').Path; dsh --profile p3web --no-open --port 3093 --host 127.0.0.1` | URL printed to `tmp/dsh-p3/web<n>.out.log` — **read the newest one; the number increments and the token changes every start** |
| Agent-window session | `bsk session start --browser 0b5a787d --name … --json` | session id was `ggbi` this time; **it changes every start** |
| Agent tab navigated | `bsk navigate --session <sid> --tab-id <tab> -- "<url>"` | otherwise the tab stays `about:blank` and G0 blocks |

**A stale bundle is the first thing to check, and `pnpm install` lies about it.**
For a `file:` dependency pnpm reports "Already up to date" and keeps the
hard-linked old copy in the profile, so a build that happened after the install
is not what the browser runs. To refresh it, remove the profile's
`node_modules/@dsh-unified/visualize` directory and `pnpm install` again, then
confirm with `Get-FileHash` on both halves. This cost a full measurement cycle
this session; the §9 check is what caught it.

**A redacted working tree is not a redacted history.** `git grep <secret> <file>`
searches what is on disk; `git grep <secret> $(git rev-list origin/main..main)`
searches what is in the commits. Removing a value in a *later* commit leaves it
intact in the object of the earlier one, and `git log -p` will still show it.
Run the second command before claiming a leak is fixed, and prefer fixing the
commit that introduced it over adding a commit that removes it — a follow-up
commit is a tombstone, not a deletion.

Five traps, all hit across this session and the last:

- **The daemon needs a persistent foreground task.** `bsk status` from a normal
  one-shot shell fails with `cannot start an independent Windows daemon`. Start it
  as a background job and keep it alive; then set `BSK_AUTO_START=0` for clients.
- **A fresh agent window opens on `about:blank`**, and evaluating against it
  *hangs* rather than failing. Navigate first. `probe.mjs --what=smoke` reports
  this in 0.3 s instead of hanging, which is the whole reason G0 exists.
- **Only one process may hold :3093.** Before starting a server, check
  `Get-NetTCPConnection -State Listen | ? LocalPort -eq 3093`; if it is held,
  reuse that server and read its token from the newest `web<n>.out.log`. dsh does
  not report a bind failure where you would look for it — the symptom reads as
  "the server crashed".
- **Repeated server restarts can wedge the agent tab.** The symptom is
  `A page frame is not responding`, and then every call hangs. `bsk status` stays
  healthy, which is how you know it is the tab and not the daemon. A fresh
  agent-window session clears it; there is no need to restart the daemon.
- **`bsk navigate` takes the URL positionally.** `--url` is rejected and `--tab-id`
  is required when the session has more than one tab.

Six things carried forward:

1. **The HTML cross-view hazard** is pinned by three regression tests and
   deliberately unfixed. Fixing it changes shipped behaviour and needs its own
   decision.
2. **The narrower-reader trap.** Any surface that reads cards with
   `visualizeMetaFrom`, or values with a component lookup, silently drops a
   variant (D14, D15). Both were found by probing what rendered, not by reading.
3. **A05, A06, A09** (stage 3) and **A9** (4A-1) are NOT browser-verified. Do not
   count them as browser passes in a later summary.
4. **A coverage number must be measured from the code, not copied.** The
   inventory said "8 of 48" for three sessions and was still saying it after the
   renderers existed, because it mirrored the table by hand (D19).
5. **A unit test that checks for the presence of text is not a rendering test.**
   4A-2 shipped a `List` that drew two rows for one item while 62 assertions
   passed, because they asked "is the title in the markup?" rather than "how many
   rows were drawn?" (D20). Count what was rendered.
6. **A bridged `var()` must name a token someone has *seen resolve*.** The
   measured allowlist in `tests/openui-layout-4a1.spec.tsx` is what turns that
   from advice into a failing test; it refused two new names in 4A-2 until each
   had a measurement behind it (D21, D22).

---

## History

### Session 29 — 2026-11-07 (Stage 7A: host capability evidence + `@ToAssistant` ADR)

**Closed Stage 7A. No product code, no version bump, tag untouched.** Deliverables:
`docs/reports/STAGE-7A-HOST-CAPABILITIES.md`, `docs/decisions/ADR-016-TO-ASSISTANT-STAGE-7A.md`,
`evidence/stage-7a/` (six files), this file's §1/§2/§6/§7.

### The premise this session had to correct before it could answer anything

Stage 4B-2 read `tmp/dsh-host-src` and cited it as "the installed asar". It is
**0.2.1-rc.5**. The installed desktop host is **0.2.2-rc.1**: the asar header names
`@deepseek-ai/dsh-desktop` 0.2.2-rc.1, its bundled runtime is 0.2.2-rc.1; of the **331**
`@deepseek-ai` entries, **321** `dsh-*` packages are 0.2.2-rc.1 (10 others carry their own
versions), and `resources/runtime/cli/bin/dsh.cmd` launches
`app.asar/.../dsh-desktop-host/lib/cli.js`. The stale tree's files differ by hash from the
installed ones (`evidence/stage-7a/host-provenance.json`).

Consequences that changed the stage's answer: `dsh-client-ui-slots` no longer exists as a
package (its `SlotCore` is a web-shell builtin), 0.2.2 packages ship no `.d.ts`, and
`dsh-action-cards` / `dsh-client-ui-action-cards` are new. Every old `file:line` is
therefore unusable, and the whole capability question had to be re-derived.

`tmp/dsh-host-0.2.2-rc.1/` was extracted with a small asar reader that verifies each file
against the archive's own SHA-256 before writing it (`evidence/stage-7a/asar-tool.mjs`);
the reader's first parse was wrong (nested pickle sizes) and was corrected against a
hexdump before any evidence was recorded.

### What the three investigations found (Lead verified the decisive lines)

| Question | Result |
| --- | --- |
| Card-initiated submission | **Yes** — `inputActions.setDraft/submit` (slot prop), `session.prompt` Remote via a retained session, `agent.steer`. `submit()` is `(): void` and forces queue mode (`conversation:15392-15394`, Lead-verified). |
| Verifiable result | **No at card level; partial at plugin level.** Acceptance `{accepted:true}` only; delivery goes to the composer via `onRetire("observed")`; an archived session accepts then blocks the turn silently. |
| Trusted identity | `sessionId` + tool `callId` are host-supplied and the opaque-origin iframe cannot forge them; turn is only in start-stage blocks / durable events / turn-tail. |
| Confirmation the card cannot fake | **Exists in source and is plugin-callable**: `ctx.userQuestions.ask()` (no turn check in the service; host-rendered; the browser answerer needs the live root agent — between-turn liveness unverified). The approval panel is a second audited surface but **throws outside an open turn**. Neither shows host-read message bytes; `detail` is re-rendered as Markdown |
| Message attribution | **Absent.** The prompt wire has no source field; the host builds `{kind:'user', rpcId, clientTimeZone, principal}` (`session-controller/index.js:4048-4061`, Lead-verified); `MessageSourceMap` has no card kind; `'user'` renders as a plain bubble. |
| `@OpenUrl` | **Absent, unchanged** — `shell.openExternal` is Electron-main policy only; the sidebar tab is the only mediated open; `open-in-app` is directory-only. |

### The answer the stage was asked for

**`@ToAssistant` requires exactly one host change** — host-validated, rendered message
attribution. The confirmation requirement no longer needs requesting: it is available via
`userQuestions.ask`, which changes ADR-015's premise without relaxing any of its
requirements. **`@OpenUrl` requires a separate host change** (plugin-callable external open),
as ADR-014 already recorded.

`ADR-016` lays out three options and recommends **Option B** (request only the attribution
change, then implement). Option A (plugin-only, notice-row attribution) is rejected under
ADR-015's unchanged requirements; Option C (dedicated message-bound confirmation API) is the
larger ask if upstream prefers a complete surface. The ADR is **Proposed**; no decision is
recorded, and the action stays refused.

### Method, and what it cost

Three read-only investigators worked in parallel on disjoint evidence files
(`submit-capability.md`, `attribution-capability.md`, `confirmation-and-openurl.md`), each
claiming a shared task; the Lead independently verified the load-bearing lines (`submit`,
prompt source construction, `ask()`'s missing turn check, approval's turn check, no card
source kind, action-cards composition) rather than trusting the summaries. Every claim is
graded **Read** / **Type** / **Ran**; nothing was executed against the host, so nothing is
claimed as verified behaviour.

Two version-skew residuals were found and recorded rather than hidden: the plugin's compile
baseline is 0.2.1-rc.5, and `peerDependencies: ^0.2.1-0` does not admit `0.2.2-rc.1` under
strict semver.

### Commands run, and their output

`node tmp/probes/asar-provenance.mjs` → exit 0 (0.2.2-rc.1 vs 0.2.1-rc.5, hashes differ);
`node tmp/probes/asar-tool.mjs extract …` → exit 0 (every file SHA-256-verified);
`node tmp/probes/asar-inventory.mjs` → 331 entries, 321 `dsh-*` at 0.2.2-rc.1, 10 independently versioned; plus the `Select-String`
searches recorded inside the three evidence files. No test suite run: no file under `src/`
or `tests/` changed.

**Deliberately not done:** no dispatcher change, no card↔host channel, no tag move, no
release, no browser run. Stage 7B starts only after the owner's decision.

**Push pending:** the docs/evidence commit is local (`ef897a6`); `git push origin main`
failed because the configured proxy `http://127.0.0.1:7890` was not listening. No CI run was
triggered. Retry the push (and let CI run) when the proxy is back; nothing in the commit
depends on it.

### Session 28 — 2026-11-07 (R2 made discriminating; no release)

**The R2 control left open at the v0.1.1 close now discriminates, for the
workspace-image create path it measures. No product change, no version bump, tag
untouched.**

Session 27's addendum recorded the problem precisely: `legacy-tool.ts:339` calls
`signal?.throwIfAborted()` *after* image resolution in **both** versions, so
"an aborted call throws and writes nothing" would pass with the fix absent. The
discriminator is the work done before the abort is noticed. The probe written for
it existed and had never been run. This session ran it — and the probe measured
nothing twice before it measured anything.

**Attempt 1 (the stored probe) died on import.** The mutant bundle was copied
under `%TEMP%`, where a bare import (`@deepseek-ai/schemastery`) cannot resolve;
`ERR_MODULE_NOT_FOUND` before any measurement. Fixed by keeping the copy inside
the tree (`tmp/`, gitignored).

**Attempt 1b reported `INCONCLUSIVE`, and that was also not evidence.** Both the
real build and the mutant showed 0 workspace reads. Two independent causes, each
invisible without asking *"does this rig do anything when nothing is aborted?"*:

- the fake registrant context had no `contains`/`stat` in `ctx.fs`, and
  `workspaceImageReader` feature-detects all four methods — so it threw before
  reading a byte;
- its `inject()` never invoked its callback, so `imageRoute.ready` stayed false
  and every image was reported undeliverable **before** resolution started.

Both builds were therefore inert, and "0 reads" meant "nothing ran".

**What the control does now** (`evidence/stage-7-pre/r2-mutant-control.{json,mjs}`)
— the built `lib/index.js` (`d1fd5f84…`) against a byte copy with exactly the
`resolveCardImages` entry check deleted (`ee2bf825…`, 1 of the 2 `throwIfAborted`
occurrences left), same mock host, two runs per condition:

| condition | workspace reads | store files added | outcome |
| --- | --- | --- | --- |
| v0.1.1 build, aborted | 0 | 0 | `AbortError` |
| mutant (entry check removed), aborted | 1 | 1 — orphan `sessions/s1/images/<sha256>.png` | `AbortError`, no card |
| v0.1.1 build, live signal (**connectivity control**) | 1 | 3 — card, manifest, image | card written |

**The finding worth keeping:** the pre-fix shape does not merely throw late — the
aborted call reads the workspace image and leaves an **orphan image file in the
content-addressed store**. The CHANGELOG sentence — "still read the workspace,
fetched images and wrote to the store — then threw the result away" — is accurate
for the workspace read and the store bytes. Its remote-URL half is **not part of
this control** (the fragment carries no URL); that half is unit-evidenced in
stage 6: `tests/images.spec.ts` "does no work for a call cancelled before it
starts" failed pre-fix returning `origin: 'url'`, and
`evidence/stage-6/abort-entry-red.txt` records the fetcher being entered. No
public fetch was added here — it would turn the control into a network test, and
the SSRF policy refuses non-public addresses.

**What it does not cover:** `action: 'create'` with one workspace image, and an
abort set before the call. The update path and an abort arriving mid-resolution
were not exercised; and the measured quantities are image work and store files,
not argument validation or linting, which still run before the abort.

**The rule this earns.** A negative measured by an inert harness is not
evidence. Every "it did nothing" needs a positive control showing the same rig
does something when the condition is removed. This session paid for it twice:
once when the mutant appeared to do no work, and once when the live control
showed the harness was doing no image work at all. The failure mode is now a saved
artefact rather than a recollection — `r2-inert-harness.json` runs the same two
builds through attempt 1b's broken context and records **0 reads for the live
call as well**.

**Docs updated:** `artefact-regression.json` (R2 gains `discriminativeControl`;
its verdict now says the entry-level check is non-discriminating on its own),
`negative-controls.json` (its R2 code-shape verdict downgraded from `PASS` to
`CODE SHAPE ONLY`, with a pointer to the behavioural control),
`RELEASE-EVIDENCE.md` §4/§5/§6/§7, this file §6/§7. The probe was copied into
`evidence/stage-7-pre/` verbatim and **re-run from there** to produce the
recorded JSON (committed with this entry; local paths redacted per the Session 27
convention); the inert-harness script was copied in and re-run the same way.

**Independent review, and what it changed.** A read-only reviewer reproduced the
run byte-for-byte (normalizing only the two absolute build paths) and confirmed
the mutant is exactly one deletion. It returned **FIX NEEDED**: the run was
sound, the prose overreached. Accepted and fixed — "closed"/"PROVEN" narrowed to
the workspace-image create path; the fetch caveat corrected to point at stage-6
unit evidence instead of claiming "code path only"; `negative-controls.json`'s
code-shape `PASS` downgraded; §5's heading no longer attributes R2 to
`negative-controls.json`; the live round's assertions hardened to require the
card `.html` and an embedded image; path matching made separator-agnostic; the
inert-harness failure saved as an artefact. One finding was **narrowed rather
than accepted**: the reviewer's "the local server used by the unit tests is
refused by the SSRF policy" — the cancelled test uses an injected stub fetcher,
not a local server, and the SSRF point holds for the default fetcher only.

**Commands run, and their output:** `node evidence/stage-7-pre/r2-mutant-control.mjs`
→ exit 0, verdict `PASS`; `node evidence/stage-7-pre/r2-inert-harness.mjs` → exit
0, verdict `INERT HARNESS, REPRODUCED`; `ConvertFrom-Json` parse check on
`artefact-regression.json`, `r2-mutant-control.json`, `r2-inert-harness.json` and
`negative-controls.json` → all OK. No file under `src/` or `tests/` changed, so
the full suite was not re-run; saying that is cheaper than implying it was.

**Deliberately not done:** the tag was not moved, no v0.1.2 (reasoning in §7),
and Stage 7 was not started.

### Session 27 — 2026-11-06 (v0.1.1 released)

**Released `v0.1.1` at `50b6b54`. Tag and GitHub Release published. No force push
at any point.** Release: https://github.com/Xin-zimu/dsh-plugin-visualize/releases/tag/v0.1.1

Stage 6 had already fixed the three product defects and left them under
`[Unreleased]`, with the decision to release explicitly deferred to the owner.
This session was that release.

### The thing that nearly made the whole verification worthless

Rebuilding `lib/` before tagging reproduced both CI hashes exactly — and in doing
so revealed that the **pre-existing** `lib/index.js` was `8d4bc669…`, containing
**zero** occurrences of `expandDisplayPath`. That is the *pre-fix* server half.
The installed profile agreed with it: its `client.js` was current, its
`index.js` was pre-fix.

All three Stage-6 fixes are **server-side**. So a browser run against that
profile would have been green while exercising none of them, and the green would
have been read as verification.

This is `AGENTS.md` §9's failure mode exactly — "the browser is not running this
tree, and no product code may be judged FAIL on that run" — except it happened on
the server half, where the §9 procedure had never been applied. §9 says to hash
the installed `lib/client.js` against the build; the asymmetry between the two
halves was invisible because only one half was ever checked. **The rule is now
"both halves", and this is why.**

### The environment had to be rebuilt before the test could mean anything

`displayOf()` only shortens a path that starts with `homedir()`. The existing
isolated profile lives at `tmp/dsh-p3` — outside `C:\Users\<user>` — so the `~`
round-trip bug **cannot fire there**. A second harness home was created under the
user profile (`…\AppData\Local\Temp\dsh-v011`), the rebuilt plugin installed into
it, and the host run on `:3094` while `:3093` was left untouched. The probe
refuses to run (exit 2) if the store is not under the home directory or the tab is
on the wrong host, so this cannot silently regress into a vacuous pass.

### What was verified, and the controls that make it mean something

| Check | Result | Control |
| --- | --- | --- |
| Both bundle halves match the build | PASS | — |
| Real host: create then update via the reported `~\` path, both separators | PASS — `alpha 0`, `beta 1` on disk | v0.1.0 **REFUSED** that identical path; v0.1.1 accepts it |
| Traversal through the widened reader | 16 attempts, **0 escapes** | — |
| Cancelled-at-entry call writes nothing | PASS, 3/3 rounds, listing identical | live-signal control **did** create its card — **historical row: this check is non-discriminating on its own; see the addendum and Session 28** |
| 8 concurrent creates onto one content-addressed name | PASS, 3/3 rounds, 8/8, 0 temp files | v0.1.0 failed **32 of 200** writes over 22 of 25 rounds, all `EPERM`; v0.1.1 **0 of 200** |
| A card written by an earlier build is patchable | PASS | — |

The rename control is the most valuable line in that table: it reproduces the
"1–3 of 8" the fix was written against, on this machine, from v0.1.0's own code
extracted with `git show`. Without it, "8/8 succeeded" would only show that this
machine was not racing today.

**One caveat stated rather than smoothed over:** the old code's 0 leaked temp
files in that harness does *not* contradict the original leak finding. The
store-level leak is a consequence of an abandoned temp file; the helper harness's
failure path still ran `rm(temp)`. The rename failures are what this control
proves, and `RELEASE-EVIDENCE.md` §5 says so.

### Derived numbers, and the two that were wrong

- `946` tests: **946 passed / 0 failed / 0 skipped on CI Ubuntu and CI Windows**,
  `942 passed / 4 skipped` locally.
  CI gate lines read directly from run `42170037015`: `windows: baseline 15,
  found 0, new 0`, `failsOnBoth: []`, `BUILDS IDENTICAL`.
- `STAGE.md` said "946/946 green locally". The local figure is 942 + 4 skips;
  946/946 is CI. Now stated as two numbers, because they are two facts.

### Process failure, recorded

A first full-suite run was made with `NODE_ENV=production` and reported 118
failures across 15 files. The cause was the environment variable breaking React's
`act()`, not the code — the run was discarded and re-made. The lesson is the
standing one: a red number is only information once you know what produced it.

### Pushing, when `git push` was not available

`git push` failed: the configured proxy on `:7890` was not running, a direct
connection was reset, and the SSH key on the machine is not authorised on the
account — while `api.github.com` was reachable and `gh` was authenticated with
repo write scope. The commit was therefore reconstructed through the Git Data
API. **The check was not "the API returned 201"**: every blob's remote id was
compared to the local id, and the assembled tree had to equal the local commit's
tree `e00ead43…`, which is only possible if every byte matches. The first attempt
**failed that check and refused to move the ref** — `core.autocrlf=true` means the
worktree holds CRLF while the object store holds LF, and reading the files instead
of the blobs produced 5 differing blobs. Reading `git cat-file blob` instead made
the trees identical. `git reset --hard origin/main` then aligned the local branch
onto the remote commit (zero content difference, different SHA), and CI ran on
that commit.

Network access was restored afterwards; the tag and Release were pushed with
ordinary `git push` / `gh release create`.

### Docs updated

`README.md` Status (was "release candidate… not yet tagged") and the
compatibility bullet (was 939/932); `STAGE.md` stage-6 row and its misleading
"green locally"; `CHANGELOG.md` `[Unreleased]` → `## [0.1.1]`, with a "Verified in
a real host" section; `package.json` → `0.1.1`; this file's §1 and §7.
Evidence under `evidence/stage-7-pre/`, home paths redacted with
`evidence/lib/redact.mjs` before committing (this session's first scan hit three
JSON files; after redaction the scan is clean).

### Session 27 — addendum (post-release corrections)

After the tag was pushed, an independent read-only review of evidence/stage-7-pre/ found three defects in the release documents. All three were re-verified here before being acted on; a fourth finding was disproved.

**1. The temp-file leak claim was false, and is removed.** CHANGELOG.md said the concurrent rename "failed and leaked temporary files", and README.md repeated it. Measured directly: v0.1.0's own writeFileAtomic catch block already runs rm(temp, { force: true }) for any code other than EEXIST, so a forced EPERM (destination made a non-empty directory) left **zero** .tmp files. The claim came from the *text* of the error message — which names a temp path — not from a file left on disk. No artefact anywhere under evidence/ measures a leaked temp file. Corrected in both files.

**2. The host run proved the native form only.** The changelog said the turn patched the card "for both the native ~\ and the POSIX ~/ form". Both browser JSONs contain **zero** ~/ occurrences. The POSIX form is covered at reader level and by unit tests, not by that run. Reworded so each claim names the evidence that carries it.

**3. "After a reload the conversation and its cards are still readable" overstated.** The probes record cardsAfterReload: 0 with framesAfterReload: 6/9. Readability of the conversation is supported; a card count is not. Reworded.

**Disproved:** a finding that the certifying CI run predates the version bump. Run 42170037015 is on 50b6b54, whose package.json already reads 0.1.1.

**Open — the one thing not finished.** R2's control does not discriminate. `legacy-tool.ts:339` calls `signal?.throwIfAborted()` *after* image resolution in **both** versions, so any aborted call throws and writes nothing regardless of the entry check; the recorded R2 evidence would look identical if the fix were absent. The discriminator is the work done *before* the abort is noticed — workspace image reads, and image bytes written into the store. A probe that builds a mutant bundle with the entry check deleted and measures those two exists at `tmp/probes/v011-r2-mutant-control.mjs` and **has not been run**. Treat the artefact-level R2 in `artefact-regression.json` as NOT PROVEN until it is.

**Status 2026-11-07 — closed for the workspace-image create path.** Session 28
ran it: the mutant reads the workspace image and leaves an orphan image file where
the shipped build does neither, and an un-aborted round proves the rig reaches
image resolution. See Session 28 above.

**Carry-forward:** tag v0.1.1 still points at 50b6b54, whose CHANGELOG.md carries the removed leak sentence. The corrections are a later commit on main; the tagged tree's text cannot be changed without moving the tag, which was deliberately not done. The GitHub Release notes were edited in place instead.
### Session 26 — 2026-11-06 (Stage 6: three product bugs behind the "platform failures")

**Stage 6 closed. The suite is green on every platform: 946/946 on CI Linux and CI
Windows, 942 passed / 4 skipped locally.**

The headline is not the green. It is that **three of the five causes v0.1.0 classified as
platform behaviour were product bugs**, and the classification is what kept them alive:
an error message naming an OS mechanism reads as environmental even when the product put
it in that position.

| v0.1.0 label | Reality |
| --- | --- |
| 6 symlink tests, platform | platform, confirmed — capability genuinely absent |
| 4 `~` path failures, platform | **product bug 1** |
| 1 timeout, platform | **product bug 2**, and the *mask* was a test shape |
| 1 rename EPERM, platform | **product bug 3** |
| 1 fs mock, fixture | fixture, confirmed — `readText` is a real API |
| 1 description fixture, fixture | **false accusation** — the assertion was mis-written |

### The three product bugs

1. **`~` round trip broken on Windows.** `displayOf()` emits `~` + the native separator,
   so `~\AppData\…`; both readers accepted only `~/`. **The tool handed back a path it
   would refuse.** Linux CI could not see it because `tmpdir()` is `/tmp` there — outside
   `homedir()` — so `displayOf()` is a no-op for every temp path. On Windows `tmpdir()` is
   inside `homedir()`, so every temp path is shortened and the bug fires. Fixed by widening
   the readers, not the producer: the same string is pasted into `update` *and* into a
   shell, and on Windows the native form is what those accept.

2. **The 5,020 ms "timeout" was a 39 ms failure wearing a mask.** `created.path` is the
   display form, the test handed it back, `ownedPath()` refused it and `workspacePath()`
   then *accepted* it as workspace-relative (the literal `~` directory exists inside the
   workspace). The update was misrouted and died before `resolveCardImages`, so the test's
   `fetchUrl` stub never ran, so the promise it awaited could never settle. The update had
   already rejected — nothing awaited it until after the gate — and `STACK_TRACE_ERROR` is
   vitest's sentinel for a timeout, which overwrote the useful message. **The real error was
   printed in the same output, under Unhandled Errors, for two stages.** Stage 5's note
   "a timeout is not a diagnosis" was right, and the diagnosis was already there.

3. **Concurrent rename returns EPERM on Windows.** `writeFileAtomic`'s comment asserted
   distinct temp names were enough. Measured: 1–3 of 8 concurrent renames failed and leaked
   `.tmp` files. Bounded retry added (20 attempts, 5 ms, EPERM/EBUSY/EACCES). `EEXIST` is
   deliberately *not* retried: for a rename it means the destination is a directory, and it
   is also the code used for "temp name taken", so retrying would leak the temp file.

Plus a fourth, smaller one: `resolveCardImages()` never checked the signal at entry, so a
call cancelled before it started still did workspace reads, fetched images and **wrote to
the store**, then discarded the result. One line at the entry point.

### The false accusation

`tool.spec.ts` was recorded as a fixture defect: "no skill provider registered, so the
description cannot name the contract". Both halves were wrong. `SKILL_BODY_PATH` is a
compile-time constant, so no provider affects it, and the description *does* name the file —
the assertion's `(\S+\.md)` cannot match a path containing a space, and this checkout is
`D:\Deepseek WorkSpace\…`. **The test only ever passed on space-free checkouts.**
I replaced it with a stronger assertion (absolute, exists, regular `.md`, and the three
relative references the sentence promises). Nothing was relaxed.

### The symlink item, decided rather than dodged

Measured the machine's real capability: file symlink EPERM, directory symlink EPERM,
directory **junction** OK, file hardlink OK, junction `realpath` resolves through.

Six containment tests needed a symlink. Each was **split at the capability boundary**:

- The directory-escape halves now run everywhere using a junction — a real reparse point,
  so the same containment check executes. **Four security assertions kept live locally**
  that would otherwise have been deferred.
- The four file-symlink halves keep their real symlink and skip visibly, naming
  `SeCreateSymbolicLinkPrivilege`. A hardlink was rejected as a substitute: it shares an
  inode, so the file is not reached *through* a link, `realpath` cannot see it, and the
  property would not exist — a test that looked green while checking something else.

**The skips are proven not to be a hiding place:** CI runs the same commit with **0
skips** on both platforms and 946 passed. Locally 4 skip; there 0 do.

### Process failure worth recording

Two of my own measurements were wrong because agents were writing while I ran the suite:
one read 902 tests with a transform error, another showed a `TypeError` from a half-written
file. I added a quiet-tree guard (no `src/`/`tests/` write in the last 30–60 s, verified
again after) before trusting any number. **In a shared writable tree a test count is
meaningless without an mtime guard attached to it** — the same conclusion the tilde agent
reached independently.

### Verification

| Command | Result |
| --- | --- |
| `npx tsc -p tsconfig.json` | exit 0 |
| `npx tsc -p tsconfig.client.json` | exit 0 |
| `npx vitest run` (local, quiet tree) | **942 passed / 0 failed / 4 skipped / 946**, exit 0 |
| CI `42154196690` Linux | **946 / 0 / 0** |
| CI `42154196690` Windows | **946 / 0 / 0**, `baseline 15, found 0, new 0` |
| Bundle hash, both CI legs | `e1bf4a82…31456ceb`, `BUILDS IDENTICAL` |

35 evidence artefacts under `evidence/stage-6/`, every fix red-then-green:
`tilde-red-A-without-tilde-fix.txt`, `tilde-red-B-without-rename-retry.txt`,
`abort-entry-red.txt`, `fixtures-d2-mutation-red-raw.txt`,
`timeout-regression-proof.txt`.

### Docs corrected

`tools/classify-failures.mjs` no longer calls the `timeout` cause a slow machine.
`PLATFORM-FAILURES.md`, `FAILURE-ADJUDICATION.md` (R1/C2), `PHASE-5-AUDIT.md` (N3) and
`PHASE-5-FINAL-GATE.md` (C2) are annotated as resolved rather than rewritten; the original
reasoning is kept because it was sound even where its conclusion was wrong.

### Not done

No new tag. `v0.1.0` remains the released version; the stage-6 fixes sit on `main` under
`[Unreleased]` and a 0.1.1 release is the owner's decision.

---
### Session 25 — 2026-11-06 (v0.1.0 released)

**Stage 5 closed. Released `v0.1.0` at `40b8241`, tag and GitHub Release both
published. No force push at any point.**

Release: https://github.com/Xin-zimu/dsh-plugin-visualize/releases/tag/v0.1.0

### The order it was done in, and why each gate was re-checked

The owner set the sequence and it was followed exactly. Three times during the
round a gate could have been satisfied by an *older* result; each time the newer
one was obtained instead.

| Step | What was done | Result |
| --- | --- | --- |
| 1 | `lib/` deleted entirely, rebuilt from source, hashed | `E1BF4A82…456CEB` — reproduced from nothing |
| 2 | N5 committed **alone** | `10b9bea`, 1 file, 5 insertions / 3 deletions, docstring only |
| 3 | Premise corrections committed | `56afff4`, 9 files, 881 insertions |
| 4 | Audit + adjudication committed | `3e5f586`, 4 files |
| 5 | Evidence committed | `44ab279`, 40 files, no screenshots, handoff zip excluded |
| 6 | Full local gates on the candidate | tsc 0/0; 924 / 15 / 0 / 939; failure set identical |
| 7 | CI on `44ab279` | success, `e1bf4a82…`, `windows: baseline 15, found 7, new 0` |
| 8 | **CHANGELOG corrections found → new HEAD** | `40b8241` — and CI was **re-run**, not inherited |
| 9 | CI on `40b8241` | success, same hash, Linux 0 failures, `failsOnBoth: []` |
| 10 | Tag `v0.1.0` + GitHub Release | published, non-draft, non-prerelease |

**Step 8 is the one worth recording.** Preparing the release notes surfaced two
factual errors in `CHANGELOG.md`: `Known issues` still claimed **"No CI"**, and
described all 15 failures as platform behaviour when 2 are fixture defects. Fixing
them changed HEAD, which invalidated the CI result from step 7. Rather than tag
`44ab279` on the strength of that result, or tag `40b8241` on the strength of it,
CI was re-run on the new HEAD and the hash and gate lines re-read from the log.
That is the difference between "CI passed recently" and "CI passed on this
commit".

### The conditional that was never triggered

The owner's stop condition was: if the artefact hash changes, halt and re-check the
build and the browser evidence. It was checked **five** times — after the N5 edit,
after a full `lib/` deletion and rebuild, on the release candidate, from CI's
Ubuntu leg, and from CI's Windows leg. All five: `E1BF4A82B3C808899BA868009CF9DEAD
15F941E6A3614040DB1E73C031456CEB`. The browser evidence from the previous session
therefore still describes the released artefact, and the halt was never needed.

CI also independently confirms the two properties the release rests on:
`BUILDS IDENTICAL: the bundle does not depend on the platform`, and
`failsOnBoth: []`.

### What the release notes say, and what they refuse to hide

The notes carry the three caveats from the adjudication — CI dependence for
symlink containment, the undiagnosed 5,020 ms timeout, and that 12 of the 15
failures sit in modules this release ships — plus both Deferred actions with their
**corrected** reasons. The notes state plainly that the original premise was false
and point at ADR-014 §10 / ADR-015 §10 rather than presenting the deferrals as if
nothing had been learned.

### Not done

- `lib/` is **not** committed. It is gitignored, built by `prepublishOnly`, and
  never committed in this repository's history. AGENTS.md §7 permits committing it
  "only when releasing"; that permission was not used, because `main` is not the
  distribution channel and a stale committed bundle is the exact trap §9 describes.
  The released artefact is reproduced from source at the tag, verified by hash.
- No `npm publish`. The owner authorised a tag and a GitHub Release; publishing to
  a registry is a separate decision and was not requested.

### Next stage, per the owner

Fix the 15 Windows failures first — not more components. Then `@ToAssistant`
runtime verification and the upstream interface request as separate workstreams.

---
### Session 24 — 2026-11-06 (final release gate: GO recommended, not released)

**The three items the owner named are closed.** Report:
`docs/reports/PHASE-5-FINAL-GATE.md`. Adjudication: `docs/testing/FAILURE-ADJUDICATION.md`.
Evidence: `evidence/phase-5-final/`.

**1. N5 fixed, and its bundle impact MEASURED rather than assumed.** The docstring said
`@CopyToClipboard` is refused; it shipped in 4B. Comment-only edit, 5 insertions / 3
deletions, entirely inside the module docstring. `lib/client.js` and `lib/index.js` hashes
are **unchanged** — but that proves nothing alone, since a stale build would look
identical. So a control was run: mutating real code (`MAX_CLIPBOARD_TEXT` 32→33 KiB) moved
the hash to `AAE2F13D…`, and restoring it returned the base hash. The build is live and
only a code change moves the hash. Suite after: 924/15/939, failure set identical.

**2. The browser gate is now PASSED on a real host running THIS build.** The `bsk`
blocker was a stale `~/.bsk/daemon.json` naming a dead pid plus a detached-start refusal.
Cleared the stale state and started the daemon as a managed background job with
`--foreground` — which is what its own error text recommended. No 401 was bypassed and no
browser security setting was lowered.

Identity was proved three ways, because the owner's concern was exactly this:
the isolated `p3web` profile (`DSH_HOME=tmp/dsh-p3`, `:3093`) installs this repo via
`file:`; its installed bundle and the build are both `E1BF4A82…`, 450,559 B (AGENTS.md §9
gate MATCH); and the loaded page carries `data-openui-refused` (fork-only) while carrying
no `@nagi-ovo` (upstream) marker. **The live GUI on `:56091` runs
`@nagi-ovo/dsh-visualize` 0.1.7 — a different package — and was never used as evidence.**

All four gates pass fresh: G0 hash match + 20 cards + no draft-editor crash; G1 31/31;
G2 submitted and echoed; G3 21 paragraphs settled. Product checks on a card drawn *this*
round: 4/4 frames sandboxed; theme tokens genuinely switch (dark `#f9fafb`/`#2c2c2e` ↔
light `#0f1115`/`#fff`); OS clipboard `SENTINEL-BEFORE-COPY` → `release-gate-token`,
equal to the displayed payload; both refusal notices appear on press and auto-expire.

**Two probe errors were mine, and are recorded as such.** The first clipboard attempt left
the sentinel untouched because script `element.click()` is not a trusted gesture — the
product was right to refuse it. The first refusal read was empty because the notice
self-hides after 3200 ms and two CLI round-trips exceed that; reading `RefusedButton`
explained it, and press-and-read in one evaluation passed.

**3. The 15 failures adjudicated, not waved through.** Four criteria stated before being
applied (environmental cause; passes elsewhere by name; guarded behaviour covered by a
passing test; unchanged from baseline). All 15 pass all four → `YES-WITH-NAMED-CAVEATS`.
The strong evidence is the CI run, re-verified with `gh`: `headSha 15814e3`, success, and
the Windows gate printing `baseline 15, found 7, new 0`. The 7 that persist are named.

Three caveats travel with it. **C1:** six symlink-containment tests cannot run on this box
(`EPERM` creating the symlink) — the release depends on CI Windows for that class of
defect. **C2:** one 5,020 ms timeout has no diagnosis; weakest of the fifteen. **C3:** two
of the fifteen are fixture defects, not platform behaviour — `ctx.fs.readText` is a real
API (`dsh-fs/lib/types/index.d.ts:162`) and the mock at `tests/card-images.spec.ts:40-51`
provides `readBytes` instead — so the honest split is **13 platform + 2 fixture**. Also
stated plainly: 12 of the 15 are in modules this release ships, so "out of scope" is not
available as an argument.

**Verdict: GO, with two conditions** — the commit must carry the N5 fix and nothing else in
`src/`, and `lib/client.js` must still hash to `E1BF4A82…456CEB` at tag time, because that
is the bundle measured in the browser and the one the CI comparison is bound to.

**Not done, and deliberately:** no tag, no release, no push. The report produces the
recommendation; the decision is the owner's.

**Reproduce:** `npx tsc -p tsconfig.json`, `npx tsc -p tsconfig.client.json`,
`npx vitest run --reporter=json`, `npx tsdown`, then the browser gates in §9 of the report.

---
### Session 23 — 2026-11-06 (decisions applied: reason corrected, Stage 5 resumed)

**Owner decision:** `@ToAssistant` — do **not** downgrade the safety requirements;
`@OpenUrl` — **C2**, seek an upstream external-open API; **Stage 5 resumes** on its
original scope. Both actions stay Deferred and neither blocks the release.
Governing principle, recorded because it is easy to lose: *接口存在不等于已经具备
安全发布条件* — finding an API does not relax a requirement.

**What the correction actually says.** Three ADRs, plus the README, CHANGELOG,
component catalogue and both earlier reports now state the corrected reason, and
**the original text is preserved and marked in place** rather than rewritten — each
ADR carries an appended amendment section (§10). Neither ADR was promoted to
Accepted. The correction is narrow and worth stating precisely:

- `@OpenUrl`: a mediated open **exists** (`ctx.sidebarRight.openTab('browser',
  {params:{url}})`, documented for plugins, the host's own link gesture), but it is a
  **sidebar tab, not an external browsing context**, and its iframe refusals are
  unobservable — the exact silent failure ADR-014 exists to prevent.
- `@ToAssistant`: submission is **reachable**, and role escalation is **structurally
  impossible** (the host builds `source = {kind:'user', …}` itself). What is missing
  is transcript **attribution** and a **confirmation the card cannot fake**. The owner
  explicitly rejected softening either.

**Stage 5 re-verified at HEAD `63dcd92`** — because the audit was measured at
`8db9598` and had gone stale. Every test and type number reproduces exactly:
924 passed / 15 failed / 0 skipped / 939, counts closing, failure set identical
name-for-name with `onlyInCurrent: []`, all 15 classified, both `tsc` projects clean,
build deterministic (`E1BF4A82…`, 450,559 B). Raw evidence, 28 files:
`evidence/phase-5-rc2/`.

**Two corrections the re-run produced, and one thing it refused to do.**

1. **N4 — a mislabelled build size, copied forward.** `PHASE-5-AUDIT.md §1.1` said
   `lib/client.js` is 251.13 kB. It is **450.56 kB**. 251.13 kB is tsdown's
   `[ESM] 2 files, total` = `index.js` + `index.d.ts`. The same error was in
   `PHASE-4B-REPORT.md:167`. Both corrected. The audit could not catch this itself
   because the adjacent row quotes the *client-bundle* hash — size and hash described
   different files.
2. **§7.2 — a claim in my own brief was wrong.** "No post-baseline commit touched
   product code" is false: `src/client/OpenUICard.tsx` +86 and two test files +142
   landed in `6b26aab`. The claim that holds, and is stronger, is that
   `6b26aab..HEAD` leaves `src/` and `tests/` **byte-identical** by tree hash.
3. **N5 — deliberately not fixed.** `src/client/openui-actions.ts:10-12` still says
   `@CopyToClipboard` is refused; it shipped in 4B. Editing `src/` would change the
   bundle hash that binds the stage-5 browser evidence (§9). Recorded for whoever
   re-runs that evidence.

**The refusal feedback is proved, not assumed.** Re-inserting the two names into
`SUPPORTED_STEPS` turned **6 tests red across 3 files** — including the one reading
the rendered `[data-openui-refused-notice]`. The file was then restored and re-diffed
byte-identical, and the 59 tests pass again. `UNSUPPORTED_STEPS` is still exactly
`['OpenUrl','ToAssistant']`, printed from the module the renderer imports.

**A finding about evidence that outranks the numbers.** The live GUI on
`127.0.0.1:56091` runs `@nagi-ovo/dsh-visualize` **0.1.7**, not this fork: different
package, 118,874 B, and none of this fork's symbols. **Any browser gate run against it
measures upstream's code and must never be filed as evidence about this tree.** The
§9 gate does hold for the isolated `p3web` profile — build and installed copy are both
`E1BF4A82…`, the same hash `C1-acceptance.json` recorded, which is what keeps the
stage-5 browser rows credible.

**Honest grade.** Everything in 4B-2 is **Read** or **Type**; nothing is runtime
"Ran". The browser gates were **NOT VERIFIED**: `probe.mjs --what=smoke` exited **2**
because the `bsk` daemon cannot start (`Job Object does not allow breakaway`,
`os error 5`). Per §10 that is an environment block and was not counted as a product
failure, and the live-GUI 401 was not bypassed. The stage-5 browser rows (4/4 sandbox,
theme tokens, clipboard round-trip, notice before/after press) are **carried forward
hash-matched, not re-measured** — said plainly in the audit rather than folded into the
pass column.

**Boundary.** No product code, no tag, no release. `git diff --quiet -- src` is 0.
Stage 5 is **not** declared releasable: it produces the evidence, and the release
decision is the owner's.

**Reproduce:** `npx tsc -p tsconfig.json`, `npx tsc -p tsconfig.client.json`,
`npx vitest run`, `npx tsdown`, then
`node evidence/lib/failure-set.mjs evidence/phase-5-rc2/vitest.json`.

---
### Session 22 — 2026-11-05 (Stage 4B-2: the two deferrals re-tested)

**Both "host capability unavailable" verdicts were wrong, and the reason matters
more than the verdicts.** ADR-014 and ADR-015 deferred `@OpenUrl` and
`@ToAssistant` on the stated ground that DSH exposes no host-mediated open and
no turn-submit API. Read against the installed host (0.2.1-rc.5) rather than
against the earlier ADRs, both capabilities exist and both are reachable from
this plugin's client bundle. Full report:
`docs/reports/PHASE-4B-2-INVESTIGATION.md`; evidence in `evidence/4b2/`.

**One mechanism explains the whole miss.** `cordis` `get()` returns a
*the caller's* context — `getTraceable(this.ctx, …)` (`cordis/lib/index.js:763-765`)
with the trap at `:128` returning the caller's ctx for the tracker property. So
`ctx.sessions.scope(id)` yields a real session-scope context, and a service called
from it runs addressed to that session. **This repo already relies on that chain**:
`src/client/prompt-bridge.ts` resolves the composer facade through it today and
calls `setDraft`/`focus`/`notify`. It simply never called `submit`.

**`@ToAssistant` — EXTENDABLE, two properties still unmet.** The capability
needs no new host API: `inputActions` (carrying `submit()`) is a *declared
standard prop* on every session-scope slot, and `tool.call.toolview` is one, so
**the card already receives it** — `VisualizeCard.tsx` just never destructures it.
Verified by type with a negative control *and* a mutation: the positive probe
typechecks, an impossible `@ts-expect-error` is satisfied, and a misspelt member
fails with `TS2339 … does not exist on type 'InputActions'` — which is what makes
the first result mean anything rather than an `any`. Role escalation is
**structurally impossible**: the node half builds `source = { kind: "user", … }`
itself (`api-session-controller/lib/index.js:3218-3231`); no wire field carries a role.
That is a stronger guarantee than ADR-015 asked for and should be recorded.

What is genuinely missing is two *concepts*, not two APIs: **attribution**
(`rpcId` is dedupe-only — zero rendering hits, so the turn is indistinguishable
from typing) and a **host-rendered confirmation the card cannot fake** (the
approval panel is host-waterfall driven; `user-approval`'s `request()` throws
outside an open turn). Both need a human decision, not more code.

Also corrected: `InputState.phase` is **useless** as an in-flight guard — a plain
send leaves it `'plain'` for the whole flight (`client.js:5148-5155`, `:5168-5191`).
Use `running`/`pendingSubmissions`, whose echo is appended synchronously.

**`@OpenUrl` — EXTENDABLE, recommend staying refused, for a different reason.**
A documented, host-mediated open exists —
`ctx.sidebarRight.openTab('browser', { params: { url } })`
(`dsh-client-ui-sidebar-browser/README.md:43`) — and the host's *own* link gesture
calls it, with `window.open` only as fallback (`ui-chat/lib/client.js:13284-13287`).
Its parser (`sidebar-browser/lib/client.js:363-407`) is **stricter** than ADR-014
asked: 16 KiB cap before parsing, credentials refused, http(s) only, and the DSH
app's own origin refused. But it opens a **sidebar tab, not a browsing context**,
and an iframe refusal is *invisible* (`sidebar-browser/README.md:107`) — trading a
visible failure (popup blocker) for an unobservable one, which is exactly what
ADR-014 existed to prevent. Shipping it under the current name would repeat
ADR-014 Option B's error in a new costume. Either re-specify it as "show this page
beside the conversation" or request a true upstream `openExternal` plugin API.

**Honest grade: everything above is Read or Type, nothing is Ran-at-runtime.**
No card was driven in a browser this session. The one probe that would close it —
log `typeof inputActions.submit` from a card click — is named in the report and
was deliberately left for the next round.

**Boundary respected.** No product code, test, ADR or tag. `git diff --stat` empty;
the only addition is `evidence/4b2/` plus the report. Stage 5 was not resumed.

**Two method notes worth keeping.** A Lead `grep` returned zero `inputActions`
hits in `node_modules` because **ripgrep honours `.gitignore`** — `Select-String`
found it; the finding survived, the method that contradicted it did not. And the
type probe was only trusted after two controls, per the rule that a guard never
seen to go red is a guess.

---
### Session 21 — 2026-11-05 (Stage 5: cross-platform evidence)

**The audit's biggest claim was an argument, not a measurement, and this session
fixed that.** The previous report said the fifteen Windows failures were
"platform-shaped rather than product-shaped" — read from their error messages.
Three of them could plausibly have been product bugs: a `~` that is never expanded
is a real path-handling question, and a missing `readText` in a fixture is a
contract question. ChatGPT called this out and was right to.

Now measured:

```
WSL Ubuntu 24.04   node 22.23.4   939 passed /  0 failed / 0 skipped / 939
CI ubuntu-latest                  939 passed /  0 failed / 0 skipped / 939
CI windows-latest                 932 passed /  7 failed / 0 skipped / 939
this box           node 24.22.1   924 passed / 15 failed / 0 skipped / 939
```

**`failsOnBoth: []`** — not one test fails on both platforms. Zero skips anywhere,
on either platform, which is load-bearing: nothing was excluded to get green.

**The finding worth keeping.** The CI Windows runner reports 7 of the local 15 —
and the eight that pass there are exactly the ones needing a working symlink or a
POSIX-shaped path, **including six of the eight symlink containment tests that
`PLATFORM-FAILURES.md` had recorded as unprovable on Windows.** GitHub's runner can
create symlinks; a stock box cannot. So the containment check is no longer
"present and readable" on Windows — it executes and passes there.

That is a stronger claim than the audit made, and it came from running the tests
instead of reasoning about them. It also invalidated one of the previous
recommendations: `skipIf(platform === 'win32')` on the symlink tests would now
*remove* real coverage. That recommendation is withdrawn and the reason is recorded,
because a skip added to hide a failure keeps hiding whatever comes after it.

**Build reproducibility, as a side effect.** The POSIX build of `lib/client.js` is
`e1bf4a82…` and of `lib/index.js` `8d4bc669…` — byte-identical to the Windows
build. The bundle does not depend on the machine that produced it, and CI now
asserts that every run.

**Three CI design errors, all mine, each fixed:** the first gate compared Linux
against the Windows baseline so a clean platform failed for being clean; the
Windows leg died before reaching its gate because `vitest` exits non-zero on the
known failures, so the exit code was doing the gating; and the third version failed
when baseline failures *started passing*, which punished a better runner. Only a
NEW failure fails the gate now.

The gate is deliberately **stricter** than an exit code, not looser: a skip fails,
a new failure fails, and on Linux any failure at all fails. The Test step is the one
place a red result continues, guarded by a check that the JSON report exists, and
the gate is a separate named step so it cannot be overlooked.

**Verified:** CI run `42003251408` — all three jobs success; local gates PASSED on
both the Windows and POSIX reports; POSIX run in WSL against a fresh clone with
`--frozen-lockfile`; `tsc` 0 errors on both projects on both platforms.

### Session 20 — 2026-11-05 (Stage 5: release-candidate audit)

**Verdict: releasable. No blocker. Three non-blockers, five deferred.**
Report: `docs/reports/PHASE-5-AUDIT.md`.

Two findings matter more than the rest, and neither came from the test suite.

**A verification tool was lying.** The previous round reported `910 + 15 ≠ 927`.
The missing two were not arithmetic: `tmp/diff.mjs` compared the tree against a
hard-coded `tmp/full-after.json` captured hours earlier, so every later run printed
`IDENTICAL: true` regardless of what had changed. Two genuine failures introduced
by stage 4B sat behind it. Both scripts now take their input as an argument, and
`evidence/lib/failure-set.mjs` additionally asserts that `passed + failed + pending
+ todo` equals the total — the check that would have caught it, because a
disappearing test is a silent removal of a check and otherwise looks like an
improvement.

**A refused action was silently inert.** A Button whose action is `@OpenUrl` or
`@ToAssistant` rendered identically to a working one and did nothing when pressed;
the refusal existed only in a diagnostics array no user can read. A control that
looks live and is not is worse than one that explains itself. It now names the
declined step on press. Reproduced in a real browser before the fix
(`noticeBeforePress: false`, `noticeAfterPress: true`,
`"@OpenUrl is not available in this build"`), and three mutations confirm the
tests guard it.

**Capability drift now has a gate.** `tests/capability-consistency.spec.ts` reads
the same tables the code reads — `COMPONENTS`, `ACTION_STEPS`, `SUPPORTED_STEPS`,
`UNSUPPORTED_STEPS`, `languageReference()` — and fails when the catalogue or the
skill text disagrees. It also asserts every declared action is in exactly one of
the two sets, because a name in neither validates and then refuses as
`action.unknown`, which reads like a bug rather than a decision. Three mutations
turn it red. `tools/capability-matrix.mjs` renders the matrix from the same tables
so the published table cannot be hand-written.

**Documents were four phases stale.** The README said "Stage 4A-3 of 5" and "30 of
48" components, and listed `Popover` as missing; the CHANGELOG ended at stage 1.2
and claimed 8/48. Both now describe the release candidate. `CHANGELOG.md` gained a
*Refused, deliberately* section so a reader meets the two refusals as decisions
rather than as omissions.

**The fifteen failures are documented, not argued away.**
`docs/testing/PLATFORM-FAILURES.md` gives each one a root cause taken from its own
message: 6 × `EPERM` creating symlinks, 4 × a literal `~` in a path, 1 × a
drive-qualified path joined onto another, 1 × `EPERM` renaming over an open file,
1 × a fixture mock missing `ctx.fs.readText`, 1 × a 5 s timeout, 1 × a description
fixture with no provider. `tools/classify-failures.mjs` exits non-zero on any
unclassified failure, so a new one cannot join the baseline by being ignored.

The honest limits of that document are stated inside it. **Six of the fifteen are
the tests that prove a symlink escape is refused**, and they cannot run on Windows,
so that containment is unproven here. And **there is no CI**, so no POSIX run
exists in `evidence/` — "these pass elsewhere" is read from the messages, not
measured.

**Verified:** `tsc` 0 errors on both projects; `vitest run` **924 passed / 15
failed / 939**, counts close, failure set identical to the baseline name by name;
build clean; bundle hash `E1BF4A82…` matching the installed copy before measuring
(§9); real-host acceptance recorded in `evidence/phase-5/C1-acceptance.json` —
48/48 components, 4/4 HTML frames sandboxed, dark and light tokens demonstrably
different, the refused-action notice working, and the copy control showing its
payload in full.

**Not verified, and recorded as such:** the browser reload-and-restore round trip
(three attempts, each losing the CDP session to a settling page; persistence is
recorded and the restore path has unit tests, but the round trip is NOT VERIFIED),
and the contents drawn inside the HTML frames.

### Session 19 — 2026-11-05 (Stage 4B: one action shipped, two deferred)

**Stage 4B closed.** `@CopyToClipboard` is out of `UNSUPPORTED_STEPS` and shipped.
`@OpenUrl` and `@ToAssistant` are Deferred — not rejected, not forgotten, and not
implemented through a side door.

**The stage's most useful output is a distinction, not a feature.** The first draft
of the threat model asked "can the host do this?" and treated the answer as a
boolean. Wrong: there are three states. A capability can be *not available* (no
interface, nothing reachable), *available but unauthorised* (something reachable
could act and the program has no permission), or *available and authorised* (a
host interface mediates and attributes it). Collapsing that is how a missing check
gets mistaken for a missing API.

`@CopyToClipboard` is the middle state, and that is the whole difficulty:
`navigator.clipboard.writeText` is one call away and `Code`'s copy button already
uses it. **A callable browser API is evidence of possibility, never of permission.**
Where the API is present, this stage's conditions are the only thing between the
program and the effect.

**What shipped, and the properties that make it acceptable.** The control shows the
exact text before the press; `copyPayloadOf` reads the evaluated descriptor once and
`CopyButton` uses that one string for both the `<pre>` and the write, so the shown
and copied values cannot diverge by construction. A press is the only trigger —
every `runAction` call site is an `onClick` or `onKeyDown`. Composition inside
`Action([...])` is refused until user activation in a composed run is measured.
32 KiB cap, refused rather than truncated. No `execCommand` fallback: it would turn
a permission refusal into an invisible success.

**Two things were fixed on the way**, both older than this stage:

1. `Code`'s copy button showed "Copied" **unconditionally**, so a denied permission
   told the reader the clipboard held their code when it did not. It now reports all
   three outcomes. This was a shipped defect; writing down what the behaviour should
   be is what exposed it.
2. The new control uses `BUTTON_KINDS.outline`, not `primary`. Primary is 4.23:1 in
   the light scheme, below AA — a recorded and accepted defect of the existing
   Button palette. Changing it is not this stage's to do, but a new control must not
   inherit it. Measured after the switch: 17.45:1 dark, 18.9:1 light.

**Why the two deferrals are honest rather than convenient.** `@OpenUrl` has no
host-mediated open; a card can reach `window.open`, which is the card deciding to
navigate (ADR-004 forbids it) and which a popup blocker swallows silently, so the
program believes it navigated. `@ToAssistant` has no submit interface, and reaching
the composer through the DOM would produce a message the host could not attribute
or refuse. Both stay refused, and a test asserts it.

`ADR-015`'s first draft required proving a message could not have come from
rendered untrusted content. **That was withdrawn**: the evaluator tracks no
provenance, so it would have been a claim the code could not enforce. Replaced by a
position needing none — all card content is untrusted, without exception — plus a
host-rendered confirmation and a user-turn-only delivery path.

**Verified:** `tsc` 0 errors on both projects; `vitest run` **910 passed / 15
failed / 927**, failure set **identical name by name** to the published baseline;
build clean; bundle hash `E2B0ED7B…` matching the installed copy before any
measurement (§9); browser acceptance reading the **operating system's clipboard**
after one real CDP click — `SENTINEL-FINAL` → `sk-live-SHOULD-NOT-LEAK`, equal to
the text on the card, with the status line reading `Copied`.

jsdom cannot make that measurement: a mocked `navigator.clipboard` proves only that
a mock was called. Seven mutations proved the guards can fail (copy-on-mount turned
6 tests red; truncating the shown payload, 3; allowing composition, 2; the rest 1
each).

**Harness lessons, recorded because each cost time:** `clipboard.readText()` cannot
be awaited without a user activation — the promise never settles and the CDP call
hits its 20 s bound, wedging the session; reading the OS clipboard is simpler and
stronger. `sync → observe → act` fails because `observe` consumes the context the
action needs; the order is **observe → sync → act**. A session fixes its control
policy at creation, so `--policy strict` cannot be added later.

### Session 18 — 2026-11-05 (Stage 4A-5 closed: 48 / 48)

**Stage 4A-5 is closed.** The last fourteen components are implemented,
`tests/openui-inventory.spec.tsx` reports **48 / 48**, and the browser acceptance
run passed **45 / 45** on an isolated profile with the §9 bundle hash checked
before any measurement.

Two decisions were written before the code, both by request:

- **ADR-011** — SVG arguments are validated by their own grammar and
  re-serialised; `transform`, `d` and `points` are tokenised, paint is a closed
  list, and `url(` is refused. The ADR deliberately does **not** claim that an
  SVG string could execute JavaScript here, because in this backend it could not:
  the renderer builds props from an explicit argument table and nothing parses
  markup. Over-claiming a security conclusion is as harmful as missing one.
- **ADR-012** — `Popover` is inline and non-modal: absolute positioning inside
  the card, no portal, no focus trap, placement clamped to the card's measured
  rectangle. `position: absolute` is not containment by itself, which is why the
  clamp is computed and the result is measured rather than asserted.

**Two product defects, both found only by the browser run.**

1. **The validator rejected the documented `Action([...])` form.** `ACTION_STEPS`
   declares `Action`, the catalogue teaches `Action([...])`, and
   `openui-actions.ts` implements it — but `checkNames` only consulted the action
   table for names starting with `@`, so the sigil-less form became
   `VZO002 unknown component "Action"`. The prompt was teaching a form the
   validator refused: a model that obeyed was rejected and one that silently
   "corrected" the program succeeded. Fixed in `src/backends/openui/renderer.ts`;
   the existing test that asserted rejection was **reversed** to assert
   acceptance, with the change of position recorded in the test itself.
2. **`Celebration` never fired for a bare-variable condition.** `Celebration($done)`
   — the form the skill text shows — passes a binding marker, not a boolean, and
   `boolOf` on that object is `Boolean({...})`, i.e. constant true. The component
   therefore never saw a false→true transition and never drew a burst, while
   `$done` demonstrably became true in the persisted state. Every existing test
   used `Celebration($n == 1)`, whose argument is already a boolean, so none of
   them touched this path. Fixed with `fieldOf(props[0]).current`.

Both fixes are mutation-verified: restoring the old form turns exactly the new
regression test red, and nothing else.

**Five probe defects were found and fixed, and they are recorded because telling
them apart from product defects is the point.** A ten-line program (the language
allows one statement per line); a double `JSON.parse` of an already-parsed
`evaluate` result; reading the DOM in the same page script that clicked it, before
React had rendered; counting `[data-openui-popover]` as if triggers were panels;
and pressing Finish on a card whose persisted `$done` was already true, where no
burst is the correct answer. Each of those once looked like a failing component.

The step-per-invocation probes (`probe-p4-step.mjs`,
`probe-celebration-step.mjs`) exist for exactly this reason: a single chained
script cannot distinguish "the product is wrong" from "the probe read too early".

**Verified:** `tsc` 0 errors on both projects; `vitest run` 889 passed / 15
failed / 904, failure set **identical name by name** to
`evidence/publish/test-before-publish.txt`; build `lib/client.js` 438.21 kB,
`lib/index.js` 240.42 kB; bundle hash `A0E744D1…` matching the installed copy;
browser acceptance **45 / 45**; inventory **48 / 48**.

Also recorded: the bsk harness recycles an idle session after five minutes and
closes the Agent Window with it, and a freshly created agent tab is `about:blank`
where the extension's content script is not injected, so `cooperate sync` fails
with "Receiving end does not exist" until the tab navigates. Both cost real time
this session and are now written down.

### Session 17 — 2026-11-04 (unpublished history cleaned of leaked credentials)

**A mistake of mine, corrected. Session 15 claimed to have fixed a leak and had
only cleaned the working tree.** I wrote "fixed with those existing tools" and
made a follow-up commit (`02ddc65`) — which removes the value from the *files* but
leaves it in the *commit objects*. The owner caught it. "The final file is
redacted" is not "the history is redacted", and I had said the stronger thing.

## What was actually true

| Surface | Session token | Windows username |
| --- | --- | --- |
| Unpublished commits (`origin/main..main`) | **in `b73bd6a` only** | **in `b73bd6a` only** |
| Published history (`origin/main`, 18 commits) | none | **in `b2e0064`, `f65cf41`** |
| Working tree | none | none tracked; 11 files under gitignored `tmp/` |
| Object database | 2 blobs | 1 blob |
| The handoff ZIP and the scratch extraction | none | — |

Two facts made this fixable without rewriting published history. The leak was
confined to **one commit**, and that commit had **not been pushed** — `origin/main`
was still `74ca8f7`. The username in published history is a separate, older
matter: `74ca8f7` ("docs: name the leaked value without reproducing it") already
reworded exactly that sentence, and it is published. Per the owner's instruction,
published history was **not** rewritten.

## The rewrite, and why it is safe to call lossless

Only the seven unpublished commits were rebuilt, on top of the published
`74ca8f7`:

1. the four already-clean commits (`3fc839a`, `b87bf19`, `f1fb248`, `489acac`)
   replayed with author, committer and both timestamps preserved;
2. the leaked commit rebuilt **from the redacted tree** rather than replayed, so
   the five sensitive files were never staged at all;
3. `300e805` (4A-4) cherry-picked on top — verified beforehand that it does not
   touch any of the five files.

Result: **seven commits became six** — the separate "fix" commit became
unnecessary once the original commit no longer contained the defect, so it was
folded in rather than kept as a tombstone for a value that no longer exists in
history.

**The tree hash proves nothing was lost:** `4d5089777e77dc543022509445a329e28f0abcbd`
before and after. Content is byte-identical; only the commit objects moved.

Then the old objects were made unreachable and destroyed: work branches deleted,
`git reflog expire --expire=now --all`, `git gc --prune=now`. The two known
leaked blob ids now return "GONE" from `git cat-file`, and an exhaustive scan of
all 731 blobs in the object database finds the token **nowhere**.

A full recovery bundle was written to a scratch directory **outside the repository** (the checkout's parent, named `.pre-cleanup-backup`)
**before** the rewrite, outside the repository, so a botched history edit would
have been recoverable.

**That backup then became a copy of the leak, and had to be destroyed.** A
`git bundle --all` written before the rewrite carries every commit that existed
then, including `b73bd6a` with the token in it. Left in place it would have been
the one file on disk still holding the credential — outside the repository, so no
repo scan would ever have found it. The pre-cleanup bundle was deleted and
replaced with `post-cleanup.bundle` (the rewritten history, verified free of the
token by cloning it and walking every commit). The scratch extraction of the
handoff ZIP was removed for the same reason: not because it was dirty, but
because a second copy of history is a second place to keep a secret.

## What remains, and what was deliberately not done

- **The published username reference stays.** It is in two published commits,
  already reworded by `74ca8f7`, and rewriting an already-public history is the
  thing the owner told me not to do. It is a Windows account name, not a
  credential, and it is now unreachable from any current file.
- **The leaked session token is inert.** It was minted by this session's own DSH
  server on `:3093`, that process was stopped at close-out, and port 3093 now
  refuses connections. A DSH token is scoped to the process that issued it. I
  confirmed the port is dead rather than assuming it. **No rotation is needed**,
  but the token should still never be reused in a document — which is why the
  history rewrite happened rather than relying on inertness.
- **`tmp/` still contains the username** in 11 machine-local files (server logs,
  session caches). They are gitignored, were never committed, and never will be;
  they are the profile's own state rather than repository content.

## The rule this earns

`AGENTS.md` §5 says evidence, not claims — and I broke it in the *other*
direction: I had the evidence (a redacted working tree) and reported the claim
(a redacted history) it did not support. The check that would have caught it is
one command: `git grep <secret> $(git rev-list origin/main..main)` — search the
**commits**, not the files. `session-log.md` §traps now carries it.

**State after cleanup:** `main` = `9fd22d4`, tree `4d50897…` (identical),
`origin/main` still `74ca8f7` and unpushed, working tree clean, 821/15/836,
differential 31/31, inventory 34/48, all evidence verdicts unchanged.
### Session 16 — 2026-11-04 (4A-3 merged, 4A-4 built and accepted)

**The 4A-3 acceptance branch was merged, fast-forward only.** `main` went
`74ca8f7` → `02ddc65` with five commits preserved, none squashed. Before merging
I ran the final diff audit and it found two leaks the repository already had rules
against: a live DSH session token in the V1/V2 evidence JSON, and the local
username in the Windows transcript. `evidence/lib/probe.mjs` has redacted
`token=…` since long before this batch, and `evidence/lib/redact.mjs` exists
precisely for transcripts like that one. Both were fixed with those existing
tools rather than new ones, the probes now record the redacted form so the leak
cannot return on a re-run, and the fix was its own commit (`02ddc65`) so the
accepted evidence commit stays readable. The username appears in **zero** tracked
files on `main` — a previous session purged it — so this would have reintroduced
it.

**O1 was closed first, because the owner asked for it and it is cheap.**
`tests/openui-validate-gate.spec.ts` runs fixtures through
`openuiBackend().validate()`, the same entry the tool path uses, and asserts both
directions: the documented bare `@Set` form is accepted, and `Action([...])` is
rejected with `VZO002` exactly as the live host rejects it. Proven able to fail
by stubbing the error list to empty — two tests went red, then green again.

**4A-4 decided its two security questions before writing a renderer.** This is
the part of the batch that mattered, and both decisions came from an existing
precedent rather than an improvised rule:

- **ADR-009 (`Image`).** `src/images.ts` was the obvious thing to reuse and
  cannot be: it resolves images node-side at execute time for a **sandboxed
  iframe**, while the OpenUI card mounts in the **host document** and its
  renderer is a pure function with no execute step. So the policy is ADR-008's
  shape — positive closed allowlist, `new URL` rather than a regex, refusal
  rendered as visible text. The ADR states plainly what it does *not* protect
  against: a remote `https:` host still receives a request from the reader's
  machine, and that is inherent to an `<img>`.
- **ADR-010 (`Chart`).** Not a Chart.js clone, because an options object would
  put arbitrary JavaScript configuration inside a language whose security
  argument is that it is closed. Rows in, countable SVG out; invalid data draws
  a stated refusal; a non-finite value is a **gap counted in a notice**, never a
  coerced zero. Animation and tooltips are recorded as out of scope so a later
  batch adds them as a decision.

**The browser run was largely uneventful, which is the point of the harness.**
`§9` caught a stale bundle for the **second consecutive batch** — the profile
held the 4A-3 build while the tree had moved to `62AD5817…` — and it was fixed
before a single measurement. C1 then counted structure in the host DOM: Table
1/2/3/6, two charts with 3 bar marks and 2 line paths plus a legend, three icons,
and **exactly one `<img>`**, with the `javascript:` source producing a refusal
notice and zero image elements. V3 measured 25 text samples per scheme across
chart axis, legend and table cells — the new 11px class that D22 was about — at
5.8:1 light and 12.11:1 dark.

**Four mutations, all restored.** Image accepting every scheme (2 red), a chart
coercing gaps to zero (2 red), Table not padding a short row (1 red), and the
validate gate stubbed (2 red). A guard that has not been seen to fail is a guess.

**Three self-inflicted probe errors, none in the product** — the same lesson as
last session, recorded because it keeps recurring: a `\.join` with a literal
newline, an escaped quote inside a single-quoted page expression, and a
`getComputedStyle().color` assertion that assumed `rgb()` when the value was
perfectly resolved in another notation. Each looked like a defect until the DOM
or the file was read.

**Numbers.** Typecheck clean; **821 / 15 / 836** on Windows with the failing
**set** identical name by name to the baseline (**zero added, zero removed**);
build PASS; differential **31/31** byte-identical; inventory **34 / 48** with
Media and data complete. The new spec is 21/21, the validate gate 6/6.

**4A-4 is ACCEPTED.** 14 components remain, all in 4A-5.
### Session 15 — 2026-11-04 (4A-3 browser acceptance)

**The handoff ZIP was v3, not v1 — checked before touching anything.** The
archive `dsh-plugin-visualize-4a3-handoff-v3.zip` (7 487 610 bytes) carried a
full tree *and* a `4a3-close/` folder with four patches and an incremental
bundle. Its entries were listed and extracted to
a scratch directory outside the repository — so nothing could overwrite the
working tree.

**The four commits were genuinely absent, and the bundle proved it.** Before the
restore `git cat-file -t` returned absent for all four hashes, `main` was at
`74ca8f7` (18 commits), and the bundle's declared prerequisite was exactly
`74ca8f768b05c24c2f375f8e3c249c8d8c346373`. `git bundle verify` reported
"okay". After fetching, the tree hash was **`ad54c26…`**, matching the published
value, and the count went 18 → 22. Work happened on a new branch
`stage-4a-3/browser-acceptance` cut from `stage-4a-3/cloud-close`; `main` was
not moved, no history was rewritten, nothing was force-pushed.

**§9 caught a stale bundle before a single measurement was taken.** The profile
held a 354 465-byte `client.js` against a 375 564-byte build — the N-1 bundle,
still hard-linked after pnpm reported "already up to date" for the `file:`
dependency. Removing the profile's plugin directory and reinstalling brought both
halves to `4D071A86…`. Measuring first would have reported a correct build as a
broken one, which is the exact trap §9 exists for.

**V1 and V2 — the two risks the cloud could not close — both PASS.** A synthetic
`CompositionEvent` proves nothing because it never puts the browser into
composition mode, so V1 was driven through `Input.imeSetComposition` over CDP and
*verified* real by requiring `isComposing === true` on the events the page
received: 7 composition events and 5 such input events. The pre-edit survived
intact (`startn → startni → startnih → startnihao`), the caret advanced
5→6→7→8→10 without a jump, focus never left, the node was never replaced, and the
commit `你好` reached `$state`. V2 started a real countdown and typed six
characters across 8 ticks (`01:00` → `00:53`): all six landed in order, focus and
node identity held, caret 1→6.

**V3 measured rather than eyeballed.** Both schemes were entered through the
host's own **Settings → 通用设置 → 外观** control, never by setting
`data-ds-dark-theme`. 21 bridged variables per card, every one declared on the
card root and every one naming a host token that resolves; minimum text contrast
**5.8:1 light / 12.11:1 dark**. No horizontal overflow, no zero-height control.

**V5 and the eleven-component card.** A typed value survived a real page reload
*and* reopening the conversation from history, with the program default being
`start` — persisted state is the only explanation. Separately, one card drew
**all eleven** components, counted by structure in the host DOM rather than by
"the text is somewhere in the markup" (`AGENTS.md` §6).

**Windows numbers, stated honestly.** 794 passed / 15 failed / 809. The 15 are
the documented pre-existing baseline and were compared **name by name** against
`evidence/publish/test-before-publish.txt`: zero added, zero removed. The batch's
own spec is 43/43. The Linux 809/809 is unchanged and is not claimed to have been
reproduced on Windows — 14 of the 15 are Windows-only environment faults (symlink
privilege, path joining), and they are not product regressions.

**One observation, recorded not fixed (O1).** The unit spec calls
`renderProgram` directly and so skips the backend's name check: it accepts
`Action([@Set($v, 1)])` where the live path correctly returns
`VZO002 unknown component "Action"` (verified against the real validator). The
documented form is a bare `@Set($v, value)` step, so a model following the skill
text never writes the rejected shape. A test-fidelity gap, not a live defect, and
closing it is a test-only edit for the 4A-4 batch rather than something to smuggle
into an acceptance run.

**Five dead ends, all in the probe and none in the product** — recorded because
they are all the same mistake: reporting a product failure from a broken
measurement. A synthetic composition event cannot enter composition mode; a
`.join` written with a literal newline is a syntax error; `cdp.mjs`'s
`evaluate` already parses JSON so parsing twice throws; a synthetic `Enter` does
not submit on this host build (the send control was used); and the timer renders
`mm:ss` in `[role=timer]`, not bare digits. Each looked like a defect until the
DOM or the source was read. §10 applied to my own runs.

**4A-3 is ACCEPTED.** `STAGE.md`, `docs/reports/PHASE-4A-3-REPORT.md` and
`evidence/phase-4a-3/MANIFEST.json` were updated from the measurements, not from
the plan. 30 of 48 components render; 18 remain in 4A-4 and 4A-5.

### Session 14 — 2026-11-04

**Rebuilt the baseline on Linux, then closed what that exposed.** The session
started from the checkpoint `74ca8f7` on a machine with no DSH host, so the
first job was to find out which of the "15 known failures" were the product and
which were the Windows test rig. Answer: **14 of 15 were the rig** — seven
`EPERM` on symlink/rename, five from `D:/work/...\~\AppData\...` path joining,
one a `ctx.fs.readText` stub branch, one a cascade timeout, one a description
assertion. The fifteenth, `card-images.spec.ts`, was a real fault (D24) that had
never executed on either platform.

**Three defects, none in product code.** D23: `tsdown` needs `unrun` as an
optional peer that pnpm never installed, so `install && build` failed on any
clean machine while working on the one where it had been added by hand — declared
in `chore(build)` instead. D24: the meta-size assertion measured the host's temp
path and had never run; replaced with a ratio against the figure, validated by
re-introducing the leak (205 772 vs 4 096). D25: the first `Timer` cleanup test
passed for the wrong reason — a leaked interval writes into a store a reload has
already replaced — so cleanup is now asserted by counting pending timers.

**Six Timer cases added**, because `Timer` is the only control in this batch
that writes without a gesture, and the old `Timer: Start decrements…` asserted no
decrement at all. Two limits recorded rather than papered over: a value-based
cleanup test cannot see a leak (D25), and `Math.max(0, remaining - 1)` inside the
tick is unreachable from a mounted timer, so deleting it leaves the file green.

**What was deliberately not done.** No browser run — there is no host here, and
`AGENTS.md` §5 does not allow a unit pass to stand in for one. The two risks that
need a live document (IME composition, a ticking Timer beside a focused input)
are in `MANIFEST.json` → `notVerified` with steps, not in the pass set. The
`source` redundancy in the persisted meta is recorded in §6 rather than removed:
234 bytes a card is not worth a persisted-shape change without an ADR.

### Session 13 — 2026-11-03/04

**Committed the backlog, then closed 4A-2.** The session opened on a dirty tree:
three accepted phases sat uncommitted on top of `9b46cec`. They were verified
against a clean export by an independent audit — 683 / 15 / 698, `tsc` clean,
differential 31/31, `src/backends/` untouched — and committed as `5d2a3e9` before
any feature work. One commit rather than three, because stage 3 and 4A-1 both
rewrite `OpenUICard.tsx` and a split would leave intermediate commits that fail
`tsc`.

Two documentation defects the audit found were fixed rather than carried:
`PHASE-4A-1-REPORT.md` quoted 675 / 15 (a mid-phase run) where the final figure
is 683 / 15, and `session-log.md` gave a line count for `openui-state.ts` that
did not match the file.

**The batch itself: seven text components, and one security decision.** `Link` is
the first component whose output a reader can activate, and the card is mounted
in the host origin, so a `javascript:` href would execute there. ADR-008 was
written *before* the renderer: a positive allowlist of absolute `http:`/`https:`
URLs, **parsed with `new URL` rather than pattern-matched**, everything else
degrading to visible plain text. Upstream's regex admits protocol-relative
`//host/x`, `mailto:`, `tel:`, `/path` and `#anchor`; the fork refuses all five,
so its allowlist is a strict subset — stricter, and recorded rather than quiet.

**Three defects, none found by a unit test.**

D20 is the one worth remembering. A screenshot seemed to show a bullet *and* a
check before one nested item. Rather than trust the picture, the DOM was read: the
card had **five** `role="listitem"` elements for a four-item program. The walker
drew a nested `ListItem` into a complete row, then `List` wrapped it in a second
one. All 62 assertions passed while the live card was wrong, because they asked
whether the expected text appeared rather than how many rows were drawn. Fixed by
handing the raw descriptor to the renderer; the spec now asserts row counts.

D21 was caught before it shipped, which is the point: `--font-mono` is declared
in `src/frame-css.ts` and does **not** exist in the host document. Bridging to it
would have been D17/D18 a fourth time. Measuring the candidates first took one
probe and produced a real token (`--dsw-font-markdown-code-font-family`).

D22: three colours failed AA in the light scheme — `Link` at 4.23:1 because
`--primary` is a surface fill, and the 11px supporting text at 3.71:1 because it
inherited the tertiary tier. Both now clear AA in both schemes. `Caption`'s tier
was deliberately left alone: it is a browser-verified 4A-1 component and a later
batch does not get to restyle it silently.

**A harness gap, fixed rather than worked around.** `evaluate()` did not retry
the transient `observation_changed` that `step()` already retried, so one repaint
could fail an entire run. That is the documented policy implemented in only one
of two places. `parity.mjs` still exits 0.

**Cost, recorded as infra-1 asked:** 14 small named scripts against 4A-1's 41; 2
subprocess calls per prompt against ~1 760; 6 failed retries, each with a stated
cause. The harness did not make the verification smaller — three defects still
had to be found by measuring — it made the failures cheaper to attribute.


**infra-1: the browser harness, done as its own task before 4A-2.** The owner's
framing was the right one — the problem was never "too many tests", it was that a
dead host got debugged by trial and error instead of being diagnosed.

The concreteness matters. 4A-1 wrote 41 scripts; 6 produced accepted evidence. The
other 35 were attempts to make *something* render while the host was refusing to
load its own session log. Every one was written, run and read — that is where the
budget went, not on verification.

**Four gates, ordered cheapest-first.** G0 environment, G1 input, G2 submit, G3
render. The ordering is not cosmetic: **evaluating against an `about:blank` tab
does not fail, it hangs.** That is exactly what happened on the first run of the
new probe — a 20-second check became a three-minute backgrounded job. Two fixes
came out of it, and both are the kind of thing only an honest first run finds:

1. every `bsk` subprocess is now time-bounded (`BSK_CALL_TIMEOUT_MS`, default
   20 s) — a hanging call is a harness defect, not a fact about the product;
2. G0 answers "is a page loaded?" with `tab list`, which needs no cooperation
   context, *before* dispatching anything at the page.

After that, the same case reports in **0.3 s** with the exact reason and exit 2.

**Exit 2 is the real deliverable.** "The component is broken" and "the host
cannot load its session" must never land in the same column of a phase report, so
`BLOCKED` is a distinct exit code and product measurements refuse to run without
a fresh smoke stamp (45 min TTL, same session). Verified all three ways: no stamp
→ 2, wrong session → 2, unknown mode → 3.

**The character-typing question, answered in code.** The owner asked why the
script typed one character at a time. The honest answer is that it should not
have: it was written to route around the CLI/extension protocol skew *before* the
skew was fixed, cost ~1 760 subprocess calls and seven minutes for 876
characters, and was unnecessary the moment `fill` worked. `parity.mjs` now asserts
the loop does not come back, and `AGENTS.md` §10 says why.

**Parity was checked, not assumed** — the owner's condition for consolidating.
`evidence/lib/parity.mjs` reads each of the four historical copies, extracts
exported names and issued `bsk` subcommands, and fails on anything unexplained. It
immediately earned its keep: it caught that phase-1's `step` was a public export I
had made private, so `step` is exported again. The single remaining absence is
`type`, recorded in `DROPPED` with its reason.

**Old copies are history, not a library.** They are unedited — rewriting them
would falsify the evidence they belong to — and each folder gained a
`HISTORICAL.md` pointing at the canonical helper.

**Verified before writing any of this down:** parity exit 0; smoke exit 0 in
11.6 s; `card` and `tokens` exit 0 reusing the existing 4A-1 card (0 unresolved
variables, 0 dangling host tokens); `theme --want=dark` matches the 4A-1 record
and restores light; `npx vitest run` = **683 / 15** with a byte-identical failure
set. **No product file was modified** — the newest `src/` and `tests/` timestamps
are still 01:55–02:01, hours before the 23:2x refactor.

**Deliberately not claimed:** the "1/5 cost" estimate. The measured facts are
recorded (0.3 s to detect, 11.6 s to pass, 2 subprocess calls per prompt) and
4A-2 must record the same five metrics so the comparison is data rather than an
assertion.

**4A-1's verdicts are unchanged.** 8 of 9 gate items pass; **A9 stays NOT
VERIFIED**. A tooling refactor does not get to move a finding.

### Session 11 — 2026-11-03

4A-1 closed as **PASS**, and the three defects it found are worth more than the
four renderers.

**What the browser caught that no test could.** `--viz-series-4` was bridged to
`--dsw-static-purple-500`, and `--font-sans` to `--dsh-font-family-text-default`.
**Neither token exists in the DSH host.** Both had fallbacks, so the card painted
correctly and looked entirely right — while two declarations pointed at nothing.
That is D6/D7 again, five files and two stages later. The host publishes 509
custom properties; neither of those is among them.

The fix for series 4 is the interesting one: the host publishes **no purple at
all**. Its static scale is deepseek, blue, amber, green and red. So the honest
resolution was not "find the right name" but "this slot has no host token", and
it is now declared directly as a `light-dark()` pair with a comment saying why,
rather than naming something plausible. I first wrote `--dsw-static-violet-500`
into the table as the fix — which is the same mistake again — caught it by
checking the scan before moving on.

**The inventory probe was itself a copy.** `evidence/phase-3/component-inventory.mjs`
mirrored the renderer's table as a written-out literal, so after the four
renderers landed it still printed "8 / 48". The batch's own premise was that
batches must be derived from the real tables; the tool built to enforce that was
remembering. The renderer now exports `RENDERED_COMPONENTS`, and
`tests/openui-inventory.spec.tsx` asserts against it: **12 / 48**, measured.

**Grid responsiveness was measured, then measured again properly.** The first
attempt resized the *window*, which on this host does not change the card's
width — every sample read 527px, and the "columns dropped" result it produced was
really a different, narrower card. That run is kept as a script and its result is
**not used**. Constraining the card itself gave the real answer: the
`minChildWidth: 180` grid runs 3 → 2 → 1 columns at 680 / 440 / 320px, while the
explicit 3-column grid holds 3 at every width.

**A9 is recorded as NOT VERIFIED, not as a pass.** The profile's older session
cannot be loaded by this host at all — its log carries `job/registered` from a
newer harness and `dsh 0.2.0-rc.2` refuses to interpret it. Single-session
refresh replay passed and is what A8 claims.

**Two environment problems, both recorded rather than blamed on the code.** The
first session's conversation pane was dead (`DraftEditorRuntime.setDraft` throwing
`text.replace is not a function`, then the log becoming unreadable); prompts
returned HTTP 200 and painted nothing. The same flow worked in a fresh session on
the same build, which is how it was distinguished from a 4A-1 regression. And
browser-skill had a CLI/extension protocol skew (0.4.0 vs 0.4.1) that crashed
every `fill`; fixed before any number was written down.

**ADR-007**, requested by the owner: stage 3's third exit criterion said "at
least the Inputs group renders" and was met at 2 of 13. The PASS verdict stands,
but the criterion is now formally **narrowed** to what was verified — one Inputs
component renders *and binds state* — with the eleven others assigned to 4A-3.
The ADR also records the pattern worth not repeating: a group-level criterion
accepted on a component-level measurement reads two ways.

**A test that asserted a falsehood.** `openui-card.spec.tsx` required
`--font-sans:var(--dsh-font-family-text-default`, pinning the broken token as if
it were correct. It passed for two stages because a test can encode a mistake as
well as catch one. Corrected, with the reason in the comment.

**Verified before the numbers were written:** `npx vitest run` = 683 / 15 with a
failure set byte-identical to the baseline; `tsc` host + client exit 0;
differential 31/31, 0 differences; bundle hash matching on both halves after the
final rebuild.

### Session 10 — 2026-11-03

Stage 3 closed as **PASS**; stage 4 split into 4A (components) and 4B (external
actions) and documented, as instructed. No product code changed this session —
it is the documentation closeout the owner asked for, plus two new measurements.
Every file touched is under `docs/` or `evidence/`; the newest `src/` and
`tests/` timestamps belong to the previous session's P3-07 work.

**The measurement was worth taking.** "8 of 48" has been quoted for three
sessions without anyone listing the eight. A probe against the real signature
table (`evidence/phase-3/component-inventory.mjs`) produced the exact split and
the per-group counts, which sum to 48. It also asserts that no name in the
renderer's table is absent from `signatures.ts` — that check is the difference
between a count and a contract.

Two things the inventory changed in the plan:

1. **The batches are now derived, not remembered.** `Grid` sits in Layout and not
   in a later "charts" batch; `Carousel` and `Popover` move to 4A-5 with the
   drawing work, because both overlay or scroll rather than lay out.
2. **The Inputs group is 13, not "the Inputs group renders".** Stage 3's third
   exit criterion said "at least the Inputs group renders"; 2 of 13 do. That is
   recorded as **PARTIAL** in `PHASE-3-REPORT.md` rather than reinterpreted as
   met — the loop is closed, the catalogue is not.

**Also fixed this session:** the stage-3 section of `STAGE.md` still carried its
in-progress wording and a stale "40 components pending" line after the phase was
accepted. Replaced with the close record and the stage-4A/4B plans.

**A false claim in the documentation, found while writing the matrix.**
`COMPONENT_CATALOG.md` said an unrendered component "gets `unknown component`
with a line number — never a silently empty card". That is wrong, and it was
wrong in the direction that matters: the validator checks names against
`signatures.ts`, which declares **all 48**, so `Grid`, `Table` and `Chart` pass
validation with **zero errors** and the card draws an empty container. Only a
name the language does not declare at all (e.g. `Map`) is rejected.
Measured: `evidence/phase-3/unrendered-component-check.txt`.

The catalog now states the real behaviour and explains why the fix is to finish
the renderers rather than to reject declared names — rejecting them would make
the language disagree with its own signature table, which is the drift ADR-002
exists to prevent. This is a stage-4A usability issue, not a stage-3 regression:
`Grid` was never drawn, so nothing got worse. It is now visible instead of
contradicted by the docs.

**Verified before writing the numbers down:** `npx vitest run` = 637 / 15,
failure set byte-identical; `tsc` host + client exit 0; differential 31/31,
0 differences. The baseline in this log is the one that was run, not the one from
the previous session's notes.

### Session 9 — 2026-11-03

P3-07: Button actions. `@Set`, `@Reset` and `Action([...])` now dispatch through
the same state channel a Slider uses; `@OpenUrl`, `@CopyToClipboard` and
`@ToAssistant` are refused by name rather than left inert by accident.

**The upstream divergence you flagged is confirmed from source and reproduced,
not fixed.** `store.reset()` takes no argument (`20-store.js:112-118`) and
`runAction` calls it bare (`30-render.js:618-620`), so `@Reset($a, $b)` carries
bindings that are never read. The dispatcher resets every declared variable and
returns an `action.reset-ignores-args` note, so the gap is visible in a
diagnostic instead of being silently redefined.

**Two defects found while building, both real:**

1. **Action descriptors were being resolved as components.** `drawValue` walked
   an `@Set` descriptor, found no entry in the component table, and returned
   `null` — so every Button received no action at all, and every click was
   inert. Found by probing what the card actually rendered (`Pincount 3`, no
   change after a click) rather than by reading the code. Fixed by handing
   action descriptors through untouched.
2. **My first test fixture was not a legal program.** A multi-line
   `Col([...])` violates "one statement per physical line", which
   `OPENUI_LANGUAGE.md` states and the parser enforces (VZO125). The fixture was
   wrong, not the code; rewritten on one line each.

**Timing contract, pinned.** Values inside an action are frozen at render time,
so `Action([@Set($n, $n + 1), @Set($n, $n + 1)])` yields `n + 1`, not `n + 2`:
the later step wins but neither re-reads the other's write. That matches
upstream, and a test now holds it there.

**Browser verification** (`MANIFEST-P307.json`): set6 → `count 6`; reset →
`count 3`; combo → `count 2 step 5`; reload → both surfaces read `count 6 step 5`;
four clicks → **0 console entries**. T7 (session switching) and T8 (three card
generations replaying) are now PASS, closing both cases left NOT VERIFIED after
P3-06.

**The AGENTS.md §9 rule earned its place immediately.** The first hash check
found the profile still on the P3-06 bundle (`14D50389…` vs build `B2961F1C…`).
Synced, re-checked, and only then measured — the exact trap that cost most of
P3-06.

Also added, as agreed: three regression tests pinning the HTML cross-view
last-writer-wins behaviour, so the recorded risk is now a thing the suite would
notice changing.

**Numbers.** 637 passed / 15 failed / 652 (+27); failure set byte-identical;
both `tsc` exit 0; differential 31/31, 0 differences.

### Session 8 — 2026-11-03

P3-06: the turn tail now draws both backends through one descriptor reader.
State persistence had made a card *durable*; it did not make it *visible*, and
those are two acceptance conditions. The owner separated them, S04 was accepted
as PASS, and this phase closed the display half.

**The fix is four lines of intent.** `TurnCards` read cards with
`visualizeMetaFrom`, which rejects `kind: 'intelligent_ui'` and returns
undefined — so every OpenUI card was dropped and only the toolview copy inside
the fold remained. It now reads with `visualizationFrom` (the dispatcher the
toolview already used) and draws `Frame` or `OpenUICard` by discriminant. Both
surfaces derive their state key through `cardStateKey` / `stateKeyFor`, so the
same card mounted from either one is the same card with the same state.

No ADR: the unified descriptor was already the architecture. Updated
`SYSTEM_ARCHITECTURE.md` (a new "One card, two surfaces" section with the data
path), `STAGE.md` and this log instead.

**The measurement that mattered, and a mistake worth recording.** The first
browser round showed no OpenUI tail at all — and the HTML control card *did*
produce a tail. That contrast looked like a code defect in my own change. It was
not: `dsh plugin add file:...` copies `lib/` at install time, and the profile was
still serving the pre-P3-06 bundle. Found by comparing the installed
`lib/client.js` hash with the worktree build (4 matches for the new symbols vs 7).
After copying the fresh build in and re-running, every card had both surfaces.

The lesson is the one this repo keeps relearning: a "fails in browser, passes in
tests" reading must be checked against what the browser actually loaded before it
is reported as a code fault. It is recorded in
`evidence/browser-phase-3/MANIFEST-P306.json` under `defectFoundDuringVerification`.

**Verified with no CSS overrides.** The previous phase had to force
`content-visibility` on host containers to photograph a laid-out card. This phase
does not: the cards are genuinely outside the fold. T1–T6 pass — visible while
folded, 6 → 8 persisted through a reload, no duplication on expand, the HTML
control unchanged, and the acceptance step asserts no capture marker is left in
the DOM. T7 (session switching) and T8 (a genuine pre-fork card) are unit-tested
only, and are marked NOT VERIFIED rather than implied.

**Numbers.** 610 passed / 15 failed / 625 (+8, failure set byte-identical to the
stage-2 baseline); both `tsc` projects exit 0; the language differential re-ran
at 31/31 with 0 differences.

### Session 7 — 2026-11-02

Stage 3 implementation, state persistence only. ADR-006 finalised as **A′** and
P3-01…P3-05 built and verified.

**The decision, as ratified:** shared storage infrastructure, separate
per-backend keys; HTML keeps its key and `{t, s}` byte-for-byte; OpenUI writes
`{v, h, values}` under a `:openui` suffix. Two details the owner fixed are in
the ADR's decision table: a new key is **not** a new budget (same 16 KiB cap,
same total cap, same eviction), and `schemaHash` sees **names and kinds only**,
never a value — so `@Now()`/`@Today()` cannot make a card look like it migrated
on every reload. Case 18 pins that.

**Three defects found while building, all fixed:**

1. A merge-based write could resurrect a variable hydration had deliberately
   dropped, so the self-repair would never settle. `buildRecord` now validates
   exactly as a restore does.
2. `readRecord` silently discarded a persisted `{kind:'binding'}` descriptor
   instead of reporting it, which would have hidden a hostile write rather than
   cleaning it. Values are now read as `unknown` and refused *with a reason*.
3. The new spec was in neither tsconfig's DOM-test list, so the host project
   pulled `card-state.ts` into a DOM-free build. It failed on `window`; the fix
   is one entry in each list, matching how every other DOM spec is registered.

**Browser verification** (`evidence/browser-phase-3/MANIFEST.json`): a
model-drawn card's Slider went 3 → 6, and three separate reloads restored 6.
Record: `{"v":1,"h":"18bcb949","values":{"count":6}}` under the `:openui` key.

That run also produced two findings worth keeping:

- **The host folds a finished turn with `content-visibility: hidden`**, which
  keeps a laid-out subtree out of painting *and* out of the accessibility tree.
  The card measured 675×79 while appearing in neither a capture nor the a11y
  snapshot. The final screenshot forced that property on two host containers for
  the capture and reverted it; the measurement does not depend on it.
- **The turn tail does not re-show OpenUI cards.** `TurnCards` reads
  `visualizeMetaFrom` only, so only HTML cards repeat under the answer. Not
  fixed — it is a separate decision, now recorded in §6.

### Session 6 — 2026-11-02

Stage 3, design gate only: **ADR-006 proposed, no product code changed.** The
session opened with the suggestion to reuse `cardStates` with an `openui`
namespace inside one merged record. The audit accepted the reuse and rejected
the merge, on three facts read from source rather than from the docs:

1. `cleanState` caps **one plain JSON object at 16 KiB** per card
   (`card-state.ts:80-103`), so a merged record silently halves both backends'
   budgets.
2. `persist` treats `'{}'` as "delete the entry" (`:198-201`), so a cleared HTML
   card would leave a tombstone forever once an `openui` key existed beside it.
3. `read` hands `s` straight to the HTML frame (`:253`), so a merged record would
   let model-written script read another backend's state.

The recommendation is therefore **shared store, separate record shapes**: HTML
unchanged on today's key, OpenUI on `…:openui` with `{ v, h, values }`.

Two further findings worth carrying forward. `schemaHash` must be computed from
`stateDefaults` (`evaluate.ts:78-79`) and not from the program text, or a
reworded label wipes the reader's settings. And the evaluator reads `userState`
**without a type check** (`:302-308`), so hydration-time validation is a
security control, not tidiness.

Also recorded, and previously undocumented: two views of one card (toolview and
turn tail) share a state key but post whole maps under different tokens
(`TurnCards.tsx:245-251`), so last-writer-wins already applies to HTML cards.
Test case 16 and the write-merge rule exist because of it.

HTML baseline re-confirmed green before reuse: 25/25,
`evidence/phase-3/audit-card-state-baseline.txt`.

### Session 5 — 2026-11-02

Stage 2: the OpenUI language core is ported and differentially matched. 31
programs × 7 fields, 0 differences against the pinned upstream module. The
signature table is now generated from upstream (48 / 73, identical names and
order). Three defects in existing code fell out of the port: parse and tokenizer
diagnostics embedded the line in the message, and the client had a second,
cut-down evaluator. All three fixed.

In a real browser a bound Slider now drives other components — 3 → 6 changed a
sibling's `@Count` and grew the `@Each` list from 3 rows to 6. `$state`
persistence, Button actions and 40 unrendered components are the recorded gaps.

Also corrected: the "70 implementations" figure was wrong (a grep for
`Name(args) {` misses `Now()` and `Today()`); the real count is 72, plus `@Each`
in the evaluator, which accounts for all 73 signatures.

### Session 4 — 2026-11-02

Stage 1.3: closed B07 and B08 with browser evidence on an isolated profile
(`vizb78`; production untouched). Closing them found that **no CSS variable on
the OpenUI card had ever resolved** — the card used the HTML backend's frame
vocabulary, which only exists inside its iframe. The Button had no background,
no border and square corners for the whole of stage 1.2, and every unit test
passed. Five defects fixed (D3–D7), 3 regression tests added. B05 and B10 stay
NOT VERIFIED by scope.

### Session 3 — 2026-11-02

Stage 1.2: verified the OpenUI card in a real DSH web session on an isolated
profile (viztest12; production untouched). Found and fixed two defects that unit
tests could not catch — a bundle id that only fails at host load, and a flex
alignment default. B01–B11 recorded; three are NOT VERIFIED by scope.

### Session 2 — 2026-11-02

Git initialised; baseline commit `9341c8d`, then `2e5afc9` fixing an unanchored
`.gitignore` that had excluded upstream reference source. Upstream snapshots
committed as plain source. Stage 1.1: the OpenUI render loop closed on the host
and in the renderer, verified server-side.

### Session 1 — 2026-11-02

Fork created from `cf6b3a3`. Three upstream snapshots pinned. Stage 1 implemented
and accepted with the openui rendering gap. Fixed the nested-dispatch card loss
inherited from the base. Documentation system established.