import { expect, test } from "vitest";
import {
  DISCARD_PILE,
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createGameState,
  dispatch,
  getLegalActions,
  handZone,
  judgmentZone,
  serializeGameState
} from "../../src/core";

test("苦肉未获救死亡后不会继续摸牌", () => {
  const registry = createEarlyExpansionRegistry([]);
  const state = createGameState({
    seed: 799,
    currentPlayerId: "p1",
    phase: "action",
    players: [
      {
        id: "p1",
        identity: "loyalist",
        heroDefinitionId: "standard:hero:黄盖",
        maxHp: 4,
        hp: 1,
        skillIds: ["standard:skill:苦肉"]
      },
      {
        id: "p2",
        identity: "lord",
        heroDefinitionId: "fixture:p2",
        maxHp: 4
      },
      {
        id: "p3",
        identity: "rebel",
        heroDefinitionId: "fixture:p3",
        maxHp: 4
      },
      {
        id: "p4",
        identity: "renegade",
        heroDefinitionId: "fixture:p4",
        maxHp: 4
      }
    ],
    drawPile: [STANDARD_CARD.slash, STANDARD_CARD.jink]
  });
  const activate = getLegalActions(state, registry).find(
    (action) =>
      action.type === "activate-skill" &&
      action.skillId === "standard:skill:苦肉"
  )!;
  let result = dispatch(state, activate, registry);
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

  expect(result.state.players.p1).toMatchObject({
    alive: false,
    hp: 0
  });
  expect(result.state.zones[handZone("p1")]).toEqual([]);
  expect(result.state.zones["zone:draw"]).toHaveLength(2);
  expect(result.state.eventLog.filter(
    (event) =>
      event.type === "CardsDrawn" &&
      event.playerId === "p1"
  )).toEqual([]);
});

test("驱虎拼点获胜先移动拼点牌，再恢复目标选择", () => {
  const registry = createEarlyExpansionRegistry(["fire"]);
  const state = createGameState({
    seed: 800,
    players: [
      {
        id: "p1",
        heroDefinitionId: "fire:hero:荀彧",
        maxHp: 3,
        hp: 2,
        skillIds: ["fire:skill:驱虎"],
        hand: [{
          definitionId: STANDARD_CARD.slash,
          suit: "spade",
          rank: 13
        }]
      },
      {
        id: "p2",
        heroDefinitionId: "fixture:p2",
        maxHp: 4,
        hand: [{
          definitionId: STANDARD_CARD.jink,
          suit: "heart",
          rank: 1
        }]
      },
      {
        id: "p3",
        heroDefinitionId: "fixture:p3",
        maxHp: 4
      }
    ]
  });
  const sourceCardId = state.zones[handZone("p1")]![0]!;
  const opponentCardId = state.zones[handZone("p2")]![0]!;
  const activate = getLegalActions(state, registry).find(
    (action) =>
      action.type === "activate-skill" &&
      action.skillId === "fire:skill:驱虎" &&
      action.materialCardIds[0] === sourceCardId &&
      action.targetIds[0] === "p2"
  )!;
  let result = dispatch(state, activate, registry);
  expect(result.pendingDecision).toMatchObject({
    type: "select-cards",
    playerId: "p2"
  });
  result = dispatch(result.state, {
    type: "choose-cards",
    playerId: "p2",
    decisionId: result.pendingDecision!.id,
    cardIds: [opponentCardId]
  }, registry);
  expect(result.state.zones[DISCARD_PILE]).toEqual(
    expect.arrayContaining([sourceCardId, opponentCardId])
  );
  expect(result.pendingDecision).toMatchObject({
    type: "select-players",
    playerId: "p1",
    reason: "quhu-damage"
  });
  const targetP3 = getLegalActions(result.state, registry).find(
    (action) =>
      action.type === "choose-players" &&
      action.playerIds[0] === "p3"
  )!;
  result = dispatch(result.state, targetP3, registry);
  expect(result.state.players.p3?.hp).toBe(3);
  expect(result.state.eventLog).toContainEqual(
    expect.objectContaining({
      type: "DamageApplied",
      sourceId: "p2",
      targetId: "p3"
    })
  );
});

