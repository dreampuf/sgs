import { CoreBoutAdapter } from "./core-bout-adapter";
import {
  createEarlyExpansionRegistry,
  createMatchSetup,
  finalizeMatchSetup
} from "../core";
import type {
  EarlyExpansionId,
  Identity,
  MatchSetup
} from "../core";

const selectedPackIds = (): EarlyExpansionId[] =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(".expansion_pack:checked")
  ).map((input) => input.value as EarlyExpansionId);

declare global {
  interface Window {
    sgsCore?: {
      createBout(
        players: ConstructorParameters<typeof CoreBoutAdapter>[0],
        aiLevel: number
      ): CoreBoutAdapter;
      prepareMatch(
        playerCount: number,
        localIdentity: Identity
      ): {
        setup: MatchSetup;
        heroes: Array<{
          id: string;
          name: string;
          life: number;
          country: string;
          skills: string[];
        }>;
      };
      finalizeMatch(
        setup: MatchSetup,
        localHeroDefinitionId: string
      ): ReturnType<typeof finalizeMatchSetup>;
    };
  }
}

window.sgsCore = {
  prepareMatch: (playerCount, localIdentity) => {
    const registry = createEarlyExpansionRegistry(selectedPackIds());
    const legacy = window as unknown as {
      sgs: { func: { get_random_seed(): number | null } };
    };
    const seed = legacy.sgs.func.get_random_seed() ?? Date.now();
    return {
      setup: createMatchSetup(registry, {
        seed,
        playerCount,
        localIdentity
      }),
      heroes: registry.heroes().map((hero) => ({
        id: hero.id,
        name: hero.name,
        life: hero.maxHp,
        country: hero.kingdom,
        skills: hero.skillIds.map((skillId) => registry.skill(skillId).name)
      }))
    };
  },
  finalizeMatch: (setup, localHeroDefinitionId) =>
    finalizeMatchSetup(setup, localHeroDefinitionId),
  createBout: (players, aiLevel) => {
    const legacy = window as unknown as {
      sgs: { func: { get_random_seed(): number | null } };
    };
    const configuredSeed = legacy.sgs.func.get_random_seed();
    return new CoreBoutAdapter(
      players,
      aiLevel,
      configuredSeed ?? Date.now()
    );
  }
};
