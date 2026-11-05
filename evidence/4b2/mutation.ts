// evidence/4b2/mutation.ts — see inputactions-type-probe.ts for the protocol.
// MUST FAIL with TS2339. If it compiles, `inputActions` is `any` and the
// positive probe proves nothing.
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

declare const p: ToolCallViewProps
const bad: () => void = () => p.inputActions.thisMemberIsNotOnInputActions()
export { bad }
