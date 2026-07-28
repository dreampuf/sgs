import { describe, expect, test } from "vitest";
import {
  DISCARD_PILE,
  PROCESSING_ZONE,
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  deserializeGameState,
  dispatch,
  getLegalActions,
  handZone,
  nextRandom,
  serializeGameState,
  shuffle
} from "../../src/core";
import type {
  CardDefinitionId,
  GameCommand,
  GameState,
  PlayerId
} from "../../src/core";

const registry = createStandardRegistry();

function game(
  p1Hand: CardDefinitionId[],
  p2Hand: CardDefinitionId[],
  options: {
    p1Hp?: number;
    p2Hp?: number;
    drawPile?: CardDefinitionId[];
    seed?: number;
  } = {}
): GameState {
  return createGameState({
    seed: options.seed ?? 42,
    players: [
      {
        id: "p1",
        heroDefinitionId: "standard:hero:liubei",
        ...(options.p1Hp === undefined ? {} : { hp: options.p1Hp }),
        maxHp: 4,
        hand: p1Hand
      },
      {
        id: "p2",
        heroDefinitionId: "standard:hero:guanyu",
        ...(options.p2Hp === undefined ? {} : { hp: options.p2Hp }),
        maxHp: 4,
        hand: p2Hand
      }
    ],
    drawPile: options.drawPile ?? []
  });
}

function cardInHand(
  state: GameState,
  playerId: PlayerId,
  definitionId: CardDefinitionId
): string {
  const cardId = state.zones[handZone(playerId)]?.find(
    (id) => state.cards[id]?.definitionId === definitionId
  );
  if (!cardId) throw new Error(`${playerId} does not have ${definitionId}`);
  return cardId;
}

function use(
  state: GameState,
  playerId: PlayerId,
  definitionId: CardDefinitionId,
  targetIds: PlayerId[]
) {
  return dispatch(
    state,
    {
      type: "use-card",
      playerId,
      cardId: cardInHand(state, playerId, definitionId),
      targetIds
    },
    registry
  );
}

describe("deterministic state", () => {
  test("seeded random and shuffle are reproducible", () => {
    expect(nextRandom(123)).toEqual(nextRandom(123));
    expect(shuffle([1, 2, 3, 4, 5], 123)).toEqual(
      shuffle([1, 2, 3, 4, 5], 123)
    );
    expect(shuffle([1, 2, 3, 4, 5], 123).items).not.toEqual(
      shuffle([1, 2, 3, 4, 5], 456).items
    );
  });

  test("state round-trips as plain JSON", () => {
    const original = game([STANDARD_CARD.slash], [STANDARD_CARD.jink]);
    const serialized = serializeGameState(original);
    expect(serialized).not.toContain("dom");
    expect(deserializeGameState(serialized)).toEqual(original);
    expect(JSON.stringify(deserializeGameState(serialized))).toBe(serialized);
  });

  test("schema v1 snapshots migrate without losing cards or players", () => {
    const current = game([STANDARD_CARD.slash], [STANDARD_CARD.jink]);
    const legacy = JSON.parse(JSON.stringify(current));
    legacy.schemaVersion = 1;
    delete legacy.turnNumber;
    delete legacy.turnUsage;
    delete legacy.triggerQueue;
    for (const player of Object.values(legacy.players) as Array<
      Record<string, unknown>
    >) {
      delete player.dying;
      delete player.skillIds;
      delete player.marks;
    }
    const migrated = deserializeGameState(JSON.stringify(legacy));
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.contentPacks).toEqual([]);
    expect(
      Object.values(migrated.players).every((player) => player.faceUp)
    ).toBe(true);
    expect(migrated.cards).toEqual(current.cards);
    expect(migrated.turnOrder).toEqual(current.turnOrder);
    expect(migrated.triggerQueue).toEqual([]);
    expect(migrated.players.p1).toMatchObject({
      dying: false,
      skillIds: [],
      marks: {}
    });
  });

  test("same state and command sequence produces the same result", () => {
    const initialA = game([STANDARD_CARD.slash], [], { seed: 99 });
    const initialB = game([STANDARD_CARD.slash], [], { seed: 99 });
    const slashA = use(initialA, "p1", STANDARD_CARD.slash, ["p2"]);
    const slashB = use(initialB, "p1", STANDARD_CARD.slash, ["p2"]);
    const passA: GameCommand = {
      type: "pass",
      playerId: "p2",
      decisionId: slashA.pendingDecision!.id
    };
    const passB: GameCommand = {
      type: "pass",
      playerId: "p2",
      decisionId: slashB.pendingDecision!.id
    };
    expect(dispatch(slashA.state, passA, registry)).toEqual(
      dispatch(slashB.state, passB, registry)
    );
  });
});

