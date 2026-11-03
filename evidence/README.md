# Evidence

Each directory here records what was run and what it produced. The authoritative
files are the **manifests** (`MANIFEST*.json`), the **transcripts**
(`test-*.txt`) and the **probe scripts**; those are what the claims in
`session-log.md` rest on.

## Screenshots are not published

`MANIFEST*.json` files refer to `.png` files under `screenshots/` and next to
their manifests. **Those images are deliberately absent from this public
repository.**

They were captured as full-window frames of a live DSH session, so each one also
contained conversation text, the model's reasoning, a sidebar listing unrelated
private projects, and an account display name. Publishing them would have
disclosed another session's desktop, which is not what the evidence is for.

The references are left in place rather than rewritten or deleted, because they
record exactly what was captured and when. If you are reading a manifest and
looking for its screenshot, the answer is: it existed, it was checked, and it
is not here.

## What each phase recorded

| Directory | Phase |
| --- | --- |
| `phase-1/`, `browser-phase-1/` | Host skeleton, sandboxed HTML card, first real-browser run |
| `phase-2/`, `browser-phase-2/` | openui-lang parser, evaluator and `@functions`; differential vs upstream |
| `phase-3/`, `browser-phase-3/` | `$state` persistence, turn-tail dispatch, Button actions |
| `phase-4a-1/` | Layout primitives: `Box`, `Grid`, `Divider`, `Spacer` |
| `phase-4a-2/` | The Text group |
| `infra-1/` | Test infrastructure |
| `publish/` | Pre-publication test run, after the history rewrite |
| `lib/` | The browser harness helpers (`cdp.mjs`, `probe.mjs`, `parity.mjs`) |

The harness these scripts drive is documented in
`docs/testing/BROWSER_HARNESS.md`. Note the rule in `AGENTS.md` §10: these
scripts expect a live CDP daemon and a DSH profile, so they do not run from a
cold clone — the transcripts are the durable record.
