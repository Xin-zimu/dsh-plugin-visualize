/**
 * R2 control, third attempt — and the first one that can actually go red.
 *
 * History of the two earlier attempts, because the failure mode repeated:
 *
 *   1. Asserted "an aborted call throws and writes nothing". Both versions throw
 *      (`legacy-tool.ts:339` checks after image resolution too), so the
 *      assertion passed on pre-fix code. A green light wired to nothing.
 *   2. Measured workspace reads and store writes on the real build and a mutant
 *      with the entry check deleted. Both reported 0 reads. That was not
 *      evidence either: the fake registrant context supplied neither a complete
 *      `ctx.fs` (the reader feature-detects resolve+contains+stat+readBytes) nor
 *      an `inject()` that ever fires, so `imageRoute.ready` stayed false, every
 *      image was reported undeliverable, and image resolution was skipped
 *      entirely — in both builds, aborted or not.
 *
 * So this version proves the rig is connected before believing its negatives:
 *
 *   A. real build, aborted       -> 0 workspace image reads
 *   B. real build, NOT aborted   -> >=1 read and the card is written
 *      (B is the connectivity control: if the harness never reaches image
 *       resolution, B fails and A is meaningless)
 *   C. mutant (entry abort check deleted), aborted -> >=1 read
 *      (the pre-fix behaviour the fix removes: work before the abort is noticed)
 *
 * `lib/` is never modified; the mutant is a byte copy in tmp/ with one deletion.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const OUT = 'evidence/stage-7-pre'
const SCRATCH = resolve('tmp/.r2-mutant')
mkdirSync(OUT, { recursive: true })
rmSync(SCRATCH, { recursive: true, force: true })
mkdirSync(SCRATCH, { recursive: true })

const REAL = resolve('lib/index.js')
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

const original = readFileSync(REAL, 'utf8')
const ENTRY = 'options.signal?.throwIfAborted()'
const occurrences = original.split(ENTRY).length - 1
const allChecks = original.split('throwIfAborted').length - 1
if (occurrences !== 1) throw new Error(`expected exactly one entry check, found ${occurrences}`)

const at = original.indexOf(ENTRY)
const MUTANT = join(SCRATCH, 'index.js')
const mutantSource = original.slice(0, at) + '/* MUTANT: entry abort check deleted */' + original.slice(at + ENTRY.length)
writeFileSync(MUTANT, mutantSource)

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Boot one bundle against a registrant context that behaves like a capable host. */
async function bootTool(bundlePath, { home, workspace, reads, writes }) {
  const plugin = await import(pathToFileURL(bundlePath).href + `?v=${Math.random()}`)
  let tool
  const fs = {
    resolve: async path => ({ displayPath: path, path }),
    contains: () => true,
    stat: async () => ({ type: 'file', size: PNG.length }),
    readBytes: async target => {
      reads.push(String(target?.path ?? target))
      return PNG
    },
    readText: async () => '',
    writeText: async (target, content) => {
      writes.push({ path: String(target?.path ?? target), bytes: String(content ?? '').length })
      return { version: 1 }
    },
    observe: async () => () => {},
  }
  const connection = { fetch: { register: () => () => {} } }
  const scope = {
    get: name => (name === 'connection' ? connection : undefined),
    effect: fn => { fn(); return () => {} },
  }
  const ctx = {
    get(name) {
      if (name === 'dshHomePath') return (...segments) => join(home, ...segments)
      if (name === 'sandboxPolicy') return { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) }
      return undefined
    },
    fs,
    tools: { register: definition => { tool = definition; return () => {} } },
    skills: { registerProvider: () => () => {} },
    // Without this firing, registerImageRoute never runs: delivery() stays false
    // and image resolution is skipped. That was attempt 2's bug.
    inject: (_deps, callback) => { callback(scope); return () => {} },
    on: () => () => {},
    effect: fn => { fn(); return () => {} },
    fiber: {},
  }
  plugin.apply(ctx, { maxFragmentBytes: 1_000_000, style: 'whale', selfRepair: false })
  if (tool === undefined) throw new Error('bundle registered no tool')
  return tool
}

/** Every file under a directory, relative, sorted, with `/` separators on every platform. */
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

