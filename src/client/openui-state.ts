/**
 * Where an OpenUI card's `$state` lives between loads.
 *
 * The HTML backend keeps its state in `card-state.ts`: one `localStorage`
 * entry per card under `STORAGE_PREFIX + cardStateKey(...)`, written by the
 * sandboxed frame and relayed by the card. An OpenUI card has no frame — it is
 * host React state (`OpenUICard.tsx`) — so it needs its own writer, but not its
 * own store. This module supplies the OpenUI *record*; `card-state.ts` keeps
 * owning the store, the debounce, the caps and the eviction.
 *
 * Why a separate key rather than a namespace inside one record (ADR-006):
 * `cleanState` caps one plain JSON object per card, `persist` reads `'{}'` as
 * "delete this entry", and `read` hands the whole `s` to the HTML frame. Putting
 * an `openui` key inside that object would shrink both backends' budget, leave
 * a tombstone when HTML state was cleared, and let model-written script read
 * another backend's data. A key suffix isolates the data; the shared store
 * keeps one ledger, one cap and one eviction policy for both.
 *
 * What is saved is state, never a render: the values a bound control wrote
 * through {@link hydrateState}, keyed by `$variable` name. Element and binding
 * descriptors, derived statements and anything else the evaluator produces are
 * refused rather than repaired.
 *
 * @module @nagi-ovo/dsh-visualize/client/openui-state
 */

import type { EvaluationValue } from '../backends/openui/evaluate.ts'

/**
 * Suffix that keeps an OpenUI record's key distinct from the HTML record's.
 *
 * Applied to the composed card key, not to a path: a card path always ends in
 * `.html` or `.page.html`, so no card can collide with a key ending here.
 */
export const OPENUI_KEY_SUFFIX = ':openui'

/** Shape version of the persisted record. A record with another version is ignored. */
export const OPENUI_STATE_VERSION = 1

/** Largest value one variable may carry, in JSON characters. */
export const OPENUI_VALUE_MAX_CHARS = 4 * 1024

/** A value this module is willing to persist and restore. */
export type PersistedValue = string | number | boolean | null

/** What a card keeps for one program. */
export interface OpenUiStateRecord {
  /** Record shape; not the program's schema. */
  readonly v: typeof OPENUI_STATE_VERSION
  /** Digest of the variable names and kinds the record was written against. */
  readonly h: string
  /**
   * One entry per persisted `$variable`, keyed without the `$`.
   *
   * Read as `unknown` on purpose: a stale or hostile write can leave anything
   * here, and a value that is not a {@link PersistedValue} must be *reported*
   * by {@link hydrateState} rather than silently ignored.
   */
  readonly values: Readonly<Record<string, unknown>>
}

/** What {@link hydrateState} decided, for the card and for a test to assert on. */
export interface HydratedState {
  /** Values to hand the evaluator as `options.state`, already validated. */
  readonly state: Record<string, PersistedValue>
  /** Names that were dropped, with the reason, so the record can be repaired. */
  readonly dropped: readonly { readonly name: string; readonly reason: 'unknown' | 'kind' | 'unsafe' | 'size' }[]
  /** The digest of the program the state was restored against. */
  readonly hash: string
  /** Every `$variable` the program declares, with its default, for re-validation on write. */
  readonly defaults: Readonly<Record<string, EvaluationValue>>
  /** True when `dropped` is non-empty: the caller should write the reduced record back. */
  readonly needsRepair: boolean
}

/**
 * The key an OpenUI card's state is kept under.
 * @param cardKey - the composed card key from `cardStateKey`.
 * @returns the store key for this card's OpenUI record.
 */
export function openuiStateKey(cardKey: string): string {
  return cardKey + OPENUI_KEY_SUFFIX
}

/**
 * The JSON kind of a value: shape only, never the value itself.
 *
 * Contents are deliberately excluded. A default that reads the clock
 * (`@Now()`, `@Today()`) has a different *value* on every load and the same
 * *kind*; digesting the value would make every such card look as though its
 * schema had changed and migrate its state on every reload.
 * @param value - any value.
 * @returns its kind.
 */
export function kindOf(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') {
    // The evaluator's own descriptors are not data a card may reuse.
    const kind = (value as { kind?: unknown }).kind
    return typeof kind === 'string' && (kind === 'element' || kind === 'binding') ? 'other' : 'object'
  }
  return typeof value
}

/**
 * FNV-1a over a string, as 8 hex digits.
 * @param text - the text to digest.
 * @returns the digest.
 */
function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Digest the `$variable` surface of a program.
 *
 * Takes `stateDefaults` — the evaluator's own map of every `$name` to its
 * caller-independent default (`evaluate.ts`) — and digests the **names** and
 * their **kinds**, sorted so statement order cannot move it. No value enters
 * the digest: see {@link kindOf}.
 * @param stateDefaults - evaluated defaults, from `evaluateProgram`.
 * @returns the digest.
 */
export function schemaHash(stateDefaults: Readonly<Record<string, EvaluationValue>>): string {
  const surface = Object.keys(stateDefaults)
    .sort()
    .map(name => [name, kindOf(stateDefaults[name])] as const)
  return fnv1a32(JSON.stringify(surface))
}

