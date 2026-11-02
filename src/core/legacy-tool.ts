/**
 * The unified `visualize` tool.
 *
 * Before the fork the plugin shipped one tool for one renderer. It now routes:
 * a `backend` argument selects a {@link RendererAdapter}, the chosen backend
 * validates the surface, and the descriptor it describes is projected into the
 * same persisted `tool/result` meta the client half already reads. The wire
 * name, the result shape, the card store and the meta fields stay what they
 * were, so every card already in a session log still replays and a call that
 * names no backend keeps reaching the HTML renderer.
 *
 * A core adapter, not a backend: nothing here knows how either renderer draws.
 *
 * @module @dsh-unified/visualize/core/legacy-tool
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools'
// Type-only: pulls the `ctx.fs` Context merge.
import type {} from '@deepseek-ai/dsh-fs'
import { cardStore, type CardFile, type StoredImage } from '../storage.ts'
import {
  cardImageOf,
  DEFAULT_IMAGE_LIMITS,
  imageReport,
  resolveCardImages,
  urlFetcher,
  workspaceImageReader,
  type ImageLimits,
  type UrlFetcher,
} from '../images.ts'
import { SKILL_BODY_PATH, SKILL_RESOURCE_DIR } from '../skill.ts'
import { FragmentLintGate } from '../lint-gate.ts'
import { DEFAULT_STYLE, STYLE_IDS, type StyleId } from '../style.ts'
import { styleToolNote } from '../style-guide.ts'
import {
  dispatch, RenderRejected, type VisualizeArguments,
} from './dispatcher.ts'
import { resolveBackend, type BackendRegistry } from './registry.ts'
import { descriptorFrom, RENDER_SCHEMA_VERSION } from './render-contract.ts'
import {
  applyFragmentPatch,
  isVisualizeMode,
  visualizeMetaFrom,
  VISUALIZE_MODES,
  VISUALIZE_TOOL_NAME,
  type VisualizeAction,
  type VisualizeMode,
} from '../fragment.ts'

export { VISUALIZE_TOOL_NAME } from '../fragment.ts'

const DESCRIPTION =
  'Show the user an interactive HTML visualization, rendered as a live card in '
  + 'the conversation. `create` (the default) takes the whole markup in '
  + '`fragment`: literal inline HTML only (no <!doctype>, <html>, <head>, or '
  + '<body> — the card supplies the document, stylesheet, and theme). To '
  + 'correct a card you already rendered, call `update` with its `path` and one '
  + 'exact `old_str`/`new_str` replacement instead of re-sending the whole '
  + 'fragment. `mode: "page"` builds a full standalone page instead of a chat '
  + 'card: the conversation shows a launcher with a live thumbnail, and the user '
  + 'opens the page in its own browser tab. The card appears while you generate; a copy of the finished '
  + 'fragment is saved outside the project, per session. Load the `visualize` skill '
  + 'for the authoring contract before your first call. '
  // Agents without a skill tool (the minimal preset exposes only a shell)
  // still see this tool; left with an unloadable skill name they go looking
  // through the user's home for anything called "visualize". Naming the file
  // gives them the same contract and ends the search.
  + `If this session has no skill tool, read the same contract from ${SKILL_BODY_PATH} `
  + `(its relative paths resolve against ${SKILL_RESOURCE_DIR}) with a file or shell tool; `
  + 'do not search for it anywhere else.'

/** How the tool embeds `data-viz-src` images (images.ts). */
export interface ToolImageOptions {
  /**
   * Whether the browser can fetch stored images right now: the plugin's
   * image route is registered on the host's `/api` channel. Without it every
   * image is reported as undeliverable instead of being stored for nothing.
   */
  readonly delivery: () => boolean
  /** URL fetcher; defaults to the SSRF-guarded node fetcher. */
  readonly fetchUrl?: UrlFetcher
  readonly limits?: ImageLimits
}

/** Why images cannot reach the card on a host without the image route. */
const NO_IMAGE_ROUTE = 'this dsh host cannot deliver images to cards (the image route needs dsh 0.1.7 or later)'

/**
 * Build the `visualize` tool definition over the composed filesystem seam.
 * @param ctx - registrant context carrying `ctx.fs` and the host home path for the card copy.
 * @param maxFragmentBytes - deployment size ceiling for one fragment.
 * @param style - configured card style, recorded in each new card's meta: an
 *   id, or a reader the tool asks on every call so a changed setting applies
 *   to the next card. The description names the style read when the
 *   definition is built; the plugin rebuilds it when the setting changes.
 * @param images - image embedding; by default no route, so every image is reported undeliverable.
 * @returns the tool definition to register on `ctx.tools`.
 */
