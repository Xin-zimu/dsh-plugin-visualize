/**
 * A turn's settled visualizations, shown again under its final answer.
 *
 * From dsh 0.1.2 the Web chat folds a finished turn's process — every tool
 * row, visualize cards included — behind its duration summary whenever the
 * reader's work-details mode folds (the default). A visualization is the
 * turn's output rather than its process, so this re-shows the turn's cards on
 * the turn tail, the seat the host's own deliverables use for the same
 * reason. The toolview card stays inside the fold as the call's own record.
 *
 * The cards come from a state-only Conversation Definition that collects each
 * successful `visualize` result's persisted meta per turn; nothing here reads
 * the session log directly or imports host runtime code.
 */

import type { CSSProperties } from 'react'
import type {
  ConversationLocationData, ConversationNodeDefinition, TurnLocation,
} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { HostObservable, InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `conversation.chat.turnTail` SlotMap declaration.
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import { visualizeMetaFrom, type VisualizeMeta } from '../fragment.ts'
import { Frame, type VisualizePromptInjected } from './VisualizeCard.tsx'
import { cardStateKey } from './card-state.ts'

/** Definition kind and Turn data key; namespaced by package to stay unique. */
export const TURN_CARDS_KEY = 'dsh-visualize'

/** One settled card, keyed by the call that produced it. */
export interface TurnCard {
  readonly callId: string
  readonly seq: number
  readonly meta: VisualizeMeta
}

/** Per-turn value published on the Turn Location. */
export interface VisualizeTurnData {
  readonly cards: readonly TurnCard[]
}

declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
  interface ConversationTurnDataMap {
    /** Settled visualize cards of this Turn, one per card path. */
    'dsh-visualize': VisualizeTurnData
  }
}

interface TurnCardsState extends VisualizeTurnData {
  readonly turn: number
}

/** The slice of a `tool/result` event this Definition reads. */
interface ToolResultData {
  readonly turn: number
  readonly meta?: unknown
  readonly message: { readonly isError?: boolean; readonly source: { readonly callId: unknown } }
}

/** The slice of a `tool/call` event used to attribute nested dispatches. */
interface ToolCallData {
  readonly turn: number
  readonly callId: unknown
}

/**
 * The slice of a `tool/ptc-dispatch` event this Definition reads. A programmatic
 * tool call (one `run_code` makes through the SDK) is logged here rather than as
 * a `tool/result`, carries the same `meta`, and names itself by `subCallId`.
 * It counts no `turn` of its own: the enclosing call's turn is the one it lands in.
 */
interface PtcDispatchData {
  readonly rootCallId: unknown
  readonly parentCallId: unknown
  readonly subCallId: unknown
  readonly name?: unknown
  readonly isError?: boolean
  readonly meta?: unknown
}

/**
 * Turn of each enclosing tool call, keyed by its call id. A nested dispatch only
 * names `rootCallId`, so this is what attributes it to a turn; events replay in
 * log order, so the enclosing `tool/call` is always seen first.
 */
const enclosingTurns = new Map<string, number>()

/**
 * Accept a successful root `visualize` result. The persisted meta names its
 * own kind, so no call-to-name bookkeeping is needed.
 * @param data - `tool/result` payload.
 * @returns the card descriptor, or undefined when unrelated or failed.
 */
function resultMeta(data: ToolResultData): VisualizeMeta | undefined {
  return data.message.isError === true ? undefined : visualizeMetaFrom(data.meta)
}

/** One settled card found in an event, with the call that produced it. */
interface SettledCard {
  readonly turn: number
  readonly callId: string
  readonly meta: VisualizeMeta
}

/**
 * Read a card out of whichever event carries one.
 *
 * A root `visualize` call settles as `tool/result`; the same call made through
 * the SDK inside `run_code` settles as `tool/ptc-dispatch`. Both carry the same
 * persisted meta, so both are collected — otherwise a card drawn from a program
 * would render in the fold and never reappear under the answer.
 * @param event - one session event of any type.
 * @returns the card, or undefined when the event carries none.
 */
function settledCard(event: { readonly type: string; readonly data?: unknown }): SettledCard | undefined {
  if (event.type === 'tool/result') {
    const data = event.data as ToolResultData
    const meta = resultMeta(data)
    const turn = data.turn
    return meta === undefined || turn === undefined
      ? undefined
      : { turn, callId: String(data.message.source.callId), meta }
  }
  if (event.type === 'tool/ptc-dispatch') {
    const data = event.data as PtcDispatchData
    if (data.isError === true) return undefined
    const meta = visualizeMetaFrom(data.meta)
    if (meta === undefined) return undefined
    const turn = enclosingTurns.get(String(data.rootCallId)) ?? enclosingTurns.get(String(data.parentCallId))
    return turn === undefined ? undefined : { turn, callId: String(data.subCallId), meta }
  }
  return undefined
}

