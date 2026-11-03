# ADR-006 — OpenUI `$state` persistence: one CardStateStore, per-backend record shapes

- **Status:** **accepted** — option A′. Decision taken 2026-11-02; implementation
  under stage 3 (P3-01 … P3-05).
- **Date:** 2026-11-02
- **Supersedes:** —
- **Stage:** 3 (`STAGE.md`), first scope item
- **Relates to:** ADR-001 (one host, two backends), ADR-004 (per-backend security), ADR-005 (evidence discipline)

## Decision record (ratified)

The owner approved A′ and fixed two implementation details that are now part of
the decision, not left to the implementer:

| Item | Decision |
| --- | --- |
| Persistence architecture | **A′** — shared storage infrastructure, separate per-backend keys |
| HTML state | existing key and `{t, s}` format unchanged |
| OpenUI state | `:openui` key suffix, payload `{v, h, values}` |
| `schemaHash` | derived from the **structure** of `stateDefaults` (names and types) |
| Compatibility | validated per variable; a hash change alone never clears values |
| `intelligent_ui` missing `sessionId` | approved — add `inject` |
| HTML cross-view overwrite | **not** changed this stage; add a regression test and record the risk |

**A new key must not become a second budget.** A `:openui` record is subject to
the *same* 16 KiB per-card cap, the *same* global capacity cap and the *same*
oldest-change-first eviction as an HTML record. Sharing the store is only
meaningful if it also shares the ledger; a private cap for OpenUI would let one
backend starve the other silently. §Capacity and §Test case 17 make this
testable rather than assumed.

**`schemaHash` must not see a dynamic default's value.** A default such as
`@Now()` or `@Today()` changes every load. If the digest were computed from
values, every card containing one would appear to have changed schema on every
reload and would migrate — churning state for no reason. The digest therefore
takes **only variable names and their JSON *kinds***, never a value. §
`schemaHash`.

## Context

Stage 2 closed the interaction loop in a real browser: dragging a Slider
re-evaluates the tree, and components that have no direct relationship with the
control change with it. The recorded gap is that the loop is **not durable** —
a reload re-evaluates from defaults, so the slider returns to 3 and S04 is
`PARTIAL` (`docs/reports/PHASE-2-REPORT.md` §"Gaps"; `session-log.md` §3
"Not verified").

The question this ADR answers is where OpenUI `$state` should live. It is a
decision, not an implementation detail, because the wrong choice either
duplicates a lifecycle that already works or corrupts a format that shipped
cards already depend on.

The suggested position entering this ADR was: **share the storage
infrastructure, keep per-backend state isolated, and reuse `cardStates`.** This
ADR accepts that direction but **rejects one part of the shape that was
proposed with it** — a single record holding both backends — because the
source shows the two backends do not store the same kind of state (§Audit A2,
§Options). Sharing is kept; the shared *record* is not.

### What is actually there (not inferred from documentation)

`cardStates` is not a session store. It is a browser-side `localStorage` store
in `src/client/card-state.ts`, owned by the HTML renderer, one entry per card:

```ts
interface StoredEntry { t: number; s: CardState }   // card-state.ts:59-62
type CardState = Record<string, unknown>            // viz-helper.ts:69-70
```

The HTML card does not write state. **The frame writes it**, from inside the
sandboxed iframe, through a JS helper that ships in every card document
(`viz-helper.ts:100`), and the card only relays what arrives:

```
fragment control  →  viz-helper `save()`            viz-helper.ts:342-349
                  →  `commit()` posts the whole map  viz-helper.ts:255-267
                  →  card: `useStateRelay`           VisualizeCard.tsx:292-304
                  →  `cardStates.write(key, values)`  VisualizeCard.tsx:299
                  →  debounced `persist()`            card-state.ts:196-239
```

The OpenUI card has no frame, no message channel and no helper. Its state is
plain React state on the host page:

```ts
const [state, setState] = useState<Record<string, EvaluationValue>>({})  // OpenUICard.tsx:540
```

So the two backends agree on *neither* the mechanism *nor* the vocabulary:
HTML state is a flat bag of DOM-control values keyed `keep:rate`, `tab:t1`;
OpenUI state is typed evaluator values keyed `n`, `enabled` — and parts of it
are not JSON at all (see A2c).

## Part 1 — read-only audit

Every claim below was read from source at `HEAD = 9b46cec`. No test was
modified and no product file was touched.

### A1. `cardStates` — definition and real data structure

