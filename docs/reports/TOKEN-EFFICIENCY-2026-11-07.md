# Token efficiency — where the 261K goes, and A/B/C controlled trials (2026-11-07)

## 0. TL;DR

- The owner's accepted daily quadratic run (`session-7c398e01…`, prompt
  `生成一个带 a、b、c 滑块的二次函数交互演示。`) is **261,067 tokens** measured as
  `uncachedInput 75,560 + cacheRead 139,776 + output 45,731`; cache hit
  **64.9%**; 5 model requests; **98% of the 4m18s is model decoding**
  (LLM 256.6 s, tools 0.82 s).
- The cost is **not** the visualize skill (~8.3K tokens once, ~3% of the total).
  It is (a) repeated host overhead **~15.7K/request** (system 1,958 + tool schema
  9,937 + AGENTS.md 2,992 + snapshot), ×5 = ~78K; (b) one **30.6K-token
  reasoning step** whose output is re-sent into the final prompt (+44K); and
  (c) references/project docs read once (~16K + ~13K chars).
- Controlled trials (same model route, fresh 1-turn sessions) show the
  **reference-copy skill variant C wins**: average **130.6K** tokens vs A
  (current) 207.3K and B (layered rules) 179.9K, with **3 tool calls / 4 steps**
  instead of 5 and no quality regression. Expected saving **~35-40%** for
  standard `y=f(x)` cards.
- A/B/C could not remove the host-side costs (~78K repeated overhead + ~30K
  reasoning step) — those are environment/model-policy, not plugin wording.

## 1. What the 261K footer means

The footer is the aggregate of **prompt + output across the turn**, not a single
context window. For the daily session the projcache row
`record.rows.tokenUsage.val.totals` is:

| bucket | tokens |
| --- | --- |
| uncachedInputTokens | 75,560 |
| cacheReadTokens | 139,776 |
| outputTokens | 45,731 |
| **total (= footer "261K")** | **261,067** |

Cache hit = cacheRead / (cacheRead + uncached) = 139,776 / 215,336 = **64.9%**
(the "87%" seen elsewhere is from a different session; the daily run's own
number is 64.9%).

