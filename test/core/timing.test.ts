import { describe, expect, test } from "vitest";
import {
  createGameState,
  createStandardRegistry
} from "../../src/core";
import type {
  ContentPack,
  DamageEffect
} from "../../src/core";

const pack: ContentPack = {
  id: "timing-fixture",
  version: "1.0.0",
  name: "Timing fixture",
  requires: ["standard@0.3.0"],
  cards: [],
  heroes: [],
  workflows: [],
  skills: [
    {
      id: "test:timing:add-damage",
      name: "Add damage",
      abilities: [{
        type: "timing",
        timing: "before-effect",
        priority: 0,
        match: {
          effectType: "damage",
          sourceIsOwner: true
        },
        operation: { type: "add-amount", amount: 1 }
      }]
    },
    {
      id: "test:timing:cap-damage",
      name: "Cap damage",
      abilities: [{
        type: "timing",
        timing: "before-effect",
        priority: 10,
        match: {
          effectType: "damage",
          targetIsOwner: true
        },
        operation: { type: "cap-amount", maximum: 1 }
      }]
    }
  ]
};

function damage(): DamageEffect {
  return {
    type: "damage",
    sourceId: "p1",
    targetId: "p2",
    amount: 2,
    cardId: "system:test-damage",
    nature: "normal"
  };
}

describe("semantic timing rule bus", () => {
  test("content subscribes to a timing point without card callbacks", () => {
    const serialized = JSON.parse(JSON.stringify(pack.skills));
    expect(serialized).toEqual(pack.skills);
    expect(serialized[0].abilities[0]).toMatchObject({
      type: "timing",
      timing: "before-effect",
      match: { effectType: "damage" }
    });
  });

  test("rules are ordered, independently discovered, and auditable", () => {
    const registry = createStandardRegistry();
    registry.registerPack(pack);
    const state = createGameState({
      seed: 301,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          skillIds: ["test:timing:add-damage"]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4,
          skillIds: ["test:timing:cap-damage"]
        }
      ]
    });

    const resolution = registry.resolveTiming(state, {
      point: "before-effect",
      intent: { type: "effect", effect: damage() }
    });

    expect(resolution.effects).toEqual([
      expect.objectContaining({
        ...damage(),
        amount: 1,
        tags: [
          "timing:handled:p1:skill:test:timing:add-damage:timing:0",
          "timing:handled:p2:skill:test:timing:cap-damage:timing:0"
        ]
      })
    ]);
    expect(resolution.appliedRuleIds).toEqual([
      "p1:skill:test:timing:add-damage:timing:0",
      "p2:skill:test:timing:cap-damage:timing:0"
    ]);
    expect(JSON.parse(JSON.stringify(resolution))).toEqual(resolution);
  });

  test("the input intent and game snapshot stay immutable", () => {
    const registry = createStandardRegistry();
    registry.registerPack(pack);
    const state = createGameState({
      seed: 302,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          skillIds: ["test:timing:add-damage"]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4
        }
      ]
    });
    const originalState = structuredClone(state);
    const effect = damage();

    registry.resolveTiming(state, {
      point: "before-effect",
      intent: { type: "effect", effect }
    });

    expect(effect).toEqual(damage());
    expect(state).toEqual(originalState);
  });
});
