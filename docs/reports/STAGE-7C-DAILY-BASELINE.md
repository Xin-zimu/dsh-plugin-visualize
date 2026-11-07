# Stage 7C — daily-use baseline: install/rollback plan and isolated acceptance

Date: 2026-11-07 · Goal: get the plugin into real daily use without touching the
owner's daily profile in this workstream. **The daily profile was not modified.**

## 0. Verdict first

**Suitable for a supervised daily trial.** In an isolated profile installed the
same way the daily profile would be, the plugin rendered knowledge, math and
algorithm cards through real model turns, restored them across refresh and
session switch, and stayed console-clean (8/8 measured scenarios, 0 failures).
Residual risks are listed in §4; the three that matter are: (a) the owner's daily
profile is a **replacement** of `@nagi-ovo/dsh-visualize`, not an addition;
(b) two surfaces of one card can show different slider values until a reload;
(c) `@ToAssistant`/`@OpenUrl` remain refused by design.

## 1. Which profile is the daily one (confirmed, not guessed)

| Fact | Value | How |
| --- | --- | --- |
| Daily profile | `C:\Users\<user>\.dsh\profiles\desktop` | `package.json` name `dsh-profile-desktop`; the GUI process serves this profile |
| GUI | PID **21788**, `DeepSeek Harness.exe`, `127.0.0.1:50270`, started 14:12:56 | `Get-NetTCPConnection` / `Get-Process` |
| What it loads today | **`@nagi-ovo/dsh-visualize: ^0.1.7`** (the upstream, HTML-only snapshot), listed in both `dependencies` and `dsh.profile.bundles` | daily `package.json` |
| This fork's package | `@dsh-unified/visualize` **0.1.1** | repo `package.json` |
| Test-isolated profiles | all under the repo's `tmp/` (`tmp/dsh-022/profiles/p22web`, `tmp/dsh-7c/profiles/p7c`, …) | repo; `tmp/` is gitignored |

Other profiles under `~/.dsh/profiles` (`headless`, `web`, `tui`, `dsh-tui`) are
pre-existing owner environments and were **not** inspected or touched beyond
listing.

Because the daily profile already mounts a package that owns the `visualize` tool
name, this is a **swap**: install this fork, remove the upstream plugin. Loading
both would register the same tool twice and is not a supported state.

## 2. Install / upgrade procedure for the daily profile (owner runs this)

Prerequisites: the repo is built at the commit you want (`pnpm install &&
pnpm run build`; `lib/` is not committed for non-release builds). The verified
build in this session is `lib/client.js` SHA-256
`E1BF4A82B3C808899BA868009CF9DEAD15F941E6A3614040DB1E73C031456CEB`.

**Step 0 — quit the DSH desktop app.** A version swap under a running profile
risks locked files on Windows. Do not kill PID 21788 from a script; quit it from
its own UI (or the tray). The plan below assumes it is closed.

**Step 1 — back up the profile's two state files.**