export function visualizeTool(
  ctx: Context,
  maxFragmentBytes: number,
  registry: BackendRegistry,
  style: StyleId | (() => StyleId) = DEFAULT_STYLE,
  images: ToolImageOptions = { delivery: () => false },
): ToolDefinition {
  const lint = new FragmentLintGate()
  const currentStyle = typeof style === 'function' ? style : () => style
  const imageLimits = images.limits ?? DEFAULT_IMAGE_LIMITS
  const fetchUrl = images.fetchUrl ?? urlFetcher({ maxRedirects: imageLimits.maxRedirects })
  return defineTool({
    name: VISUALIZE_TOOL_NAME,
    description: DESCRIPTION + styleToolNote(currentStyle()),
    parameters: {
      action: {
        type: 'string',
        enum: ['create', 'update'],
        description:
          '`create` (default) renders a new card from `fragment`. `update` patches the card at `path`, '
          + 'replacing `old_str` with `new_str` — use it for a correction touching fewer than 20 lines in '
          + 'fewer than 5 places, and at most 4 times per reply; re-create the card for anything larger.',
      },
      backend: {
        type: 'string',
        enum: registry.ids(),
        description:
          'Which renderer draws the card. `html` takes an inline HTML fragment in `source`; '
          + '`openui` takes an openui-lang program in `source`. Omit to use `'
          + (registry.defaultBackend()?.id ?? 'html') + '`.',
      },
      source: {
        type: 'string',
        description:
          'create only, required: the surface to render. For backend `html`, the inline HTML fragment '
          + '(markup, style and script — no document skeleton). For backend `openui`, the openui-lang program. '
          + 'For a workspace image or a web image off the CDN allowlist, write '
          + '<img data-viz-src="figs/plot.png"> or <img data-viz-src="https://…"> and the tool embeds it.',
      },
      fragment: {
        type: 'string',
        description: 'Deprecated alias of `source`, kept so calls written before the fork still run.',
      },
      title: {
        type: 'string',
        description: 'Concise card title. Defaults to "Visualization" on create; required on update.',
      },
      mode: {
        type: 'string',
        enum: [...VISUALIZE_MODES],
        description:
          'Surface: `inline` (default) fits the chat column; `wide` for compact panels that must sit side by side; '
          + '`page` for a full standalone page (≥1280px wide, any height) the user opens in its own tab from a '
          + 'launcher card. On update, restate the mode the card was created with.',
      },
      summary: {
        type: 'string',
        description:
          'page mode: one short line under the launcher title saying what the page lets the user do. '
          + 'Restate it on update.',
      },
      path: {
        type: 'string',
        description: 'update only, required: path of the card to patch, exactly as its own call reported it.',
      },
      old_str: {
        type: 'string',
        description:
          'update only, required: the exact card text to replace, whitespace included. It must appear '
          + 'exactly once — keep it as short as stays unique.',
      },
      new_str: {
        type: 'string',
        description: 'update only, required: the replacement text. Empty deletes the matched region.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true, enum: ['create', 'update'] },
          backend: { type: 'string', required: true, enum: registry.ids() },
          path: { type: 'string', required: true },
          title: { type: 'string', required: true },
          mode: { type: 'string', required: true, enum: [...VISUALIZE_MODES] },
          summary: { type: 'string' },
          sizeBytes: { type: 'integer', required: true },
          source: { type: 'string', required: true },
          fragment: { type: 'string', required: true },
          warnings: { type: 'string' },
          style: { type: 'string' },
          images: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                src: { type: 'string', required: true },
                id: { type: 'string', required: true },
                type: { type: 'string', required: true },
                bytes: { type: 'integer', required: true },
              },
            },
          },
          imageReport: { type: 'string' },
        },
      },
      // Model-facing text stays a confirmation: the fragment is already in the
      // model's own output (the argument, whole or patched) and re-echoing it
      // would double its context cost. The patched path is named so a further
      // correction patches the new card rather than the superseded one.
      // Image bytes never enter the result: the report names what was
      // embedded and, per failed image, why.
      render: (_args, value) => [{
        type: 'text',
        text: resultText(value),
      }, ...value.warnings ? [{ type: 'text' as const, text: value.warnings }] : [],
      ...value.imageReport ? [{ type: 'text' as const, text: value.imageReport }] : []],
      // Project the fragment into persisted meta so the card survives replay:
      // the canonical value is not on the wire, only content + meta are.
      presentationMeta: (_args, value) => ({
        // The versioned envelope says which backend drew the card.
        schemaVersion: RENDER_SCHEMA_VERSION,
        backend: value.backend,
        title: value.title,
        mode: value.mode,
        ...value.summary === undefined ? {} : { summary: value.summary },
        // The flat pre-fork fields stay beside it: the reader that draws the
        // cards already in a session log reads these, and so does this one.
        kind: value.backend === 'html' ? 'visualize' : 'intelligent_ui',
        ...value.backend === 'html'
          ? { fragment: value.source }
          : { program: value.source },
        path: value.path,
        style: value.style ?? DEFAULT_STYLE,
        source: value.source,
        // References only; the card fetches the bytes from the image route.
        ...value.images?.length ? { images: value.images } : {},
      }),
    },
    // A create writes only a content-addressed card file; concurrent
    // siblings target distinct names or identical bytes, so they cannot
    // conflict. An update reads a card before rewriting it, so parallel
    // updates would each patch a base the other has already superseded.
    isConcurrencySafe: args => (args.action ?? 'create') === 'create',
    async execute(args, exec) {
      const action = (args.action ?? 'create') as VisualizeAction
      // A page card's file name says so, so a patch that forgets to restate
      // the mode still re-renders a launcher rather than a 1280px page
      // squeezed into the chat column.
      const mode = modeOf(args.mode, args.path !== undefined && action === 'update' && args.path.endsWith(PAGE_SUFFIX))
      // Cards live in a per-session store under the harness home, outside the
      // user's project (see storage.ts); legacy `viz/` workspace copies from
      // earlier sessions stay patchable through the sandboxed fs seam.
      const store = cardStore(ctx, exec)
      // An update patches the stored copy, the one card state both halves
      // agree on: persisted meta is not readable from here, and the model's
      // own transcript may hold a fragment an earlier patch already replaced.
      // It rewrites that same file rather than deriving a new name, so a
      // second patch in the same reply builds on the first — a fresh path per
      // patch would leave later patches addressing a base already superseded,
      // and each would silently drop every edit but its own.
      let source: CardFile | undefined
      let fragment: string
      let base: string | undefined
      if (action === 'update') {
        source = await store.open(required(args.path, 'path', action))
        base = await source.read()
        fragment = applyFragmentPatch(
          base,
          required(args.old_str, 'old_str', action),
          present(args.new_str, 'new_str', action),
        )
      } else {
        // `source` is the forked name; `fragment` still works so a call
        // written before the fork, and still streaming, lands the same card.
        // Name the argument the caller used, so a pre-fork call sees the
        // message it has always seen.
        fragment = args.source !== undefined
          ? required(args.source, 'source', action)
          : required(args.fragment, 'fragment', action)
      }
      // A patched card keeps its identity only if the caller restates it, so
      // the title is required on update rather than silently re-defaulted.
      const requested = resolveBackend(registry, args.backend)
      const title = action === 'update' ? required(args.title, 'title', action).trim() : args.title?.trim() || 'Visualization'
      const summary = args.summary?.replaceAll(/\s+/gu, ' ').trim().slice(0, MAX_SUMMARY_CHARS)
      // The fragment linter speaks to HTML sources only, and it runs before the
      // backend does: it owns the retry-loop guard and the more specific
      // rejection text — the location, the excerpt, the fix, and whether the
      // patch introduced the finding or inherited it. An openui program is
      // validated by its own backend instead; running the fragment rules over
      // it would report findings about markup it never contained.
      const gate = requested.id === 'html'
        ? lint.check({ fragment, maxBytes: maxFragmentBytes, sessionId: exec.agent?.session.header?.id, base })
        : undefined
      let routed
      try {
        routed = dispatch(registry, {
          backend: requested.id,
          title,
          mode,
          source: fragment,
          ...summary === undefined || summary === '' ? {} : { summary },
        }, { maxSourceBytes: maxFragmentBytes })
      } catch (error) {
        if (error instanceof RenderRejected) {
          throw new Error(`invalid visualization: ${error.diagnostics.map(finding => `${finding.code} ${finding.message}`).join('; ')}`)
        }
        throw error
      }
      const sizeBytes = gate?.sizeBytes ?? routed.sizeBytes
      const warnings = [gate?.warnings ?? '', formatWarnings(routed.warnings)].filter(text => text.length > 0).join('\n')
      // A create takes a content-addressed name — <slug>-<hash>.<style>.html —
      // so re-rendering identical bytes in the same style reuses its name. An
      // update keeps the style its card was created with, which that name
      // records; a legacy name without one takes the current setting.
      const configured = currentStyle()
      const cardStyle = action === 'update' ? styleOfCardPath(args.path!) ?? configured : configured
      const suffix = mode === 'page' ? PAGE_SUFFIX : '.html'
      const target = source ?? await store.create(`${slugOf(title)}-${contentHash(fragment)}.${cardStyle}${suffix}`)
      // Images resolve before anything is written: a call cancelled during a
      // slow fetch must leave the card as it was, or its file would hold a
      // patch no result reported and a retry of the same old_str would miss.
      // A patch carries the URL images its card already fetched; workspace
      // files are re-read, so a regenerated figure shows after any patch.
      const previous: StoredImage[] = action === 'update' ? await target.images?.read() ?? [] : []
      const resolved = await resolveCardImages(fragment, {
        readFile: workspaceImageReader(ctx, store.workspaceRoot),
        fetchUrl,
        store: store.images,
        ...images.delivery() ? {} : { unavailable: NO_IMAGE_ROUTE },
        previous,
        limits: imageLimits,
        signal: exec.signal,
      })
      // Read as optional: specs drive execute without a signal.
      const signal: AbortSignal | undefined = exec.signal
      signal?.throwIfAborted()
      await target.write(fragment)
      await target.images?.write(resolved.images)
      const embedded = resolved.images.map(cardImageOf)
      const report = imageReport(embedded, resolved.failures)
      return {
        action,
        backend: requested.id,
        path: target.displayPath,
        title,
        mode,
        sizeBytes,
        source: fragment,
        fragment,
        ...summary ? { summary } : {},
        style: cardStyle,
        ...warnings ? { warnings } : {},
        ...embedded.length > 0 ? { images: embedded } : {},
        ...report === undefined ? {} : { imageReport: report },
      }
    },
    presentCall: () => ({
      card: 'generic',
      title: 'Visualize',
      kind: 'other',
    }),
    // The completed title derives from persisted meta, not args, so replay of
    // a defaulted title still shows the resolved one. A malformed or absent
    // meta declines to the generic fallback.
    presentResult(_args, result) {
      if (result.isError) return undefined
      const title = cardTitleFrom(result.meta)
      return title === undefined ? undefined : { card: 'generic', title: `Visualization · ${title}` }
    },
  })
}

