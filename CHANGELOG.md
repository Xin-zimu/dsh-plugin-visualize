# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: semver.

This file is written for people who use the plugin. The reasoning behind each
decision lives in `docs/decisions/`, and the per-stage evidence in `docs/reports/`;
neither belongs here.

## [0.1.1] — 2026-11-06

A patch release. No new components and no new actions: three **product defects**
that v0.1.0 shipped are fixed, each of which had been classified as a Windows
platform difference and accepted as one. They were found by investigating the 15
test failures instead of counting them.

### Fixed

- **A card the tool had just created could not be patched on Windows.** The tool reports
  a stored card's path with the home directory shortened to `~`, and on Windows that form
  is `~\AppData\…` — but the code that accepts a path back only understood `~` or `~/`.
  So the model was handed a path that would be refused when it returned it. Any Windows
  user whose DSH home or workspace sits under their home directory was affected, which is
  the normal case. Both path readers now accept either separator.
- **A cancelled call still did all of its work.** The abort check ran after image
  resolution returned, and image resolution never checked at entry, so a call cancelled
  before it started still read the workspace, fetched images and wrote to the store — then
  threw the result away.
- **Creating the same card concurrently could fail on Windows.** The atomic-write helper
  assumed distinct temporary names were enough for concurrent renames to both land. On
  Windows a second rename onto a live destination can return `EPERM`; under contention 1–3
  of 8 concurrent writes failed. The rename is now retried briefly, with `EEXIST`
  deliberately excluded — for a rename it means the destination is a directory, and no
  retry fixes that.

### Changed

- **Four containment tests no longer run on a Windows machine without Developer Mode.**
  They need to create a file symlink, which needs a privilege the test cannot grant
  itself. They are not deleted and their assertions are unchanged: they skip with the
  missing privilege named, and they run on CI on both platforms. Six other containment
  tests used to fail for the same reason and now run everywhere, because a directory
  junction is a real reparse point that needs no privilege and exercises the same check.
- **The test-only `timeout` cause classification no longer calls itself a slow machine.**
  The one instance this project had was an unawaited rejection behind a test that waited
  on a promise nothing could resolve; calling it "slow" would have been permanently
  wrong.

### Test results

`946` tests, **946 passed, 0 failed** on Linux and on Windows CI; `942 passed / 4 skipped`
locally on a Windows machine without symlink privilege, where the four are exactly the
tests that need it. At v0.1.0 the same suite was `924 passed / 15 failed / 939` on that
machine.

### Verified in a real host, not only by the suite

The unit suite cannot show that a Windows user can create and then patch a card,
so the release build was driven through a real DSH host whose harness home sits
**under** the user's home directory — the condition `displayOf()` shortens a path
under, and therefore the only condition in which the first defect can fire:

- A model turn created a card and patched it in the same turn by handing back the
  path the tool had reported, verbatim (`~\AppData\Local\Temp\…`) — the native
  Windows form, which is the form that was broken. The patched text is on disk.
- The POSIX `~/` form is covered at reader level rather than in that run: the same
  two functions accept it (it was never broken), and the unit tests pin it.
- The same `~\` path was **refused** by the v0.1.0 code and accepted by v0.1.1,
  extracted side by side and run on the identical string — so the pass is not an
  artefact of the test never having exercised it.
- 16 traversal attempts through the widened reader still escape nowhere.
- After a reload the conversation is still readable and no history-error banner
  appears. (The cards themselves are drawn in the conversation's frames, not as
  elements the probe counts, so this run speaks to the conversation, not to a
  card count.)

## [0.1.0] — 2026-11-06

First release. The plugin is usable for its stated scope: one `visualize` tool,
two render backends, 48 of 48 OpenUI components, and three external actions of
which one ships.

Two actions are declared and **refused by design** — `@OpenUrl` and
`@ToAssistant`. They are not forgotten and not half-built. Each has an ADR
recording what a host would have to provide, and the stated reasons were
corrected in this release after re-testing them against the installed host
(ADR-014 §10, ADR-015 §10). Both were deferred on the premise that the host
exposes no relevant API; that premise was false, and the corrections are
recorded rather than quietly edited away. The verdicts did not change:
a sidebar tab is not an external open, and no host API gives a card-submitted
message visible attribution or a confirmation the card cannot fake.

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

- ~~**15 test failures on Windows**~~ — **RESOLVED after 0.1.0, in stage 6.** Three of
  them turned out to be product bugs, not platform behaviour; see "Unreleased" below.
  The original entry is kept for the record: **15 test failures on Windows**, every one a
  filesystem or path behaviour of that host: `EPERM` creating symlinks (6), a literal `~` in a path (4), a
  drive-qualified path joined onto another (1), `EPERM` renaming over an open
  file (1), a fixture mock that predates a call site (1), a 5 s timeout (1), and
  a description fixture with no skill provider registered (1). Root causes and
  what each leaves unverified: `docs/testing/PLATFORM-FAILURES.md`.

  Each was adjudicated against four release-admission criteria rather than
  waved through as "no regression": **13 are platform-shaped, 2 are fixture
  defects**, and none contradicts an expectation about the renderer or the
  clipboard action. Three caveats are carried with the release rather than
  hidden: six symlink-containment tests cannot run on a stock Windows machine, so
  CI covers them; one 5,020 ms timeout has no diagnosis yet; and 12 of the 15 sit
  in modules this release ships, so "out of scope" is not an available argument.
  Full reasoning: `docs/testing/FAILURE-ADJUDICATION.md`.
- **CI covers Linux and Windows** (`.github/workflows/verify.yml`). It is not
  decoration: six symlink-containment tests cannot run on a stock Windows machine,
  so that class of defect is caught there rather than locally.
- **Maps, image search, maths and embeds** are not implemented.
- **`Code` has no syntax highlighting**, deliberately: it would mean shipping a
  highlighter into the host origin for a cosmetic gain.
- **`@CopyToClipboard` cannot be composed** inside `Action([...])`. A composed run
  has not been measured for whether the browser's user activation survives to the
  clipboard call, so it is refused rather than attempted.
- **Cross-generation history replay** is blocked on a host-compatible log.