// evidence/4b2/negative-control.ts — see inputactions-type-probe.ts for the protocol.
// MUST typecheck clean: the @ts-expect-error is satisfied only when the
// property genuinely does not exist.
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'

declare const p: ToolCallViewProps
// @ts-expect-error — no such prop exists on ToolCallViewProps.
const nope: () => void = () => p.thisPropMustNotExistAtAll.submit()
export { nope }
