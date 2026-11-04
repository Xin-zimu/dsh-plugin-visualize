/**
 * Popover placement — ADR-012, as arithmetic that can be tested.
 *
 * ## Why this is a separate, pure module
 *
 * The decision this encodes is "the panel stays inside the card". Three things
 * follow from it that are easy to get wrong:
 *
 *   1. A refusal must never be silent, so a placement that cannot satisfy the
 *      constraint reports which fallback it took instead of trusting CSS.
 *   2. The arithmetic is the part that can be wrong, and a jsdom unit test has
 *      no layout engine to exercise it in — so the arithmetic is lifted out of
 *      the component, where a test can hand it rectangles directly.
 *   3. `position: absolute` is **not** containment. An absolutely positioned box
 *      overflows its containing block freely; it is positioned relative to it,
 *      not clipped to it. So the clamp below is the containment, and the browser
 *      run measures it rather than trusting this comment.
 *
 * All rectangles are in viewport coordinates, the way
 * `Element.getBoundingClientRect()` returns them. The result is returned in
 * **anchor-relative** coordinates, ready for `position: absolute`: the one
 * conversion is a subtraction at the end, so the interesting arithmetic above
 * it stays readable.
 */

/** A rectangle in viewport coordinates. */
export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/**
 * Where the panel ended up, and why.
 *
 *   - `below` — the preferred placement; there was room under the trigger.
 *   - `above` — there was no room below but there was above.
 *   - `clamped` — it fitted on one side only after the height was limited, so the
 *     panel scrolls internally.
 *   - `cover` — neither side had a legible amount of room, so the panel expands
 *     over the card's own rectangle. Still inside the card, still inside the
 *     host's layout; this is the "expand in place" fallback, not a failure.
 *   - `unmeasured` — the card had no extent to measure against (first paint,
 *     jsdom, a hidden tab). The panel is placed below the trigger and limited by
 *     the viewport rather than the card, because a zero-sized card is not a
 *     constraint worth honouring.
 */
export type Placement = 'below' | 'above' | 'clamped' | 'cover' | 'unmeasured'

/** One resolved position, in anchor-relative coordinates. */
export interface PlacementResult {
  readonly placement: Placement
  /** Left edge, relative to the anchor element's border box. */
  readonly left: number
  /** Top edge, relative to the anchor element's border box. */
  readonly top: number
  /** Panel width in pixels. */
  readonly width: number
  /** Height limit, or undefined when the panel may size itself. */
  readonly maxHeight: number | undefined
}

/** Room left between the panel and the card's own edge. */
export const EDGE_PAD = 8

/** Room left between the trigger and the panel. */
export const TRIGGER_GAP = 6

/** Below this, a panel is not worth drawing in the gap: expand over the card. */
export const LEGIBLE_FLOOR = 96

/**
 * Place the panel for one open popover.
 * @param card - the card's rectangle: the boundary the panel may not leave.
 * @param trigger - the trigger's rectangle.
 * @param anchor - the positioned wrapper's rectangle, which the result is relative to.
 * @param panel - the panel's natural size from a previous paint.
 * @returns where to draw it, and which rule decided.
 */
export function placePopover(input: {
  readonly card: Box
  readonly trigger: Box
  readonly anchor: Box
  readonly panel: Box
}): PlacementResult {
  const { card, trigger, anchor, panel } = input
  const width = panel.width
  const height = panel.height

  // A card with no extent gives nothing to clamp against. Treat it as the host
  // case it is: place below and let the viewport limit the panel.
  if (card.width <= 0 || card.height <= 0) {
    return {
      placement: 'unmeasured',
      left: 0,
      top: trigger.height + TRIGGER_GAP,
      width,
      maxHeight: undefined,
    }
  }

  const innerLeft = card.left + EDGE_PAD
  const innerRight = card.left + card.width - EDGE_PAD
  const innerTop = card.top + EDGE_PAD
  const innerBottom = card.top + card.height - EDGE_PAD
  const innerWidth = Math.max(0, innerRight - innerLeft)
  const innerHeight = Math.max(0, innerBottom - innerTop)

  // Width first: a panel wider than the card cannot be placed at all, and
  // clamping a position for an impossible width would produce a negative left.
  const finalWidth = Math.min(width, innerWidth)

  const spaceBelow = innerBottom - (trigger.top + trigger.height) - TRIGGER_GAP
  const spaceAbove = (trigger.top - TRIGGER_GAP) - innerTop

  const cover = (): PlacementResult => ({
    placement: 'cover',
    left: innerLeft - anchor.left,
    top: innerTop - anchor.top,
    width: innerWidth,
    maxHeight: innerHeight,
  })

  // Neither side can hold even a legible panel: expand in place.
  if (spaceBelow < LEGIBLE_FLOOR && spaceAbove < LEGIBLE_FLOOR) return cover()
  if (innerWidth <= 0 || innerHeight <= 0) return cover()

  const below = height <= spaceBelow
  const above = height <= spaceAbove
  let top: number
  let maxHeight: number | undefined
  let placement: Placement

  if (below) {
    placement = 'below'
    top = trigger.top + trigger.height + TRIGGER_GAP
    maxHeight = undefined
  } else if (above) {
    placement = 'above'
    top = trigger.top - TRIGGER_GAP - height
    maxHeight = undefined
  } else if (spaceBelow >= spaceAbove) {
    // Fits on neither side: take the larger and scroll inside it.
    placement = 'clamped'
    top = trigger.top + trigger.height + TRIGGER_GAP
    maxHeight = spaceBelow
  } else {
    placement = 'clamped'
    top = trigger.top - TRIGGER_GAP - spaceAbove
    maxHeight = spaceAbove
  }

  // Vertical containment, the same rule the horizontal clamp below follows.
  //
  // It is not redundant with the placement choice above: the trigger may itself
  // lie partly outside the card — a row scrolled to the edge, a trigger in the
  // first or last few pixels — and anchoring the panel to that trigger can put
  // the whole panel outside the card even though the placement rule computed a
  // "fitting" side. The clamp is what makes the ADR-012 invariant hold for every
  // trigger position rather than only for the comfortable ones.
  const drawn = maxHeight ?? height
  if (drawn <= innerHeight) {
    top = Math.min(Math.max(top, innerTop), innerBottom - drawn)
  } else {
    top = Math.min(Math.max(top, innerTop), innerBottom)
    maxHeight = Math.max(0, innerBottom - top)
  }

  // Horizontal: aligned with the trigger, then shifted inward. Alignment yields
  // to containment — a panel flush to the card edge is correct, a panel hanging
  // over the host is not.
  let left = trigger.left
  if (left + finalWidth > innerRight) left = innerRight - finalWidth
  if (left < innerLeft) left = innerLeft

  return {
    placement,
    left: left - anchor.left,
    top: top - anchor.top,
    width: finalWidth,
    maxHeight,
  }
}

/**
 * Whether a resolved position keeps the panel inside the card.
 *
 * Exported because it is the assertion the browser acceptance run makes, and
 * the same question should be asked the same way in a unit test.
 * @param input - the rectangles and the result to check.
 * @returns true when the panel's box is inside the card.
 */
export function insideCard(input: {
  readonly card: Box
  readonly anchor: Box
  readonly result: PlacementResult
}): boolean {
  const { card, anchor, result } = input
  if (result.placement === 'unmeasured') return true
  const left = anchor.left + result.left
  const top = anchor.top + result.top
  const height = result.maxHeight ?? 0
  return left >= card.left - 0.5
    && top >= card.top - 0.5
    && left + result.width <= card.left + card.width + 0.5
    && top + height <= card.top + card.height + 0.5
}
