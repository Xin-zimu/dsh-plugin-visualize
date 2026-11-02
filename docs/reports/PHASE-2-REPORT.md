# Phase 2 report — OpenUI language core

**Date:** 2026-11-02
**Stage:** 2 (`STAGE.md`)
**Verdict:** accepted, with two recorded gaps.

## What this stage had to prove

That the openui backend can *evaluate* a program, not merely accept or reject
its syntax — and that the evaluation behaves the way the pinned upstream
implementation behaves.

## Result against the exit criteria

| Criterion | Result | Evidence |
| --- | --- | --- |
| Every one of the 73 functions exists and is callable | PASS | `tests/openui-functions.spec.ts` (64 tests); ownership table in `evidence/phase-2/function-ownership.json` |
| Every one of the 48 components exists in the signature table | PASS | `tests/openui-signatures.spec.ts`; names and order identical to upstream |
| The upstream corpus parses and evaluates with the same diagnostics | PASS | `evidence/phase-2/differential.json`: 31/31 programs, 0 differences |
| A behavioural differential shows no unexplained difference | PASS | same file, seven compared fields per case |

## The 73 / 72 question

The signature table has **73** entries; the function module implements **72**.
The difference is `@Each`, and it is not a gap:

| Owner | Count | Why |
| --- | --- | --- |
| `functions.ts` | 72 | value functions, called through `callFunction` |
| `evaluate.ts` | 1 (`@Each`) | the evaluator intercepts it *by name* before consulting the function table, because it evaluates a template once per item — something a value-only function cannot express |

Earlier notes said "70 implementations". That was **wrong**, and the error is
worth recording: a grep for `Name(args) {` misses `Now()` and `Today()`, which
take no arguments. The real count is 72. Every one of the 73 signatures now has
an owner, verified by a test rather than by eye.

Two of the 72 read the clock (`Now`, `Today`), so a program using them is not
reproducible across runs. Recorded rather than hidden, because "evaluation is
pure" is otherwise an easy claim to make and a hard one to check.

## What was fixed beyond the port

The port exposed three defects in code the fork already had:

| Id | Defect | Fix |
| --- | --- | --- |
| D8 | Parse diagnostics embedded `line N: ` inside the message and sometimes omitted the line field, so an identical error compared unequal against upstream | line is now a field on `Diagnostic`; the message carries only the problem |
| D9 | The tokenizer did the same, and added an explanatory clause upstream does not have | same fix; the extra clause removed, because a message is part of the observable contract |
| D10 | The client had its own cut-down evaluator (`Scope`) supporting only `+` | replaced with the real evaluator, so the engine that validates is the engine that draws |

D10 is the important one. Two evaluators would have drifted, and the drift would
have shown up as a card that diagnoses one way and renders another.

## Verified in a real browser

Full record: `evidence/browser-phase-2/results.json`. Run on an isolated profile
(`vizs2`), production untouched.

| Case | Verdict | Evidence |
| --- | --- | --- |
| S01 evaluated program renders | PASS | `count 3`, `item 0/1/2` are `@Count`/`@Format`/`@Each` results |
| S02 bound Slider is interactive | PASS | `disabled=false`, and it was `disabled=true` before this stage |
| S03 a control changes other components | PASS | slider 3 → 6 changed `count 3` to `count 6` and 3 rows to 6 |
| S04 replay after reload | **PARTIAL** | cards reappear with no model call, but `$state` is not persisted |

S03 is the one that matters: the loop the user asked for —

```
input -> $state -> re-evaluate -> new component tree -> UI
```

— is closed *in the browser*, not only in a test. Dragging one control changed
components it has no direct relationship with.

## Gaps, stated rather than glossed

1. **`$state` is not persisted.** A reload re-evaluates from defaults, so the
   slider returns to 3. S04 is marked PARTIAL for exactly this reason. Persisting
   card state is stage 3 work.
2. **Button actions are inert.** `@Set`, `@Reset`, `@OpenUrl` and friends parse
   and evaluate into descriptors, but nothing consumes them, so a Button draws
   and does nothing. Only inputs that write a `$variable` are wired.
3. **8 of 48 components render.** The language understands all 48; the renderer
   draws the layout, text and Slider primitives. Widening the renderer is stage 3.
4. **B05 (streaming preview) and B10 (session switching)** remain NOT VERIFIED
   from phase 1.

## A React defect the tests found

`@Each` output gave every generated sibling the same React key, because the key
was built from depth and component name only. React logged "Encountered two
children with the same key" — which in production means a moved item can reuse
the wrong DOM node. Fixed by threading the index path through the walker.

This is the kind of defect a screenshot cannot show and a passing assertion can
miss: the text was right, the identity was not.

## Numbers

| Metric | Value |
| --- | --- |
| `functions.ts` | 1652 lines, 72 implementations |
| `evaluate.ts` | 835 lines |
| `signatures.ts` | 1015 lines, 48 components / 73 functions, generated |
| Tests added | 106 (64 functions, 25 evaluate, 6 signatures, 7 render, 4 interaction) |
| Suite | 576 passed / 15 failed — failure set byte-identical to the upstream baseline |
| Differential | 31 programs, 7 fields each, 0 differences |
| `lib/index.js` | 240.42 kB |
| `lib/client.js` | 277.32 kB |

## What the next stage inherits

A language core that agrees with upstream on every program in the reference
suite, a validator and a renderer that share one engine, and a working state
loop. What it does *not* inherit is persistence, action steps, or a renderer for
40 of the 48 components.