| Property | Reality | Source |
| --- | --- | --- |
| Kind | `localStorage`, per browser origin | `card-state.ts:7-13`, `:272-277` |
| Key | `dsh-visualize:state:` + `cardStateKey(...)` | `:38`, `:71-73` |
| Entry | `{ "t": <ms>, "s": <state> }` | `:59-62`, `:202` |
| Card key | `` `${session ?? ''}|${path === '' ? `call:${callId}` : path}` `` | `:71-73` |
| In-memory layer | `memory: Map<string,string>` for latest-known-per-page | `:159`, `:243-253` |
| Pending set | `pending: Set<string>`, one shared timer | `:160-161`, `:255-262` |
| Readback | deep copy via `JSON.parse` | `:253` |
| Clear | writing `{}` removes the key | `:198-201` |
| Per-card cap | `CARD_STATE_MAX_CHARS` = 16 384 chars | `viz-helper.ts:67` |
| Total cap | `STATE_TOTAL_MAX_CHARS` = 262 144 chars | `card-state.ts:44` |
| Debounce | 400 ms | `:47` |
| Failure mode | every access wrapped; memory keeps going | `:163-169`, `:230-238`, `:245-251` |

`CardState` and the store are already **backend-agnostic data** — nothing in
`card-state.ts` imports anything from `backends/` or from the HTML renderer. The
coupling is *behavioural*, not structural: the total-cap eviction, the
`{}`-means-delete rule and the message reader are shaped around how the HTML
frame behaves (§A6). That distinction decides this ADR.

### A2. The HTML backend's save / read / update / clear flow

**Save.** `viz-helper` listens on `input`/`change` for any field inside a
`[data-viz-keep]` subtree, derives a key (`keep:<name>`) and calls
`setState` → `commit`, which JSON-serialises the *whole map*, checks it against
the 16 384-char cap, and posts it if it differs from the last posted snapshot
(`viz-helper.ts:342-349`, `:255-267`). `dshViz.state.set/get/clear` is the same
path (`:469-478`).

**Relay.** `useStateRelay` accepts a snapshot only when
`event.source === frame.contentWindow` **and** the token matches, then calls
`cardStates.write(stateKey, values)` (`VisualizeCard.tsx:292-304`,
`readStateMessage` at `card-state.ts:112-117`). The message never names a key;
the card decides it. That is the HTML backend's trust boundary and it is not
weakened by this ADR.

**Read.** The saved values are *baked into the document* at build time
(`shell.ts:138-141` → `vizHelperScript(..., { values, token })`), so fragment
script can read them synchronously before anything async runs
(`viz-helper.ts:274-277`). The card reads storage in a `useMemo` keyed on
`[stateKey, themeKey, meta.fragment, meta.title, meta.style, variant]` —
deliberately **not** on the state itself, or every keystroke would reload the
frame (`VisualizeCard.tsx:270-273`).

**Update.** `write` short-circuits when the new JSON equals what memory already
holds, otherwise it marks the key pending and restarts the 400 ms timer
(`card-state.ts:255-262`). "Last write for a key wins per tick" — see A6.

**Clear.** `dshViz.state.clear()` posts `{}` (`viz-helper.ts:476`); `write`
stores `'{}'`; `persist` sees `'{}'` and calls `removeItem` (`card-state.ts:198-201`).
There is **no per-card delete API** beyond this.

### A3. Identity — where each id comes from, and how stable it is

| Id | Source | Stability | Source |
| --- | --- | --- | --- |
| `callId` | `ToolCallViewProps.callId`; `message.source.callId`; `subCallId` for PTC | stable in the session log | `TurnCards.tsx:122`, `:130` |
| `visualizeSession` | slot `inject(sessionId)` | stable per session; **absent on hosts that pass none** → key prefix `''` | `VisualizeCard.tsx:627-631`, `index.tsx:84` |
| `meta.path` | content-addressed on create: `<slug>-<FNV1a(source)>.<style><suffix>` | **changes when the source changes** | `legacy-tool.ts:321`, `:498-519` |
| `cardStateKey` | `session \| path` (or `session \| call:<callId>` when `path === ''`) | one key per card per session | `card-state.ts:71-73` |

Consequences that matter for OpenUI:

1. **An `update` patch preserves `$state` only if the model restates `path`.**
   The create name is content-addressed, so new bytes mean a new path. Patch
   `old_str → new_str` on an existing path and the key survives
   (`frame-state.spec.tsx:232-237` proves exactly this for HTML). Regenerate the
   card and the key is new. **This is existing, accepted behaviour and ADR-006
   does not change it.**
2. **`callId` is not a substitute for `path`** for a card that has one: a
   re-render or a new call at the same path must find the old state, and
   `path` is what `update` continuity is built on.
3. **A streaming OpenUI card has `path: 'streaming'`** (`fragment.ts:266`,
   `:283`) and is not given a `stateKey` today (`OpenUICard.tsx:587` renders it
   with no key at all). A literal `'streaming'` key would be a cross-card
   collision; it must be treated as "no identity" (§Decision 4).
4. **Two views of one card share one key but use different tokens**: the
   toolview passes `callId`, the turn tail passes `turn-tail:<callId>`
   (`TurnCards.tsx:248`), the thumbnail `thumb:<callId>`
   (`VisualizeCard.tsx:507`), a new tab `window:<callId>`
   (`VisualizeCard.tsx:134`). Both source filters compare against the *frame's
   own* window, so no cross-talk today. `token ≠ key` is official.
