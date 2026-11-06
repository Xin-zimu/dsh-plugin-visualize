
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






export async function workspacePath(root                    , path        )                              {
  if (root === undefined || !isAbsolute(root)) return undefined
  const tilde = path === '~' || path.startsWith('~/')
  const expanded = tilde ? join(homedir(), path.slice(1)) : path
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
  const expanded = path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path
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