import { describe, expect, test } from "vitest";
import {
  ContentRegistry,
  STANDARD_CARD,
  createGameState,
  createManeuveringPack,
  createStandardPack,
  createStandardRegistry,
  dispatch,
  handZone,
  judgmentZone
} from "../../src/core";
import type { ContentPack } from "../../src/core";

const CARD_ID = "test:declarative-strike";
const TRICK_ID = "test:declarative-trick";
const REACTION_ID = "test:skill:after-damaged";

const pack: ContentPack = {
  id: "declarative-card-fixture",
  version: "1.0.0",
  name: "Declarative card fixture",
  requires: ["standard@0.3.0"],
  heroes: [],
  workflows: [],
  cards: [
    {
      id: CARD_ID,
      name: "Declarative strike",
      category: "basic",
      tags: ["response:slash"],
      active: true,
      implementation: "complete",
      target: {
        type: "players",
        candidates: "others",
        minimum: 1,
        maximum: 1,
        filters: [{ type: "alive" }]
      },
      program: {
        steps: [{
          type: "for-each-player",
          players: "targets",
          steps: [{
            type: "damage",
            source: "source",
            target: "target",
            amount: 1,
            nature: "normal"
          }]
        }]
      }
    },
    {
      id: TRICK_ID,
      name: "Declarative trick",
      category: "trick",
      active: true,
      implementation: "complete",
      target: { type: "none" },
      program: {
        steps: [{ type: "draw", player: "source", count: 2 }]
      }
    }
  ],
  skills: [{
    id: REACTION_ID,
    name: "After damaged",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [{ type: "event-player-is-owner", field: "targetId" }],
      program: {
        steps: [{ type: "draw", player: "source", count: 1 }]
      }
    }]
  }]
};

