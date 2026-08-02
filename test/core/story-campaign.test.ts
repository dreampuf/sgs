import { describe, expect, test } from "vitest";
import { createEarlyExpansionRegistry } from "../../src/content/early-expansions";
import {
  createScriptedMatchSetup,
  finalizeMatchSetup
} from "../../src/core/match-setup";
import {
  STORY_CAMPAIGNS,
  availableScenarioIds,
  completeCampaignScenario,
  createCampaignProgress,
  parseCampaignProgress
} from "../../src/session/story-campaign";

describe("story campaign timeline", () => {
  test("defines a chronological, playable event table for every faction", () => {
    expect(Object.keys(STORY_CAMPAIGNS).sort()).toEqual([
      "qun", "shu", "wei", "wu"
    ]);
    for (const campaign of Object.values(STORY_CAMPAIGNS)) {
      expect(campaign.timeline.length).toBeGreaterThanOrEqual(3);
      expect(campaign.timeline.map((item) => item.difficulty)).toEqual([
        "初阵", "鏖战", "大会战"
      ]);
      expect(campaign.timeline.map((item) => item.year)).toEqual(
        [...campaign.timeline.map((item) => item.year)].sort((a, b) => a - b)
      );
      const playerCounts = campaign.timeline.map((item) => item.seats.length);
      expect(playerCounts.every((count, index) =>
        index === 0 || count > playerCounts[index - 1]!
      )).toBe(true);
      for (const scenario of campaign.timeline) {
        const registry = createEarlyExpansionRegistry(
          scenario.requiredExpansionIds
        );
        const heroIds = new Set(registry.heroes().map((hero) => hero.id));
        const referencedHeroIds = [
          ...scenario.localHeroDefinitionIds,
          ...scenario.seats.flatMap((seat) =>
            seat.heroDefinitionId ? [seat.heroDefinitionId] : []
          ),
          ...scenario.unlockHeroDefinitionIds
        ];
        expect(
          referencedHeroIds.filter((heroId) => !heroIds.has(heroId)),
          `${scenario.id} references unavailable heroes`
        ).toEqual([]);
        expect(scenario.localHeroDefinitionIds).toEqual([
          scenario.seats[0]!.heroDefinitionId
        ]);
        expect(new Set(scenario.seats.map((seat) => seat.heroDefinitionId)).size)
          .toBe(scenario.seats.length);
        expect(scenario.seats.some((seat) => seat.identity === "renegade"))
          .toBe(false);
        expect(scenario.seats.some((seat) => seat.identity === "loyalist"))
          .toBe(true);
        expect(scenario.seats.some((seat) => seat.identity === "rebel"))
          .toBe(true);
        const allowedCards = new Set(scenario.cardNames);
        const themedPrints = registry.cardPrints().filter((print) =>
          allowedCards.has(registry.card(print.definitionId).name)
        );
        expect(
          themedPrints.length,
          `${scenario.id} card pool must deal all opening hands`
        ).toBeGreaterThanOrEqual(scenario.seats.length * 4 + 1);
        expect(scenario.beats.length).toBeGreaterThan(0);
      }
    }
  });

  test("unlocks heroes and the next event only after victory", () => {
    const initial = createCampaignProgress("shu", 10);
    const campaign = STORY_CAMPAIGNS.shu;
    expect(availableScenarioIds(initial)).toEqual([
      campaign.timeline[0]!.id
    ]);
    const afterVictory = completeCampaignScenario(
      initial,
      campaign.timeline[0]!.id,
      20
    );
    expect(availableScenarioIds(afterVictory)).toEqual([
      campaign.timeline[0]!.id,
      campaign.timeline[1]!.id
    ]);
    expect(afterVictory.currentScenarioId).toBe(campaign.timeline[1]!.id);
    expect(afterVictory.unlockedHeroDefinitionIds).toEqual(
      expect.arrayContaining([
        "standard:hero:刘备",
        "standard:hero:关羽",
        "standard:hero:张飞"
      ])
    );
    expect(
      parseCampaignProgress(JSON.stringify(afterVictory), "shu")
    ).toEqual(afterVictory);
    expect(() =>
      completeCampaignScenario(initial, campaign.timeline[1]!.id)
    ).toThrow("locked");
  });

  test("grows each campaign from a fixed small encounter into a large battle", () => {
    expect(Object.fromEntries(
      Object.entries(STORY_CAMPAIGNS).map(([id, campaign]) => [
        id,
        campaign.timeline.map((scenario) => scenario.seats.length)
      ])
    )).toEqual({
      shu: [4, 6, 8],
      wei: [3, 5, 7],
      wu: [3, 5, 8],
      qun: [3, 5, 7]
    });

    for (const campaign of Object.values(STORY_CAMPAIGNS)) {
      const unlocked = new Set(campaign.initialHeroDefinitionIds);
      for (const story of campaign.timeline) {
        const registry = createEarlyExpansionRegistry(
          story.requiredExpansionIds
        );
        const setup = createScriptedMatchSetup(registry, {
          seed: story.year,
          definition: {
            seats: story.seats,
            localHeroDefinitionIds: story.localHeroDefinitionIds
          },
          unlockedHeroDefinitionIds: [...unlocked]
        });
        expect(setup.playerCount).toBe(story.seats.length);
        expect(setup.localHeroChoices).toEqual([
          story.seats[0]!.heroDefinitionId
        ]);
        expect(finalizeMatchSetup(setup, setup.localHeroChoices[0]!).seats)
          .toEqual(expect.arrayContaining(
            story.seats.map((seat) => expect.objectContaining(seat))
          ));
        story.unlockHeroDefinitionIds.forEach((heroId) => unlocked.add(heroId));
      }
    }
  });

  test("builds fixed story seats while limiting the local roster", () => {
    const scenario = STORY_CAMPAIGNS.shu.timeline[0]!;
    const registry = createEarlyExpansionRegistry(
      scenario.requiredExpansionIds
    );
    const setup = createScriptedMatchSetup(registry, {
      seed: 184,
      definition: {
        seats: scenario.seats,
        localHeroDefinitionIds: scenario.localHeroDefinitionIds
      },
      unlockedHeroDefinitionIds: ["standard:hero:刘备"]
    });
    expect(setup.localHeroChoices).toEqual(["standard:hero:刘备"]);
    expect(setup.seats.map((seat) => seat.identity)).toEqual([
      "lord", "loyalist", "loyalist", "rebel"
    ]);
    const finalized = finalizeMatchSetup(
      setup,
      "standard:hero:刘备"
    );
    expect(finalized.seats.map((seat) => seat.heroDefinitionId)).toEqual([
      "standard:hero:刘备",
      "standard:hero:关羽",
      "standard:hero:张飞",
      "wind:hero:张角"
    ]);
  });
});
