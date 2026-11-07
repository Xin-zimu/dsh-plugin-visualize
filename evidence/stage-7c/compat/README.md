# Evidence — Stage 7C workstream B (DSH 0.2.2-rc.1 compatibility)

Date: 2026-11-07. Change: `package.json` devDependencies 0.2.1-rc.5 → 0.2.2-rc.1,
cordis 4.0.5 → 4.1.0, and six `dsh-*` peer ranges gain `|| ^0.2.2-rc.1`.
No product code changed; `lib/client.js` rebuilds byte-identically.

| File | What it shows |
| --- | --- |
| `00-baseline.txt` | pre-change HEAD + hashes; desktop CLI 0.2.2-rc.1 vs global dsh 0.2.1-rc.5; semver checks proving `^0.2.1-0` cannot admit 0.2.2-rc.1 |
| `01-install.txt` | `pnpm install` exit 0; twelve `@deepseek-ai` packages bumped |
| `02-peers-check.txt` | repo `pnpm peers check` exit 0 — no peer issues |
| `03-typecheck.txt` | both tsconfig projects exit 0 (no source change needed) |
| `04-build.txt` | `pnpm run build` exit 0; client 450.56 kB, host 244.56 kB |
| `05-tests.txt` | targeted spec 3/3; full suite 942 passed / 4 skipped / 946, exit 0 |
| `06-profile-install.txt` | clean resolve in the isolated profile: install exit 0, `dsh-*@0.2.2-rc.1` + `cordis@4.1.0`, `pnpm peers check` exit 0 |
| `07-bundle-hash.txt` | build vs installed client hash identical `E1BF4A82…` (AGENTS §9 gate) |
| `real-host-check.mjs` | real-host load script (probe-based; test only, not shipped) |
| `real-host/` | JSON from the isolated 0.2.2-rc.1 host: cards = 4, console errors = 0, style route 200, `visualize` tool calls + non-error results |

## Highlights

- The clean profile resolve is the discriminating test. Before the change the
  same fresh resolve produced Gate 2's failure (0.2.1-rc.5 dsh copies + cordis
  4.1.0 → unmet `~4.0.5`); after the change it resolves 0.2.2-rc.1 copies,
  whose peer is `~4.1.0`, and the check passes.
- Real-host events (`real-host/05-events.json`) contain two `tool/call` events
  named `visualize` (turn 4 and turn 5) and two non-error `tool/result`, and
  `user/message` sources keep `kind:'user'` + `rpcId`.
- No product file was touched: `git show --stat` for this commit lists
  `package.json`, `pnpm-lock.yaml`, docs and evidence only.

## Limits

- One host version (0.2.2-rc.1), one isolated profile, one Windows machine.
- The probe used to trigger the model turn is test-only and lives in `tmp/`
  (gitignored); the product path is the real tool call the model made.
- No screenshot: the run's evidence is DOM/event JSON, per the repo's privacy
  rule.
- 0.2.1-rc.5 runtime was not re-run after the change (ranges still admit it;
  not re-verified).