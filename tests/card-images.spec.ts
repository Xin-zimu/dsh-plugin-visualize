import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { visualizeTool } from '../src/tool.ts'
import { visualizeMetaFrom } from '../src/fragment.ts'
import { handleImageRequest, inside, ownedPath, realpathOfDeepest } from '../src/storage.ts'
import type { UrlFetcher } from '../src/images.ts'
import { linkCapability } from './link-capability.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
/** A second PNG with different bytes, standing in for a regenerated figure. */
const PNG2 = Uint8Array.from([...PNG, 1, 2, 3, 4])
/** A realistic figure size, so the log-size assertion means something. */
const FIGURE = Uint8Array.from([...PNG, ...new Uint8Array(200 * 1024).fill(7)])

let home: string
let workspace: string

beforeEach(async () => {
  home = await realpath(await mkdtemp(join(tmpdir(), 'viz-home-')))
  workspace = await realpath(await mkdtemp(join(tmpdir(), 'viz-ws-')))
  await mkdir(join(workspace, 'figs'))
  await writeFile(join(workspace, 'figs', 'loss.png'), FIGURE)
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(workspace, { recursive: true, force: true })
})

/** Host context: a real home, the session sandbox policy, and an fs seam over the real disk. */
function host() {
  return {
    get: (name: string) => {
      if (name === 'dshHomePath') return (...segments: string[]) => join(home, ...segments)
      if (name === 'sandboxPolicy') return { resolve: () => ({ mode: 'workspace-write', workspaceRoot: workspace }) }
      return undefined
    },
    fs: {
      async resolve(path: string, opts: { cwd?: string } = {}) {
        const absolute = resolve(opts.cwd ?? workspace, path)
        return { targetKey: await realpathOfDeepest(absolute), displayPath: absolute }
      },
      contains: (parent: { targetKey: string }, child: { targetKey: string }) =>
        parent.targetKey === child.targetKey || inside(parent.targetKey, child.targetKey),
      async stat(target: { targetKey: string }) {
        const info = await stat(target.targetKey).catch(() => undefined)
        return info && { version: 'v', type: info.isFile() ? 'file' : 'directory', size: info.size }
      },
      // The seam is a fake over the real disk, so it must answer every method
      // the product calls, not only the ones an earlier spec happened to
      // reach: `readText` is a real `FsService` method
      // (@deepseek-ai/dsh-fs, `abstract readText(target, signal?)`) and the
      // store reads a legacy card through it. Without it the seam throws
      // `ctx.fs.readText is not a function`, which is a fixture defect, not
      // the behaviour this spec is about.
      readText: async (target: { targetKey: string }) => await readFile(target.targetKey, 'utf8'),
      readBytes: async (target: { targetKey: string }) => new Uint8Array(await readFile(target.targetKey)),
    },
  } as unknown as Context
}

/** A URL fetcher that serves one PNG per URL and counts calls. */
function fakeWeb() {
  const calls: string[] = []
  const fetchUrl: UrlFetcher = async (url) => {
    calls.push(url.href)
    if (url.pathname.endsWith('/missing.png')) throw new Error('the server answered HTTP 404')
    return PNG
  }
  return { calls, fetchUrl }
}

const exec = { agent: { session: { id: 'sess-1', header: { cwd: '' } } }, signal: new AbortController().signal } as never

type Value = { path: string; fragment: string; images?: { src: string; id: string; type: string; bytes: number }[]; imageReport?: string }

function setup(delivery = true) {
  const web = fakeWeb()
  const tool = visualizeTool(host(), 100_000, 'whale', { delivery: () => delivery, fetchUrl: web.fetchUrl })
  const run = async (args: Record<string, unknown>) => await tool.execute(args, exec) as Value
  const text = (value: Value) => tool.output.render({} as never, value as never).map(b => (b as { text: string }).text).join('\n')
  const meta = (value: Value) => tool.output.presentationMeta!({} as never, value as never)
  return { tool, web, run, text, meta }
}

const FRAGMENT = '<div id="lab"><h3>Loss</h3>\n'
  + '<img data-viz-src="./figs/loss.png" alt="training loss" width="320">\n'
  + '<img data-viz-src="https://example.com/a.png" alt="reference">\n'
  + '<img data-viz-src="./figs/los.png" alt="typo"></div>'

