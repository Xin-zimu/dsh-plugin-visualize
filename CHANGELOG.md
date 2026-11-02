# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: semver. Nothing is released yet.

## [Unreleased]

### Added

- Unified `visualize` tool with a `backend` argument, replacing the two tools
  the predecessor plugins registered.
- Backend contract (`RendererAdapter`: `validate` + `describe`), registry and
  dispatcher. `core/` imports no backend.
- HTML backend as an adapter over the inherited fragment linter and frame; its
  rules and its sandbox are unchanged.
- openui-lang backend: tokenizer and parser ported to TypeScript, signature
  tables, and a skill section generated from those tables.
- Versioned `RenderDescriptor` envelope, read alongside the flat pre-fork
  fields so cards from either generation replay.
- Compatibility entry so the pre-fork `visualizeTool(ctx, maxBytes, style,
  images)` call shape still works.
- 29 tests covering the contract, the router, both validators, and nested
  dispatch.

### Fixed

- A card drawn through `run_code` settled as `tool/ptc-dispatch` rather than
  `tool/result`, so it rendered inside the fold and never reappeared under the
  turn's answer. The turn-tail collector now accepts both event types and
  attributes a nested dispatch to the turn of its enclosing call.

### Known issues

- An openui card does not render yet: the client still requires
  `kind: 'visualize'`. Stage 3.
- No evaluator (stage 2); 8/48 components and 17/73 functions.
- 15 inherited test failures on Windows (CRLF and symlink assumptions);
  identical in the upstream baseline. See `docs/testing/TEST_PLAN.md`.