describe("legal actions are the single rule entry point", () => {
  test("response-only cards are disabled and peach is disabled at full hp", () => {
    const state = game(
      [
        STANDARD_CARD.slash,
        STANDARD_CARD.jink,
        STANDARD_CARD.peach,
        STANDARD_CARD.nullification
      ],
      []
    );
    const actions = getLegalActions(state, registry);
    expect(actions.filter((action) => action.type === "use-card")).toHaveLength(1);
    expect(actions).toContainEqual({
      type: "use-card",
      playerId: "p1",
      cardId: cardInHand(state, "p1", STANDARD_CARD.slash),
      targetIds: ["p2"]
    });
    expect(actions).toContainEqual({ type: "end-action-phase", playerId: "p1" });
  });

  test("peach becomes legal when wounded", () => {
    const state = game([STANDARD_CARD.peach], [], { p1Hp: 3 });
    expect(getLegalActions(state, registry)).toContainEqual({
      type: "use-card",
      playerId: "p1",
      cardId: cardInHand(state, "p1", STANDARD_CARD.peach),
      targetIds: ["p1"]
    });
  });

  test("illegal commands are rejected before state mutation", () => {
    const state = game([STANDARD_CARD.jink], []);
    const before = serializeGameState(state);
    expect(() =>
      dispatch(
        state,
        {
          type: "use-card",
          playerId: "p1",
          cardId: cardInHand(state, "p1", STANDARD_CARD.jink),
          targetIds: ["p2"]
        },
        registry
      )
    ).toThrow(/illegal command/);
    expect(serializeGameState(state)).toBe(before);
  });
});

describe("basic card resolution", () => {
  test("slash asks for jink; pass causes damage and discards slash", () => {
    const initial = game([STANDARD_CARD.slash], [STANDARD_CARD.jink]);
    const slashId = cardInHand(initial, "p1", STANDARD_CARD.slash);
    const used = use(initial, "p1", STANDARD_CARD.slash, ["p2"]);

    expect(used.pendingDecision).toMatchObject({
      playerId: "p2",
      responseKind: "jink"
    });
    expect(used.state.zones[PROCESSING_ZONE]).toContain(slashId);
    expect(getLegalActions(used.state, registry)).toHaveLength(2);

    const resolved = dispatch(
      used.state,
      {
        type: "pass",
        playerId: "p2",
        decisionId: used.pendingDecision!.id
      },
      registry
    );
    expect(resolved.state.players.p2?.hp).toBe(3);
    expect(resolved.state.zones[DISCARD_PILE]).toContain(slashId);
    expect(resolved.events.map((event) => event.type)).toContain("DamageApplied");
  });

  test("jink cancels slash and both cards leave their hands", () => {
    const initial = game([STANDARD_CARD.slash], [STANDARD_CARD.jink]);
    const slashId = cardInHand(initial, "p1", STANDARD_CARD.slash);
    const jinkId = cardInHand(initial, "p2", STANDARD_CARD.jink);
    const used = use(initial, "p1", STANDARD_CARD.slash, ["p2"]);
    const resolved = dispatch(
      used.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: used.pendingDecision!.id,
        cardId: jinkId
      },
      registry
    );

    expect(resolved.state.players.p2?.hp).toBe(4);
    expect(resolved.state.zones[DISCARD_PILE]).toEqual(
      expect.arrayContaining([slashId, jinkId])
    );
    expect(resolved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "CardResponded", cardId: jinkId }),
        expect.objectContaining({
          type: "CardCancelled",
          cardId: slashId,
          reason: "jink"
        })
      ])
    );
  });

  test("peach recovers one hp and resolves to discard", () => {
    const initial = game([STANDARD_CARD.peach], [], { p1Hp: 2 });
    const peachId = cardInHand(initial, "p1", STANDARD_CARD.peach);
    const resolved = use(initial, "p1", STANDARD_CARD.peach, ["p1"]);
    expect(resolved.state.players.p1?.hp).toBe(3);
    expect(resolved.state.zones[DISCARD_PILE]).toContain(peachId);
    expect(resolved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "HpRecovered", amount: 1 })
      ])
    );
  });
});

