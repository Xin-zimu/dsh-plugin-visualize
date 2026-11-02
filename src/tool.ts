/**
 * Compatibility entry for `visualizeTool`.
 *
 * The unified tool lives in `core/legacy-tool.ts`; this module keeps the path
 * the specs and the package's `./tool` import already use. A caller that passes
 * no backend registry gets the default one (HTML first), which is exactly what
 * this entry did before the fork.
 *
 * @module @dsh-unified/visualize/tool
 */

import type { Context } from '@deepseek-ai/cordis'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'
import { visualizeTool as unifiedTool, type ToolImageOptions } from './core/legacy-tool.ts'
import { createRegistry, type BackendRegistry } from './core/registry.ts'
import { htmlBackend } from './backends/html/renderer.ts'
import { openuiBackend } from './backends/openui/renderer.ts'
import { DEFAULT_STYLE, type StyleId } from './style.ts'

export { VISUALIZE_TOOL_NAME } from './fragment.ts'
export type { ToolImageOptions } from './core/legacy-tool.ts'

/**
 * Build the `visualize` tool over the default backends.
 *
 * Two call shapes are accepted: the pre-fork `(ctx, maxBytes, style, images)`,
 * and the post-fork `(ctx, maxBytes, registry, style, images)` that lets the
 * caller choose which backends ship.
 * @param ctx - registrant context.
 * @param maxSourceBytes - deployment ceiling for one surface.
 * @param registryOrStyle - the backend registry, or (pre-fork) the card style.
 * @param styleOrImages - the card style, or (pre-fork) the image options.
 * @param images - image embedding.
 * @returns the tool definition.
 */
export function visualizeTool(
  ctx: Context,
  maxSourceBytes: number,
  registryOrStyle: BackendRegistry | StyleId | (() => StyleId) = DEFAULT_STYLE,
  styleOrImages: StyleId | (() => StyleId) | ToolImageOptions = DEFAULT_STYLE,
  images: ToolImageOptions = { delivery: () => false },
): ToolDefinition {
  const isRegistry = typeof registryOrStyle === 'object'
    && registryOrStyle !== null
    && typeof (registryOrStyle as BackendRegistry).register === 'function'
  if (isRegistry) {
    return unifiedTool(
      ctx,
      maxSourceBytes,
      registryOrStyle as BackendRegistry,
      styleOrImages as StyleId | (() => StyleId),
      images,
    )
  }
  const style = registryOrStyle as StyleId | (() => StyleId)
  const legacyImages = typeof styleOrImages === 'object' && styleOrImages !== null && 'delivery' in styleOrImages
    ? styleOrImages as ToolImageOptions
    : images
  // The HTML backend needs the style reader itself, so a changed setting
  // reaches the next card without rebuilding the tool.
  const registry = createRegistry([htmlBackend(style), openuiBackend()])
  return unifiedTool(ctx, maxSourceBytes, registry, style, legacyImages)
}
