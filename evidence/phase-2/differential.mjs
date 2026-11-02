#!/usr/bin/env node
/**
 * Differential runner: the fork against the pinned upstream snapshot.
 *
 * Every corpus program is executed twice — once by
 * `upstream/dsh-intelligent-ui/src/lang`, once by `src/backends/openui` — and
 * the two records are compared field by field. A matching COUNT is not a pass;
 * a matching RECORD is. Output goes to `evidence/phase-2/differential.json`.
 *
 * Run: node --experimental-strip-types evidence/phase-2/differential.mjs
 *
 * @module dsh-plugin-visualize/evidence/phase-2/differential
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { parseProgram as upParse, evaluateProgram as upEvaluate } from '../../upstream/dsh-intelligent-ui/src/lang/index.js'
import { parseProgram as forkParse } from '../../src/backends/openui/parse.ts'
import { evaluateProgram as forkEvaluate } from '../../src/backends/openui/evaluate.ts'

const cases = JSON.parse(readFileSync('tests/fixtures/openui-corpus.json', 'utf8'))

/** Structural form so descriptors compare by value, not identity. */
function canon(value) {
  if (value === undefined) return '<undefined>'
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(canon)
  const out = {}
  for (const key of Object.keys(value).sort()) out[key] = canon(value[key])
  return out
}

/** One diagnostic as text. `line` is a field, never part of the message. */
const diag = (d) => d.severity + '|' + (d.line ?? 0) + '|' + d.message

/** Execute one program with one implementation. */
function run(parse, evaluate, program, state) {
  const parsed = parse(program)
  const result = evaluate(parsed, { state })
  return {
    parseOk: parsed.ok,
    rootName: parsed.rootName ?? null,
    parseDiagnostics: (parsed.diagnostics ?? []).map(diag),
    ok: result.ok,
    root: canon(result.root),
    stateDefaults: canon(result.stateDefaults),
    diagnostics: result.diagnostics.map(diag),
  }
}

const FIELDS = ['parseOk', 'rootName', 'parseDiagnostics', 'ok', 'root', 'stateDefaults', 'diagnostics']
const records = []
const differences = []

for (const item of cases) {
  const state = item.state ?? {}
  const up = run(upParse, upEvaluate, item.program, state)
  const fork = run(forkParse, forkEvaluate, item.program, state)
  const differing = FIELDS.filter(f => JSON.stringify(up[f]) !== JSON.stringify(fork[f]))
  records.push({ name: item.name, match: differing.length === 0, differing })
  if (differing.length > 0) {
    differences.push({
      name: item.name,
      program: item.program,
      differing,
      upstream: Object.fromEntries(differing.map(f => [f, up[f]])),
      fork: Object.fromEntries(differing.map(f => [f, fork[f]])),
    })
  }
}

const matched = records.filter(r => r.match).length
writeFileSync('evidence/phase-2/differential.json', JSON.stringify({
  comparedFields: FIELDS,
  cases: cases.length,
  matched,
  differing: differences.length,
  records,
  differences,
}, null, 2))

console.log('cases:', cases.length, '| matched:', matched, '| differing:', differences.length)
for (const d of differences.slice(0, 8)) {
  console.log('---', d.name, d.differing.join(','))
  console.log('  PROG:', JSON.stringify(d.program).slice(0, 120))
  for (const f of d.differing) {
    console.log('  up  ', f, JSON.stringify(d.upstream[f]).slice(0, 200))
    console.log('  fork', f, JSON.stringify(d.fork[f]).slice(0, 200))
  }
}
process.exitCode = differences.length === 0 ? 0 : 1
