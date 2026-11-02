/**
 * Pure fragment contract shared by the tool (validation at execute time), the
 * browser card (meta narrowing at render time), and the specs. No I/O and no
 * DOM so both halves and vitest can load it unchanged.
 *
 * A *fragment* is the model-authored inline-HTML body of one visualization:
 * literal markup without a document skeleton. The card owns the skeleton — it
 * wraps the fragment in a sandboxed iframe document with its own CSP — so a
 * fragment that ships its own `<!doctype>`/`<html>`/`<head>`/`<body>` would
 * nest documents and is rejected loudly instead of rendered broken (see
 * `lint.ts` for that rule and the rest of the contract's rule table).
 *
 * @module @nagi-ovo/dsh-visualize/fragment
 */

import { DEFAULT_STYLE, styleIdFrom, type StyleId } from './style.ts'

/**
 * Wire name of the tool, the keyed toolview, and the streaming-preview match.
 * Lives in this pure module so the browser half can import it without pulling
 * the node-side tool implementation into the client bundle.
 */
export const VISUALIZE_TOOL_NAME = 'visualize'

/**
 * Surface of one visualization: `inline` and `wide` render the fragment in
 * the conversation at the chat column's or the expanded width; `page` renders
 * a launcher card there and the fragment itself as a full page in its own tab.
 */
export type VisualizeMode = 'inline' | 'wide' | 'page'

/** Every {@link VisualizeMode}, in the order the tool schema lists them. */
export const VISUALIZE_MODES: readonly VisualizeMode[] = ['inline', 'wide', 'page']

/**
 * Narrow one wire value to a {@link VisualizeMode}.
 * @param value - the raw value.
 * @returns whether it names a known mode.
 */
export function isVisualizeMode(value: unknown): value is VisualizeMode {
  return value === 'inline' || value === 'wide' || value === 'page'
}

/**
 * What one `visualize` call does: render a card from whole markup, or patch
 * the markup of a card an earlier call already rendered.
 */
export type VisualizeAction = 'create' | 'update'

/** The `tool/result` meta descriptor persisted for replay-stable rendering. */
export interface VisualizeMeta {
  /** Discriminant for consumers sharing the meta channel. */
  kind: 'visualize'
  /** The validated fragment body, inlined so replay never re-reads the file. */
  fragment: string
  /** Concise human title shown in the card header. */
  title: string
  /** Surface; `wide` asks for the expanded inline surface, `page` for a launcher and its own tab. */
  mode: VisualizeMode
  /** Session-relative or absolute source path, kept for provenance display. */
  path: string
  /** One-line description a page launcher shows under its title; absent when none was given. */
  summary?: string
  /**
   * Card style the card was created under, so replay and the windowed view
   * keep its look after the setting changes. Absent on cards from before
   * styles existed, which read as the default.
   */
  style: StyleId
  /**
   * Images the tool resolved from the fragment's `data-viz-src` attributes,
   * as references only: the bytes stay in the plugin's card store and reach
   * the card through {@link IMAGE_ROUTE_PATH}. Absent when there are none.
   */
  images?: CardImage[]
}

/** Image formats a card embeds; the tool verifies each by its magic bytes. */
export type CardImageType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml'

