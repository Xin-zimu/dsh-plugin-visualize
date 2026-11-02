/**
 * The backend registry.
 *
 * Backends are registered once at boot and looked up by id thereafter. The
 * registry is the only place that knows every backend; the router asks it and
 * never imports a backend module directly, so a new backend is a new file plus
 * one registration call.
 *
 * @module @dsh-unified/visualize/core/registry
 */

import {
  BACKEND_IDS,
  isBackendId,
  type BackendId,
  type RendererAdapter,
} from './render-contract.ts'

/** Backends in registration order, keyed by id. */
export class BackendRegistry {
  readonly #adapters = new Map<BackendId, RendererAdapter>()

  /**
   * Add one backend.
   * @param adapter - the backend.
   * @returns this registry, for chaining.
   * @throws Error naming the backend when its id is already taken.
   */
  register(adapter: RendererAdapter): this {
    if (this.#adapters.has(adapter.id)) {
      throw new Error(`dsh-unified-visualize: backend "${adapter.id}" is already registered`)
    }
    this.#adapters.set(adapter.id, adapter)
    return this
  }

  /**
   * Look a backend up.
   * @param id - the backend id from the tool call.
   * @returns the backend, or undefined when this build does not ship it.
   */
  get(id: BackendId): RendererAdapter | undefined {
    return this.#adapters.get(id)
  }

  /**
   * Every registered backend, in registration order.
   * @returns the backends.
   */
  all(): readonly RendererAdapter[] {
    return [...this.#adapters.values()]
  }

  /**
   * Ids this build can route to.
   * @returns the registered ids, in registration order.
   */
  ids(): readonly BackendId[] {
    return this.all().map(adapter => adapter.id)
  }

  /**
   * The backend an omitted `backend` argument means: the first registered one.
   * @returns the default backend, or undefined when none is registered.
   */
  defaultBackend(): RendererAdapter | undefined {
    return this.all()[0]
  }
}

/**
 * Build the registry holding the backends this build ships.
 *
 * Registration order fixes the default: the HTML backend goes first because it
 * is the one that existed before the fork, so a call that names no backend
 * keeps behaving as it did.
 * @param adapters - the backends to register.
 * @returns the populated registry.
 */
export function createRegistry(adapters: readonly RendererAdapter[]): BackendRegistry {
  const registry = new BackendRegistry()
  for (const adapter of adapters) registry.register(adapter)
  return registry
}

/**
 * Resolve the backend for one call, failing loud on a name this build lacks.
 * @param registry - the populated registry.
 * @param raw - the `backend` argument, as the model wrote it.
 * @returns the backend to route to.
 * @throws Error naming the accepted ids.
 */
export function resolveBackend(registry: BackendRegistry, raw: unknown): RendererAdapter {
  if (raw === undefined || raw === null || raw === '') {
    const fallback = registry.defaultBackend()
    if (fallback === undefined) throw new Error('dsh-unified-visualize: no render backend is registered')
    return fallback
  }
  if (!isBackendId(raw)) {
    throw new Error(`invalid visualization: \`backend\` must be one of ${BACKEND_IDS.map(id => `"${id}"`).join(', ')}`)
  }
  const adapter = registry.get(raw)
  if (adapter === undefined) {
    throw new Error(`invalid visualization: backend "${raw}" is not available in this build (${registry.ids().join(', ')})`)
  }
  return adapter
}
