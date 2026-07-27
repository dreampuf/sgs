import { getLegalActions } from "../core/engine";
import { DISCARD_PILE, PROCESSING_ZONE, handZone } from "../core/state";
import type { ContentRegistry } from "../core/registry";
import type {
  CardInstance,
  DecisionRequest,
  GameState,
  LegalAction,
  PlayerId,
  PlayerState
} from "../core/types";

export interface ObservedPlayer
  extends Pick<PlayerState, "id" | "heroDefinitionId" | "hp" | "maxHp" | "alive"> {
  handSize: number;
}

export interface PlayerObservation {
  gameId: string;
  revision: number;
  selfId: PlayerId;
  players: ObservedPlayer[];
  ownHand: CardInstance[];
  discardPile: CardInstance[];
  processing: CardInstance[];
  currentPlayerId: PlayerId;
  phase: GameState["phase"];
  pendingDecision: DecisionRequest | null;
  legalActions: LegalAction[];
}

export function observeForPlayer(
  state: GameState,
  playerId: PlayerId,
  registry: ContentRegistry
): PlayerObservation {
  if (!state.players[playerId]) throw new Error(`unknown observer: ${playerId}`);
  const visibleCards = (cardIds: string[]): CardInstance[] =>
    cardIds.map((id) => structuredClone(state.cards[id]!));
  const pendingDecision =
    state.pendingDecision?.request.playerId === playerId
      ? structuredClone(state.pendingDecision.request)
      : null;
  const mayAct =
    pendingDecision !== null ||
    (!state.pendingDecision &&
      state.currentPlayerId === playerId &&
      state.phase !== "finished");

  return {
    gameId: state.gameId,
    revision: state.revision,
    selfId: playerId,
    players: state.turnOrder.map((id) => ({
      id,
      heroDefinitionId: state.players[id]!.heroDefinitionId,
      hp: state.players[id]!.hp,
      maxHp: state.players[id]!.maxHp,
      alive: state.players[id]!.alive,
      handSize: state.zones[handZone(id)]?.length ?? 0
    })),
    ownHand: visibleCards(state.zones[handZone(playerId)] ?? []),
    discardPile: visibleCards(state.zones[DISCARD_PILE] ?? []),
    processing: visibleCards(state.zones[PROCESSING_ZONE] ?? []),
    currentPlayerId: state.currentPlayerId,
    phase: state.phase,
    pendingDecision,
    legalActions: mayAct ? getLegalActions(state, registry) : []
  };
}

export interface GameAgent {
  chooseAction(observation: PlayerObservation): LegalAction;
}