/**
 * Whether a value can survive JSON and come back as the same thing.
 * @param value - candidate.
 * @returns true for a string, finite number, boolean or null.
 */
export function isPersistedValue(value: unknown): value is PersistedValue {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value))
}

/**
 * Narrow a stored record, without trusting any field.
 *
 * Values are kept as `unknown` rather than filtered here: a descriptor a
 * hostile or stale write left behind has to be *reported* by
 * {@link hydrateState} so the record can be repaired, and quietly dropping it
 * at this layer would hide it.
 * @param raw - whatever the store returned.
 * @returns the record, or undefined when it is not one this build understands.
 */
export function readRecord(raw: unknown): OpenUiStateRecord | undefined {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  if (record['v'] !== OPENUI_STATE_VERSION) return undefined
  if (typeof record['h'] !== 'string') return undefined
  const values = record['values']
  if (typeof values !== 'object' || values === null || Array.isArray(values)) return undefined
  return {
    v: OPENUI_STATE_VERSION,
    h: record['h'],
    values: { ...(values as Record<string, unknown>) },
  }
}

/**
 * Restore a card's state against the program it is about to draw.
 *
 * Every rule here exists to make one of these true: a stored value never
 * reaches a component of the wrong kind, an unknown variable is not restored,
 * and nothing in this path can throw — a card whose storage is corrupt renders
 * exactly like a card that has none.
 *
 * The hash is a fast path and an explanation, never a delete switch: a record
 * written against a different `h` is still validated variable by variable, so
 * adding, removing or retyping one variable does not discard the others.
 *
 * @param raw - the stored record, if any.
 * @param stateDefaults - defaults of the program about to be drawn.
 * @returns the values to restore, what was dropped, and the current hash.
 */
export function hydrateState(
  raw: unknown,
  stateDefaults: Readonly<Record<string, EvaluationValue>>,
): HydratedState {
  const hash = schemaHash(stateDefaults)
  const record = readRecord(raw)
  const empty = { state: {}, dropped: [], hash, defaults: stateDefaults, needsRepair: false }
  if (record === undefined) return empty

  const state: Record<string, PersistedValue> = {}
  const dropped: { name: string; reason: 'unknown' | 'kind' | 'unsafe' | 'size' }[] = []
  for (const [name, value] of Object.entries(record.values)) {
    // Not declared by this program: never restored, and cleaned up by repair.
    if (!Object.prototype.hasOwnProperty.call(stateDefaults, name)) {
      dropped.push({ name, reason: 'unknown' })
      continue
    }
    if (!isPersistedValue(value)) {
      dropped.push({ name, reason: 'unsafe' })
      continue
    }
    let json: string
    try {
      json = JSON.stringify(value)
    } catch {
      dropped.push({ name, reason: 'unsafe' })
      continue
    }
    if (json.length > OPENUI_VALUE_MAX_CHARS) {
      dropped.push({ name, reason: 'size' })
      continue
    }
    // The kind is compared against the *default's* shape: a program that now
    // declares `$n = "3"` must not receive the number 3, and vice versa.
    // `null` is a reset marker and is allowed to stand in for any kind.
    const expected = kindOf(stateDefaults[name])
    if (value !== null && kindOf(value) !== expected) {
      dropped.push({ name, reason: 'kind' })
      continue
    }
    state[name] = value
  }
  return { state, dropped, hash, defaults: stateDefaults, needsRepair: dropped.length > 0 }
}

/**
 * Build the record to persist for the current state.
 *
 * Validates exactly as {@link hydrateState} does, because the write path can be
 * fed values from a merge with another view's record: anything that would not
 * survive a restore must not be written, or a dropped variable would reappear
 * on the next load and the self-repair would never settle.
 * @param hash - the current program's digest.
 * @param state - the values the card currently holds.
 * @param stateDefaults - the program's variables and their defaults.
 * @returns the record, or undefined when nothing is left to save.
 */
export function buildRecord(
  hash: string,
  state: Readonly<Record<string, unknown>>,
  stateDefaults: Readonly<Record<string, EvaluationValue>>,
): OpenUiStateRecord | undefined {
  const values: Record<string, PersistedValue> = {}
  for (const [name, value] of Object.entries(state)) {
    if (!Object.prototype.hasOwnProperty.call(stateDefaults, name)) continue
    if (!isPersistedValue(value)) continue
    let json: string
    try {
      json = JSON.stringify(value)
    } catch {
      continue
    }
    if (json.length > OPENUI_VALUE_MAX_CHARS) continue
    const expected = kindOf(stateDefaults[name])
    if (value !== null && kindOf(value) !== expected) continue
    values[name] = value
  }
  if (Object.keys(values).length === 0) return undefined
  return { v: OPENUI_STATE_VERSION, h: hash, values }
}

/**
 * Merge two in-memory maps for the write-merge: `next` wins per key.
 * @param stored - what another view last wrote.
 * @param next - this view's values.
 * @returns the union.
 */
export function mergeValues(
  stored: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return { ...stored, ...next }
}
