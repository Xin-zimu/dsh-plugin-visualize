/**
 * The one tool the model calls, and the routing it does.
 *
 * Before the fork there were two tools with two names, two schemas and two
 * result shapes. Here there is one: `visualize`, with a `backend` argument that
 * says which renderer draws the card. The dispatcher resolves the backend,
 * asks it to validate, and only then persists a descriptor — so an HTML
 * fragment and an openui-lang program travel the same path and land in the
 * same card store.
 *
 * The model never sees two tools, and a third backend is a registration, not a
 * second tool.
 *
 * @module @dsh-unified/visualize/core/dispatcher
 */

import {
  BACKEND_IDS,
  isBackendId,
  RENDER_MODES,
  type BackendId,
  type Diagnostic,
  type RenderDescriptor,
  type RendererAdapter,
  type RenderLimits,
  type RenderMode,
} from './render-contract.ts'
import { resolveBackend, type BackendRegistry } from './registry.ts'

/** What one call asked for, after the arguments were read. */
export interface DispatchedRequest {
  readonly adapter: RendererAdapter
  readonly title: string
  readonly mode: RenderMode
  readonly source: string
  readonly summary?: string
  readonly sizeBytes: number
  readonly warnings: readonly Diagnostic[]
  readonly descriptor: RenderDescriptor
}

/** Why a call was refused. */
export class RenderRejected extends Error {
  readonly diagnostics: readonly Diagnostic[]

  /**
   * @param diagnostics - the blocking findings.
   */
  constructor(diagnostics: readonly Diagnostic[]) {
    super(diagnostics.map(finding => `${finding.code}: ${finding.message}`).join('; ') || 'rejected')
    this.name = 'RenderRejected'
    this.diagnostics = diagnostics
  }
}

/** Raw tool arguments, as the model wrote them. */
export interface VisualizeArguments {
  readonly backend?: string
  readonly title?: string
  readonly mode?: string
  readonly source?: string
  readonly summary?: string
}

/** Longest launcher summary kept; the launcher shows one line. */
const MAX_SUMMARY_CHARS = 200

/**
 * Take one argument the call cannot run without.
 * @param value - the raw argument.
 * @param name - the parameter name, as the model wrote it.
 * @returns the raw value, whitespace preserved.
 * @throws Error naming the missing parameter.
 */
function required(value: string | undefined, name: string): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`invalid visualization: \`${name}\` is required`)
  }
  return value
}

/**
 * Resolve the surface. The tested hosts check the schema enum before execute;
 * this keeps an unknown value failing loud on any that do not.
 * @param value - the raw `mode` argument.
 * @returns the mode to render.
 * @throws Error naming the accepted modes.
 */
function modeOf(value: string | undefined): RenderMode {
  if (value === undefined) return 'inline'
  if (value !== 'inline' && value !== 'wide' && value !== 'page') {
    throw new Error(`invalid visualization: \`mode\` must be one of ${RENDER_MODES.map(mode => `"${mode}"`).join(', ')}`)
  }
  return value
}

/**
 * Route one call to its backend and describe the card it would produce.
 * @param registry - the populated backend registry.
 * @param args - the raw tool arguments.
 * @param limits - deployment ceilings.
 * @returns the request, its measured size, and its descriptor.
 * @throws RenderRejected when the backend reports a blocking finding.
 * @throws Error when an argument is missing or names nothing this build has.
 */
export function dispatch(
  registry: BackendRegistry,
  args: VisualizeArguments,
  limits: RenderLimits,
): DispatchedRequest {
  const adapter = resolveBackend(registry, args.backend)
  const source = required(args.source, 'source')
  const title = args.title?.trim() || 'Visualization'
  const mode = modeOf(args.mode)
  const summary = args.summary?.replaceAll(/\s+/gu, ' ').trim().slice(0, MAX_SUMMARY_CHARS)

  const request = {
    backend: adapter.id,
    title,
    mode,
    source,
    ...summary === undefined || summary === '' ? {} : { summary },
  }

  const validation = adapter.validate(request, limits)
  if (validation.errors.length > 0) throw new RenderRejected(validation.errors)

  return {
    adapter,
    title,
    mode,
    source,
    ...summary === undefined || summary === '' ? {} : { summary },
    sizeBytes: validation.sizeBytes,
    warnings: validation.warnings,
    descriptor: adapter.describe(request),
  }
}

/**
 * Render the model-facing confirmation for one dispatched call.
 * @param dispatched - the routed request.
 * @param action - whether this created or patched a card.
 * @param path - where the card was stored.
 * @returns the one-line confirmation.
 */
export function resultText(dispatched: DispatchedRequest, action: 'create' | 'update', path: string): string {
  const { title, mode, sizeBytes, adapter } = dispatched
  if (mode === 'page') {
    return action === 'update'
      ? `Patched page "${title}" in place (${sizeBytes} bytes via the ${adapter.label} backend; updated card at ${path}). The launcher in the conversation now opens the corrected page; a tab the user already opened keeps the old version until they open it again.`
      : `Rendered "${title}" as a page (${sizeBytes} bytes via the ${adapter.label} backend; saved copy at ${path}). The conversation shows a launcher card; the user opens the full page from its button.`
  }
  return action === 'update'
    ? `Patched "${title}" in place (${sizeBytes} bytes via the ${adapter.label} backend; updated card at ${path}). The user sees the corrected visualization; patch that path for any further correction.`
    : `Rendered "${title}" inline (${sizeBytes} bytes via the ${adapter.label} backend; saved copy at ${path}). The user sees the interactive visualization in the conversation.`
}

/**
 * Build the `backend` parameter description from what is registered, so the
 * schema never offers a backend this build lacks.
 * @param registry - the populated backend registry.
 * @returns the parameter description.
 */
export function backendParameter(registry: BackendRegistry): string {
  const available = registry.all().map(adapter => `\`${adapter.id}\` (${adapter.label})`).join(', ')
  return `Which renderer draws the card: ${available}. Omit to use the default.`
}

/** Every backend id the schema may accept. */
export { BACKEND_IDS, isBackendId }
