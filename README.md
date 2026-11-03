# dsh-unified-visualize

One DSH plugin that turns a model's answer into an interface you can use, with
two renderers behind one tool.

```
visualize({ backend: "html",   source: "<div id='sim'>…</div>" })
visualize({ backend: "openui", source: "root = Col([Slider($n, 0, 10)])" })
```

The first is a sandboxed HTML fragment — anything the model can draw. The
second is an openui-lang program rendered from a component library — no layout
to get wrong. The model picks, the host routes, and both cards share one store,
one theme and one replay path.

## Status

**Version 0.1.0, unreleased. Stage 4A-2 of 5.**

| Works today | Not yet |
| --- | --- |
| One `visualize` tool, both backends registered | 29 components (4A-3 … 4A-5) |
| HTML cards, unchanged from upstream | `@OpenUrl` / `@CopyToClipboard` / `@ToAssistant` (refused by name, 4B) |
| OpenUI programs are evaluated and drawn as host components — **19 of 48** | Cross-generation history replay (blocked on a host-compatible log) |
| `$state` persists across a reload; Button actions change it | `Popover` (the only component that overlays the host document, 4A-5) |
| Layout primitives and the whole Text group, verified in both themes | Maps, image search, maths, embeds |
| `Link` opens an http(s) URL — and only an http(s) URL (ADR-008) | Inline syntax highlighting in `Code` (deliberately absent) |
| Legacy calls and legacy cards still work | |

Read `session-log.md` for the dated truth. It is the only file that says what
is actually true right now. `docs/specifications/COMPONENT_CATALOG.md` lists every
component and whether the renderer draws it.

## Install

Not published yet. From a checkout:

```sh
dsh plugin --profile desktop add "$(pwd)"
dsh --profile desktop --dump-config   # expect an id: dsh-visualize-unified row
```

Restart DSH, then ask for something worth looking at.

## For agents

Read, in order: `HANDOFF.md` → `AGENTS.md` → `session-log.md` → `STAGE.md` →
`PLAN.md`. `AGENTS.md` is binding: it defines what "implemented" and "verified"
may be used to mean here.

`HANDOFF.md` exists because two things a new session needs are not in the usual
documents: the working tree currently carries accepted-but-uncommitted work (so
`AGENTS.md` §2's "stop on a dirty tree" does **not** apply), and the browser
harness's daemon, server and session are all session-bound processes that must be
re-created before any measurement.

## Where everything is

| Question | File |
| --- | --- |
| What do I need before my first command? | `HANDOFF.md` |
| What is this project for? | `PLAN.md` |
| What are we doing right now? | `STAGE.md` |
| Where did the last session stop? | `session-log.md` |
| How do I work in this repo? | `AGENTS.md` |
| How do I verify in a browser? | `docs/testing/BROWSER_HARNESS.md` |
| How are the layers organised? | `docs/architecture/SYSTEM_ARCHITECTURE.md` |
| Where did this code come from? | `docs/upstream/UPSTREAM_BASELINE.md`, `MIGRATION_MATRIX.md` |
| Why is it built this way? | `docs/decisions/ADR-00*.md` |
| What is tested, and what fails? | `docs/testing/TEST_PLAN.md`, `evidence/` |
| What is in the language? | `docs/specifications/` |

## Licence

BSD-3-Clause. This is a fork; see `NOTICE` for the three upstream projects, and
`upstream/` for their pinned sources.
