import { CoreBoutAdapter } from "./core-bout-adapter";
import {
  createEarlyExpansionRegistry,
  createMatchSetup,
  createScriptedMatchSetup,
  finalizeMatchSetup,
  identityCounts
} from "../core";
import type {
  EarlyExpansionId,
  Identity,
  MatchSetup
} from "../core";
import {
  GAME_MODES,
  MatchPlayClock,
  createSavedMatch,
  parseSavedMatch,
  summarizeMatch
} from "../session/match-lifecycle";
import {
  STORY_CAMPAIGNS,
  campaignScenario,
  completeCampaignScenario,
  createCampaignProgress,
  parseCampaignProgress
} from "../session/story-campaign";
import type { CampaignFaction } from "../session/story-campaign";
import {
  createAudioEngine
} from "./audio-engine";
import type {
  SgsAudioEngine
} from "./audio-engine";
import {
  AdaptiveMusicDirector
} from "./adaptive-music";
import {
  createAssetLoader
} from "./asset-loader";
import type {
  SgsAssetLoader
} from "./asset-loader";

const selectedPackIds = (): EarlyExpansionId[] =>
  Array.from(
    document.querySelectorAll<HTMLInputElement>(".expansion_pack:checked")
  ).map((input) => input.value as EarlyExpansionId);

declare global {
  interface Window {
    sgsCore?: {
      createBout(
        players: ConstructorParameters<typeof CoreBoutAdapter>[0],
        aiLevel: number,
        seed?: number,
        options?: ConstructorParameters<typeof CoreBoutAdapter>[3]
      ): CoreBoutAdapter;
      gameModes: typeof GAME_MODES;
      storyCampaigns: typeof STORY_CAMPAIGNS;
      createCampaignProgress: typeof createCampaignProgress;
      parseCampaignProgress: typeof parseCampaignProgress;
      completeCampaignScenario: typeof completeCampaignScenario;
      createSavedMatch: typeof createSavedMatch;
      parseSavedMatch: typeof parseSavedMatch;
      summarizeMatch: typeof summarizeMatch;
      createMatchPlayClock(initialDurationMs?: number): MatchPlayClock;
      identityCounts(playerCount: number): ReturnType<typeof identityCounts>;
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
      prepareStoryMatch(
        campaignId: CampaignFaction,
        scenarioId: string,
        unlockedHeroDefinitionIds: string[]
      ): ReturnType<typeof prepareStoryMatch>;
      finalizeMatch(
        setup: MatchSetup,
        localHeroDefinitionId: string
      ): ReturnType<typeof finalizeMatchSetup>;
    };
    sgsDebug?: {
      exportNow(): Promise<string | null>;
      captureFailure(
        error: unknown,
        context?: Record<string, unknown>
      ): Promise<string | null>;
      lastFailure(): string | null;
    };
    sgsAudio: SgsAudioEngine;
    sgsAssets: SgsAssetLoader;
    sgsAdaptiveMusic: AdaptiveMusicDirector;
  }
}

window.sgsAudio = createAudioEngine();
window.sgsAssets = createAssetLoader({
  whenAudioCatalogReady: () => window.sgsAudio.whenCatalogReady()
});
void window.sgsAssets.start();
window.sgsAdaptiveMusic = new AdaptiveMusicDirector(window.sgsAudio);
window.sgsAudio.bindControls();
window.sgsAudio.playMusic("music.menu");
document.addEventListener("pointerdown", () => {
  void window.sgsAudio.unlock();
}, { once: true });

function prepareStoryMatch(
  campaignId: CampaignFaction,
  scenarioId: string,
  unlockedHeroDefinitionIds: string[]
) {
  const story = campaignScenario(campaignId, scenarioId);
  const expansionIds = [
    ...new Set([...selectedPackIds(), ...story.requiredExpansionIds])
  ];
  const registry = createEarlyExpansionRegistry(expansionIds);
  const legacy = window as unknown as {
    sgs: { func: { get_random_seed(): number | null } };
  };
  const seed = legacy.sgs.func.get_random_seed() ?? Date.now();
  return {
    scenario: story,
    requiredExpansionIds: expansionIds,
    setup: createScriptedMatchSetup(registry, {
      seed,
      definition: {
        seats: story.seats,
        localHeroDefinitionIds: story.localHeroDefinitionIds
      },
      unlockedHeroDefinitionIds
    }),
    heroes: registry.heroes().map((hero) => ({
      id: hero.id,
      name: hero.name,
      life: hero.maxHp,
      country: hero.kingdom,
      skills: hero.skillIds.map((skillId) => registry.skill(skillId).name)
    }))
  };
}

