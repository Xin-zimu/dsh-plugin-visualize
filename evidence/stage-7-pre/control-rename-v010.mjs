
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
const RENAME_ATTEMPTS = 20
const RENAME_BACKOFF_MS = 5
const delay = ms => new Promise(r => setTimeout(r, ms))
/**
 * Write a plugin-owned file through a sibling temporary file and a rename, so
 * a reader never sees half of it. The rename replaces a symlink at `path`
 * rather than writing through it.
 * @param path - absolute file path; missing parent directories are created private.
 * @param content - the new text, or raw bytes.
 */
async function writeFileAtomic(path        , content                     )                {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  // Unique per write, not per millisecond: concurrent creates of the same
  // content-addressed card would otherwise share one temp file, and the
  // second rename would find it already moved. With distinct temps both
  // renames land, and identical bytes make the last one a no-op.
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await rename(temp, path)
  } catch (error) {
    // EEXIST means the name was taken and the file is not ours to remove.
    if ((error                         ).code !== 'EEXIST') await rm(temp, { force: true }).catch(() => {})
    throw error
  }
}
export { writeFileAtomic }