/** File-name suffix of a page card, from which an update recovers the mode. */
const PAGE_SUFFIX = '.page.html'

/**
 * A card's file name records its style — `<slug>-<hash>.<style>[.page].html`
 * — so an `update` re-renders the card in the style it was created with, not
 * whatever the setting says now. The name, not the file's content, carries
 * it: the model reads and patches the stored copy (and may `cat` it), so a
 * marker inside the markup would leak into its `old_str`.
 */
const CARD_STYLE_PATTERN = new RegExp(`-[0-9a-f]{8}\\.(${STYLE_IDS.join('|')})(?:\\.page)?\\.html$`, 'u')

/**
 * The style recorded in a card's file name.
 * @param path - the `update` path as the model passed it.
 * @returns the recorded style, or undefined for a name from before styles.
 */
function styleOfCardPath(path: string): StyleId | undefined {
  return CARD_STYLE_PATTERN.exec(path)?.[1] as StyleId | undefined
}

/**
 * Format backend warnings for the model-facing result.
 * @param warnings - findings that did not block the call.
 * @returns the text, one finding per line; empty when there are none.
 */
function formatWarnings(warnings: readonly { readonly code: string, readonly message: string, readonly fix?: string }[]): string {
  return warnings
    .map(finding => `${finding.code} ${finding.message}${finding.fix === undefined ? '' : ` — ${finding.fix}`}`)
    .join('\n')
}

