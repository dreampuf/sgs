import { describe, expect, test } from "vitest";
import specs from "../../audio/specs/heroes.json" with { type: "json" };
import {
  createEarlyExpansionRegistry
} from "../../src/content/early-expansions";

describe("hero audio content coverage", () => {
  test("covers every registered hero exactly once", () => {
    const registry = createEarlyExpansionRegistry([
      "wind",
      "military",
      "fire",
      "forest"
    ]);
    const registeredIds = registry.heroes().map((hero) => hero.id).sort();
    const audioIds = specs.heroes.map((hero) => hero.definitionId).sort();
    expect(audioIds).toEqual(registeredIds);
    expect(new Set(audioIds).size).toBe(49);
  });

  test("references only real hero skills and cards with complete lines", () => {
    const registry = createEarlyExpansionRegistry([
      "wind",
      "military",
      "fire",
      "forest"
    ]);
    for (const audio of specs.heroes) {
      const hero = registry.hero(audio.definitionId);
      expect(audio.skills).toEqual(hero.skillIds);
      for (const skillId of audio.skills) {
        expect(registry.skill(skillId).id).toBe(skillId);
      }
      for (const cardId of audio.signatureCardIds) {
        expect(registry.hasCard(cardId)).toBe(true);
      }
      expect(audio.lines.signature.trim().length).toBeGreaterThan(3);
      expect(audio.lines.victory.trim().length).toBeGreaterThan(3);
      expect(audio.lines.death.trim().length).toBeGreaterThan(3);
    }
  });
});
