# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: semver. Nothing is tagged yet.

This file is written for people who use the plugin. The reasoning behind each
decision lives in `docs/decisions/`, and the per-stage evidence in `docs/reports/`;
neither belongs here.

## [Unreleased] — 0.1.0 release candidate

### Added

- **One `visualize` tool with a `backend` argument**, replacing the two tools the
  predecessor plugins registered. `backend: "html"` draws a sandboxed HTML
  fragment; `backend: "openui"` draws an openui-lang program as host components.
  The model picks; the host routes; both backends share one store, one theme and
  one replay path.
- **The full openui-lang component set: 48 of 48.** Text, Layout, Inputs, Media,
  Drawing and Disclosure groups, including `Chart`, `Table`, `Icon`, `Image`,
  `Popover`, `Carousel`, `Flashcard` and `Celebration`. A name that is not in the
  component table can never become an element.
- **73 language functions**, including `@Format` for numbers, currency, percent and
  compact notation.
- **Interactive state.** `$state` persists across a reload and is scoped per card;
  Sliders, checkboxes, text inputs and buttons all write it through one path.
- **`@CopyToClipboard(text)`.** Copies on a user press, and the Button shows the
  exact text it will copy — in full, never truncated. Capped at 32 KiB, refused
  rather than truncated above that. A refused permission says so; it never claims
  success.
- **`Link` opens an http(s) URL** — and only an http(s) URL. `javascript:`, `data:`,
  `file:`, `mailto:`, protocol-relative and relative targets render as plain text.
- **A skill section generated from the signature tables**, so what the model is
  taught cannot drift from what the renderer draws without a test failing.
- **SVG drawing components** with a closed attribute allowlist. Path data,
  transforms and point lists are validated by their own grammars with length and
  complexity caps; an out-of-grammar value renders as a refusal notice.
- **`Popover`** positions itself inside the card rather than floating over the host
  document: no portal, no focus trap, closes on Escape or an outside press, and
  restores focus to its trigger. Two cards on one page do not interfere.

### Refused, deliberately

Two actions are declared by the language and refused when a program names them.
A Button carrying one renders normally and, when pressed, says which name is
unavailable and why — it does not silently do nothing.

- **`@OpenUrl`** — deferred on a premise that no longer holds: the host does
  expose a mediated open, `ctx.sidebarRight.openTab('browser', { params: { url } })`,
  and it is the call the host's own link gesture makes. It is still not this
  action. It docks a tab inside the DSH window instead of opening the page in the
  reader's browser, and an iframe refusal in that tab is unobservable — the silent
  failure ADR-014 exists to prevent. `window.open` from card code stays forbidden
  by ADR-004. Before it ships: the action keeps its meaning — open an external URL
  — and waits on an upstream plugin-callable open-external API; it is not quietly
  re-pointed at the sidebar. Use `Link` instead, which navigates on a press the
  reader makes themselves.
- **`@ToAssistant`** — refused, but not because the host cannot submit a turn.
  The contract already gives every session-scope card `inputActions`, and role
  escalation is structurally impossible because the host builds the message source
  itself. What no host API supplies is the two ADR-015 properties that decide this
  action: the turn would carry no visible attribution (`rpcId` is dedupe-only and
  never rendered), and there is no confirmation the card cannot fake — a
  card-drawn dialog is the card's own surface, which is exactly what the ADR
  forbids. Before it ships: an upstream card-attributed source the transcript
  renders, and a plugin-callable consent surface. Neither requirement is dropped
  in the meantime.

Both are recorded as deferred with their conditions for a future implementation
written down (ADR-014, ADR-015), so they can be evaluated rather than
rediscovered.

### Fixed

- **A card drawn through `run_code` settled as `tool/ptc-dispatch`** rather than
  `tool/result`, so it rendered inside the fold and never reappeared under the
  turn's answer.
- **`Code`'s copy button reported success unconditionally.** A denied permission
  told the reader the clipboard held their code when it did not. It now reports
  all three outcomes.
- **`Celebration` never fired for `Celebration($done)`.** A bare variable arrived
  as a binding object, and treating that object as a boolean made the condition
  constantly true, so the false-to-true transition it waits for never happened.
- **`Action([...])` was refused by the validator** while the skill text taught it,
  so a model that obeyed the prompt was rejected and one that guessed was not.
- **A lone Button was centred** in an OpenUI card.
- **The client bundle registered the pre-fork package id**, so the host loaded it
  without registering and the plugin never activated.

### Known issues

- **15 test failures on Windows**, every one a filesystem or path behaviour of
  that host: `EPERM` creating symlinks (6), a literal `~` in a path (4), a
  drive-qualified path joined onto another (1), `EPERM` renaming over an open
  file (1), a fixture mock that predates a call site (1), a 5 s timeout (1), and
  a description fixture with no skill provider registered (1). Root causes and
  what each leaves unverified: `docs/testing/PLATFORM-FAILURES.md`.
- **No CI.** Cross-platform behaviour is read from the code rather than measured.
- **Maps, image search, maths and embeds** are not implemented.
- **`Code` has no syntax highlighting**, deliberately: it would mean shipping a
  highlighter into the host origin for a cosmetic gain.
- **`@CopyToClipboard` cannot be composed** inside `Action([...])`. A composed run
  has not been measured for whether the browser's user activation survives to the
  clipboard call, so it is refused rather than attempted.
- **Cross-generation history replay** is blocked on a host-compatible log.