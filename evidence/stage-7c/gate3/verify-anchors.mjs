#!/usr/bin/env node
/**
 * Gate 3 source anchors: check that every cited upstream line still contains
 * the expected text, against files fetched by fetch-anchors.ps1.
 *
 * The installed host is DSH 0.2.2-rc.1; its public source is the same release
 * (GitHub tag dsh-v0.2.2-rc.1 = 66491b05e3, npm `next` = 0.2.2-rc.1). This
 * script exists so the file:line citations in the Gate 3 report are checked
 * mechanically instead of trusted, and so a later upstream release that moves
 * them fails loudly.
 *
 * Usage:
 *   node evidence/stage-7c/gate3/verify-anchors.mjs [--dir tmp/gh/anchors] [--out <file>]
 *
 * Exit codes: 0 all anchors verified, 1 anchor mismatch, 2 environment block
 * (a source file is missing — run fetch-anchors.ps1; never a product failure).
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TAG = '66491b05e3'
const SOURCE_BASE = `https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/${TAG}`

/** @type {{path: string, line: number, expect: string, why: string}[]} */
const ANCHORS = [
  { path: 'packages/api/session-controller/src/types.ts', line: 322, expect: 'export interface SessionPromptRequest {', why: 'wire request: no provenance/origin field today' },
  { path: 'packages/api/session-controller/src/types.ts', line: 329, expect: 'readonly clientTimeZone?: string', why: 'last field of the request; origin would follow' },
  { path: 'packages/api/session-controller/src/types.ts', line: 398, expect: "'user-rpc': { kind: 'user'; rpcId: SessionRequestId; clientTimeZone?: string; principal?: Principal }", why: 'merge-extensible durable source; where origin is added' },
  { path: 'packages/api/session-controller/src/index.ts', line: 464, expect: "@Remote('prompt')", why: 'Remote admission entry' },
  { path: 'packages/api/session-controller/src/index.ts', line: 482, expect: 'const source: MessageSource = {', why: 'host builds the durable source; kind fixed to user' },
  { path: 'packages/api/session-controller/src/commands.ts', line: 304, expect: 'async prompt(request: SessionPromptRequest, source: MessageSource): Promise<SessionPromptValue> {', why: 'command layer resolves the Agent; the log is reachable here' },
  { path: 'packages/api/session-controller/src/commands.ts', line: 329, expect: 'const message: UserMessage = createUserMessage({ content, source })', why: 'the source is bound to the exact delivered message' },
  { path: 'packages/api/session-controller/src/commands.ts', line: 542, expect: 'function hasPromptRequest(agent: Agent, requestId: SessionRequestId): boolean {', why: 'dedupe matches source kind user + rpcId; add origin without changing kind' },
  { path: 'packages/llm/llm/src/message.ts', line: 110, expect: 'export interface MessageSourceMap {', why: 'merge-extensible source map' },
  { path: 'packages/llm/llm/src/message.ts', line: 246, expect: 'export function createUserMessage<T extends NewUserMessage>(', why: 'constructor takes source unchanged' },
  { path: 'packages/core/session/src/types.ts', line: 369, expect: "'tool/call': { turn: number; step: number; callId: ToolCallId; name: string; arguments: string }", why: 'durable tool-call record the host can validate a claim against' },
  { path: 'packages/client/ui-chat/src/client/contract/slots.ts', line: 230, expect: 'export interface UserBeforeOwnerProps {', why: 'existing source-aware decoration slot' },
  { path: 'packages/client/ui-chat/src/client/contract/slots.ts', line: 457, expect: "'conversation.chat.user.before': {", why: 'slot declaration: chain, source + kind owner props' },
  { path: 'packages/client/ui-chat/src/client/chat/MessageItem.tsx', line: 226, expect: "renderSlotChain('conversation.chat.user.before'", why: 'Chat renders the slot above the user bubble' },
  { path: 'packages/client/ui-chat/src/client/conversation-nodes/message.ts', line: 133, expect: 'source: event.data.source,', why: 'durable user/message source reaches the rendered node (restore path)' },
]

const arg = name => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}
const dir = arg('--dir') ?? 'tmp/gh/anchors'
const outFile = arg('--out')

const results = []
let missing = false
for (const anchor of ANCHORS) {
  const file = join(dir, anchor.path.replaceAll('/', '__'))
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    console.error(`ENVIRONMENT BLOCK: missing ${file} — run fetch-anchors.ps1 first`)
    missing = true
    continue
  }
  const lines = text.split('\n')
  const actual = (lines[anchor.line - 1] ?? '').trim()
  results.push({
    ...anchor,
    actual,
    ok: actual.includes(anchor.expect),
    fileSha256: createHash('sha256').update(text).digest('hex'),
  })
}
if (missing) process.exit(2)

const mismatched = results.filter(entry => !entry.ok).length
const report = {
  upstream: {
    repository: 'https://github.com/deepseek-ai/deepseek-harness',
    release: 'v0.2.2-rc.1',
    tag: 'dsh-v0.2.2-rc.1',
    commit: TAG,
    source: SOURCE_BASE,
  },
  verifiedAt: new Date().toISOString(),
  anchors: results,
  summary: { total: results.length, verified: results.length - mismatched, mismatched },
}
const json = JSON.stringify(report, null, 1)
if (outFile !== undefined) writeFileSync(outFile, `${json}\n`)
console.log(json)
process.exit(mismatched === 0 ? 0 : 1)