window.sgsCore = {
  gameModes: GAME_MODES,
  storyCampaigns: STORY_CAMPAIGNS,
  createCampaignProgress,
  parseCampaignProgress,
  completeCampaignScenario,
  createSavedMatch,
  parseSavedMatch,
  summarizeMatch,
  identityCounts,
  createMatchPlayClock: (initialDurationMs = 0) =>
    new MatchPlayClock(initialDurationMs),
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
  prepareStoryMatch,
  finalizeMatch: (setup, localHeroDefinitionId) =>
    finalizeMatchSetup(setup, localHeroDefinitionId),
  createBout: (players, aiLevel, seed, options) => {
    const legacy = window as unknown as {
      sgs: { func: { get_random_seed(): number | null } };
    };
    const configuredSeed = legacy.sgs.func.get_random_seed();
    return new CoreBoutAdapter(
      players,
      aiLevel,
      seed ?? configuredSeed ?? Date.now(),
      options
    );
  }
};

const DEBUG_STORAGE_KEY = "sgs.last-failure-jsonl";
let captureInProgress = false;

function activeBout(): CoreBoutAdapter | null {
  const runtime = window as unknown as {
    sgs?: { interface?: { bout?: CoreBoutAdapter } };
  };
  return runtime.sgs?.interface?.bout?.engine === "core"
    ? runtime.sgs.interface.bout
    : null;
}

function showDebugNotice(message: string): void {
  document.querySelector("#debug_export_notice")?.remove();
  const notice = document.createElement("div");
  notice.id = "debug_export_notice";
  notice.setAttribute("role", "status");
  notice.textContent = message;
  document.querySelector("#main")?.append(notice);
  window.setTimeout(() => notice.remove(), 5000);
}

function downloadJsonl(jsonl: string, prefix: string): void {
  const blob = new Blob([jsonl], { type: "application/x-ndjson" });
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = URL.createObjectURL(blob);
  link.download = `${prefix}-${timestamp}.jsonl`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
}

async function exportCurrentReplay(): Promise<string | null> {
  const bout = activeBout();
  if (!bout) return null;
  const jsonl = await bout.replayJsonl();
  downloadJsonl(jsonl, "sgs-replay");
  showDebugNotice("已导出当前牌局 JSONL");
  return jsonl;
}

async function captureBrowserFailure(
  error: unknown,
  context: Record<string, unknown> = {}
): Promise<string | null> {
  if (captureInProgress) return null;
  const bout = activeBout();
  if (!bout) return null;
  captureInProgress = true;
  try {
    const jsonl = await bout.captureFailure(error, context);
    window.localStorage.setItem(DEBUG_STORAGE_KEY, jsonl);
    downloadJsonl(jsonl, "sgs-failure");
    showDebugNotice("发生异常：调试 JSONL 已自动导出并保存在浏览器中");
    return jsonl;
  } finally {
    captureInProgress = false;
  }
}

window.sgsDebug = {
  exportNow: exportCurrentReplay,
  captureFailure: captureBrowserFailure,
  lastFailure: () => window.localStorage.getItem(DEBUG_STORAGE_KEY)
};

window.addEventListener("error", (event) => {
  void captureBrowserFailure(event.error ?? event.message, {
    type: "error",
    filename: event.filename,
    line: event.lineno,
    column: event.colno
  });
});
window.addEventListener("unhandledrejection", (event) => {
  void captureBrowserFailure(event.reason, {
    type: "unhandledrejection"
  });
});
document.addEventListener("click", (event) => {
  if ((event.target as Element | null)?.closest("#export_debug")) {
    void exportCurrentReplay();
  }
});
