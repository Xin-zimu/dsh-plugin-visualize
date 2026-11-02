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
| No evaluator | Programs are only checked for unknown names | Stage 2 |
| Client rejects `kind: 'intelligent_ui'` | openui cards fall back to text | Stage 3 |
| 8/48 components, 17/73 functions | The OpenUI dialect is a subset | Stage 2 |
| `core/` has no backend-specific tests for images | An openui card with images is unexercised | Stage 3 |

See `session-log.md` §3 for the current, dated version of this list.
