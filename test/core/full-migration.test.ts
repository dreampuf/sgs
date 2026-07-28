import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createGameState,
  createMatchSetup,
  dispatch,
  finalizeMatchSetup,
  getLegalActions,
  handZone,
  serializeGameState,
  deserializeGameState
} from "../../src/core";

describe("early expansion migration completeness", () => {
  test("Wind, Fire, and Forest expose only complete, executable skills", () => {
    const registry = createEarlyExpansionRegistry([
      "wind",
      "military",
      "fire",
      "forest"
    ]);
    const expected = { wind: 11, fire: 13, forest: 18 };
    for (const [packId, count] of Object.entries(expected)) {
      const heroes = registry.heroes().filter((hero) =>
        hero.id.startsWith(`${packId}:hero:`)
      );
      const skillIds = new Set(heroes.flatMap((hero) => hero.skillIds).filter(
        (skillId) => skillId.startsWith(`${packId}:skill:`)
      ));
      expect(skillIds.size).toBe(count);
      expect(heroes.every((hero) => hero.implementation === "complete"))
        .toBe(true);
      for (const skillId of skillIds) {
        const skill = registry.skill(skillId);
        expect(skill.implementation).toBe("complete");
        expect(skill.abilities?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  test("MatchSetup owns 2-10 player identities, hero offers, and pack metadata", () => {
    const registry = createEarlyExpansionRegistry([
      "wind",
      "military",
      "fire",
      "forest"
    ]);
    for (let playerCount = 2; playerCount <= 10; playerCount += 1) {
      const setup = createMatchSetup(registry, {
        seed: 20260728 + playerCount,
        playerCount,
        localIdentity: playerCount === 2 ? "rebel" : "renegade"
      });
      expect(setup.seats).toHaveLength(playerCount);
      expect(setup.seats.filter((seat) => seat.identity === "lord"))
        .toHaveLength(1);
      expect(setup.localHeroChoices.length).toBeGreaterThan(0);
      const finalized = finalizeMatchSetup(
        setup,
        setup.localHeroChoices[0]!
      );
      expect(
        finalized.seats.every((seat) => seat.heroDefinitionId)
      ).toBe(true);
      expect(new Set(finalized.seats.map(
        (seat) => seat.heroDefinitionId
      )).size).toBe(playerCount);
      expect(finalized.contentPacks.map((pack) => pack.id)).toEqual([
        "standard",
        "maneuvering",
        "wind",
        "fire",
        "forest"
      ]);
      expect(
        finalized.contentPacks.every(
          (pack) =>
            pack.sourceRevision &&
            pack.assetManifest.length > 0
        )
      ).toBe(true);
    }
  });

  test("schema v3 snapshots preserve the installed pack manifest", () => {
    const registry = createEarlyExpansionRegistry(["wind", "fire", "forest"]);
    const state = createGameState({
      seed: 1,
      contentPacks: registry.installedContentPacks(),
      players: [
        { id: "p1", heroDefinitionId: "wind:hero:曹仁", maxHp: 4 },
        { id: "p2", heroDefinitionId: "fire:hero:典韦", maxHp: 4 }
      ]
    });
    const restored = deserializeGameState(serializeGameState(state));
    expect(restored.schemaVersion).toBe(3);
    expect(restored.contentPacks).toEqual(registry.installedContentPacks());
    expect(restored.players.p1?.faceUp).toBe(true);
  });

  test("Qiangxi is a Core legal action and resolves HP cost plus damage", () => {
    const registry = createEarlyExpansionRegistry(["fire"]);
    const state = createGameState({
      seed: 2,
      players: [
        {
          id: "p1",
          heroDefinitionId: "fire:hero:典韦",
          maxHp: 4,
          skillIds: ["fire:skill:强袭"]
        },
        { id: "p2", heroDefinitionId: "fixture:p2", maxHp: 4 }
      ]
    });
    const action = getLegalActions(state, registry).find(
      (candidate) =>
        candidate.type === "activate-skill" &&
        candidate.skillId === "fire:skill:强袭" &&
        candidate.materialCardIds.length === 0
    );
    expect(action).toBeDefined();
    const result = dispatch(state, action!, registry);
    expect(result.state.players.p1?.hp).toBe(3);
    expect(result.state.players.p2?.hp).toBe(3);
  });

  test("Tianxiang replaces incoming damage through a serializable workflow", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    let state = createGameState({
      seed: 3,
      players: [
        {
          id: "p1",
          heroDefinitionId: "wind:hero:小乔",
          maxHp: 3,
          skillIds: ["wind:skill:天香"],
          hand: [STANDARD_CARD.peach]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        },
        { id: "p3", heroDefinitionId: "fixture:p3", maxHp: 4 }
      ],
      currentPlayerId: "p2"
    });
    const heartId = state.zones[handZone("p1")]![0]!;
    state.cards[heartId]!.suit = "heart";
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p2",
        cardId: state.zones[handZone("p2")]![0]!,
        targetIds: ["p1"]
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "pass",
        playerId: "p1",
        decisionId: result.pendingDecision!.id
      },
      registry
    );
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p1",
      reason: "tianxiang"
    });
    result = dispatch(
      result.state,
      {
        type: "choose-option",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        option: "activate"
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "choose-cards",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        cardIds: [heartId]
      },
      registry
    );
    result = dispatch(
      result.state,
      {
        type: "choose-players",
        playerId: "p1",
        decisionId: result.pendingDecision!.id,
        playerIds: ["p3"]
      },
      registry
    );
    expect(result.state.players.p1?.hp).toBe(3);
    expect(result.state.players.p3?.hp).toBe(3);
  });

  test("Guhuo challenge resolves before a virtual response is accepted", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    const state = createGameState({
      seed: 4,
      players: [
        {
          id: "p1",
          heroDefinitionId: "wind:hero:于吉",
          maxHp: 3,
          skillIds: ["wind:skill:蛊惑"],
          hand: [STANDARD_CARD.peach]
        },
        {
          id: "p2",
          heroDefinitionId: "fixture:p2",
          maxHp: 4,
          hand: [STANDARD_CARD.slash]
        }
      ],
      currentPlayerId: "p2",
      drawPile: [STANDARD_CARD.nullification]
    });
    let result = dispatch(
      state,
      {
        type: "use-card",
        playerId: "p2",
        cardId: state.zones[handZone("p2")]![0]!,
        targetIds: ["p1"]
      },
      registry
    );
    const bluff = getLegalActions(result.state, registry).find(
      (candidate) =>
        candidate.type === "respond-virtual-card" &&
        candidate.skillId === "wind:skill:蛊惑" &&
        candidate.definitionId === STANDARD_CARD.jink
    );
    expect(bluff).toBeDefined();
    result = dispatch(result.state, bluff!, registry);
    expect(result.pendingDecision).toMatchObject({
      type: "choose-option",
      playerId: "p2",
      reason: "guhuo-question"
    });
    const restored = deserializeGameState(serializeGameState(result.state));
    result = dispatch(
      restored,
      {
        type: "choose-option",
        playerId: "p2",
        decisionId: restored.pendingDecision!.request.id,
        option: "question"
      },
      registry
    );
    expect(result.state.players.p1?.hp).toBe(2);
    expect(result.state.players.p2?.hp).toBe(4);
    expect(result.state.zones[handZone("p2")]).toHaveLength(1);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "CardCancelled",
        reason: "skill",
        sourceId: "p1"
      })
    );
  });

  test("face-down players turn face-up and skip their next turn", () => {
    const registry = createEarlyExpansionRegistry(["wind"]);
    let state = createGameState({
      seed: 5,
      players: [
        { id: "p1", heroDefinitionId: "fixture:p1", maxHp: 4 },
        { id: "p2", heroDefinitionId: "wind:hero:曹仁", maxHp: 4 },
        { id: "p3", heroDefinitionId: "fixture:p3", maxHp: 4 }
      ]
    });
    state.players.p2!.faceUp = false;
    state = dispatch(
      state,
      { type: "end-action-phase", playerId: "p1" },
      registry
    ).state;
    const result = dispatch(
      state,
      { type: "end-turn", playerId: "p1" },
      registry
    );
    expect(result.state.currentPlayerId).toBe("p3");
    expect(result.state.turnNumber).toBe(3);
    expect(result.state.players.p2?.faceUp).toBe(true);
    expect(result.state.eventLog).toContainEqual(
      expect.objectContaining({
        type: "TurnSkipped",
        playerId: "p2",
        reason: "face-down"
      })
    );

    let allFaceDown = createGameState({
      seed: 6,
      players: [
        { id: "p1", heroDefinitionId: "fixture:p1", maxHp: 4 },
        { id: "p2", heroDefinitionId: "fixture:p2", maxHp: 4 },
        { id: "p3", heroDefinitionId: "fixture:p3", maxHp: 4 }
      ]
    });
    for (const player of Object.values(allFaceDown.players)) {
      player.faceUp = false;
    }
    allFaceDown = dispatch(
      allFaceDown,
      { type: "end-action-phase", playerId: "p1" },
      registry
    ).state;
    const cycled = dispatch(
      allFaceDown,
      { type: "end-turn", playerId: "p1" },
      registry
    );
    expect(cycled.state.currentPlayerId).toBe("p2");
    expect(cycled.state.turnNumber).toBe(5);
    expect(cycled.state.phase).toBe("judgment");
  });
});