test("断粮把实体材料放入判定区，不留下已删除的虚拟卡引用", () => {
  const registry = createEarlyExpansionRegistry(["military", "forest"]);
  const state = createGameState({
    seed: 801,
    players: [
      {
        id: "p1",
        heroDefinitionId: "forest:hero:徐晃",
        maxHp: 4,
        skillIds: ["forest:skill:断粮"],
        hand: [{
          definitionId: STANDARD_CARD.slash,
          suit: "spade",
          rank: 7
        }]
      },
      {
        id: "p2",
        heroDefinitionId: "fixture:p2",
        maxHp: 4
      }
    ]
  });
  const materialCardId = state.zones[handZone("p1")]![0]!;
  const action = getLegalActions(state, registry).find(
    (candidate) =>
      candidate.type === "use-virtual-card" &&
      candidate.skillId === "forest:skill:断粮" &&
      candidate.materialCardIds[0] === materialCardId
  )!;
  let result = dispatch(state, action, registry);
  while (result.pendingDecision) {
    const pass = getLegalActions(result.state, registry).find(
      (candidate) => candidate.type === "pass"
    )!;
    result = dispatch(result.state, pass, registry);
  }
  expect(result.state.zones[judgmentZone("p2")]).toEqual([materialCardId]);
  expect(result.state.cards[materialCardId]).toMatchObject({
    definitionId: STANDARD_CARD.supplyShortage,
    suit: "spade",
    rank: 7
  });
  expect(Object.keys(result.state.cards).some(
    (cardId) => cardId.startsWith("virtual-card-")
  )).toBe(false);
  expect(result.state.zones["zone:processing"]).toEqual([]);
  expect(() => serializeGameState(result.state)).not.toThrow();
});

test("蛊惑被质疑并取消后递归清理整棵效果计划", () => {
  const registry = createEarlyExpansionRegistry(["wind"]);
  const state = createGameState({
    seed: 802,
    players: [
      {
        id: "p1",
        heroDefinitionId: "wind:hero:于吉",
        maxHp: 3,
        skillIds: ["wind:skill:蛊惑"],
        hand: [STANDARD_CARD.dismantlement]
      },
      {
        id: "p2",
        heroDefinitionId: "fixture:p2",
        maxHp: 4
      }
    ]
  });
  const bluff = getLegalActions(state, registry).find(
    (candidate) =>
      candidate.type === "use-virtual-card" &&
      candidate.skillId === "wind:skill:蛊惑" &&
      candidate.definitionId === STANDARD_CARD.amazingGrace
  )!;
  let result = dispatch(state, bluff, registry);
  expect(result.pendingDecision).toMatchObject({
    type: "choose-option",
    playerId: "p2",
    reason: "guhuo-question"
  });
  result = dispatch(result.state, {
    type: "choose-option",
    playerId: "p2",
    decisionId: result.pendingDecision!.id,
    option: "question"
  }, registry);

  expect(result.pendingDecision).toBeNull();
  expect(result.state.effectPlans).toEqual({});
  expect(result.state.stack).toEqual([]);
  expect(result.state.triggerQueue).toEqual([]);
  expect(result.state.zones["zone:processing"]).toEqual([]);
  expect(result.state.eventLog).toContainEqual(expect.objectContaining({
    type: "CardCancelled",
    reason: "skill",
    sourceId: "p1"
  }));
  expect(() => serializeGameState(result.state)).not.toThrow();
});

test("黄天把群势力角色交出的闪移动到主公手牌", () => {
  const registry = createEarlyExpansionRegistry(["wind"]);
  const state = createGameState({
    seed: 803,
    currentPlayerId: "p2",
    players: [
      {
        id: "p1",
        identity: "lord",
        heroDefinitionId: "wind:hero:张角",
        maxHp: 3,
        skillIds: ["wind:skill:黄天"]
      },
      {
        id: "p2",
        heroDefinitionId: "standard:hero:吕布",
        maxHp: 4,
        hand: [STANDARD_CARD.jink]
      }
    ]
  });
  const materialCardId = state.zones[handZone("p2")]![0]!;
  const action = getLegalActions(state, registry).find(
    (candidate) =>
      candidate.type === "activate-skill" &&
      candidate.skillId === "wind:skill:黄天" &&
      candidate.materialCardIds[0] === materialCardId &&
      candidate.targetIds[0] === "p1"
  );

  expect(action).toBeDefined();
  const result = dispatch(state, action!, registry);

  expect(result.state.zones[handZone("p2")]).toEqual([]);
  expect(result.state.zones[handZone("p1")]).toEqual([materialCardId]);
  expect(result.state.zones["zone:processing"]).toEqual([]);
  expect(result.state.eventLog).toContainEqual(expect.objectContaining({
    type: "CardMoved",
    cardId: materialCardId,
    from: "zone:processing",
    to: handZone("p1"),
    reason: "give"
  }));
});

