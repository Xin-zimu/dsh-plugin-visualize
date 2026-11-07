# Stage 7C workstream B — DSH 0.2.2-rc.1 compatibility

Date: 2026-11-07 · Result: **fixed in this repo; product JS unchanged** ·
Verified host: installed desktop `@deepseek-ai/dsh-desktop` **0.2.2-rc.1** (its
CLI reports 0.2.2-rc.1; the global `dsh` on PATH is 0.2.1-rc.5 and is *not* the
host under test).

## 1. Diagnosis — the real constraint

Two separate facts, not one "peer dependency problem":

1. **The declared peer ranges could never select 0.2.2.** `^0.2.1-0` matches
   `0.2.1-x` only. Under npm semver a prerelease is admitted by a comparator
   only when that comparator carries a prerelease on the *same*
   major.minor.patch tuple, so `0.2.2-rc.1` is not in `^0.2.1-0`. Checked with
   semver 7: `0.2.2-rc.1 satisfies ^0.2.1-0 → false`;
   `^0.2.1-0 || ^0.2.2-rc.1 → true`.
2. **That mis-selection caused the cordis conflict.** `dsh plugin add` installs
   the plugin's peer closure into the profile. With the old range, pnpm picked
   the newest 0.2.1 copies (**0.2.1-rc.5**), whose `@deepseek-ai/cordis` peer is
   `~4.0.5`, while the 0.2.2-rc.1 host runs cordis **4.1.0** → `pnpm peers check`
   failed (Gate 2 witness: `evidence/stage-7b/real-host/peer-dependencies.txt`).
   The 0.2.2-rc.1 npm packages declare `@deepseek-ai/cordis: ~4.1.0`
   (`01-install.txt`, and the six package manifests re-read from the registry).

So the conflict was **a range-selection bug, not a real incompatibility**: the
plugin's own cordis peer `^4.0.1` already admitted 4.1.0.

Corrected compile-baseline facts (the Lead flagged these; both re-checked here):

- 0.2.2-rc.1 **npm** packages ship `lib/types/*.d.ts` (e.g. `dsh-session`:
  10 `.d.ts` files in its tarball). The earlier "0.2.2 ships no .d.ts" claim
  came from the asar extraction, which omits them.
- every client devDependency the repo uses publishes 0.2.2-rc.1 under the same
  name, including `dsh-client-ui-slots` (real package: `main`/`types` present).

## 2. The change (minimal)

`package.json` only; no `src/` or `tests/` change, no `--force`, no `*`:

| Field | Before | After | Why |
| --- | --- | --- | --- |
| devDependencies `@deepseek-ai/dsh-*` | `0.2.1-rc.5` (12 packages) | `0.2.2-rc.1` | compile against the host's release; typings now exist on npm |
| devDependencies `@deepseek-ai/cordis` | `4.0.5` | `4.1.0` | match 0.2.2-rc.1's declared `~4.1.0` |
| peerDependencies, six `dsh-*` | `… \|\| ^0.2.1-0` | `… \|\| ^0.2.1-0 \|\| ^0.2.2-rc.1` | explicitly admits the 0.2.2 line; 0.2.1 stays admitted |
| peerDependencies `@deepseek-ai/cordis` | `^4.0.1` | unchanged | already admits both 4.0.5 and 4.1.0 |
| `schemastery` devDep | `3.18.5` | unchanged | `^3.18.1` peer already admits the host's 3.19.0 |

`pnpm-lock.yaml` updated by `pnpm install` (the 12 packages plus their closure).
Product output did **not** change: `lib/client.js` rebuilds to the same
SHA-256 the Gate 2 profile had installed,
`E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB` (450,559 B).

## 3. Verification

| Check | Command | Result | Evidence |
| --- | --- | --- | --- |
| dependency install | `pnpm install` | exit 0, 12 packages bumped | `01-install.txt` |
| peer check (repo) | `pnpm peers check` | exit 0 — "No peer dependency issues found" | `02-peers-check.txt` |
| typecheck | `pnpm run typecheck` (both tsconfigs) | exit 0 | `03-typecheck.txt` |
| build | `pnpm run build` | exit 0; client 450.56 kB, host 244.56 kB | `04-build.txt` |
| targeted test | `npx vitest run tests/stream-assembly.spec.ts` | 3/3 passed (this spec resolves the 0.2.2 devDep path) | `05-tests.txt` |
| full suite | `npx vitest run` | **942 passed / 4 skipped / 946**, 48/48 files, exit 0 (same as the stage-6 baseline locally) | `05-tests.txt` |
| clean install into an isolated profile | `dsh plugin --profile p22web install` after deleting that profile's `node_modules` + lockfile (fresh-install simulation) | exit 0, no peer warning; resolves `dsh-*@0.2.2-rc.1` + `cordis@4.1.0` | `06-profile-install.txt` |
| profile peer check | `dsh plugin --profile p22web peers check` | exit 0 — "No peer dependency issues found" | `06-profile-install.txt` |
| bundle hash (AGENTS §9) | installed `lib/client.js` vs `lib/client.js` | identical `E1BF4A82…` | `07-bundle-hash.txt` |
| real-host load | isolated host `:3094`, profile `p22web`, desktop CLI 0.2.2-rc.1, one real model turn | `visualize` tool called (2 calls, both non-error results); `[data-openui-card]` = 4; console errors = 0; style route 200 | `real-host/` (`04-page-after.json`, `05-events.json`, `06-style-route.json`) |

The clean profile resolve is the decisive test: with the old ranges the fresh
resolve reproduced exactly the Gate 2 failure; with the new ranges the same
command passes and picks the host's versions.

## 4. VERIFIED vs theoretically compatible

**VERIFIED**

- Runtime on **0.2.2-rc.1**: plugin loads, `visualize` executes, OpenUI card
  renders, no console errors, style route 200 — on the real desktop host.
- Compile, build and full test suite against **0.2.2-rc.1** devDependencies.
- Clean profile install resolves **0.2.2-rc.1** packages and **cordis 4.1.0**,
  and `pnpm peers check` passes.
- Published peer range admits `0.2.2-rc.1` by semver and still admits the 0.2.1
  line (range check, not a runtime claim).

**NOT VERIFIED**

- Runtime on **0.2.1-rc.5** after this change. The ranges still admit it, but no
  0.2.1 host was run in this workstream; the previous verified 0.2.1 baseline is
  the pre-change release (v0.1.1 evidence).
- Any version newer than 0.2.2-rc.1: none is published (npm `next` = 0.2.2-rc.1).
  `^0.2.2-rc.1` would admit a future 0.2.2 final or 0.2.3 final, which are
  theoretical.
- The daily profile is untouched; its install is workstream C's procedure.

## 5. What this does not fix

- The archived-session trap and delivery observability (Gate 2 findings) are
  product design, not dependency range (ADR-016 design consequence).
- `@ToAssistant`/`@OpenUrl` are not implemented; the Gate 3 host change is still
  missing.

## Reproduce

```powershell
pnpm install
pnpm peers check
pnpm run typecheck
pnpm run build
npx vitest run

# isolated host install (never the daily profile)
$env:DSH_HOME = (Resolve-Path tmp/dsh-022).Path
dsh plugin --profile p22web install
dsh plugin --profile p22web peers check

# real-host load: see real-host-check.mjs header for the bsk setup
$env:BSK_SESSION = '<bsk session>'
node evidence/stage-7c/compat/real-host-check.mjs http://127.0.0.1:3094
```