/** Every {@link CardImageType}. */
export const CARD_IMAGE_TYPES: readonly CardImageType[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

/** One resolved `data-viz-src`, as persisted meta carries it. */
export interface CardImage {
  /** The attribute value exactly as the fragment spells it, entities undecoded. */
  src: string
  /** Store id the image route serves: `<session segment>/<sha256>.<ext>`. */
  id: string
  type: CardImageType
  bytes: number
}

/**
 * Exact route on the host's authenticated `/api` channel (dsh 0.1.7+) that
 * serves a stored card image by its {@link CardImage.id}.
 */
export const IMAGE_ROUTE_PATH = '/api/dsh-visualize/image'

/**
 * Characters of real card content quoted back when a patch fails to apply, so
 * the model can correct `old_str` from the true bytes without re-reading the
 * whole card.
 */
const PATCH_CONTEXT_CHARS = 160

/**
 * Shortest matching prefix of a failed `old_str` still worth reporting as a
 * location hint; below this any HTML shares enough characters to point
 * somewhere misleading.
 */
const MIN_ANCHOR_CHARS = 12

/**
 * Replace one exact, unique occurrence of `oldStr` in a rendered card's
 * fragment. Iterating by patch instead of re-emitting the whole fragment is
 * what keeps a small correction small: the model re-states only the changed
 * region, and the card's markup never enters its output twice.
 *
 * A patch that does not resolve to exactly one site is refused rather than
 * guessed at, because both wrong outcomes are silent — a near-miss would edit
 * markup the model never saw, and an ambiguous match would edit an arbitrary
 * one of several sites. The thrown message carries the surrounding real
 * content so the caller can correct `old_str` within the same turn.
 *
 * @param base - the current fragment of the card being patched.
 * @param oldStr - exact text to replace, whitespace included.
 * @param newStr - replacement text; empty deletes the matched region.
 * @returns the patched fragment.
 * @throws Error naming why the patch did not apply; the tool surfaces it as `isError`.
 */
export function applyFragmentPatch(base: string, oldStr: string, newStr: string): string {
  if (oldStr.length === 0) {
    throw new Error('invalid visualization patch: old_str is empty — pass the exact card text to replace')
  }
  const first = base.indexOf(oldStr)
  if (first === -1) {
    throw new Error(`invalid visualization patch: old_str does not appear in the card. ${nearestAnchor(base, oldStr)}`)
  }
  if (base.indexOf(oldStr, first + oldStr.length) !== -1) {
    throw new Error(
      `invalid visualization patch: old_str appears ${countOccurrences(base, oldStr)} times in the card — `
      + 'extend it with neighbouring lines until exactly one site matches',
    )
  }
  return base.slice(0, first) + newStr + base.slice(first + oldStr.length)
}

/**
 * Describe where a failed `old_str` stopped matching: the longest prefix of it
 * that does occur, and the card's real text at that site. Prefix occurrence is
 * monotone in length, so the longest one is a binary search.
 * @param base - the current fragment of the card being patched.
 * @param oldStr - the `old_str` that failed to match.
 * @returns a sentence naming the divergence point, or advising a full re-render.
 */
function nearestAnchor(base: string, oldStr: string): string {
  let matched = 0
  let beyond = oldStr.length
  while (matched < beyond) {
    const mid = Math.ceil((matched + beyond) / 2)
    if (base.includes(oldStr.slice(0, mid))) matched = mid
    else beyond = mid - 1
  }
  if (matched < MIN_ANCHOR_CHARS) {
    return 'None of it matched, so the card is not in the state you assumed — re-render the whole card instead.'
  }
  const at = base.indexOf(oldStr.slice(0, matched))
  return `Its first ${matched} characters do match, at offset ${at}, where the card actually reads `
    + `${JSON.stringify(base.slice(at, at + PATCH_CONTEXT_CHARS))} — correct old_str against that and retry.`
}

/**
 * Count non-overlapping occurrences of a needle, matching the replacement
 * semantics {@link applyFragmentPatch} would apply.
 * @param base - the text to scan.
 * @param needle - the non-empty needle to count.
 * @returns the number of non-overlapping occurrences.
 */
function countOccurrences(base: string, needle: string): number {
  let count = 0
  for (let at = base.indexOf(needle); at !== -1; at = base.indexOf(needle, at + needle.length)) count += 1
  return count
}

/**
 * The meta a program card persists.
 *
 * Deliberately a different discriminant from {@link VisualizeMeta}, not a
 * `fragment` holding a program: the two backends produce different documents,
 * and the card has to tell them apart before it can draw either. Pretending a
 * program is a fragment would work for exactly one renderer and break the day a
 * third one arrives.
 */
export interface OpenUIMeta {
  /** Discriminant that sends this card to the OpenUI renderer. */
  kind: 'intelligent_ui'
  /** The validated openui-lang program, inlined so replay never re-reads a file. */
  program: string
  /** Concise human title shown in the card header. */
  title: string
  /** Surface the card occupies. */
  mode: VisualizeMode
  /** Session-relative or absolute source path, kept for provenance display. */
  path: string
  /** One-line description a page launcher shows; absent when none was given. */
  summary?: string
  /** Card style the card was created under. */
  style: StyleId
}

/**
 * What a card can be. The client switches on {@link kind} and hands the value
 * to the matching renderer; nothing downstream inspects a field the other
 * variant owns.
 */
export type VisualizationDescriptor = VisualizeMeta | OpenUIMeta

/**
 * Narrow one persisted meta value to an {@link OpenUIMeta}.
 * @param meta - the raw persisted meta value.
 * @returns the narrowed descriptor, or undefined when the value is not a program card.
 */
export function openuiMetaFrom(meta: unknown): OpenUIMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const record = meta as Record<string, unknown>
  if (record['kind'] !== 'intelligent_ui') return undefined
  const { program, title, mode, path, summary } = record
  if (typeof program !== 'string' || typeof title !== 'string' || typeof path !== 'string') return undefined
  if (!isVisualizeMode(mode)) return undefined
  return {
    kind: 'intelligent_ui',
    program,
    title,
    mode,
    path,
    ...summaryField(summary),
    style: styleIdFrom(record['style']),
  }
}

