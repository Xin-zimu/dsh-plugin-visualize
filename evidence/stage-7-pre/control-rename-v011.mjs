
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dirname } from 'node:path'
const RENAME_ATTEMPTS = 20
const RENAME_BACKOFF_MS = 5
const delay = ms => new Promise(r => setTimeout(r, ms))
/**
 * `rename` with a bounded retry for the transient refusal Windows puts up when
 * two writes race for one destination.
 *
 * Distinct temp files are not enough there: the MoveFileEx behind `rename`
 * returns `EPERM` when another write holds the destination, measured at 1-3 of
 * 8 concurrent writes to one content-addressed card name. Those writers are not
 * in conflict — the bytes are identical by construction — so the refusal is a
 * scheduling artefact, and retrying it is what makes concurrent creates of the
 * same card succeed rather than throw. `EBUSY` and `EACCES` are the same shape.
 *
 * `EEXIST` is deliberately not retried: for a rename it would mean the
 * destination is a directory, which no retry fixes, and it is the code
 * {@link writeFileAtomic} uses to mean "the temp name was taken", so swallowing
 * it here would leak the temp file the caller then declines to remove.
 * @param from - the sibling temp file just written.
 * @param to - the destination to replace.
 */
async function renameWithRetry(from        , to        )                {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to)
      return
    } catch (error) {
      const code = (error                         ).code
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      if (!transient || attempt >= RENAME_ATTEMPTS) throw error
      await new Promise(done => setTimeout(done, RENAME_BACKOFF_MS))
    }
  }
}/**
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
  // second rename would find it already moved. Distinct temps keep every write
  // independent, and identical bytes make the last rename a no-op.
  const temp = `${path}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    await writeFile(temp, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
    await renameWithRetry(temp, path)
  } catch (error) {
    // EEXIST means the name was taken and the file is not ours to remove.
    if ((error                         ).code !== 'EEXIST') await rm(temp, { force: true }).catch(() => {})
    throw error
  }
}
export { writeFileAtomic }