test("帷幕在合法目标阶段统一拦截没有 targeting 标签的黑色锦囊", () => {
  const registry = createEarlyExpansionRegistry(["military", "forest"]);
  const blackTargetedTricks = [
    STANDARD_CARD.duel,
    STANDARD_CARD.snatch,
    STANDARD_CARD.dismantlement,
    STANDARD_CARD.ironChain,
    STANDARD_CARD.fireAttack,
    STANDARD_CARD.indulgence,
    STANDARD_CARD.supplyShortage,
    STANDARD_CARD.lightning
  ];
  const state = createGameState({
    seed: 805,
    players: [
      {
        id: "p1",
        heroDefinitionId: "fixture:p1",
        maxHp: 4,
        hand: [
          ...blackTargetedTricks.map((definitionId, index) => ({
            definitionId,
            suit: "spade" as const,
            rank: index + 1
          })),
          {
            definitionId: STANDARD_CARD.dismantlement,
            suit: "heart" as const,
            rank: 12
          }
        ]
      },
      {
        id: "p2",
        heroDefinitionId: "forest:hero:贾诩",
        maxHp: 3,
        skillIds: ["forest:skill:帷幕"],
        hand: [STANDARD_CARD.jink]
      }
    ]
  });
  const actions = getLegalActions(state, registry).filter(
    (action) => action.type === "use-card" && action.targetIds.includes("p2")
  );
  const blackCardIds = new Set(
    state.zones[handZone("p1")]!.filter((cardId) =>
      state.cards[cardId]?.suit === "spade"
    )
  );
  expect(actions.filter((action) =>
    action.type === "use-card" && blackCardIds.has(action.cardId)
  )).toEqual([]);
  expect(actions).toContainEqual(expect.objectContaining({
    type: "use-card",
    cardId: state.zones[handZone("p1")]!.find((cardId) =>
      state.cards[cardId]?.definitionId === STANDARD_CARD.dismantlement &&
      state.cards[cardId]?.suit === "heart"
    ),
    targetIds: ["p2"]
  }));
});

test("天义的成功和失败状态覆盖普通杀、火杀和雷杀", () => {
  const registry = createEarlyExpansionRegistry(["military", "fire"]);
  const slashDefinitions = [
    STANDARD_CARD.slash,
    STANDARD_CARD.fireSlash,
    STANDARD_CARD.thunderSlash
  ];
  const createState = () => createGameState({
    seed: 806,
    players: [
      {
        id: "p1",
        heroDefinitionId: "fire:hero:太史慈",
        maxHp: 4,
        skillIds: ["fire:skill:天义"],
        hand: slashDefinitions
      },
      {
        id: "p2",
        heroDefinitionId: "fixture:p2",
        maxHp: 4
      }
    ]
  });

  const failed = createState();
  failed.players.p1!.marks["tianyi-failed"] = true;
  expect(getLegalActions(failed, registry).filter(
    (action) => action.type === "use-card"
  )).toEqual([]);

  const succeeded = createState();
  succeeded.players.p1!.marks["tianyi-success"] = true;
  succeeded.turnUsage.p1!["standard:slash-use"] = 1;
  const usableDefinitions = new Set(getLegalActions(succeeded, registry)
    .filter((action) => action.type === "use-card")
    .map((action) => succeeded.cards[action.cardId]!.definitionId));
  expect(usableDefinitions).toEqual(new Set(slashDefinitions));
});

