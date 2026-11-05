#!/usr/bin/env node
/**
 * evidence/4b2/inputactions-type-probe.ts — LEAD's independent check of the
 * single most load-bearing claim in the @ToAssistant investigation: that the
 * plugin's own card ALREADY receives `inputActions` (with .submit()) as a prop.
 *
 * Run with:  npx tsc -p tmp/probes/tsconfig.probe.json
 *
 * Three files are needed, and the *controls* are the point (AGENTS.md §6: a
 * guard never seen to go red is a guess):
 *
 *   1. inputactions-type-probe.ts  — MUST typecheck clean.
 *        p.inputActions.submit() is well typed on ToolCallViewProps.
 *   2. negative-control.ts         — MUST typecheck clean.
 *        @ts-expect-error on a property that cannot exist. Clean output means
 *        the expect-error WAS satisfied, i.e. the probe can tell present from
 *        absent. If the control ever reports "unused @ts-expect-error", the
 *        probe has stopped discriminating and must be fixed before it is trusted.
 *   3. mutation.ts                 — MUST FAIL with TS2339.
 *        A misspelt member on inputActions. If this passes, `inputActions` is
 *        `any` (an unresolved module, say) and test 1 proves nothing.
 *
 * Result when run 2026-11-05 against @deepseek-ai/dsh-client-ui-tool 0.2.1-rc.5:
 *   1 clean (exit 0) | 2 clean (exit 0) | 3 TS2339 "Property
 *   'thisMemberIsNotOnInputActions' does not exist on type 'InputActions'."
 *   => ToolCallViewProps.inputActions is strongly typed as InputActions, and
 *      InputActions.submit(): void is on it.
 *
 * This is a TYPE claim. It does not prove the runtime value is present — that
 * needs one G0/G3-gated browser run (see the report's next-steps section).
 */
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

declare const p: ToolCallViewProps
const submit: () => void = () => p.inputActions.submit()
export { submit }
