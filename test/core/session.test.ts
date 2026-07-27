import { describe, expect, test, vi } from "vitest";
import {
  GameSession,
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  handZone,
  observeForPlayer
} from "../../src/core";

function initialState() {
  return createGameState({
    seed: 7,
    players: [
      {
        id: "p1",
        heroDefinitionId: "standard:hero:liubei",
        maxHp: 4,
        hand: [STANDARD_CARD.slash]
      },
      {
        id: "p2",
        heroDefinitionId: "standard:hero:guanyu",
        maxHp: 4,
        hand: [STANDARD_CARD.nullification]
      }
    ]
  });
}

describe("game session boundary", () => {
  test("callers cannot mutate session state through returned snapshots", () => {
    const session = new GameSession(initialState(), createStandardRegistry());
    const external = session.state();
    external.players.p1!.hp = 1;
    external.zones[handZone("p1")]!.length = 0;
    expect(session.state().players.p1?.hp).toBe(4);
    expect(session.state().zones[handZone("p1")]).toHaveLength(1);
  });

  test("session publishes domain events and resumes from a snapshot", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(initialState(), registry);
    const subscriber = vi.fn();
    const unsubscribe = session.subscribe(subscriber);
    const slashId = session.state().zones[handZone("p1")]![0]!;
    const used = session.dispatch({
      type: "use-card",
      playerId: "p1",
      cardId: slashId,
      targetIds: ["p2"]
    });
    expect(subscriber).toHaveBeenCalledOnce();
    expect(used.pendingDecision?.playerId).toBe("p2");

    const restored = GameSession.restore(session.snapshot(), registry);
    expect(restored.state()).toEqual(session.state());
    const pass = {
      type: "pass" as const,
      playerId: "p2",
      decisionId: restored.state().pendingDecision!.request.id
    };
    expect(restored.dispatch(pass).state.players.p2?.hp).toBe(3);
    unsubscribe();
  });
});

describe("AI observation boundary", () => {
  test("an agent sees opponent hand size, never opponent card identities", () => {
    const state = initialState();
    const observation = observeForPlayer(
      state,
      "p1",
      createStandardRegistry()
    );
    expect(observation.players.find((player) => player.id === "p2")?.handSize).toBe(1);
    expect(observation.ownHand[0]?.definitionId).toBe(STANDARD_CARD.slash);
    expect(JSON.stringify(observation)).not.toContain(STANDARD_CARD.nullification);
  });

  test("only the requested responder receives the decision and legal replies", () => {
    const registry = createStandardRegistry();
    const session = new GameSession(
      createGameState({
        seed: 8,
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
      }),
      registry
    );
    session.dispatch({
      type: "use-card",
      playerId: "p1",
      cardId: session.state().zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    });
    const sourceView = observeForPlayer(session.state(), "p1", registry);
    const responderView = observeForPlayer(session.state(), "p2", registry);
    expect(sourceView.pendingDecision).toBeNull();
    expect(sourceView.legalActions).toEqual([]);
    expect(responderView.pendingDecision).toMatchObject({
      type: "respond-card",
      responseKind: "jink"
    });
    expect(responderView.legalActions.map((action) => action.type)).toEqual([
      "respond-card",
      "pass"
    ]);
  });

  test("registry exposes versioned pack metadata", () => {
    expect(createStandardRegistry().packs()).toEqual([
      {
        id: "standard",
        version: "0.3.0",
        name: "三国杀标准版",
        requires: []
      },
      {
        id: "maneuvering",
        version: "1.0.0",
        name: "神话再临·军争篇",
        requires: ["standard@0.3.0"]
      }
    ]);
  });
});
