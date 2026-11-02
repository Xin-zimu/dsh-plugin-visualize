# openui-lang, as implemented here

Status: **partial**. This document describes what the fork accepts today. It is
not a description of upstream's full dialect; that is `8/48` and `17/73` short.
The component and function tables are the authority —
`src/backends/openui/signatures.ts` — and the skill text is generated from them,
so this file and the tables cannot drift.

## Shape

One statement per physical line. A statement never continues onto the next, so
a long array stays on one line.

```text
name = expression          // a computed value
$name = expression         // state the user can change
root = Col([...])          // the entry point the card draws
```

A statement may reference one defined later; names resolve at evaluation time.
``//`` starts a comment to end of line.

## Values and operators

```text
"text"  123  1.5  true  false  null
[a, b]  {key: value}  name  $name  Name(args)  @Name(args)
```

Operators, lowest precedence first: `?: , || , && , == != , < <= > >= ,
+ - , * / % , unary ! - , then .prop and [index]`. `+` joins text when either
side is text.

## Names are ASCII

`$total`, not `$总价`. An object key that is not a bare ASCII identifier must be
quoted:

```text
row = {"年份": 1}      // accepted
row = {年份: 1}        // error: unexpected character
```

## Arguments are positional

`Col([Text("a")], 2)` — the second argument is the gap. `Col([...], gap: 2)` is
an error, not a silent default.

## Enum arguments

A wrong enum value is a diagnostic here. Upstream fell back silently, which made
a wrong value look like a working card; this fork rejects it, because a silent
fallback is the failure mode hardest to notice and hardest to report.

## Diagnostics

Every finding is `{ code, severity, message }` with `VZO…` codes and a line in
the message. Parsing never throws: a hostile program produces diagnostics, not an
exception, because the host calls the parser outside a `try`.

## Not implemented

`evaluate` (stage 2), actions beyond the name check, `@Each` evaluation, and the
31 components / 56 functions upstream ships. Unknown names are rejected rather
than accepted-and-ignored, so a model cannot be taught a name that does nothing.
