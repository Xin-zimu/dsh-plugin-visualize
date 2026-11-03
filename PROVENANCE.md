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

None of the three snapshots carries its `.git`, its `node_modules` or a build
output. `open-intelligent-ui` additionally left behind `.next` (1.1 GB). They
are sources only, which is why `git -C upstream/<name> log` does **not** work:
the pinned commit in the table above is the record, plus
`.upstream-commit` / `.upstream-commit.log` inside the open-intelligent-ui
directory.

`open-intelligent-ui`'s `docs/openui-chatgpt-comparison.{mp4,jpg}` — a
side-by-side against ChatGPT — was deliberately not carried over. Thesys's MIT
grant covers its own code, not OpenAI's marks or product imagery in that video,
and no part of this plugin uses it.
