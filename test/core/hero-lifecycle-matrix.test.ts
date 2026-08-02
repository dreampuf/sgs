import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createGameState,
  deserializeGameState,
  serializeGameState
} from "../../src/core";
import type {
  CardPrint,
  GameState,
  LegalAction
} from "../../src/core";
import { GameSession } from "../../src/core";

const registry = createEarlyExpansionRegistry([
  "wind",
  "military",
  "fire",
  "forest"
]);
const heroes = registry.heroes();
const prints = registry.cardPrints();

function physical(definitionId: string): CardPrint {
  const print = prints.find((candidate) =>
    candidate.definitionId === definitionId
  );
  if (!print) throw new Error(`missing physical print: ${definitionId}`);
  return structuredClone(print);
}

function lifecycleState(heroIndex: number, seed: number): GameState {
  const hero = heroes[heroIndex]!;
  return createGameState({
    seed,
    currentPlayerId: "p4",
    phase: "discard",
    players: [
      {
        id: "p1",
        heroDefinitionId: hero.id,
        maxHp: hero.maxHp,
        hp: Math.max(1, hero.maxHp - 1),
        skillIds: [...hero.skillIds],
        hand: [
          physical(STANDARD_CARD.slash),
          physical(STANDARD_CARD.jink),
          physical(STANDARD_CARD.peach),
          physical(STANDARD_CARD.nullification),
          physical(STANDARD_CARD.crossbow)
        ]
      },
      {
        id: "p2",
        heroDefinitionId: heroes[(heroIndex + 1) % heroes.length]!.id,
        maxHp: 4,
        hand: [
          physical(STANDARD_CARD.slash),
          physical(STANDARD_CARD.jink),
          physical(STANDARD_CARD.nullification)
        ]
      },
      {
        id: "p3",
        heroDefinitionId: heroes[(heroIndex + 2) % heroes.length]!.id,
        maxHp: 4,
        hand: [
          physical(STANDARD_CARD.slash),
          physical(STANDARD_CARD.jink),
          physical(STANDARD_CARD.nullification)
        ]
      },
      {
        id: "p4",
        heroDefinitionId: heroes[(heroIndex + 3) % heroes.length]!.id,
        maxHp: 4,
        hand: []
      }
    ],
    drawPile: Array.from({ length: 80 }, (_, index) =>
      structuredClone(prints[index % prints.length]!)
    )
  });
}

function choose(
  actions: LegalAction[],
  strategy: "skip" | "activate"
): LegalAction {
  if (strategy === "skip") {
    return actions.find((action) =>
      action.type === "choose-option" &&
      (action.option === "skip" || action.option === "finish")
    ) ??
      actions.find((action) => action.type === "pass") ??
      actions[0]!;
  }
  return actions.find((action) =>
    action.type === "choose-option" && action.option === "activate"
  ) ??
    actions.find((action) =>
      action.type === "choose-option" && action.option === "select"
    ) ??
    actions.find((action) =>
      action.type === "choose-players" && action.playerIds.length > 0
    ) ??
    actions.find((action) => action.type !== "pass") ??
    actions[0]!;
}

function settle(
  session: GameSession,
  strategy: "skip" | "activate",
  reasons: Set<string>
): number {
  let count = 0;
  while (session.state().pendingDecision) {
    if (count >= 256) throw new Error("hero decision chain exceeded 256 steps");
    const request = session.state().pendingDecision!.request;
    reasons.add(
      "reason" in request ? request.reason : `response:${request.responseKind}`
    );
    const actions = session.legalActions();
    expect(actions.length).toBeGreaterThan(0);
    session.dispatch(choose(actions, strategy));
    count += 1;
  }
  return count;
}

function assertSerializable(session: GameSession): void {
  const state = session.state();
  expect(deserializeGameState(serializeGameState(state))).toEqual(state);
  expect(state.pendingDecision).toBeNull();
  expect(state.stack).toEqual([]);
  expect(state.triggerQueue).toEqual([]);
  expect(state.effectPlans).toEqual({});
}

describe("all-hero Core lifecycle matrix", () => {
  test("every hero completes a turn with both optional-decision strategies", () => {
    const reasons = new Set<string>();
    let cases = 0;
    let decisionCount = 0;
    let branchCount = 0;
    for (const [heroIndex, hero] of heroes.entries()) {
      for (const strategy of ["skip", "activate"] as const) {
        const session = new GameSession(
          lifecycleState(heroIndex, 30_000 + heroIndex),
          registry
        );
        session.dispatch({ type: "end-turn", playerId: "p4" });
        decisionCount += settle(session, strategy, reasons);
        expect(
          session.state().currentPlayerId,
          `${hero.name}/${strategy} did not start its turn`
        ).toBe("p1");
        if (session.state().phase === "judgment") {
          session.dispatch({ type: "advance-phase", playerId: "p1" });
          decisionCount += settle(session, strategy, reasons);
        }
        if (session.state().phase === "draw") {
          session.dispatch({ type: "advance-phase", playerId: "p1" });
          decisionCount += settle(session, strategy, reasons);
        }
        if (session.state().phase === "action") {
          const seenShapes = new Set<string>();
          const frontier = session.legalActions().filter((action) => {
            if (
              action.type !== "activate-skill" &&
              action.type !== "use-virtual-card"
            ) {
              return false;
            }
            const shape = [
              action.type,
              action.skillId,
              "definitionId" in action ? action.definitionId : "",
              action.materialCardIds.length,
              action.targetIds.length
            ].join(":");
            if (seenShapes.has(shape)) return false;
            seenShapes.add(shape);
            return true;
          });
          for (const action of frontier) {
            const label = `${hero.name}/${strategy}/${action.type}/` +
              `${"skillId" in action ? action.skillId : "unknown"}`;
            const branch = new GameSession(session.state(), registry);
            try {
              branch.dispatch(action);
              decisionCount += settle(branch, strategy, reasons);
              assertSerializable(branch);
            } catch (error) {
              throw new Error(
                `${label}: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
            }
            branchCount += 1;
          }
          const endAction = session.legalActions().find(
            (action) => action.type === "end-action-phase"
          );
          expect(endAction).toBeDefined();
          session.dispatch(endAction!);
        }
        if (session.state().phase === "discard") {
          session.dispatch(session.legalActions()[0]!);
          decisionCount += settle(session, strategy, reasons);
        }
        assertSerializable(session);
        cases += 1;
      }
    }
    expect(cases).toBe(49 * 2);
    expect(decisionCount).toBeGreaterThan(0);
    expect(branchCount).toBeGreaterThan(0);
    expect(reasons.size).toBeGreaterThan(5);
  }, 120_000);
});
