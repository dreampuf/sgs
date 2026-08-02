import type { ContentRegistry, HeroDefinition } from "./registry";
import { shuffle } from "./rng";
import {
  MAX_STANDARD_PLAYERS,
  MIN_STANDARD_PLAYERS
} from "./ruleset";
import type { Identity, PlayerId } from "./types";
export type { Identity } from "./types";

export interface MatchSeat {
  id: PlayerId;
  identity: Identity;
  heroDefinitionId?: string;
  isAI: boolean;
}

export interface MatchSetup {
  seed: number;
  playerCount: number;
  contentPacks: ReturnType<ContentRegistry["installedContentPacks"]>;
  seats: MatchSeat[];
  availableHeroDefinitionIds: string[];
  localHeroChoices: string[];
}

export interface ScriptedMatchDefinition {
  seats: Array<{
    identity: Identity;
    heroDefinitionId?: string;
  }>;
  localHeroDefinitionIds: string[];
}

export const MIN_IDENTITY_PLAYERS = MIN_STANDARD_PLAYERS;
export const MAX_IDENTITY_PLAYERS = MAX_STANDARD_PLAYERS;

/**
 * Large tables keep the classic 2-8 player split, then add a second
 * renegade at 9 players and a third at 15 players. The remaining seats keep
 * rebels one or two seats ahead of loyalists to offset the lord's extra HP
 * and public identity.
 */
export function identityCounts(
  playerCount: number
): Readonly<Record<Identity, number>> {
  if (
    !Number.isInteger(playerCount) ||
    playerCount < MIN_IDENTITY_PLAYERS ||
    playerCount > MAX_IDENTITY_PLAYERS
  ) {
    throw new Error(
      `identity mode supports ${MIN_IDENTITY_PLAYERS}-${
        MAX_IDENTITY_PLAYERS
      } players: ${playerCount}`
    );
  }
  if (playerCount === 2) {
    return { lord: 1, loyalist: 0, rebel: 1, renegade: 0 };
  }
  if (playerCount === 3) {
    return { lord: 1, loyalist: 0, rebel: 1, renegade: 1 };
  }
  if (playerCount === 4) {
    return { lord: 1, loyalist: 1, rebel: 1, renegade: 1 };
  }
  const renegade = playerCount <= 8 ? 1 : playerCount <= 14 ? 2 : 3;
  const factionSeats = playerCount - 1 - renegade;
  const loyalist = Math.floor((factionSeats - 1) / 2);
  return {
    lord: 1,
    loyalist,
    rebel: factionSeats - loyalist,
    renegade
  };
}

function identities(playerCount: number): Identity[] {
  const counts = identityCounts(playerCount);
  return (Object.entries(counts) as Array<[Identity, number]>)
    .flatMap(([identity, count]) =>
      Array.from({ length: count }, () => identity)
    );
}

function completeHeroes(registry: ContentRegistry): HeroDefinition[] {
  return registry.heroes().filter(
    (hero) => hero.implementation === "complete"
  );
}

export function createMatchSetup(
  registry: ContentRegistry,
  options: {
    seed: number;
    playerCount: number;
    localPlayerId?: PlayerId;
    localIdentity?: Identity;
  }
): MatchSetup {
  const localPlayerId = options.localPlayerId ?? "player-1";
  const heroPool = completeHeroes(registry);
  const requiredHeroes = Math.max(options.playerCount, 3);
  if (heroPool.length < requiredHeroes) {
    throw new Error(
      `not enough complete heroes: need ${requiredHeroes}, have ${heroPool.length}`
    );
  }
  let rngState = options.seed;
  const shuffledIdentities = shuffle(identities(options.playerCount), rngState);
  rngState = shuffledIdentities.state;
  const selectedIdentity = options.localIdentity ?? "renegade";
  const localIdentityIndex = shuffledIdentities.items.indexOf(selectedIdentity);
  if (localIdentityIndex < 0) {
    throw new Error(
      `identity ${selectedIdentity} is unavailable for ${options.playerCount} players`
    );
  }
  [
    shuffledIdentities.items[0],
    shuffledIdentities.items[localIdentityIndex]
  ] = [
    shuffledIdentities.items[localIdentityIndex]!,
    shuffledIdentities.items[0]!
  ];
  const shuffledHeroes = shuffle(heroPool.map((hero) => hero.id), rngState);
  const availableHeroDefinitionIds = shuffledHeroes.items;
  const seats = shuffledIdentities.items.map((identity, index): MatchSeat => ({
    id: index === 0 ? localPlayerId : `player-${index + 1}`,
    identity,
    isAI: index !== 0
  }));
  const lordSeat = seats.find((seat) => seat.identity === "lord")!;
  const lordChoices = availableHeroDefinitionIds.filter((heroId) => {
    const hero = registry.hero(heroId);
    return hero.skillIds.some(
      (skillId) => registry.skill(skillId).lordOnly === true
    );
  });
  if (lordSeat.isAI) {
    const lordHeroDefinitionId =
      lordChoices[0] ?? availableHeroDefinitionIds[0];
    if (!lordHeroDefinitionId) throw new Error("lord hero pool is empty");
    lordSeat.heroDefinitionId = lordHeroDefinitionId;
  }
  const unavailable = new Set(
    seats.flatMap((seat) =>
      seat.heroDefinitionId ? [seat.heroDefinitionId] : []
    )
  );
  const localHeroChoices = (
    seats[0]!.identity === "lord"
      ? lordChoices
      : availableHeroDefinitionIds
  ).filter((heroId) => !unavailable.has(heroId)).slice(0, 3);
  if (localHeroChoices.length === 0) {
    throw new Error("match setup produced no local hero choices");
  }
  return {
    seed: options.seed,
    playerCount: options.playerCount,
    contentPacks: registry.installedContentPacks(),
    seats,
    availableHeroDefinitionIds,
    localHeroChoices
  };
}

