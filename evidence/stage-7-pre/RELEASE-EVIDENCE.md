# v0.1.1 — release verification

Date: 2026-11-06. Base: `28b5a1d`. Release version: `0.1.1`.

This folder is the evidence for the *release*, not for a stage. The stage-6
evidence (`evidence/stage-6/`) proves the three fixes were made and that each
regression test was seen red first. This one answers a different question:

> **Does the artefact that would be published actually do the thing, in a real
> host?**

A unit suite green on 946 tests cannot answer that, and in this project's history
it has specifically failed to: 4A-2 shipped a broken `List` past 62 passing
assertions, and v0.1.0 shipped three product defects past 15 "known platform
failures". So the release gate is a real host run plus artefact-level controls,
and the suite is a floor.

## 1. The artefact

`lib/` was rebuilt from source and reproduced the CI artifact byte-for-byte:

| File | Local rebuild | CI `42154549753` | Match |
| --- | --- | --- | --- |
| `lib/client.js` | `e1bf4a82…31456ceb` | `e1bf4a82…31456ceb` | yes |
| `lib/index.js` | `d1fd5f84…1628f9` | `d1fd5f84…1628f9` | yes |

The `package.json` bump to `0.1.1` was re-built afterwards and **moved neither
hash** — the version does not enter the bundle.

**The build caught a stale artefact, which is the reason this check exists.**
Before the rebuild, `lib/index.js` was `8d4bc669…` and contained **zero**
occurrences of `expandDisplayPath` — the *pre-fix* server half. The installed
profile agreed with it: its `client.js` was current while its `index.js` was
pre-fix. All three stage-6 fixes are server-side, so a browser run against that
profile would have looked green while testing none of them. This is `AGENTS.md`
§9's failure mode, found on the server half rather than the client half, where
the §9 procedure had never been applied.

## 2. The host run — create, patch, reload (`browser-v011-mw4jk1aw.json`)

Two environment facts had to be established first, because without them the run
would have been vacuous:

