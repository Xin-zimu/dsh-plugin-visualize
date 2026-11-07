#!/usr/bin/env node
/**
 * Gate 3 durable-source proof: show that a real DSH session log stores the
 * prompt source on each `user/message` event, which is what makes a new
 * optional `origin` field durable and replayable for free.
 *
 * Reads a compressed DSH session log (`.jsonl.zstd`) and prints ONLY metadata:
 * event type, seq, source kind, which source keys are present, and whether
 * rpcId is a string. Message content is never printed (the isolated Gate 2
 * session is real model conversation).
 *
 * Usage:
 *   node evidence/stage-7c/gate3/read-durable-source.mjs <session.v4.jsonl.zstd>
 *
 * Exit codes: 0 read, 1 file unreadable/not zstd, 2 zstd decompression missing.
 */
import { readFileSync } from 'node:fs'
import { zstdDecompressSync } from 'node:zlib'

const file = process.argv[2]
if (file === undefined) {
  console.error('usage: node read-durable-source.mjs <session.v4.jsonl.zstd>')
  process.exit(1)
}

let text
try {
  text = zstdDecompressSync(readFileSync(file)).toString('utf8')
} catch (error) {
  if (String(error).includes('zstd')) {
    console.error(`ENVIRONMENT BLOCK: zstd unavailable in this Node: ${String(error)}`)
    process.exit(2)
  }
  console.error(`cannot read session log: ${String(error)}`)
  process.exit(1)
}

const events = text.split('\n').filter(Boolean).flatMap(line => {
  try {
    return [JSON.parse(line)]
  } catch {
    return []
  }
})

const userMessages = events
  .filter(event => event.type === 'user/message')
  .map(event => {
    const source = event.data?.source ?? {}
    return {
      seq: event.seq,
      sourceKind: source.kind ?? null,
      rpcIdIsString: typeof source.rpcId === 'string',
      sourceKeys: Object.keys(source).sort(),
    }
  })

const kinds = [...new Set(userMessages.map(entry => entry.sourceKind))]
console.log(JSON.stringify({
  file: file.split(/[\\/]/).pop(),
  bytes: readFileSync(file).length,
  events: events.length,
  userMessages: userMessages.length,
  sourceKinds: kinds,
  promptMessages: userMessages.filter(entry => entry.sourceKind === 'user'),
  note: 'Only source metadata is printed; message content is deliberately omitted.',
}, null, 1))