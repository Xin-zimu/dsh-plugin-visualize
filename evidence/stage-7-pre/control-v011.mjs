
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { realpath } from 'node:fs/promises'

function inside(root, target) {
  const rel = relative(root, target)
  return rel.length > 0 && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel)
}

export async function realpathOfDeepest(target) {
  let existing = target
  for (;;) {
    try { return join(await realpath(existing), relative(existing, target)) }
    catch {
      const parent = (await import('node:path')).dirname(existing)
      if (parent === existing) return target
      existing = parent
    }
  }
}


/**
 * Whether `path` is the `~` display form {@link displayOf} writes.
 *
 * Both separators are accepted on every OS: the producer uses the native one,
 * and a path that crossed a session log, a POSIX transcript or a model's own
 * normalisation may arrive with `/`. `~` alone means the home directory.
 * @param path - a path as the model passed it.
 * @returns true when it starts with `~` and a separator, or is `~`.
 */
function isDisplayPath(path        )          {
  return path === '~' || path.startsWith(`~${sep}`) || path.startsWith('~/')
}

/**
 * Expand the `~` display form back to an absolute path, leaving anything else
 * untouched: a relative path still resolves against the caller's root, and an
 * absolute one is used as given.
 * @param path - a path as the model passed it.
 * @returns the absolute path, or `path` itself when it is not a display form.
 */
function expandDisplayPath(path        )         {
  return isDisplayPath(path) ? join(homedir(), path.slice(1)) : path
}

export async function workspacePath(root                    , path        )                              {
  if (root === undefined || !isAbsolute(root)) return undefined
  const tilde = isDisplayPath(path)
  const expanded = expandDisplayPath(path)
  const base = resolve(root)
  const target = resolve(base, expanded)
  if (!inside(base, target) || !target.endsWith('.html')) return undefined
  const realRoot = await realpath(base).catch(() => base)
  if (!inside(realRoot, await realpathOfDeepest(target))) return undefined
  // A plain relative path resolves against this same root in the seam, which
  // keeps its display form; anything else goes in as the checked absolute path.
  return tilde || isAbsolute(path) ? target : path
}

export async function ownedPath(root        , path        )                              {
  const expanded = expandDisplayPath(path)
  if (!isAbsolute(expanded)) return undefined
  const target = resolve(expanded)
  if (!inside(root, target) || !target.endsWith('.html')) return undefined
  // A symlink inside the store — the file or a directory above it — must not
  // carry a read or a write anywhere else.
  const real = await realpath(target).catch(async () => await realpath(dirname(target)).then(
    parent => join(parent, 'card.html'),
    () => undefined,
  ))
  // Nothing on disk yet: the card does not exist, and the read fails loudly.
  if (real === undefined) return target
  const realRoot = await realpath(root).catch(() => root)
  return inside(realRoot, real) ? target : undefined
}