import { describe, expect, test } from "vitest";
import {
  DISCARD_PILE,
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  dispatch,
  equipmentZone,
  getLegalActions,
  handZone,
  judgmentZone
} from "../../src/core";
import type { DispatchResult, GameState } from "../../src/core";

const registry = createStandardRegistry();

function card(state: GameState, playerId: string, definitionId: string): string {
  const id = state.zones[handZone(playerId)]?.find(
    (candidate) => state.cards[candidate]?.definitionId === definitionId
  );
  if (!id) throw new Error(`missing ${definitionId}`);
  return id;
}

function pass(result: DispatchResult): DispatchResult {
  if (!result.pendingDecision) throw new Error("no pending decision");
  return dispatch(
    result.state,
    {
      type: "pass",
      playerId: result.pendingDecision.playerId,
      decisionId: result.pendingDecision.id
    },
    registry
  );
}

function slashGame(options: {
  targetHp: number;
  targetHand?: string[];
  sourceHand?: string[];
}): GameState {
  return createGameState({
    seed: 77,
    players: [
      {
        id: "p1",
        heroDefinitionId: "hero:p1",
        maxHp: 4,
        hand: [STANDARD_CARD.slash, ...(options.sourceHand ?? [])]
      },
      {
        id: "p2",
        heroDefinitionId: "hero:p2",
        hp: options.targetHp,
        maxHp: 4,
        hand: options.targetHand ?? []
      }
    ]
  });
}

function useSlash(state: GameState): DispatchResult {
  return dispatch(
    state,
    {
      type: "use-card",
      playerId: "p1",
      cardId: card(state, "p1", STANDARD_CARD.slash),
      targetIds: ["p2"]
    },
    registry
  );
}

