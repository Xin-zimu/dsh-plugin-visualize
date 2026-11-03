// Prove the P3-06 tests are not vacuous: the new reader accepts a program
// descriptor that the old reader rejected.
import { openuiMetaFrom, visualizationFrom, visualizeMetaFrom } from '../../src/fragment.ts'

const program = {
  kind: 'intelligent_ui',
  program: '$count = 3\nroot = Text("x")',
  title: 'P',
  mode: 'inline',
  path: 'viz/p.openui.html',
  style: 'whale',
}

console.log('visualizeMetaFrom (the old reader):', visualizeMetaFrom(program) === undefined ? 'undefined — card dropped' : 'accepted')
console.log('visualizationFrom  (the new reader):', visualizationFrom(program) === undefined ? 'undefined' : `accepted, kind=${visualizationFrom(program).kind}`)
console.log('openuiMetaFrom still narrows it:', openuiMetaFrom(program)?.kind)