5. `visualizeSession` reaches the toolview and the turn tail, but **not** the
   `intelligent_ui` toolview registration (`index.tsx:91-94`), which has no
   `inject`.

### A4. Size limits and storage location

Per card **16 384 chars** (`viz-helper.ts:67`), enforced twice: frame-side in
`commit` (`:260`) and card-side in `cleanState` (`card-state.ts:101`). All cards
together **262 144 chars** (`:44`), evicted oldest-change-first before a write
(`:205-209`), and the store will drop its own oldest entries when the origin
quota rejects the `setItem` (`:212-221`). Location is the DSH web page's
`localStorage` for that origin: **per browser profile, per origin**, not per
device and not in the session log (`card-state.ts:7-13`).

OpenUI costs more per card than HTML for the same semantics: its state is
`$variable` names (no `keep:` prefix, no id-derived keys), but a program can
declare variables its UI never binds, and an object or array value is legal.
The 16 KiB cap is still far above any realistic program's state.

### A5. Lifecycle — reload, session restore, destroy

| Moment | HTML backend | Source |
| --- | --- | --- |
| First load | baked into `srcdoc` by `buildFrameDoc` | `shell.ts:138-141` |
| Interaction | frame posts whole map; card writes memory immediately | `VisualizeCard.tsx:299` |
| Settle | 400 ms debounce, then `persist` | `card-state.ts:260-261` |
| Page hidden | `pagehide` + `visibilitychange` force a flush | `:288-294` |
| Reload/reopen | new store instance reads storage lazily on `read` | `:242-254` |
| Patch | same path → same key → state survives | `frame-state.spec.tsx:232-237` |
| **Destroy** | **nothing deletes**; `unmount` does not touch storage | `frame-state.spec.tsx:214-237` |

The absence of a destroy path is a feature, not an oversight: a card that
leaves the DOM (fold collapsed, turn scrolled away, session switched) must not
lose what the reader set. Retention is bounded by the total cap and eviction,
not by lifecycle. **ADR-006 preserves this.**

### A6. Can two cards overwrite each other?

*Across cards:* no. The key is derived from `session + path`, never from a
name the frame supplies, and the relay checks `event.source` (`VisualizeCard.tsx:297`).

*Across views of one card:* **yes, last-writer-wins, and this is already live.**
The toolview and the turn tail can both be mounted for the same call; they share
`cardStateKey(session, path, callId)` but post under `call-a` and
`turn-tail:call-a` (`TurnCards.tsx:245-251`). Each view owns a separate frame
document with its own in-frame `saved` copy, keeps its own `posted` snapshot,
and posts the *whole map*. If view A changes `rate` and view B still holds a
stale map, B's next post will drop A's change from the stored snapshot. No
test covers this and nothing today mitigates it.

*Same card, one view:* safe. A single shared memory map and one timer per key
mean the latest JSON for a key wins (`card-state.ts:159`, `:255-262`).

*Findings for OpenUI:* the cross-view hazard applies to OpenUI exactly as it
does to HTML, and the mitigation is identical (§"Debounce, flush and
write-merge"). The "several cards at once" scenario the audit was asked about
does **not** exist — per-card isolation is structural.

### A7. The OpenUI card today (the other half of the problem)

`evaluateProgram` already exposes everything the design needs, and its
documented contract is precise:

- `stateDefaults` — "Evaluated default of every `$name = ...`, **independent of
  `options.state`**" (`evaluate.ts:78-79`, computed at `:807-813` via
  `stateDefault` `:264-282`). This is the default side of a hydration merge and
  the basis of a schema, and it is *pure*.
- A `$name` read checks `userState` first, **with no type check on the value**,
  and otherwise falls back to the default (`:302-308`). A stored `{count: "abc"}`
  therefore reaches components as a string today.

Two non-JSON cases in `$state`:

1. A `$variable` used as a component argument arrives wrapped as
   `{ kind: 'binding', name, value }` (`evaluate.ts:51-55`, produced at `:736`).
   The card's write channel receives the **unwrapped** value
   (`OpenUICard.tsx:360-363` passes `parsed`, a number), so what the card holds
   is already plain — but anything that captures the evaluated argument instead
   of the write payload would persist a descriptor. **Persisting such an object
   must be refused, not repaired.**
2. `UserState` values may be any `unknown`; only JSON-survivable ones may be
   restored.

## Options

**A. Extend `cardStates` with an `openui` namespace inside one shared record.**

```jsonc
// one localStorage entry per card
{ "t": 1730000000000, "s": { "html": {"values": {...}}, "openui": {"values": {...}, "schemaHash": "..."} } }
```

**B. A separate per-card OpenUI store** — its own prefix, its own lifecycle,
its own eviction.

