# ADR-011 — The SVG drawing contract and its value whitelist

- **Status:** accepted
- **Date:** 2026-11-05
- **Supersedes:** —
- **Relates to:** ADR-004 (per-backend security boundaries), ADR-008 (Link
  protocol policy), ADR-009 (image source policy), ADR-010 (chart contract),
  stage 4A-5 (`STAGE.md`)

## Context

Stage 4A-5 adds ten drawing components: `Svg`, `G`, `Circle`, `Ellipse`,
`Rect`, `Line`, `Path`, `Polyline`, `Polygon`, `SvgText`. Between them
they carry six free-form string arguments — `viewBox`, `transform`, `d`,
`points`, `fill`, `stroke` — which is more raw-string surface than the other
34 components combined. Every earlier ADR in this folder decided one such
surface: ADR-008 for `Link`'s `href`, ADR-009 for `Image`'s `src`, ADR-010 for
what `Chart`'s data means. This one decides the drawing group's, once.

### Why this is a decision and not a code review

The renderer builds props from an **explicit argument table**. There is no
generic "spread the descriptor onto the element" path, and
`dangerouslySetInnerHTML` appears nowhere in `src/`. So the injection surface
is not an existing hole; it is exactly the strings this batch is about to start
handing to `createElement`. Deciding it after writing ten renderers would mean
deciding it ten times.

### What the risk actually is — stated narrowly, because over-claiming is also wrong

Three hazards are often lumped together under "SVG is dangerous". They are not
the same hazard and they do not all apply here.

1. **Resource reference.** A paint value such as `url(https://attacker/x)`, or a
   filter/mask reference, makes the **host document** issue a request. That is a
   real capability: it discloses that a card was rendered, when, and from which
   address, with no user action. It is the one hazard a whitelist genuinely
   closes.
2. **Markup and script.** SVG can carry script — `<script>`, event-handler
   attributes, `<foreignObject>`, `xlink:href="javascript:"` — **when it is
   parsed as a document**. None of those routes exists here. The model writes a
   descriptor in a closed language (ADR-004); the renderer creates elements from
   a fixed table; React sets individual attributes and never parses markup.
   **It is therefore not true that an arbitrary string in `transform` or `d`
   can execute JavaScript in this backend**, and this ADR does not claim it can.
   Saying otherwise would be a review conclusion stronger than the evidence.
3. **Cost.** An unbounded path or a six-figure point list is a rendering-cost
   denial of service that needs no attacker sophistication. Cheap to bound, so
   it is bounded.

The decision below follows from (1) and (3), and from the ordinary need for a
drawing to actually draw. It does not rest on (2).

## Decision

**Every drawing argument is validated by its own grammar and re-serialised from
the parsed values. The model's string never reaches a DOM attribute.**

### 1. Closed component set, no attribute passthrough

A drawing argument that this ADR does not describe cannot be set. There is no
`attrs`, no `style` argument, no `class`, no event handler, and no
`<use>`/`<defs>`/`<foreignObject>` in the table. Adding one is a superseding
ADR, not a patch.

### 2. Geometry is numbers, and numbers are finite and bounded

`cx`, `cy`, `r`, `rx`, `ry`, `x`, `y`, `x1`, `y1`, `x2`, `y2`,
`width`, `height`, `strokeWidth`, `opacity`, `size` are read as numbers.
A non-finite value or a non-numeric string is **not** passed through and is
**not** silently zeroed into a plausible drawing: the argument is treated as
absent, and the element records that it was refused (§7). Magnitudes are
clamped to a stated range so that a single descriptor cannot push a coordinate
into a range that breaks layout arithmetic elsewhere.

### 3. `viewBox` is four numbers, and its size must be positive

