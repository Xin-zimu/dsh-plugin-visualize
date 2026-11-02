/**
 * Backend A, adapter: the sandboxed-HTML renderer behind the neutral contract.
 *
 * The document rules, the linter, the frame and the card store are unchanged
 * from dsh-visualize; this module only translates between what the host core
 * speaks and what those modules already speak. Keeping the translation here is
 * what lets the HTML backend keep working while a second one exists beside it.
 *
 * @module @dsh-unified/visualize/backends/html/renderer
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
import { lintFragment, type LintFinding } from '../../lint.ts'
import { DEFAULT_STYLE, type StyleId } from '../../style.ts'

/**
 * Translate one lint finding into the neutral diagnostic shape.
 * @param finding - the linter's finding.
 * @returns the diagnostic.
 */
function toDiagnostic(finding: LintFinding): Diagnostic {
  return {
    severity: finding.severity,
    code: finding.code,
    message: `line ${finding.line}:${finding.column} ${finding.message}`,
    fix: finding.fix,
  }
}

/**
 * Build the HTML backend.
 * @param style - the configured card style, recorded on each new card: an id,
 *   or a reader asked per call so a changed setting applies to the next card.
 * @returns the adapter.
 */
export function htmlBackend(style: StyleId | (() => StyleId) = DEFAULT_STYLE): RendererAdapter {
  const currentStyle = typeof style === 'function' ? style : () => style
  return {
    id: 'html',
    label: 'sandboxed HTML fragment',

    validate(request: RenderRequest, limits: RenderLimits): ValidationResult {
      const report = lintFragment(request.source, limits.maxSourceBytes)
      return {
        errors: report.findings.filter(finding => finding.severity === 'error').map(toDiagnostic),
        warnings: report.findings.filter(finding => finding.severity === 'warn').map(toDiagnostic),
        sizeBytes: report.sizeBytes,
      }
    },

    describe(request: RenderRequest): RenderDescriptor {
      return {
        schemaVersion: RENDER_SCHEMA_VERSION,
        backend: 'html',
        title: request.title,
        mode: request.mode,
        ...request.summary === undefined ? {} : { summary: request.summary },
        // The pre-fork meta shape, so a card drawn by this backend replays
        // through the same reader as the cards already in the session log.
        payload: {
          kind: 'visualize',
          fragment: request.source,
          title: request.title,
          mode: request.mode,
          style: currentStyle(),
          ...request.summary === undefined ? {} : { summary: request.summary },
        },
      }
    },
  }
}