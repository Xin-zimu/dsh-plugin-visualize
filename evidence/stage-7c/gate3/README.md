# Evidence — Stage 7C Gate 3 (upstream provenance request)

Date: 2026-11-07. Scope: prepare the ADR-016 Option B upstream request, on the
**installed** host source, without changing DSH or sending anything upstream.

| File | What it proves | Kind |
| --- | --- | --- |
| `01-upstream-identity.txt` | installed host = installed release = public tag `dsh-v0.2.2-rc.1` (`66491b05e3`); no newer published version; contribution channel is Discussions, external PRs are not accepted | Ran (network reads) |
| `02-wire-and-validation.txt` | `SessionPromptRequest` has no origin field; strict codec has `additionalProperties:false` (an undeclared field is rejected); the durable source type is merge-extensible; the command layer is where the Agent/log is available; dedupe matches `kind:'user'` + `rpcId`; `tool/call` is the durable record to validate against | Read (source at the tag) + Read (installed built declaration) |
| `03-extension-points.txt` | `conversation.chat.user.before` is an existing source-aware Chat slot; the durable source reaches it; the plugin already registers slots; 0.2.1-rc.5 typings do not declare it (compat input) | Read (installed build + source) |
| `anchors-verified.json` | all 15 cited `file:line` anchors re-fetched and asserted against the tag | Ran |
| `durable-source-proof.json` | a real Gate-2 session log stores `source:{kind:'user',rpcId,clientTimeZone}` on `user/message`; a new optional `origin` field rides the same durable JSON. Metadata only — no message content printed | Ran |
| `verify-anchors.mjs` / `fetch-anchors.ps1` | reproducibility of the anchors | script |
| `read-durable-source.mjs` | reproducibility of the persistence proof | script |

## Reproduce

```powershell
# 1. upstream identity (network)
#    commands are recorded verbatim in 01-upstream-identity.txt

# 2. source anchors: PowerShell fetches, Node verifies (node fetch is
#    ECONNRESET-blocked for raw.githubusercontent.com on this box)
pwsh -NoProfile -File evidence/stage-7c/gate3/fetch-anchors.ps1 -OutDir tmp/gh/anchors
node evidence/stage-7c/gate3/verify-anchors.mjs --dir tmp/gh/anchors `
  --out evidence/stage-7c/gate3/anchors-verified.json

# 3. durable-source proof (isolated Gate-2 host home; tmp/ is gitignored)
$log = Get-ChildItem tmp/dsh-022/sessions -Recurse -File -Filter *.zstd |
  Select-Object -First 1
node evidence/stage-7c/gate3/read-durable-source.mjs $log.FullName

# 4. installed build facts
Select-String `
  -Path tmp/dsh-host-0.2.2-rc.1/dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/typert.host.js `
  -Pattern "'session/prompt'" -Context 0,20
```

## Limits

- `01` and `02`-F are reads of the **installed** 0.2.2-rc.1 build; everything
  else in `02`/`03` is read at the public release tag. The tag and the installed
  build are the same release, but no byte-for-byte rebuild comparison was made.
- Nothing here executes the proposed host change; it is a design request, and
  the implementation remains upstream's. Gate 4 acceptance tests must run after
  an upstream release ships it.
- `durable-source-proof.json` proves that the *existing* source fields persist;
  it does not prove that an added `origin` field survives their persistence
  schema (an upstream acceptance test, listed in the report).