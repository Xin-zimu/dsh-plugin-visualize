/**
 * The skill text must not teach an action this build refuses.
 *
 * `ACTION_STEPS` declares `OpenUrl`, `CopyToClipboard` and `ToAssistant` so a
 * program naming them validates, but `UNSUPPORTED_STEPS` refuses all three at
 * dispatch. The reference text used to list them as ordinary actions, so a model
 * that read the skill and obeyed it produced a Button that did nothing when
 * pressed — no error, no refusal, just an inert control.
 *
 * That is the same class of defect as the `Action([...])` rejection found in
 * 4A-5, from the other direction: the documentation and the dispatcher disagreed,
 * and the disagreement was invisible until someone pressed the button. This test
 * pins the two together.
 */
import { describe, expect, it } from 'vitest'
import { ACTION_STEPS, languageReference } from '../src/backends/openui/signatures.ts'
import { SUPPORTED_STEPS, UNSUPPORTED_STEPS } from '../src/client/openui-actions.ts'

const REFERENCE = languageReference()

describe('the skill text and the dispatcher agree about actions', () => {
  it('declares the three refused actions, so they still validate', () => {
    for (const name of UNSUPPORTED_STEPS) {
      expect(ACTION_STEPS, name + ' must stay declared, or a program naming it fails VZO002 instead of being refused at dispatch').toContain(name)
    }
  })

  it('warns against each refused action by name', () => {
    for (const name of UNSUPPORTED_STEPS) {
      expect(REFERENCE, 'the reference must name @' + name + ' where it says not to use it').toContain('@' + name)
    }
    expect(REFERENCE).toMatch(/Do not use/i)
  })

  it('still teaches the two actions that work', () => {
    for (const name of SUPPORTED_STEPS) {
      if (name === 'Action') continue
      expect(REFERENCE, '@' + name + ' works and must stay taught').toContain('@' + name)
    }
    expect(REFERENCE).toContain('Action([')
  })

  it('points at Link as the way to open a URL', () => {
    // The refusal is only useful if it says what to do instead.
    expect(REFERENCE).toMatch(/Link\(/)
  })
})