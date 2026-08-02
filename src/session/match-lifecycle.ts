import type {
  DomainEvent,
  GameState,
  Identity,
  PlayerId
} from "../core/types";
import type { CampaignProgress } from "./story-campaign";

export type GameModeId = "identity" | "story";
export type MatchOutcome = "victory" | "defeat";

export interface StoryChapter {
  id: string;
  title: string;
  era: string;
  prologue: string[];
  objective: string;
  victoryText: string;
  defeatText: string;
}

export interface GameModeDefinition {
  id: GameModeId;
  name: string;
  description: string;
  playerCount: number;
  minPlayers: number;
  maxPlayers: number;
  localIdentity: Identity;
  story?: StoryChapter;
}

export const STORY_CHAPTER: StoryChapter = {
  id: "yellow-turban-oath",
  title: "第一章 · 桃园举义",
  era: "中平元年",
  prologue: [
    "黄巾四起，州郡告急。涿郡城外，三位英雄立誓同心。",
    "乱世没有旁观者。守住主公，击破反贼与野心家，才能让这支新军走出第一步。"
  ],
  objective: "胜利目标：保护主公，并消灭所有反贼与内奸。",
  victoryText: "烽烟暂息，桃园誓言传遍军中。新的征途已经开始。",
  defeatText: "义军在乱阵中失散。重整旗鼓，方有再战之机。"
};

export const GAME_MODES: Record<GameModeId, GameModeDefinition> = {
  identity: {
    id: "identity",
    name: "标准身份场",
    description: "2 至 20 人身份局：主公、忠臣、反贼与内奸争夺胜利。",
    playerCount: 4,
    minPlayers: 2,
    maxPlayers: 20,
    localIdentity: "renegade"
  },
  story: {
    id: "story",
    name: "剧情模式",
    description: "从桃园举义开始，在章节目标与叙事中完成一场身份战。",
    playerCount: 4,
    minPlayers: 4,
    maxPlayers: 4,
    localIdentity: "lord",
    story: STORY_CHAPTER
  }
};

export interface PlayerMatchStatistics {
  playerId: PlayerId;
  cardsUsed: number;
  responses: number;
  skillsActivated: number;
  cardsDrawn: number;
  damageDealt: number;
  damageReceived: number;
  recovered: number;
  kills: number;
}

export interface MatchSummary {
  outcome: MatchOutcome;
  winnerIds: PlayerId[];
  turns: number;
  durationMs: number;
  players: PlayerMatchStatistics[];
}

export interface SavedHero {
  id: string;
  name: string;
  life: number;
  country: string;
  skills: string[];
}

export interface SavedPlayer {
  id: PlayerId;
  nickname: string;
  identity: number;
  isAI: boolean;
  hero: SavedHero;
}

export interface SavedMatch {
  schemaVersion: 1;
  savedAt: number;
  startedAt: number;
  activeDurationMs: number;
  modeId: GameModeId;
  expansionIds: string[];
  aiLevel: number;
  seed: number;
  localPlayerId: PlayerId;
  campaign?: CampaignProgress & { scenarioId: string };
  players: SavedPlayer[];
  snapshot: string;
}

export class MatchPlayClock {
  #accumulatedMs: number;
  #segmentStartedAt: number | null = null;

  constructor(initialDurationMs = 0) {
    this.#accumulatedMs = Math.max(0, initialDurationMs);
  }

  start(now = performance.now()): void {
    if (this.#segmentStartedAt === null) {
      this.#segmentStartedAt = now;
    }
  }

  stop(now = performance.now()): number {
    if (this.#segmentStartedAt !== null) {
      this.#accumulatedMs += Math.max(0, now - this.#segmentStartedAt);
      this.#segmentStartedAt = null;
    }
    return this.#accumulatedMs;
  }

  elapsed(now = performance.now()): number {
    return this.#segmentStartedAt === null
      ? this.#accumulatedMs
      : this.#accumulatedMs + Math.max(0, now - this.#segmentStartedAt);
  }

  running(): boolean {
    return this.#segmentStartedAt !== null;
  }
}

function emptyStatistics(playerId: PlayerId): PlayerMatchStatistics {
  return {
    playerId,
    cardsUsed: 0,
    responses: 0,
    skillsActivated: 0,
    cardsDrawn: 0,
    damageDealt: 0,
    damageReceived: 0,
    recovered: 0,
    kills: 0
  };
}

function gameEndedEvent(events: DomainEvent[]) {
  return [...events].reverse().find(
    (event): event is Extract<DomainEvent, { type: "GameEnded" }> =>
      event.type === "GameEnded"
  );
}

