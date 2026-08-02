import { describe, expect, test } from "vitest";
import {
  ACTIVE_SKILL_TARGET_INTENTS,
  GameSession,
  PolicySearchAgent,
  SelfPlayRunner,
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createGameState,
  createStandardRegistry,
  equipmentZone,
  handZone,
  inferIdentities,
  isClearRebelTarget,
  observeForPlayer,
  strategicIdentityTargetScore
} from "../../src/core";
import type {
  GameAgent,
  LegalAction,
  PlayerObservation
} from "../../src/core";

function responseGame() {
  const registry = createStandardRegistry();
  const session = new GameSession(createGameState({
    seed: 501,
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
        hand: [STANDARD_CARD.jink]
      }
    ]
  }), registry);
  session.dispatch({
    type: "use-card",
    playerId: "p1",
    cardId: session.state().zones[handZone("p1")]![0]!,
    targetIds: ["p2"]
  });
  return { registry, session };
}

describe("information-safe AI", () => {
  test("every targeted active skill declares an AI target intent", () => {
    const registry = createEarlyExpansionRegistry([
      "wind",
      "military",
      "fire",
      "forest"
    ]);
    const skillIds = [...new Set(registry.heroes().flatMap(
      (hero) => hero.skillIds
    ))];
    const targeted = skillIds.filter((skillId) =>
      (registry.skill(skillId).abilities ?? []).some(
        (ability) =>
          ability.type === "active" &&
          ability.target.type !== "none"
      )
    ).sort();

    expect(Object.keys(ACTIVE_SKILL_TARGET_INTENTS).sort()).toEqual(targeted);
  });

  test("the standard policy uses a legal Jink instead of passing", () => {
    const { registry, session } = responseGame();
    const observation = observeForPlayer(session.state(), "p2", registry);
    const action = new PolicySearchAgent().chooseAction(observation);
    expect(action).toMatchObject({
      type: "respond-card",
      playerId: "p2"
    });
    expect(observation.legalActions).toContainEqual(action);
  });

  test("story AI sees fixed factions and does not attack a scripted ally", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 20260802,
      currentPlayerId: "guan-yu",
      phase: "action",
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "standard:hero:刘备",
          maxHp: 5
        },
        {
          id: "guan-yu",
          identity: "loyalist",
          heroDefinitionId: "standard:hero:关羽",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "zhang-fei",
          identity: "loyalist",
          heroDefinitionId: "standard:hero:张飞",
          maxHp: 4
        },
        {
          id: "dong-zhuo",
          identity: "rebel",
          heroDefinitionId: "forest:hero:董卓",
          maxHp: 8
        }
      ]
    });
    const observation = observeForPlayer(
      state,
      "guan-yu",
      registry,
      { revealAllIdentities: true }
    );

    expect(observeForPlayer(
      state,
      "guan-yu",
      registry
    ).players.map((player) => player.identity)).toEqual([
      "lord",
      "loyalist",
      null,
      null
    ]);
    expect(observation.players.map((player) => player.identity)).toEqual([
      "lord",
      "loyalist",
      "loyalist",
      "rebel"
    ]);
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "end-action-phase",
      playerId: "guan-yu"
    });
  });

  test("Guhuo questioning considers faction, health, and public credibility", () => {
    const registry = createStandardRegistry();
    const observationFor = (
      identity: "loyalist" | "rebel",
      hp: number,
      sourceIdentity: "lord" | "loyalist",
      truthfulHistory: boolean[] = []
    ) => {
      const state = createGameState({
        seed: 519,
        currentPlayerId: "self",
        players: [
          {
            id: "source",
            identity: sourceIdentity,
            heroDefinitionId: "wind:hero:于吉",
            maxHp: 3
          },
          {
            id: "self",
            identity,
            heroDefinitionId: "fixture:self",
            maxHp: 4,
            hp
          },
          {
            id: "other",
            identity: "renegade",
            heroDefinitionId: "fixture:other",
            maxHp: 4
          }
        ]
      });
      const observation = observeForPlayer(state, "self", registry);
      const source = observation.players.find((player) => player.id === "source")!;
      source.identity = sourceIdentity;
      observation.pendingDecision = {
        type: "choose-option",
        id: "decision:guhuo",
        playerId: "self",
        cardId: "virtual:guhuo",
        options: ["trust", "question"],
        reason: "guhuo-question"
      };
      observation.pendingGuhuoSourceId = "source";
      observation.guhuoHistory = truthfulHistory.map((truthful) => ({
        sourceId: "source",
        truthful
      }));
      observation.legalActions = ["trust", "question"].map((option) => ({
        type: "choose-option" as const,
        playerId: "self",
        decisionId: "decision:guhuo",
        option
      }));
      return observation;
    };
    const choose = (observation: PlayerObservation) =>
      new PolicySearchAgent().chooseAction(observation);

    expect(choose(observationFor("rebel", 4, "lord"))).toMatchObject({
      option: "question"
    });
    expect(choose(observationFor("loyalist", 4, "lord"))).toMatchObject({
      option: "trust"
    });
    expect(choose(observationFor("rebel", 1, "lord"))).toMatchObject({
      option: "trust"
    });
    expect(choose(observationFor(
      "loyalist",
      4,
      "loyalist",
      [false, false]
    ))).toMatchObject({ option: "question" });
  });

  test("AI Yu Ji does not burn a replay-sized hand on false Nullifications", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const session = new GameSession(createGameState({
      seed: 520,
      players: [
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "fixture:rebel",
          maxHp: 4,
          hand: [STANDARD_CARD.savageAssault]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
        },
        {
          id: "yuji",
          identity: "loyalist",
          heroDefinitionId: "wind:hero:于吉",
          maxHp: 3,
          skillIds: ["wind:skill:蛊惑"],
          hand: [
            STANDARD_CARD.ironChain,
            STANDARD_CARD.slash,
            STANDARD_CARD.amazingGrace,
            STANDARD_CARD.fireSlash,
            STANDARD_CARD.slash
          ]
        }
      ]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "rebel",
      cardId: session.state().zones[handZone("rebel")]![0]!,
      targetIds: []
    });
    while (session.state().pendingDecision?.request.playerId !== "yuji") {
      session.dispatch(session.legalActions().find(
        (action) => action.type === "pass"
      )!);
    }

    const observation = observeForPlayer(session.state(), "yuji", registry);
    observation.players.push(...Array.from({ length: 17 }, (_, index) => ({
      id: `table-player-${index}`,
      heroDefinitionId: `fixture:table-player-${index}`,
      hp: 4,
      maxHp: 4,
      alive: true,
      handSize: 4,
      identity: null
    })));
    expect(observation.legalActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "respond-virtual-card",
        skillId: "wind:skill:蛊惑",
        definitionId: STANDARD_CARD.nullification
      })
    ]));
    const chosen = new PolicySearchAgent().chooseAction(observation);
    expect(chosen).toMatchObject({
      type: "pass",
      playerId: "yuji"
    });
  });

  test("AI Yu Ji uses a real Nullification instead of declaring it via Guhuo", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const session = new GameSession(createGameState({
      seed: 521,
      players: [
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "fixture:rebel",
          maxHp: 4,
          hand: [STANDARD_CARD.savageAssault]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
        },
        {
          id: "yuji",
          identity: "loyalist",
          heroDefinitionId: "wind:hero:于吉",
          maxHp: 3,
          skillIds: ["wind:skill:蛊惑"],
          hand: [{
            definitionId: STANDARD_CARD.nullification,
            suit: "heart",
            rank: 12
          }]
        }
      ]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "rebel",
      cardId: session.state().zones[handZone("rebel")]![0]!,
      targetIds: []
    });
    while (session.state().pendingDecision?.request.playerId !== "yuji") {
      session.dispatch(session.legalActions().find(
        (action) => action.type === "pass"
      )!);
    }

    const observation = observeForPlayer(session.state(), "yuji", registry);
    expect(observation.legalActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "respond-card",
        playerId: "yuji"
      }),
      expect.objectContaining({
        type: "respond-virtual-card",
        skillId: "wind:skill:蛊惑"
      })
    ]));
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "respond-card",
      playerId: "yuji"
    });
  });

  test("a loyalist Nullifies a harmful effect aimed at the lord", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 508,
      players: [
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "hero:rebel",
          maxHp: 4,
          hand: [STANDARD_CARD.savageAssault]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "hero:loyalist",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        }
      ]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "rebel",
      cardId: session.state().zones[handZone("rebel")]![0]!,
      targetIds: []
    });
    while (session.state().pendingDecision?.request.playerId !== "loyalist") {
      session.dispatch(session.legalActions().find(
        (action) => action.type === "pass"
      )!);
    }
    const observation = observeForPlayer(
      session.state(),
      "loyalist",
      registry
    );
    expect(observation.pendingResponseContext).toMatchObject({
      targetId: "lord",
      cardDefinitionId: STANDARD_CARD.savageAssault,
      negated: false
    });
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "respond-card",
      playerId: "loyalist"
    });
  });

  test("a loyalist does not blindly Nullify the lord's beneficial card", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 509,
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hand: [STANDARD_CARD.exNihilo]
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "hero:loyalist",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        }
      ],
      drawPile: [STANDARD_CARD.slash, STANDARD_CARD.jink]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "lord",
      cardId: session.state().zones[handZone("lord")]![0]!,
      targetIds: []
    });
    session.dispatch(session.legalActions().find(
      (action) => action.type === "pass"
    )!);
    const observation = observeForPlayer(
      session.state(),
      "loyalist",
      registry
    );
    expect(observation.pendingResponseContext).toMatchObject({
      targetId: "lord",
      cardDefinitionId: STANDARD_CARD.exNihilo,
      negated: false
    });
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "pass",
      playerId: "loyalist"
    });
  });

  test("AI does not spend Nullification on a speculative Iron Chain toggle", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 522,
      players: [
        {
          id: "source",
          identity: "renegade",
          heroDefinitionId: "fixture:source",
          maxHp: 4,
          hand: [STANDARD_CARD.ironChain]
        },
        {
          id: "target",
          identity: "rebel",
          heroDefinitionId: "fixture:target",
          maxHp: 4
        },
        {
          id: "observer",
          identity: "loyalist",
          heroDefinitionId: "fixture:observer",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
        }
      ]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "source",
      cardId: session.state().zones[handZone("source")]![0]!,
      targetIds: ["target"]
    });
    while (session.state().pendingDecision?.request.playerId !== "observer") {
      session.dispatch(session.legalActions().find(
        (action) => action.type === "pass"
      )!);
    }

    const observation = observeForPlayer(
      session.state(),
      "observer",
      registry
    );
    expect(observation.players.find(
      (player) => player.id === "target"
    )?.identity).toBeNull();
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "pass",
      playerId: "observer"
    });
  });

  test("AI protects itself from becoming chained", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 523,
      players: [
        {
          id: "source",
          heroDefinitionId: "fixture:source",
          maxHp: 4,
          hand: [STANDARD_CARD.ironChain]
        },
        {
          id: "target",
          heroDefinitionId: "fixture:target",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        }
      ]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "source",
      cardId: session.state().zones[handZone("source")]![0]!,
      targetIds: ["target"]
    });
    while (session.state().pendingDecision?.request.playerId !== "target") {
      session.dispatch(session.legalActions().find(
        (action) => action.type === "pass"
      )!);
    }
    expect(new PolicySearchAgent().chooseAction(observeForPlayer(
      session.state(),
      "target",
      registry
    ))).toMatchObject({
      type: "respond-card",
      playerId: "target"
    });
  });

  test("AI recasts Iron Chain instead of toggling without a tactical payoff", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 524,
      players: [
        {
          id: "p1",
          heroDefinitionId: "fixture:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.ironChain]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4
        }
      ]
    });
    expect(new PolicySearchAgent().chooseAction(observeForPlayer(
      state,
      "p1",
      registry
    ))).toMatchObject({
      type: "use-card",
      targetIds: []
    });
  });

  test("AI ends its action phase instead of attacking the lord", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 525,
      players: [
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "fixture:loyalist",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
        }
      ]
    });
    expect(new PolicySearchAgent().chooseAction(observeForPlayer(
      state,
      "loyalist",
      registry
    ))).toMatchObject({
      type: "end-action-phase",
      playerId: "loyalist"
    });
  });

  test("AI commits a high-rank card to Pindian instead of choosing by card id", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 526,
      players: [
        {
          id: "p1",
          heroDefinitionId: "fixture:p1",
          maxHp: 4,
          hand: [
            {
              definitionId: STANDARD_CARD.peach,
              suit: "heart",
              rank: 2
            },
            {
              definitionId: STANDARD_CARD.slash,
              suit: "spade",
              rank: 13
            }
          ]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4
        }
      ]
    });
    const observation = observeForPlayer(state, "p1", registry);
    const [lowCardId, highCardId] = state.zones[handZone("p1")]!;
    observation.pendingDecision = {
      type: "select-cards",
      id: "decision:pindian",
      playerId: "p1",
      cardId: "system:pindian",
      selectableCardIds: [lowCardId!, highCardId!],
      minimum: 1,
      maximum: 1,
      reason: "tianyi-pindian"
    };
    observation.legalActions = [lowCardId!, highCardId!].map((cardId) => ({
      type: "choose-cards" as const,
      playerId: "p1",
      decisionId: "decision:pindian",
      cardIds: [cardId]
    }));

    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "choose-cards",
      cardIds: [highCardId]
    });
  });

  test("a loyalist rescues the lord with Peach", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 510,
      players: [
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "hero:rebel",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hp: 1
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "hero:loyalist",
          maxHp: 4,
          hand: [STANDARD_CARD.peach]
        }
      ]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "rebel",
      cardId: session.state().zones[handZone("rebel")]![0]!,
      targetIds: ["lord"]
    });
    while (session.state().pendingDecision?.request.playerId !== "loyalist") {
      session.dispatch(session.legalActions().find(
        (action) => action.type === "pass"
      )!);
    }

    const observation = observeForPlayer(
      session.state(),
      "loyalist",
      registry
    );
    expect(observation.pendingRescueTargetId).toBe("lord");
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "respond-card",
      playerId: "loyalist"
    });
  });

  test("a loyalist keeps Peach instead of rescuing a publicly hostile player", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 511,
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "hero:loyalist",
          maxHp: 4,
          hand: [STANDARD_CARD.peach]
        },
        {
          id: "suspect",
          identity: "rebel",
          heroDefinitionId: "hero:suspect",
          maxHp: 4,
          hp: 1
        }
      ]
    });
    state.eventLog.push({
      type: "DamageApplied",
      sequence: 1,
      revision: 0,
      sourceId: "suspect",
      targetId: "lord",
      amount: 1,
      cardId: "system:public-history",
      nature: "normal"
    });
    const session = new GameSession(state, registry);
    session.dispatch({
      type: "use-card",
      playerId: "lord",
      cardId: session.state().zones[handZone("lord")]![0]!,
      targetIds: ["suspect"]
    });
    while (session.state().pendingDecision?.request.playerId !== "loyalist") {
      session.dispatch(session.legalActions().find(
        (action) => action.type === "pass"
      )!);
    }

    const observation = observeForPlayer(
      session.state(),
      "loyalist",
      registry
    );
    expect(observation.pendingRescueTargetId).toBe("suspect");
    expect(observation.players.find(
      (player) => player.id === "suspect"
    )?.identity).toBeNull();
    expect(strategicIdentityTargetScore(observation, "suspect"))
      .toBeGreaterThan(20);
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "pass",
      playerId: "loyalist"
    });
  });

  test("a dying player still uses Peach for self rescue", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 512,
      players: [
        {
          id: "attacker",
          identity: "rebel",
          heroDefinitionId: "hero:attacker",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "victim",
          identity: "loyalist",
          heroDefinitionId: "hero:victim",
          maxHp: 4,
          hp: 1,
          hand: [STANDARD_CARD.peach]
        }
      ]
    }), registry);
    session.dispatch({
      type: "use-card",
      playerId: "attacker",
      cardId: session.state().zones[handZone("attacker")]![0]!,
      targetIds: ["victim"]
    });
    session.dispatch(session.legalActions().find(
      (action) => action.type === "pass"
    )!);

    const observation = observeForPlayer(
      session.state(),
      "victim",
      registry
    );
    expect(observation.pendingRescueTargetId).toBe("victim");
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "respond-card",
      playerId: "victim"
    });
  });

  test("search evaluators can replace policy without accessing GameState", () => {
    const { registry, session } = responseGame();
    const observation = observeForPlayer(session.state(), "p2", registry);
    const agent = new PolicySearchAgent([{
      evaluate(_observation, action) {
        return action.type === "pass" ? 1_000 : 0;
      }
    }]);
    expect(agent.chooseAction(observation).type).toBe("pass");
  });

  test("scores each legal action once even when the frontier is large", () => {
    const { registry, session } = responseGame();
    const observation = observeForPlayer(session.state(), "p2", registry);
    let evaluations = 0;
    const agent = new PolicySearchAgent([{
      evaluate(_observation, action) {
        evaluations += 1;
        return action.type === "pass" ? 1_000 : 0;
      }
    }]);
    expect(agent.chooseAction(observation).type).toBe("pass");
    expect(evaluations).toBe(observation.legalActions.length);
  });

  test.each([1, 2])("AI Huang Gai preserves a safe HP floor at %i HP", (hp) => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 512,
      currentPlayerId: "p1",
      phase: "action",
      players: [
        {
          id: "p1",
          heroDefinitionId: "standard:hero:黄盖",
          maxHp: 4,
          hp,
          skillIds: ["standard:skill:苦肉"]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4
        }
      ]
    });
    const observation = observeForPlayer(state, "p1", registry);

    expect(observation.legalActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "activate-skill",
          skillId: "standard:skill:苦肉"
        })
      ])
    );
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "end-action-phase",
      playerId: "p1"
    });
  });

  test("AI Huang Gai uses Kurou at most once per turn instead of going all in", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 513,
      currentPlayerId: "p1",
      phase: "action",
      players: [
        {
          id: "p1",
          heroDefinitionId: "standard:hero:黄盖",
          maxHp: 4,
          hp: 4,
          skillIds: ["standard:skill:苦肉"],
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4
        }
      ],
      drawPile: [STANDARD_CARD.jink, STANDARD_CARD.slash]
    }), registry);
    let observation = observeForPlayer(session.state(), "p1", registry);
    const first = new PolicySearchAgent().chooseAction(observation);
    expect(first).toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:苦肉"
    });
    session.dispatch(first);

    observation = observeForPlayer(session.state(), "p1", registry);
    expect(observation.ownTurnUsage?.["standard:skill:苦肉"]).toBe(1);
    expect(new PolicySearchAgent().chooseAction(observation)).not.toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:苦肉"
    });
    expect(session.state().players.p1?.hp).toBe(3);
  });

  test("AI Huang Gai continues Kurou only for a reachable Crossbow kill plan", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 514,
      currentPlayerId: "p1",
      phase: "action",
      players: [
        {
          id: "p1",
          identity: "loyalist",
          heroDefinitionId: "standard:hero:黄盖",
          maxHp: 4,
          hp: 4,
          skillIds: ["standard:skill:苦肉"],
          hand: [STANDARD_CARD.crossbow, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          identity: "rebel",
          heroDefinitionId: "fixture:p2",
          maxHp: 4,
          hp: 4
        }
      ],
      drawPile: [
        STANDARD_CARD.slash,
        STANDARD_CARD.slash,
        STANDARD_CARD.slash,
        STANDARD_CARD.slash
      ]
    });
    const crossbowId = state.zones[handZone("p1")]!.find(
      (cardId) =>
        state.cards[cardId]?.definitionId === STANDARD_CARD.crossbow
    )!;
    state.zones[handZone("p1")] = state.zones[handZone("p1")]!.filter(
      (cardId) => cardId !== crossbowId
    );
    state.zones[equipmentZone("p1")]!.push(crossbowId);
    const session = new GameSession(state, registry);
    const agent = new PolicySearchAgent();

    const first = agent.chooseAction(
      observeForPlayer(session.state(), "p1", registry)
    );
    expect(first).toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:苦肉"
    });
    session.dispatch(first);

    const second = agent.chooseAction(
      observeForPlayer(session.state(), "p1", registry)
    );
    expect(second).toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:苦肉"
    });
    session.dispatch(second);

    const attack = agent.chooseAction(
      observeForPlayer(session.state(), "p1", registry)
    );
    expect(attack).toMatchObject({
      type: "use-card",
      targetIds: ["p2"]
    });
    expect(session.state().players.p1?.hp).toBe(2);
    expect(session.state().turnUsage.p1?.["standard:skill:苦肉"]).toBe(2);
  });

  test("AI Huang Gai equips a Crossbow before starting the kill plan", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 515,
      currentPlayerId: "p1",
      phase: "action",
      players: [
        {
          id: "p1",
          identity: "loyalist",
          heroDefinitionId: "standard:hero:黄盖",
          maxHp: 4,
          hp: 4,
          skillIds: ["standard:skill:苦肉"],
          hand: [STANDARD_CARD.crossbow, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          identity: "rebel",
          heroDefinitionId: "fixture:p2",
          maxHp: 4,
          hp: 2
        }
      ]
    });
    const observation = observeForPlayer(state, "p1", registry);

    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "use-card",
      cardId: state.zones[handZone("p1")]!.find(
        (cardId) =>
          state.cards[cardId]?.definitionId === STANDARD_CARD.crossbow
      ),
      targetIds: ["p1"]
    });
  });

  test("AI Huang Gai rejects an all-in plan that cannot deal lethal damage", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 516,
      currentPlayerId: "p1",
      phase: "action",
      players: [
        {
          id: "p1",
          identity: "loyalist",
          heroDefinitionId: "standard:hero:黄盖",
          maxHp: 4,
          hp: 2,
          skillIds: ["standard:skill:苦肉"],
          hand: [STANDARD_CARD.crossbow, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          identity: "rebel",
          heroDefinitionId: "fixture:p2",
          maxHp: 4,
          hp: 4
        }
      ]
    });
    const crossbowId = state.zones[handZone("p1")]!.find(
      (cardId) =>
        state.cards[cardId]?.definitionId === STANDARD_CARD.crossbow
    )!;
    state.zones[handZone("p1")] = state.zones[handZone("p1")]!.filter(
      (cardId) => cardId !== crossbowId
    );
    state.zones[equipmentZone("p1")]!.push(crossbowId);
    const observation = observeForPlayer(state, "p1", registry);

    expect(new PolicySearchAgent().chooseAction(observation)).not.toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:苦肉"
    });
  });

  test("AI Huang Gai skips Kurou when two drawn cards would badly overflow hand limit", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 517,
      currentPlayerId: "p1",
      phase: "action",
      players: [
        {
          id: "p1",
          heroDefinitionId: "standard:hero:黄盖",
          maxHp: 4,
          hp: 4,
          skillIds: ["standard:skill:苦肉"],
          hand: [
            STANDARD_CARD.slash,
            STANDARD_CARD.slash,
            STANDARD_CARD.jink,
            STANDARD_CARD.jink,
            STANDARD_CARD.nullification
          ]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4
        }
      ]
    });
    const observation = observeForPlayer(state, "p1", registry);

    expect(new PolicySearchAgent().chooseAction(observation)).not.toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:苦肉"
    });
  });

  test("AI preserves Peach when choosing a mandatory discard", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 518,
      currentPlayerId: "p1",
      phase: "discard",
      players: [
        {
          id: "p1",
          heroDefinitionId: "fixture:p1",
          maxHp: 1,
          hand: [STANDARD_CARD.peach, STANDARD_CARD.slash]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4
        }
      ]
    });
    const observation = observeForPlayer(state, "p1", registry);

    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "discard-cards",
      cardIds: [
        state.zones[handZone("p1")]!.find(
          (cardId) =>
            state.cards[cardId]?.definitionId === STANDARD_CARD.slash
        )
      ]
    });
  });

  test("AI Dimeng plans a hand transfer from an enemy to an ally", () => {
    const registry = createEarlyExpansionRegistry([
      "military",
      "wind",
      "fire",
      "forest"
    ]);
    const state = createGameState({
      seed: 519,
      currentPlayerId: "self",
      phase: "action",
      players: [
        {
          id: "self",
          identity: "loyalist",
          heroDefinitionId: "forest:hero:鲁肃",
          maxHp: 3,
          skillIds: ["forest:skill:缔盟"],
          hand: [STANDARD_CARD.slash, STANDARD_CARD.jink]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
        },
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "fixture:rebel",
          maxHp: 4,
          hand: [STANDARD_CARD.slash, STANDARD_CARD.jink]
        }
      ]
    });
    const observation = observeForPlayer(state, "self", registry);

    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "activate-skill",
      skillId: "forest:skill:缔盟",
      targetIds: expect.arrayContaining(["lord", "rebel"])
    });
  });

  test("loyalist Zhou Yu does not use Fanjian on the lord", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 513,
      currentPlayerId: "loyalist",
      phase: "action",
      players: [
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "standard:hero:周瑜",
          maxHp: 3,
          skillIds: ["standard:skill:反间"],
          hand: [STANDARD_CARD.jink]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
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
    const action = new PolicySearchAgent().chooseAction(
      observeForPlayer(state, "loyalist", registry)
    );

    expect(action).toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:反间"
    });
    if (action.type !== "activate-skill") throw new Error("expected Fanjian");
    expect(action.targetIds).not.toContain("lord");
  });

  test("rebel Liu Bei gives Rende cards to a publicly inferred ally, never the lord", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 514,
      currentPlayerId: "self",
      phase: "action",
      players: [
        {
          id: "self",
          identity: "rebel",
          heroDefinitionId: "standard:hero:刘备",
          maxHp: 4,
          skillIds: ["standard:skill:仁德"],
          hand: Array.from({ length: 6 }, () => STANDARD_CARD.jink)
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4
        },
        {
          id: "ally",
          identity: "rebel",
          heroDefinitionId: "fixture:ally",
          maxHp: 4
        },
        {
          id: "hidden",
          identity: "loyalist",
          heroDefinitionId: "fixture:hidden",
          maxHp: 4
        }
      ]
    });
    state.eventLog.push({
      type: "DamageApplied",
      sequence: 1,
      revision: 0,
      sourceId: "ally",
      targetId: "lord",
      amount: 1,
      cardId: "system:public-history",
      nature: "normal"
    });
    const action = new PolicySearchAgent().chooseAction(
      observeForPlayer(state, "self", registry)
    );

    expect(action).toMatchObject({
      type: "activate-skill",
      skillId: "standard:skill:仁德",
      targetIds: ["ally"]
    });
    if (action.type !== "activate-skill") throw new Error("expected Rende");
    expect(action.materialCardIds).toHaveLength(2);
  });

  test("renegade Taishi Ci protects a one-HP lord when choosing Tianyi target", () => {
    const registry = createEarlyExpansionRegistry(["fire"]);
    const state = createGameState({
      seed: 515,
      currentPlayerId: "renegade",
      phase: "action",
      players: [
        {
          id: "renegade",
          identity: "renegade",
          heroDefinitionId: "fire:hero:太史慈",
          maxHp: 4,
          skillIds: ["fire:skill:天义"],
          hand: [STANDARD_CARD.jink]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "fixture:lord",
          maxHp: 4,
          hp: 1,
          hand: [STANDARD_CARD.jink]
        },
        {
          id: "loyalist",
          identity: "loyalist",
          heroDefinitionId: "fixture:loyalist",
          maxHp: 4,
          hand: [STANDARD_CARD.jink]
        },
        {
          id: "rebel",
          identity: "rebel",
          heroDefinitionId: "fixture:rebel",
          maxHp: 4,
          hand: [STANDARD_CARD.jink]
        }
      ]
    });
    const action = new PolicySearchAgent().chooseAction(
      observeForPlayer(state, "renegade", registry)
    );

    expect(action).toMatchObject({
      type: "activate-skill",
      skillId: "fire:skill:天义"
    });
    if (action.type !== "activate-skill") throw new Error("expected Tianyi");
    expect(action.targetIds).not.toContain("lord");
  });

  test("self-play is deterministic and records only validated actions", () => {
    const play = () => {
      const registry = createStandardRegistry();
      const session = new GameSession(createGameState({
        seed: 502,
        drawPile: [
          STANDARD_CARD.slash,
          STANDARD_CARD.jink,
          STANDARD_CARD.peach,
          STANDARD_CARD.exNihilo
        ],
        players: [
          {
            id: "p1",
            heroDefinitionId: "hero:p1",
            maxHp: 4,
            hand: [STANDARD_CARD.slash, STANDARD_CARD.peach]
          },
          {
            id: "p2",
            heroDefinitionId: "hero:p2",
            maxHp: 4,
            hand: [STANDARD_CARD.jink, STANDARD_CARD.slash]
          }
        ]
      }), registry);
      const result = new SelfPlayRunner(
        session,
        registry,
        new Map([
          ["p1", new PolicySearchAgent()],
          ["p2", new PolicySearchAgent()]
        ])
      ).run(80);
      return {
        state: result.state,
        actions: result.steps.map((step) => step.action),
        reason: result.reason
      };
    };

    expect(play()).toEqual(play());
  });

  test("self-play rejects an action not present in the observation", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(createGameState({
      seed: 503,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: []
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: []
        }
      ]
    }), registry);
    const illegalAgent: GameAgent = {
      chooseAction(observation: PlayerObservation): LegalAction {
        return {
          type: "end-turn",
          playerId: observation.selfId
        };
      }
    };
    const runner = new SelfPlayRunner(
      session,
      registry,
      new Map([
        ["p1", illegalAgent],
        ["p2", illegalAgent]
      ])
    );
    expect(() => runner.step()).toThrow("returned an illegal action");
  });

  test.each([
    {
      selfIdentity: "rebel" as const,
      expectedTargetId: "lord"
    },
    {
      selfIdentity: "loyalist" as const,
      expectedTargetId: "hidden"
    }
  ])("$selfIdentity uses only self and public lord identity", ({
    selfIdentity,
    expectedTargetId
  }) => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 504,
      currentPlayerId: "self",
      players: [
        {
          id: "self",
          identity: selfIdentity,
          heroDefinitionId: "hero:self",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4
        },
        {
          id: "far",
          identity: "renegade",
          heroDefinitionId: "hero:far",
          maxHp: 4
        },
        {
          id: "hidden",
          identity: selfIdentity === "rebel" ? "loyalist" : "rebel",
          heroDefinitionId: "hero:hidden",
          maxHp: 4
        }
      ]
    });
    const observation = observeForPlayer(state, "self", registry);
    expect(observation.selfIdentity).toBe(selfIdentity);
    expect(observation.players.find(
      (player) => player.id === "lord"
    )?.identity).toBe("lord");
    expect(observation.players.find(
      (player) => player.id === "hidden"
    )?.identity).toBeNull();
    expect(observation.players.find(
      (player) => player.id === "far"
    )?.identity).toBeNull();
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "use-card",
      targetIds: [expectedTargetId]
    });
  });

  test("a lord balances unknown seats instead of executing a weak player", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 520,
      currentPlayerId: "lord",
      phase: "action",
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hand: [
            STANDARD_CARD.peach,
            STANDARD_CARD.fireAttack,
            STANDARD_CARD.wine,
            STANDARD_CARD.slash
          ]
        },
        {
          id: "weak-unknown",
          identity: "renegade",
          heroDefinitionId: "hero:weak-unknown",
          maxHp: 4,
          hp: 1,
          hand: [STANDARD_CARD.peach]
        },
        {
          id: "hidden-rebel-a",
          identity: "rebel",
          heroDefinitionId: "hero:hidden-rebel-a",
          maxHp: 4
        },
        {
          id: "hidden-loyalist",
          identity: "loyalist",
          heroDefinitionId: "hero:hidden-loyalist",
          maxHp: 4
        },
        {
          id: "hidden-rebel-b",
          identity: "rebel",
          heroDefinitionId: "hero:hidden-rebel-b",
          maxHp: 4
        }
      ]
    });
    const observation = observeForPlayer(state, "lord", registry);

    expect(isClearRebelTarget(observation, "weak-unknown")).toBe(false);
    expect(strategicIdentityTargetScore(observation, "weak-unknown"))
      .toBe(20);
    expect(new PolicySearchAgent().chooseAction(observation)).toEqual({
      type: "end-action-phase",
      playerId: "lord"
    });
  });

  test("the replay-shaped lord opening avoids blind damage", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 522,
      currentPlayerId: "lord",
      phase: "action",
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hand: [
            STANDARD_CARD.peach,
            STANDARD_CARD.wine,
            STANDARD_CARD.jink,
            STANDARD_CARD.duel,
            STANDARD_CARD.nullification,
            STANDARD_CARD.slash
          ]
        },
        {
          id: "unknown-a",
          identity: "renegade",
          heroDefinitionId: "hero:unknown-a",
          maxHp: 4,
          hand: Array.from({ length: 4 }, () => STANDARD_CARD.slash)
        },
        {
          id: "unknown-b",
          identity: "rebel",
          heroDefinitionId: "hero:unknown-b",
          maxHp: 4
        },
        {
          id: "unknown-c",
          identity: "loyalist",
          heroDefinitionId: "hero:unknown-c",
          maxHp: 4
        },
        {
          id: "unknown-d",
          identity: "rebel",
          heroDefinitionId: "hero:unknown-d",
          maxHp: 4
        }
      ]
    });
    const observation = observeForPlayer(state, "lord", registry);

    expect(new PolicySearchAgent().chooseAction(observation)).toEqual({
      type: "end-action-phase",
      playerId: "lord"
    });
  });

  test("a lord attacks at full strength after clear rebel evidence", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 521,
      currentPlayerId: "lord",
      phase: "action",
      players: [
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hp: 3,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "attacker",
          identity: "rebel",
          heroDefinitionId: "hero:attacker",
          maxHp: 4,
          hp: 1
        },
        {
          id: "quiet-rebel",
          identity: "rebel",
          heroDefinitionId: "hero:quiet-rebel",
          maxHp: 4
        },
        {
          id: "quiet-loyalist",
          identity: "loyalist",
          heroDefinitionId: "hero:quiet-loyalist",
          maxHp: 4
        },
        {
          id: "quiet-renegade",
          identity: "renegade",
          heroDefinitionId: "hero:quiet-renegade",
          maxHp: 4
        }
      ]
    });
    state.eventLog.push({
      type: "DamageApplied",
      sequence: 1,
      revision: 0,
      sourceId: "attacker",
      targetId: "lord",
      amount: 1,
      cardId: "system:public-history",
      nature: "normal"
    });
    const observation = observeForPlayer(state, "lord", registry);

    expect(isClearRebelTarget(observation, "attacker")).toBe(true);
    expect(strategicIdentityTargetScore(observation, "attacker"))
      .toBeGreaterThan(200);
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "use-card",
      targetIds: ["attacker"]
    });
  });

  test("public attacks on the lord update identity probability and hatred", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 505,
      currentPlayerId: "self",
      players: [
        {
          id: "self",
          identity: "loyalist",
          heroDefinitionId: "hero:self",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        {
          id: "attacker",
          identity: "rebel",
          heroDefinitionId: "hero:attacker",
          maxHp: 4
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hp: 3
        },
        {
          id: "quiet",
          identity: "renegade",
          heroDefinitionId: "hero:quiet",
          maxHp: 4
        }
      ]
    });
    state.eventLog.push({
      type: "DamageApplied",
      sequence: 1,
      revision: 0,
      sourceId: "attacker",
      targetId: "lord",
      amount: 1,
      cardId: "system:public-history",
      nature: "normal"
    });
    const observation = observeForPlayer(state, "self", registry);
    const inference = inferIdentities(observation);
    const attacker = inference.beliefs.find(
      (belief) => belief.playerId === "attacker"
    )!;
    expect(attacker.probabilities.rebel)
      .toBeGreaterThan(attacker.probabilities.loyalist);
    expect(inference.hostility.attacker?.lord).toBe(25);
    expect(JSON.stringify(observation)).not.toContain('"identity":"rebel"');
    expect(new PolicySearchAgent().chooseAction(observation)).toMatchObject({
      type: "use-card",
      targetIds: ["attacker"]
    });
  });

  test("public recovery of the lord is loyalist evidence and negative hatred", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 506,
      currentPlayerId: "self",
      players: [
        {
          id: "self",
          identity: "rebel",
          heroDefinitionId: "hero:self",
          maxHp: 4
        },
        {
          id: "helper",
          identity: "loyalist",
          heroDefinitionId: "hero:helper",
          maxHp: 4
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hp: 3
        }
      ]
    });
    state.eventLog.push({
      type: "HpRecovered",
      sequence: 1,
      revision: 0,
      sourceId: "helper",
      playerId: "lord",
      amount: 2,
      cardId: "system:public-recovery"
    });
    const observation = observeForPlayer(state, "self", registry);
    const inference = inferIdentities(observation);
    const helper = inference.beliefs.find(
      (belief) => belief.playerId === "helper"
    )!;
    expect(helper.probabilities.loyalist)
      .toBeGreaterThan(helper.probabilities.rebel);
    expect(helper.evidence).toContain("recovered-lord");
    expect(inference.hostility.helper?.lord).toBe(-40);
  });

  test("renegade protects a weak lord and balances the stronger public camp", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 507,
      currentPlayerId: "self",
      players: [
        {
          id: "self",
          identity: "renegade",
          heroDefinitionId: "hero:self",
          maxHp: 4
        },
        {
          id: "lord",
          identity: "lord",
          heroDefinitionId: "hero:lord",
          maxHp: 4,
          hp: 2
        },
        {
          id: "aggressor-a",
          identity: "rebel",
          heroDefinitionId: "hero:aggressor-a",
          maxHp: 4
        },
        {
          id: "aggressor-b",
          identity: "rebel",
          heroDefinitionId: "hero:aggressor-b",
          maxHp: 4
        }
      ]
    });
    let observation = observeForPlayer(state, "self", registry);
    expect(strategicIdentityTargetScore(observation, "self")).toBe(0);
    expect(strategicIdentityTargetScore(observation, "lord")).toBe(-400);
    expect(strategicIdentityTargetScore(observation, "missing")).toBe(0);

    state.players.lord!.hp = 4;
    state.eventLog.push(
      {
        type: "DamageApplied",
        sequence: 1,
        revision: 0,
        sourceId: "aggressor-a",
        targetId: "lord",
        amount: 3,
        cardId: "system:history-a",
        nature: "normal"
      },
      {
        type: "DamageApplied",
        sequence: 2,
        revision: 0,
        sourceId: "aggressor-b",
        targetId: "lord",
        amount: 3,
        cardId: "system:history-b",
        nature: "normal"
      }
    );
    observation = observeForPlayer(state, "self", registry);
    expect(strategicIdentityTargetScore(observation, "aggressor-a"))
      .toBeGreaterThan(0);

    state.eventLog.length = 0;
    observation = observeForPlayer(state, "self", registry);
    expect(strategicIdentityTargetScore(observation, "aggressor-a"))
      .toBeGreaterThan(0);
  });
});