/**
 * Read a card's title from persisted meta, accepting both the enveloped shape
 * this build writes and the flat shape cards written before the fork carry.
 * @param meta - the persisted tool result meta.
 * @returns the title, or undefined when the value is not a card.
 */
function cardTitleFrom(meta: unknown): string | undefined {
  const descriptor = descriptorFrom(meta)
  if (descriptor !== undefined) return descriptor.title
  const legacy = visualizeMetaFrom(meta)
  return legacy?.title
}

/** Longest launcher summary kept; the launcher shows one line. */
const MAX_SUMMARY_CHARS = 200

/**
 * Resolve the card's surface. The tested hosts check the schema enum before
 * execute; this keeps an unknown value failing loud on any that do not, not
 * rendering a card nobody asked for.
 * @param value - the raw `mode` argument.
 * @param pageFile - whether an update targets a page card's file.
 * @returns the mode to render.
 * @throws Error naming the accepted modes.
 */
function modeOf(value: string | undefined, pageFile: boolean): VisualizeMode {
  if (value === undefined) return pageFile ? 'page' : 'inline'
  if (!isVisualizeMode(value)) {
    throw new Error(`invalid visualization: \`mode\` must be one of ${VISUALIZE_MODES.map(m => `"${m}"`).join(', ')}`)
  }
  return value
}

