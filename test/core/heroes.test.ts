import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createGameState,
  createStandardHeroDefinitions,
  createStandardRegistry,
  createStandardSkillDefinitions,
  dispatch,
  getLegalActions,
  handZone,
  standardSkillId
} from "../../src/core";
import type { DispatchResult, GameState } from "../../src/core";

const registry = createStandardRegistry();

function game(
  skillIds: string[],
  hand: string[],
  drawPile: string[] = []
): GameState {
  return createGameState({
    seed: 88,
    players: [
      {
        id: "p1",
        heroDefinitionId: "standard:hero:test",
        maxHp: 4,
        skillIds,
        hand
      },
      {
        id: "p2",
        heroDefinitionId: "standard:hero:target",
        maxHp: 4
      }
    ],
    drawPile
  });
}

function pass(result: DispatchResult): DispatchResult {
  if (!result.pendingDecision || result.pendingDecision.type !== "respond-card") {
    throw new Error("no response decision");
  }
  return dispatch(
    result.state,
    {
      type: "pass",
      playerId: result.pendingDecision.playerId,
      decisionId: result.pendingDecision.id
    },
    registry
  );
}

describe("standard hero migration", () => {
  test("all 25 standard heroes and referenced skills are registered", () => {
    const heroes = createStandardHeroDefinitions();
    const skills = createStandardSkillDefinitions();
    expect(heroes).toHaveLength(25);
    expect(new Set(heroes.map((hero) => hero.id)).size).toBe(25);
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(skills.length);
    for (const hero of heroes) {
      expect(registry.hero(hero.id)).toEqual(hero);
      for (const skillId of hero.skillIds) {
        expect(registry.skill(skillId).id).toBe(skillId);
      }
    }
  });

  test("咆哮 provides a second slash through the common legal action list", () => {
    let state = game(
      [standardSkillId("咆哮")],
      [STANDARD_CARD.slash, STANDARD_CARD.fireSlash]
    );
    const firstSlashId = state.zones[handZone("p1")]![0]!;
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: firstSlashId,
        targetIds: ["p2"]
      },
      registry
    );
    result = pass(result);
    state = result.state;
    const secondSlashId = state.zones[handZone("p1")]![0]!;
    expect(getLegalActions(state, registry)).toContainEqual({
      type: "use-card",
      playerId: "p1",
      cardId: secondSlashId,
      targetIds: ["p2"]
    });
  });

  test("集智 draws once when its owner uses a trick", () => {
    let state = game(
      [standardSkillId("集智")],
      [STANDARD_CARD.exNihilo],
      [STANDARD_CARD.slash, STANDARD_CARD.peach, STANDARD_CARD.jink]
    );
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: []
      },
      registry
    );
    while (
      result.pendingDecision?.type === "respond-card" &&
      result.pendingDecision.responseKind === "nullification"
    ) {
      result = pass(result);
    }
    expect(result.state.zones[handZone("p1")]).toHaveLength(3);
    expect(
      result.state.eventLog
        .filter((event) => event.type === "CardsDrawn")
        .map((event) => event.count)
    ).toEqual([1, 2]);
  });

  test("连营 draws immediately after the owner loses their last hand card", () => {
    const state = game(
      [standardSkillId("连营")],
      [STANDARD_CARD.slash],
      [STANDARD_CARD.peach]
    );
    const result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p1",
        cardId: state.zones[handZone("p1")]![0]!,
        targetIds: ["p2"]
      },
      registry
    );
    expect(result.state.zones[handZone("p1")]).toHaveLength(1);
    expect(
      result.state.cards[result.state.zones[handZone("p1")]![0]!]!.definitionId
    ).toBe(STANDARD_CARD.peach);
    expect(result.pendingDecision).toMatchObject({
      playerId: "p2",
      responseKind: "jink"
    });
  });
});
