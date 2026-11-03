# ADR-008 — The `Link` component's protocol policy

- **Status:** accepted
- **Date:** 2026-11-03
- **Supersedes:** —
- **Relates to:** ADR-004 (per-backend security boundaries), ADR-002 (one
  backend table), stage 4A-2 (`STAGE.md`), `docs/testing/ACCEPTANCE_CRITERIA.md`

## Context

`Link` is the first component in the catalogue whose output is a **URL the
reader can activate**. Every component before it renders text, layout or a
`$state` binding; none of them could navigate the host document.

That makes this a security decision sitting inside a rendering batch, and the
project's rules say so twice: ADR-004 requires each capability to declare its
own boundary, and `AGENTS.md` §3 forbids improvising a security boundary per
backend. So the policy is decided here, once, before the renderer is written.

### What the risk actually is

The model authors the `url` argument. In this backend the model writes a
program in a closed language, not markup, so the usual HTML-injection route is
already closed: a descriptor can only name a component in the table. The
remaining question is narrower and real — **what may an activated `href` do?**

Three concrete hazards, in order of severity:

1. **Script execution in the host origin.** `javascript:` and `vbscript:` URLs
   execute in the document that owns the anchor. The OpenUI card is mounted in
   the **host document**, not in the HTML backend's sandboxed iframe, so this
   would run in the DSH host's own origin. That is the single worst outcome
   available to this component and it is the reason this ADR exists.
2. **Origin-scoped data disclosure.** `data:` documents inherit a unique opaque
   origin, so they cannot read host storage — but they render attacker-chosen
   content in a new tab under a plausible-looking link, which is a phishing
   surface rather than an execution one.
3. **Local resource access.** `file:` URLs would let a card open arbitrary local
   paths. In a desktop host that is a real capability, not a theoretical one.

## Decision

**A `Link` renders a real `<a>` only for an absolute `http:` or `https:` URL.
Every other target renders as plain text.**

The allowlist is positive and closed. The rule is:

```
allow  iff  URL parses  AND  protocol ∈ { http:, https: }
```

with the URL **parsed**, not string-matched. Anything that fails either test
renders the link's label as ordinary text, with no `href`, no `target` and no
`onClick` — the component degrades to the text it would have shown anyway.

Rejected by construction, with no per-case exception:

| Target | Why |
| --- | --- |
| `javascript:` | executes in the host origin (hazard 1) |
| `vbscript:` | same |
| `data:` | renders attacker-chosen content under a trusted-looking link (hazard 2) |
| `file:` | local filesystem access (hazard 3) |
| `blob:` | content is script-controlled; no reason a card needs it |
| protocol-relative `//host/x` | not absolute; resolves against the host origin |
| bare relative `docs/x`, `#anchor` | not absolute; meaningless inside a card |
| `mailto:` / `tel:` | **deliberately excluded** — see below |
| anything unparseable | fails the positive test |

An allowed anchor is created with `rel="noreferrer noopener"` and
`target="_blank"`, so the opened page cannot reach back through
`window.opener`.

### Parsing, not matching

The implementation must call `new URL(url)` and compare `url.protocol`. A
regex is not acceptable however carefully written, for a reason this project has
already paid for: a regex tests the *shape* of the string while the browser
tests what it will actually do. `java\nscript:` and ` JavaScript:` are cases
where the two disagree, and the disagreement always resolves in the attacker's
favour. The renderer's guard is asserted by tests that feed hostile values, not
by the regex's apparent strictness.

## Why this diverges from upstream, deliberately

`upstream/dsh-intelligent-ui` uses a regex (`layout-text.js`,
`iuiLtAnchor`):

```js
const safe = /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(href)
```

Measured against real inputs, that predicate **allows** `mailto:`, `tel:`,
root-relative `/path`, fragment `#anchor` and — importantly — protocol-relative
`//evil.example.com/x`. It denies `javascript:`, `data:` and `file:`.

So the fork is **stricter than upstream**, and the difference is recorded here
rather than made quietly (`AGENTS.md` §4). Two reasons:

1. **Protocol-relative URLs are allowed upstream and are a genuine hazard in
   this host.** `//evil.example.com/x` is not a relative path; it is a full URL
   to another origin that merely borrows the scheme. In the upstream browser
   context that resolves to `https:` and looks harmless; the fork cannot rely on
   the surrounding page's scheme, and an allowlist that admits a value it cannot
   classify is not an allowlist. This is the one case where upstream's predicate
   is not merely loose but wrong.
2. **`mailto:`/`tel:` are useless in a card and cost handlers.** They invoke
   external OS handlers. Nothing in the catalogue needs them, so they are out.
   If a future component genuinely needs one, it gets its own decision — not an
   inherited regex.

`/path` and `#anchor` are dropped for a different, non-security reason: the
OpenUI card is not a document, has no base URL of its own, and has nothing to
link to relatively. Rendering them as plain text is honest about that.

**This does not widen the fork's surface relative to upstream.** Every target
the fork refuses, upstream also refuses, except the five named above — all of
which the fork refuses and upstream allows. The set is a strict subset.

## Consequences

1. The renderer contains one function with the policy, and `Link` is its only
   caller. There is no second place where a URL becomes an `href`, so a future
   component that wants one must route through the same function or amend this
   ADR.
2. `docs/specifications/COMPONENT_CATALOG.md` documents `Link`'s actual
   behaviour, not upstream's looser one.
3. The negative cases are **unit-testable without a browser**, and must be: the
   test feeds `javascript:alert(1)`, `JavaScript:alert(1)`, `data:text/html,…`,
   `file:///C:/Windows`, `//evil.example.com`, `vbscript:` and a malformed
   string, and asserts that no `href` appears in the rendered markup.
4. A card may show a link that does nothing. That is the intended degradation
   and it is visible: the label is still drawn, in ordinary text. Drawing
   nothing at all would be the failure mode this project already named — an
   absent element that looks like an intentional blank.
5. This ADR covers **only** `Link`. It does not authorise `@OpenUrl`, which
   remains refused by name in `UNSUPPORTED_STEPS` and needs its own review in
   stage 4B. A component that renders an anchor and an action that opens a URL
   are different capabilities with different surfaces: the first requires a
   user click on a visible, labelled element; the second is a program step.

## Re-evaluate when

The OpenUI card is mounted somewhere other than the host document, or DSH ships
a per-plugin origin boundary (ADR-004's re-evaluate condition). Neither of those
makes `javascript:` acceptable; they change which hazards the other schemes
carry. The positive-list shape should survive both.
