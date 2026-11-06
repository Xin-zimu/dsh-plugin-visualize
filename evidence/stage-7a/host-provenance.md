# Stage 7A — which host source is authoritative

Date: 2026-11-07. Purpose: before any `@ToAssistant`/`@OpenUrl` capability claim,
establish which DSH source is actually running on this machine, because the
Stage 4B-2 investigation read a different version.

## 1. The running desktop host is 0.2.2-rc.1

| Fact | Value | How it was read |
| --- | --- | --- |
| Installed app archive | `C:/Users/<user>\AppData\Local\Programs\DeepSeek Harness\resources\app.asar` (213,202,918 bytes) | file |
| Root package | `@deepseek-ai/dsh-desktop` **0.2.2-rc.1** | asar header `package.json` |
| Bundled runtime | `@deepseek-ai/dsh-desktop-runtime` **0.2.2-rc.1** | asar `dsh/package.json` |
| Packages under `dsh/node_modules/@deepseek-ai` | **331** entries: **321** `dsh-*` at `0.2.2-rc.1`, 10 independently versioned (cordis 4.1.0, cosmokit, schemastery, libreoffice-kit, …) | `evidence/stage-7a/host-package-inventory.txt` |
| What the app launches | `electron ... app.asar\dsh\node_modules\@deepseek-ai\dsh-desktop-host\lib\cli.js` with `ELECTRON_RUN_AS_NODE=1` | `resources/runtime/cli/bin/dsh.cmd` |

So the client and server code serving this GUI is the **asar's 0.2.2-rc.1**
tree, not the profile's npm copy.

## 2. The Stage 4B-2 tree is stale, and every old line number is wrong

`tmp/dsh-host-src/` (used by `docs/reports/PHASE-4B-2-INVESTIGATION.md` and
ADR-015 §10) is **0.2.1-rc.5**:

| Evidence | Value |
| --- | --- |
| `tmp/dsh-host-src/.../dsh-client-ui-conversation/package.json` | `0.2.1-rc.5` |
| `tmp/dsh-host-src/.../dsh-api-session-controller/package.json` | `0.2.1-rc.5` |
| Same file, asar 0.2.2-rc.1 vs stale tree, SHA-256 | `21064010…d73e` vs `fd8ee6c7…e984` — **different** |
| Same file, asar 0.2.2-rc.1 vs stale tree, `dsh-api-session-controller/lib/index.js` | `4cf6c66e…a4cd` vs `a9801acb…b386` — **different** |

`evidence/stage-7a/host-provenance.json` is the run that produced those hashes;
`host-provenance.mjs` is the script (it verifies each asar file against the
archive's own SHA-256 integrity record before comparing).

**Consequences, binding on this stage:**

1. ADR-015 §10's `file:line` citations (`client.js:15202`, `contract/input.d.ts:258`,
   `lib/index.js:3218`, …) name a tree that is not running here. They may still be
   *directionally* right, but Stage 7A may not reuse them as evidence.
2. `dsh-client-ui-slots` **does not exist** in 0.2.2-rc.1. ADR-015 §10.1's door-C
   chain (`dsh-client-ui-slots/lib/types/index.d.ts:221`) therefore cannot be
   restated; the slots contract must be re-located.
3. `dsh-action-cards` and `dsh-client-ui-action-cards` are **new** in 0.2.2-rc.1
   (they are absent from the 0.2.1-rc.5 tree and from ADR-015). They are a
   host-rendered card mechanism with recorded user decisions — exactly the area
   Stage 7A cares about, so they are investigated on their own
   (`confirmation-and-openurl.md`).

## 3. The plugin's compile baseline is 0.2.1-rc.5 — a real skew

`package.json` devDependencies pin every host package at **0.2.1-rc.5**
(`dsh-client-ui-conversation`, `dsh-client-ui-slots`, `dsh-session`, `dsh-tools`,
`dsh-llm`, …); `node_modules/@deepseek-ai/*` is that version. The peer ranges are
`^0.2.1-0`.

Two consequences to carry into the ADR:

- **Types are one version behind the running host.** 0.2.2-rc.1 packages ship
  `lib/client.js` but no `lib/types` (zero `.d.ts` files among the extracted
  packages). Any contract claim in this stage is either (a) read from the
  0.2.1-rc.5 type declarations in `node_modules`, or (b) read from 0.2.2-rc.1
  implementation JS. Each finding says which.
- Under strict semver, `^0.2.1-0` does **not** admit `0.2.2-rc.1` (a prerelease
  needs a comparator with the same major.minor.patch). Whether the loader enforces
  that is a separate question; it is recorded here as a compatibility risk, not a
  running failure (the v0.1.1 browser evidence ran on the 0.2.1-rc.5 host).

## 4. How the 0.2.2-rc.1 tree was read

`evidence/stage-7a/asar-tool.mjs` reads files out of the asar by header offset and
**verifies every extracted file against the archive's recorded SHA-256** before
writing it (a mismatch throws). The investigated packages were extracted to
`tmp/dsh-host-0.2.2-rc.1/` (gitignored). Script: `node evidence/stage-7a/asar-tool.mjs
extract <prefix…> --out <dir>`; inventory: `host-package-inventory.txt`.

## 5. What this does not establish

- It does not prove the app updated *after* 4B-2; only that the tree 4B-2 read is
  not the one installed now. (The asar's file mtime is 2026-11-04, older than the
  2026-11-05 extraction, so mtimes are not a reliable update order here.)
- It does not establish that the profile's `0.2.1-rc.5` bundles are unused at
  runtime. The profile loads plugin bundles from `~/.dsh/profiles/desktop`, and
  those still resolve host packages at 0.2.1-rc.5; the desktop host itself comes
  from the asar. The skew is recorded, not resolved.
- Nothing here is runtime evidence. The desktop app was not exercised beyond
  reading its files; no capability claim rests on this page alone.

## 6. Files

| File | What it is |
| --- | --- |
| `host-provenance.json` | the run: asar identity, versions, asar-vs-stale-tree hashes |
| `host-provenance.mjs` | the script that produced it (integrity-checked reads) |
| `asar-tool.mjs` | list/extract from the asar with per-file SHA-256 verification |
| `host-package-inventory.txt` | 331 `@deepseek-ai` entries: 321 `dsh-*` at 0.2.2-rc.1, 10 independently versioned |