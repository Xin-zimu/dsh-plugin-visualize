# ADR-002 — One tool, backend chosen by argument

- **Status:** accepted
- **Date:** 2026-11-02
- **Supersedes:** —

## Context

The two predecessor plugins registered different tools: `visualize` (client
slot key `visualize`) and `intelligent_ui` (slot key `intelligent_ui`). After
ADR-001 there could be one tool or two.

## Options

- **A. Two tools, one per backend.** Each keeps a clean schema. The model must
  learn two tools and choose between them with no shared rule; the prompt pays
  for two descriptions; and a third backend means a third tool.
- **B. One tool, backend inferred from the argument shape.** No new parameter,
  but the model has to guess what the host will infer, and a malformed call has
  two possible readings.
- **C. One tool with an explicit `backend` argument.** Slightly more for the
  model to write; the choice is explicit, testable, and visible in the session
  log.

## Decision

**C.** `visualize({ backend, source, title, mode, ... })`.

- `source` carries the backend's own document: an HTML fragment for `html`,
  an openui-lang program for `openui`.
- `fragment` remains accepted as an alias of `source`, so calls written before
  the fork still run.
- Omitting `backend` uses the first registered backend, which is `html`. That
  keeps the pre-fork behaviour byte for byte.
- The `backend` enum is built from the registry, so a build that ships one
  backend cannot offer the other.
- The skill teaches the choice; the tool description repeats it briefly.

## Consequences

- The streaming preview and the persisted meta carry one string either way,
  so the client needs no new transport for a second backend.
- The turn-tail collector receives cards from either backend through the same
  path.
- History compatibility is explicit: legacy `visualize` metas are HTML, legacy
  `intelligent_ui` metas are OpenUI. See ADR-003.

## Re-evaluate when

A backend needs a fundamentally different interaction (not a document the host
stores, but a session it drives). That would be a new tool, not a new argument.