describe('visualize with data-viz-src images', () => {
  it('stores the bytes beside the card and keeps them out of the fragment, the result text and the meta', async () => {
    const { run, text, meta } = setup()
    const value = await run({ fragment: FRAGMENT, title: 'Lab' })

    // The fragment the model wrote is what the card stores and replays. The
    // reported `path` is the display form — `~` + the rest when the store sits
    // under the OS home, which on Windows is where the temp dir is — so the file
    // behind it is found by expanding it back, the way `update` does. Reading
    // `value.path` directly only worked where the two forms coincide (POSIX).
    expect(value.fragment).toBe(FRAGMENT)
    expect(await readFile((await ownedPath(join(home, 'visualize'), value.path))!, 'utf8')).toBe(FRAGMENT)
    expect(value.images!.map(i => [i.src, i.type, i.bytes])).toEqual([
      ['./figs/loss.png', 'image/png', FIGURE.byteLength],
      ['https://example.com/a.png', 'image/png', PNG.byteLength],
    ])
    // Content-addressed under the session's images/ directory.
    const stored = await readdir(join(home, 'visualize', 'sessions', 'sess-1', 'images'))
    const digest = createHash('sha256').update(FIGURE).digest('hex')
    expect(stored).toContain(`${digest}.png`)
    expect(value.images![0]!.id).toBe(`sess-1/${digest}.png`)

    // The persisted meta carries references only: a few hundred bytes for a 200 KB figure.
    const persisted = meta(value)
    expect(visualizeMetaFrom(persisted)!.images).toEqual(value.images)
    const metaBytes = JSON.stringify(persisted).length
    // A ratio, not `FRAGMENT.length + 600`. That form measured the host's temp
    // path as much as the payload: the fragment is stored twice (fragment, and
    // the pre-fork `source` that the OpenUI reader falls back to), the path is
    // absolute, and each of the two ids is a 73-character content address, so
    // the real constant is ~760 and the budget was unreachable. It also only
    // ever ran here: on Windows this test failed at the `readFile` above, so
    // the assertion had never executed on either platform. 972 bytes against
    // 204 816 is the claim that matters — the bytes are not in the meta.
    expect(metaBytes).toBeLessThan(FIGURE.byteLength / 50)
    expect(JSON.stringify(persisted)).not.toContain('base64')

    // The model hears which image failed and why, and nothing it did not need.
    const result = text(value)
    expect(result).toContain('Embedded 2 images')
    expect(result).toContain('1 image could not be embedded and shows a placeholder')
    expect(result).toContain('"./figs/los.png": not found in the workspace')
    expect(result.length).toBeLessThan(800)
  })

  it('re-reads workspace files and carries fetched URLs on update', async () => {
    const { run, web } = setup()
    const created = await run({ fragment: FRAGMENT, title: 'Lab' })
    expect(web.calls).toEqual(['https://example.com/a.png'])

    // The figure is regenerated, then an unrelated line is patched.
    await writeFile(join(workspace, 'figs', 'loss.png'), PNG2)
    const patched = await run({ action: 'update', path: created.path, title: 'Lab', old_str: '<h3>Loss</h3>', new_str: '<h3>Loss, epoch 2</h3>' })
    expect(patched.path).toBe(created.path)
    expect(web.calls).toEqual(['https://example.com/a.png'])
    expect(patched.images!.find(i => i.src === './figs/loss.png')!.bytes).toBe(PNG2.byteLength)
    expect(patched.images!.find(i => i.src === 'https://example.com/a.png')).toEqual(created.images![1])

    // Fixing the typo'd path resolves the image that failed before.
    const fixed = await run({ action: 'update', path: created.path, title: 'Lab', old_str: './figs/los.png', new_str: './figs/loss.png' })
    expect(fixed.imageReport).toBe('Embedded 2 images (1 KB, stored beside the card).')
    expect(fixed.images!.map(i => i.src)).toEqual(['./figs/loss.png', 'https://example.com/a.png'])
    // A new URL is fetched; the carried one still is not.
    const added = await run({ action: 'update', path: created.path, title: 'Lab', old_str: '<h3>', new_str: '<img data-viz-src="https://example.com/b.png"><h3>' })
    expect(web.calls).toEqual(['https://example.com/a.png', 'https://example.com/b.png'])
    expect(added.images).toHaveLength(3)
  })

  it('leaves the card untouched when an update is cancelled while its images resolve', async () => {
    let started: () => void = () => {}
    const fetching = new Promise<void>(done => {
      started = done
    })
    let hang = true
    const fetchUrl: UrlFetcher = async (_url, signal) => {
      if (!hang) return PNG
      started()
      return await new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason)))
    }
    const tool = visualizeTool(host(), 100_000, 'whale', { delivery: () => true, fetchUrl })
    const created = await tool.execute({ fragment: '<div id="lab"><h3>Loss</h3></div>', title: 'Lab' }, exec) as Value
    // `created.path` is the display form the tool reports — `~` plus the rest
    // when the store sits under the OS home, which on Windows is where the
    // temp dir lives. Raw node fs does not expand `~`, so the file is resolved
    // the same way `update` resolves it rather than being read through the
    // reported string.
    const cardPath = await ownedPath(join(home, 'visualize'), created.path)
    if (cardPath === undefined) throw new Error(`the reported path ${created.path} does not resolve back to a store file`)
    const manifest = cardPath.replace(/\.html$/u, '.images.json')
    const patch = { action: 'update', path: created.path, title: 'Lab', old_str: '<h3>Loss</h3>', new_str: '<img data-viz-src="https://example.com/a.png"><h3>Loss</h3>' }

    const cancel = new AbortController()
    const call = tool.execute(patch, { agent: { session: { id: 'sess-1', header: { cwd: '' } } }, signal: cancel.signal } as never)
    // Wait for the stub, but fail on the update's own settlement first. Without
    // that race an update which dies before it fetches leaves this await pending
    // until the test bound kills the run, and its real error is reported only as
    // an unhandled rejection: that is how this test spent two stages failing with
    // `STACK_TRACE_ERROR` and no contradicted assertion, after a 39 ms failure.
    // Both handlers return, so the raced promise cannot itself go unhandled.
    const outcome = await Promise.race([
      fetching.then(() => undefined),
      call.then(
        () => 'the update resolved instead of waiting for its image' as const,
        (error: unknown) => `the update failed before its image was fetched: ${String(error)}` as const,
      ),
    ])
    if (outcome !== undefined) throw new Error(outcome)
    cancel.abort()
    await expect(call).rejects.toThrow()
    expect(await readFile(cardPath, 'utf8')).toBe('<div id="lab"><h3>Loss</h3></div>')
    await expect(stat(manifest)).rejects.toThrow()

    // The same patch, retried, still finds its old_str.
    hang = false
    const retried = await tool.execute(patch, exec) as Value
    expect(retried.fragment).toContain('data-viz-src')
    expect(retried.images).toHaveLength(1)
    expect(await readFile(manifest, 'utf8')).toContain('https://example.com/a.png')
  })

  it('renders the card and says why on a host that cannot deliver images', async () => {
    const { run, text } = setup(false)
    const value = await run({ fragment: FRAGMENT, title: 'Lab' })
    expect(value.images).toBeUndefined()
    expect(await readFile((await ownedPath(join(home, 'visualize'), value.path))!, 'utf8')).toBe(FRAGMENT)
    expect(text(value)).toContain('3 images could not be embedded')
    expect(text(value)).toContain('needs dsh 0.1.7 or later')
  })

  it('leaves a card without images exactly as before', async () => {
    const { run, text, meta } = setup()
    const value = await run({ fragment: '<div id="lab">x</div>', title: 'Lab' })
    expect(value.images).toBeUndefined()
    expect(value.imageReport).toBeUndefined()
    expect('images' in (meta(value) as object)).toBe(false)
    expect(text(value)).not.toContain('image')
  })
})