/**
 * Read a program card out of a call's own arguments.
 *
 * A streaming call has no persisted meta yet, and a call made before the fork
 * by dsh-intelligent-ui wrote its program only into `tool/call` arguments. This
 * is the same fallback `visualizeMetaFromArgs` provides for fragments.
 * @param argsRaw - the raw arguments string, possibly an incomplete prefix.
 * @returns the program card, or undefined when the arguments are not one.
 */
export function openuiMetaFromArgs(argsRaw: unknown): OpenUIMeta | undefined {
  if (typeof argsRaw !== 'string' || argsRaw.trim() === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(argsRaw)
  } catch {
    // Mid-stream arguments are not valid JSON yet: take the program seen so far,
    // so the card can start drawing while the model is still writing.
    const partial = partialProgram(argsRaw)
    if (partial === undefined) return undefined
    return {
      kind: 'intelligent_ui',
      program: partial,
      title: 'Visualization',
      mode: 'inline',
      path: 'streaming',
      style: DEFAULT_STYLE,
    }
  }
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const record = parsed as Record<string, unknown>
  const program = record['program'] ?? record['source']
  if (typeof program !== 'string' || program.trim() === '') return undefined
  // A call that names the html backend is not ours, even if it carries a
  // `program`-named field.
  if (record['backend'] === 'html' || record['fragment'] !== undefined) return undefined
  const mode = isVisualizeMode(record['mode']) ? record['mode'] : 'inline'
  return {
    kind: 'intelligent_ui',
    program,
    title: typeof record['title'] === 'string' && record['title'].trim() !== '' ? record['title'] : 'Visualization',
    mode,
    path: typeof record['path'] === 'string' ? record['path'] : 'streaming',
    ...typeof record['summary'] === 'string' ? { summary: record['summary'] } : {},
    style: styleIdFrom(record['style']),
  }
}

/**
 * Recover the still-open `program` string of a half-streamed arguments object.
 * @param argsRaw - the partial JSON.
 * @returns the program text seen so far, or undefined when it has not started.
 */
function partialProgram(argsRaw: string): string | undefined {
  const at = /"program"\s*:\s*"/u.exec(argsRaw)
  if (at === null) return undefined
  let out = ''
  for (let index = at.index + at[0].length; index < argsRaw.length; index++) {
    const ch = argsRaw[index]!
    if (ch === '\\') {
      const next = argsRaw[index + 1]
      if (next === undefined) break
      out += next === 'n' ? '\n' : next === 't' ? '\t' : next
      index += 1
      continue
    }
    if (ch === '"') break
    out += ch
  }
  return out.trim() === '' ? undefined : out
}

/**
 * Narrow one persisted meta value to whichever card variant it is.
 *
 * This is the dispatch the client uses. A value that names neither variant —
 * an older or newer host, a malformed record — declines, and the card falls
 * back to the generic presentation instead of throwing on replay.
 * @param meta - the raw persisted meta value.
 * @returns the descriptor, or undefined for the generic path.
 */
export function visualizationFrom(meta: unknown): VisualizationDescriptor | undefined {
  return visualizeMetaFrom(meta) ?? openuiMetaFrom(meta)
}

/**
 * Narrow one persisted `tool/result` meta value to a {@link VisualizeMeta}.
 * Wire data cannot be trusted to match the compiled shape (an older or newer
 * host may have logged it), so a mismatch declines to `undefined` — the caller
 * falls back to the generic presentation instead of throwing on replay.
 * @param meta - the raw persisted meta value.
 * @returns the narrowed descriptor, or `undefined` for the generic path.
 */
