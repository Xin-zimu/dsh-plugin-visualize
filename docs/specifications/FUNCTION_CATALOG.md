# Function catalog

The openui backend's `@function` table, mirrored from
`src/backends/openui/signatures.ts`. **17 of 73.**

| Function | Signature | Behaviour |
| --- | --- | --- |
| `@Count` | `@Count(list)` | Item count, 0 for null |
| `@Sum` | `@Sum(nums)` | Total, skipping null and blank |
| `@Avg` | `@Avg(nums)` | Mean, 0 when empty |
| `@Min` | `@Min(nums)` | Smallest, null when empty |
| `@Max` | `@Max(nums)` | Largest, null when empty |
| `@Round` | `@Round(num, dec?)` | Round to N places |
| `@Abs` | `@Abs(num)` | Absolute value |
| `@Floor` | `@Floor(num)` | Round down |
| `@Ceil` | `@Ceil(num)` | Round up |
| `@Clamp` | `@Clamp(num, min, max)` | Constrain to a range |
| `@Format` | `@Format(value, kind?, dec?)` | `kind`: number \| currency \| percent \| compact |
| `@Join` | `@Join(list, sep?)` | Join into one string |
| `@Each` | `@Each(list, "name", template)` | Map a list to rows |
| `@Range` | `@Range(start, end, step?)` | List of numbers |
| `@Toggle` | `@Toggle(list, item)` | Add or remove an item |
| `@Includes` | `@Includes(list, item)` | Membership test |
| `@Default` | `@Default(value, fallback)` | Fallback when null |

## Action steps

`@Set`, `@Reset`, `@OpenUrl`, `@CopyToClipboard`, `@ToAssistant`, `@Action` —
recognised as Button actions. Evaluating them is stage 2/3 work.

## Format conventions to keep in mind

`@Format(x, "percent")` and `@Percent` take **0–100** units (`45` → "45%"),
while a Chart's `format: "percent"` expects a **fraction** (`0.45` → 45%).
Upstream documents this trap; it is carried here deliberately rather than
silently unified.