/** One call against one bundle, with the aborted/not-aborted switch explicit. */
async function run(bundlePath, label, { abort }) {
  const base = join(SCRATCH, label)
  const home = join(base, 'home')
  const workspace = join(base, 'ws')
  mkdirSync(join(workspace, 'figs'), { recursive: true })
  writeFileSync(join(workspace, 'figs', 'probe.png'), Buffer.from(PNG))
  const reads = []
  const writes = []
  const tool = await bootTool(bundlePath, { home, workspace, reads, writes })
  const storeRoot = join(home, 'visualize')
  const before = walk(storeRoot)
  const ac = new AbortController()
  if (abort) ac.abort()
  let threw = null
  let images
  try {
    const result = await tool.execute(
      { action: 'create', title: 'Abort Probe', source: '<div><p>x</p><img data-viz-src="figs/probe.png" alt="figure"></div>' },
      { agent: { session: { id: 's1', header: { cwd: workspace } } }, signal: ac.signal },
    )
    images = result?.images?.length ?? 0
  } catch (error) {
    threw = String(error?.name ?? 'Error')
  }
  const added = walk(storeRoot).filter(file => !before.includes(file))
  return {
    abort,
    threw,
    workspaceImageReads: reads.length,
    readPaths: reads.map(path => path.slice(base.length + 1).split(sep).join('/')),
    // Counts only ctx.fs.writeText; a session-store card is written with
    // node:fs at its absolute path, so 0 here beside storeFilesAdded > 0 is
    // expected. storeFilesAdded is the real measurement.
    storeWritesViaCtxFs: writes.length,
    storeFilesAdded: added.length,
    storeFiles: added,
    imageCount: images,
  }
}

const realAborted = [await run(REAL, 'real-aborted-1', { abort: true }), await run(REAL, 'real-aborted-2', { abort: true })]
const realLive = [await run(REAL, 'real-live-1', { abort: false }), await run(REAL, 'real-live-2', { abort: false })]
const mutantAborted = [await run(MUTANT, 'mutant-aborted-1', { abort: true }), await run(MUTANT, 'mutant-aborted-2', { abort: true })]

const report = {
  builds: {
    real: { path: REAL, sha256: sha256(original), throwIfAbortedOccurrences: allChecks },
    mutant: {
      path: MUTANT,
      sha256: sha256(mutantSource),
      throwIfAbortedOccurrences: mutantSource.split('throwIfAborted').length - 1,
      edit: 'deleted the resolveCardImages entry `options.signal?.throwIfAborted()` (src/images.ts:115)',
    },
  },
  runs: { realAborted, realLive, mutantAborted },
  notes: [
    'storeWritesViaCtxFs counts only ctx.fs.writeText; a session-store card is written with node:fs at its absolute path, so 0 there beside storeFilesAdded > 0 is expected. storeFilesAdded is the real measurement.',
    'Scope: action=create with one workspace <img data-viz-src>, and the abort is set before the call. The update path and an abort arriving mid-resolution were not exercised.',
  ],
  discriminates: {
    abortedRealDoesNoImageWork: realAborted.every(r => r.workspaceImageReads === 0),
    abortedRealWritesNothing: realAborted.every(r => r.storeFilesAdded === 0),
    liveRealReachesImageResolution: realLive.every(r => r.workspaceImageReads >= 1 && r.threw === null && r.imageCount >= 1),
    liveRealWritesTheCard: realLive.every(r => r.storeFiles.some(f => f.endsWith('.html'))),
    abortedMutantDoesImageWork: mutantAborted.every(r => r.workspaceImageReads >= 1),
    // Pre-fix side effect, measured not inferred: the aborted call deposits the
    // image bytes in the content-addressed store before noticing the abort.
    abortedMutantLeavesImageBytes: mutantAborted.every(r => r.storeFiles.some(f => f.includes('/images/'))),
    abortedMutantWritesNoCard: mutantAborted.every(r => !r.storeFiles.some(f => f.endsWith('.html'))),
    mutantStillThrowsAfterWork: mutantAborted.every(r => r.threw === 'AbortError'),
  },
}
const d = report.discriminates
report.verdict = d.abortedRealDoesNoImageWork && d.abortedRealWritesNothing
  && d.liveRealReachesImageResolution && d.liveRealWritesTheCard
  && d.abortedMutantDoesImageWork && d.abortedMutantLeavesImageBytes
  && d.abortedMutantWritesNoCard && d.mutantStillThrowsAfterWork
  ? 'PASS — the rig reaches image resolution and writes a card; the real build does no image reads and adds no store files before the abort, the pre-fix mutant reads the image and leaves orphan image bytes'
  : !d.liveRealReachesImageResolution || !d.liveRealWritesTheCard
    ? 'INCONCLUSIVE — the harness never reached image resolution, so every "0 reads" above is meaningless'
    : 'FAIL — the mutant/real difference did not appear'

writeFileSync(join(OUT, 'r2-mutant-control.json'), JSON.stringify(report, null, 1))
console.log(JSON.stringify(report, null, 1))
process.exit(report.verdict.startsWith('PASS') ? 0 : 1)