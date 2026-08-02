import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createGameState,
  runCoverageGuidedGame,
  verifyReplayJsonl
} from "../../src/core";
import type { CardPrint, Identity } from "../../src/core";

const registry = createEarlyExpansionRegistry([
  "wind",
  "military",
  "fire",
  "forest"
]);
const heroes = registry.heroes();
const prints = registry.cardPrints();
const identities: Identity[] = ["lord", "loyalist", "rebel", "renegade"];
const environment = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;
const defaultSteps = Number(environment?.SGS_SOAK_STEPS ?? 48);
const defaultTurns = Number(environment?.SGS_SOAK_TURNS ?? 5);

function print(definitionId: string, offset = 0): CardPrint {
  const matches = prints.filter((card) => card.definitionId === definitionId);
  const found = matches[offset % matches.length];
  if (!found) throw new Error(`missing print ${definitionId}`);
  return structuredClone(found);
}

function lineupState(start: number) {
  return createGameState({
    seed: 100_000 + start,
    currentPlayerId: "p1",
    phase: "action",
    players: Array.from({ length: 4 }, (_, seat) => {
      const hero = heroes[(start + seat) % heroes.length]!;
      return {
        id: `p${seat + 1}`,
        identity: identities[seat]!,
        heroDefinitionId: hero.id,
        maxHp: hero.maxHp,
        hp: Math.max(1, hero.maxHp - (seat % 2)),
        skillIds: [...hero.skillIds],
        hand: [
          print(STANDARD_CARD.slash, seat),
          print(STANDARD_CARD.jink, seat),
          print(STANDARD_CARD.peach, seat),
          print(STANDARD_CARD.nullification, seat),
          print(
            seat % 2 === 0
              ? STANDARD_CARD.dismantlement
              : STANDARD_CARD.duel,
            seat
          )
        ]
      };
    }),
    drawPile: Array.from({ length: 96 }, (_, index) =>
      structuredClone(prints[(start * 7 + index) % prints.length]!)
    )
  });
}

describe("coverage-guided multi-turn soak", () => {
  test("rotates every hero through seeded, replayable multi-turn games", async () => {
    const starts = Array.from(
      { length: Math.ceil(heroes.length / 4) },
      (_, index) => index * 4
    );
    const coveredHeroes = new Set<string>();
    const actionTypes = new Set<string>();
    const eventTypes = new Set<string>();
    const decisionReasons = new Set<string>();
    const activatedSkills = new Set<string>();
    let multiTurnGames = 0;
    let firstReplay: string | undefined;

    for (const start of starts) {
      const initial = lineupState(start);
      for (const player of Object.values(initial.players)) {
        coveredHeroes.add(player.heroDefinitionId);
      }
      const result = await runCoverageGuidedGame(initial, registry, {
        scenario: `hero-lineup-${start}`,
        maxSteps: defaultSteps,
        maxTurns: defaultTurns,
        maxActionsPerState: 12
      });
      expect(
        result.failure,
        `lineup ${start}: ${result.failure?.message ?? "unknown failure"}`
      ).toBeUndefined();
      if (result.maxTurnReached >= initial.turnNumber + 2) {
        multiTurnGames += 1;
      }
      for (const type of result.coverage.actionTypes) actionTypes.add(type);
      for (const type of result.coverage.eventTypes) eventTypes.add(type);
      for (const reason of result.coverage.decisionReasons) {
        decisionReasons.add(reason);
      }
      for (const skillId of result.coverage.skillIds) {
        activatedSkills.add(skillId);
      }
      firstReplay ??= result.replayJsonl;
    }

    expect(coveredHeroes.size).toBe(heroes.length);
    expect(multiTurnGames).toBeGreaterThanOrEqual(starts.length / 2);
    expect(actionTypes.size).toBeGreaterThanOrEqual(8);
    expect(eventTypes.size).toBeGreaterThanOrEqual(15);
    expect(decisionReasons.size).toBeGreaterThanOrEqual(4);
    expect(activatedSkills.size).toBeGreaterThanOrEqual(5);
    await expect(verifyReplayJsonl(firstReplay!, registry)).resolves.toBeDefined();
  }, 120_000);
});