Per request (from `requests` in the session's timeline data):

| step | prompt tokens | active time |
| --- | --- | --- |
| 1 | 15,515 | 4.7 s |
| 2 | 31,768 | 3.8 s |
| 3 | 39,026 | 1.9 s |
| 4 | 42,313 | **244.5 s** |
| 5 | 86,714 | 2.4 s |
| **sum** | **215,336** | 256.6 s LLM |

`sessionStats`: `decodeTokens 45,731`, `decodeMs 251,294`, `toolMs 820`,
`ttftMs 5,263` → **98% of wall time is decoding**. The step-4 reasoning block is
118,472 chars ≈ **30,566 tokens**; it drafts the fragment and re-checks the
example/docs, and its output is re-sent in step-5's 86.7K prompt.

## 2. Where the tokens go

| bucket | estimate | notes |
| --- | --- | --- |
| host/system + tools schema | ~11.9K/request | system 1,958 + tools 9,937; ×5 ≈ 59K |
| AGENTS.md inject | 2,992/request | ×5 ≈ 15K — the repo cwd read-before-work workflow |
| skill catalog + visualize skill | ~8.9K once | 591 + 8,342; not re-read |
| references (example/charts/design) | ~16K unique | example 20,004 chars ≈ 5K tok, charts 6,052 ≈ 1.5K, design 5,105 ≈ 1.3K, skill body itself ~34K chars |
| project docs (session-log/STAGE/PLAN) | ~22K chars ≈ 6K tok | AGENTS §1 workflow |
| step-4 reasoning | **30,566** | re-sent into step 5 (+44K prompt) |
| uncached prompt growth | rest | 75,560 uncached + 139,776 cached |

The reference reads and project docs are one-time but then re-sent in every
later prompt (with cache discount); the reasoning output is also re-sent. That is
why a one-shot turn with 5 requests still totals 261K.

## 3. Controlled A/B/C trials

Route **qwen/deepseek-v4.1-flash** (parity verified from
`request/context` and `request/header.config`; reasoningEffort high per adapter
default/UI, field omitted from the header in this build — caveat recorded). Each
trial: fresh tab + 新会话, exactly one prompt, one turn, measured from the new
session's `tokenUsage`/`sessionStats`; quality from one screenshot + one tolerant
DOM read.

| variant | what changed | trial | prompt | output | total | cache % | steps / calls | wall | quality |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A (current) | installed assets as-is | A1 | 173,932 | 50,627 | **224,559** | 58.9 | 5 / 5 | 310 s | PASS |
| A | | A2 | 156,579 | 33,375 | **189,954** | 65.2 | 5 / 5 | 193 s | PASS |
| B (layered) | new 2.75 KB `references/math-plot.md`; skill reads only that for single y=f(x); charts/design/example only for complex cases; axis-letter/example-audit wording fixes; "skip AGENTS workflow" line | B1 | 144,223 | 35,721 | **179,944** | 62.8 | 5 / 4 | 218 s | PASS |
| B | | B2 | — | — | — | — | — | — | **aborted** (bsk session stopped mid-trial; no second B number) |
| C (reference-copy) | skill says read **only** `examples/quadratic-explorer.html` and adapt it; skip charts/design; same axis-letter/example-audit wording | C1 | 112,895 | 28,430 | **141,325** | 60.1 | 4 / 3 | 178 s | PASS |
| C | | C2 | 102,157 | 17,781 | **119,938** | 66.4 | 4 / 3 | 110 s | PASS |
| daily baseline | current skill, owner's run | — | 215,336 (requests sum) | 45,731 | **261,067** | 64.9 | 5 / 5 | 258 s | accepted |

Tool calls: A = `skill, read×3, visualize`; B (`B1`) = `skill, read×2, visualize`
(math-plot + example); C = `skill, read, visualize` (one read, the example
itself). All trials: exactly **one turn**, one `visualize`, no pwsh/write/edit.

Quality: every rendered card had axes, x/y letters (DOM: `axis-label-x`/`-y`
present), ticks and auto-window; vertex/symmetry markers present. `C1`
screenshot inspected: `y = x²`, axis letters x/y, ticks −2…2, vertex (0,0),
auto window, footer **141K tok · 缓存命中 60%**. `C2` same shape at 120K. No
visual regression observed against the accepted daily card.

Averages: **A 207.3K**, **B 179.9K (single trial)**, **C 130.6K**. C is
**−37% vs A**, **−27% vs B**; vs the daily 261K it is **−50%** (single-run
variance caveat: A1 224.6K vs A2 190.0K is already an 18% spread, and the daily
261K vs A ≈ 203K in the earlier run shows the same spread).

## 4. Recommendation

1. **Adopt variant C for standard single-function cards**: skill points only at
   `examples/quadratic-explorer.html` and says to adapt it; charts/design only
   for non-standard charts/interactions. Expected saving **~35-40% of total
   tokens** and **2 fewer steps** per card; quality held in both C trials.
2. **Keep the full rules for complex cases** (multi-panel, statistical charts,
   custom interactions): a hybrid — C for the standard quadratic/`y=f(x)` case,
   full charts/design when the request is not covered by the example.
3. **B is a fallback, not the winner**: the 2.75 KB math-plot sheet removed 1
   read but still costs one more step than C and one extra read; its value is
   keeping the math rules explicit when a card is adapted rather than copied.
4. **Wording fixes from the reasoning analysis** (axis letters only when the
   axis is in view; the example is a template to copy, not audit; apply
   constants, do not verify them) belong in any variant — they remove the
   contradiction the model spent reasoning on.
5. **Host/environment-only levers** (cannot be fixed by this plugin): the
   repeated ~15.7K/request overhead (system + tools schema + AGENTS.md in a repo
   cwd), the 30.6K reasoning step (reasoning effort and model policy), and the
   project-doc read-before-work workflow. Concrete asks for the owner/host: run
   daily chat cards in a non-repo workspace (drops AGENTS.md + project docs),
   consider medium reasoning for visual authoring, and shrink the tool schema if
   possible. Those changes could remove roughly the repeated ~78K overhead plus
   part of the reasoning step; they are not skill edits.

## 5. Honest caveats

- **B has one valid trial** (B2 aborted because the browser session stopped
  mid-trial); treat B's 179.9K as indicative only.
- **A has two valid trials** (224.6K / 190.0K); the 261K daily baseline comes
  from the owner's own run, same model, so single-run variance is ~15-20%.
- Cache-hit percentages differ per trial (48.7-66.4%) because cache warmth
  depends on the session's history; the totals are the comparable number.
- Qwen parity was verified by header/context; the `reasoningEffort` field is not
  in this build's `request/header.config` (adapter default + UI High), so
  "reasoning high" is inferred rather than header-proven.
- Per-request prompt breakdown exists only for the daily session (its timeline
  data); the new isolated sessions expose only the aggregate `tokenUsage`, so the
  per-request table is baseline-only.
- Raw transcripts stay machine-local (`tmp/token-variants/results/*.jsonl`); the
  committed evidence is summaries + hashes only.