test("乱武允许响应火杀和雷杀，而不是只识别普通杀", () => {
  const registry = createEarlyExpansionRegistry(["military", "forest"]);
  for (const [index, slashDefinition] of [
    STANDARD_CARD.fireSlash,
    STANDARD_CARD.thunderSlash
  ].entries()) {
    const state = createGameState({
      seed: 807 + index,
      players: [
        {
          id: "p1",
          heroDefinitionId: "forest:hero:贾诩",
          maxHp: 3,
          skillIds: ["forest:skill:乱武"]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4,
          hand: [slashDefinition]
        },
        {
          id: "p3",
          heroDefinitionId: "fixture:p3",
          maxHp: 4
        }
      ]
    });
    const activate = getLegalActions(state, registry).find(
      (action) =>
        action.type === "activate-skill" &&
        action.skillId === "forest:skill:乱武"
    )!;
    const result = dispatch(state, activate, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      acceptedDefinitionIds: expect.arrayContaining([slashDefinition])
    });
    expect(getLegalActions(result.state, registry)).toContainEqual(
      expect.objectContaining({
        type: "respond-card",
        playerId: "p2",
        cardId: result.state.zones[handZone("p2")]![0]
      })
    );
  }
});

test("神速和乱武生成的杀不会重新放回空城目标", () => {
  const windRegistry = createEarlyExpansionRegistry(["wind"]);
  const state = createGameState({
    seed: 809,
    currentPlayerId: "before",
    phase: "discard",
    players: [
      {
        id: "before",
        heroDefinitionId: "fixture:before",
        maxHp: 4,
        hand: [STANDARD_CARD.jink]
      },
      {
        id: "xiahouyuan",
        heroDefinitionId: "wind:hero:夏侯渊",
        maxHp: 4,
        skillIds: ["wind:skill:神速"]
      },
      {
        id: "kongcheng",
        heroDefinitionId: "standard:hero:诸葛亮",
        maxHp: 3,
        skillIds: ["standard:skill:空城"]
      }
    ]
  });
  let result = dispatch(state, {
    type: "end-turn",
    playerId: "before"
  }, windRegistry);
  expect(result.pendingDecision).toMatchObject({
    type: "choose-option",
    playerId: "xiahouyuan",
    reason: "shensu-1"
  });
  result = dispatch(result.state, {
    type: "choose-option",
    playerId: "xiahouyuan",
    decisionId: result.pendingDecision!.id,
    option: "activate"
  }, windRegistry);
  expect(result.pendingDecision).toMatchObject({
    type: "select-players",
    selectablePlayerIds: ["before"]
  });

  const forestRegistry = createEarlyExpansionRegistry([
    "military",
    "forest"
  ]);
  const luanwuState = createGameState({
    seed: 810,
    players: [
      {
        id: "jiaxu",
        heroDefinitionId: "forest:hero:贾诩",
        maxHp: 3,
        skillIds: ["forest:skill:乱武"]
      },
      {
        id: "actor",
        heroDefinitionId: "fixture:actor",
        maxHp: 4,
        hand: [STANDARD_CARD.fireSlash]
      },
      {
        id: "kongcheng",
        heroDefinitionId: "standard:hero:诸葛亮",
        maxHp: 3,
        skillIds: ["standard:skill:空城"]
      }
    ]
  });
  const activate = getLegalActions(luanwuState, forestRegistry).find(
    (action) =>
      action.type === "activate-skill" &&
      action.skillId === "forest:skill:乱武"
  )!;
  let luanwuResult = dispatch(luanwuState, activate, forestRegistry);
  expect(luanwuResult.pendingDecision).toMatchObject({
    type: "respond-card",
    playerId: "actor"
  });
  const slashResponse = getLegalActions(
    luanwuResult.state,
    forestRegistry
  ).find((action) => action.type === "respond-card")!;
  luanwuResult = dispatch(
    luanwuResult.state,
    slashResponse,
    forestRegistry
  );
  expect(luanwuResult.state.eventLog).toContainEqual(expect.objectContaining({
    type: "CardUsed",
    playerId: "actor",
    skillId: "forest:skill:乱武",
    targetIds: ["jiaxu"]
  }));
});
