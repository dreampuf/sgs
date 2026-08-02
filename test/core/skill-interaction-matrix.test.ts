import { describe, expect, test } from "vitest";
import {
  GameSession,
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createGameState,
  enumerateSkillPairs,
  selectHighRiskSkillTriples,
  serializeGameState
} from "../../src/core";
import type {
  CardPrint,
  DomainEvent,
  GameState,
  LegalAction
} from "../../src/core";

const registry = createEarlyExpansionRegistry([
  "wind",
  "military",
  "fire",
  "forest"
]);
const prints = registry.cardPrints();
const heroes = registry.heroes();

function print(definitionId: string, offset = 0): CardPrint {
  const matches = prints.filter((card) => card.definitionId === definitionId);
  const found = matches[offset % matches.length];
  if (!found) throw new Error(`missing print ${definitionId}`);
  return structuredClone(found);
}

function pairedState(skillIds: readonly string[], seed: number): GameState {
  return createGameState({
    seed,
    currentPlayerId: "p1",
    phase: "action",
    players: [
      {
        id: "p1",
        identity: "lord",
        heroDefinitionId: heroes[0]!.id,
        maxHp: 4,
        hp: 3,
        skillIds: skillIds.filter((_, index) => index % 2 === 0),
        hand: [
          print(STANDARD_CARD.slash),
          print(STANDARD_CARD.jink),
          print(STANDARD_CARD.peach),
          print(STANDARD_CARD.nullification)
        ]
      },
      {
        id: "p2",
        identity: "rebel",
        heroDefinitionId: heroes[1]!.id,
        maxHp: 4,
        hp: 3,
        skillIds: skillIds.filter((_, index) => index % 2 === 1),
        hand: [
          print(STANDARD_CARD.slash, 1),
          print(STANDARD_CARD.jink, 1),
          print(STANDARD_CARD.peach, 1),
          print(STANDARD_CARD.nullification, 1)
        ]
      }
    ],
    drawPile: Array.from({ length: 20 }, (_, index) =>
      structuredClone(prints[index % prints.length]!)
    )
  });
}

function chooseProgress(actions: LegalAction[]): LegalAction {
  return actions.find((action) =>
    action.type === "choose-option" && action.option === "skip"
  ) ??
    actions.find((action) => action.type === "pass") ??
    actions.find((action) => action.type === "end-action-phase") ??
    actions.find((action) => action.type === "end-turn") ??
    actions.find((action) => action.type === "advance-phase") ??
    actions[0]!;
}

function runToNextAction(state: GameState): DomainEvent[] {
  const session = new GameSession(state, registry);
  const events: DomainEvent[] = [];
  for (let step = 0; step < 32; step += 1) {
    const current = session.state();
    if (
      current.turnNumber > state.turnNumber &&
      current.phase === "action" &&
      current.pendingDecision === null
    ) {
      serializeGameState(current);
      return events;
    }
    const actions = session.legalActions();
    if (actions.length === 0) {
      throw new Error(
        `no legal action at turn ${current.turnNumber}/${current.phase}`
      );
    }
    events.push(...session.dispatch(chooseProgress(actions)).events);
    serializeGameState(session.state());
  }
  throw new Error("pair lifecycle exceeded 32 commands");
}

describe("skill interaction coverage", () => {
  test("enumerates every unordered skill pair and classifies shared domains", () => {
    const skillCount = new Set(
      heroes.flatMap((hero) => hero.skillIds)
    ).size;
    const pairs = enumerateSkillPairs(registry);
    expect(skillCount).toBe(82);
    expect(pairs).toHaveLength(skillCount * (skillCount - 1) / 2);
    expect(new Set(pairs.map((pair) =>
      `${pair.firstSkillId}|${pair.secondSkillId}`
    )).size).toBe(pairs.length);
    expect(pairs.filter((pair) => pair.sharedDomains.length > 0).length)
      .toBeGreaterThan(1_000);
  });

  test("all 3,321 skill pairs coexist through a complete turn boundary", () => {
    const pairs = enumerateSkillPairs(registry);
    const eventTypes = new Set<string>();
    let commandBearingCases = 0;
    for (const [index, pair] of pairs.entries()) {
      try {
        const events = runToNextAction(
          pairedState(
            [pair.firstSkillId, pair.secondSkillId],
            80_000 + index
          )
        );
        for (const event of events) eventTypes.add(event.type);
        if (events.length > 0) commandBearingCases += 1;
      } catch (error) {
        throw new Error(
          `${pair.firstSkillId} × ${pair.secondSkillId}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
    expect(commandBearingCases).toBe(pairs.length);
    expect(eventTypes.has("PhaseChanged")).toBe(true);
    expect(eventTypes.has("TurnEnded")).toBe(true);
    expect(eventTypes.has("TurnStarted")).toBe(true);
  }, 120_000);

  test("top 256 interaction-ranked triples coexist through a turn boundary", () => {
    const triples = selectHighRiskSkillTriples(registry, 256);
    expect(triples).toHaveLength(256);
    expect(triples.every((triple) =>
      triple.pairwiseSharedDomainCount > 0
    )).toBe(true);
    expect(triples.some((triple) =>
      triple.sharedDomains.length > 0
    )).toBe(true);
    for (const [index, triple] of triples.entries()) {
      try {
        runToNextAction(pairedState(triple.skillIds, 90_000 + index));
      } catch (error) {
        throw new Error(
          `${triple.skillIds.join(" × ")}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    }
  }, 60_000);
});