**A′. Share the store and the key; give each backend its own record shape**
(the recommendation). The HTML record stays byte-identical to today's and lives
under today's key; the OpenUI record gets its own suffix and its own internal
shape.

| | A (shared record) | B (separate store) | **A′ (shared store, separate records)** |
| --- | --- | --- | --- |
| Infrastructure reuse | yes | no | **yes** |
| Cap / eviction / quota | shared | **doubles** (total cap counted twice) | **shared, counted once** |
| Existing HTML entries | need migration | untouched | **untouched, read as today** |
| Total-cap byte accounting | must change to count only `s` | two independent budgets | **unchanged formula** |
| A malformed OpenUI record can affect HTML | **yes** (same `s`) | no | **no** |
| Writes per interaction | re-serialises both backends' data | one | **one** |
| `readStateMessage` semantics | has to grow a second shape | reusable as-is | **reusable as-is** |
| Cost of a later 3rd backend | edits a shared record | new store again | **new prefix, one key constant** |
| Fits the HTML backend's history | **changes it** | fits | **fits** |

**A is rejected on evidence, not taste:**

1. `cleanState` requires `s` to be **one plain object JSON ≤ 16 KiB**
   (`card-state.ts:80-103`). An OpenUI program's state would be *nested inside*
   the same 16 KiB as the HTML state — the per-card cap silently shrinks for
   both.
2. `persist` decides "empty means delete" with `json === '{}'`
   (`:198-201`). Under a merged record, clearing HTML state (`s.html.values = {}`)
   would no longer remove anything, so a cleared card would keep a tombstone
   entry forever — a behaviour change for the HTML backend, which ADR-006 §
   "HTML compatibility" forbids.
3. `read` returns `s` wholesale to the frame (`:253`) and `buildFrameDoc` bakes
   it into the document (`shell.ts:138`). A merged record means the HTML frame
   would receive an `openui` object as part of its own state map — model-written
   script could read and mutate another backend's data. That is a new coupling
   between the two boundaries ADR-004 keeps separate.

**B is rejected because the argument for sharing survives:** one debounce, one
eviction policy, one quota, one set of failure semantics, one place to look when
a card loses state. B duplicates all of that to gain isolation that a key
suffix provides for free.

**A′ takes the reason for isolation and the reason for sharing.** It does mean
"storage infrastructure shared, state data isolated" — the position this ADR
started from — with the merged record replaced by two shapes under one store.

## Decision

1. **One store.** `cardStates` remains the only card-state store. No second
   store, no second prefix, no second debounce timer, no second eviction
   policy. The store's public contract (`read`/`write`/`flush`,
   `card-state.ts:120-136`) does not change.
2. **Two record shapes, one key each.** HTML keeps its current record and its
   current key byte-for-byte. OpenUI writes its own record under
   `STORAGE_PREFIX + cardStateKey(...) + ':openui'`. The suffix is applied in
   `card-state.ts` so the key format stays in one place.
3. **Card identity is `sessionId + path`**, exactly as HTML uses it
   (`card-state.ts:71-73`). Titles, slugs and model-generated names are never
   keys. `callId` is the fallback only for a card with no path.
4. **A card with no durable identity persists nothing.** `sessionId` absent, or
   `path` missing/empty/`'streaming'`, means in-memory only — the same
   discipline as the HTML preview, thumbnail and new-tab surfaces
   (`VisualizeCard.tsx:506-508`, `:136`).
5. **Only JSON-serialisable `$state` is persisted**, capped at 16 KiB per card,
   versioned, and carrying a `schemaVersion` and a `schemaHash`.
6. **Restore is a validated merge against the current program's defaults**, in
   this order: read → shape-check → version-check → per-variable type-check
   against `stateDefaults` → drop unknown and non-serialisable entries →
   restore or fall back. No step may make the card fail to render.
7. **HTML behaviour is unchanged.** Same key, same record, same caps, same
   eviction, same message validation, same debounce. ADR-006 adds a second
   record type beside it; it does not touch the first.

## The OpenUI record

```ts
/** What is persisted for one OpenUI card. Versioned; the version is not the schema's. */
interface OpenUiStateRecord {
  /** Shape of this record. A record with another version is ignored wholesale. */
  v: 1
  /** Digest of the current program's `$variable` surface (see below). */
  h: string
  /** One entry per `$variable` the program declared, JSON values only. */
  values: Record<string, string | number | boolean | null>
}
```

Stored under `{ v, h, values }` inside the existing entry envelope, so the
existing `{t, s}` parse, eviction order and quota loop all apply without change:

```jsonc
// key: dsh-visualize:state:<session>|<path>:openui
{ "t": 1730000000000,
  "s": { "v": 1,
         "h": "e3b0c442",
         "values": { "count": 6, "enabled": true } } }
```

