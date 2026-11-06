/**
 * Prove that tmp/dsh-host-src came from the installed app.asar, without extraction.
 *
 * The Electron asar format on this build: [u32 4][u32 headerPickleSize] then a
 * Chromium pickle [u32 stringSize][u32 jsonLength][json…]; JSON starts at 16 and
 * the file data at 8 + headerPickleSize (which equals 16 + jsonLength — asserted).
 * Reading the header JSON is enough to find package.json and to compare a file's
 * recorded size/integrity with the extracted copy.
 */
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const ASAR = process.env.DSH_ASAR
  ?? `${process.env.LOCALAPPDATA ?? ''}/Programs/DeepSeek Harness/resources/app.asar`

const buf = readFileSync(ASAR)
// Layout observed on this build: [u32 4][u32 headerPickleSize] then a Chromium
// pickle: [u32 stringSize][u32 jsonLength][json…]. JSON therefore starts at 16,
// and the file data starts at 8 + headerPickleSize (which equals 16 + jsonLength).
const headerPickleSize = buf.readUInt32LE(4)
const jsonLength = buf.readUInt32LE(12)
const jsonStart = 16
if (buf[jsonStart] !== 0x7b) throw new Error(`expected JSON at ${jsonStart}, got 0x${buf[jsonStart].toString(16)}`)
const header = JSON.parse(buf.subarray(jsonStart, jsonStart + jsonLength).toString('utf8'))
const dataStart = 8 + headerPickleSize
if (dataStart !== jsonStart + jsonLength) {
  throw new Error(`header layout mismatch: dataStart ${dataStart} vs ${jsonStart + jsonLength}`)
}

function entryAt(path) {
  let node = header
  for (const part of path.split('/')) {
    node = node.files?.[part]
    if (node === undefined) return undefined
  }
  return node
}

function read(path) {
  const node = entryAt(path)
  if (node === undefined || node.files !== undefined) return undefined
  const offset = dataStart + Number(node.offset)
  return buf.subarray(offset, offset + Number(node.size))
}

const rootPkg = JSON.parse(read('package.json').toString('utf8'))
const dshPkgNode = entryAt('dsh/package.json')
const dshPkg = dshPkgNode === undefined ? undefined : JSON.parse(read('dsh/package.json').toString('utf8'))

const out = {
  asar: { path: ASAR, bytes: buf.length, mtimeNote: 'see Get-Item' },
  headerBytes: jsonLength,
  dataStart,
  rootPackage: { name: rootPkg.name, version: rootPkg.version },
  dshPackage: dshPkg === undefined ? null : { name: dshPkg.name, version: dshPkg.version },
  probe: [],
}

// Compare the asar's own copy of a host file with the extracted tree, byte for byte.
const EXTRACTED = 'tmp/dsh-host-src/dsh/node_modules/@deepseek-ai'
for (const rel of [
  'dsh-client-ui-conversation/lib/client.js',
  'dsh-client-ui-slots/lib/types/index.d.ts',
  'dsh-api-session-controller/lib/index.js',
  'dsh-client-ui-approval/lib/client.js',
]) {
  const fromAsar = read(`dsh/node_modules/@deepseek-ai/${rel}`)
  let fromTree
  try { fromTree = readFileSync(`${EXTRACTED}/${rel}`) } catch { fromTree = undefined }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex')
  out.probe.push({
    file: rel,
    inAsar: fromAsar !== undefined,
    inExtractedTree: fromTree !== undefined,
    identical: fromAsar !== undefined && fromTree !== undefined && hash(fromAsar) === hash(fromTree),
    asarSha256: fromAsar === undefined ? null : hash(fromAsar),
    treeSha256: fromTree === undefined ? null : hash(fromTree),
  })
}

console.log(JSON.stringify(out, null, 1))