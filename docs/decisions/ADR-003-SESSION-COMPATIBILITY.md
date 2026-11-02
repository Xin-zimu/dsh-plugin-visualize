# ADR-003 — Versioned envelope with flat legacy fields

- **Status:** accepted
- **Date:** 2026-11-02
- **Supersedes:** —

## Context

Cards persist as `tool/result` presentation meta in the session log. Whatever
the fork writes must satisfy three readers at once:

1. Cards written **before** the fork by `dsh-visualize` (`kind: 'visualize'`,
   `fragment`, `path`, `style`).
2. Cards written **before** the fork by `dsh-intelligent-ui`
   (a program in the call's own arguments, read back from `argsRaw`).
3. Cards written **after** the fork, by either backend.

The client half reads `visualizeMetaFrom(meta)`, which requires
`kind === 'visualize'` and a string `fragment`.

## Options

- **A. Break the format, migrate old sessions.** Clean break; old conversations
  lose their cards. Unacceptable — replay is the product.
- **B. Keep the flat shape, add a `backend` field.** Compatible; but the shape
  is a backend's own naming, and a third backend would have to fit it.
- **C. Versioned envelope, with the flat fields kept beside it.** Compatible
  today, extensible tomorrow.

## Decision

**C.** Persisted meta carries both layers:

```jsonc
{
  "schemaVersion": 1,          // envelope
  "backend": "html",           // envelope
  "payload": { ... },          // the backend's own fields, opaque to core
  "kind": "visualize",         // flat: what today's client reads
  "fragment": "...",           // flat
  "path": "...", "style": "..." // flat
}
```

`descriptorFrom()` reads the envelope **and** the legacy shapes, so a card from
any generation produces a descriptor. The client keeps reading the flat fields
until stage 3 teaches it the envelope.

## Consequences

- New fields cost one line each and never require a migration.
- The flat layer is duplicated data until stage 3, and must stay in sync until
  then. That duplication is the price of replaying old conversations.
- Removing the flat layer is a future ADR, and only once the client reads the
  envelope and old sessions no longer matter.

## Known gap

The openui backend's cards carry `kind: 'intelligent_ui'`, which
`visualizeMetaFrom` rejects, so they fall back to generic text. The envelope is
correct; the client is one stage behind. Closing it is a stage-3 exit criterion,
not a redesign.
