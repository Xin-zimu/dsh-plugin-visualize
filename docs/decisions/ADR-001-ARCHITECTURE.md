# ADR-001 — Unified host with two render backends

- **Status:** accepted
- **Date:** 2026-11-02
- **Supersedes:** —

## Context

Two finished DSH plugins implement interactive answers with incompatible
approaches, and a third project demonstrates capabilities neither has:

- **dsh-visualize** owns the host integration (tool registration, card store,
  sandboxed frame + CSP, fragment linter, lint gate, image embedding, self-repair,
  style system, turn-tail replay) but can render only model-written HTML. Because
  every layout is hand-written, it needs a 1,817-line linter and a same-turn
  repair loop to stay usable.
- **dsh-intelligent-ui** has the opposite trade: a constrained language and a
  component library mean the model cannot produce a broken layout, but the
  library bounds what it can produce, and it brings no host integration.
- **open-intelligent-ui** is a Next.js application with capabilities the other
  two lack (maps, image search, sandboxed sub-documents, maths). It cannot be
  installed into DSH at all.

## Options

- **A. Merge the two plugins' source into one tree.** Fastest to start; couples
  the language parser to the HTML execution environment, and every future change
  to one risks the other.
- **B. Keep two plugins, install both.** Works today with no code. The model
  faces two tools with two schemas, two stores, two replay paths; the user gets
  whichever the model happens to pick; and there is nowhere to add a third.
- **C. Unified host, pluggable backends.** One tool, one store, one replay path,
  one theme; each renderer behind a common contract.

## Decision

**C.** The host keeps everything shared; each backend owns exactly two things —
deciding whether a request is renderable, and describing the card it produces.

## Consequences

- A neutral vocabulary is needed (`RenderRequest`, `RenderDescriptor`,
  `Diagnostic`) and must stay free of either backend's representation.
- A versioned envelope is needed so a card outlives the code that drew it.
- The tool's wire name and result shape must stay compatible with the cards and
  calls already in session logs.
- The HTML backend keeps its sandbox and CSP unchanged; the OpenUI backend keeps
  whitelist evaluation. Neither inherits the other's weaknesses.
- A third backend becomes a registration rather than a second tool.

## Re-evaluate when

DSH changes its tool registration or its client slot contract incompatibly, or a
backend needs a capability the contract cannot express without leaking its own
representation into `core/`.
