#!/usr/bin/env pwsh
# Gate 3 anchor fetch: download the cited upstream files at the release tag.
#
# Why a separate fetcher: in this environment `node`/`curl.exe` cannot reach
# raw.githubusercontent.com (ECONNRESET) while PowerShell's WinHTTP client can.
# The verifier (verify-anchors.mjs) is therefore network-free and reads the
# downloaded files; a missing file is an environment block, never a FAIL.
#
# Usage:
#   pwsh -File evidence/stage-7c/gate3/fetch-anchors.ps1 [-OutDir tmp/gh/anchors]
#
# Exit 0: every file present. Exit 2: a download failed (environment block).

param(
  [string]$OutDir = 'tmp/gh/anchors'
)

$ErrorActionPreference = 'Stop'
$tag = '66491b05e3'
$base = "https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/$tag"
$files = @(
  'packages/api/session-controller/src/types.ts',
  'packages/api/session-controller/src/index.ts',
  'packages/api/session-controller/src/commands.ts',
  'packages/llm/llm/src/message.ts',
  'packages/core/session/src/types.ts',
  'packages/client/ui-chat/src/client/contract/slots.ts',
  'packages/client/ui-chat/src/client/chat/MessageItem.tsx',
  'packages/client/ui-chat/src/client/conversation-nodes/message.ts'
)

New-Item -ItemType Directory -Force $OutDir | Out-Null
$failed = 0
foreach ($file in $files) {
  $target = Join-Path $OutDir ($file -replace '/', '__')
  try {
    Invoke-WebRequest -Uri "$base/$file" -UseBasicParsing -TimeoutSec 30 -OutFile $target
    Write-Host ("fetched {0} ({1} bytes)" -f $file, (Get-Item $target).Length)
  } catch {
    Write-Host ("FAILED {0}: {1}" -f $file, $_.Exception.Message)
    $failed++
  }
}
if ($failed -gt 0) {
  Write-Host "ENVIRONMENT BLOCK: $failed file(s) could not be downloaded"
  exit 2
}
Write-Host "OK: $($files.Count) files in $OutDir"