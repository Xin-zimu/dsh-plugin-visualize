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

**Version 0.1.0, release candidate. Stages 4A and 4B complete; stage 5 audit in**
**progress. Not yet tagged.**

| Works today | Not yet |
| --- | --- |
| One `visualize` tool, both backends registered | `@OpenUrl` — no host-mediated open exists (ADR-014) |
| HTML cards, unchanged from upstream | `@ToAssistant` — no host submit API exists (ADR-015) |
| OpenUI programs drawn as host components — **48 of 48** | Cross-generation history replay (blocked on a host-compatible log) |
| `$state` persists across a reload; every input writes it | Maps, image search, maths, embeds |
| 73 functions and the whole Text, Layout, Inputs, Media, Drawing and Disclosure groups, measured in both themes | Inline syntax highlighting in `Code` (deliberately absent) |
| `Link` opens an http(s) URL — and only an http(s) URL (ADR-008) | Composing `@CopyToClipboard` inside `Action([...])` |
| `@CopyToClipboard` copies the text the control shows, on a press (ADR-013) | |
| Legacy calls and legacy cards still work | |

The two refused actions are **declared by the language and refused at dispatch**,
deliberately: a program naming one validates rather than failing to parse, and the
Button then explains the refusal when pressed instead of doing nothing. See
`docs/specifications/COMPONENT_CATALOG.md` §Actions.

Read `session-log.md` for the dated truth. It is the only file that says what
is actually true right now. `docs/specifications/COMPONENT_CATALOG.md` lists every
component and whether the renderer draws it.

## Install

Not on npm yet. From a checkout:

```sh
git clone https://github.com/Xin-zimu/dsh-plugin-visualize
cd dsh-plugin-visualize && pnpm install && pnpm run build
dsh plugin --profile desktop add "$(pwd)"
dsh --profile desktop --dump-config   # expect an id: dsh-visualize-unified row
```

**Build before adding.** `dsh plugin add` copies `lib/` at install time, so a
build made afterwards leaves the profile on the old bundle and the browser then
behaves exactly as the unfixed build would. If a change appears to have no effect,
compare the two hashes first:

```powershell
Get-FileHash lib/client.js -Algorithm SHA256
Get-FileHash <DSH_HOME>/profiles/<profile>/node_modules/@dsh-unified/visualize/lib/client.js -Algorithm SHA256
```

Restart DSH, then ask for something worth looking at.

### Uninstall

```sh
dsh plugin --profile desktop remove @dsh-unified/visualize
```

Cards already in a transcript stay readable: a card carries its own program,
and the HTML backend's frames are self-contained. Removing the plugin removes
the tool, not the history.

## Compatibility and limits

- **DSH** `>=0.2.1-alpha.4` (`engines.dsh`). The plugin uses `ctx.tools.register`,
  `ctx.fs`, `connection.fetch.register`, `ctx.inject(['settings'])` and
  `ctx.skills.registerProvider`; a host that lacks any of these fails to load it
  rather than degrading.
- **Browsers.** Verified on Edge 156. `navigator.clipboard.writeText` needs a
  secure context; on a non-secure origin `@CopyToClipboard` reports
  *"This browser has no clipboard access; nothing was copied"* instead of
  pretending it worked.
- **No `eval`, no `new Function`.** The OpenUI backend walks a fixed vocabulary.
  A name that is not in the component table can never become an element.
- **Verified on Linux and Windows.** CI runs the full suite on both and compares
  the results test by test: **939/939 pass on Linux, 932/939 on Windows CI**, zero
  skips on either, and no test failing on both platforms. The seven Windows
  failures are documented with their root causes in
  `docs/testing/PLATFORM-FAILURES.md`. A stock Windows box without Developer Mode
  sees fifteen rather than seven, because it cannot create symlinks.
- **The build is reproducible across platforms.** `lib/client.js` has the same
  SHA-256 whether it is built on Windows or Linux, and CI asserts that every run.

## For agents

Read, in order: `HANDOFF.md` → `AGENTS.md` → `session-log.md` → `STAGE.md` →
`PLAN.md`. `AGENTS.md` is binding: it defines what "implemented" and "verified"
may be used to mean here.

`HANDOFF.md` exists because two things a new session needs are not in the usual
documents: the working tree may carry accepted-but-uncommitted work (so
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

BSD-3-Clause; see `LICENSE`. This is a fork: `NOTICE` reproduces the three
upstream licences in full and `upstream/` holds their pinned sources.

The screenshots that used to sit under `evidence/` are not published — they were
full-window captures, and a public repo is the wrong place for another session's
desktop. The manifests, logs and measurements under `evidence/` are, and they
are what the claims actually rest on.
