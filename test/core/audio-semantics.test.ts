import { describe, expect, test } from "vitest";
import type {
  DispatchResult,
  DomainEvent,
  GameState
} from "../../src/core/types";
import {
  deriveAudioCues
} from "../../src/browser/audio-semantics";

function event<T extends Omit<DomainEvent, "sequence" | "revision">>(
  value: T,
  sequence: number
): DomainEvent {
  return {
    ...value,
    sequence,
    revision: 4
  } as unknown as DomainEvent;
}

const state = {
  cards: {
    slash: { id: "slash", definitionId: "standard:slash" },
    armor: { id: "armor", definitionId: "standard:eight-diagram" },
    virtual: { id: "virtual", definitionId: "standard:fire-slash" }
  }
} as unknown as GameState;

const resolver = {
  cardDefinitionId: (
    cardId: string,
    materialCardIds: string[] | undefined
  ) => state.cards[cardId]?.definitionId ??
    materialCardIds?.map((id) => state.cards[id]?.definitionId)
      .find((id) => id !== undefined),
  cardCategory: (
    cardId: string,
    materialCardIds: string[] | undefined
  ) => {
    const id = resolver.cardDefinitionId(cardId, materialCardIds);
    return id === "standard:eight-diagram" ? "equipment" as const :
      "basic" as const;
  }
};

describe("audio semantic sequence", () => {
  test("maps card, damage and judgment events in deterministic order", () => {
    const events = [
      event({
        type: "CardUsed",
        playerId: "p1",
        cardId: "slash",
        targetIds: ["p2"]
      }, 10),
      event({
        type: "DamageApplied",
        sourceId: "p1",
        targetId: "p2",
        amount: 1,
        cardId: "slash",
        nature: "normal"
      }, 11),
      event({
        type: "JudgmentRevealed",
        playerId: "p2",
        judgmentCardId: "slash",
        suit: "spade",
        rank: 7
      }, 12)
    ];
    const cues = deriveAudioCues(
      { events } as DispatchResult,
      state,
      resolver
    );
    expect(cues.map(({ id, eventSequence }) => ({ id, eventSequence })))
      .toEqual([
        { id: "card.slash", eventSequence: 10 },
        { id: "combat.damage", eventSequence: 11 },
        { id: "system.judgment", eventSequence: 12 }
      ]);
  });

  test("coalesces a batch of hand movements into one draw or discard cue", () => {
    const events = [
      event({
        type: "CardMoved",
        cardId: "slash",
        from: "zone:draw",
        to: "zone:hand:p1",
        reason: "draw"
      }, 20),
      event({
        type: "CardMoved",
        cardId: "armor",
        from: "zone:draw",
        to: "zone:hand:p1",
        reason: "draw"
      }, 21),
      event({
        type: "CardMoved",
        cardId: "armor",
        from: "zone:hand:p1",
        to: "zone:discard",
        reason: "discard"
      }, 22)
    ];
    expect(deriveAudioCues(
      { events } as DispatchResult,
      state,
      resolver
    ).map((item) => item.id)).toEqual(["card.draw", "card.discard"]);
  });

  test("does not double-play equipment use before EquipmentChanged", () => {
    const events = [
      event({
        type: "CardUsed",
        playerId: "p1",
        cardId: "armor",
        targetIds: ["p1"]
      }, 30),
      event({
        type: "EquipmentChanged",
        playerId: "p1",
        slot: "armor",
        equippedCardId: "armor",
        replacedCardId: null
      }, 31)
    ];
    expect(deriveAudioCues(
      { events } as DispatchResult,
      state,
      resolver
    ).map((item) => item.id)).toEqual(["card.equip"]);
  });
});
