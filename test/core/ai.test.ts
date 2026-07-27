import { describe, expect, test } from "vitest";
import {
  GameSession,
  PolicySearchAgent,
  SelfPlayRunner,
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  handZone,
  observeForPlayer
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
});
