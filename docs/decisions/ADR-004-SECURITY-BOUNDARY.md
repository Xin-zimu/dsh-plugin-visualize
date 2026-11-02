# ADR-004 — Per-backend security boundaries, not one shared model

- **Status:** accepted
- **Date:** 2026-11-02
- **Supersedes:** —

## Context

The two backends accept fundamentally different input and must not be forced
into one security model:

- the HTML backend accepts **arbitrary model-written script**;
- the OpenUI backend accepts a **program in a closed language** that is parsed
  and evaluated against a whitelist.

A shared model would either be too weak for HTML or needlessly crippling for
OpenUI.

## Decision

Each backend keeps its own boundary, and neither may be weakened to match the
other.

| Concern | HTML backend | OpenUI backend |
| --- | --- | --- |
| Model-written JS | Allowed, inside the sandbox | Never |
| Markup | Arbitrary fragment, no document skeleton | Only whitelisted components |
| Styling | Isolated in the frame | Component styles only |
| Computation | The fragment's own JS | Whitelist function table |
| Interaction | DOM events | `$state` bindings |
| Network | CSP: `default-src 'none'`, fixed CDN allowlist | Per-component, granted case by case |

Rules that follow from this:

1. **The HTML backend keeps `iframe[sandbox="allow-scripts"]` and its CSP.** No
   relaxation to make a capability work; a capability that needs more network
   gets a component in the OpenUI backend instead.
2. **The OpenUI backend never calls `eval` or `new Function`.** A parsed AST is
   evaluated against the whitelist. A name that is not in the table is a
   diagnostic, never a fallback.
3. **Shadow DOM is not a sandbox.** It styles and scopes; it does not isolate.
   Anything model-authored that needs isolation goes in a frame.
4. **`HtmlView`-style components nest a second sandboxed frame**, with their own
   CSP, following the open-intelligent-ui pattern rather than inventing one.
5. **The image route keeps its guards**: workspace containment checked lexically
   and after symlink resolution, and DNS resolved before connect so rebinding
   cannot reach loopback, private ranges or cloud metadata.

## Consequences

- Every capability from open-intelligent-ui needs its own ADR before it ships,
  because each one widens either the network surface or the embedded-content
  surface.
- Reviewers must check the two backends against two different checklists; they
  are not interchangeable.
- A future backend inherits neither boundary by default and must declare its own
  in an ADR.

## Re-evaluate when

DSH ships a stronger shared isolation primitive (a per-plugin origin, a process
boundary) that makes the frame unnecessary. Even then, whitelist evaluation
stays.
