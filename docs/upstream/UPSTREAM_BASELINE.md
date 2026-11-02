# Upstream baseline

The three snapshots this fork is built from. `upstream/` holds them verbatim;
nothing in the fork edits them.

## Pinned commits

| Repository | Commit | Date | Licence | Role |
| --- | --- | --- | --- | --- |
| [Nagi-ovo/dsh-visualize](https://github.com/Nagi-ovo/dsh-visualize) | `cf6b3a3f5a3f02b83a380890a5b672a350715344` | 2026-10-24 | BSD-3-Clause | Host base: the plugin this fork starts from |
| [my-dsh/deepseek-intelligent-ui](https://github.com/my-dsh/deepseek-intelligent-ui) | `0b08749c9969cad34166566340f6c9464ea77b6c` | 2026-10-17 | MIT | OpenUI backend: language core and signature tables |
| [thesysdev/open-intelligent-ui](https://github.com/thesysdev/open-intelligent-ui) | `16ef26475999e3a021a50b1607a03717c0721255` | 2026-10-26 | MIT | Capability reference only; no code copied |

All three snapshots are plain read-only source trees inside this repository:
no `.git`, no `node_modules`, no build output. Their provenance is the SHA
above, not a nested history.

To recover a nested history for a diff, clone the upstream fresh into a scratch
directory at the recorded SHA:

```sh
git clone https://github.com/Nagi-ovo/dsh-visualize /tmp/up-dsh-visualize
git -C /tmp/up-dsh-visualize checkout cf6b3a3f5a3f02b83a380890a5b672a350715344
```

`upstream/open-intelligent-ui/.upstream-commit` also records its SHA inline.

## dsh-visualize — what we took

| Area | Files | How |
| --- | --- | --- |
| Host core | `src/index.ts`, `src/storage.ts`, `src/images.ts`, `src/style*.ts`, `src/self-repair.ts` | Kept |
| Security | `src/shell.ts`, `src/frame-css.ts`, `src/window-doc.ts` | Kept unchanged |
| Fragment contract | `src/fragment.ts`, `src/lint.ts`, `src/lint-gate.ts` | Kept; now consumed by `backends/html/renderer.ts` |
| Tool | `src/tool.ts` | **Rewritten** into `src/core/legacy-tool.ts`, routed through the registry; the old path kept as a wrapper |
| Browser half | `src/client/**` | Kept; `TurnCards.tsx` patched for nested dispatch |
| Skill | `src/skill.ts`, `assets/*` | Kept; backend-selection section and generated language reference appended |

## dsh-intelligent-ui — what we took

| File | Fork location | How |
| --- | --- | --- |
| `src/lang/tokenize.js` | `src/backends/openui/tokenize.ts` | Ported to TypeScript, diagnostics given codes |
| `src/lang/parse.js` | `src/backends/openui/parse.ts` | Ported to TypeScript; AST typed; call collection added |
| `src/lang/signatures.js` | `src/backends/openui/signatures.ts` | Rewritten from 48/73 down to the 8/17 actually implemented |
| `src/lang/evaluate.js` | — | **Not yet ported** (stage 2) |
| `src/lang/functions.js` | — | **Not yet ported** (stage 2) |
| `src/lang/spec.js` | — | Superseded: the skill text is generated from our own tables |
| `src/client/**`, `index.js`, build script | — | Deliberately not taken; the fork has its own host and build |

## open-intelligent-ui — what we take, and what we refuse

No application code is copied. It is a Next.js 16 / React 19 application and
cannot run inside a DSH plugin; its value is the capability list and the
security patterns behind it.

| Capability | Status in fork | Note |
| --- | --- | --- |
| `Map` + MapLibre, street routes | Not started | Needs a tile/network policy decision first |
| `SearchImage` | Not started | Needs its own service; the app's `/api/wiki` does not exist in DSH |
| `HtmlView` | Not started | Its sandbox + CSP pattern is the model to copy, not its code |
| `Math` (KaTeX) | Not started | Prefer a bundled KaTeX over a CDN load |
| `YouTube` | Not started | Needs an explicit embed allowlist |
| `Chart` | Partly available | The HTML backend already has Chart.js through `viz-helper` |

## Refresh procedure

To move to a newer upstream:

1. Record the new commit here first, with its date.
2. Clone the old and new upstream commits into scratch directories and diff
   them; the snapshot in `upstream/` has no history of its own.
3. Replace the snapshot in `upstream/` **without** its `.git` or
   `node_modules`, and commit the replacement — the repository history then
   holds the before and after.
4. Anything in `MIGRATION_MATRIX.md` marked *ported* or *rewritten* must be
   re-checked against the diff, not overwritten.
5. Update the matrix, then the code.
6. Add a session-log entry naming the old and new commits.