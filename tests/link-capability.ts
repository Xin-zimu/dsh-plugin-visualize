/**
 * Which link shapes can this machine actually create?
 *
 * Six containment tests need to put a file or a directory behind a link that
 * points out of the workspace. Whether that is possible depends on the OS and on
 * privileges the test cannot grant itself:
 *
 *   - POSIX: `symlink(2)` is unprivileged, so everything works.
 *   - Windows: creating a symlink needs SeCreateSymbolicLinkPrivilege, i.e.
 *     Developer Mode or an elevated process. A stock CI runner has it; a stock
 *     developer box usually does not. A **junction** needs no privilege and is a
 *     real reparse point, so `realpath` resolves through it exactly as it does
 *     through a directory symlink.
 *
 * Measured on this project's Windows machine, for the record:
 *
 *     file symlink (fs.symlink)              EPERM
 *     directory symlink (type: 'dir')        EPERM
 *     directory junction (type: 'junction')  OK
 *     file hardlink (fs.link)                OK  <- NOT usable, see below
 *
 * A hardlink is deliberately not offered as a substitute for the file case: it
 * shares an inode, so the file is not "reached through a link that leaves the
 * tree" at all, `realpath` cannot see it, and the containment property under
 * test does not hold. Substituting one would test a different property while
 * appearing to cover the original.
 *
 * The point of probing rather than hard-coding `process.platform` is that the
 * privilege is a property of the machine, not of the OS: a Windows box with
 * Developer Mode on runs the strict version, and this file must not claim
 * otherwise.
 */
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** What this machine can create. */
export interface LinkCapability {
  /** `fs.symlink` for a file works. */
  readonly fileSymlink: boolean
  /** `fs.symlink` for a directory works, with an explicit `type`. */
  readonly dirSymlink: boolean
  /** A directory junction works (Windows-only; false elsewhere). */
  readonly dirJunction: boolean
}

let cached: LinkCapability | undefined

/**
 * Probe the machine once per process, without throwing.
 *
 * Synchronous on purpose: `it.skipIf` needs its condition at collection time,
 * before any hook has run, so an async probe cannot reach it.
 * @returns which link shapes can be created here.
 */
export function linkCapability(): LinkCapability {
  cached ??= probe()
  return cached
}

/**
 * Explain a missing capability the way a skip message should: what is missing,
 * why it cannot be granted from inside the test, and where the test still runs.
 * @param what - the capability that is absent.
 * @returns a one-line reason for `it.skipIf`/contextual skip output.
 */
export function whySkipped(what: keyof LinkCapability): string {
  const names: Record<keyof LinkCapability, string> = {
    fileSymlink: 'creating a file symlink',
    dirSymlink: 'creating a directory symlink',
    dirJunction: 'creating a directory junction',
  }
  return names[what] + ' needs a privilege this machine does not grant '
    + '(Windows: SeCreateSymbolicLinkPrivilege, i.e. Developer Mode or elevation). '
    + 'The assertions are unchanged; the test runs on CI Windows and on POSIX.'
}

/**
 * Create a directory link to `target` using whichever shape works.
 *
 * Callers must have checked {@link linkCapability} first; this throws with the
 * reason rather than silently producing nothing, so a missing guard fails loudly.
 * @param target - directory the link should point at.
 * @param path - where to create the link.
 * @param cap - the probed capability.
 * @returns the path that was created.
 */
export async function makeDirLink(target: string, path: string, cap: LinkCapability): Promise<string> {
  if (cap.dirSymlink) {
    await symlink(target, path, 'dir')
    return path
  }
  if (cap.dirJunction) {
    await symlink(target, path, 'junction')
    return path
  }
  throw new Error(whySkipped('dirSymlink'))
}

/** Probe by trying, in a throwaway directory. Never throws. */
function probe(): LinkCapability {
  const dir = mkdtempSync(join(tmpdir(), 'linkcap-'))
  const result = { fileSymlink: false, dirSymlink: false, dirJunction: false }
  try {
    const target = join(dir, 'target.txt')
    writeFileSync(target, 'x')
    result.fileSymlink = attempt(() => symlinkSync(target, join(dir, 'f.link')))
    result.dirSymlink = attempt(() => symlinkSync(dir, join(dir, 'd.dir'), 'dir'))
    result.dirJunction = attempt(() => symlinkSync(dir, join(dir, 'd.junc'), 'junction'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  return result
}

/** @returns true when the operation succeeded. */
function attempt(op: () => void): boolean {
  try {
    op()
    return true
  } catch {
    return false
  }
}