describe('image route', () => {
  const get = async (id: string, method = 'GET') => await handleImageRequest(
    join(home, 'visualize'),
    new Request(`http://dsh.test/api/dsh-visualize/image?id=${encodeURIComponent(id)}`, { method }),
  )

  it('serves a stored image as an opaque, sandboxed download', async () => {
    const { run } = setup()
    const value = await run({ fragment: FRAGMENT, title: 'Lab' })
    const response = await get(value.images![0]!.id)
    expect(response.status).toBe(200)
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(FIGURE)
    expect(response.headers.get('content-type')).toBe('application/octet-stream')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    expect((await get(value.images![0]!.id, 'HEAD')).status).toBe(200)
  })

  // Split so the six id shapes that need no symlink keep running everywhere. The
  // symlink id is the one assertion here that needs SeCreateSymbolicLinkPrivilege,
  // and it cannot be substituted: a hardlink shares an inode, so `realpath` cannot
  // see it and the "not a link" property under test would not exist. Assertions
  // unchanged; it runs on CI Windows and on POSIX.
  it('opens nothing but a well-formed id of an intact regular file below the store', async () => {
    const digest = createHash('sha256').update(PNG).digest('hex')
    const dir = join(home, 'visualize', 'sessions', 'sess-1', 'images')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${'0'.repeat(64)}.png`), PNG)
    for (const id of [
      `sess-1/${'0'.repeat(64)}.png`, // bytes that no longer match their digest
      `../../${digest}.png`,
      `sess-1/../sess-1/${digest}.png`,
      `sess-1/${digest}.html`,
      '/etc/passwd',
      '',
    ]) {
      expect((await get(id)).status, id).toBe(404)
    }
    expect((await handleImageRequest(undefined, new Request(`http://dsh.test/x?id=sess-1/${digest}.png`))).status).toBe(404)
    expect((await handleImageRequest(home, new Request('http://dsh.test/x', { method: 'POST', body: '' }))).status).toBe(405)
  })

  it.skipIf(!linkCapability().fileSymlink)('refuses to serve an image reached through a symlink', async () => {
    const digest = createHash('sha256').update(PNG).digest('hex')
    const dir = join(home, 'visualize', 'sessions', 'sess-1', 'images')
    await mkdir(dir, { recursive: true })
    const outside = join(workspace, 'secret.png')
    await writeFile(outside, PNG)
    await symlink(outside, join(dir, `${digest}.png`))
    // A symlink to a real image is still not served: the route only opens regular
    // files below the store, resolved.
    expect((await get(`sess-1/${digest}.png`)).status).toBe(404)
  })
})