/**
 * The model-facing confirmation. A page is not visible in the conversation
 * until the user opens it, and a tab already open keeps the version it was
 * opened with, so the text says both rather than claiming the user sees it.
 * @param value - the tool's canonical value.
 * @returns the one-line confirmation.
 */
function resultText(value: { action: VisualizeAction; backend: string; title: string; mode: VisualizeMode; sizeBytes: number; path: string }): string {
  const via = value.backend === 'html' ? 'sandboxed HTML fragment' : 'openui-lang program'
  if (value.mode === 'page') {
    return value.action === 'update'
      ? `Patched page "${value.title}" in place (${value.sizeBytes} bytes via the ${via} backend; updated card at ${value.path}). The launcher in the conversation now opens the corrected page; a tab the user already opened keeps the old version until they open it again. Patch that path for any further correction.`
      : `Rendered "${value.title}" as a page (${value.sizeBytes} bytes via the ${via} backend; saved copy at ${value.path}). The conversation shows a launcher card with a live thumbnail; the user opens the full page in its own tab from its button.`
  }
  return value.action === 'update'
    ? `Patched "${value.title}" in place (${value.sizeBytes} bytes via the ${via} backend; updated card at ${value.path}). The user sees the corrected visualization in the conversation; patch that path for any further correction.`
    : `Rendered "${value.title}" inline (${value.sizeBytes} bytes via the ${via} backend; saved copy at ${value.path}). The user sees the interactive visualization in the conversation.`
}

/**
 * Take one argument the chosen action cannot run without. The parameter schema
 * cannot express "required on update only", so the per-action requirement is
 * enforced here and fails loud rather than defaulting into a wrong card.
 * @param value - the raw argument value.
 * @param name - the parameter name, as the model wrote it.
 * @param action - the action that requires it, named in the message.
 * @returns the raw value, whitespace preserved.
 * @throws Error naming the missing parameter; the tool surfaces it as `isError`.
 */
function required(value: string | undefined, name: string, action: VisualizeAction): string {
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`invalid visualization: \`${name}\` is required when action is "${action}"`)
  }
  return value
}

/**
 * Take one argument that must be supplied but may legitimately be empty — an
 * empty `new_str` is how a patch deletes the region it matched.
 * @param value - the raw argument value.
 * @param name - the parameter name, as the model wrote it.
 * @param action - the action that requires it, named in the message.
 * @returns the raw value, including the empty string.
 * @throws Error naming the missing parameter; the tool surfaces it as `isError`.
 */
function present(value: string | undefined, name: string, action: VisualizeAction): string {
  if (value === undefined) {
    throw new Error(`invalid visualization: \`${name}\` is required when action is "${action}"`)
  }
  return value
}

/**
 * Lowercase, hyphenated, ASCII-safe file slug of a card title.
 * @param title - the resolved card title.
 * @returns a non-empty slug.
 */
function slugOf(title: string): string {
  const slug = title
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-+|-+$/gu, '')
    .slice(0, 48)
  return slug.length > 0 ? slug : 'visualization'
}

/**
 * Stable 8-hex-digit content hash (FNV-1a) naming the saved copy.
 * @param text - the fragment content.
 * @returns the hash as fixed-width hex.
 */
function contentHash(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}