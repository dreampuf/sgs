import type { ContentRegistry, HeroDefinition } from "./registry";
import { shuffle } from "./rng";
import type { PlayerId } from "./types";

export type Identity =
  | "lord"
  | "loyalist"
  | "rebel"
  | "renegade";

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

const IDENTITY_COUNTS: Record<number, Record<Identity, number>> = {
  2: { lord: 1, loyalist: 0, rebel: 1, renegade: 0 },
  3: { lord: 1, loyalist: 0, rebel: 1, renegade: 1 },
  4: { lord: 1, loyalist: 1, rebel: 1, renegade: 1 },
  5: { lord: 1, loyalist: 1, rebel: 2, renegade: 1 },
  6: { lord: 1, loyalist: 1, rebel: 3, renegade: 1 },
  7: { lord: 1, loyalist: 2, rebel: 3, renegade: 1 },
  8: { lord: 1, loyalist: 2, rebel: 4, renegade: 1 },
  9: { lord: 1, loyalist: 3, rebel: 4, renegade: 1 },
  10: { lord: 1, loyalist: 3, rebel: 5, renegade: 1 }
};

function identities(playerCount: number): Identity[] {
  const counts = IDENTITY_COUNTS[playerCount];
  if (!counts) {
    throw new Error(`identity mode supports 2-10 players: ${playerCount}`);
  }
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
  const requiredHeroes = options.playerCount * 3 + 1;
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
  const availableHeroDefinitionIds = shuffledHeroes.items.slice(
    0,
    requiredHeroes
  );
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
