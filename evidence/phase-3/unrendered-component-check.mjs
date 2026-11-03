/**
 * Does a program using an unrendered component get rejected, or silently drawn
 * as nothing?
 *
 * `docs/specifications/COMPONENT_CATALOG.md` claims the former ("gets `unknown
 * component` with a line number — never a silently empty card"). The validator
 * checks names against `signatures.ts`, which lists all 48, so the claim looks
 * wrong. This settles it against the real validator and the real walker.
 */
import { openuiBackend } from '../../src/backends/openui/renderer.ts'

const backend = openuiBackend()

for (const name of ['Grid', 'Table', 'Chart', 'Map']) {
  const source = `root = Col([${name}([])])`
  const result = backend.validate(
    { backend: 'openui', title: 'T', mode: 'inline', source },
    { maxSourceBytes: 64_000 },
  )
  const codes = result.errors.map(e => e.code)
  console.log(`${name.padEnd(6)} errors=${JSON.stringify(codes)} sizeBytes=${result.sizeBytes}`)
}

console.log('\n--- a name that is genuinely absent from the table ---')
const unknown = backend.validate(
  { backend: 'openui', title: 'T', mode: 'inline', source: 'root = Col([Nope([])])' },
  { maxSourceBytes: 64_000 },
)
console.log('Nope   errors=', JSON.stringify(unknown.errors.map(e => ({ code: e.code, message: e.message }))))
