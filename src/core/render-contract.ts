/**
 * The neutral vocabulary a render backend speaks to the host.
 *
 * Nothing in this module parses HTML or openui-lang: it names what a backend
 * is, what a request looks like, and what every backend must hand back. The
 * host core routes on {@link BackendId} and never branches on a backend's own
 * representation, so a third backend is an addition here rather than a change
 * to the router.
 *
 * @module @dsh-unified/visualize/core/render-contract
 */

/** Wire name every backend's cards are rendered under. */
export const RENDER_TOOL_NAME = 'visualize'

/**
 * Surface a card occupies.
 *
 * - `inline` fills the chat column.
 * - `wide` is the expanded width, for panels compared side by side.
 * - `page` renders a launcher in the chat and the surface itself in its own tab.
 */
export type RenderMode = 'inline' | 'wide' | 'page'

/** Every {@link RenderMode}, in the order the tool schema lists them. */
export const RENDER_MODES: readonly RenderMode[] = ['inline', 'wide', 'page']

/**
 * Narrow one wire value to a {@link RenderMode}.
 * @param value - the raw value.
 * @returns whether it names a known mode.
 */
export function isRenderMode(value: unknown): value is RenderMode {
  return value === 'inline' || value === 'wide' || value === 'page'
}

/** Which renderer draws one card. */
export type BackendId = 'html' | 'openui'

/** Every {@link BackendId}, in the order the tool schema lists them. */
export const BACKEND_IDS: readonly BackendId[] = ['html', 'openui']

/**
 * Narrow one wire value to a {@link BackendId}.
 * @param value - the raw value.
 * @returns whether it names a known backend.
 */
export function isBackendId(value: unknown): value is BackendId {
  return value === 'html' || value === 'openui'
}

/**
 * How much a finding blocks.
 *
 * `error` rejects the call: nothing renders and nothing is written. `warn`
 * renders and reports. A backend decides which of its findings is which.
 */
export type DiagnosticSeverity = 'error' | 'warn'

/** One finding a backend reports about a request. */
export interface Diagnostic {
  readonly severity: DiagnosticSeverity
  /** Stable, backend-prefixed code the model can act on. */
  readonly code: string
  /** What is wrong, in one line. */
  readonly message: string
  /** A concrete fix. */
  readonly fix?: string
  /**
   * 1-based line in the backend's own source, when the finding has one.
   *
   * Kept as a field rather than baked into {@link message}: the host decides how
   * to present a location, and a message that embeds "line 3: " can never be
   * compared against a backend that does not. Optional because a request-level
   * finding (a size limit, an empty source) belongs to no line.
   */
  readonly line?: number
}

/** What a backend is given to render. */
export interface RenderRequest {
  readonly backend: BackendId
  /** Card title; already trimmed and defaulted by the host. */
  readonly title: string
  /** Surface to render into. */
  readonly mode: RenderMode
  /**
   * The backend's own document: an inline HTML fragment for `html`, an
   * openui-lang program for `openui`. Kept as one string so the streaming
   * preview and the session log carry it the same way for every backend.
   */
  readonly source: string
  /** Launcher caption, for `page` mode. */
  readonly summary?: string
}

/** What a passed validation tells the host. */
export interface ValidationResult {
  /** Blocking findings; the call is rejected when this is non-empty. */
  readonly errors: readonly Diagnostic[]
  /** Non-blocking findings, reported with the rendered card. */
  readonly warnings: readonly Diagnostic[]
  /** Size of {@link RenderRequest.source} in bytes, measured the backend's way. */
  readonly sizeBytes: number
}

/**
 * One render backend.
 *
 * A backend owns exactly two things: deciding whether a request is renderable,
 * and producing the persisted descriptor a card is replayed from. Everything
 * else — the tool, the store, the security envelope, the theme, the session
 * log — belongs to the host and is shared.
 */
export interface RendererAdapter {
  /** Which backend this is; also the tool's `backend` value. */
  readonly id: BackendId
  /** One line naming the surface, for the tool description. */
  readonly label: string
  /**
   * Check a request without side effects.
   * @param request - what the model asked to render.
   * @param limits - deployment ceilings the host enforces.
   * @returns blocking and advisory findings, plus the measured size.
   */
  validate(request: RenderRequest, limits: RenderLimits): ValidationResult
  /**
   * Build the descriptor persisted into the tool result and replayed from the
   * session log. Called only after {@link validate} returned no errors.
   * @param request - the validated request.
   * @returns the descriptor.
   */
  describe(request: RenderRequest): RenderDescriptor
}

/** Deployment ceilings every backend is checked against. */
export interface RenderLimits {
  /** Largest {@link RenderRequest.source}, in bytes. */
  readonly maxSourceBytes: number
}

/**
 * What the host persists for one card and replays it from.
 *
 * A versioned envelope, not the backend's document: the envelope says which
 * backend drew the card and how, and the backend's own descriptor rides in
 * {@link RenderDescriptor.payload} untouched. Adding a backend never changes
 * this shape twice, and an older card still replays.
 */
export interface RenderDescriptor {
  readonly schemaVersion: typeof RENDER_SCHEMA_VERSION
  readonly backend: BackendId
  readonly title: string
  readonly mode: RenderMode
  readonly summary?: string
  /** The backend's own persisted fields. Opaque to the host core. */
  readonly payload: Readonly<Record<string, unknown>>
}

/** Version of the {@link RenderDescriptor} envelope. */
export const RENDER_SCHEMA_VERSION = 1

/**
 * Read a persisted descriptor, accepting the pre-fork shapes.
 *
 * Cards drawn before the fork have no envelope: a dsh-visualize card is a
 * bare visualize meta, and a dsh-intelligent-ui card carries `intelligent_ui`
 * args. Both still replay, attributed to the backend that drew them.
 * @param value - the persisted meta, as read from the session log.
 * @returns the descriptor, or undefined when the value is not a card.
 */
export function descriptorFrom(value: unknown): RenderDescriptor | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (record.schemaVersion === RENDER_SCHEMA_VERSION && isBackendId(record.backend)) {
    const payload = typeof record.payload === 'object' && record.payload !== null
      ? record.payload as Record<string, unknown>
      : {}
    const mode = isRenderMode(record.mode) ? record.mode : 'inline'
    return {
      schemaVersion: RENDER_SCHEMA_VERSION,
      backend: record.backend,
      title: typeof record.title === 'string' ? record.title : '',
      mode,
      ...typeof record.summary === 'string' ? { summary: record.summary } : {},
      payload,
    }
  }
  // Legacy: a bare dsh-visualize meta names its own kind.
  if (record.kind === 'visualize' && typeof record.fragment === 'string') {
    const mode = isRenderMode(record.mode) ? record.mode : 'inline'
    return {
      schemaVersion: RENDER_SCHEMA_VERSION,
      backend: 'html',
      title: typeof record.title === 'string' ? record.title : 'Visualization',
      mode,
      ...typeof record.summary === 'string' ? { summary: record.summary } : {},
      payload: record,
    }
  }
  return undefined
}
