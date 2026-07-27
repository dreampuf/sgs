import { describe, expect, test } from "vitest";
import {
  DISCARD_PILE,
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  dispatch,
  getLegalActions,
  handZone,
  judgmentZone
} from "../../src/core";
import type { DispatchResult, GameState } from "../../src/core";

const registry = createStandardRegistry();

function card(state: GameState, playerId: string, definitionId: string): string {
  return state.zones[handZone(playerId)]!.find(
    (id) => state.cards[id]?.definitionId === definitionId
  )!;
}

function passNullification(result: DispatchResult): DispatchResult {
  let current = result;
  while (
    current.pendingDecision?.type === "respond-card" &&
    current.pendingDecision.responseKind === "nullification"
  ) {
    current = dispatch(
      current.state,
      {
        type: "pass",
        playerId: current.pendingDecision.playerId,
        decisionId: current.pendingDecision.id
      },
      registry
    );
  }
  return current;
}

function advanceToPlayerTwoJudgment(state: GameState): GameState {
  let current = dispatch(
    state,
    { type: "end-action-phase", playerId: "p1" },
    registry
  ).state;
  current = dispatch(
    current,
    { type: "end-turn", playerId: "p1" },
    registry
  ).state;
  expect(current.currentPlayerId).toBe("p2");
  expect(current.phase).toBe("judgment");
  return current;
}

describe("delayed trick state machine", () => {
  test("Indulgence enters judgment zone and a failed heart check skips action", () => {
    let state = createGameState({
      seed: 31,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [{
            definitionId: STANDARD_CARD.indulgence,
            suit: "spade",
            rank: 6
          }]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ],
      drawPile: [
        { definitionId: STANDARD_CARD.slash, suit: "spade", rank: 7 },
        { definitionId: STANDARD_CARD.jink, suit: "heart", rank: 2 },
        { definitionId: STANDARD_CARD.peach, suit: "heart", rank: 3 }
      ]
    });
    const delayedCardId = card(state, "p1", STANDARD_CARD.indulgence);
    state = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: delayedCardId,
        targetIds: ["p2"]
      },
      registry
    ).state;
    expect(state.zones[judgmentZone("p2")]).toEqual([delayedCardId]);
    expect(state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "DelayedCardPlaced",
          playerId: "p2",
          cardId: delayedCardId
        })
      ])
    );

    state = advanceToPlayerTwoJudgment(state);
    let result = dispatch(
      state,
      { type: "advance-phase", playerId: "p2" },
      registry
    );
    result = passNullification(result);
    expect(result.state.phase).toBe("draw");
    expect(result.state.players.p2?.marks.skipAction).toBe(true);
    expect(result.state.zones[DISCARD_PILE]).toEqual(
      expect.arrayContaining([delayedCardId])
    );
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "JudgmentResolved",
          matched: true
        })
      ])
    );

    state = dispatch(
      result.state,
      { type: "advance-phase", playerId: "p2" },
      registry
    ).state;
    expect(state.phase).toBe("discard");
    expect(state.players.p2?.marks.skipAction).toBe(false);
  });

  test("nullification removes a delayed trick without drawing a judgment card", () => {
    let state = createGameState({
      seed: 32,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [
            STANDARD_CARD.indulgence,
            STANDARD_CARD.nullification
          ]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ],
      drawPile: [{
        definitionId: STANDARD_CARD.slash,
        suit: "spade",
        rank: 7
      }]
    });
    const delayedCardId = card(state, "p1", STANDARD_CARD.indulgence);
    state = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: delayedCardId,
        targetIds: ["p2"]
      },
      registry
    ).state;
    state = advanceToPlayerTwoJudgment(state);
    let result = dispatch(
      state,
      { type: "advance-phase", playerId: "p2" },
      registry
    );
    const nullificationAction = getLegalActions(result.state, registry).find(
      (action) => action.type === "respond-card"
    )!;
    result = dispatch(result.state, nullificationAction, registry);
    result = passNullification(result);
    expect(result.state.phase).toBe("draw");
    expect(result.state.zones[DISCARD_PILE]).toContain(delayedCardId);
    expect(
      result.state.eventLog.some((event) => event.type === "JudgmentRevealed")
    ).toBe(false);
    expect(result.state.zones["zone:draw"]).toHaveLength(1);
  });

  test.each([
    {
      suit: "spade" as const,
      rank: 5,
      expectedHp: 1,
      expectedOwner: null
    },
    {
      suit: "heart" as const,
      rank: 5,
      expectedHp: 4,
      expectedOwner: "p2"
    }
  ])("Lightning judgment $suit $rank", ({
    suit,
    rank,
    expectedHp,
    expectedOwner
  }) => {
    const state = createGameState({
      seed: 33,
      phase: "judgment",
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.lightning]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ],
      drawPile: [{
        definitionId: STANDARD_CARD.slash,
        suit,
        rank
      }]
    });
    const lightningId = card(state, "p1", STANDARD_CARD.lightning);
    state.zones[handZone("p1")] = [];
    state.zones[judgmentZone("p1")]!.push(lightningId);
    state.cards[lightningId]!.sourcePlayerId = "p1";

    let result = dispatch(
      state,
      { type: "advance-phase", playerId: "p1" },
      registry
    );
    result = passNullification(result);
    expect(result.state.players.p1?.hp).toBe(expectedHp);
    if (expectedOwner) {
      expect(result.state.zones[judgmentZone(expectedOwner)]).toContain(
        lightningId
      );
    } else {
      expect(result.state.zones[DISCARD_PILE]).toContain(lightningId);
    }
  });
});
