# Test plan

## The baseline, and why it is red

On Windows the inherited suite has **15 pre-existing failures out of 441**. They
are not caused by this fork: the same 15 fail, byte for byte, in the pristine
`upstream/dsh-visualize` clone. Evidence:
`evidence/phase-1/failures-test-upstream-baseline.txt`.

Two root causes:

1. **CRLF.** Assertions compare generated files and README quotes against
   strings containing `\n`; a Windows checkout produces `\r\n`.
2. **Symlinks.** Several tests create symlinks to prove the sandbox refuses
   escapes; the runner lacks `SeCreateSymbolicLinkPrivilege`, so they error
   before asserting anything.

The upstream CI runs on `ubuntu-latest` only, which is why this is invisible
upstream.

**The rule:** the fork's failure set must stay *identical* to the baseline's.
A new failure is a regression; a "fixed" baseline failure must be called out
in `session-log.md`.

## Current result

| Suite | Result | Evidence |
| --- | --- | --- |
| fork | 455 passed / 15 failed / 470 | `evidence/phase-1/test-fork.txt` |
| upstream | 426 passed / 15 failed / 441 | `evidence/phase-1/test-upstream-baseline.txt` |
| delta | +29 passed, +0 failed | `evidence/phase-1/failures-*.txt` (sha256 equal) |

## Layers

| Layer | What it proves | Command |
| --- | --- | --- |
| Contract | The vocabulary, the registry, the router, both validators | `npx vitest run tests/core.spec.ts` |
| Language | Parse, evaluate, operators, diagnostics | `npx vitest run tests/lang*.spec.ts` (stage 2) |
| Components | Each component renders | per-component specs (stage 3) |
| Security (HTML) | CSP, frame sandbox, network blocked | `tests/shell.spec.ts`, `tests/frame-*.spec.tsx` |
| Security (OpenUI) | Unknown names rejected, no `eval` | `tests/core.spec.ts` + a source audit in stage 5 |
| Session | Reload, replay, fork | `tests/turn-cards.spec.tsx`, `tests/storage.spec.ts` |
| Compatibility | Legacy metas and legacy calls | `tests/core.spec.ts` (descriptorFrom), `tests/tool.spec.ts` |
| Integration | Both backends in one session | stage 3 |

## Evidence discipline

Every row that claims PASS needs a file, a command and a date. Use
`evidence/<phase>/<name>.txt`; for anything a reviewer must be able to re-run,
add a `MANIFEST.json` recording the command and the sha256 of the output.

A claim without evidence is written as *implemented*, never *verified*. See
`AGENTS.md` §5.
