import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createFirePack,
  createForestPack,
  createManeuveringPack,
  createStandardPack,
  createStandardRegistry,
  createWindPack,
  dispatch,
  equipmentZone,
  handZone,
  standardSkillId
} from "../../src/core";
import { createGameState } from "../../src/core";

describe("early expansion content packs", () => {
  test("standard and maneuvering own separate card definitions", () => {
    const standard = createStandardPack();
    const maneuvering = createManeuveringPack();

    expect(standard.cards).toHaveLength(32);
    expect(maneuvering.cards).toHaveLength(11);
    expect(standard.prints).toHaveLength(108);
    expect(maneuvering.prints).toHaveLength(52);
    expect(new Set([
      ...standard.cards.map((card) => card.id),
      ...maneuvering.cards.map((card) => card.id)
    ]).size).toBe(43);
    expect(standard.cards.map((card) => card.id))
      .not.toContain(STANDARD_CARD.fireSlash);
    expect(maneuvering.cards.map((card) => card.id))
      .toContain(STANDARD_CARD.fireSlash);
    expect(maneuvering.requires).toEqual(["standard@0.3.0"]);
  });

  test("an unselected pack contributes neither cards nor heroes", () => {
    const registry = createEarlyExpansionRegistry([]);

    expect(registry.hasCard(STANDARD_CARD.slash)).toBe(true);
    expect(registry.hasCard(STANDARD_CARD.fireSlash)).toBe(false);
    expect(registry.heroes()).toHaveLength(25);
    expect(registry.cardPrints()).toHaveLength(108);
    expect(registry.packs().map((pack) => pack.id)).toEqual(["standard"]);
  });

  test("selected packs register all 24 real regular heroes in Core", () => {
    const registry = createEarlyExpansionRegistry([
      "wind",
      "military",
      "fire",
      "forest"
    ]);
    const expansionPacks = [
      createWindPack(),
      createFirePack(),
      createForestPack()
    ];

    expect(registry.heroes()).toHaveLength(49);
    expect(expansionPacks.map((pack) => pack.heroes.length))
      .toEqual([8, 8, 8]);
    expect(registry.packs().map((pack) => pack.id)).toEqual([
      "standard",
      "maneuvering",
      "wind",
      "fire",
      "forest"
    ]);
    expect(registry.cardPrints()).toHaveLength(160);
    for (const pack of expansionPacks) {
      expect(pack.provenance?.rulesSource?.revision)
        .toBe("b3b5ad83e7ed758ea2524b325528d2d507eb7f98");
      for (const hero of pack.heroes) {
        expect(registry.hero(hero.id)).toEqual(hero);
        for (const skillId of hero.skillIds) {
          expect(registry.skill(skillId)).toBeDefined();
        }
      }
    }
  });

  test("Wind Kuanggu is a complete event rule with generic distance and event-value expressions", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const kuanggu = registry.skill("wind:skill:狂骨");
    const weiyan = registry.hero("wind:hero:魏延");

    expect(kuanggu).toMatchObject({
      implementation: "complete",
      abilities: [{
        type: "trigger",
        eventType: "DamageApplied",
        predicate: {
          type: "compare",
          left: { type: "distance" },
          operator: "lte"
        }
      }]
    });
    expect(weiyan.implementation).toBe("complete");

    let state = createGameState({
      seed: 401,
      phase: "action",
      players: [
        {
          id: "p1",
          heroDefinitionId: weiyan.id,
          maxHp: 4,
          hp: 2,
          skillIds: [...weiyan.skillIds],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:hero:target",
          maxHp: 4
        }
      ]
    });
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

    expect(state.players.p1?.hp).toBe(3);
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["DamageApplied", "HpRecovered"])
    );
  });

  test("Wind Liegong offers a generic optional rule branch before Jink", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const huangzhong = registry.hero("wind:hero:黄忠");
    expect(huangzhong.implementation).toBe("complete");

    const createState = (targetHand: string[]) => createGameState({
      seed: 402,
      phase: "action",
      players: [
        {
          id: "p1",
          heroDefinitionId: huangzhong.id,
          maxHp: 4,
          skillIds: [...huangzhong.skillIds],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:hero:target",
          maxHp: 4,
          hand: targetHand
        }
      ]
    });

    let state = createState([
      STANDARD_CARD.jink,
      STANDARD_CARD.slash,
      STANDARD_CARD.peach,
      STANDARD_CARD.duel
    ]);
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
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      options: ["skip", "activate"],
      reason: "liegong"
    });
    result = dispatch(
      result.state,
      {
        type: "choose-option",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        option: "activate"
      },
      registry
    );
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.pendingDecision).toBeNull();
    expect(result.state.effectPlans).toEqual({});

    state = createState([
      STANDARD_CARD.jink,
      STANDARD_CARD.slash,
      STANDARD_CARD.peach,
      STANDARD_CARD.duel
    ]);
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
    result = dispatch(
      result.state,
      {
        type: "choose-option",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        option: "skip"
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "jink"
    });

    state = createState([STANDARD_CARD.jink, STANDARD_CARD.slash]);
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
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "jink"
    });
  });

  test("Wind Guidao configures the shared judgment replacement workflow", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const zhangjiao = registry.hero("wind:hero:张角");
    let state = createGameState({
      seed: 403,
      phase: "action",
      drawPile: [STANDARD_CARD.peach],
      players: [
        {
          id: "p1",
          heroDefinitionId: zhangjiao.id,
          maxHp: 3,
          skillIds: ["wind:skill:鬼道"],
          hand: [STANDARD_CARD.slash, STANDARD_CARD.peach]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:hero:target",
          maxHp: 4,
          hand: [STANDARD_CARD.eightDiagram]
        }
      ]
    });
    const replacementCardId = state.zones[handZone("p1")]!.find(
      (cardId) =>
        state.cards[cardId]?.definitionId === STANDARD_CARD.peach
    )!;
    state.cards[replacementCardId]!.suit = "spade";
    state.cards[replacementCardId]!.rank = 9;
    const judgmentCardId = state.zones["zone:draw"]![0]!;
    state.cards[judgmentCardId]!.suit = "heart";
    state.cards[judgmentCardId]!.rank = 2;
    const armorId = state.zones[handZone("p2")]![0]!;
    state.zones[handZone("p2")] = [];
    state.zones[equipmentZone("p2")]!.push(armorId);

    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]!.find(
          (cardId) =>
            state.cards[cardId]?.definitionId === STANDARD_CARD.slash
        )!,
        targetIds: ["p2"]
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "choose-option",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        option: "activate"
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      reason: "guidao"
    });
    result = dispatch(
      result.state,
      {
        type: "choose-option",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        option: "activate"
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p1",
      selectableCardIds: [replacementCardId],
      reason: "guidao-card"
    });
    result = dispatch(
      result.state,
      {
        type: "choose-cards",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        cardIds: [replacementCardId]
      },
      registry
    );

    expect(result.state.zones[handZone("p1")]).toContain(judgmentCardId);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "JudgmentCardReplaced",
        oldCardId: judgmentCardId,
        newCardId: replacementCardId
      })
    );
  });

  test("Wind Leiji reacts to the CardResponded event, not to Slash code", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const zhangjiao = registry.hero("wind:hero:张角");
    let state = createGameState({
      seed: 404,
      currentPlayerId: "p2",
      phase: "action",
      drawPile: [STANDARD_CARD.peach],
      players: [
        {
          id: "p1",
          heroDefinitionId: zhangjiao.id,
          maxHp: 3,
          skillIds: ["wind:skill:雷击"],
          hand: [STANDARD_CARD.jink]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:hero:attacker",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        }
      ]
    });
    const judgmentCardId = state.zones["zone:draw"]![0]!;
    state.cards[judgmentCardId]!.suit = "spade";
    state.cards[judgmentCardId]!.rank = 7;
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p2",
        cardId: state.zones[handZone("p2")]![0]!,
        targetIds: ["p1"]
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        cardId: result.state.zones[handZone("p1")]![0]!
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      reason: "leiji"
    });
    result = dispatch(
      result.state,
      {
        type: "choose-option",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        option: "activate"
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      type: "select-players",
      playerId: "p1",
      reason: "leiji-target"
    });
    result = dispatch(
      result.state,
      {
        type: "choose-players",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        playerIds: ["p2"]
      },
      registry
    );

    expect(result.state.players.p2?.hp).toBe(2);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "DamageApplied",
        sourceId: "p1",
        targetId: "p2",
        amount: 2,
        nature: "thunder"
      })
    );
  });

  test("Wind Hongyan changes the shared effective-suit query used by judgment", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const xiaoqiao = registry.hero("wind:hero:小乔");
    let state = createGameState({
      seed: 405,
      phase: "action",
      drawPile: [STANDARD_CARD.peach],
      players: [
        {
          id: "p1",
          heroDefinitionId: "fixture:hero:attacker",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: xiaoqiao.id,
          maxHp: 3,
          skillIds: ["wind:skill:红颜"],
          hand: [STANDARD_CARD.eightDiagram]
        }
      ]
    });
    const judgmentCardId = state.zones["zone:draw"]![0]!;
    state.cards[judgmentCardId]!.suit = "spade";
    state.cards[judgmentCardId]!.rank = 8;
    expect(
      registry.effectiveCardSuit(state, judgmentCardId, "p2")
    ).toBe("heart");
    const armorId = state.zones[handZone("p2")]![0]!;
    state.zones[handZone("p2")] = [];
    state.zones[equipmentZone("p2")]!.push(armorId);

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
    result = dispatch(
      result.state,
      {
        type: "choose-option",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        option: "activate"
      },
      registry
    );

    expect(result.pendingDecision).toBeNull();
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "JudgmentResolved",
        playerId: "p2",
        judgmentCardId,
        matched: true
      })
    );
  });

  test("Pang De reuses the standard Ma Shu rule instead of duplicating it", () => {
    const registry = createEarlyExpansionRegistry(["fire"]);
    const pangde = registry.heroes().find((hero) => hero.name === "庞德");

    expect(pangde?.skillIds).toContain(standardSkillId("马术"));
    expect(registry.skill(standardSkillId("马术")).implementation)
      .toBe("complete");
  });

  test("the compatibility registry still loads the complete 43-card ruleset", () => {
    const registry = createStandardRegistry();

    expect(registry.hasCard(STANDARD_CARD.fireAttack)).toBe(true);
    expect(registry.packs().map((pack) => pack.id)).toEqual([
      "standard",
      "maneuvering"
    ]);
  });
});
