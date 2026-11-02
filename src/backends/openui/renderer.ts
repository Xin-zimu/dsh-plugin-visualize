/**
 * Backend B, adapter: the openui-lang renderer behind the neutral contract.
 *
 * Milestone 1 ships the language core only far enough to prove the seat: a
 * program is tokenised, parsed into statements, checked against the component
 * and function names this build knows, and rejected with located diagnostics
 * when it cannot render. Rendering itself belongs to the client half.
 *
 * The component and function tables here are the single authority for what the
 * prompt teaches, so the prompt can never name a component the evaluator does
 * not have.
 *
 * @module @dsh-unified/visualize/backends/openui/renderer
 */

import {
  RENDER_SCHEMA_VERSION,
  type Diagnostic,
  type RenderDescriptor,
  type RendererAdapter,
  type RenderLimits,
  type RenderRequest,
  type ValidationResult,
} from '../../core/render-contract.ts'
import { ACTION_STEPS, COMPONENTS, FUNCTIONS } from './signatures.ts'
import { parseProgram } from './parse.ts'

/** Component names this backend can draw. */
const COMPONENT_NAMES = new Set(COMPONENTS.map(component => component.name))

/** `@function` names this backend can evaluate, without the sigil. */
const FUNCTION_NAMES = new Set(FUNCTIONS.map(fn => fn.name))

/** Action-step names a program may use as a Button's `action`. */
const ACTION_NAMES = new Set(ACTION_STEPS)

/**
 * Measure a program the way the prompt states the ceiling.
 * @param source - the program.
 * @returns its UTF-16 length, which is what the openui-lang ceiling counts.
 */
function sourceLength(source: string): number {
  return source.length
}

/**
 * Check every called name against the tables this build ships.
 * @param program - the parsed program.
 * @returns one error per unknown name, located at its statement.
 */
function checkNames(program: ReturnType<typeof parseProgram>): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  for (const call of program.calls) {
    const where = `line ${call.line}: `
    if (call.name.startsWith('@')) {
      const bare = call.name.slice(1)
      if (FUNCTION_NAMES.has(bare) || ACTION_NAMES.has(bare)) continue
      diagnostics.push({
        severity: 'error',
        code: 'VZO001',
        message: `${where}unknown function "@${bare}"`,
        fix: 'use only the @-functions listed in the visualize skill',
      })
      continue
    }
    if (COMPONENT_NAMES.has(call.name)) continue
    diagnostics.push({
      severity: 'error',
      code: 'VZO002',
      message: `${where}unknown component "${call.name}"`,
      fix: 'use only the components listed in the visualize skill',
    })
  }
  return diagnostics
}

/**
 * Build the openui-lang backend.
 * @returns the adapter.
 */
export function openuiBackend(): RendererAdapter {
  return {
    id: 'openui',
    label: 'openui-lang program',

    validate(request: RenderRequest, limits: RenderLimits): ValidationResult {
      const sizeBytes = sourceLength(request.source)
      if (sizeBytes > limits.maxSourceBytes) {
        return {
          errors: [{
            severity: 'error',
            code: 'VZO003',
            message: `the program is ${sizeBytes} characters, over the ${limits.maxSourceBytes} limit`,
            fix: 'split the answer into fewer components, or fewer statements',
          }],
          warnings: [],
          sizeBytes,
        }
      }
      if (request.source.trim() === '') {
        return {
          errors: [{
            severity: 'error',
            code: 'VZO004',
            message: 'the program is empty',
            fix: 'pass the openui-lang program itself in `source`',
          }],
          warnings: [],
          sizeBytes,
        }
      }

      const program = parseProgram(request.source)
      const errors: Diagnostic[] = program.diagnostics.map(finding => ({
        severity: finding.severity,
        code: finding.code,
        ...finding.fix === undefined ? {} : { fix: finding.fix },
        message: finding.message,
      }))
      if (program.rootName === undefined) {
        errors.push({
          severity: 'error',
          code: 'VZO005',
          message: 'the program never defines \`root\`',
          fix: 'start with `root = Col([...])`',
        })
      }
      errors.push(...checkNames(program))
      return { errors, warnings: [], sizeBytes }
    },

    describe(request: RenderRequest): RenderDescriptor {
      return {
        schemaVersion: RENDER_SCHEMA_VERSION,
        backend: 'openui',
        title: request.title,
        mode: request.mode,
        ...request.summary === undefined ? {} : { summary: request.summary },
        // The pre-fork shape: a dsh-intelligent-ui card is a program in the
        // call's own arguments, so this replays through the same reader.
        payload: {
          kind: 'intelligent_ui',
          program: request.source,
          title: request.title,
        },
      }
    },
  }
}