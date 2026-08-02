import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  GameSession,
  createEarlyExpansionRegistry,
  createGameState,
  equipmentZone,
  exploreGameModel,
  handZone,
  modelActionKey,
  modelStateFingerprint,
  parseReplayJsonl,
  reduceModelActions,
  verifyReplayJsonl
} from "../../src/core";
import type {
  CardPrint,
  GameState
} from "../../src/core";

const registry = createEarlyExpansionRegistry([
  "wind",
  "military",
  "fire",
  "forest"
]);
const prints = registry.cardPrints();

function print(definitionId: string, index = 0): CardPrint {
  const matches = prints.filter((card) => card.definitionId === definitionId);
  const found = matches[index % matches.length];
  if (!found) throw new Error(`missing print ${definitionId}`);
  return structuredClone(found);
}

function compactTwoPlayerState(): GameState {
  const heroes = registry.heroes();
  const first = registry.hero("standard:hero:诸葛亮");
  const second = registry.hero("standard:hero:司马懿");
  return createGameState({
    seed: 71_001,
    currentPlayerId: "p1",
    phase: "action",
    players: [
      {
        id: "p1",
        identity: "lord",
        heroDefinitionId: first.id,
        maxHp: first.maxHp,
        skillIds: [...first.skillIds],
        hand: [
          print(STANDARD_CARD.slash),
          print(STANDARD_CARD.jink)
        ]
      },
      {
        id: "p2",
        identity: "rebel",
        heroDefinitionId: second.id,
        maxHp: second.maxHp,
        skillIds: [...second.skillIds],
        hand: [
          print(STANDARD_CARD.slash, 1),
          print(STANDARD_CARD.jink, 1)
        ]
      }
    ],
    drawPile: Array.from({ length: 24 }, (_, index) =>
      structuredClone(prints[index % prints.length]!)
    )
  });
}

describe("bounded Core model explorer", () => {
  test("semantic state and action keys ignore only safe runtime identity", () => {
    const state = compactTwoPlayerState();
    const clone = structuredClone(state);
    clone.gameId = "different";
    clone.revision = 42;
    clone.nextSequence = 999;
    expect(modelStateFingerprint(clone)).toBe(modelStateFingerprint(state));

    const slashIds = state.zones[handZone("p1")]!.filter(
      (cardId) => state.cards[cardId]?.definitionId === STANDARD_CARD.slash
    );
    const first = {
      type: "use-card" as const,
      playerId: "p1",
      cardId: slashIds[0]!,
      targetIds: ["p2"]
    };
    expect(modelActionKey(state, first)).toContain(STANDARD_CARD.slash);
  });

  test("equivalent physical copies collapse while progress remains reachable", () => {
    const state = createGameState({
      seed: 71_002,
      phase: "action",
      players: [
        {
          id: "p1",
          heroDefinitionId: "standard:hero:liubei",
          maxHp: 4,
          hand: [
            { definitionId: STANDARD_CARD.slash, suit: "spade", rank: 7 },
            { definitionId: STANDARD_CARD.slash, suit: "spade", rank: 7 }
          ]
        },
        {
          id: "p2",
          heroDefinitionId: "standard:hero:guanyu",
          maxHp: 4
        }
      ]
    });
    const actions = new GameSession(state, registry).legalActions();
    const reduced = reduceModelActions(state, actions, 1);
    expect(reduced.reduced).toBeGreaterThan(0);
    expect(reduced.actions).toEqual([{
      type: "end-action-phase",
      playerId: "p1"
    }]);

    const hand = state.zones[handZone("p1")]!;
    const moved = hand.pop()!;
    state.zones[equipmentZone("p1")]!.push(moved);
    const firstChoice = {
      type: "choose-cards" as const,
      playerId: "p1",
      decisionId: "decision-1",
      cardIds: [hand[0]!]
    };
    const secondChoice = {
      ...firstChoice,
      cardIds: [moved]
    };
    expect(modelActionKey(state, firstChoice))
      .not.toBe(modelActionKey(state, secondChoice));
  });

  test("explores multiple turns and reports action/event/decision coverage", async () => {
    const result = await exploreGameModel(
      compactTwoPlayerState(),
      registry,
      {
        scenario: "two-player-multi-turn",
        maxDepth: 12,
        maxStates: 1_200,
        maxTransitions: 4_000,
        maxTurns: 3,
        maxActionsPerState: 8
      }
    );
    expect(result.failures).toEqual([]);
    expect(result.visitedStates).toBeGreaterThan(20);
    expect(result.transitions).toBeGreaterThanOrEqual(result.visitedStates - 1);
    expect(result.maxTurnReached).toBeGreaterThanOrEqual(3);
    expect(result.coverage.actionTypes).toEqual(expect.arrayContaining([
      "advance-phase",
      "end-action-phase",
      "end-turn",
      "use-card"
    ]));
    expect(result.coverage.eventTypes).toEqual(expect.arrayContaining([
      "CardUsed",
      "PhaseChanged",
      "TurnEnded",
      "TurnStarted"
    ]));
    expect(result.coverage.decisionReasons).toContain("response:jink");
  }, 30_000);

  test("invariant failures include a replayable JSONL prefix", async () => {
    const initial = compactTwoPlayerState();
    const result = await exploreGameModel(initial, registry, {
      scenario: "forced-invariant-failure",
      maxDepth: 1,
      maxStates: 20,
      invariant: ({ command }) =>
        command.type === "end-action-phase"
          ? "forced test invariant"
          : undefined
    });
    const failure = result.failures.find(
      (candidate) => candidate.message === "forced test invariant"
    );
    expect(failure).toBeDefined();
    const lines = parseReplayJsonl(failure!.jsonl);
    expect(lines.at(-1)).toMatchObject({
      kind: "failure",
      stage: "invariant",
      message: "forced test invariant"
    });
    await expect(verifyReplayJsonl(failure!.jsonl, registry)).resolves.toBeDefined();
  });
});
