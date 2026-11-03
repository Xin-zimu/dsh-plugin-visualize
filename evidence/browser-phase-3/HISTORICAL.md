# Historical copy — do not edit

`cdp.mjs` in this folder is **not a library**. It is the exact helper this phase's
scripts executed, kept so the evidence in this folder stays reproducible.

The authoritative helper is `evidence/lib/cdp.mjs`. It supersedes this copy, and
it carries capabilities this one lacks (and, in one case, deliberately drops one
this phase had — see `evidence/lib/parity.mjs`).

If you are about to use this file: don't. Use the canonical helper and the
parameterized probe:

```sh
node evidence/lib/probe.mjs --what=smoke
```

Manual: `docs/testing/BROWSER_HARNESS.md`. Rule: `AGENTS.md` §10.