describe("turn state machine", () => {
  test("judgment, draw and action phases advance deterministically", () => {
    let state = createGameState({
      seed: 1,
      phase: "judgment",
      players: [
        { id: "p1", heroDefinitionId: "hero:p1", maxHp: 4 },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ],
      drawPile: [STANDARD_CARD.slash, STANDARD_CARD.peach]
    });
    expect(getLegalActions(state, registry)).toEqual([
      { type: "advance-phase", playerId: "p1" }
    ]);
    state = dispatch(
      state,
      { type: "advance-phase", playerId: "p1" },
      registry
    ).state;
    expect(state.phase).toBe("draw");
    state = dispatch(
      state,
      { type: "advance-phase", playerId: "p1" },
      registry
    ).state;
    expect(state.phase).toBe("action");
    expect(state.zones[handZone("p1")]).toHaveLength(2);
  });

  test("discard phase exposes exact legal selections and starts next turn", () => {
    let state = createGameState({
      seed: 2,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          hp: 2,
          maxHp: 4,
          hand: [
            STANDARD_CARD.slash,
            STANDARD_CARD.jink,
            STANDARD_CARD.peach,
            STANDARD_CARD.nullification
          ]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    state = dispatch(
      state,
      { type: "end-action-phase", playerId: "p1" },
      registry
    ).state;
    const choices = getLegalActions(state, registry);
    expect(choices).toHaveLength(6);
    expect(choices.every((action) =>
      action.type === "discard-cards" && action.cardIds.length === 2
    )).toBe(true);

    const result = dispatch(state, choices[0]!, registry);
    expect(result.state.currentPlayerId).toBe("p2");
    expect(result.state.phase).toBe("judgment");
    expect(result.state.turnNumber).toBe(2);
    expect(result.state.zones[DISCARD_PILE]).toHaveLength(2);
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["TurnEnded", "TurnStarted"])
    );
  });

  test("players with no excess cards can end the turn directly", () => {
    let state = createGameState({
      seed: 3,
      players: [
        { id: "p1", heroDefinitionId: "hero:p1", maxHp: 4 },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    state = dispatch(
      state,
      { type: "end-action-phase", playerId: "p1" },
      registry
    ).state;
    expect(getLegalActions(state, registry)).toEqual([
      { type: "end-turn", playerId: "p1" }
    ]);
  });

  test("equipment and judgment zones exist independently for every player", () => {
    const state = createGameState({
      seed: 4,
      players: [
        { id: "p1", heroDefinitionId: "hero:p1", maxHp: 4 },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    expect(state.zones[equipmentZone("p1")]).toEqual([]);
    expect(state.zones[judgmentZone("p1")]).toEqual([]);
    expect(equipmentZone("p1")).not.toBe(equipmentZone("p2"));
  });

  test("empty draw pile deterministically reshuffles the discard pile", () => {
    let state = createGameState({
      seed: 123,
      phase: "draw",
      players: [
        { id: "p1", heroDefinitionId: "hero:p1", maxHp: 4 },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ],
      drawPile: [
        STANDARD_CARD.slash,
        STANDARD_CARD.jink,
        STANDARD_CARD.peach
      ]
    });
    const cards = [...state.zones["zone:draw"]!];
    state.zones["zone:draw"] = [];
    state.zones[DISCARD_PILE] = cards;
    const result = dispatch(
      state,
      { type: "advance-phase", playerId: "p1" },
      registry
    );
    expect(result.state.zones[handZone("p1")]).toHaveLength(2);
    expect(result.state.zones[DISCARD_PILE]).toEqual([]);
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "DeckReshuffled", count: 3 })
      ])
    );

    const repeated = dispatch(
      state,
      { type: "advance-phase", playerId: "p1" },
      registry
    );
    expect(repeated.state).toEqual(result.state);
    expect(repeated.events).toEqual(result.events);
  });
});

describe("dying and death resolution", () => {
  test("wine is a rescue response only for the dying player", () => {
    let result = useSlash(
      slashGame({ targetHp: 1, targetHand: [STANDARD_CARD.wine] })
    );
    result = pass(result);
    expect(result.pendingDecision).toMatchObject({
      playerId: "p2",
      responseKind: "peach",
      acceptedDefinitionIds: expect.arrayContaining([STANDARD_CARD.wine])
    });
    const wineId = card(result.state, "p2", STANDARD_CARD.wine);
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        cardId: wineId
      },
      registry
    );
    expect(result.state.players.p2).toMatchObject({
      hp: 1,
      alive: true,
      dying: false
    });

    result = useSlash(
      slashGame({ targetHp: 1, sourceHand: [STANDARD_CARD.wine] })
    );
    result = pass(result);
    result = pass(result);
    expect(result.pendingDecision).toMatchObject({
      playerId: "p1",
      responseKind: "peach"
    });
    expect(getLegalActions(result.state, registry)).toEqual([
      {
        type: "pass",
        playerId: "p1",
        decisionId: result.pendingDecision!.id
      }
    ]);
  });

  test("a peach response rescues a dying player before slash finishes", () => {
    let result = useSlash(
      slashGame({ targetHp: 1, targetHand: [STANDARD_CARD.peach] })
    );
    result = pass(result);
    expect(result.pendingDecision).toMatchObject({
      playerId: "p2",
      responseKind: "peach"
    });
    const peachId = card(result.state, "p2", STANDARD_CARD.peach);
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        cardId: peachId
      },
      registry
    );
    expect(result.state.players.p2).toMatchObject({
      hp: 1,
      alive: true,
      dying: false
    });
    expect(result.state.eventLog.map((event) => event.type)).toEqual(
      expect.arrayContaining(["DyingStarted", "HpRecovered", "PlayerRescued"])
    );
  });

  test("all players passing peach kills the victim and discards owned cards", () => {
    let result = useSlash(
      slashGame({ targetHp: 1, targetHand: [STANDARD_CARD.jink] })
    );
    result = pass(result);
    while (result.pendingDecision) result = pass(result);
    expect(result.state.players.p2).toMatchObject({
      hp: 0,
      alive: false,
      dying: false
    });
    expect(result.state.zones[handZone("p2")]).toEqual([]);
    expect(result.state.zones[DISCARD_PILE]).toHaveLength(2);
    expect(result.state.eventLog.some((event) => event.type === "PlayerDied"))
      .toBe(true);
    expect(result.state.phase).toBe("finished");
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "GameEnded", winnerIds: ["p1"] })
      ])
    );
  });

  test("negative hp requires multiple peach responses", () => {
    const state = slashGame({
      targetHp: 1,
      targetHand: [STANDARD_CARD.peach, STANDARD_CARD.peach]
    });
    state.players.p2!.hp = 0;
    let result = useSlash(state);
    result = pass(result);
    for (let rescue = 0; rescue < 2; rescue += 1) {
      expect(result.pendingDecision).toMatchObject({
        type: "respond-card",
        responseKind: "peach"
      });
      const peachId = card(result.state, "p2", STANDARD_CARD.peach);
      result = dispatch(
        result.state,
        {
          type: "respond-card",
          playerId: "p2",
          decisionId: result.pendingDecision!.id,
          cardId: peachId
        },
        registry
      );
    }
    expect(result.state.players.p2).toMatchObject({
      hp: 1,
      alive: true,
      dying: false
    });
  });
});
