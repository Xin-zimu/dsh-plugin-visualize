# Provenance

Upstream snapshots this fork is built from. All are read-only references; the
fork's own code lives outside `upstream/`.

| Directory | Source | Pinned commit | Date | Role |
| --- | --- | --- | --- | --- |
| `upstream/dsh-visualize` | https://github.com/Nagi-ovo/dsh-visualize | `cf6b3a3f5a3f02b83a380890a5b672a350715344` | 2026-10-24 | Host skeleton: tool registration, sandboxed iframe, CSP, lint, self-repair, images, card store, styles |
| `upstream/dsh-intelligent-ui` | https://github.com/my-dsh/deepseek-intelligent-ui | `0b08749c9969cad34166566340f6c9464ea77b6c` | 2026-10-17 | Second render backend: openui-lang parser/evaluator, 48 components, 73 `@functions` |
| `upstream/open-intelligent-ui` | https://github.com/thesysdev/open-intelligent-ui | `16ef26475999e3a021a50b1607a03717c0721255` | 2026-10-26 | Capability reference (not a plugin): Map, SearchImage, HtmlView, Math, YouTube, Chart.js |

Licences: `dsh-visualize` BSD-3-Clause; `dsh-intelligent-ui` MIT;
`open-intelligent-ui` MIT. Each directory keeps its own LICENSE.

## What was excluded

`open-intelligent-ui` was moved here without its `.git` (17 MB),
`node_modules` (640 MB) and `.next` (1.1 GB) — sources only. Its commit is
recorded in `.upstream-commit` and `.upstream-commit.log` inside that
directory, and in the table above.

The two `dsh-*` clones keep their `.git` (shallow, 3.3 MB and 1.8 MB total),
so `git -C upstream/<name> log` still works for diffing against upstream.