describe("declarative card programs", () => {
  test("a card is serializable and does not receive GameState callbacks", () => {
    const definition = pack.cards[0]!;
    expect("getTargetSets" in definition).toBe(false);
    expect("createEffects" in definition).toBe(false);
    expect(JSON.parse(JSON.stringify({
      target: definition.target,
      program: definition.program,
      abilities: pack.skills[0]!.abilities
    }))).toEqual({
      target: definition.target,
      program: definition.program,
      abilities: pack.skills[0]!.abilities
    });
  });

  test("the runtime discovers independent reactions after the card resolves", () => {
    const registry = createStandardRegistry();
    registry.registerPack(pack);
    const initial = createGameState({
      seed: 91,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [CARD_ID]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          hand: [],
          skillIds: [REACTION_ID]
        }
      ],
      drawPile: ["standard:jink"]
    });
    const cardId = initial.zones[handZone("p1")]![0]!;
    const waiting = dispatch(initial, {
      type: "use-card",
      playerId: "p1",
      cardId,
      targetIds: ["p2"]
    }, registry);
    expect(waiting.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "jink"
    });
    const result = dispatch(waiting.state, {
      type: "pass",
      playerId: "p2",
      decisionId: waiting.pendingDecision!.id
    }, registry);

    expect(result.state.players.p2?.hp).toBe(3);
    expect(result.state.zones[handZone("p2")]).toHaveLength(1);
    expect(result.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(["DamageApplied", "CardsDrawn"])
    );
  });

  test("standard baseline cards already use the same data-only boundary", () => {
    const registry = createStandardRegistry();
    for (const definition of createStandardPack().cards) {
      expect(definition.target).toBeDefined();
      expect(definition.program).toBeDefined();
      expect("getTargetSets" in definition).toBe(false);
      expect("createEffects" in definition).toBe(false);
      expect(
        definition.tags?.some((tag) => tag.startsWith("interaction:")) ??
          false
      ).toBe(false);
      const declarativeData = {
        target: definition.target,
        program: definition.program,
        ...(definition.delayed
          ? {
              delayed: {
                judgment: definition.delayed.judgment,
                onMatch: definition.delayed.onMatch,
                onMiss: definition.delayed.onMiss
              }
            }
          : {})
      };
      expect(JSON.parse(JSON.stringify(declarativeData))).toEqual(
        declarativeData
      );
    }
    const slashProgram = JSON.stringify(
      registry.card("standard:slash").program
    );
    const drawProgram = JSON.stringify(
      registry.card("standard:ex-nihilo").program
    );
    expect(slashProgram).not.toContain("response-window");
    expect(slashProgram).not.toContain("response:jink");
    expect(drawProgram).not.toContain("nullification-window");
  });

  test("a content pack inherits response rules without declaring context calls", () => {
    expect(pack.resolutionRules).toBeUndefined();
    const registry = createStandardRegistry();
    registry.registerPack(pack);
    const state = createGameState({
      seed: 93,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [CARD_ID]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4
        }
      ]
    });
    const cardId = state.zones[handZone("p1")]![0]!;
    const waiting = dispatch(state, {
      type: "use-card",
      playerId: "p1",
      cardId,
      targetIds: ["p2"]
    }, registry);

    expect(waiting.pendingDecision).toMatchObject({
      type: "respond-card",
      playerId: "p2",
      responseKind: "jink"
    });
  });

  test("a new trick inherits the nullification protocol without calling it", () => {
    const registry = createStandardRegistry();
    registry.registerPack(pack);
    const initial = createGameState({
      seed: 94,
      drawPile: [STANDARD_CARD.jink, STANDARD_CARD.jink],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: [TRICK_ID]
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
      result = dispatch(result.state, {
        type: "pass",
        playerId: result.pendingDecision.playerId,
        decisionId: result.pendingDecision.id
      }, registry);
    }

    expect(result.state.zones[handZone("p1")]).toHaveLength(0);
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "CardCancelled",
        reason: "nullification"
      })
    ]));
  });

  test("delayed resolution only opens protocols registered by its packs", () => {
    const isolated = new ContentRegistry();
    isolated.registerPack({
      id: "isolated-delayed",
      version: "1.0.0",
      name: "Isolated delayed fixture",
      requires: [],
      skills: [],
      heroes: [],
      cards: [{
        id: "test:isolated-delayed",
        name: "Isolated delayed",
        category: "trick",
        active: true,
        implementation: "complete",
        target: {
          type: "players",
          candidates: "others",
          minimum: 1,
          maximum: 1,
          filters: [{ type: "alive" }]
        },
        program: {
          steps: [{
            type: "for-each-player",
            players: "targets",
            steps: [{ type: "place-delayed", player: "target" }]
          }]
        },
        delayed: {
          judgment: { includedSuits: ["spade"] },
          onMatch: { steps: [] },
          onMiss: "discard"
        }
      }]
    });
    const state = createGameState({
      seed: 95,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: ["test:isolated-delayed"]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4
        }
      ]
    });
    const cardId = state.zones[handZone("p1")]!.shift()!;
    state.zones[judgmentZone("p2")]!.push(cardId);
    state.cards[cardId]!.sourcePlayerId = "p1";

    expect(isolated.beginDelayedResolution(state, "p2", cardId)).toEqual([{
      type: "perform-judgment",
      playerId: "p2",
      delayedCardId: cardId
    }]);
    expect(JSON.stringify(isolated.beginDelayedResolution(
      state,
      "p2",
      cardId
    ))).not.toContain("negatable");
  });

  test("card compilation emits a target intent without embedding response context", () => {
    const registry = createStandardRegistry();
    const state = createGameState({
      seed: 92,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: ["standard:slash"]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4
        }
      ]
    });
    const cardId = state.zones[handZone("p1")]![0]!;
    const effects = registry.cardEffects({
      state,
      sourceId: "p1",
      cardId,
      targetIds: ["p2"]
    });

    expect(effects[0]).toMatchObject({
      type: "resolve-target",
      targetId: "p2",
      effects: [{
        type: "damage",
        sourceId: "p1",
        targetId: "p2"
      }]
    });
    expect(JSON.stringify(effects)).not.toContain("request-response");
    expect(JSON.stringify(registry.card("standard:slash").program))
      .not.toContain("request-response");
    expect(JSON.stringify(createStandardPack().resolutionRules))
      .not.toContain("onAccepted");
  });

  test("the complete standard content catalog is data-only outside workflows", () => {
    const packs = [createStandardPack(), createManeuveringPack()];
    const contentData = {
      cards: packs.flatMap((pack) => pack.cards),
      skills: packs.flatMap((pack) => pack.skills),
      heroes: packs.flatMap((pack) => pack.heroes),
      resolutionRules: packs.flatMap(
        (pack) => pack.resolutionRules ?? []
      )
    };
    expect(JSON.parse(JSON.stringify(contentData))).toEqual(contentData);
  });
});
