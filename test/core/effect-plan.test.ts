import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  deserializeGameState,
  dispatch,
  equipmentZone,
  handZone,
  serializeGameState
} from "../../src/core";

const FORBIDDEN_RUNTIME_KEYS = new Set([
  "onAccepted",
  "onAllPassed",
  "onResolved",
  "onNegated",
  "onCancelled",
  "onMatch",
  "onMiss"
]);

function nestedContinuationKeys(value: unknown): string[] {
  const found: string[] = [];
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (FORBIDDEN_RUNTIME_KEYS.has(key)) found.push(key);
      visit(child);
    }
  };
  visit(value);
  return found;
}

describe("flat effect continuation plans", () => {
  test("a response snapshot stores opaque plan ids and consumes both branches", () => {
    const registry = createStandardRegistry();
    const initial = createGameState({
      seed: 401,
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
          maxHp: 4
        }
      ]
    });
    const waiting = dispatch(initial, {
      type: "use-card",
      playerId: "p1",
      cardId: initial.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);

    expect(waiting.state.pendingDecision?.continuation).toMatchObject({
      type: "effects",
      acceptedPlanId: expect.any(String),
      passedPlanId: expect.any(String)
    });
    const continuation = waiting.state.pendingDecision!.continuation;
    if (continuation.type !== "effects") {
      throw new Error("expected an effects continuation");
    }
    expect(waiting.state.effectPlans).toHaveProperty(
      continuation.acceptedPlanId
    );
    expect(waiting.state.effectPlans).toHaveProperty(
      continuation.passedPlanId
    );
    expect(nestedContinuationKeys(waiting.state)).toEqual([]);

    const restored = deserializeGameState(
      serializeGameState(waiting.state)
    );
    const resolved = dispatch(restored, {
      type: "pass",
      playerId: "p2",
      decisionId: restored.pendingDecision!.request.id
    }, registry);

    expect(resolved.state.players.p2?.hp).toBe(3);
    expect(resolved.state.effectPlans).toEqual({});
  });

  test("judgment response plans survive suspension without nested effects or leaks", () => {
    const registry = createStandardRegistry();
    const initial = createGameState({
      seed: 402,
      drawPile: [{
        definitionId: STANDARD_CARD.peach,
        suit: "heart",
        rank: 6
      }],
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
    const armorId = initial.zones[handZone("p2")]![0]!;
    initial.zones[handZone("p2")] = [];
    initial.zones[equipmentZone("p2")]!.push(armorId);

    const waiting = dispatch(initial, {
      type: "use-card",
      playerId: "p1",
      cardId: initial.zones[handZone("p1")]![0]!,
      targetIds: ["p2"]
    }, registry);

    expect(waiting.state.pendingDecision?.continuation).toMatchObject({
      type: "judgment-response",
      response: {
        acceptedPlanId: expect.any(String),
        passedPlanId: expect.any(String)
      }
    });
    expect(nestedContinuationKeys(waiting.state)).toEqual([]);

    const resolved = dispatch(waiting.state, {
      type: "choose-option",
      playerId: "p2",
      decisionId: waiting.pendingDecision!.id,
      option: "activate"
    }, registry);

    expect(resolved.state.players.p2?.hp).toBe(4);
    expect(resolved.state.effectPlans).toEqual({});
    expect(nestedContinuationKeys(resolved.state)).toEqual([]);
  });

  test("nullification toggles one pair of branch plans through every responder", () => {
    const registry = createStandardRegistry();
    const initial = createGameState({
      seed: 403,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [STANDARD_CARD.exNihilo]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.nullification]
        }
      ]
    });
    let result = dispatch(initial, {
      type: "use-card",
      playerId: "p1",
      cardId: initial.zones[handZone("p1")]![0]!,
      targetIds: []
    }, registry);
    result = dispatch(result.state, {
      type: "pass",
      playerId: "p1",
      decisionId: result.pendingDecision!.id
    }, registry);
    result = dispatch(result.state, {
      type: "respond-card",
      playerId: "p2",
      decisionId: result.pendingDecision!.id,
      cardId: result.state.zones[handZone("p2")]![0]!
    }, registry);
    while (result.pendingDecision) {
      expect(nestedContinuationKeys(result.state)).toEqual([]);
      result = dispatch(result.state, {
        type: "pass",
        playerId: result.pendingDecision.playerId,
        decisionId: result.pendingDecision.id
      }, registry);
    }

    expect(result.state.eventLog).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "CardCancelled",
        reason: "nullification"
      })
    ]));
    expect(result.state.effectPlans).toEqual({});
  });
});
