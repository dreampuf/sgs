import { describe, expect, test } from "vitest";
import {
  DISCARD_PILE,
  STANDARD_CARD,
  STANDARD_CARD_IDS_BY_NAME,
  createGameState,
  createManeuveringPack,
  createStandardPack,
  createStandardRegistry,
  dispatch,
  equipmentZone,
  getLegalActions,
  handZone,
  standardHeroId,
  standardSkillId
} from "../../src/core";
import type { DispatchResult } from "../../src/core";

const registry = createStandardRegistry();

function twoPlayerGame(
  p1Hand: string[],
  p2Hand: string[] = [],
  p1Hp = 4
) {
  return createGameState({
    seed: 2026,
    players: [
      {
        id: "p1",
        heroDefinitionId: "hero:p1",
        hp: p1Hp,
        maxHp: 4,
        hand: p1Hand
      },
      {
        id: "p2",
        heroDefinitionId: "hero:p2",
        maxHp: 4,
        hand: p2Hand
      }
    ]
  });
}

function cardId(state: ReturnType<typeof twoPlayerGame>, definitionId: string) {
  return state.zones[handZone("p1")]!.find(
    (id) => state.cards[id]?.definitionId === definitionId
  )!;
}

function passCurrent(result: DispatchResult): DispatchResult {
  if (!result.pendingDecision || result.pendingDecision.type !== "respond-card") {
    throw new Error("no response decision");
  }
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

function passNullificationWindow(result: DispatchResult): DispatchResult {
  let current = result;
  while (
    current.pendingDecision?.type === "respond-card" &&
    current.pendingDecision.responseKind === "nullification"
  ) {
    current = passCurrent(current);
  }
  return current;
}

describe("standard card catalog migration", () => {
  test("all 43 legacy card names have unique stable definitions", () => {
    const ids = Object.values(STANDARD_CARD_IDS_BY_NAME);
    expect(Object.keys(STANDARD_CARD_IDS_BY_NAME)).toHaveLength(43);
    expect(new Set(ids).size).toBe(43);
    expect([
      ...createStandardPack().cards,
      ...createManeuveringPack().cards
    ]).toHaveLength(43);
    for (const [name, id] of Object.entries(STANDARD_CARD_IDS_BY_NAME)) {
      expect(registry.card(id).name).toBe(name);
    }
  });

  test("every active card has behavior; only response cards are inactive", () => {
    const pack = createStandardPack();
    const partial = createStandardPack().cards.filter(
      (definition) => definition.implementation === "partial"
    );
    expect(partial).toEqual([]);
    expect(
      pack.cards
        .filter((definition) => !definition.active)
        .map((definition) => definition.name)
    ).toEqual(["闪", "无懈可击"]);
  });

  test("slash variants share their once-per-turn usage limit", () => {
    let state = twoPlayerGame([
      STANDARD_CARD.slash,
      STANDARD_CARD.fireSlash
    ]);
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.slash),
        targetIds: ["p2"]
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "pass",
        playerId: "p2",
        decisionId: result.pendingDecision!.id
      },
      registry
    );
    state = result.state;
    expect(getLegalActions(state, registry)).not.toContainEqual(
      expect.objectContaining({
        type: "use-card",
        cardId: cardId(state, STANDARD_CARD.fireSlash)
      })
    );
  });

  test("wine increases the next slash damage and is then consumed", () => {
    let state = twoPlayerGame([
      STANDARD_CARD.wine,
      STANDARD_CARD.slash
    ]);
    state = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.wine),
        targetIds: ["p1"]
      },
      registry
    ).state;
    expect(state.players.p1?.marks.wineDamage).toBe(true);
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.slash),
        targetIds: ["p2"]
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "pass",
        playerId: "p2",
        decisionId: result.pendingDecision!.id
      },
      registry
    );
    expect(result.state.players.p2?.hp).toBe(2);
    expect(result.state.players.p1?.marks.wineDamage).toBe(false);
  });

  test("equipment replaces only the same slot", () => {
    let state = twoPlayerGame([
      STANDARD_CARD.crossbow,
      STANDARD_CARD.blade,
      STANDARD_CARD.eightDiagram
    ]);
    for (const definitionId of [
      STANDARD_CARD.crossbow,
      STANDARD_CARD.eightDiagram,
      STANDARD_CARD.blade
    ]) {
      state = dispatch(
        state,
        {
          type: "use-card",
          playerId: "p1",
          cardId: cardId(state, definitionId),
          targetIds: ["p1"]
        },
        registry
      ).state;
    }
    const equipped = state.zones[equipmentZone("p1")]!.map(
      (id) => state.cards[id]!.definitionId
    );
    expect(equipped).toEqual(
      expect.arrayContaining([STANDARD_CARD.blade, STANDARD_CARD.eightDiagram])
    );
    expect(equipped).not.toContain(STANDARD_CARD.crossbow);
  });

  test("duel alternates slash responses until one player passes", () => {
    let state = twoPlayerGame(
      [STANDARD_CARD.duel, STANDARD_CARD.slash],
      [STANDARD_CARD.fireSlash]
    );
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.duel),
        targetIds: ["p2"]
      },
      registry
    );
    result = passNullificationWindow(result);
    expect(result.pendingDecision).toMatchObject({
      playerId: "p2",
      responseKind: "slash"
    });
    const responseId = result.state.zones[handZone("p2")]![0]!;
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        cardId: responseId
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      playerId: "p1",
      responseKind: "slash"
    });
    result = passCurrent(result);
    expect(result.state.players.p1?.hp).toBe(3);
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "DamageApplied",
          sourceId: "p2",
          targetId: "p1"
        })
      ])
    );
  });

  test.each([
    {
      definitionId: STANDARD_CARD.dismantlement,
      expectedZone: "discard"
    },
    {
      definitionId: STANDARD_CARD.snatch,
      expectedZone: "source-hand"
    }
  ])("$definitionId resolves an explicit opaque card selection", ({
    definitionId,
    expectedZone
  }) => {
    let state = twoPlayerGame(
      [definitionId],
      [STANDARD_CARD.jink]
    );
    const targetCardId = state.zones[handZone("p2")]![0]!;
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, definitionId),
        targetIds: ["p2"]
      },
      registry
    );
    result = passNullificationWindow(result);
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p1",
      selectableCardIds: [targetCardId]
    });
    const choice = getLegalActions(result.state, registry).find(
      (action) => action.type === "choose-cards"
    )!;
    result = dispatch(result.state, choice, registry);
    expect(result.state.zones[handZone("p2")]).toEqual([]);
    if (expectedZone === "discard") {
      expect(result.state.zones["zone:discard"]).toContain(targetCardId);
    } else {
      expect(result.state.zones[handZone("p1")]).toContain(targetCardId);
    }
  });

  test("elemental slash propagates through chained players exactly once", () => {
    const state = createGameState({
      seed: 2027,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.fireSlash]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 },
        { id: "p3", heroDefinitionId: "hero:p3", maxHp: 4 }
      ]
    });
    state.players.p2!.marks.chained = true;
    state.players.p3!.marks.chained = true;
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: ["p2"]
      },
      registry
    );
    result = passCurrent(result);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.players.p3?.hp).toBe(3);
    expect(result.state.players.p2?.marks.chained).toBe(false);
    expect(result.state.players.p3?.marks.chained).toBe(false);
    expect(
      result.state.eventLog.filter((event) => event.type === "DamageApplied")
    ).toHaveLength(2);
  });

  test("iron chain opens an independent nullification window per target", () => {
    const state = createGameState({
      seed: 2028,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.ironChain]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        },
        { id: "p3", heroDefinitionId: "hero:p3", maxHp: 4 }
      ]
    });
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: ["p2", "p3"]
      },
      registry
    );
    result = passCurrent(result);
    const nullificationId = result.state.zones[handZone("p2")]![0]!;
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        cardId: nullificationId
      },
      registry
    );
    while (
      result.pendingDecision?.type === "respond-card" &&
      result.pendingDecision.responseKind === "nullification"
    ) {
      result = passCurrent(result);
    }
    expect(result.state.players.p2?.marks.chained).not.toBe(true);
    expect(result.state.players.p3?.marks.chained).toBe(true);
  });

  test("one Nullification only cancels one Savage Assault target", () => {
    const state = createGameState({
      seed: 2029,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.savageAssault]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        },
        { id: "p3", heroDefinitionId: "hero:p3", maxHp: 4 }
      ]
    });
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: []
      },
      registry
    );
    while (result.pendingDecision?.playerId !== "p2") {
      result = passCurrent(result);
    }
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision.id,
        cardId: result.state.zones[handZone("p2")]![0]!
      },
      registry
    );
    while (
      result.pendingDecision?.type === "respond-card" &&
      result.pendingDecision.responseKind === "nullification"
    ) {
      result = passCurrent(result);
    }
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p3",
      responseKind: "slash"
    });
    result = passCurrent(result);
    expect(result.state.players.p2?.hp).toBe(4);
    expect(result.state.players.p3?.hp).toBe(3);
  });

  test("weapon range and horses change slash targets from seat distance", () => {
    let state = createGameState({
      seed: 2028,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [
            STANDARD_CARD.slash,
            STANDARD_CARD.blade,
            STANDARD_CARD.chitu
          ]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.jueying]
        },
        { id: "p3", heroDefinitionId: "hero:p3", maxHp: 4 },
        { id: "p4", heroDefinitionId: "hero:p4", maxHp: 4 }
      ]
    });
    const slashId = cardId(state, STANDARD_CARD.slash);
    const slashTargets = () =>
      getLegalActions(state, registry)
        .filter(
          (action) => action.type === "use-card" && action.cardId === slashId
        )
        .map((action) => action.type === "use-card" && action.targetIds[0]);
    expect(slashTargets()).toEqual(["p2", "p4"]);

    const defensiveHorseId = state.zones[handZone("p2")]![0]!;
    state.zones[handZone("p2")] = [];
    state.zones[equipmentZone("p2")]!.push(defensiveHorseId);
    expect(slashTargets()).toEqual(["p4"]);

    state = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.chitu),
        targetIds: ["p1"]
      },
      registry
    ).state;
    expect(slashTargets()).toEqual(["p2", "p3", "p4"]);

    state = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.blade),
        targetIds: ["p1"]
      },
      registry
    ).state;
    expect(slashTargets()).toEqual(["p2", "p3", "p4"]);
  });

  test("Crossbow provides further slash actions after the normal limit", () => {
    let state = twoPlayerGame([
      STANDARD_CARD.crossbow,
      STANDARD_CARD.slash,
      STANDARD_CARD.slash
    ]);
    state = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.crossbow),
        targetIds: ["p1"]
      },
      registry
    ).state;
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.slash),
        targetIds: ["p2"]
      },
      registry
    );
    result = passCurrent(result);
    const remainingSlashId = cardId(result.state, STANDARD_CARD.slash);
    expect(getLegalActions(result.state, registry)).toContainEqual({
      type: "use-card",
      playerId: "p1",
      cardId: remainingSlashId,
      targetIds: ["p2"]
    });
  });

  test.each([
    {
      slash: STANDARD_CARD.slash,
      expectedHp: 4,
      label: "prevents normal slash"
    },
    {
      slash: STANDARD_CARD.fireSlash,
      expectedHp: 2,
      label: "adds one fire damage"
    }
  ])("Vine $label", ({ slash, expectedHp }) => {
    const state = createGameState({
      seed: 2029,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [slash]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.vine]
        }
      ]
    });
    const vineId = state.zones[handZone("p2")]!.pop()!;
    state.zones[equipmentZone("p2")]!.push(vineId);
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: ["p2"]
      },
      registry
    );
    result = passCurrent(result);
    expect(result.state.players.p2?.hp).toBe(expectedHp);
  });

  test("Qinggang Sword applies armor-ignore before Renwang Shield and Vine", () => {
    const makeState = (armor: string, withQinggang: boolean) => {
      const state = createGameState({
        seed: 2030,
        players: [
          {
            id: "p1",
            heroDefinitionId: "hero:p1",
            maxHp: 4,
            hand: [
              {
                definitionId: STANDARD_CARD.slash,
                suit: "spade",
                rank: 7
              },
              ...(withQinggang ? [STANDARD_CARD.qinggangSword] : [])
            ]
          },
          {
            id: "p2",
            heroDefinitionId: "hero:p2",
            maxHp: 4,
            hand: [armor]
          }
        ]
      });
      if (withQinggang) {
        const swordId = state.zones[handZone("p1")]!.find(
          (id) =>
            state.cards[id]?.definitionId === STANDARD_CARD.qinggangSword
        )!;
        state.zones[handZone("p1")]!.splice(
          state.zones[handZone("p1")]!.indexOf(swordId),
          1
        );
        state.zones[equipmentZone("p1")]!.push(swordId);
      }
      const armorId = state.zones[handZone("p2")]!.pop()!;
      state.zones[equipmentZone("p2")]!.push(armorId);
      return state;
    };

    let state = makeState(STANDARD_CARD.renwangShield, false);
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: ["p2"]
      },
      registry
    );
    expect(result.pendingDecision).toBeNull();
    expect(result.state.players.p2?.hp).toBe(4);

    for (const armor of [STANDARD_CARD.renwangShield, STANDARD_CARD.vine]) {
      state = makeState(armor, true);
      result = dispatch(
        state,
        {
          type: "use-card",
          playerId: "p1",
          cardId: state.zones[handZone("p1")]![0]!,
          targetIds: ["p2"]
        },
        registry
      );
      result = passCurrent(result);
      expect(result.state.players.p2?.hp).toBe(3);
    }
  });

  test("Spear, Fan and Guding Blade use generic virtual/effect hooks", () => {
    let state = createGameState({
      seed: 2031,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [
            STANDARD_CARD.spear,
            STANDARD_CARD.peach,
            STANDARD_CARD.jink
          ]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const spearId = state.zones[handZone("p1")]!.shift()!;
    state.zones[equipmentZone("p1")]!.push(spearId);
    expect(getLegalActions(state, registry)).toContainEqual(
      expect.objectContaining({
        type: "use-virtual-card",
        skillId: "standard:equipment:spear",
        definitionId: STANDARD_CARD.slash,
        materialCardIds: expect.arrayContaining(
          state.zones[handZone("p1")]!
        ),
        targetIds: ["p2"]
      })
    );

    state = createGameState({
      seed: 2032,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.fan, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.vine]
        }
      ]
    });
    const fanId = state.zones[handZone("p1")]!.shift()!;
    state.zones[equipmentZone("p1")]!.push(fanId);
    const vineId = state.zones[handZone("p2")]!.pop()!;
    state.zones[equipmentZone("p2")]!.push(vineId);
    const fanAction = getLegalActions(state, registry).find(
      (action) =>
        action.type === "use-virtual-card" &&
        action.skillId === "standard:equipment:fan"
    )!;
    let result = dispatch(state, fanAction, registry);
    result = passCurrent(result);
    expect(result.state.players.p2?.hp).toBe(2);

    state = createGameState({
      seed: 2033,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.gudingBlade, STANDARD_CARD.slash]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const bladeId = state.zones[handZone("p1")]!.shift()!;
    state.zones[equipmentZone("p1")]!.push(bladeId);
    result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: ["p2"]
      },
      registry
    );
    result = passCurrent(result);
    expect(result.state.players.p2?.hp).toBe(2);
  });

  test("Silver Lion caps wine slash damage at one", () => {
    let state = createGameState({
      seed: 2030,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.wine, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.silverLion]
        }
      ]
    });
    const lionId = state.zones[handZone("p2")]!.pop()!;
    state.zones[equipmentZone("p2")]!.push(lionId);
    state = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.wine),
        targetIds: ["p1"]
      },
      registry
    ).state;
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.slash),
        targetIds: ["p2"]
      },
      registry
    );
    result = passCurrent(result);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "DamageApplied", amount: 1 })
      ])
    );
  });

  test("Silver Lion recovers its owner through a self movement trigger", () => {
    const state = createGameState({
      seed: 2034,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          hp: 2,
          maxHp: 4,
          hand: [STANDARD_CARD.silverLion, STANDARD_CARD.vine]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const lionId = state.zones[handZone("p1")]!.shift()!;
    state.zones[equipmentZone("p1")]!.push(lionId);
    const result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: ["p1"]
      },
      registry
    );
    expect(result.state.players.p1?.hp).toBe(3);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "HpRecovered",
        playerId: "p1",
        cardId: lionId
      })
    );
  });

  test("Amazing Grace reveals a pool and resolves one opaque choice per player", () => {
    const state = createGameState({
      seed: 2031,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.amazingGrace]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 },
        { id: "p3", heroDefinitionId: "hero:p3", maxHp: 4 }
      ],
      drawPile: [
        STANDARD_CARD.slash,
        STANDARD_CARD.jink,
        STANDARD_CARD.peach
      ]
    });
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: []
      },
      registry
    );
    while (result.pendingDecision) {
      if (result.pendingDecision.type === "respond-card") {
        result = passCurrent(result);
      } else {
        const choice = getLegalActions(result.state, registry).find(
          (action) => action.type === "choose-cards"
        )!;
        result = dispatch(result.state, choice, registry);
      }
    }
    expect(result.state.zones[handZone("p1")]).toHaveLength(1);
    expect(result.state.zones[handZone("p2")]).toHaveLength(1);
    expect(result.state.zones[handZone("p3")]).toHaveLength(1);
    expect(
      Object.entries(result.state.zones)
        .filter(([zone]) => zone.startsWith("zone:table:amazing-grace:"))
        .flatMap(([, cards]) => cards)
    ).toEqual([]);
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "CardsRevealed",
          reason: "amazing-grace",
          revealedCardIds: expect.any(Array)
        })
      ])
    );
  });

  test("one Nullification skips one Amazing Grace choice, not the whole pool", () => {
    const state = createGameState({
      seed: 20311,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.amazingGrace]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        },
        { id: "p3", heroDefinitionId: "hero:p3", maxHp: 4 }
      ],
      drawPile: [
        STANDARD_CARD.slash,
        STANDARD_CARD.jink,
        STANDARD_CARD.peach
      ]
    });
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: []
      },
      registry
    );
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "CardsRevealed",
        reason: "amazing-grace"
      })
    );
    while (result.pendingDecision?.playerId !== "p2") {
      result = passCurrent(result);
    }
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision.id,
        cardId: result.state.zones[handZone("p2")]![0]!
      },
      registry
    );
    while (result.pendingDecision) {
      if (result.pendingDecision.type === "respond-card") {
        result = passCurrent(result);
      } else {
        const choice = getLegalActions(result.state, registry).find(
          (action) => action.type === "choose-cards"
        )!;
        result = dispatch(result.state, choice, registry);
      }
    }
    expect(result.state.zones[handZone("p1")]).toHaveLength(0);
    expect(result.state.zones[handZone("p2")]).toHaveLength(1);
    expect(result.state.zones[handZone("p3")]).toHaveLength(1);
    expect(result.state.eventLog.filter(
      (event) =>
        event.type === "CardCancelled" &&
        event.cardId === state.zones[handZone("p1")]![0]
    )).toHaveLength(1);
  });

  test("Fire Attack reveals, discards a matching suit, then deals fire damage", () => {
    const state = createGameState({
      seed: 2032,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [
            {
              definitionId: STANDARD_CARD.fireAttack,
              suit: "diamond",
              rank: 12
            },
            {
              definitionId: STANDARD_CARD.peach,
              suit: "heart",
              rank: 3
            }
          ]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [{
            definitionId: STANDARD_CARD.jink,
            suit: "heart",
            rank: 2
          }]
        }
      ]
    });
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: cardId(state, STANDARD_CARD.fireAttack),
        targetIds: ["p2"]
      },
      registry
    );
    result = passNullificationWindow(result);
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p2",
      reason: "fire-attack-reveal"
    });
    let choice = getLegalActions(result.state, registry).find(
      (action) => action.type === "choose-cards"
    )!;
    result = dispatch(result.state, choice, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p1",
      reason: "fire-attack-discard"
    });
    choice = getLegalActions(result.state, registry).find(
      (action) => action.type === "choose-cards"
    )!;
    result = dispatch(result.state, choice, registry);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "CardRevealed", playerId: "p2" }),
        expect.objectContaining({
          type: "DamageApplied",
          nature: "fire",
          amount: 1
        })
      ])
    );
  });

  test("Kylin Bow offers only the damaged target's horses for discard", () => {
    let state = twoPlayerGame(
      [STANDARD_CARD.kylinBow, STANDARD_CARD.slash],
      [STANDARD_CARD.jueying]
    );
    const bowId = cardId(state, STANDARD_CARD.kylinBow);
    state.zones[handZone("p1")]!.splice(
      state.zones[handZone("p1")]!.indexOf(bowId),
      1
    );
    state.zones[equipmentZone("p1")]!.push(bowId);
    const horseId = state.zones[handZone("p2")]![0]!;
    state.zones[handZone("p2")] = [];
    state.zones[equipmentZone("p2")]!.push(horseId);

    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: cardId(state, STANDARD_CARD.slash),
      targetIds: ["p2"]
    }, registry);
    result = passCurrent(result);
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p1",
      selectableCardIds: [horseId],
      minimum: 0,
      maximum: 1,
      reason: "kylin-bow"
    });
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      cardIds: [horseId]
    }, registry);

    expect(result.state.zones[equipmentZone("p2")]).toEqual([]);
    expect(result.state.zones[DISCARD_PILE]).toContain(horseId);
  });

  test("Halberd raises Slash target capacity when Slash is the last hand card", () => {
    let state = createGameState({
      seed: 2033,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.halberd, STANDARD_CARD.slash]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 },
        { id: "p3", heroDefinitionId: "hero:p3", maxHp: 4 },
        { id: "p4", heroDefinitionId: "hero:p4", maxHp: 4 }
      ]
    });
    const halberdId = state.zones[handZone("p1")]!.find(
      (id) => state.cards[id]?.definitionId === STANDARD_CARD.halberd
    )!;
    state.zones[handZone("p1")]!.splice(
      state.zones[handZone("p1")]!.indexOf(halberdId),
      1
    );
    state.zones[equipmentZone("p1")]!.push(halberdId);
    const slashId = state.zones[handZone("p1")]![0]!;
    const action = getLegalActions(state, registry).find(
      (candidate) =>
        candidate.type === "use-card" &&
        candidate.cardId === slashId &&
        candidate.targetIds.length === 3
    )!;
    expect(action).toMatchObject({ targetIds: ["p2", "p3", "p4"] });

    let result = dispatch(state, action, registry);
    result = passCurrent(result);
    result = passCurrent(result);
    result = passCurrent(result);
    expect([
      result.state.players.p2?.hp,
      result.state.players.p3?.hp,
      result.state.players.p4?.hp
    ]).toEqual([3, 3, 3]);
  });

  test("Double Sword pauses before Slash response for the opposite-gender choice", () => {
    let state = createGameState({
      seed: 2034,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.doubleSword, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("甄姬"),
          maxHp: 3,
          hand: [STANDARD_CARD.jink, STANDARD_CARD.peach]
        }
      ]
    });
    const weaponId = state.zones[handZone("p1")]!.find(
      (id) => state.cards[id]?.definitionId === STANDARD_CARD.doubleSword
    )!;
    state.zones[handZone("p1")]!.splice(
      state.zones[handZone("p1")]!.indexOf(weaponId),
      1
    );
    state.zones[equipmentZone("p1")]!.push(weaponId);
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: cardId(state, STANDARD_CARD.slash),
      targetIds: ["p2"]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      options: ["discard", "draw"],
      reason: "double-sword"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      option: "discard"
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p2",
      reason: "double-sword-discard"
    });
    const discardedId = result.state.zones[handZone("p2")]!.find(
      (id) => result.state.cards[id]?.definitionId === STANDARD_CARD.peach
    )!;
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      cardIds: [discardedId]
    }, registry);
    expect(result.state.zones[DISCARD_PILE]).toContain(discardedId);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "jink"
    });
  });

  test("Blade follows a cancelled Slash through the generic causal event", () => {
    let state = twoPlayerGame(
      [STANDARD_CARD.blade, STANDARD_CARD.slash, STANDARD_CARD.slash],
      [STANDARD_CARD.jink]
    );
    const weaponId = cardId(state, STANDARD_CARD.blade);
    state.zones[handZone("p1")]!.splice(
      state.zones[handZone("p1")]!.indexOf(weaponId),
      1
    );
    state.zones[equipmentZone("p1")]!.push(weaponId);
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: cardId(state, STANDARD_CARD.slash),
      targetIds: ["p2"]
    }, registry);
    const jinkId = result.state.zones[handZone("p2")]![0]!;
    result = dispatch(result.state, {
      type: "respond-card",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      cardId: jinkId
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      reason: "blade"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p1",
      reason: "blade-slash"
    });
    const followUpId = getLegalActions(result.state, registry).find(
      (action) => action.type === "choose-cards"
    )!.cardIds[0]!;
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      cardIds: [followUpId]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "jink"
    });
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p2",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "CardUsed",
        playerId: "p1",
        cardId: followUpId,
        targetIds: ["p2"],
        skillId: STANDARD_CARD.blade
      })
    ]));
  });

  test("Axe discards two owned cards to replace a cancelled Slash with damage", () => {
    let state = twoPlayerGame(
      [STANDARD_CARD.axe, STANDARD_CARD.slash, STANDARD_CARD.peach],
      [STANDARD_CARD.jink]
    );
    const weaponId = cardId(state, STANDARD_CARD.axe);
    state.zones[handZone("p1")]!.splice(
      state.zones[handZone("p1")]!.indexOf(weaponId),
      1
    );
    state.zones[equipmentZone("p1")]!.push(weaponId);
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: cardId(state, STANDARD_CARD.slash),
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "respond-card",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      cardId: result.state.zones[handZone("p2")]![0]!
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      reason: "axe"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p1",
      minimum: 2,
      maximum: 2,
      reason: "axe-discard"
    });
    const discardedCardIds = getLegalActions(result.state, registry).find(
      (action) => action.type === "choose-cards"
    )!.cardIds;
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      cardIds: discardedCardIds
    }, registry);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.zones[DISCARD_PILE]).toEqual(
      expect.arrayContaining(discardedCardIds)
    );
  });

  test("Ice Sword intercepts generic damage without applying it twice", () => {
    let state = twoPlayerGame(
      [STANDARD_CARD.iceSword, STANDARD_CARD.slash],
      [STANDARD_CARD.jink, STANDARD_CARD.peach]
    );
    const weaponId = cardId(state, STANDARD_CARD.iceSword);
    state.zones[handZone("p1")]!.splice(
      state.zones[handZone("p1")]!.indexOf(weaponId),
      1
    );
    state.zones[equipmentZone("p1")]!.push(weaponId);
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: cardId(state, STANDARD_CARD.slash),
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p2",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      reason: "ice-sword"
    });
    expect(result.state.pendingDecision?.continuation).toMatchObject({
      type: "discard-effect-replacement",
      stage: "offer",
      playerId: "p1",
      count: 2,
      replacedEffect: {
        type: "damage",
        sourceId: "p1",
        targetId: "p2"
      }
    });
    expect(
      JSON.stringify(result.state.pendingDecision?.continuation)
    ).not.toContain("workflow");
    expect(
      JSON.stringify(result.state.pendingDecision?.continuation)
    ).not.toContain("interceptedEffect");
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    const discardedCardIds = getLegalActions(result.state, registry).find(
      (action) => action.type === "choose-cards"
    )!.cardIds;
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      cardIds: discardedCardIds
    }, registry);
    expect(result.state.players.p2?.hp).toBe(4);
    expect(result.state.zones[handZone("p2")]).toEqual([]);
    expect(result.state.zones[DISCARD_PILE]).toEqual(
      expect.arrayContaining(discardedCardIds)
    );

    state = twoPlayerGame(
      [STANDARD_CARD.iceSword, STANDARD_CARD.slash],
      [STANDARD_CARD.peach]
    );
    const secondWeaponId = cardId(state, STANDARD_CARD.iceSword);
    state.zones[handZone("p1")]!.splice(
      state.zones[handZone("p1")]!.indexOf(secondWeaponId),
      1
    );
    state.zones[equipmentZone("p1")]!.push(secondWeaponId);
    state.players.p1!.skillIds = [standardSkillId("裸衣")];
    state.players.p1!.marks.luoyi = true;
    result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: cardId(state, STANDARD_CARD.slash),
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p2",
      decisionId: result.pendingDecision!.id
    }, registry);
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "skip"
    }, registry);
    expect(result.state.players.p2?.hp).toBe(2);
  });

  test("Eight Diagram turns a red generic judgment into a Jink result", () => {
    let state = createGameState({
      seed: 2035,
      drawPile: [STANDARD_CARD.peach],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.eightDiagram]
        }
      ]
    });
    const armorId = state.zones[handZone("p2")]![0]!;
    state.zones[handZone("p2")] = [];
    state.zones[equipmentZone("p2")]!.push(armorId);
    const judgmentCardId = state.zones["zone:draw"]![0]!;
    state.cards[judgmentCardId]!.suit = "heart";
    state.cards[judgmentCardId]!.rank = 7;
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "eight-diagram"
    });
    expect(result.state.pendingDecision?.continuation).toMatchObject({
      type: "judgment-response",
      playerId: "p2",
      reason: "eight-diagram",
      response: {
        type: "request-response",
        responseKind: "jink"
      }
    });
    expect(
      JSON.stringify(result.state.pendingDecision?.continuation)
    ).not.toContain("workflow");
    expect(
      JSON.stringify(result.state.pendingDecision?.continuation)
    ).not.toContain("interceptedEffect");
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    expect(result.state.players.p2?.hp).toBe(4);
    expect(result.pendingDecision).toBeNull();
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "JudgmentResolved",
        playerId: "p2",
        judgmentCardId,
        matched: true
      }),
      expect.objectContaining({
        type: "CardCancelled",
        reason: "jink",
        targetId: "p2"
      })
    ]));
  });
});
