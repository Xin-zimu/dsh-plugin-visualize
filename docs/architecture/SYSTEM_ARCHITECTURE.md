# System architecture

The authoritative description of the layers. `PLAN.md` says why; this says how.

## Layers

```
┌─ model ─────────────────────────────────────────────────────────────┐
│ visualize({ backend, source, title, mode, ... })                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─ host core ─ src/core/ ─────────────────────────────────────────────┐
│  render-contract.ts   the neutral vocabulary                        │
│  registry.ts          id → RendererAdapter                          │
│  dispatcher.ts        resolve → validate → describe                 │
│  legacy-tool.ts       the one tool, wire-compatible                 │
└──────────────────────────────┬──────────────────────────────────────┘
        ┌──────────────────────┴───────────────────────┐
        ▼                                              ▼
┌─ backends/html/ ────────┐              ┌─ backends/openui/ ─────────┐
│ renderer.ts             │              │ renderer.ts                │
│  ↳ fragment.ts, lint.ts │              │  ↳ tokenize.ts → parse.ts  │
│  ↳ lint-gate.ts         │              │  ↳ signatures.ts           │
│ shell.ts (frame + CSP)  │              │ (evaluate.ts — stage 2)    │
└─────────────────────────┘              └────────────────────────────┘
        └──────────────────────┬───────────────────────┘
                               ▼
┌─ host services ─────────────────────────────────────────────────────┐
│ storage.ts (per-session card store)   images.ts (SSRF-guarded)      │
│ style*.ts (5 styles + user files)     self-repair.ts (turn boundary)│
└──────────────────────────────┬──────────────────────────────────────┘
                               ▼
┌─ client ─ src/client/ ──────────────────────────────────────────────┐
│ VisualizeCard, StreamingPreview, TurnCards, settings, card-state    │
└─────────────────────────────────────────────────────────────────────┘
```

## The contract

```ts
interface RendererAdapter {
  readonly id: BackendId          // 'html' | 'openui'
  readonly label: string          // named in the tool description and result
  validate(request: RenderRequest, limits: RenderLimits): ValidationResult
  describe(request: RenderRequest): RenderDescriptor
}
```

**`validate`** is pure: it reports blocking errors, advisory warnings, and the
measured size. A blocking error becomes a `RenderRejected` **before anything is
written**, so a refused call leaves no file, no meta, no half-card.

**`describe`** produces the persisted envelope. The backend's own fields ride
in `payload`, opaque to `core/`; nothing outside the backend interprets them.

That split is the whole design. A backend cannot route, cannot store, cannot
theme, cannot replay — because it is never given the chance.

## The registry, and the default

`createRegistry([htmlBackend(...), openuiBackend()])` — order matters.
`defaultBackend()` returns the first, so a call with no `backend` reaches HTML,
exactly as it did before the fork. The tool's `backend` enum is generated from
`registry.ids()`, so a build that ships one backend cannot advertise the other.

## What stays shared, and must

| Concern | Owner | Why not a backend |
| --- | --- | --- |
| Card storage | `storage.ts` | One path per card, one place for path safety |
| Images | `images.ts` | The SSRF guard must not be reimplemented per backend |
| Word choice / result text | `dispatcher.ts` | The model should not learn two vocabularies |
| Style, theme, chart defaults | `style*.ts` + frame CSS | A card must look like a card |
| Replay | `TurnCards.tsx`, `fragment.ts` | One replay path or old sessions break |
| Security envelope | `shell.ts` + ADR-004 | Two boundaries, but one owner of each |
| Outbound URLs a card may activate | `safeHref` in `OpenUICard.tsx` + ADR-008 | One allowlist, in one function, with one caller path — a second place that turns a value into an `href` is a second policy |
| Card identity and saved state | `card-state.ts` + `openui-state.ts` | One store, one eviction policy; per-backend record shapes (ADR-006) |

## One card, two surfaces

A settled card appears twice, on purpose: as the toolview row inside the turn's
process, and again on the turn tail under the final answer. The host folds a
finished turn's process by default, so the tail copy is the one the reader sees.

Both surfaces read the card from the same one descriptor dispatcher
(`visualizationFrom`), and both derive the saved-state key through the same
helpers (`cardStateKey`, `stateKeyFor`). That is what makes "one card, one state"
true rather than aspirational:

```
tool/result meta ──▶ visualizationFrom ──▶ kind: 'visualize'   ──▶ Frame ─────┐
                                     └──▶ kind: 'intelligent_ui' ──▶ OpenUICard ┤
                                                                               │
                         cardStateKey(session, path, callId) ◀─────────────────┘
                         stateKeyFor(meta, session, callId)      (openui: + ':openui')
```

Anything reading a card with a narrower reader than `visualizationFrom` silently
drops one backend. `TurnCards` did exactly that until P3-06: it called
`visualizeMetaFrom`, which rejects `kind: 'intelligent_ui'`, so an OpenUI card
rendered only inside the fold — present in the DOM, and invisible in the
conversation.

## One state loop, one writer

Every OpenUI state change goes through `WriteChannel` on the card, whether a
Slider produced it or a Button's action did:

```
Slider onChange ──▶ write(name, value) ──┐
                                         ├──▶ setState ──▶ evaluateProgram ──▶ tree
Button onClick ──▶ applyAction(...).patch ┘                        │
                                                                   ▼
                                                    openui-state record ──▶ cardStates
```

`applyAction` is **pure**: it reads the program's declared defaults and returns
a patch plus diagnostics, and never writes. That is what lets the same record,
caps, eviction and validation rules serve both controls, and why the dispatcher
can be tested without a DOM.

Actions are values, not code. An action step arrives from the evaluator as
`{ kind: 'element', name: '@Set', args: [...] }` — the same shape as a
component — so `drawValue` hands it through untouched and the dispatcher decides
what it means. Resolving it as a component would yield `null` and the Button
would silently receive no action at all, which is exactly the defect this phase
had to fix twice: once in the walker, once in the story.

Scope, and why the boundary sits there: `@Set`, `@Reset` and `Action([...])` only
touch local state. `@OpenUrl`, `@CopyToClipboard` and `@ToAssistant` reach
outside the card, so each needs its own security review and none is implemented.
They are listed in one set that the dispatcher refuses by name — a refusal that
can be asserted on, rather than a silent no-op.

## Data flow of one call

1. The model calls `visualize`.
2. `resolveBackend` maps `backend` to a registered adapter, failing loud on a
   name this build lacks.
3. For an update, the stored card is read and patched; for a create, `source`
   is taken as given.
4. The HTML backend's fragment linter runs **first** when the backend is
   `html` — it owns the retry-loop guard and the more specific rejection text.
5. `dispatch` asks the backend to validate. Errors throw; warnings are kept.
6. Images resolve before anything is written.
7. The card is written, the descriptor is projected into persisted meta.
8. The client renders it; on replay it is read back from meta alone.

## Where the current gaps are

| Gap | Consequence | Closed by |
| --- | --- | --- |
| 8/48 components render | The OpenUI dialect draws a fraction of what it understands | Stage 4 |
| `@OpenUrl`, `@CopyToClipboard`, `@ToAssistant` are refused | A card cannot open, copy or message | Stage 4, each after a security review |
| `core/` has no backend-specific tests for images | An openui card with images is unexercised | Stage 3 |

Closed: no evaluator (stage 2); the client rejected `kind: 'intelligent_ui'`
(stage 3); `$state` was not persisted (ADR-006); the turn tail dropped OpenUI
cards (P3-06); Button actions were inert (P3-07).

See `session-log.md` §3 for the current, dated version of this list.
