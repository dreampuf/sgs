import { normalizeSeed, shuffle } from "./rng";
import type {
  CardDefinitionId,
  CardSuit,
  GameState,
  PlayerId,
  PlayerState,
  ZoneId
} from "./types";

export const DRAW_PILE: ZoneId = "zone:draw";
export const DISCARD_PILE: ZoneId = "zone:discard";
export const PROCESSING_ZONE: ZoneId = "zone:processing";

export function handZone(playerId: PlayerId): ZoneId {
  return `zone:hand:${playerId}`;
}

export function equipmentZone(playerId: PlayerId): ZoneId {
  return `zone:equipment:${playerId}`;
}

export function judgmentZone(playerId: PlayerId): ZoneId {
  return `zone:judgment:${playerId}`;
}

export interface InitialPlayer {
  id: PlayerId;
  heroDefinitionId: string;
  maxHp: number;
  hp?: number;
  hand?: CardSpec[];
  skillIds?: string[];
}

export interface CardPrint {
  definitionId: CardDefinitionId;
  suit: CardSuit;
  rank: number;
}

export type CardSpec = CardDefinitionId | CardPrint;

export interface CreateGameStateOptions {
  gameId?: string;
  rulesetId?: string;
  seed: number;
  players: InitialPlayer[];
  drawPile?: CardSpec[];
  currentPlayerId?: PlayerId;
  phase?: GameState["phase"];
  shuffleDrawPile?: boolean;
}

export function createGameState(options: CreateGameStateOptions): GameState {
  if (options.players.length < 2) {
    throw new Error("a game requires at least two players");
  }
  const seed = normalizeSeed(options.seed);
  const players: Record<PlayerId, PlayerState> = {};
  const zones: GameState["zones"] = {
    [DRAW_PILE]: [],
    [DISCARD_PILE]: [],
    [PROCESSING_ZONE]: []
  };
  const cards: GameState["cards"] = {};
  let cardSequence = 1;

  const addCards = (specs: CardSpec[], zoneId: ZoneId): void => {
    const zone = zones[zoneId] ?? (zones[zoneId] = []);
    for (const spec of specs) {
      const id = `card-${cardSequence++}`;
      cards[id] = typeof spec === "string"
        ? { id, definitionId: spec }
        : {
            id,
            definitionId: spec.definitionId,
            suit: spec.suit,
            rank: spec.rank
          };
      zone.push(id);
    }
  };

  for (const input of options.players) {
    if (players[input.id]) throw new Error(`duplicate player: ${input.id}`);
    if (input.maxHp <= 0) throw new Error(`invalid max hp for ${input.id}`);
    const hp = input.hp ?? input.maxHp;
    players[input.id] = {
      id: input.id,
      heroDefinitionId: input.heroDefinitionId,
      hp,
      maxHp: input.maxHp,
      alive: hp > 0,
      dying: false,
      skillIds: [...(input.skillIds ?? [])],
      marks: {}
    };
    zones[handZone(input.id)] = [];
    zones[equipmentZone(input.id)] = [];
    zones[judgmentZone(input.id)] = [];
    addCards(input.hand ?? [], handZone(input.id));
  }

  addCards(options.drawPile ?? [], DRAW_PILE);
  let rngState = seed;
  if (options.shuffleDrawPile) {
    const shuffled = shuffle(zones[DRAW_PILE]!, rngState);
    zones[DRAW_PILE] = shuffled.items;
    rngState = shuffled.state;
  }
  const turnOrder = options.players.map((player) => player.id);
  const currentPlayerId = options.currentPlayerId ?? turnOrder[0]!;
  if (!players[currentPlayerId]) {
    throw new Error(`unknown current player: ${currentPlayerId}`);
  }

  return {
    schemaVersion: 2,
    gameId: options.gameId ?? `game-${seed}`,
    rulesetId: options.rulesetId ?? "standard@0.1",
    seed,
    rngState,
    revision: 0,
    nextSequence: 1,
    turnNumber: 1,
    turnUsage: Object.fromEntries(turnOrder.map((id) => [id, {}])),
    players,
    turnOrder,
    currentPlayerId,
    phase: options.phase ?? "action",
    cards,
    zones,
    stack: [],
    triggerQueue: [],
    effectPlans: {},
    pendingDecision: null,
    eventLog: []
  };
}