```powershell
$p = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
Copy-Item "$p\package.json" "$p\package.json.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item "$p\pnpm-lock.yaml" "$p\pnpm-lock.yaml.bak-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

**Step 2 — edit `$p\package.json`** (one replacement, three edits):

- `dependencies`: remove `"@nagi-ovo/dsh-visualize": "^0.1.7"`; add
  `"@dsh-unified/visualize": "file:D:/Deepseek WorkSpace/dsh-plugin-visualize"`.
- `dsh.profile.bundles`: replace the `"@nagi-ovo/dsh-visualize"` entry with
  `"@dsh-unified/visualize"` at the same position.

**Step 3 — install and check peers with the desktop host's own CLI** (the global
`dsh` on PATH is 0.2.1-rc.5 and is not the host):

```powershell
$desk = Join-Path $env:LOCALAPPDATA 'Programs\DeepSeek Harness\resources\runtime\cli\bin\dsh.cmd'
& $desk plugin --profile desktop install
& $desk plugin --profile desktop peers check     # must print: No peer dependency issues found
```

**Step 4 — start the app** and accept the plugin-manager prompt if one appears.
`patchReload: live` may pick the change up, but a profile-level bundle swap
deserves a restart.

**Step 5 — smoke test in the real daily profile.** Open a normal conversation and
ask, e.g.: *"用 visualize 工具画一张卡片：标题「每日试用」，写一句 hello。"*
Expect: one card in the answer and one on the turn tail, no console errors, and
`设置 → 可视化` present. Then reload the page and confirm the card returns with
no model call.

**Verification commands if the app misbehaves:**

```powershell
Get-Content (Join-Path $env:APPDATA 'DeepSeek Harness\logs\main.log') -Tail 50  # path may differ by build
& $desk plugin --profile desktop why @dsh-unified/visualize
```

## 3. Rollback procedure (restores today's state exactly)

1. Quit the app.
2. Restore the two backup files (or reverse Step 2: remove
   `@dsh-unified/visualize`, re-add `"@nagi-ovo/dsh-visualize": "^0.1.7"` to
   dependencies and bundles).
3. `& $desk plugin --profile desktop install`, then
   `& $desk plugin --profile desktop peers check`.
4. Start the app; the upstream HTML-only plugin is active again. Any cards this
   fork rendered remain in session logs as `visualize` tool results and replay
   through the upstream plugin's HTML path only if they are HTML cards; OpenUI
   cards from this fork will fall back to the generic tool row when the fork is
   removed. **No conversation data is destroyed by the swap** — only the
   renderer changes.

If a rollback happens after the owner has been using the fork for a while, copy
the backups aside and keep the profile's session logs untouched; the plugin
never writes into the session log beyond its normal tool result.

## 4. Acceptance run (isolated profile, real host, real model turns)

Environment: isolated home `tmp/dsh-7c`, profile `p7c` = `dsh-base` +
`dsh-web-app` + this plugin; desktop CLI 0.2.2-rc.1; `127.0.0.1:3095`; Edge via
bsk 0.4.1; installed bundle hash == build hash (§9 gate). The owner's GUI
`:50270` was never navigated or modified.

Every turn below was typed into the host composer (`fill`) and submitted with
`Enter`; the model chose to call the `visualize` tool. Evidence is DOM/JSON only
(no screenshots): `evidence/stage-7c-daily/real-use/`.

| # | Scenario | Measured result |
| --- | --- | --- |
| 1 | ordinary knowledge Q&A → card | cards 0 → 2 (one card, two surfaces: tool fold + turn tail); title `勾股定理`; turn settled; 0 console errors |
| 2 | math formula + interactive slider | cards 2 → 4; card `二次函数 y = a·x²` has 1 slider; state changed (a 1→5) and the card re-rendered; 0 console errors |
| 3 | sorting animation + button | cards 4 → 6; card `冒泡排序演示` has 1 slider, 1 svg, 1 button; real click on `下一步` accepted; 0 console errors |
| 4 | refresh restore | 6 → 6 cards, titles preserved exactly (`勾股定理`, `二次函数 y = a·x²`, `冒泡排序演示`); 0 errors; no model call |
| 5 | session switch | new session shows 0 cards; switching back restores 6 cards; titles intact; 0 errors |
| 6 | stability while idle | card count stable (6 → 6); 0 `[data-openui-unrendered]`; 0 refusals; 0 console errors |
| 7 | real slider drag | pointer drag on the `速度` slider moved it 1 → 5 (bsk `drag` with a VOM ref); card state written |
| 8 | slider persistence across reload | after reload both copies of the sorting card read `速度 = 5`, `a = 5` |

Notes and honesty:

- Scenario 2's first interaction attempt used a real drag but the harness was
  given the wrong parameter shape; the state-binding assertion was therefore made
  with a DOM `input`/`change` event, and scenario 7 then exercised a **real
  pointer drag** on the same card family. Both paths wrote `$state` correctly.
- **Observed residual (minor):** while interacting, the copy being dragged
  updates immediately, but the other copy of the same card (the folded toolview
  surface) can keep showing the old value until a reload. After reload both
  copies converge (scenario 8). This is a pre-existing two-surface presentation
  behaviour, not introduced by the 0.2.2 compatibility change; it is recorded as
  a known limitation, not fixed (out of scope: no cosmetic refactors).
- The probe's shared G0–G3 gate was attempted first
  (`evidence/stage-7c-daily/01-smoke.txt`). It reached the page and could fill,
  but its fixed 4-attempt retry budget is too small for this host's continuously
  repainting page; the run was completed with the same gates implemented with a
  larger bounded retry budget in `acceptance.mjs`. This is a harness budget
  limitation, recorded as ENVIRONMENT, not a product failure.

## 5. Residual risks and NOT VERIFIED items

| Item | Status |
| --- | --- |
| Daily-profile install | **not performed** (owner gate). Steps above are derived from the isolated profile that was installed and verified identically. |
| HTML backend (`backend: "html"`) cards in daily use | **NOT VERIFIED this run** — the acceptance turns produced OpenUI cards. HTML rendering was verified in earlier stages (B04 etc.) and the build is byte-identical to v0.1.1. |
| Model calling `visualize` without an explicit instruction (e.g. "画个图解释一下") | **NOT VERIFIED** — every acceptance prompt named the tool. The plugin's skill is installed and this is how earlier stages drove the model; a few real daily prompts will settle it. |
| Two-surface live sync | known limitation, see §4. |
| Session switching with many sessions / long history | one switch verified; long-history pagination not re-run. |
| `@ToAssistant` / `@OpenUrl` | still refused, unchanged, by design (ADR-015/016/014). |
| 0.2.1-rc.5 runtime | not re-run after the compatibility change (ranges still admit it). |

## 6. What the owner should do next

1. Decide the daily swap (it is a **replacement** of `@nagi-ovo/dsh-visualize`).
2. Follow §2 after quitting the app; keep the two backups.
3. Run the one-prompt smoke test from Step 5.
4. Use it normally for a day; if anything looks wrong, §3 restores today's state.
5. Do not expect `@ToAssistant` until the upstream provenance change of Gate 3
   ships; the action stays safely refused.

## 7. Files

- `evidence/stage-7c-daily/00-install.txt` — isolated profile install + peers check
- `evidence/stage-7c-daily/01-smoke.txt` — shared probe attempt (environment note)
- `evidence/stage-7c-daily/02-bundle-hash.txt` — §9 build == installed
- `evidence/stage-7c-daily/02-acceptance-run.txt` — full run output
- `evidence/stage-7c-daily/real-use/*.json` — per-scenario measurements
- `evidence/stage-7c-daily/acceptance.mjs` — reproducibility