1. **The harness home had to sit under the user's home directory.** `displayOf()`
   only shortens a path that starts with `homedir()`. The existing isolated
   profile lives at `tmp/dsh-p3`, *outside* `C:/Users/<user> so the `~`
   round-trip bug cannot fire there. A second harness home was created at
   `C:/Users/<user>\AppData\Local\Temp\dsh-v011` with the same profile and the
   rebuilt plugin, and the host ran on `:3094`. The original `:3093` host was
   left untouched. The probe refuses to run (exit 2) if the store is not under
   the home directory or the tab is not on the expected host.
2. **The bundle hash gate passed on both halves,** not just `client.js`, because
   the fixes are in the server half.

A real model turn then performed one `create` and one `update` in the same turn,
told to hand back the reported path verbatim.

| Check | Result |
| --- | --- |
| B1 both bundle hashes match the build | **PASS** (client and server) |
| B2 a card was created; the tool reported a `~\` path | **PASS** — `~\AppData\Local\Temp\dsh-v011\visualize\sessions\…whale.html` |
| B3 the same turn patched it via that `~\` path | **PASS** — `alphaOccurrences: 0`, `betaOccurrences: 1` on disk |
| B4 the conversation still renders after a reload | **PASS** — no `历史加载失败` banner |
| turn settled | yes (one poll refused as `document_changed`, retried, not counted as a failure) |

The run was repeated after a host restart in a fresh bsk session and passed
identically (`browser-v011-mw4eoqo.json` / `browser-v011-mw4jk1aw.json`), so it
is not a one-off.

## 3. The `~` fix is what earned it (`tilde-negative-control.json`)

A pass on the current code does not show the fix earned it. `ownedPath` and
`workspacePath` were sliced out of `v0.1.0`'s `storage.ts` (`git show`) and out of
the current tree, and both versions were run on the **identical** path strings
this host produced:

| Case | v0.1.0 | v0.1.1 |
| --- | --- | --- |
| store card, native `~\` form (**what the tool reported**) | **REFUSED** | accepted |
| store card, POSIX `~/` form | accepted | accepted |
| store card, absolute | accepted | accepted |
| workspace card, native `~\` form | accepted | REFUSED (correct — not inside that root) |

Containment against the widened reader: **16 attempts, 0 escapes** (`~`, `~\`,
`~/../secret.html`, `~\..\secret.html`, deep traversal in both separators,
`Windows/win.ini` via both forms).

## 4. The other two defects, at artefact level (`artefact-regression.json`)

Both are server behaviours with no card to look at, so the built `lib/index.js`
was driven directly through a mock ctx (the same seam `tests/tool.spec.ts` uses).

| Check | Result |
| --- | --- |
| **R2** a call aborted at entry does no work | **PASS** — 3/3 rounds threw `AbortError`, full recursive store listing identical before and after (`added: []` each time). Control: the same call with a live signal **did** create its card. |
| **R3** 8 concurrent creates onto one content-addressed name | **PASS** — 3/3 rounds: 8/8 fulfilled, exactly **1** distinct path (content-addressed, as designed), **0** leftover `.tmp` files |
| **R4** a historical card is still patchable via `~\` | **PASS** — cards written by earlier builds, copied into a scratch home, patched through the exact `~\` form; replacement on disk, original gone |

## 5. The controls that make R2/R3 mean something (`negative-controls.json`)

`AGENTS.md` §6: a guard never seen to go red is a guess. Each guard was run
against **v0.1.0's own extracted code** on the same inputs.

### R3 — bare `rename` vs retrying `rename`

v0.1.0's `writeFileAtomic` called `rename` directly (`oldCodeHasRetry: false`,
confirmed, not assumed). Both versions then took the same burst: **25 rounds ×
8 concurrent writes onto one destination**.

| | failed writes | rounds with a failure | error codes | leaked temp files |
| --- | --- | --- | --- | --- |
| **v0.1.0** | **32 / 200** | **22 / 25** | `EPERM` | 0 |
| **v0.1.1** | **0 / 200** | 0 / 25 | — | 0 |

This reproduces the CHANGELOG's recorded "1–3 of 8 concurrent writes failed" on
this machine, and shows the retry is what removes it. The old code's failure rate
(up to 3 in one round) matches the measurement the fix was written against.

Note on `leakedTempFiles`: 0 in both columns here. The leak in the original
finding was the *store*-level consequence of an abandoned temp file; in this
direct helper harness the failure path's `rm(temp)` runs. So this control proves
the rename failures, **not** the leak. The leak claim rests on the stage-6
evidence, and saying so is more useful than implying this covers it.

### R2 — entry abort check

| | first statement of `resolveCardImages` | checks the signal at entry |
| --- | --- | --- |
| **v0.1.0** | `const limits = options.limits ?? DEFAULT_IMAGE_LIMITS` | **no** |
| **v0.1.1** | `options.signal?.throwIfAborted()` | **yes** |

The one-line difference is exactly the fix, and the old version's first statement
shows it went straight to work.

## 6. What this does not prove

- **R2's control is a code-shape comparison, not a behavioural one.** The old
  version was not driven end-to-end under an aborted signal in this round; what is
  shown is that it had no entry check and that the current one does. The
  behavioural half (nothing written) is shown for v0.1.1 only.
- **The temp-file leak is not reproduced above.** See the note in §5.
- **One card per check.** The browser run created and patched one card and
  reloaded once. It is not a load test, and not a matrix of card styles.
- **Windows only.** The `~\` form is Windows-specific; the POSIX half is exercised
  through the `~/` case, but no Linux host was run.
- **R4 covered 2 cards, not 3.** Only 2 of the 23 historical cards yielded a
  patchable string by the probe's extraction heuristic. Both passed; the sample is
  small and is stated as such.
- **No `@OpenUrl` / `@ToAssistant` testing.** Both remain refused by design; this
  release does not touch them (ADR-014, ADR-015).

## 7. Files

| File | What it is |
| --- | --- |
| `browser-v011-mw4ezoqo.json`, `browser-v011-mw4jk1aw.json` | the two host runs, before and after the pause |
| `tilde-negative-control.json` | v0.1.0 vs v0.1.1 on identical paths, plus the 16 attacks |
| `control-v010.mjs`, `control-v011.mjs` | the two extracted path readers actually executed |
| `artefact-regression.json` | R2, R3, R4 against the built `lib/index.js` |
| `negative-controls.json` | the split-out old code and the side-by-side runs |
| `control-rename-v010.mjs`, `control-rename-v011.mjs` | the two `writeFileAtomic` bodies actually executed |
| `v011-full-suite.json`, `v011-full-suite.log` | local suite on the release candidate: 942 passed / 4 skipped / 946 |