export function cloneGameState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function serializeGameState(state: GameState): string {
  assertGameState(state);
  return JSON.stringify(state);
}

export function deserializeGameState(serialized: string): GameState {
  const state = migrateGameState(JSON.parse(serialized) as unknown);
  assertGameState(state);
  return state;
}

function migrateGameState(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const legacy = value as Record<string, unknown>;
  if (legacy.schemaVersion === 2) {
    const migrated = structuredClone(legacy);
    migrated.effectPlans ??= {};
    return migrated;
  }
  if (legacy.schemaVersion !== 1) return value;
  const migrated = structuredClone(legacy);
  const players = migrated.players as Record<
    string,
    Record<string, unknown>
  >;
  for (const player of Object.values(players ?? {})) {
    player.dying ??= false;
    player.skillIds ??= [];
    player.marks ??= {};
  }
  const turnOrder = migrated.turnOrder as string[] | undefined;
  migrated.schemaVersion = 2;
  migrated.turnNumber ??= 1;
  migrated.triggerQueue ??= [];
  migrated.effectPlans ??= {};
  migrated.turnUsage ??= Object.fromEntries(
    (turnOrder ?? []).map((id) => [id, {}])
  );
  return migrated;
}

export function assertGameState(value: unknown): asserts value is GameState {
  if (!value || typeof value !== "object") throw new Error("invalid game state");
  const state = value as Partial<GameState>;
  if (state.schemaVersion !== 2) {
    throw new Error(`unsupported game state schema: ${String(state.schemaVersion)}`);
  }
  if (
    !state.players ||
    !state.cards ||
    !state.zones ||
    !Array.isArray(state.turnOrder) ||
    !Array.isArray(state.stack) ||
    !Array.isArray(state.triggerQueue) ||
    !state.effectPlans
  ) {
    throw new Error("incomplete game state");
  }
  const located = new Set<string>();
  for (const [zoneId, cardIds] of Object.entries(state.zones)) {
    if (!Array.isArray(cardIds)) throw new Error(`invalid zone: ${zoneId}`);
    for (const cardId of cardIds) {
      if (!state.cards[cardId]) throw new Error(`zone references unknown card: ${cardId}`);
      if (located.has(cardId)) throw new Error(`card occurs in multiple zones: ${cardId}`);
      located.add(cardId);
    }
  }
  for (const cardId of Object.keys(state.cards)) {
    if (!located.has(cardId)) throw new Error(`card has no zone: ${cardId}`);
  }

  const planIds = new Set(Object.keys(state.effectPlans));
  for (const [planId, plan] of Object.entries(state.effectPlans)) {
    if (plan.id !== planId || !Array.isArray(plan.effects)) {
      throw new Error(`invalid effect plan: ${planId}`);
    }
  }
  const forbiddenRuntimeKeys = new Set([
    "onAccepted",
    "onAllPassed",
    "onResolved",
    "onNegated",
    "onMatch",
    "onMiss"
  ]);
  const verifyPlanReferences = (
    current: unknown,
    path: string
  ): void => {
    if (Array.isArray(current)) {
      current.forEach((item, index) =>
        verifyPlanReferences(item, `${path}[${index}]`)
      );
      return;
    }
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current)) {
      if (forbiddenRuntimeKeys.has(key)) {
        throw new Error(`nested runtime continuation at ${path}.${key}`);
      }
      if (
        key.endsWith("PlanId") &&
        typeof child === "string" &&
        !planIds.has(child)
      ) {
        throw new Error(
          `unknown effect plan ${child} at ${path}.${key}`
        );
      }
      if (key.endsWith("PlanIds") && Array.isArray(child)) {
        for (const planId of child) {
          if (typeof planId !== "string" || !planIds.has(planId)) {
            throw new Error(
              `unknown effect plan ${String(planId)} at ${path}.${key}`
            );
          }
        }
      }
      verifyPlanReferences(child, `${path}.${key}`);
    }
  };
  verifyPlanReferences(state.stack, "state.stack");
  verifyPlanReferences(state.triggerQueue, "state.triggerQueue");
  verifyPlanReferences(state.pendingDecision, "state.pendingDecision");
  verifyPlanReferences(state.effectPlans, "state.effectPlans");
}
