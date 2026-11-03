/**
 * Structural assertions for rendered markup.
 *
 * ## Why this file exists
 *
 * Stage 4A-2 shipped a `List` where `List([ListItem(...)])` rendered **two**
 * `role="listitem"` elements for one item: the walker had already drawn the
 * `ListItem` into a complete row, and `List` wrapped that row in a second one.
 * The live card showed five rows for a four-item program.
 *
 * 62 assertions passed while that was true, because every one of them asked
 * *"does the expected text appear in the markup?"* — and it did. Presence is not
 * structure. A component can be visibly wrong in the DOM while every string a
 * test looks for is present and correctly ordered.
 *
 * So this module exists to make the three questions cheap to ask:
 *
 *   - **count** — how many of a thing were drawn?
 *   - **nesting** — is a thing inside the parent it belongs to, and how deep?
 *   - **shape** — does the element tree match the component tree?
 *
 * ## Usage
 *
 * ```ts
 * const html = draw('root = List([ListItem("T", "D", "check")])')
 * expect(countOf(html, '[role="listitem"]')).toBe(1)
 * expect(shapeOf(html, 'div[role="list"]')).toEqual(['div[role="listitem"]'])
 * ```
 *
 * ## What this is not
 *
 * It is not a snapshot test. A snapshot would fail on every cosmetic change to a
 * class name or a style string, which trains a reader to update it without
 * looking. These helpers assert only the relationships that carry meaning: how
 * many, inside what, nested how deep.
 *
 * Deliberately dependency-free apart from jsdom, which the client specs already
 * run under. Nothing here is imported by `src/`, so it cannot reach a bundle.
 */

/** A parsed element, reduced to what structural assertions need. */
export interface StructureNode {
  readonly tag: string
  readonly role: string | undefined
  /** Depth from the parsed root: the root is 0, its children 1, and so on. */
  readonly depth: number
  /** Visible text with whitespace collapsed, for identifying a node. */
  readonly text: string
  readonly children: readonly StructureNode[]
}

/**
 * Parse a markup string into {@link StructureNode}s.
 *
 * Parsed as **fragment** children rather than a document body, because several
 * cards in this renderer return a list of siblings from one component.
 * @param html - rendered markup.
 * @returns one node per top-level element.
 */
export function structure(html: string): StructureNode[] {
  const container = document.createElement('div')
  container.innerHTML = html
  const walk = (element: Element, depth: number): StructureNode => ({
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute('role') ?? undefined,
    depth,
    text: (element.textContent ?? '').replace(/\s+/gu, ' ').trim(),
    children: [...element.children].map(child => walk(child, depth + 1)),
  })
  return [...container.children].map(child => walk(child, 0))
}

/** Every node in the tree, depth-first. */
export function flatten(nodes: readonly StructureNode[]): StructureNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)])
}

/**
 * How many elements match `selector`.
 *
 * Prefer this to `expect(html).toContain(...)` whenever the claim is about a
 * thing being drawn: `toContain` cannot tell one row from five.
 * @param html - rendered markup.
 * @param selector - a CSS selector.
 * @returns the count.
 */
export function countOf(html: string, selector: string): number {
  const container = document.createElement('div')
  container.innerHTML = html
  return container.querySelectorAll(selector).length
}

/**
 * The direct children of the first element matching `selector`, as tag names.
 *
 * `role` is folded in when present, so a `div[role="listitem"]` reads as
 * `div[role=listitem]` — the attribute is part of the structural claim.
 * @param html - rendered markup.
 * @param selector - a CSS selector for the parent.
 * @returns the child descriptors, or an empty array when the parent is absent.
 */
export function shapeOf(html: string, selector: string): string[] {
  const container = document.createElement('div')
  container.innerHTML = html
  const parent = container.querySelector(selector)
  if (parent === null) return []
  return [...parent.children].map(child => {
    const role = child.getAttribute('role')
    return role === null ? child.tagName.toLowerCase() : `${child.tagName.toLowerCase()}[role=${role}]`
  })
}

/**
 * The nesting depth of the first element matching `selector`, or -1.
 *
 * Used to catch the double-wrap class of defect directly: a row that should sit
 * at depth 2 and instead sits at depth 3 is a wrapper nobody intended, even when
 * the text and the count are right.
 * @param html - rendered markup.
 * @param selector - a CSS selector.
 * @returns depth from the parsed root, or -1 when absent.
 */
export function depthOf(html: string, selector: string): number {
  const container = document.createElement('div')
  container.innerHTML = html
  const target = container.querySelector(selector)
  if (target === null) return -1
  let depth = 0
  let node: Element | null = target
  while (node.parentElement !== null && node.parentElement !== container) {
    depth += 1
    node = node.parentElement
  }
  return depth
}

/**
 * A compact one-line description of a subtree, for assertion messages.
 *
 * A failing count assertion is much easier to read as
 * `div[role=list] > [div[role=listitem], div[role=listitem]]` than as `5 !== 4`.
 * @param html - rendered markup.
 * @param selector - the subtree root.
 * @returns a description, or a note that the root is missing.
 */
export function describeShape(html: string, selector: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  const parent = container.querySelector(selector)
  if (parent === null) return `<no element matching ${selector}>`
  const label = (el: Element): string => {
    const role = el.getAttribute('role')
    const tag = el.tagName.toLowerCase()
    return role === null ? tag : `${tag}[role=${role}]`
  }
  return `${label(parent)} > [${[...parent.children].map(label).join(', ')}]`
}