`"minX minY width height"`, separated by spaces or commas. `width` and
`height` must both be **greater than zero** — a zero-extent viewBox makes the
whole drawing collapse and renders as an apparently empty component. Anything
else is refused, and `Svg` draws a stated notice instead of an empty box
(ADR-010's rule, applied here).

### 4. `transform` is parsed as the transform grammar, then re-emitted

A whitespace- or comma-separated sequence of at most four of:

| Function | Arguments |
| --- | --- |
| `translate` | 1 or 2 numbers |
| `scale` | 1 or 2 numbers |
| `rotate` | 1 number, or 3 numbers (angle, cx, cy) |
| `skewX`, `skewY` | 1 number |
| `matrix` | 6 numbers |

The string is tokenised, each function's arity checked, each number checked for
finiteness and clamped, and the attribute is then rebuilt from those numbers.
A token that is not one of the six names, a wrong arity, a leftover, or a fifth
function refuses the whole argument: the group draws **untransformed** and is
marked. Partial application of a malformed transform would draw something the
author did not ask for.

### 5. `d` and `points` are parsed as path and point-list grammars

`d` must begin with a move command and then contain only the SVG path commands
(`M m L l H h V v C c S s Q q T t A a Z z`) and numbers, with commas and
whitespace as separators. The whole string must be consumed; a trailing
fragment refuses the argument. `points` is a list of at least one and at most
256 coordinate pairs.

Both are re-serialised from the parsed numbers. This is not cosmetic: it means
the DOM receives a string this file constructed, so a limit on the number of
tokens is a limit on the attribute's length, and there is no way to smuggle a
second declaration into it.

### 6. Paint is an enumerated set of forms, and `url(` is refused

`fill` and `stroke` accept, and only accept:

- a language colour token (`ink`, `muted`, `info`, `success`, `warning`,
  `danger`, `purple`, `pink`), resolved through the same `COLOR_VARS` bridge
  the other 34 components use;
- `none`, `currentColor`, `transparent`;
- a hex colour, 3, 6 or 8 digits;
- a bare CSS colour word: letters only, which cannot reference anything;
- `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)` containing only numbers,
  commas, dots, spaces, percent signs and slashes.

Anything containing `url`, `var`, `image`, `element`, `(` outside those four
function names, a backslash, a semicolon or a quote is refused. `url(` in
particular is the whole of hazard (1) and its absence is the point.

The language may **not** author a `var(--…)` reference itself; the renderer
does that on the model's behalf from the named token, so the set of custom
properties a card can reach stays the one this file knows.

### 7. Colour is applied through `style`, geometry through attributes

`fill` and `stroke` are set as CSS declarations in the element's `style`
object, not as SVG presentation attributes.

This is a correctness decision, not a stylistic one. A presentation attribute
is parsed as a CSS value only at the lowest priority, and support for
`var()` inside one is not consistent across engines — the failure mode is a
silently unresolved paint, i.e. a black shape on a dark background that no unit
test can see. The project has already paid for this class of defect once, when
every `var(--…)` in the card was invalid at computed-value time and the Button
lost its background while 62 assertions passed (stage 1.3). Colour therefore
goes where CSS custom properties are unambiguously supported: the `style`
object, which is what the rest of the component table already uses.

### 8. Defaults are theme-correct, because SVG's own defaults are not

SVG fills black unless told otherwise, and a black shape inside a dark card is
invisible — indistinguishable from a component that failed to draw. So:

| Element | Default fill | Default stroke |
| --- | --- | --- |
| `Circle`, `Ellipse`, `Rect`, `Polygon` | `currentColor` | none |
| `Line`, `Polyline`, `Path` | none | `currentColor` |

`currentColor` resolves to the card's `--foreground`, so a drawing is legible
in both schemes without the author naming a colour.

### 9. Text is a text node

`SvgText`'s `text` argument becomes a React **text child**. It is never
markup: React escapes it on the way in, and there is no `innerHTML` route. That
is the same guarantee the rest of the catalogue has, extended to a new element
type rather than re-argued for it.

### 10. A refused value is marked, not drawn — the one deliberate exception

Elsewhere in this catalogue a refusal produces **visible text** (ADR-009 for a
refused image, ADR-010 for refused chart data, `UNRENDERED_STYLE` in 4A-1).
Inside an `Svg`, drawing a notice would corrupt the drawing the author did ask
for and would be positioned in the drawing's own coordinate space.

So a refused drawing argument is dropped and recorded structurally, as
`data-openui-svg-refused="<argument name>"` on the affected element, and the
rest of the drawing renders. The exception is narrow and it is stated here so
that a later reader does not mistake the marker for a debugging leftover: the
`Svg` root is the one place where a visible notice is possible, and it uses one
— an unreadable `viewBox` states its reason in text, because in that case there
is no drawing left to protect.

### 11. Explicitly out of scope

No `<use>`, `<defs>`, gradients, patterns, filters, masks, clip paths,
external references, SMIL or CSS animation, `<foreignObject>`, event handlers,
`id`/`class`, or any attribute not listed above. Each would need its own
decision; none is needed for "a program can draw a diagram".

## Consequences

- **Ten renderers share one validator module.** The grammars live in one place
  with the component table, so a fix to the path parser is a fix to `Path` and
  to nothing else by accident.
- **Tests are structural.** A refused `transform` is asserted as *the marker is
  present and the element has no transform attribute*, and a valid one as *the
  attribute equals the re-serialised form this file would produce*, which is a
  check on the parser rather than on the model's string.
- **The 48-component inventory is unaffected**: this ADR adds no signature and
  removes no name. `signatures.ts` is the contract (ADR-002) and stays as it is.
- **A drawing still cannot execute anything** — but the reason is recorded as
  *the closed component table and React's attribute-by-attribute setting*, not
  as *we filtered the strings*. A future change that introduces markup parsing
  would invalidate this ADR, and the sentence above is where a reviewer will
  notice.