export function visualizeMetaFrom(meta: unknown): VisualizeMeta | undefined {
  if (typeof meta !== 'object' || meta === null) return undefined
  const record = meta as Record<string, unknown>
  if (record['kind'] !== 'visualize') return undefined
  const { fragment, title, mode, path, summary } = record
  if (typeof fragment !== 'string' || typeof title !== 'string' || typeof path !== 'string') return undefined
  if (!isVisualizeMode(mode)) return undefined
  return {
    kind: 'visualize', fragment, title, mode, path, ...summaryField(summary), style: styleIdFrom(record['style']),
    ...imagesField(record['images']),
  }
}

/**
 * The optional image references as a spreadable field. A malformed entry is
 * dropped on its own: that image shows its placeholder, the card still renders.
 * @param images - the raw wire value.
 * @returns `{ images }` with every well-formed entry, or an empty object.
 */
function imagesField(images: unknown): { images?: CardImage[] } {
  if (!Array.isArray(images)) return {}
  const list = images.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const { src, id, type, bytes } = entry as Record<string, unknown>
    if (typeof src !== 'string' || typeof id !== 'string' || typeof bytes !== 'number') return []
    if (!CARD_IMAGE_TYPES.includes(type as CardImageType)) return []
    return [{ src, id, type: type as CardImageType, bytes }]
  })
  return list.length > 0 ? { images: list } : {}
}

/**
 * The optional summary as a spreadable field: a missing or malformed one is
 * dropped rather than declining the whole card over a caption.
 * @param summary - the raw wire value.
 * @returns `{ summary }` for a non-blank string, otherwise an empty object.
 */
function summaryField(summary: unknown): { summary?: string } {
  return typeof summary === 'string' && summary.trim().length > 0 ? { summary: summary.trim() } : {}
}

/**
 * Rebuild a descriptor from the call's own arguments when persisted meta is
 * missing. Nested dispatches (`run_code` / PTC) never project presentation
 * meta, but they do log `arguments`; a create's fragment is in that JSON.
 *
 * An `update` without a fragment cannot be rebuilt from the wire (the patched
 * markup lives in execute's value, which nested logs do not keep) and
 * declines. Incomplete streaming JSON is not parsed via throw/catch: only a
 * trailing `}` is treated as complete, otherwise a *closed* `"fragment"`
 * string is taken through {@link extractStreamingFragment}'s scanner.
 * @param argsRaw - running `block.argsRaw` or settled `block.call.argsRaw`.
 * @returns a card descriptor, or `undefined` to keep the quiet fallback.
 */
export function visualizeMetaFromArgs(argsRaw: unknown): VisualizeMeta | undefined {
  if (typeof argsRaw !== 'string' || argsRaw.length === 0) return undefined
  const complete = parseCompleteArgs(argsRaw)
  if (complete !== undefined) {
    // Default action is create. Update's full markup is not in the arguments.
    if (complete['action'] === 'update' && typeof complete['fragment'] !== 'string') return undefined
    return descriptorFromFields(
      complete['fragment'], complete['title'], complete['mode'], complete['path'], complete['summary'],
    )
  }
  const closed = scanFragment(argsRaw, true)
  if (closed === undefined) return undefined
  return descriptorFromFields(closed, undefined, streamedMode(argsRaw), undefined, undefined)
}

/**
 * Accept only a complete JSON object, gated on a trailing `}` so a streaming
 * prefix never enters `JSON.parse`.
 * @param raw - accumulated argument text.
 * @returns the object, or `undefined` when the prefix is incomplete or illegal.
 */
function parseCompleteArgs(raw: string): Record<string, unknown> | undefined {
  let end = raw.length
  while (end > 0) {
    const ch = raw[end - 1]!
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      end -= 1
      continue
    }
    break
  }
  if (end === 0 || raw[end - 1] !== '}') return undefined
  try {
    const parsed: unknown = JSON.parse(raw.slice(0, end))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    return parsed as Record<string, unknown>
  } catch {
    return undefined
  }
}

/**
 * Narrow wire fields into a descriptor. Empty markup after dropping a
 * trailing half-script is declined rather than mounting a blank frame.
 */
