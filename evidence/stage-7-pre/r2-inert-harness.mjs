/**
 * Why "0 reads in both builds" was not evidence: the incomplete harness, reproduced.
 *
 * The first run of `r2-mutant-control.mjs` used a registrant context that was
 * missing two things the real seam requires:
 *
 *   - `ctx.fs.contains` and `ctx.fs.stat`. `workspaceImageReader` feature-detects
 *     resolve+contains+stat+readBytes and throws `ImageError` before reading a
 *     byte when any is missing.
 *   - a firing `inject()`. `registerImageRoute` runs inside
 *     `ctx.inject(['connection'], …)`; when the callback never runs,
 *     `imageRoute.ready` stays false and every image is reported undeliverable
 *     before resolution starts.
 *
 * With that context, even the NOT-aborted call shows 0 workspace reads — so an
 * aborted call showing 0 reads proves nothing at all. This script runs the same
 * two builds through exactly that broken harness and records the zeros, so the
 * failure mode is a saved artefact rather than a recollection.
 *
 * It SHOULD report 0 reads for the live call. That is the point.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = 'evidence/stage-7-pre'
const SCRATCH = resolve('tmp/.r2-inert')
mkdirSync(OUT, { recursive: true })
rmSync(SCRATCH, { recursive: true, force: true })
mkdirSync(SCRATCH, { recursive: true })

const REAL = resolve('lib/index.js')
const original = readFileSync(REAL, 'utf8')
const ENTRY = 'options.signal?.throwIfAborted()'
const at = original.indexOf(ENTRY)
if (at < 0) throw new Error('entry abort check not found; this control has nothing to remove')
const MUTANT = join(SCRATCH, 'index.js')
const mutantSource = original.slice(0, at) + '/* MUTANT */' + original.slice(at + ENTRY.length)
writeFileSync(MUTANT, mutantSource)

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function walk(root) {
  const out = []
  const go = dir => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) go(full)
      else out.push(full.slice(root.length + 1).split(sep).join('/'))
    }
  }
  go(root)
  return out.sort()
}

/** The broken registrant context from attempt 1b, preserved on purpose. */
async function bootBroken(bundlePath, { home, workspace, reads }) {
  const plugin = await import(pathToFileURL(bundlePath).href + `?v=${Math.random()}`)
  let tool
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return (...segments) => join(home, ...segments)
      if (name === 'sandboxPolicy') return { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) }
      return undefined
    },
    fs: {
      // No contains(), no stat(): workspaceImageReader's feature detection refuses.
      resolve: async path => ({ displayPath: path, path }),
      readBytes: async target => { reads.push(String(target?.path ?? target)); return PNG },
      readText: async () => '',
      writeText: async () => ({ version: 1 }),
      observe: async () => () => {},
    },
    tools: { register: definition => { tool = definition; return () => {} } },
    skills: { registerProvider: () => () => {} },
    // Never calls its callback: the image route never registers, so delivery() is false.
    inject: () => () => {},
    on: () => () => {},
    effect: fn => { fn(); return () => {} },
    fiber: {},
  }
  plugin.apply(ctx, { maxFragmentBytes: 1_000_000, style: 'whale', selfRepair: false })
  if (tool === undefined) throw new Error('bundle registered no tool')
  return tool
}

async function run(bundlePath, label, { abort }) {
  const base = join(SCRATCH, label)
  const home = join(base, 'home')
  const workspace = join(base, 'ws')
  mkdirSync(join(workspace, 'figs'), { recursive: true })
  writeFileSync(join(workspace, 'figs', 'probe.png'), Buffer.from(PNG))
  const reads = []
  const tool = await bootBroken(bundlePath, { home, workspace, reads })
  const storeRoot = join(home, 'visualize')
  const before = walk(storeRoot)
  const ac = new AbortController()
  if (abort) ac.abort()
  let threw = null
  let imageCount
  try {
    const result = await tool.execute(
      { action: 'create', title: 'Inert Probe', source: '<div><p>x</p><img data-viz-src="figs/probe.png" alt="figure"></div>' },
      { agent: { session: { id: 's1', header: { cwd: workspace } } }, signal: ac.signal },
    )
    imageCount = result?.images?.length ?? 0
  } catch (error) {
    threw = String(error?.name ?? 'Error')
  }
  const added = walk(storeRoot).filter(file => !before.includes(file))
  return { abort, threw, workspaceImageReads: reads.length, storeFilesAdded: added.length, imageCount }
}

const realLive = [await run(REAL, 'real-live-1', { abort: false }), await run(REAL, 'real-live-2', { abort: false })]
const realAborted = [await run(REAL, 'real-aborted-1', { abort: true }), await run(REAL, 'real-aborted-2', { abort: true })]
const mutantAborted = [await run(MUTANT, 'mutant-aborted-1', { abort: true }), await run(MUTANT, 'mutant-aborted-2', { abort: true })]

const report = {
  purpose: 'Reproduce the broken harness that made "0 workspace reads in both builds" look like evidence. The live call must also show 0 reads; that is what makes the aborted rows meaningless.',
  harnessDefects: [
    'ctx.fs has no contains() and no stat(); workspaceImageReader feature-detects all four methods and throws ImageError before reading',
    'ctx.inject() never invokes its callback; registerImageRoute never runs and imageRoute.ready stays false, so every image is reported undeliverable before resolution',
  ],
  builds: { real: { path: REAL, sha256: sha256(original) }, mutant: { path: MUTANT, sha256: sha256(mutantSource) } },
  runs: { realLive, realAborted, mutantAborted },
  finding: {
    liveCallReachesImageResolution: realLive.some(r => r.workspaceImageReads > 0),
    appendedImageToCard: realLive.some(r => r.imageCount > 0),
  },
  verdict: realLive.every(r => r.workspaceImageReads === 0)
    ? 'INERT HARNESS, REPRODUCED — even the un-aborted call reads nothing, so the earlier "0 reads" rows from this rig were measuring nothing. Every "it did nothing" needs a positive control.'
    : 'UNEXPECTED — the broken harness did reach image resolution; the account of attempt 1b needs re-checking',
}
report.verdict = report.finding.liveCallReachesImageResolution
  ? 'UNEXPECTED — the broken harness did reach image resolution; the account of attempt 1b needs re-checking'
  : report.verdict

writeFileSync(join(OUT, 'r2-inert-harness.json'), JSON.stringify(report, null, 1))
console.log(JSON.stringify(report, null, 1))
process.exit(report.verdict.startsWith('INERT') ? 0 : 1)