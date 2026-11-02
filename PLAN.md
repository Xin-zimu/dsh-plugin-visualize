# PLAN.md — what this project is

Long-lived. Changes only when the project's goal or architecture changes, and
then only alongside an ADR.

## Why this exists

Three projects solved overlapping parts of one problem and could not be used
together:

- **dsh-visualize** — a finished DSH plugin. It owns everything a card needs to
  be safe and durable, but it can render exactly one thing: a model-written HTML
  fragment. Every layout a card shows, the model writes by hand, so it needs a
  1,800-line linter and a same-turn self-repair loop to catch the mistakes that
  hand-written HTML reliably produces.
- **dsh-intelligent-ui** — a finished DSH plugin with the opposite trade. A
  constrained language and a component library mean the model cannot produce a
  broken layout, but it also cannot produce anything the 48 components do not
  cover, and it has none of the host integration above.
- **open-intelligent-ui** — not a plugin. A Next.js application demonstrating
  the same idea with capabilities the other two lack: maps, image search,
  sandboxed HTML-in-HTML, maths. It cannot be installed into DSH.

A user who wants "can it draw things" currently has to choose which half of the
answer to lose.

## What we are building

One DSH plugin, one tool, several render backends.

```
model ──▶ visualize({ backend, source }) ──▶ host core ──▶ backend A | backend B
```

The model faces one tool. The host picks the renderer. Adding a third backend
is a registration, not a second tool, a second store, or a second replay path.

## Goals and acceptance

| Goal | Acceptance |
| --- | --- |
| Unified host | One DSH plugin to install; one `visualize` tool registered |
| Two backends | An HTML fragment and an openui-lang program both render |
| Session compatibility | Calls and cards written before the fork still replay |
| Extensibility | A third backend needs only `core/registry.ts` plus its own module |
| Security preserved | Each backend keeps its own boundary; neither is weakened |
| Maintainability | Each backend is testable and upgradable without the other |

## In scope

- The unified tool, its registry, its router and its persisted envelope.
- The HTML backend, inherited from dsh-visualize, kept working unchanged.
- The openui-lang language core and its renderer, inherited from
  dsh-intelligent-ui.
- Capability parity work driven by open-intelligent-ui: maps, image search,
  sandboxed sub-documents, maths, embeds — each gated by its own security review.
- One skill that teaches both dialects and how to choose between them.

## Out of scope

- Shipping open-intelligent-ui's Next.js application, its API routes, or its
  React 19 runtime. It is a reference for capability design, not a code source.
- A second tool per backend. Rejected in ADR-002.
- Executing model-authored programs with `eval` or `new Function`, in any
  backend. Rejected permanently in ADR-004.
- Web/desktop parity beyond what DSH itself provides: cards remain a Web-only
  surface, and degrade to text elsewhere.

## Architecture in one paragraph

`core/` holds the vocabulary (`render-contract.ts`), the registry, the router
and the tool. `backends/<id>/` holds one renderer each, and knows nothing about
the others. `client/` keeps the host's card shell, theme, state and replay. The
persisted `RenderDescriptor` is a versioned envelope: it names the backend and
carries that backend's own fields opaquely, so a card outlives the code that
drew it. See `docs/architecture/SYSTEM_ARCHITECTURE.md`.

## Final acceptance

The project is done when a user installs one plugin and, in one session, the
model answers a request with a hand-built interactive simulation and a second
request with a component-library form, both render, both survive a reload, and
both replay from the session log without the model being called again.
