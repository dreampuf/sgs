import type {
  CardInstanceId,
  DispatchResult,
  DomainEvent,
  GameState,
  PlayerId
} from "../core/types";

export interface AnimationSemantic {
  type: string;
  playerIds: PlayerId[];
  cardIds: CardInstanceId[];
}

export interface AnimationSemanticResolver {
  displayCardId(
    cardId: CardInstanceId,
    materialCardIds?: CardInstanceId[]
  ): CardInstanceId | undefined;
  cardCategory(
    cardId: CardInstanceId
  ): "basic" | "trick" | "equipment" | undefined;
}

function semantic(
  type: string,
  playerIds: PlayerId[] = [],
  cardIds: CardInstanceId[] = []
): AnimationSemantic {
  return {
    type,
    playerIds: [...new Set(playerIds)],
    cardIds: [...new Set(cardIds)]
  };
}

/**
 * Pure DomainEvent -> visual intent contract.
 *
 * Browser animations may change their implementation, but a given event batch
 * must keep producing this ordered semantic sequence.
 */
export function deriveAnimationSemantics(
  result: Pick<DispatchResult, "events">,
  state: Readonly<GameState>,
  resolver: AnimationSemanticResolver
): AnimationSemantic[] {
  const semantics: AnimationSemantic[] = [];
  const drawn = new Map<PlayerId, CardInstanceId[]>();
  const changedHands = new Set<PlayerId>();
  const replacedEquipmentIds = new Set(
    result.events.flatMap((event) =>
      event.type === "EquipmentChanged" && event.replacedCardId
        ? [event.replacedCardId]
        : []
    )
  );
  for (const event of result.events) {
    if (event.type === "CardMoved") {
      if (event.from.startsWith("zone:hand:")) {
        changedHands.add(event.from.slice("zone:hand:".length));
      }
      if (event.to.startsWith("zone:hand:")) {
        changedHands.add(event.to.slice("zone:hand:".length));
      }
    }
    if (
      event.type === "CardMoved" &&
      event.reason === "draw" &&
      event.to.startsWith("zone:hand:")
    ) {
      const playerId = event.to.slice("zone:hand:".length);
      const cardId = resolver.displayCardId(event.cardId);
      if (cardId) {
        drawn.set(playerId, [...(drawn.get(playerId) ?? []), cardId]);
      }
    } else if (event.type === "CardUsed") {
      const cardId = resolver.displayCardId(
        event.cardId,
        event.materialCardIds
      );
      const definitionCardId =
        state.cards[event.cardId] !== undefined
          ? event.cardId
          : event.materialCardIds?.[0];
      if (
        cardId &&
        (
          definitionCardId === undefined ||
          resolver.cardCategory(definitionCardId) !== "equipment"
        )
      ) {
        semantics.push(semantic(
          "choice_card",
          [event.playerId, ...event.targetIds],
          [cardId]
        ));
      }
    } else if (event.type === "CardResponded") {
      const cardId = resolver.displayCardId(
        event.cardId,
        event.materialCardIds
      );
      if (cardId) {
        semantics.push(semantic(
          "response_card",
          [event.playerId],
          [cardId]
        ));
      }
    } else if (event.type === "DamageApplied") {
      semantics.push(semantic(
        "damage",
        [event.sourceId, event.targetId]
      ));
    } else if (event.type === "HpRecovered") {
      semantics.push(semantic("recover", [event.playerId]));
    } else if (event.type === "EquipmentChanged") {
      if (event.replacedCardId) {
        const replaced = resolver.displayCardId(event.replacedCardId);
        if (replaced) {
          semantics.push(semantic(
            "equip_off",
            [event.playerId],
            [replaced]
          ));
        }
      }
      const equipped = resolver.displayCardId(event.equippedCardId);
      if (equipped) {
        semantics.push(semantic(
          "equip_on",
          [event.playerId],
          [equipped]
        ));
      }
    } else if (
      event.type === "CardMoved" &&
      event.from.startsWith("zone:equipment:") &&
      !replacedEquipmentIds.has(event.cardId)
    ) {
      const cardId = resolver.displayCardId(event.cardId);
      if (cardId) {
        semantics.push(semantic(
          "equip_off",
          [event.from.slice("zone:equipment:".length)],
          [cardId]
        ));
      }
    } else if (event.type === "DelayedCardPlaced") {
      const cardId = resolver.displayCardId(event.cardId);
      if (cardId) {
        semantics.push(semantic(
          "delayed_on",
          [event.playerId],
          [cardId]
        ));
      }
    } else if (
      event.type === "CardMoved" &&
      event.from.startsWith("zone:judgment:")
    ) {
      const cardId = resolver.displayCardId(event.cardId);
      if (cardId) {
        semantics.push(semantic(
          "delayed_off",
          [event.from.slice("zone:judgment:".length)],
          [cardId]
        ));
      }
    } else if (
      event.type === "CardCancelled" &&
      event.reason === "nullification"
    ) {
      const used = [...state.eventLog].reverse().find(
        (candidate): candidate is Extract<
          DomainEvent,
          { type: "CardUsed" }
        > =>
          candidate.type === "CardUsed" &&
          candidate.cardId === event.cardId
      );
      const cardId = resolver.displayCardId(event.cardId);
      if (used) {
        semantics.push(semantic(
          "nullified",
          [used.playerId, ...used.targetIds],
          cardId ? [cardId] : []
        ));
      }
    } else if (event.type === "ChainChanged") {
      semantics.push(semantic("status_change", [event.playerId]));
    } else if (event.type === "JudgmentRevealed") {
      const cardId = resolver.displayCardId(event.judgmentCardId);
      if (cardId) {
        semantics.push(semantic(
          "judge_card",
          [event.playerId],
          [cardId]
        ));
      }
    } else if (event.type === "CardRevealed") {
      const cardId = resolver.displayCardId(event.cardId);
      if (cardId) {
        semantics.push(semantic(
          "show_card",
          [event.playerId],
          [cardId]
        ));
      }
    } else if (event.type === "PlayerDied") {
      semantics.push(semantic(
        "death",
        [
          event.playerId,
          ...(event.sourceId ? [event.sourceId] : [])
        ]
      ));
    } else if (
      event.type === "CardMoved" &&
      event.reason === "discard" &&
      event.from.startsWith("zone:hand:")
    ) {
      const cardId = resolver.displayCardId(event.cardId);
      if (cardId) {
        semantics.push(semantic(
          "discard",
          [event.from.slice("zone:hand:".length)],
          [cardId]
        ));
      }
    }
  }
  for (const [playerId, cardIds] of drawn) {
    semantics.push(semantic("get_card", [playerId], cardIds));
  }
  for (const playerId of changedHands) {
    semantics.push(semantic("sync_hand", [playerId]));
  }
  return semantics;
}
