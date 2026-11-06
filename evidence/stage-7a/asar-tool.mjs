/**
 * Read the installed Electron asar without extracting 213 MB.
 *
 * Usage:
 *   node tmp/probes/asar-tool.mjs list dsh/node_modules/@deepseek-ai
 *   node tmp/probes/asar-tool.mjs extract dsh/node_modules/@deepseek-ai/dsh-client-ui-conversation [more...] --out tmp/dsh-host-0.2.2-rc.1
 *
 * Every extracted file is verified against the asar's own SHA-256 integrity
 * record before it is written, so a corrupted read cannot pass silently.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'

const ASAR = process.env.DSH_ASAR
  ?? join(process.env.LOCALAPPDATA ?? '', 'Programs', 'DeepSeek Harness', 'resources', 'app.asar')

const buf = readFileSync(ASAR)
const headerPickleSize = buf.readUInt32LE(4)
const jsonLength = buf.readUInt32LE(12)
const jsonStart = 16
if (buf[jsonStart] !== 0x7b) throw new Error(`expected JSON at ${jsonStart}`)
const header = JSON.parse(buf.subarray(jsonStart, jsonStart + jsonLength).toString('utf8'))
const dataStart = 8 + headerPickleSize
if (dataStart !== jsonStart + jsonLength) throw new Error('header layout mismatch')

const entryAt = path => {
  let node = header
  for (const part of path.split('/')) {
    node = node.files?.[part]
    if (node === undefined) return undefined
  }
  return node
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

function readEntry(path) {
  const node = entryAt(path)
  if (node === undefined) throw new Error(`not in asar: ${path}`)
  if (node.files !== undefined) throw new Error(`is a directory: ${path}`)
  const start = dataStart + Number(node.offset)
  const bytes = buf.subarray(start, start + Number(node.size))
  const expected = node.integrity?.hash
  if (expected !== undefined && sha256(bytes) !== expected) {
    throw new Error(`integrity mismatch for ${path}`)
  }
  return bytes
}

function walk(node, prefix, out) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const path = `${prefix}/${name}`
    if (child.files !== undefined) walk(child, path, out)
    else out.push({ path, size: Number(child.size) })
  }
  return out
}

const [mode, ...rest] = process.argv.slice(2)
if (mode === 'list') {
  const base = rest[0]
  const node = entryAt(base)
  if (node === undefined) throw new Error(`not in asar: ${base}`)
  const files = walk(node, base, [])
  console.log(JSON.stringify({ base, files }, null, 1))
} else if (mode === 'extract') {
  const outIndex = rest.indexOf('--out')
  const outDir = outIndex < 0 ? undefined : rest[outIndex + 1]
  const prefixes = rest.slice(0, outIndex < 0 ? rest.length : outIndex)
  if (outDir === undefined || prefixes.length === 0) throw new Error('usage: extract <prefix...> --out <dir>')
  const results = []
  const missing = []
  for (const prefix of prefixes) {
    const node = entryAt(prefix)
    if (node === undefined) { missing.push(prefix); continue }
    const files = walk(node, prefix, [])
    for (const file of files) {
      const bytes = readEntry(file.path)
      const target = join(resolve(outDir), ...file.path.split('/'))
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, bytes)
    }
    results.push({ prefix, files: files.length, bytes: files.reduce((n, f) => n + f.size, 0) })
  }
  console.log(JSON.stringify({ outDir: resolve(outDir), extracted: results, missing }, null, 1))
} else {
  console.log(JSON.stringify({
    asar: { bytes: buf.length, dataStart },
    root: { name: header.files?.['package.json'] === undefined ? null : JSON.parse(readEntry('package.json')).name, version: JSON.parse(readEntry('package.json')).version },
    usage: 'list <prefix> | extract <prefix...> --out <dir>',
  }, null, 1))
}