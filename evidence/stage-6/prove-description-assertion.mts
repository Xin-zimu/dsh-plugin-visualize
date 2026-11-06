import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { visualizeTool } from '../../src/tool.ts'

const desc = visualizeTool({} as never, 1000).description
const NEW = /read the same contract from (.+?\.md) \(its relative paths resolve against (.+?)\) with a file or shell tool/u
const OLD = /read the same contract from (\S+\.md)/

/** The assertions the spec now makes, as a function so a mutation can be fed in. */
function check(text) {
  const named = NEW.exec(text)
  if (named === null) throw new Error('RED: the description does not name the contract file')
  const [, contractPath, resourceDir] = named
  if (!isAbsolute(contractPath)) throw new Error('RED: not absolute: ' + contractPath)
  if (!existsSync(contractPath)) throw new Error('RED: does not exist: ' + contractPath)
  if (!statSync(contractPath).isFile()) throw new Error('RED: not a file')
  if (!contractPath.endsWith('.md')) throw new Error('RED: not .md')
  if (!isAbsolute(resourceDir) || !statSync(resourceDir).isDirectory()) throw new Error('RED: resource dir is not a directory')
  if (!text.includes('do not search for it anywhere else')) throw new Error('RED: missing the do-not-search clause')
  return contractPath
}

const results = []
function attempt(label, text) {
  try { results.push([label, 'GREEN', check(text)]) }
  catch (error) { results.push([label, 'RED', error.message]) }
}

attempt('real description', desc)
// Defect A: a build that stops naming the file at all (the behaviour the spec exists to forbid).
attempt('defect A: no contract sentence', desc.replace(/If this session has no skill tool[\s\S]*$/, 'Load the visualize skill.'))
// Defect B: names a file that is not shipped (path typo).
attempt('defect B: path that does not exist', desc.replace('assets\\visualize-skill.md', 'assets\\visualiz-skill.md'))
// Defect C: drops the resource-directory clause an agent needs to resolve relative references.
attempt('defect C: no resource dir clause', desc.replace(/ \(its relative paths resolve against .+?\)/u, ''))

console.log('OLD REGEX on the real description ->', String(OLD.exec(desc)?.[1]))
console.log('OLD REGEX with the space removed ->', String(OLD.exec(desc.replaceAll('Deepseek WorkSpace', 'work'))?.[1]))
console.log('')
for (const [label, verdict, detail] of results) console.log(String(verdict).padEnd(5), '|', label, '|', String(detail).slice(0, 120))
const ok = results[0][1] === 'GREEN' && results.slice(1).every(r => r[1] === 'RED')
console.log('')
console.log(ok ? 'PROOF OK: the assertion is green on the real description and red on every reintroduced defect.' : 'PROOF FAILED')
process.exit(ok ? 0 : 1)
