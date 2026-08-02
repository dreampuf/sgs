import { describe, expect, test } from "vitest";
import type {
  DispatchResult,
  DomainEvent,
  GameState
} from "../../src/core/types";
import {
  deriveHeroAudioCues
} from "../../src/browser/hero-audio-semantics";

function event<T extends Omit<DomainEvent, "sequence" | "revision">>(
  value: T,
  sequence: number
): DomainEvent {
  return { ...value, sequence, revision: 7 } as unknown as DomainEvent;
}

const state = {
  players: {
    p1: {
      id: "p1",
      heroDefinitionId: "standard:hero:关羽"
    },
    p2: {
      id: "p2",
      heroDefinitionId: "standard:hero:曹操"
    }
  },
  cards: {
    slash: { id: "slash", definitionId: "standard:slash" },
    material: { id: "material", definitionId: "standard:jink" }
  }
} as unknown as GameState;

const resolver = {
  cardDefinitionId: (
    cardId: string,
    materialCardIds: string[] | undefined
  ) => state.cards[cardId]?.definitionId ??
    materialCardIds?.map((id) => state.cards[id]?.definitionId)
      .find((id) => id !== undefined)
};

describe("hero audio semantic sequence", () => {
  test("derives skill, signature-card and death cues from domain events", () => {
    const events = [
      event({
        type: "SkillActivated",
        playerId: "p1",
        skillId: "standard:skill:武圣",
        activationId: "virtual",
        materialCardIds: ["material"],
        targetIds: ["p2"]
      }, 40),
      event({
        type: "CardUsed",
        playerId: "p1",
        cardId: "slash",
        targetIds: ["p2"]
      }, 41),
      event({
        type: "PlayerDied",
        playerId: "p2",
        sourceId: "p1"
      }, 42)
    ];
    const cues = deriveHeroAudioCues(
      { events } as DispatchResult,
      state,
      resolver
    );
    expect(cues).toMatchObject([
      {
        kind: "skill",
        heroDefinitionId: "standard:hero:关羽",
        skillId: "standard:skill:武圣",
        eventSequence: 40
      },
      {
        kind: "card",
        heroDefinitionId: "standard:hero:关羽",
        cardDefinitionId: "standard:slash",
        eventSequence: 41
      },
      {
        kind: "death",
        heroDefinitionId: "standard:hero:曹操",
        eventSequence: 42
      }
    ]);
    expect(new Set(cues.map((cue) => cue.dedupeKey)).size).toBe(3);
  });

  test("keeps non-signature cards in JSON semantics for catalog filtering", () => {
    const cues = deriveHeroAudioCues({
      events: [event({
        type: "CardResponded",
        playerId: "p2",
        cardId: "material",
        responseKind: "jink"
      }, 50)]
    } as DispatchResult, state, resolver);
    expect(cues[0]).toMatchObject({
      kind: "card",
      heroDefinitionId: "standard:hero:曹操",
      cardDefinitionId: "standard:jink"
    });
  });
});
