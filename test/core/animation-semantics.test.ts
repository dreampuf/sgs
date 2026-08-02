import { expect, test } from "vitest";
import {
  GameSession,
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  deriveAnimationSemantics,
  handZone
} from "../../src/core";

test("DomainEvent batch deterministically maps to animation semantics", () => {
  const registry = createStandardRegistry();
  const session = new GameSession(createGameState({
    seed: 1201,
    players: [
      {
        id: "p1",
        heroDefinitionId: "fixture:p1",
        maxHp: 4,
        hand: [STANDARD_CARD.slash]
      },
      {
        id: "p2",
        heroDefinitionId: "fixture:p2",
        maxHp: 4
      }
    ]
  }), registry);
  const cardId = session.state().zones[handZone("p1")]![0]!;
  const used = session.dispatch({
    type: "use-card",
    playerId: "p1",
    cardId,
    targetIds: ["p2"]
  });
  const resolver = {
    displayCardId(id: string) {
      return id;
    },
    cardCategory(id: string) {
      const definitionId = session.state().cards[id]?.definitionId;
      return definitionId
        ? registry.card(definitionId).category
        : undefined;
    }
  };
  expect(deriveAnimationSemantics(
    used,
    session.state(),
    resolver
  )).toEqual([
    {
      type: "choice_card",
      playerIds: ["p1", "p2"],
      cardIds: [cardId]
    },
    {
      type: "sync_hand",
      playerIds: ["p1"],
      cardIds: []
    }
  ]);

  const passed = session.dispatch(session.legalActions().find(
    (action) => action.type === "pass"
  )!);
  expect(deriveAnimationSemantics(
    passed,
    session.state(),
    resolver
  )).toContainEqual({
    type: "damage",
    playerIds: ["p1", "p2"],
    cardIds: []
  });
});

test("self-target cards emit one player binding and cannot stop the browser", () => {
  const registry = createStandardRegistry();
  const session = new GameSession(createGameState({
    seed: 1202,
    players: [
      {
        id: "p1",
        heroDefinitionId: "fixture:p1",
        maxHp: 4,
        hand: [STANDARD_CARD.wine]
      },
      {
        id: "p2",
        heroDefinitionId: "fixture:p2",
        maxHp: 4
      }
    ]
  }), registry);
  const used = session.dispatch(session.legalActions().find(
    (action) => action.type === "use-card"
  )!);
  expect(deriveAnimationSemantics(used, session.state(), {
    displayCardId(id) {
      return id;
    },
    cardCategory(id) {
      const definitionId = session.state().cards[id]?.definitionId;
      return definitionId
        ? registry.card(definitionId).category
        : undefined;
    }
  })[0]).toMatchObject({
    type: "choice_card",
    playerIds: ["p1"]
  });
});

test("moving a card out of equipment emits equip_off without EquipmentChanged", () => {
  expect(deriveAnimationSemantics({
    events: [{
      type: "CardMoved",
      sequence: 1,
      revision: 1,
      cardId: "weapon-1",
      from: "zone:equipment:p2",
      to: "zone:hand:p1",
      reason: "resolve"
    }]
  }, {
    eventLog: []
  } as never, {
    displayCardId(id) {
      return id;
    },
    cardCategory() {
      return "equipment";
    }
  })).toEqual([{
    type: "equip_off",
    playerIds: ["p2"],
    cardIds: ["weapon-1"]
  }, {
    type: "sync_hand",
    playerIds: ["p1"],
    cardIds: []
  }]);
});
