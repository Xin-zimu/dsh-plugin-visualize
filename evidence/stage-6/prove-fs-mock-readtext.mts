/**
 * D1 regression proof: the fs fake in tests/card-images.spec.ts was missing
 * `readText`, so the store's legacy-workspace read crashed with
 * "ctx.fs.readText is not a function" instead of exercising real behaviour.
 *
 * This probe drives the SAME seam the spec's host() builds, twice: once
 * without readText (the old fixture) and once with it (the fixed fixture), and
 * shows what each does on a card the store routes through ctx.fs.
 */
import { mkdtemp, mkdir, realpath, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { cardStore, inside, realpathOfDeepest } from '../../src/storage.ts'

const home = await realpath(await mkdtemp(join(tmpdir(), 'd1-home-')))
const workspace = await realpath(await mkdtemp(join(tmpdir(), 'd1-ws-')))
await mkdir(join(workspace, 'viz'))
const legacy = join(workspace, 'viz', 'a.html')
await writeFile(legacy, '<div>legacy card</div>')

/** The spec's host(), parameterised by whether the seam answers readText. */
function host({ withReadText }: { withReadText: boolean }) {
  const seam = {
    async resolve(path, opts = {}) {
      const absolute = resolve(opts.cwd ?? workspace, path)
      return { targetKey: await realpathOfDeepest(absolute), displayPath: absolute }
    },
    contains: (parent, child) => parent.targetKey === child.targetKey || inside(parent.targetKey, child.targetKey),
    async stat(target) {
      const info = await import('node:fs/promises').then(m => m.stat(target.targetKey)).catch(() => undefined)
      return info && { version: 'v', type: info.isFile() ? 'file' : 'directory', size: info.size }
    },
    readBytes: async target => new Uint8Array(await readFile(target.targetKey)),
    ...withReadText ? { readText: async target => await readFile(target.targetKey, 'utf8') } : {},
  }
  return {
    get: name => name === 'dshHomePath'
      ? (...segments) => join(home, ...segments)
      : name === 'sandboxPolicy' ? { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) } : undefined,
    fs: seam,
  }
}

const exec = { agent: { session: { id: 'sess-1', header: { cwd: '' } } }, signal: new AbortController().signal }

const out = []
for (const withReadText of [false, true]) {
  const store = cardStore(host({ withReadText }), exec)
  // `viz/a.html` is the legacy workspace form: the store opens it through ctx.fs.
  const card = await store.open('viz/a.html')
  try {
    out.push({ fixture: withReadText ? 'fixed (readText present)' : 'old (readText missing)', verdict: 'READ OK', text: (await card.read()).trim() })
  } catch (error) {
    out.push({ fixture: withReadText ? 'fixed (readText present)' : 'old (readText missing)', verdict: 'READ FAILED', text: String(error.message) })
  }
}
for (const row of out) console.log(row.verdict.padEnd(12), '|', row.fixture.padEnd(28), '|', row.text)
const ok = out[0].verdict === 'READ FAILED' && /readText is not a function/u.test(out[0].text)
  && out[1].verdict === 'READ OK' && out[1].text === '<div>legacy card</div>'
console.log('')
console.log(ok ? 'PROOF OK: the incomplete fake crashed; the completed fake returns the card the real seam returns.' : 'PROOF FAILED')
await rm(home, { recursive: true, force: true })
await rm(workspace, { recursive: true, force: true })
process.exit(ok ? 0 : 1)
