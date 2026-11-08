# Evidence — Stage 7C workstream C (daily-use baseline)

Date: 2026-11-07. Isolated host: `tmp/dsh-7c` (home), profile `p7c` (dsh-base +
dsh-web-app + this plugin), desktop CLI 0.2.2-rc.1, `127.0.0.1:3095`. The owner's
daily profile (`~/.dsh/profiles/desktop`) was **not** modified, installed into, or
restarted at the time of this run; the swap happened the next day — see Verdict
and `evidence/daily-trial-2026-11-08/`.

| File | What it shows |
| --- | --- |
| `00-install.txt` | clean isolated-profile install + `peers check` pass (same edited profile shape as the daily plan: dependency + bundle entry) |
| `01-smoke.txt` | shared probe G0–G3 attempt: environment note — the fixed 4-attempt evaluate budget is too small for this host's repainting page; run completed by `acceptance.mjs` with the same gates and a larger bounded budget |
| `02-bundle-hash.txt` | AGENTS §9 gate: built `lib/client.js` == installed bundle (`E1BF4A82…`) |
| `02-acceptance-run.txt` | whole acceptance run stdout + exit 0 |
| `02b-slider-real-drag.json` | real pointer drag: `速度` slider 1 → 5 via bsk drag on a VOM ref |
| `02c-slider-after-refresh.json` | after reload both copies of the card read 5 (state persisted) |
| `real-use/g0-environment.json` | URL/composer/daemon/session facts before any prompt |
| `real-use/g1-g3-interaction.json` | fill delivered the marker, Enter submitted, the turn painted |
| `real-use/01-knowledge-card.json` | knowledge Q&A → card count 0→2, title `勾股定理` |
| `real-use/02-math-interactive.json` | math card `二次函数 y = a·x²`, slider state 1→5 |
| `real-use/03-sorting-interactive.json` | sorting card with svg+slider+button; real click on `下一步`; 0 errors |
| `real-use/04-refresh-restore.json` | 6→6 cards, three titles preserved across reload |
| `real-use/05-session-switch.json` | new session 0 cards; switch back restores 6 |
| `real-use/06-stability.json` | idle card count stable, 0 unrendered, 0 console errors |
| `real-use/99-summary.json` | `{scenarios: 8, failed: []}` |
| `acceptance.mjs` | reproducibility (fill + Enter, not a probe shortcut) |

## Verdict

8/8 measured scenarios passed on the isolated profile; 0 console errors; cards
restored across refresh and session switch; a real pointer drag wrote state. The
daily-profile swap was **executed 2026-11-08**: the daily profile now loads this
build (installed bundle and assets equal the repo —
`evidence/daily-trial-2026-11-08/01-installed-state.txt`) and the owner reports
the restarted app normal. Rollback remains in
`docs/reports/STAGE-7C-DAILY-BASELINE.md` §3.

## Known limitation recorded here

The toolview copy and the turn-tail copy of one card can show different slider
values during an interaction until the page reloads; after reload both converge
(`02c-slider-after-refresh.json`). Pre-existing two-surface behaviour, not
introduced by the compatibility change; not fixed (scope).

## Cleanup

Both isolated hosts (:3094, :3095), the bsk session and the Edge window launched
for the run were stopped/closed afterwards; the daily GUI stayed on :50270 and
was never touched. `tmp/` is gitignored.