/**
 * Fold one result into the turn's cards. A repeated call id (a later surface
 * replacement of the same result) keeps the first; a later card at an existing
 * path (an `update` patch) replaces that card in place, so a corrected card is
 * shown once, in its original position.
 * @param cards - cards so far.
 * @param card - the incoming card.
 * @returns the next card list, or the same list when unchanged.
 */
/** Test hook: forget every recorded enclosing-call turn. */
export function resetEnclosingTurns(): void {
  enclosingTurns.clear()
}

export function foldCard(cards: readonly TurnCard[], card: TurnCard): readonly TurnCard[] {
  if (cards.some(existing => existing.callId === card.callId)) return cards
  const index = cards.findIndex(existing => existing.meta.path === card.meta.path)
  if (index === -1) return [...cards, card]
  return cards.map((existing, at) => at === index ? card : existing)
}

/** Turn-local visualize accumulator; it publishes Turn data and no view Node. */
export const turnCardsDefinition: ConversationNodeDefinition<TurnCardsState> = {
  kind: TURN_CARDS_KEY,
  match: (event) => {
    if (event.type === 'turn/start') return { id: String(event.data.turn), role: 'start' }
    // Remember which turn encloses a call, so a nested dispatch can be attributed.
    if (event.type === 'tool/call') {
      const data = event.data as ToolCallData
      if (data.turn !== undefined && data.callId !== undefined) enclosingTurns.set(String(data.callId), data.turn)
      return null
    }
    const card = settledCard(event)
    return card === undefined ? null : { id: String(card.turn), role: 'update' }
  },
  start: (_context, match) => {
    if (match.event.type !== 'turn/start') throw new Error('dsh-visualize: turn cards start requires turn/start')
    return { turn: match.event.data.turn, cards: [] }
  },
  update: (context, match) => {
    const card = settledCard(match.event)
    if (card === undefined) return context.state
    const cards = foldCard(context.state.cards, {
      callId: card.callId,
      seq: match.event.seq,
      meta: card.meta,
    })
    return cards === context.state.cards ? context.state : { ...context.state, cards }
  },
  buildLocationData: (context, scope, previous) => {
    if (scope !== 'turn' || context.state === undefined) return null
    const { turn, cards } = context.state
    if (previous?.kind === 'turn' && previous.turn === turn && previous.key === TURN_CARDS_KEY
      && previous.value.cards === cards) return previous
    return { kind: 'turn', turn, key: TURN_CARDS_KEY, value: { cards } } satisfies ConversationLocationData
  },
}

/**
 * The cards settled before the turn's closing reply.
 * @param turn - the closing turn; older hosts may omit its data store.
 * @param seq - the closing assistant message's sequence number.
 * @returns the cards to show, possibly empty.
 */
export function cardsBefore(turn: TurnLocation | undefined, seq: number): readonly TurnCard[] {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- older hosts lack the data store
  const cards = turn?.data?.get(TURN_CARDS_KEY)?.cards ?? []
  return cards.filter(card => card.seq < seq)
}

/**
 * Chain selector for dsh 0.1.5 and earlier, whose turn tail elects one entry.
 * @param owner - the turn-tail owner currency.
 * @returns the cards as the match, or null to decline this turn.
 */
export function selectTurnCards(owner: { turn?: TurnLocation; seq: number }): readonly TurnCard[] | null {
  const cards = cardsBefore(owner.turn, owner.seq)
  return cards.length === 0 ? null : cards
}

/** Folding observable injected by the registration. */
export type TurnCardsInjected = InjectFace<{ readonly hooks: { readonly visualizeFolds: HostObservable<boolean> } }>
  & VisualizePromptInjected

/** A grid track sized `minmax(0, 1fr)`: an `auto` track would grow to a card's min-content. */
const listStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 12,
  margin: '8px 0 4px',
  minWidth: 0,
}

/**
 * Turn-tail entry. A list turn tail mounts it on every turn, so it declines
 * turns without cards itself, and it stays empty whenever the host is not
 * folding — the toolview card is then already in view.
 * @param props - turn owner props plus the injected folding selector.
 * @returns the turn's cards, or null.
 */
export function TurnCards({ turn, seq, useVisualizeFolds, visualizePrompt, visualizeSession }: PropsRuntime<'conversation.chat.turnTail'> & TurnCardsInjected) {
  const folds = useVisualizeFolds(value => value)
  const cards = cardsBefore(turn, seq)
  if (!folds || cards.length === 0) return null
  return (
    <div style={listStyle}>
      {cards.map(card => (
        // A distinct height token: the toolview frame for the same call may be
        // mounted too (an opened fold) and reports under the bare call id. Both
        // share the card's saved state.
        <Frame
          key={card.callId}
          meta={card.meta}
          callId={`turn-tail:${card.callId}`}
          prompt={visualizePrompt}
          stateKey={cardStateKey(visualizeSession, card.meta.path, card.callId)}
        />
      ))}
    </div>
  )
}