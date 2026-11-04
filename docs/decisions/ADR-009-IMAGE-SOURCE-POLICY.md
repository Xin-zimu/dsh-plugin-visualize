# ADR-009 — The `Image` component's source policy

- **Status:** accepted
- **Date:** 2026-11-04
- **Supersedes:** —
- **Relates to:** ADR-004 (per-backend security boundaries), ADR-008 (`Link`
  protocol policy), `AGENTS.md` §3, stage 4A-4 (`STAGE.md`)

## Context

`Image(src, alt, …)` is the **second** component whose argument is a URL the
host will fetch, and the first whose URL the host will *embed as a document
resource*. `Link` (4A-2) could navigate; `Image` loads.

The obvious move is to reuse `src/images.ts`, which already solves this problem
for the HTML backend and is well defended: magic-byte sniffing rather than
trusting the server, a bounded size, an overall timeout, a redirect cap, and a
DNS check performed **inside the socket's lookup** so a rebinding name cannot
reach loopback or cloud metadata. That module is the best asset the project has
for this hazard, so the question is not "should we reuse it" but **"can we"**.

### Why the HTML pipeline cannot simply be reused

`images.ts` is built for a genuinely different mount:

| | HTML backend | OpenUI backend |
| --- | --- | --- |
| Where the card renders | inside a **sandboxed iframe** | in the **host document** |
| What the frame CSP admits | `data:`, `blob:`, a CDN allowlist | the host's own CSP |
| How an image arrives | `<img data-viz-src>` resolved node-side at execute time, bytes stored, served back over `/api/dsh-visualize/image?id=` | a descriptor argument evaluated in the browser |
| Who can fetch | node, at execute time, with `ctx.fs` and a real DNS resolver | nobody: the renderer is a pure function of the descriptor |

The mechanism assumes three things OpenUI does not have: a node-side execute
step where bytes can be resolved and stored, an iframe whose CSP can be narrowed,
and a stored-bytes route to serve them back. The OpenUI card is a React tree in
the host document; it has no execute step to hang resolution on.

That difference is not incidental — it is exactly the reason `Link` needed
ADR-008. The same asymmetry applies here, and it is worse for images because
the browser will issue the request **whether or not** the program was legal.

### The three hazards, in order of severity

1. **Host-origin script execution via `data:` SVG.** An SVG loaded through
   `<img>` is script-inert, so this is not the direct route. But a `data:` URL
   placed in a `src` is a document resource in the **host document's** origin
   for CSP purposes, and the project should not be the thing that discovers a
   browser where that assumption fails. `Link` already refuses `data:` outright.
2. **Local resource disclosure.** `file:` and relative paths would make a card
   able to probe the reader's disk, and the *result* is observable through
   `onerror`/`onload` timing even when the bytes never render.
3. **Server-side request forgery, if the host ever fetches.** Today the renderer
   is a pure browser fetch, so this is not reachable — but a future change that
   moves resolution node-side (the obvious optimisation) would inherit it
   silently. The policy must be written so that change is a deliberate decision
   rather than a side effect.

## Decision

**An `Image` renders a real `<img>` only for an absolute `http:` or
`https:` URL. Every other `src` renders the alt text in a bordered
placeholder that names the reason.**

The rule is the same one ADR-008 established for `Link`, deliberately:

```
allow  iff  URL parses  AND  protocol ∈ { http:, https: }
```

parsed with `new URL`, never pattern-matched — the reasoning in ADR-008 §"Parsing,
not matching" applies unchanged and is not repeated here.

Rejected by construction, with no per-case exception:

| `src` | Why |
| --- | --- |
| `data:` | host-origin document resource; `Link` already refuses it |
| `blob:` | content is script-controlled; nothing in the catalogue needs it |
| `file:` | local filesystem disclosure (hazard 2) |
| `javascript:` | not an image, but it must never reach an attribute |
| protocol-relative `//host/x` | not absolute; resolves against the host origin |
| relative `figs/a.png` | meaningless without a base, and a base is a filesystem hint |
| unparseable | fails the positive test |

**Workspace paths are not supported in this batch, and that is a decision.**
A program cannot name a file on disk. A model that wants a workspace figure must
use the HTML backend, which has the node-side reader and the sandbox to make it
safe. Adding it here would require porting the whole `ctx.fs` containment
check into a browser-side renderer, which is not possible: the renderer does not
run on the node.

### What the renderer additionally guarantees

- `alt` is **required** by the signature and is rendered as the accessible name.
  A decorative image is not expressible; that is deliberate at this stage.
- `loading="lazy"` and `decoding="async"`, so a card with many images does not
  block the conversation paint.
- `referrerPolicy="no-referrer"`, so the host does not leak the console URL to
  a third-party image host.
- A failed load (`onError`) replaces the image with the same placeholder a
  refused URL gets, naming the failure. A broken image icon with no explanation
  is what stage 1 shipped for links and it was wrong then.
- Size is bounded by CSS (`maxWidth: 100%`), never by trusting the remote
  server to be reasonable.

## Consequences

- **A remote URL is still fetched by the browser**, so an attacker-chosen host in
  a program does receive a request from the reader's machine. That is inherent to
  an `https:` image in a host document and cannot be fixed here; it is the same
  exposure any web page has. What is fixed is that the scheme set is closed and
  `data:`/`file:`/`blob:` cannot be used at all.
- **No SSRF protection is claimed**, and the ADR says so rather than implying it.
  If 4A-4 or later moves resolution to the node side, that change must cite this
  ADR and add the `isPublicAddress` check `images.ts` already implements.
- **The HTML backend keeps its existing, stronger pipeline.** This ADR narrows
  the OpenUI surface; it does not touch the frame's.
- **Tests are hostile.**
  `tests/openui-media-4a4.spec.tsx` feeds `javascript:`, `data:`, `file:`,
  `//host/x` and a relative path, and asserts that **no `<img>` element** is
  produced for any of them — not merely that the attribute is absent.