export function summarizeMatch(
  state: GameState,
  localPlayerId: PlayerId,
  activeDurationMs: number
): MatchSummary {
  const ended = gameEndedEvent(state.eventLog);
  if (!ended || state.phase !== "finished") {
    throw new Error("cannot summarize a match before GameEnded");
  }
  const statistics = new Map(
    state.turnOrder.map((playerId) => [
      playerId,
      emptyStatistics(playerId)
    ])
  );
  const forPlayer = (playerId: PlayerId) => {
    const value = statistics.get(playerId);
    if (!value) throw new Error(`event references unknown player: ${playerId}`);
    return value;
  };

  for (const event of state.eventLog) {
    if (event.type === "CardUsed") {
      forPlayer(event.playerId).cardsUsed += 1;
    } else if (event.type === "CardResponded") {
      forPlayer(event.playerId).responses += 1;
    } else if (event.type === "SkillActivated") {
      forPlayer(event.playerId).skillsActivated += 1;
    } else if (event.type === "CardsDrawn") {
      forPlayer(event.playerId).cardsDrawn += event.count;
    } else if (event.type === "DamageApplied") {
      forPlayer(event.sourceId).damageDealt += event.amount;
      forPlayer(event.targetId).damageReceived += event.amount;
    } else if (event.type === "HpRecovered") {
      forPlayer(event.playerId).recovered += event.amount;
    } else if (event.type === "PlayerDied" && event.sourceId) {
      forPlayer(event.sourceId).kills += 1;
    }
  }

  return {
    outcome: ended.winnerIds.includes(localPlayerId) ? "victory" : "defeat",
    winnerIds: [...ended.winnerIds],
    turns: Math.max(
      state.turnNumber,
      ...state.eventLog
        .filter((
          event
        ): event is Extract<DomainEvent, { type: "TurnStarted" }> =>
          event.type === "TurnStarted"
        )
        .map((event) => event.turnNumber)
    ),
    durationMs: Math.max(0, activeDurationMs),
    players: state.turnOrder.map((playerId) => forPlayer(playerId))
  };
}

export function createSavedMatch(
  input: Omit<SavedMatch, "schemaVersion" | "savedAt">,
  savedAt = Date.now()
): SavedMatch {
  return {
    schemaVersion: 1,
    savedAt,
    ...structuredClone(input)
  };
}

export function parseSavedMatch(serialized: string): SavedMatch {
  const value = JSON.parse(serialized) as Partial<SavedMatch>;
  const validPlayer = (player: SavedPlayer): boolean =>
    typeof player?.id === "string" &&
    typeof player.nickname === "string" &&
    typeof player.identity === "number" &&
    typeof player.isAI === "boolean" &&
    typeof player.hero?.id === "string" &&
    typeof player.hero.name === "string" &&
    typeof player.hero.life === "number" &&
    typeof player.hero.country === "string" &&
    Array.isArray(player.hero.skills) &&
    player.hero.skills.every((skill) => typeof skill === "string");
  if (
    value.schemaVersion !== 1 ||
    (value.modeId !== "identity" && value.modeId !== "story") ||
    !Array.isArray(value.players) ||
    value.players.length < 2 ||
    !value.players.every(validPlayer) ||
    !Array.isArray(value.expansionIds) ||
    !value.expansionIds.every((id) => typeof id === "string") ||
    typeof value.snapshot !== "string" ||
    typeof value.localPlayerId !== "string" ||
    typeof value.seed !== "number" ||
    !Number.isFinite(value.seed) ||
    typeof value.aiLevel !== "number" ||
    typeof value.startedAt !== "number" ||
    typeof value.savedAt !== "number"
  ) {
    throw new Error("存档格式无效或版本不受支持");
  }
  if (
    value.campaign && (
      value.campaign.schemaVersion !== 1 ||
      typeof value.campaign.campaignId !== "string" ||
      !Array.isArray(value.campaign.completedScenarioIds) ||
      !Array.isArray(value.campaign.unlockedHeroDefinitionIds) ||
      typeof value.campaign.currentScenarioId !== "string" ||
      typeof value.campaign.scenarioId !== "string" ||
      typeof value.campaign.updatedAt !== "number"
    )
  ) {
    throw new Error("存档中的剧情战役进度无效");
  }
  const state = JSON.parse(value.snapshot) as Partial<GameState>;
  if (
    state.schemaVersion !== 3 ||
    !state.players ||
    !Array.isArray(state.turnOrder) ||
    state.turnOrder.length !== value.players.length ||
    !value.players.every((player) => state.players?.[player.id]) ||
    !state.players[value.localPlayerId]
  ) {
    throw new Error("存档中的 Core 对局快照无效");
  }
  const activeDurationMs =
    typeof value.activeDurationMs === "number" &&
    Number.isFinite(value.activeDurationMs)
      ? Math.max(0, value.activeDurationMs)
      : Math.max(0, value.savedAt - value.startedAt);
  return {
    ...(value as Omit<SavedMatch, "activeDurationMs">),
    activeDurationMs
  };
}