**What is persisted:** values the user produced through a bound control — the
`write(name, next)` channel (`OpenUICard.tsx:541-543`) — plus nothing else.
**What is not:** element/binding descriptors, arrays and objects by default,
derived statements, functions, any DOM handle, any render cache. The rule is
"save state, not the render".

**Why not arrays and objects in `values`.** The v1 type check compares a stored
value against the *evaluated default's* JSON type. `null`/`boolean`/`number`/
`string` cover every bound input in the renderer today (Slider binds a number;
Button actions will bind whatever `@Set` targets). Arrays and objects are
accepted only when the default is itself an array/object of the same JSON shape,
and the whole record must still fit 16 KiB; the validator, not the type, is the
authority. Widening later is additive and needs no new version, because `h`
would change and the merge is per-variable.

## `schemaHash`

`schemaHash` is computed from the **`$variable` surface, not the source text and
not any value**:

```
h = fnv1a32( JSON.stringify( [ [name, kind(default)] for name in sorted(stateDefaults) ] ) )

kind(v) = 'null' | 'boolean' | 'number' | 'string'
        | 'array' | 'object' | 'other'      // shape only, never contents
```

- Built from `stateDefaults` (`evaluate.ts:78-79`), which is computed
  independently of the caller's state, so the digest never depends on what the
  user set.
- **The value never enters the digest — only its kind.** This is what makes a
  dynamic default safe: `$t = @Now()` is `['t','string']` on every load, so the
  digest is stable and no migration is triggered by the clock advancing.
  Hashing the value here would make every card with a clock in it churn its
  state on every reload, which is precisely the "unnecessary migration" the
  decision forbids. Test case 18 pins it by hashing two programs whose only
  difference is the *value* of a dynamic default, and one program across two
  different wall-clock readings.
- Only **names and kinds** enter the digest. Re-wording a `Text`, restyling a
  `Card` or moving a `Slider` therefore leaves the user's values intact —
  the failure mode a whole-program hash produces, where every typo in a label
  wipes the reader's settings.
- Changing `3` to `5` as a default does **not** change `h` (same kind). The
  stored value still wins, because the user's number is a valid `number`. Only
  changing the *kind* of value (`3` → `"3"`, `true` → `1`) changes `h` and
  invalidates.

`h` is **advisory across a patch and authoritative within a load**: on a
mismatch the record is not discarded blindly, it is **re-validated per
variable** (types, membership, size). Unknown names are dropped, matching
variables are restored, mismatched ones fall back to their new default. `h` is
used for two things only: a fast path when it matches (skip per-variable
checking is *not* allowed — the checks are cheap and must always run), and an
explicit "state was not restored because the program's variables changed" note
for the log. The merge is always per-variable, so **`h` can never be the reason
a still-compatible value is lost.**

## Restore algorithm (normative order)

```
1. stateKey = session === undefined || path is ''/absent/'streaming'
                ? undefined                       // nothing persisted (Decision 4)
                : openuiStateKey(session, path, callId)
2. if stateKey === undefined → state = {} ; persisted = false
3. else record = store.read(stateKey)
4. if record is not {v:1, h:string, values:object} → state = {}   // never throw
5. parsed = parseProgram(program)
6. defaults = evaluateProgram(parsed, { state: {} }).stateDefaults
7. for each [name, stored] of record.values:
       if !(name in defaults)                → drop (unknown variable)
       if jsonType(stored) ≠ jsonType(defaults[name])
           and stored !== null               → drop (type changed)
       if !isJsonSafe(stored)                → drop
       else                                  → keep
8. state = kept        // merged against defaults by the evaluator's own fallback
9. render with drawProgram(program, state, write)
10. if kept ≠ record.values → write the reduced record back (self-healing)
```

Step 10 is what cleans up after a deleted `$variable`: the entry is rewritten
without the dead name on the first load after the program changed, so nothing
else has to sweep. Step 4 and every `read` sit behind the store's existing
`try/catch`, so a corrupt entry is "nothing saved" (`card-state.ts:242-254`) and
**a storage failure can never stop a card rendering** — this is a test case,
not an aspiration.

## Debounce, flush and write-merge

- **Debounce.** Reuse the store's 400 ms timer and the existing `pagehide` /
  `visibilitychange` flush (`card-state.ts:288-294`). OpenUI adds no timer of
  its own.
- **What is written.** The card passes the full `values` map minus anything
  unpersistable; the store's `write` already short-circuits identical JSON
  (`:257`) and its `read` hands out copies (`:253`).