function descriptorFromFields(
  fragment: unknown,
  title: unknown,
  mode: unknown,
  path: unknown,
  summary: unknown,
): VisualizeMeta | undefined {
  if (typeof fragment !== 'string') return undefined
  if (mode !== undefined && !isVisualizeMode(mode)) return undefined
  const markup = trimStreamingScripts(fragment)
  if (markup.trim().length === 0) return undefined
  return {
    kind: 'visualize',
    fragment: markup,
    title: typeof title === 'string' && title.trim().length > 0 ? title.trim() : 'Visualization',
    mode: mode ?? 'inline',
    path: typeof path === 'string' ? path : '',
    ...summaryField(summary),
    // The arguments never name a style; the client substitutes its best guess.
    style: DEFAULT_STYLE,
  }
}

/**
 * The `mode` of a still-open argument stream, when its string value has
 * already closed. A settled-card fallback that mounts before the JSON ends
 * must not render a page fragment inline just because the object is open.
 * @param argsRaw - accumulated argument text.
 * @returns the streamed mode, or undefined when absent, open, or unknown.
 */
function streamedMode(argsRaw: string): VisualizeMode | undefined {
  const match = /"mode"\s*:\s*"([a-z]+)"/u.exec(argsRaw)
  return match !== null && isVisualizeMode(match[1]) ? match[1] : undefined
}

/** JSON short escapes, keyed by the character after the backslash. */
const JSON_ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
}

/**
 * Extract the `fragment` string value from a *possibly incomplete* streaming
 * tool-call JSON argument prefix. The streaming preview calls this on every
 * accumulated delta: it scans for the `"fragment":"` opener, then unescapes
 * characters until the (possibly absent) closing quote, dropping a trailing
 * half-finished escape sequence rather than misreading it.
 * @param argsRaw - the accumulated raw argument text, valid JSON or a prefix.
 * @returns the fragment decoded so far, or `undefined` before the opener streams in.
 */
export function extractStreamingFragment(argsRaw: string): string | undefined {
  return scanFragment(argsRaw, false)
}

/**
 * Walk a possibly incomplete `"fragment":"...` value.
 * @param argsRaw - accumulated argument text.
 * @param requireClosed - when true, decline until the closing quote arrives
 *   (the settled-card fallback must not mount on a half-streamed string).
 * @returns the decoded fragment, or `undefined` when the opener is absent
 *   or, if required, the string is still open.
 */
function scanFragment(argsRaw: string, requireClosed: boolean): string | undefined {
  const opener = /"fragment"\s*:\s*"/u.exec(argsRaw)
  if (!opener) return undefined
  let out = ''
  for (let i = opener.index + opener[0].length; i < argsRaw.length; i++) {
    const ch = argsRaw[i]!
    if (ch === '"') return out
    if (ch !== '\\') {
      out += ch
      continue
    }
    const next = argsRaw[i + 1]
    if (next === undefined) return requireClosed ? undefined : out
    if (next === 'u') {
      const hex = argsRaw.slice(i + 2, i + 6)
      if (hex.length < 4) return requireClosed ? undefined : out
      const code = Number.parseInt(hex, 16)
      if (Number.isNaN(code)) return requireClosed ? undefined : out
      out += String.fromCharCode(code)
      i += 5
      continue
    }
    const short = JSON_ESCAPES[next]
    if (short === undefined) return requireClosed ? undefined : out
    out += short
    i += 1
  }
  return requireClosed ? undefined : out
}

/** Matches the last script opener (complete or still missing its `>`). */
const LAST_SCRIPT_OPEN = /<script\b[^>]*>?(?![\s\S]*<script\b)/iu

/**
 * Prepare a streamed fragment prefix for the live preview: complete
 * `<script>…</script>` blocks are kept — they are finished JavaScript the
 * preview shell executes on arrival, which is how a script-drawn chart paints
 * during generation — while a trailing block whose `</script>` has not
 * streamed in yet is dropped whole (a half-streamed body is almost never
 * valid JavaScript).
 * @param fragment - the fragment prefix streamed so far.
 * @returns the preview-safe markup.
 */
export function trimStreamingScripts(fragment: string): string {
  const opener = LAST_SCRIPT_OPEN.exec(fragment)
  if (!opener) return fragment
  const rest = fragment.slice(opener.index + opener[0].length)
  return /<\/script\s*>/iu.test(rest) ? fragment : fragment.slice(0, opener.index)
}