describe("trick response window", () => {
  test("all players pass nullification and Ex Nihilo draws two", () => {
    const initial = game([STANDARD_CARD.exNihilo], [], {
      drawPile: [STANDARD_CARD.slash, STANDARD_CARD.peach]
    });
    const used = use(initial, "p1", STANDARD_CARD.exNihilo, []);
    expect(used.pendingDecision?.playerId).toBe("p1");

    const firstPass = dispatch(
      used.state,
      {
        type: "pass",
        playerId: "p1",
        decisionId: used.pendingDecision!.id
      },
      registry
    );
    expect(firstPass.pendingDecision?.playerId).toBe("p2");

    const resolved = dispatch(
      firstPass.state,
      {
        type: "pass",
        playerId: "p2",
        decisionId: firstPass.pendingDecision!.id
      },
      registry
    );
    expect(resolved.state.zones[handZone("p1")]).toHaveLength(2);
    expect(resolved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "CardsDrawn", count: 2 })
      ])
    );
  });

  test("nullification cancels Ex Nihilo", () => {
    const initial = game(
      [STANDARD_CARD.exNihilo],
      [STANDARD_CARD.nullification],
      { drawPile: [STANDARD_CARD.slash, STANDARD_CARD.peach] }
    );
    const used = use(initial, "p1", STANDARD_CARD.exNihilo, []);
    const firstPass = dispatch(
      used.state,
      {
        type: "pass",
        playerId: "p1",
        decisionId: used.pendingDecision!.id
      },
      registry
    );
    const nullificationId = cardInHand(
      firstPass.state,
      "p2",
      STANDARD_CARD.nullification
    );
    let resolved = dispatch(
      firstPass.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: firstPass.pendingDecision!.id,
        cardId: nullificationId
      },
      registry
    );
    while (resolved.pendingDecision) {
      resolved = dispatch(
        resolved.state,
        {
          type: "pass",
          playerId: resolved.pendingDecision.playerId,
          decisionId: resolved.pendingDecision.id
        },
        registry
      );
    }
    expect(resolved.state.zones[handZone("p1")]).toHaveLength(0);
    expect(resolved.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "CardCancelled",
          reason: "nullification"
        })
      ])
    );
  });

  test("a second nullification restores the original trick", () => {
    const initial = game(
      [STANDARD_CARD.exNihilo, STANDARD_CARD.nullification],
      [STANDARD_CARD.nullification],
      { drawPile: [STANDARD_CARD.slash, STANDARD_CARD.peach] }
    );
    let result = use(initial, "p1", STANDARD_CARD.exNihilo, []);
    result = dispatch(
      result.state,
      {
        type: "pass",
        playerId: "p1",
        decisionId: result.pendingDecision!.id
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        cardId: cardInHand(
          result.state,
          "p2",
          STANDARD_CARD.nullification
        )
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        cardId: cardInHand(
          result.state,
          "p1",
          STANDARD_CARD.nullification
        )
      },
      registry
    );
    while (result.pendingDecision) {
      result = dispatch(
        result.state,
        {
          type: "pass",
          playerId: result.pendingDecision.playerId,
          decisionId: result.pendingDecision.id
        },
        registry
      );
    }
    expect(result.state.zones[handZone("p1")]).toHaveLength(2);
    expect(result.state.eventLog.filter((event) => event.type === "CardResponded"))
      .toHaveLength(2);
    expect(result.state.eventLog.some((event) => event.type === "CardCancelled"))
      .toBe(false);
  });
});