- **Rapid interaction** (the audit's "several quick changes" case) is safe
  within a view by construction, and covered by a test that drives N inputs in
  one tick and asserts the last value survives a flush.
- **Two views of one card** (`toolview` + `turn-tail`) share a key. ADR-006
  adopts an explicit mitigation rather than pretending the hazard is gone:
  **write-merge on read-modify-write.** Before persisting an OpenUI record, the
  card re-reads the stored record, merges it with the in-memory map
  (in-memory wins per key), and writes the union. A stale view can then only
  refresh keys it still owns, not resurrect an old map. This is cheap (one
  extra `read` inside the existing debounce) and applies equally to the HTML
  record's known hazard if that is ever fixed — deliberately out of scope here,
  because changing the HTML write path is a behaviour change (§7).

## Capacity

- Per card: 16 KiB (`CARD_STATE_MAX_CHARS`), shared limit, no second budget.
- Total: 262 144 chars for **all** cards and **both** backends, unchanged
  formula (`card-state.ts:205-209`) — an OpenUI card and an HTML card compete on
  the same ledger, and are evicted oldest-change-first together.
- `t` ordering is shared, so the eviction policy cannot starve one backend.

## Incompatible state

| Situation | Behaviour |
| --- | --- |
| Unknown `v` | ignore the record; start from defaults |
| Malformed / truncated JSON | ignore (`read` already does) |
| Unknown `$variable` | drop it, then rewrite the record (step 10) |
| Type changed vs default | drop that variable, keep the rest |
| Non-JSON value | drop that variable |
| Over 16 KiB | refuse the write, keep the card working, keep memory copy |
| Program no longer parses | render the notice; storage untouched |

None of these may throw, log a card error, or block rendering.

## Security (extends ADR-004; does not weaken it)

1. **One trust boundary stays one.** OpenUI state never crosses `postMessage`;
   it is written by the host-side card, so `readStateMessage`'s token/source
   checks (`card-state.ts:112-117`) are neither reused nor relaxed.
2. **No new HTML surface.** Nothing in `src/client/` uses `innerHTML` or
   `dangerouslySetInnerHTML` (verified by search), and ADR-006 adds none. A
   restored value reaches JSX as a *text node or an attribute value*, never as
   markup.
3. **Restored values are data, never code.** A value is only ever passed to
   `evaluateProgram` as `options.state`; the evaluator resolves it as a plain
   value (`evaluate.ts:302-308`). No JSON field is ever parsed as a program,
   and no restored string is evaluated.
4. **The type check is a security control, not tidiness.** `readReference`
   takes whatever is under the key with no type check (`:302-308`). Because
   hydration validates against `stateDefaults`, a stored string cannot reach a
   component that expects a number — the check ADR-006 adds is the only thing
   standing between a hand-edited `localStorage` entry and a renderer surprise.
5. **Sensitive input is opt-in by being a `$variable`.** A program that binds an
   input to `$name` is explicitly declaring state worth keeping; text that is
   not bound to a `$variable` is never persisted. This is stricter than the HTML
   backend, which persists any `data-viz-keep` control, and it is recorded here
   so reviewers do not "fix" the asymmetry.

## HTML compatibility

Unchanged, and the ADR verifies rather than assumes it:

| Aspect | Status |
| --- | --- |
| Key format | unchanged; OpenUI adds a suffix on its own keys |
| Record shape `{t,s}` | unchanged |
| `cardStateKey` behaviour | unchanged (`tests/card-state.spec.ts:43-50`) |
| Per-card and total caps | unchanged |
| Eviction and quota fallback | unchanged (`tests/card-state.spec.ts:106-147`) |
| `readStateMessage` | unchanged |
| Debounce and flush | unchanged |
| Frames already in a session log | read as before; no migration, no rewrite |

Existing `localStorage` entries are never touched by the OpenUI path, so a
downgrade to the current build loses OpenUI state only.

## Consequences

**Positive**

- One lifecycle, one eviction policy, one quota, one failure mode for both
  backends — the reason to share at all.
- HTML's shipped behaviour is provably untouched: same key, same shape, same
  tests.
- A third backend persists by choosing a suffix and a shape; it never edits the
  store, the timer or the caps.
- Per-variable validation means a program edit cannot silently poison a card,
  and the record self-heals after a `$variable` is deleted.

**Negative / accepted costs**

- Two record shapes to maintain instead of one. Accepted: they describe two
  genuinely different kinds of state, and merging them was measured above to
  break three invariants of the existing store.
- `schemaHash` is advisory, so compatibility is decided by the per-variable
  merge rather than by one comparison. Slightly more code; strictly safer.
- Storage is `localStorage`, so state does not follow a session across devices.
  That is the HTML backend's existing limitation, inherited deliberately, and
  it belongs in `session-log.md` as a known limitation rather than being
  papered over.
- The cross-view last-writer-wins hazard is mitigated, not eliminated; the
  mitigation is a read-modify-write, not a lock.

## Rejected alternatives

| Alternative | Why rejected |
| --- | --- |
| Merged record with an `openui` key (option A) | Breaks the 16 KiB per-card budget, the `{}`-means-delete rule, and the frame's read of its own state map |
| Separate store (option B) | Duplicates debounce, eviction, quota and failure handling for isolation a key suffix already gives |
| Whole-program hash as schema | A label reword would wipe the reader's settings |
| Persist the evaluated argument tree / React state | Not state; descriptors, bindings and derived values cannot be restored safely |
| Persist in the session log / server store | Not available to the client half; would change replay; ADR-003 owns persisted meta |
| Store state per `callId` only | Loses state across an `update` patch, which is the one case users notice |

## Questions this decision closed

1. **`sessionId` on the `intelligent_ui` toolview.** Resolved: approved and
   implemented (P3-04). A replayed program card now has a session and can
   persist.
2. **`path: 'streaming'`.** Resolved: a streaming card persists under no key.
   `stateKeyFor` treats `''` and `'streaming'` as "no identity", because the
   streaming path is not an identity and would give every streaming card in a
   session one key.
3. **OpenUI `page` mode.** Still no second surface: `OpenUIMeta` carries `mode`
   but `OpenUICard` ignores it. If a page surface is added, the "read but never
   save" rule becomes load-bearing and needs its own test.
4. **HTML write-merge.** Resolved as the owner decided: **not** applied this
   stage. HTML remains last-writer-wins across views; that risk is recorded in
   `session-log.md` §6 and waits for its own decision.

## Implementation shape (as built)

| File | Change |
| --- | --- |
| `src/client/openui-state.ts` (new) | record type, `openuiStateKey`, `schemaHash`, `hydrateState`, `buildRecord`, `mergeValues` — pure, no React, no DOM |
| `src/client/card-state.ts` | **unchanged** — the store, its caps, its debounce and its eviction are reused as they were |
| `src/client/OpenUICard.tsx` | optional `stateKey`; hydrate once per program+key; write through the shared store; no `useEffect` on state alone |
| `src/client/VisualizeCard.tsx` | passes `stateKey` to the OpenUI card in the settle branch |
| `src/client/index.tsx` | `intelligent_ui` toolview gains `inject: sessionInjection(undefined, sessionId)` |
| `tests/openui-state.spec.tsx` (new) | 26 tests: hash, hydrate, repair, isolation, rapid input, storage failure, shared ledger |
| `tsconfig.json`, `tsconfig.client.json` | the new DOM spec registered in both lists |

No change to `src/backends/openui/`, so the differential run cannot move —
the stage-3 out-of-scope rule (`STAGE.md` §Stage 3) is satisfied by
construction. It was not re-run this session and is not claimed.

## Test plan (10 required cases, plus the ones the audit found)

| # | Case | Level | Asserts |
| --- | --- | --- | --- |
| 1 | Slider → reload | component + store | remount starts at the stored value, not the default |
| 2 | Button/state change → reload | pure (`hydrateState`) | a value written by any `write()` survives |
| 3 | `$variable` added | pure | stored old values restored, new variable takes its default |
| 4 | `$variable` deleted | pure | dead name dropped and the record rewritten without it |
| 5 | Type changed | pure | mismatched variable falls back, siblings keep their values |
| 6 | Two sessions | pure + component | session B never reads session A's values |
| 7 | Two cards | component | two cards in one session, distinct paths, no bleed |
| 8 | Rapid interaction | component + fake timers | N writes in one tick → last value persisted, one flush |
| 9 | Storage failure | component | throwing `StateStorage` → card renders and stays interactive |
| 10 | HTML regression | existing suite | `tests/card-state.spec.ts` + `tests/frame-state.spec.tsx` still 25/25 |

Additional cases this audit makes mandatory:

| # | Case | Why |
| --- | --- | --- |
| 11 | Persisted `{kind:'binding'}` is refused | A2 — descriptors must never round-trip |
| 12 | `stateDefaults` is not mutated by hydration | a mutated default poisons every later render |
| 13 | Program edit (restyle/reword) keeps values | whole-program hashing must not creep back in |
| 14 | No `sessionId`, or `path: 'streaming'` | Decision 4: nothing persisted, card still works |
| 15 | Corrupt record, unknown `v`, over-cap record | "nothing saved", never a throw |
| 16 | Two views of one card | write-merge keeps both views' keys |
| 17 | **OpenUI and HTML share the ledger** | one per-card cap, one total cap, one eviction order across both key shapes — an OpenUI record must be evicted by the same rule an HTML record is |
| 18 | **`schemaHash` ignores dynamic defaults** | `@Now()`/`@Today()` cards produce a stable digest across two clock readings; only names and kinds move it |

Evidence goes to `evidence/phase-3/`; unit tests are *implemented*, not
*verified*, until the browser reload case is recorded (AGENTS §5).

## Migration risk

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| An HTML card loses state in the field | Low | High | HTML record and key untouched; case 10 pins it |
| Key suffix collides with a real path | Very low | High | Suffix applies to the whole composed key, and paths end in `.html`/`.page.html` |
| State restored onto the wrong card | Low | High | Keys come from `session + path`, never from the model or the title |
| Program edit wipes settings | **Medium if undetected** | Medium | Per-variable merge; case 13 |
| `localStorage` quota exhausted by OpenUI cards | Low | Low | Shared total cap; oldest-first eviction, both backends |
| Cross-view overwrite | Medium (already live for HTML) | Low per event | Read-modify-write merge; case 16 |
| Stage-3 scope creep into `backends/` | Low | Medium | No file under `src/backends/` is edited; differential re-run as a guard |
| Silent regression in the 15 Windows baseline failures | Low | Low | Failure set compared against `docs/testing/TEST_PLAN.md` |

**Rollback:** delete the `:openui` entries; no HTML entry and no persisted meta
changes, so a downgrade is clean.

## Limitation: `localStorage` is local

`cardStates` is the browser page's `localStorage`, scoped to one browser profile
on one origin (`card-state.ts:7-13`). Persisting `$state` therefore means
"survives a reload, a reopened session and a restart of this browser on this
machine". It does **not** mean:

- sync to another device, or another browser on the same device;
- survival of clearing site data, a private window, or a quota refusal;
- following a session that is resumed elsewhere.

This is the HTML backend's pre-existing boundary, inherited deliberately rather
than widened: the host exposes no client-side per-session store to plugins, and
putting card state in the session log would change replay, which ADR-003 owns.
Anything that needs to travel must be re-derived from the persisted program.

## Implementation outcome (2026-11-02)

Built and verified as specified. Record:
`evidence/phase-3/MANIFEST.json`, `evidence/browser-phase-3/MANIFEST.json`.

| Step | File | State |
| --- | --- | --- |
| P3-01 | this ADR | accepted, A′ |
| P3-02 | `src/client/openui-state.ts` (new) | done |
| P3-03 | `hydrateState` / `buildRecord` / self-repair | done |
| P3-04 | `src/client/index.tsx` — `intelligent_ui` gains `inject` | done |
| P3-05 | `OpenUICard.tsx` + `VisualizeCard.tsx`; browser run | done — **S04 PASS** |

Three defects were found while implementing, and all three are fixed:

1. **A merge-based write could resurrect a dropped variable.** The first
   version wrote the union of the stored record and the card's memory, but only
   hydrated values were validated. A variable hydration had refused would be
   reintroduced by the next merge, so the self-repair of step 10 would never
   settle. `buildRecord` now validates exactly as `hydrateState` does.
2. **`readRecord` hid a descriptor instead of reporting it.** Filtering
   non-`PersistedValue` entries at the parse layer made a persisted
   `{kind:'binding'}` look like an absent variable, so the "unsafe" reason could
   never be produced and the record was never repaired. Values are now read as
   `unknown` and refused per variable with a reason.
3. **The new spec broke the host typecheck.** `tsconfig.json` excludes every
   DOM-dependent test by name; the new `tests/openui-state.spec.tsx` was in
   neither list, so the host project compiled `card-state.ts` without `lib.dom`
   and failed on `window`. Registered in both `include` and `exclude`, the way
   every other DOM spec is.

Measured: `npx vitest run` = 602 passed / 15 failed, failure set byte-identical
to the stage-2 baseline (+26 passed, +0 failed). Both `tsc` projects exit 0. In
the browser, a Slider dragged 3 → 6 still read 6 after three reloads.

**One finding that outlives this ADR:** `TurnCards` collects cards with
`visualizeMetaFrom`, which rejects `kind: 'intelligent_ui'`, so an OpenUI card is
not repeated on the turn tail the way an HTML card is. It is outside this
decision's scope and is recorded in `session-log.md` §6 rather than fixed here.

## What this ADR does not decide

- Button action steps (`@Set`/`@Reset`), which write state by a different
  path (`evaluate.ts:98-101`) — their persistence is the *same* record, but
  the action mechanism is stage-3 item 2 and is not designed here.
- Widening the 8/48 component table.
- Any change to persisted `tool/result` meta, which stays ADR-003's.

## Evidence for this ADR

| Claim | How it was established |
| --- | --- |
| `cardStates` is `localStorage`, one entry per card | `card-state.ts` read in full |
| HTML state is frame-authored | `viz-helper.ts:255-349`, `VisualizeCard.tsx:292-304` |
| OpenUI state is host React state | `OpenUICard.tsx:540-547` |
| `stateDefaults` is state-independent | `evaluate.ts:78-79`, `:264-282`, `:807-813` |
| `readReference` does not type-check | `evaluate.ts:302-308` |
| Path is content-addressed | `legacy-tool.ts:321`, `:498-519` |
| Two views share one key | `TurnCards.tsx:245-251` vs `VisualizeCard.tsx:610` |
| Destroy does not delete | `frame-state.spec.tsx:214-237` |
| Existing suite is green | `npx vitest run tests/card-state.spec.ts tests/frame-state.spec.tsx` → 25/25 passed, 2026-11-02 |
