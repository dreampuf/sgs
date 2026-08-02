import { getLegalActions } from "../core/engine";
import {
  DISCARD_PILE,
  PROCESSING_ZONE,
  equipmentZone,
  handZone
} from "../core/state";
import type { ContentRegistry } from "../core/registry";
import type {
  CardInstance,
  DecisionRequest,
  GameState,
  Identity,
  LegalAction,
  PlayerId,
  PlayerState
} from "../core/types";

export interface ObservedPlayer
  extends Pick<PlayerState, "id" | "heroDefinitionId" | "hp" | "maxHp" | "alive"> {
  handSize: number;
  identity: Identity | null;
  /** Public table state used by tactical evaluators. */
  chained?: boolean;
  faceUp?: boolean;
  equipment?: CardInstance[];
  judgment?: CardInstance[];
}

export type PlayerBehaviorEvent =
  | {
      sequence: number;
      type: "damage";
      sourceId: PlayerId;
      targetId: PlayerId;
      amount: number;
    }
  | {
      sequence: number;
      type: "recover";
      sourceId?: PlayerId;
      targetId: PlayerId;
      amount: number;
    };

export interface PlayerObservation {
  gameId: string;
  revision: number;
  selfId: PlayerId;
  selfIdentity: Identity | null;
  players: ObservedPlayer[];
  ownHand: CardInstance[];
  ownEquipment?: CardInstance[];
  ownHandLimit?: number;
  discardPile: CardInstance[];
  processing: CardInstance[];
  currentPlayerId: PlayerId;
  phase: GameState["phase"];
  ownTurnUsage?: Record<string, number>;
  pendingDecision: DecisionRequest | null;
  pendingResponseContext: {
    sourceId: PlayerId;
    targetId: PlayerId;
    cardDefinitionId: string;
    negated: boolean;
  } | null;
  pendingRescueTargetId?: PlayerId;
  pendingGuhuoSourceId?: PlayerId;
  guhuoHistory?: Array<{
    sourceId: PlayerId;
    truthful: boolean;
  }>;
  legalActions: LegalAction[];
  behaviorHistory: PlayerBehaviorEvent[];
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
  const nullification = state.pendingDecision?.continuation.type ===
      "nullification"
    ? state.pendingDecision.continuation
    : null;
  const usedCard = nullification
    ? [...state.eventLog].reverse().find(
        (event) =>
          event.type === "CardUsed" &&
          event.cardId === nullification.cardId
      )
    : undefined;
  const fallbackTargetId = usedCard?.type === "CardUsed"
    ? usedCard.targetIds[0] ?? nullification?.sourceId
    : nullification?.sourceId;
  const pendingResponseContext =
    pendingDecision?.type === "respond-card" &&
    pendingDecision.responseKind === "nullification" &&
    nullification &&
    fallbackTargetId
      ? {
          sourceId: nullification.sourceId,
          targetId: nullification.targetId ?? fallbackTargetId,
          cardDefinitionId:
            state.cards[nullification.cardId]?.definitionId ??
            "unknown:card",
          negated: nullification.negated
        }
      : null;
  const pendingRescueTargetId =
    pendingDecision?.type === "respond-card" &&
    pendingDecision.responseKind === "peach" &&
    state.pendingDecision?.continuation.type === "rescue"
      ? state.pendingDecision.continuation.playerId
      : undefined;
  const pendingGuhuoSourceId =
    pendingDecision?.type === "choose-option" &&
    pendingDecision.reason === "guhuo-question" &&
    state.pendingDecision?.continuation.type === "workflow"
      ? state.pendingDecision.continuation.resume.context.sourceId
      : undefined;
  const guhuoHistory = state.eventLog.flatMap((event, eventIndex) => {
    if (event.type !== "CardRevealed" || event.reason !== "guhuo") return [];
    const declaration = state.eventLog
      .slice(0, eventIndex)
      .reverse()
      .find((candidate) =>
        (candidate.type === "CardUsed" ||
          candidate.type === "CardResponded") &&
        candidate.skillId === "wind:skill:蛊惑" &&
        candidate.materialCardIds?.includes(event.cardId)
      );
    if (
      !declaration ||
      (declaration.type !== "CardUsed" &&
        declaration.type !== "CardResponded")
    ) return [];
    return [{
      sourceId: declaration.playerId,
      truthful:
        state.cards[declaration.cardId]?.definitionId ===
        state.cards[event.cardId]?.definitionId
    }];
  }).slice(-32);
  const ownEquipment = visibleCards(
    state.zones[equipmentZone(playerId)] ?? []
  );
  const ownTurnUsage = structuredClone(state.turnUsage[playerId] ?? {});

  return {
    gameId: state.gameId,
    revision: state.revision,
    selfId: playerId,
    selfIdentity: state.players[playerId]!.identity ?? null,
    players: state.turnOrder.map((id) => ({
      id,
      heroDefinitionId: state.players[id]!.heroDefinitionId,
      hp: state.players[id]!.hp,
      maxHp: state.players[id]!.maxHp,
      alive: state.players[id]!.alive,
      handSize: state.zones[handZone(id)]?.length ?? 0,
      chained: state.players[id]!.marks.chained === true,
      faceUp: state.players[id]!.faceUp,
      equipment: visibleCards(state.zones[equipmentZone(id)] ?? []),
      judgment: visibleCards(state.zones[`zone:judgment:${id}`] ?? []),
      identity:
        id === playerId ||
          state.players[id]!.identity === "lord" ||
          !state.players[id]!.alive
          ? state.players[id]!.identity ?? null
          : null
    })),
    ownHand: visibleCards(state.zones[handZone(playerId)] ?? []),
    ...(ownEquipment.length > 0 ? { ownEquipment } : {}),
    ownHandLimit: registry.handLimit(state, playerId),
    discardPile: visibleCards(state.zones[DISCARD_PILE] ?? []),
    processing: visibleCards(state.zones[PROCESSING_ZONE] ?? []),
    currentPlayerId: state.currentPlayerId,
    phase: state.phase,
    ...(Object.keys(ownTurnUsage).length > 0 ? { ownTurnUsage } : {}),
    pendingDecision,
    pendingResponseContext,
    ...(pendingRescueTargetId ? { pendingRescueTargetId } : {}),
    ...(pendingGuhuoSourceId ? { pendingGuhuoSourceId } : {}),
    ...(guhuoHistory.length > 0 ? { guhuoHistory } : {}),
    legalActions: mayAct ? getLegalActions(state, registry) : [],
    behaviorHistory: state.eventLog
      .flatMap((event): PlayerBehaviorEvent[] => {
        if (event.type === "DamageApplied") {
          return [{
            sequence: event.sequence,
            type: "damage",
            sourceId: event.sourceId,
            targetId: event.targetId,
            amount: event.amount
          }];
        }
        if (event.type === "HpRecovered") {
          return [{
            sequence: event.sequence,
            type: "recover",
            ...(event.sourceId ? { sourceId: event.sourceId } : {}),
            targetId: event.playerId,
            amount: event.amount
          }];
        }
        return [];
      })
      .slice(-128)
  };
}

export interface GameAgent {
  chooseAction(observation: PlayerObservation): LegalAction;
}
