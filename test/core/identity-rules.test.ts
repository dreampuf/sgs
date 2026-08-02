import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  dispatch,
  equipmentZone,
  handZone
} from "../../src/core";
import type { DispatchResult, Identity } from "../../src/core";

const registry = createStandardRegistry();

function identityGame(options: {
  sourceId: string;
  victimId: string;
  deadIds?: string[];
}): ReturnType<typeof createGameState> {
  const identities: Array<[string, Identity]> = [
    ["lord", "lord"],
    ["loyalist", "loyalist"],
    ["rebel", "rebel"],
    ["renegade", "renegade"]
  ];
  const dead = new Set(options.deadIds ?? []);
  return createGameState({
    seed: 700,
    currentPlayerId: options.sourceId,
    phase: "action",
    players: identities.map(([id, identity]) => ({
      id,
      identity,
      heroDefinitionId: `fixture:${id}`,
      maxHp: 4,
      hp: dead.has(id)
        ? 0
        : id === options.victimId
          ? 1
          : 4,
      hand: id === options.sourceId ? [STANDARD_CARD.slash] : []
    }))
  });
}

function kill(
  state: ReturnType<typeof createGameState>,
  sourceId: string,
  victimId: string
): DispatchResult {
  let result = dispatch(state, {
    type: "use-card",
    playerId: sourceId,
    cardId: state.zones[handZone(sourceId)]![0]!,
    targetIds: [victimId]
  }, registry);
  for (let guard = 0; result.pendingDecision && guard < 16; guard += 1) {
    const pass = result.state.pendingDecision
      ? {
          type: "pass" as const,
          playerId: result.state.pendingDecision.request.playerId,
          decisionId: result.state.pendingDecision.request.id
        }
      : undefined;
    result = dispatch(result.state, pass!, registry);
  }
  return result;
}

function winners(result: DispatchResult): string[] | undefined {
  const ended = [...result.state.eventLog].reverse().find(
    (event) => event.type === "GameEnded"
  );
  return ended?.type === "GameEnded" ? ended.winnerIds : undefined;
}

describe("identity-mode victory rules", () => {
  test("lord and loyalist win as soon as rebels and renegade are dead", () => {
    const result = kill(identityGame({
      sourceId: "lord",
      victimId: "renegade",
      deadIds: ["rebel"]
    }), "lord", "renegade");
    expect(result.state.phase).toBe("finished");
    expect(winners(result)).toEqual(["lord", "loyalist"]);
  });

  test("rebels win immediately when the lord dies with multiple survivors", () => {
    const result = kill(identityGame({
      sourceId: "rebel",
      victimId: "lord",
      deadIds: ["loyalist"]
    }), "rebel", "lord");
    expect(result.state.phase).toBe("finished");
    expect(winners(result)).toEqual(["rebel"]);
  });

  test("a sole surviving renegade wins when the lord dies", () => {
    const result = kill(identityGame({
      sourceId: "renegade",
      victimId: "lord",
      deadIds: ["loyalist", "rebel"]
    }), "renegade", "lord");
    expect(result.state.phase).toBe("finished");
    expect(winners(result)).toEqual(["renegade"]);
  });

  test("large-table renegades share victory after rebels are eliminated", () => {
    const state = createGameState({
      seed: 702,
      currentPlayerId: "renegade-a",
      phase: "action",
      players: [
        {
          id: "renegade-a",
          identity: "renegade",
          heroDefinitionId: "fixture:renegade-a",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4,
          hp: 1
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "fixture:loyalist",
          maxHp: 4
        },
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "fixture:rebel",
          maxHp: 4,
          hp: 0
        },
        {
          id: "renegade-b",
          identity: "renegade",
          heroDefinitionId: "fixture:renegade-b",
          maxHp: 4
        }
      ]
    });
    const result = kill(state, "renegade-a", "lord");
    expect(result.state.phase).toBe("finished");
    expect(winners(result)).toEqual(["renegade-a", "renegade-b"]);
  });

  test("identity state survives snapshots while identity-less fixtures retain duel mode", () => {
    const state = identityGame({
      sourceId: "lord",
      victimId: "loyalist"
    });
    expect(state.players.lord?.identity).toBe("lord");
    const result = kill(state, "lord", "loyalist");
    expect(result.state.phase).not.toBe("finished");

    const duel = createGameState({
      seed: 701,
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
          maxHp: 1,
          hp: 1
        }
      ]
    });
    expect(kill(duel, "p1", "p2").state.phase).toBe("finished");
  });

  test("killing a rebel draws three identity-reward cards", () => {
    const state = createGameState({
      seed: 702,
      currentPlayerId: "loyalist",
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "fixture:loyalist",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "fixture:rebel",
          maxHp: 1,
          hp: 1
        },
        {
          id: "renegade",
          identity: "renegade",
          heroDefinitionId: "fixture:renegade",
          maxHp: 4
        }
      ],
      drawPile: [
        STANDARD_CARD.peach,
        STANDARD_CARD.jink,
        STANDARD_CARD.wine
      ]
    });
    const result = kill(state, "loyalist", "rebel");
    expect(result.state.zones[handZone("loyalist")]).toHaveLength(3);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "CardsDrawn",
        playerId: "loyalist",
        count: 3,
        cardId: "system:identity-reward"
      })
    );
  });

  test("a lord killing a loyalist discards all remaining hand and equipment", () => {
    const state = createGameState({
      seed: 703,
      currentPlayerId: "lord",
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4,
          hand: [
            STANDARD_CARD.slash,
            STANDARD_CARD.peach,
            STANDARD_CARD.crossbow
          ]
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "fixture:loyalist",
          maxHp: 1,
          hp: 1
        },
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "fixture:rebel",
          maxHp: 4
        },
        {
          id: "renegade",
          identity: "renegade",
          heroDefinitionId: "fixture:renegade",
          maxHp: 4
        }
      ]
    });
    const weaponId = state.zones[handZone("lord")]!.find(
      (cardId) =>
        state.cards[cardId]?.definitionId === STANDARD_CARD.crossbow
    )!;
    state.zones[handZone("lord")] = state.zones[handZone("lord")]!.filter(
      (cardId) => cardId !== weaponId
    );
    state.zones[equipmentZone("lord")]!.push(weaponId);
    const result = kill(state, "lord", "loyalist");
    expect(result.state.zones[handZone("lord")]).toEqual([]);
    expect(result.state.zones[equipmentZone("lord")]).toEqual([]);
  });
});