export function createScriptedMatchSetup(
  registry: ContentRegistry,
  options: {
    seed: number;
    localPlayerId?: PlayerId;
    definition: ScriptedMatchDefinition;
    unlockedHeroDefinitionIds?: string[];
  }
): MatchSetup {
  const localPlayerId = options.localPlayerId ?? "player-1";
  if (options.definition.seats.length < 2) {
    throw new Error("scripted match requires at least two seats");
  }
  const completeHeroIds = new Set(
    completeHeroes(registry).map((hero) => hero.id)
  );
  const unlocked = options.unlockedHeroDefinitionIds
    ? new Set(options.unlockedHeroDefinitionIds)
    : null;
  const localHeroChoices = options.definition.localHeroDefinitionIds.filter(
    (heroId) => completeHeroIds.has(heroId) && (!unlocked || unlocked.has(heroId))
  );
  if (localHeroChoices.length === 0) {
    throw new Error("scripted match produced no unlocked local hero choices");
  }
  const fixedHeroIds = options.definition.seats.flatMap((seat) =>
    seat.heroDefinitionId ? [seat.heroDefinitionId] : []
  );
  for (const heroId of [...fixedHeroIds, ...localHeroChoices]) {
    if (!completeHeroIds.has(heroId)) {
      throw new Error(`scripted match references unavailable hero: ${heroId}`);
    }
  }
  const seats = options.definition.seats.map((seat, index): MatchSeat => {
    const value: MatchSeat = {
      id: index === 0 ? localPlayerId : `player-${index + 1}`,
      identity: seat.identity,
      isAI: index !== 0
    };
    if (index !== 0 && seat.heroDefinitionId) {
      value.heroDefinitionId = seat.heroDefinitionId;
    }
    return value;
  });
  return {
    seed: options.seed,
    playerCount: seats.length,
    contentPacks: registry.installedContentPacks(),
    seats,
    availableHeroDefinitionIds: [
      ...new Set([...localHeroChoices, ...fixedHeroIds])
    ],
    localHeroChoices
  };
}

export function finalizeMatchSetup(
  setup: MatchSetup,
  localHeroDefinitionId: string
): Required<Pick<MatchSetup, "contentPacks" | "seats">> {
  if (!setup.localHeroChoices.includes(localHeroDefinitionId)) {
    throw new Error(`hero was not offered: ${localHeroDefinitionId}`);
  }
  const seats = structuredClone(setup.seats);
  seats[0]!.heroDefinitionId = localHeroDefinitionId;
  const used = new Set(
    seats.flatMap((seat) =>
      seat.heroDefinitionId ? [seat.heroDefinitionId] : []
    )
  );
  const remaining = setup.availableHeroDefinitionIds.filter(
    (heroId) => !used.has(heroId)
  );
  for (const seat of seats) {
    if (seat.heroDefinitionId) continue;
    const heroDefinitionId = remaining.shift();
    if (!heroDefinitionId) throw new Error("hero pool was exhausted");
    seat.heroDefinitionId = heroDefinitionId;
  }
  return { contentPacks: structuredClone(setup.contentPacks), seats };
}
