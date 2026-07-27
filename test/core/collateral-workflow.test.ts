import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  dispatch,
  equipmentZone,
  handZone
} from "../../src/core";
import type { DispatchResult } from "../../src/core";

const registry = createStandardRegistry();

function game() {
  const state = createGameState({
    seed: 2027,
    players: [
      {
        id: "p1",
        heroDefinitionId: "hero:p1",
        maxHp: 4,
        hand: [STANDARD_CARD.collateral]
      },
      {
        id: "p2",
        heroDefinitionId: "hero:p2",
        maxHp: 4,
        hand: [STANDARD_CARD.crossbow, STANDARD_CARD.slash]
      },
      {
        id: "p3",
        heroDefinitionId: "hero:p3",
        maxHp: 4
      }
    ]
  });
  const p2Hand = state.zones[handZone("p2")]!;
  const weaponCardId = p2Hand.find(
    (id) => state.cards[id]?.definitionId === STANDARD_CARD.crossbow
  )!;
  p2Hand.splice(p2Hand.indexOf(weaponCardId), 1);
  state.zones[equipmentZone("p2")]!.push(weaponCardId);
  return state;
}

function pass(result: DispatchResult): DispatchResult {
  const decision = result.pendingDecision;
  if (!decision || decision.type !== "respond-card") {
    throw new Error("expected a response decision");
  }
  return dispatch(
    result.state,
    {
      type: "pass",
      playerId: decision.playerId,
      decisionId: decision.id
    },
    registry
  );
}

function useCollateral() {
  const state = game();
  const collateralCardId = state.zones[handZone("p1")]![0]!;
  let result = dispatch(
    state,
    {
      type: "use-card",
      playerId: "p1",
      cardId: collateralCardId,
      targetIds: ["p2", "p3"]
    },
    registry
  );
  while (
    result.pendingDecision?.type === "respond-card" &&
    result.pendingDecision.responseKind === "nullification"
  ) {
    result = pass(result);
  }
  return result;
}

describe("collateral content workflow", () => {
  test("passing transfers the weapon to the trick user", () => {
    const waiting = useCollateral();
    expect(waiting.pendingDecision).toMatchObject({
      playerId: "p2",
      responseKind: "slash"
    });
    const resolved = pass(waiting);
    expect(
      resolved.state.zones[handZone("p1")]!.map(
        (id) => resolved.state.cards[id]?.definitionId
      )
    ).toContain(STANDARD_CARD.crossbow);
    expect(resolved.state.zones[equipmentZone("p2")]).toEqual([]);
  });

  test("responding applies the selected slash to the declared target", () => {
    const waiting = useCollateral();
    const slashCardId = waiting.state.zones[handZone("p2")]!.find(
      (id) => waiting.state.cards[id]?.definitionId === STANDARD_CARD.slash
    )!;
    let result = dispatch(
      waiting.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: waiting.pendingDecision!.id,
        cardId: slashCardId
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      playerId: "p3",
      responseKind: "jink"
    });
    result = pass(result);
    expect(result.state.players.p3?.hp).toBe(3);
    expect(
      result.state.zones[equipmentZone("p2")]!.map(
        (id) => result.state.cards[id]?.definitionId
      )
    ).toContain(STANDARD_CARD.crossbow);
  });
});
