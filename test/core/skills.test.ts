import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createGameState,
  createStandardPack,
  createStandardRegistry,
  dispatch,
  equipmentZone,
  getLegalActions,
  handZone,
  judgmentZone,
  standardHeroId,
  standardSkillId
} from "../../src/core";
import type { SkillDefinition } from "../../src/core";

describe("registry-driven skills", () => {
  test("all standard heroes and skills are backed by complete definitions", () => {
    const pack = createStandardPack();
    expect(pack.skills).toHaveLength(40);
    expect(pack.heroes).toHaveLength(25);
    expect(
      pack.skills.filter((skill) => skill.implementation !== "complete")
    ).toEqual([]);
    expect(
      pack.heroes.filter((hero) => hero.implementation !== "complete")
    ).toEqual([]);
  });

  test("phase and turn-end skills modify generic effects and resolve queues", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 3,
      phase: "draw",
      drawPile: [
        STANDARD_CARD.slash,
        STANDARD_CARD.jink,
        STANDARD_CARD.peach,
        STANDARD_CARD.wine
      ],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 3,
          skillIds: [standardSkillId("英姿")]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        }
      ]
    });
    state = dispatch(
      state,
      { type: "advance-phase", playerId: "p1" },
      registry
    ).state;
    expect(state.zones[handZone("p1")]).toHaveLength(3);

    state = createGameState({
      seed: 4,
      phase: "discard",
      drawPile: [STANDARD_CARD.slash],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 3,
          skillIds: [standardSkillId("闭月")]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    state = dispatch(
      state,
      { type: "end-turn", playerId: "p1" },
      registry
    ).state;
    expect(state.zones[handZone("p1")]).toHaveLength(1);
    expect(state.triggerQueue).toEqual([]);
    expect(state.currentPlayerId).toBe("p2");
  });

  test("救援 reads recovery source and hero metadata without card-name checks", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 21,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("孙权"),
          hp: 1,
          maxHp: 4,
          skillIds: [standardSkillId("救援")]
        },
        {
          id: "p3",
          heroDefinitionId: standardHeroId("周瑜"),
          maxHp: 3,
          hand: [STANDARD_CARD.peach]
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
    result = dispatch(
      result.state,
      {
        type: "pass",
        playerId: "p2",
        decisionId: result.pendingDecision!.id
      },
      registry
    );
    const peachId = result.state.zones[handZone("p3")]![0]!;
    result = dispatch(
      result.state,
      {
        type: "respond-card",
        playerId: "p3",
        decisionId: result.pendingDecision!.id,
        cardId: peachId
      },
      registry
    );
    expect(result.state.players.p2).toMatchObject({
      hp: 2,
      alive: true,
      dying: false
    });
  });

  test("克己、空城和谦逊 alter the shared legal-action set", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 5,
      phase: "discard",
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          hp: 1,
          maxHp: 4,
          skillIds: [standardSkillId("克己")],
          hand: [
            STANDARD_CARD.slash,
            STANDARD_CARD.jink,
            STANDARD_CARD.peach
          ]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    expect(getLegalActions(state, registry)).toContainEqual({
      type: "end-turn",
      playerId: "p1"
    });
    state.turnUsage.p1!["standard:slash-use"] = 1;
    expect(getLegalActions(state, registry)).not.toContainEqual({
      type: "end-turn",
      playerId: "p1"
    });

    state = createGameState({
      seed: 6,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [
            STANDARD_CARD.slash,
            STANDARD_CARD.duel,
            STANDARD_CARD.snatch,
            STANDARD_CARD.indulgence
          ]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 3,
          skillIds: [
            standardSkillId("空城"),
            standardSkillId("谦逊")
          ]
        }
      ]
    });
    const targetedAtP2 = getLegalActions(state, registry).filter(
      (action) =>
        action.type === "use-card" && action.targetIds.includes("p2")
    );
    expect(targetedAtP2).toEqual([]);
  });

  test("马术 and 奇才 feed one shared target-set service", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 7,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          skillIds: [
            standardSkillId("马术"),
            standardSkillId("奇才")
          ],
          hand: [STANDARD_CARD.slash, STANDARD_CARD.snatch]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 },
        {
          id: "p3",
          heroDefinitionId: "hero:p3",
          maxHp: 4,
          hand: [STANDARD_CARD.jink]
        },
        { id: "p4", heroDefinitionId: "hero:p4", maxHp: 4 }
      ]
    });
    const actions = getLegalActions(state, registry);
    const slashId = state.zones[handZone("p1")]!.find(
      (id) => state.cards[id]?.definitionId === STANDARD_CARD.slash
    )!;
    const snatchId = state.zones[handZone("p1")]!.find(
      (id) => state.cards[id]?.definitionId === STANDARD_CARD.snatch
    )!;
    expect(actions).toContainEqual({
      type: "use-card",
      playerId: "p1",
      cardId: slashId,
      targetIds: ["p3"]
    });
    expect(actions).toContainEqual({
      type: "use-card",
      playerId: "p1",
      cardId: snatchId,
      targetIds: ["p3"]
    });
  });

  test("semantic card metadata lets base skills observe extension cards", () => {
    const registry = createStandardRegistry();
    registry.registerPack({
      id: "test-semantic-extension",
      version: "1.0.0",
      name: "语义扩展测试",
      requires: ["standard@0.3.0"],
      workflows: [],
      skills: [],
      heroes: [],
      cards: [{
        id: "test:new-trick",
        name: "新锦囊",
        category: "trick",
        active: true,
        implementation: "complete",
        target: { type: "none" },
        program: { steps: [] }
      }]
    });
    const state = createGameState({
      seed: 4,
      drawPile: [STANDARD_CARD.slash],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 3,
          skillIds: [standardSkillId("集智")],
          hand: ["test:new-trick"]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: []
      },
      registry
    );
    expect(
      result.state.zones[handZone("p1")]!.map(
        (id) => result.state.cards[id]?.definitionId
      )
    ).toEqual([STANDARD_CARD.slash]);
  });

  test("an event trigger schedules effects through the serializable queue", () => {
    const registry = createStandardRegistry();
    const recoverAfterDamage: SkillDefinition = {
      id: "test:recover-after-damage",
      name: "测试回复",
      abilities: [{
        type: "trigger",
        eventType: "DamageApplied",
        when: [{ type: "event-player-is-owner", field: "targetId" }],
        program: {
          steps: [{ type: "recover", player: "source", amount: 1 }]
        }
      }]
    };
    registry.registerSkill(recoverAfterDamage);
    let state = createGameState({
      seed: 5,
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
          hp: 1,
          maxHp: 4,
          skillIds: [recoverAfterDamage.id]
        }
      ]
    });
    const slashId = state.zones[handZone("p1")]![0]!;
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: slashId,
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
    expect(state.players.p2).toMatchObject({
      hp: 1,
      alive: true,
      dying: false
    });
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["DamageApplied", "HpRecovered"])
    );
    expect(state.triggerQueue).toEqual([]);
  });

  test("a modifier changes the same legal actions consumed by UI and AI", () => {
    const registry = createStandardRegistry();
    const ceasefire: SkillDefinition = {
      id: "test:ceasefire",
      name: "止战",
      abilities: [{
        type: "forbid-card-use",
        definitionIds: [STANDARD_CARD.slash]
      }]
    };
    registry.registerSkill(ceasefire);
    const state = createGameState({
      seed: 6,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          skillIds: [ceasefire.id],
          hand: [STANDARD_CARD.slash]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    expect(getLegalActions(state, registry)).toEqual([
      { type: "end-action-phase", playerId: "p1" }
    ]);
    expect(() =>
      dispatch(
        state,
        {
          type: "use-card",
          playerId: "p1",
          cardId: state.zones[handZone("p1")]![0]!,
          targetIds: ["p2"]
        },
        registry
      )
    ).toThrow(/illegal command/);
  });

  test("content pack registration is transactional for duplicate skills", () => {
    const registry = createStandardRegistry();
    const skill: SkillDefinition = { id: "test:duplicate", name: "重复" };
    registry.registerSkill(skill);
    expect(() =>
      registry.registerPack({
        id: "bad-pack",
        version: "1.0.0",
        name: "错误包",
        requires: ["standard@0.3.0"],
        cards: [],
        skills: [skill],
        heroes: []
      })
    ).toThrow(/duplicate skill definition/);
    expect(registry.packs().some((pack) => pack.id === "bad-pack")).toBe(false);
  });

  test("view-as actions consume material cards and use normal card effects", () => {
    const registry = createStandardRegistry();
    const redAsSlash: SkillDefinition = {
      id: "test:red-as-slash",
      name: "测试武圣",
      abilities: [{
        type: "view-as",
        id: "test:red-as-slash",
        definitionId: STANDARD_CARD.slash,
        materials: { zones: ["hand"], count: 1 },
        action: true
      }]
    };
    registry.registerSkill(redAsSlash);
    const state = createGameState({
      seed: 10,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          skillIds: [redAsSlash.id],
          hand: [STANDARD_CARD.jink]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const action = getLegalActions(state, registry).find(
      (candidate) => candidate.type === "use-virtual-card"
    );
    expect(action).toMatchObject({
      definitionId: STANDARD_CARD.slash,
      targetIds: ["p2"]
    });
    let result = dispatch(state, action!, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      responseKind: "jink"
    });
    result = dispatch(
      result.state,
      {
        type: "pass",
        playerId: "p2",
        decisionId: result.pendingDecision!.id
      },
      registry
    );
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.zones[handZone("p1")]).toEqual([]);
    expect(Object.values(result.state.cards).some((card) => card.virtual)).toBe(false);
    expect(result.state.eventLog).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "CardUsed",
          skillId: redAsSlash.id,
          materialCardIds: [state.zones[handZone("p1")]![0]!]
        })
      ])
    );
  });

  test("standard view-as skills share action and virtual-response commands", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 11,
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
          maxHp: 3,
          skillIds: [standardSkillId("倾国")],
          hand: [{
            definitionId: STANDARD_CARD.nullification,
            suit: "spade",
            rank: 7
          }]
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
    const qingguo = getLegalActions(result.state, registry).find(
      (action) =>
        action.type === "respond-virtual-card" &&
        action.skillId === standardSkillId("倾国")
    );
    expect(qingguo).toMatchObject({
      definitionId: STANDARD_CARD.jink
    });
    result = dispatch(result.state, qingguo!, registry);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.zones[handZone("p2")]).toEqual([]);
    expect(Object.values(result.state.cards).some((card) => card.virtual))
      .toBe(false);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "CardResponded",
        skillId: standardSkillId("倾国")
      })
    );

    state = createGameState({
      seed: 12,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          skillIds: [
            standardSkillId("武圣"),
            standardSkillId("龙胆"),
            standardSkillId("国色"),
            standardSkillId("奇袭")
          ],
          hand: [
            {
              definitionId: STANDARD_CARD.peach,
              suit: "heart",
              rank: 3
            },
            {
              definitionId: STANDARD_CARD.jink,
              suit: "club",
              rank: 4
            },
            {
              definitionId: STANDARD_CARD.peach,
              suit: "diamond",
              rank: 5
            }
          ]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        }
      ]
    });
    const actionSkills = getLegalActions(state, registry)
      .filter((action) => action.type === "use-virtual-card")
      .map((action) => action.skillId);
    expect(actionSkills).toEqual(
      expect.arrayContaining([
        standardSkillId("武圣"),
        standardSkillId("龙胆"),
        standardSkillId("国色"),
        standardSkillId("奇袭")
      ])
    );

    state = createGameState({
      seed: 13,
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
          hp: 1,
          maxHp: 3,
          skillIds: [standardSkillId("急救")],
          hand: [{
            definitionId: STANDARD_CARD.jink,
            suit: "diamond",
            rank: 2
          }]
        }
      ]
    });
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
        type: "pass",
        playerId: "p2",
        decisionId: result.pendingDecision!.id
      },
      registry
    );
    const jijiu = getLegalActions(result.state, registry).find(
      (action) =>
        action.type === "respond-virtual-card" &&
        action.skillId === standardSkillId("急救")
    );
    expect(jijiu).toBeDefined();
    result = dispatch(result.state, jijiu!, registry);
    expect(result.state.players.p2).toMatchObject({
      hp: 1,
      alive: true,
      dying: false
    });
  });

  test("反馈、天妒和枭姬 resolve through generic events and zones", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 14,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.slash, STANDARD_CARD.jink]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          skillIds: [standardSkillId("反馈")]
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
    expect(result.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p2",
      reason: "fankui"
    });
    const feedback = getLegalActions(result.state, registry).find(
      (action) => action.type === "choose-cards"
    )!;
    const gainedCardId = feedback.type === "choose-cards"
      ? feedback.cardIds[0]!
      : "";
    result = dispatch(result.state, feedback, registry);
    expect(result.state.zones[handZone("p2")]).toContain(gainedCardId);

    state = createGameState({
      seed: 15,
      drawPile: [STANDARD_CARD.slash, STANDARD_CARD.jink],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 3,
          skillIds: [standardSkillId("枭姬")],
          hand: [STANDARD_CARD.crossbow, STANDARD_CARD.blade]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    for (const definitionId of [
      STANDARD_CARD.crossbow,
      STANDARD_CARD.blade
    ]) {
      const cardId = state.zones[handZone("p1")]!.find(
        (id) => state.cards[id]?.definitionId === definitionId
      )!;
      state = dispatch(
        state,
        {
          type: "use-card",
          playerId: "p1",
          cardId,
          targetIds: ["p1"]
        },
        registry
      ).state;
    }
    expect(state.zones[handZone("p1")]).toHaveLength(2);
    expect(
      state.zones[equipmentZone("p1")]!.map(
        (id) => state.cards[id]?.definitionId
      )
    ).toEqual([STANDARD_CARD.blade]);

    state = createGameState({
      seed: 16,
      phase: "judgment",
      drawPile: [{
        definitionId: STANDARD_CARD.slash,
        suit: "heart",
        rank: 7
      }],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 3,
          skillIds: [standardSkillId("天妒")]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.indulgence]
        }
      ]
    });
    const delayedCardId = state.zones[handZone("p2")]!.shift()!;
    state.zones[judgmentZone("p1")]!.push(delayedCardId);
    state.cards[delayedCardId]!.sourcePlayerId = "p2";
    result = dispatch(
      state,
      { type: "advance-phase", playerId: "p1" },
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
    expect(
      result.state.zones[handZone("p1")]!.map(
        (id) => result.state.cards[id]?.definitionId
      )
    ).toContain(STANDARD_CARD.slash);
  });

  test("active skills use one generic activation command and material flow", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 17,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          hp: 3,
          maxHp: 4,
          skillIds: [standardSkillId("仁德")],
          hand: [STANDARD_CARD.slash, STANDARD_CARD.jink]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const rende = getLegalActions(state, registry).find(
      (action) =>
        action.type === "activate-skill" &&
        action.skillId === standardSkillId("仁德") &&
        action.materialCardIds.length === 2
    )!;
    state = dispatch(state, rende, registry).state;
    expect(state.zones[handZone("p1")]).toEqual([]);
    expect(state.zones[handZone("p2")]).toHaveLength(2);
    expect(state.players.p1?.hp).toBe(4);

    state = createGameState({
      seed: 18,
      drawPile: [STANDARD_CARD.peach, STANDARD_CARD.wine],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          skillIds: [standardSkillId("制衡")],
          hand: [STANDARD_CARD.slash, STANDARD_CARD.jink]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const zhiheng = getLegalActions(state, registry).find(
      (action) =>
        action.type === "activate-skill" &&
        action.skillId === standardSkillId("制衡") &&
        action.materialCardIds.length === 2
    )!;
    state = dispatch(state, zhiheng, registry).state;
    expect(state.zones[handZone("p1")]).toHaveLength(2);
    expect(
      getLegalActions(state, registry).some(
        (action) =>
          action.type === "activate-skill" &&
          action.skillId === standardSkillId("制衡")
      )
    ).toBe(false);

    state = createGameState({
      seed: 19,
      drawPile: [STANDARD_CARD.slash, STANDARD_CARD.jink],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          hp: 3,
          maxHp: 4,
          skillIds: [standardSkillId("苦肉")]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const kurou = getLegalActions(state, registry).find(
      (action) =>
        action.type === "activate-skill" &&
        action.skillId === standardSkillId("苦肉")
    )!;
    state = dispatch(state, kurou, registry).state;
    expect(state.players.p1?.hp).toBe(2);
    expect(state.zones[handZone("p1")]).toHaveLength(2);

    state = createGameState({
      seed: 20,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 3,
          skillIds: [standardSkillId("青囊")],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          hp: 2,
          maxHp: 4
        }
      ]
    });
    const qingnang = getLegalActions(state, registry).find(
      (action) =>
        action.type === "activate-skill" &&
        action.skillId === standardSkillId("青囊")
    )!;
    state = dispatch(state, qingnang, registry).state;
    expect(state.players.p2?.hp).toBe(3);
    expect(state.zones[handZone("p1")]).toEqual([]);
  });

  test("奸雄 obtains the still-processing damage card through cause metadata", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 22,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          skillIds: [standardSkillId("奸雄")]
        }
      ]
    });
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p2",
      decisionId: result.pendingDecision!.id
    }, registry);

    expect(result.state.players.p2?.hp).toBe(3);
    expect(
      result.state.zones[handZone("p2")]?.map(
        (cardId) => result.state.cards[cardId]?.definitionId
      )
    ).toEqual([STANDARD_CARD.slash]);
  });

  test("结姻 uses generic material, target and once-per-turn rules", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 23,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("孙尚香"),
          hp: 2,
          maxHp: 3,
          skillIds: [standardSkillId("结姻")],
          hand: [STANDARD_CARD.slash, STANDARD_CARD.jink]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          hp: 3,
          maxHp: 4
        }
      ]
    });
    const action = getLegalActions(state, registry).find(
      (candidate) =>
        candidate.type === "activate-skill" &&
        candidate.skillId === standardSkillId("结姻")
    )!;
    state = dispatch(state, action, registry).state;

    expect(state.players.p1?.hp).toBe(3);
    expect(state.players.p2?.hp).toBe(4);
    expect(state.zones[handZone("p1")]).toEqual([]);
    expect(
      getLegalActions(state, registry).some(
        (candidate) =>
          candidate.type === "activate-skill" &&
          candidate.skillId === standardSkillId("结姻")
      )
    ).toBe(false);
  });

  test("无双 modifies Slash and Duel through the shared response counter", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 24,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("吕布"),
          maxHp: 4,
          skillIds: [standardSkillId("无双")],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4,
          hand: [STANDARD_CARD.jink, STANDARD_CARD.jink]
        }
      ]
    });
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    for (let index = 0; index < 2; index += 1) {
      const jinkId = result.state.zones[handZone("p2")]![0]!;
      result = dispatch(result.state, {
        type: "respond-card",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        cardId: jinkId
      }, registry);
      if (index === 0) {
        expect(result.pendingDecision).toMatchObject({
          type: "respond-card",
          playerId: "p2",
          responseKind: "jink"
        });
      }
    }
    expect(result.state.players.p2?.hp).toBe(4);

    state = createGameState({
      seed: 25,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("吕布"),
          maxHp: 4,
          skillIds: [standardSkillId("无双")],
          hand: [STANDARD_CARD.duel]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash, STANDARD_CARD.slash]
        }
      ]
    });
    result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    while (
      result.pendingDecision?.type === "respond-card" &&
      result.pendingDecision.responseKind === "nullification"
    ) {
      result = dispatch(result.state, {
        type: "pass",
        playerId: result.pendingDecision.playerId,
        decisionId: result.pendingDecision.id
      }, registry);
    }
    const firstSlashId = result.state.zones[handZone("p2")]![0]!;
    result = dispatch(result.state, {
      type: "respond-card",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      cardId: firstSlashId
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "slash"
    });
  });

  test("突袭 replaces the draw phase through generic player and card decisions", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 26,
      phase: "judgment",
      drawPile: [STANDARD_CARD.peach, STANDARD_CARD.wine],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("张辽"),
          maxHp: 4,
          skillIds: [standardSkillId("突袭")]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p3",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4,
          hand: [STANDARD_CARD.jink]
        }
      ]
    });
    let result = dispatch(state, {
      type: "advance-phase",
      playerId: "p1"
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "select-players",
      playerId: "p1",
      selectablePlayerIds: ["p2", "p3"],
      minimum: 0,
      maximum: 2,
      reason: "tuxi-targets"
    });
    result = dispatch(result.state, {
      type: "choose-players",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      playerIds: ["p2", "p3"]
    }, registry);
    for (const targetId of ["p2", "p3"]) {
      expect(result.pendingDecision).toMatchObject({
        type: "select-cards",
        playerId: "p1",
        reason: "tuxi-card"
      });
      const selectedCardId = getLegalActions(result.state, registry).find(
        (action) => action.type === "choose-cards"
      )!.cardIds[0]!;
      result = dispatch(result.state, {
        type: "choose-cards",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        cardIds: [selectedCardId]
      }, registry);
      expect(result.state.zones[handZone(targetId)]).toEqual([]);
    }
    expect(result.state.zones[handZone("p1")]).toHaveLength(2);
    result = dispatch(result.state, {
      type: "advance-phase",
      playerId: "p1"
    }, registry);
    expect(result.state.phase).toBe("action");
    expect(result.state.zones[handZone("p1")]).toHaveLength(2);
    expect(result.state.players.p1?.marks.skipDraw).toBe(false);
  });

  test("裸衣 uses a turn mark to modify the generic draw and damage effects", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 27,
      phase: "judgment",
      drawPile: [STANDARD_CARD.peach, STANDARD_CARD.wine],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("许褚"),
          maxHp: 4,
          skillIds: [standardSkillId("裸衣")],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4
        }
      ]
    });
    let result = dispatch(state, {
      type: "advance-phase",
      playerId: "p1"
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      reason: "luoyi"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    result = dispatch(result.state, {
      type: "advance-phase",
      playerId: "p1"
    }, registry);
    expect(result.state.zones[handZone("p1")]).toHaveLength(2);
    const slashId = result.state.zones[handZone("p1")]!.find(
      (id) => result.state.cards[id]?.definitionId === STANDARD_CARD.slash
    )!;
    result = dispatch(result.state, {
      type: "use-card",
      playerId: "p1",
      cardId: slashId,
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p2",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.state.players.p2?.hp).toBe(2);
    result = dispatch(result.state, {
      type: "end-action-phase",
      playerId: "p1"
    }, registry);
    result = dispatch(result.state, {
      type: "end-turn",
      playerId: "p1"
    }, registry);
    expect(result.state.players.p1?.marks.luoyi).toBe(false);
  });

  test("反间 transfers its material and resolves the target's suit choice", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 28,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("周瑜"),
          maxHp: 3,
          skillIds: [standardSkillId("反间")],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4
        }
      ]
    });
    const materialCardId = state.zones[handZone("p1")]![0]!;
    state.cards[materialCardId]!.suit = "heart";
    const action = getLegalActions(state, registry).find(
      (candidate) =>
        candidate.type === "activate-skill" &&
        candidate.skillId === standardSkillId("反间") &&
        candidate.targetIds[0] === "p2"
    )!;
    let result = dispatch(state, action, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "fanjian-suit"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      option: "spade"
    }, registry);
    expect(result.state.zones[handZone("p2")]).toContain(materialCardId);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "CardRevealed",
        cardId: materialCardId,
        reason: "fanjian"
      })
    ]));
  });

  test("离间 creates a normal virtual Duel between two ordered male targets", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 29,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("貂蝉"),
          maxHp: 3,
          skillIds: [standardSkillId("离间")],
          hand: [STANDARD_CARD.jink]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4
        },
        {
          id: "p3",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4
        }
      ]
    });
    const action = getLegalActions(state, registry).find(
      (candidate) =>
        candidate.type === "activate-skill" &&
        candidate.skillId === standardSkillId("离间") &&
        JSON.stringify(candidate.targetIds) === JSON.stringify(["p2", "p3"])
    )!;
    let result = dispatch(state, action, registry);
    while (
      result.pendingDecision?.type === "respond-card" &&
      result.pendingDecision.responseKind === "nullification"
    ) {
      result = dispatch(result.state, {
        type: "pass",
        playerId: result.pendingDecision.playerId,
        decisionId: result.pendingDecision.id
      }, registry);
    }
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p3",
      responseKind: "slash"
    });
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p3",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.state.players.p3?.hp).toBe(3);
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "CardUsed",
        playerId: "p2",
        targetIds: ["p3"],
        skillId: standardSkillId("离间")
      })
    ]));
  });

  test("鬼才 replaces the pending judgment before its generic result resolves", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 30,
      drawPile: [STANDARD_CARD.wine],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("司马懿"),
          maxHp: 3,
          skillIds: [standardSkillId("鬼才")],
          hand: [STANDARD_CARD.slash, STANDARD_CARD.peach]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.eightDiagram]
        }
      ]
    });
    const replacementCardId = state.zones[handZone("p1")]!.find(
      (id) => state.cards[id]?.definitionId === STANDARD_CARD.peach
    )!;
    state.cards[replacementCardId]!.suit = "spade";
    state.cards[replacementCardId]!.rank = 9;
    const judgmentCardId = state.zones["zone:draw"]![0]!;
    state.cards[judgmentCardId]!.suit = "heart";
    state.cards[judgmentCardId]!.rank = 2;
    const armorId = state.zones[handZone("p2")]![0]!;
    state.zones[handZone("p2")] = [];
    state.zones[equipmentZone("p2")]!.push(armorId);
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]!.find(
        (id) => state.cards[id]?.definitionId === STANDARD_CARD.slash
      )!,
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      reason: "guicai"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      cardIds: [replacementCardId]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "jink"
    });
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "JudgmentCardReplaced",
        oldCardId: judgmentCardId,
        newCardId: replacementCardId
      }),
      expect.objectContaining({
        type: "JudgmentResolved",
        judgmentCardId: replacementCardId,
        matched: false
      })
    ]));
  });

  test("铁骑 uses a declarative judgment to remove only that Slash response", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 31,
      drawPile: [STANDARD_CARD.peach],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("马超"),
          maxHp: 4,
          skillIds: [standardSkillId("铁骑")],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.jink]
        }
      ]
    });
    const judgmentCardId = state.zones["zone:draw"]![0]!;
    state.cards[judgmentCardId]!.suit = "diamond";
    state.cards[judgmentCardId]!.rank = 6;
    const result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    expect(result.pendingDecision).toBeNull();
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.zones[handZone("p2")]).toHaveLength(1);
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "JudgmentResolved",
        playerId: "p2",
        matched: true
      })
    ]));
  });

  test("刚烈 composes judgment and penalty decisions after damage", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 32,
      drawPile: [STANDARD_CARD.wine],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("夏侯惇"),
          maxHp: 4,
          skillIds: [standardSkillId("刚烈")]
        }
      ]
    });
    const judgmentCardId = state.zones["zone:draw"]![0]!;
    state.cards[judgmentCardId]!.suit = "spade";
    state.cards[judgmentCardId]!.rank = 4;
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p2",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "ganglie"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    expect(result.state.players.p1?.hp).toBe(3);
    expect(result.state.players.p2?.hp).toBe(3);
  });

  test("护驾 delegates the same serialized Jink response to Wei allies", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 33,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          skillIds: [standardSkillId("护驾")]
        },
        {
          id: "p3",
          heroDefinitionId: standardHeroId("司马懿"),
          maxHp: 3,
          hand: [STANDARD_CARD.jink]
        }
      ]
    });
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "hujia"
    });
    expect(result.state.pendingDecision?.continuation).toMatchObject({
      type: "delegated-response",
      stage: "offer",
      playerId: "p2",
      allyIds: ["p3"],
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
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p3",
      responseKind: "jink"
    });
    result = dispatch(result.state, {
      type: "respond-card",
      playerId: "p3",
      decisionId: result.pendingDecision!.id,
      cardId: result.state.zones[handZone("p3")]![0]!
    }, registry);
    expect(result.state.players.p2?.hp).toBe(4);
    expect(result.pendingDecision).toBeNull();
  });

  test("激将 reuses delegated Slash responses and enters the normal card pipeline", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 34,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4,
          skillIds: [standardSkillId("激将")]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("关羽"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p3",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4
        }
      ]
    });
    const action = getLegalActions(state, registry).find(
      (candidate) =>
        candidate.type === "activate-skill" &&
        candidate.skillId === standardSkillId("激将") &&
        candidate.targetIds[0] === "p3"
    )!;
    let result = dispatch(state, action, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "slash"
    });
    result = dispatch(result.state, {
      type: "respond-card",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      cardId: result.state.zones[handZone("p2")]![0]!
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p3",
      responseKind: "jink"
    });
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p3",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.state.players.p3?.hp).toBe(3);
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "CardUsed",
        playerId: "p1",
        targetIds: ["p3"],
        skillId: standardSkillId("激将")
      })
    ]));
  });

  test("遗计 resumes once per damage point and distributes each viewed card", () => {
    const registry = createStandardRegistry();
    let state = createGameState({
      seed: 35,
      drawPile: [
        STANDARD_CARD.peach,
        STANDARD_CARD.jink,
        STANDARD_CARD.wine,
        STANDARD_CARD.slash
      ],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.wine, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("郭嘉"),
          maxHp: 3,
          skillIds: [standardSkillId("遗计")]
        }
      ]
    });
    state = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]!.find(
        (id) => state.cards[id]?.definitionId === STANDARD_CARD.wine
      )!,
      targetIds: ["p1"]
    }, registry).state;
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p2",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "yiji"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    for (const recipientId of ["p1", "p2"]) {
      expect(result.pendingDecision).toMatchObject({
        type: "select-players",
        playerId: "p2",
        reason: "yiji-recipient"
      });
      result = dispatch(result.state, {
        type: "choose-players",
        playerId: "p2",
        decisionId: result.pendingDecision!.id,
        playerIds: [recipientId]
      }, registry);
    }
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "yiji"
    });
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      option: "skip"
    }, registry);
    expect(result.state.players.p2?.hp).toBe(1);
    expect(result.state.zones[handZone("p1")]).toHaveLength(1);
    expect(result.state.zones[handZone("p2")]).toHaveLength(1);
  });

  test("洛神 repeats the shared judgment and obtains only black results", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 36,
      currentPlayerId: "p2",
      phase: "discard",
      drawPile: [
        { definitionId: STANDARD_CARD.slash, suit: "spade", rank: 8 },
        { definitionId: STANDARD_CARD.peach, suit: "heart", rank: 3 }
      ],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("甄姬"),
          maxHp: 3,
          skillIds: [standardSkillId("洛神")]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4
        }
      ]
    });
    let result = dispatch(state, {
      type: "end-turn",
      playerId: "p2"
    }, registry);
    for (let index = 0; index < 2; index += 1) {
      expect(result.pendingDecision).toMatchObject({
        type: "choose-option",
        playerId: "p1",
        reason: "luoshen"
      });
      result = dispatch(result.state, {
        type: "choose-option",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        option: "activate"
      }, registry);
    }
    expect(result.pendingDecision).toBeNull();
    expect(
      result.state.zones[handZone("p1")]?.map(
        (id) => result.state.cards[id]?.definitionId
      )
    ).toEqual([STANDARD_CARD.slash]);
    expect(
      result.state.zones["zone:discard"]?.map(
        (id) => result.state.cards[id]?.definitionId
      )
    ).toContain(STANDARD_CARD.peach);
  });

  test("观星 serializes top and bottom ordering without a card-specific engine path", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 37,
      currentPlayerId: "p3",
      phase: "discard",
      drawPile: [
        STANDARD_CARD.slash,
        STANDARD_CARD.jink,
        STANDARD_CARD.peach,
        STANDARD_CARD.wine
      ],
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("诸葛亮"),
          maxHp: 3,
          skillIds: [standardSkillId("观星")]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4
        },
        {
          id: "p3",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4
        }
      ]
    });
    const idByDefinition = (definitionId: string) =>
      state.zones["zone:draw"]!.find(
        (id) => state.cards[id]?.definitionId === definitionId
      )!;
    const peachId = idByDefinition(STANDARD_CARD.peach);
    const jinkId = idByDefinition(STANDARD_CARD.jink);
    const slashId = idByDefinition(STANDARD_CARD.slash);
    const wineId = idByDefinition(STANDARD_CARD.wine);
    let result = dispatch(state, {
      type: "end-turn",
      playerId: "p3"
    }, registry);
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "activate"
    }, registry);
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "select"
    }, registry);
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      cardIds: [peachId]
    }, registry);
    result = dispatch(result.state, {
      type: "choose-option",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      option: "finish"
    }, registry);
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p1",
      decisionId: result.pendingDecision!.id,
      cardIds: [jinkId]
    }, registry);
    expect(result.pendingDecision).toBeNull();
    expect(result.state.zones["zone:draw"]).toEqual([
      peachId,
      wineId,
      jinkId,
      slashId
    ]);
  });

  test("流离 redirects the pending Slash effect and re-runs target modifiers", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 38,
      players: [
        {
          id: "p1",
          heroDefinitionId: standardHeroId("曹操"),
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: standardHeroId("大乔"),
          maxHp: 3,
          skillIds: [standardSkillId("流离")],
          hand: [STANDARD_CARD.peach]
        },
        {
          id: "p3",
          heroDefinitionId: standardHeroId("刘备"),
          maxHp: 4
        }
      ]
    });
    const discardCardId = state.zones[handZone("p2")]![0]!;
    let result = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId: state.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "liuli"
    });
    expect(result.state.pendingDecision?.continuation).toMatchObject({
      type: "target-redirection",
      stage: "offer",
      playerId: "p2",
      sourceId: "p1",
      selectablePlayerIds: ["p3"],
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
    result = dispatch(result.state, {
      type: "choose-cards",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      cardIds: [discardCardId]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "select-players",
      playerId: "p2",
      selectablePlayerIds: ["p3"],
      reason: "liuli-target"
    });
    result = dispatch(result.state, {
      type: "choose-players",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      playerIds: ["p3"]
    }, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p3",
      responseKind: "jink"
    });
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p3",
      decisionId: result.pendingDecision!.id
    }, registry);
    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.players.p3?.hp).toBe(3);
    expect(result.state.zones["zone:discard"]).toContain(discardCardId);
    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "TargetRedirected",
        cardId: expect.any(String),
        fromId: "p2",
        toId: "p3"
      })
    ]));
  });
});
