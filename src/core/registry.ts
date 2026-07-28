import type {
  CardDefinitionId,
  CardInstanceId,
  CardSuit,
  DomainEvent,
  EffectDraft,
  GameState,
  LegalAction,
  PlayerId,
  WorkflowContext,
  WorkflowData,
  WorkflowInput
} from "./types";
import {
  DISCARD_PILE,
  cloneGameState,
  equipmentZone
} from "./state";
import type { CardPrint } from "./state";
import {
  compileAbilityProgram,
  type AbilityProgram,
} from "./ability-program";
import {
  type CardResolutionRule
} from "./card-resolution";
import {
  type BeforeEffectTiming,
  type TimingAbilityRule,
  type TimingResolution
} from "./timing";
import type { RulePredicate } from "./rule-expression";
import { RuleBus } from "./rule-bus";

export interface AbilityExecutionContext {
  state: GameState;
  sourceId: PlayerId;
  cardId: CardInstanceId;
  targetIds: PlayerId[];
}

export interface CardDefinition {
  id: CardDefinitionId;
  name: string;
  category: "basic" | "trick" | "equipment";
  tags?: string[];
  active: boolean;
  usageKey?: string;
  maxUsesPerTurn?: number;
  implementation: "complete" | "partial";
  equipment?: {
    slot: "weapon" | "armor" | "defensive-horse" | "offensive-horse";
    attackRange?: number;
  };
  delayed?: {
    judgment: {
      includedSuits?: CardSuit[];
      excludedSuits?: CardSuit[];
      minimumRank?: number;
      maximumRank?: number;
    };
    onMatch: AbilityProgram;
    onMiss: "discard" | "pass-to-next";
  };
  abilities?: AbilityRule[];
  selfAbilities?: AbilityRule[];
  target: TargetSpec;
  program: AbilityProgram;
}

export type TargetZone = "hand" | "equipment" | "judgment";

export type TargetFilter =
  | { type: "alive" }
  | { type: "wounded" }
  | {
      type: "has-cards";
      zones: TargetZone[];
    }
  | {
      type: "lacks-card-definition";
      zone: TargetZone;
      definitionId: CardDefinitionId;
    }
  | {
      type: "equipped";
      slot: NonNullable<CardDefinition["equipment"]>["slot"];
    }
  | {
      type: "hero-gender";
      gender: HeroDefinition["gender"];
    }
  | {
      type: "hero-kingdom";
      kingdom: HeroDefinition["kingdom"];
    }
  | {
      type: "has-skill";
      skillId: string;
    }
  | {
      type: "hp-greater-than-source";
    }
  | {
      type: "hand-count-at-most";
      count: number;
    }
  | {
      type: "distance-at-most";
      value: number | "attack-range";
      from?: "source" | "previous";
    };

export interface TargetSlotSpec {
  candidates: "self" | "others" | "all";
  excludeSelected?: boolean;
  filters: TargetFilter[];
}

export type TargetSpec =
  | { type: "none" }
  | (TargetSlotSpec & {
      type: "players";
      minimum: number;
      maximum: number;
    })
  | {
      type: "ordered";
      slots: TargetSlotSpec[];
    };

export interface ContentPack {
  id: string;
  version: string;
  name: string;
  requires: string[];
  provenance?: {
    releaseDate: string;
    releaseDatePrecision: "month" | "day";
    evidenceUrls: string[];
    rulesSource?: {
      repository: string;
      revision: string;
      paths: string[];
    };
  };
  assetManifest?: string[];
  prints?: CardPrint[];
  cards: CardDefinition[];
  skills: SkillDefinition[];
  heroes: HeroDefinition[];
  workflows?: WorkflowDefinition[];
  resolutionRules?: CardResolutionRule[];
}

export type WorkflowDecision =
  | {
      type: "respond-card";
      playerId: PlayerId;
      cardId: CardInstanceId;
      acceptedDefinitionIds: CardDefinitionId[];
      passAllowed: true;
      responseKind: "slash" | "jink" | "nullification" | "peach";
      opponentId?: PlayerId;
    }
  | {
      type: "select-cards";
      playerId: PlayerId;
      cardId: CardInstanceId;
      selectableCardIds: CardInstanceId[];
      minimum: number;
      maximum: number;
      reason: string;
    }
  | {
      type: "choose-option";
      playerId: PlayerId;
      cardId: CardInstanceId;
      options: string[];
      reason: string;
    }
  | {
      type: "select-players";
      playerId: PlayerId;
      cardId: CardInstanceId;
      selectablePlayerIds: PlayerId[];
      minimum: number;
      maximum: number;
      reason: string;
    };

export interface WorkflowRunContext {
  state: Readonly<GameState>;
  context: Readonly<WorkflowContext>;
  data: Readonly<WorkflowData>;
  input?: Readonly<WorkflowInput>;
  cardDefinition(id: CardDefinitionId): Readonly<CardDefinition>;
  heroDefinition(id: string): Readonly<HeroDefinition>;
  cardDefinitionIdsWithTag(tag: string): CardDefinitionId[];
  effectiveCardSuit(
    cardId: CardInstanceId,
    ownerId?: PlayerId
  ): CardSuit | undefined;
  canTargetDefinition(
    sourceId: PlayerId,
    definitionId: CardDefinitionId,
    targetId: PlayerId
  ): boolean;
  distanceBetween(sourceId: PlayerId, targetId: PlayerId): number;
  attackRange(playerId: PlayerId): number;
}

export interface WorkflowResult {
  effects?: EffectDraft[];
  decision?: WorkflowDecision;
  resumeData?: WorkflowData;
}

/**
 * A resumable, content-owned effect program.
 *
 * Workflow code may inspect the immutable game snapshot, but it cannot mutate
 * the engine. It can only return generic effects or request a decision. The
 * engine serializes the workflow id/context/data before pausing.
 */
export interface WorkflowDefinition {
  id: string;
  run(context: WorkflowRunContext): WorkflowResult;
}

export interface HeroDefinition {
  id: string;
  name: string;
  maxHp: number;
  kingdom: "wei" | "shu" | "wu" | "qun";
  gender: "male" | "female";
  skillIds: string[];
  implementation: "complete" | "partial";
}

export interface TargetingModifiers {
  distanceBonus: number;
  ignoreDistance: boolean;
  maximumTargetsBonus: number;
}

export interface TargetingAbilityRule {
  type: "modify-targeting";
  cardCategory?: CardDefinition["category"];
  cardTag?: string;
  distanceBonus?: number;
  ignoreDistance?: boolean;
  maximumTargetsBonus?: number;
  ownerHandCountEquals?: number;
  ownerMark?: {
    mark: string;
    equals: number | boolean;
  };
}

export type TriggerCondition =
  | {
      type: "event-player-is-owner";
      field: "playerId" | "sourceId" | "targetId";
    }
  | {
      type: "event-player-is-not-owner";
      field: "playerId" | "sourceId" | "targetId";
    }
  | {
      type: "event-field-equals";
      field: string;
      value: string | number | boolean | null;
    }
  | {
      type: "event-zone-is-owner";
      field: "from" | "to";
      zone: TargetZone;
    }
  | {
      type: "event-move-cause-player-is-owner";
      cause: "judgment";
    }
  | {
      type: "owner-zone-count";
      zone: TargetZone;
      equals: number;
    }
  | {
      type: "owner-state";
      state: "alive" | "wounded" | "dying";
    }
  | {
      type: "event-player-state";
      field: "playerId" | "sourceId" | "targetId";
      state: "alive" | "wounded" | "dying";
    }
  | {
      type: "event-player-has-cards";
      field: "playerId" | "sourceId" | "targetId";
      zones: TargetZone[];
    }
  | {
      type: "event-player-hero-kingdom";
      field: "playerId" | "sourceId" | "targetId";
      kingdom: HeroDefinition["kingdom"];
    }
  | {
      type: "event-player-has-equipment-slot";
      field: "playerId" | "sourceId" | "targetId";
      slots: Array<
        "weapon" | "armor" | "defensive-horse" | "offensive-horse"
      >;
    }
  | {
      type: "event-card";
      category?: CardDefinition["category"];
      tag?: string;
    }
  | {
      type: "event-card-source-is-not-owner";
    };

export type TriggerPlayerBinding =
  | "owner"
  | {
      eventField: "playerId" | "sourceId" | "targetId";
    };

export interface TriggerAbilityRule {
  type: "trigger";
  eventType: DomainEvent["type"];
  when?: TriggerCondition[];
  predicate?: RulePredicate;
  context?: {
    source?: TriggerPlayerBinding;
    targets?: TriggerPlayerBinding[];
    targetsFromEvent?: "targetIds";
    card?: "event-card" | { literal: CardInstanceId };
  };
  program: AbilityProgram;
}

export interface UsageAbilityRule {
  type: "modify-usage";
  definitionId?: CardDefinitionId;
  cardTag?: string;
  unlimited: true;
  ownerMark?: {
    mark: string;
    equals: number | boolean;
  };
}

export interface ViewAsAbilityRule {
  type: "view-as";
  id: string;
  definitionId?: CardDefinitionId;
  definitionIds?: CardDefinitionId[];
  materials: {
    zones: TargetZone[];
    count: number;
    color?: "red" | "black" | "colorless";
    suit?: CardSuit;
    definitionId?: CardDefinitionId;
    definitionTag?: string;
    cardCategories?: CardDefinition["category"][];
    equipmentSlots?: Array<
      NonNullable<CardDefinition["equipment"]>["slot"]
    >;
    sameSuit?: boolean;
    colorByMark?: {
      mark: string;
      values: Record<string, "red" | "black">;
    };
  };
  action?: boolean;
  response?: boolean;
  outsideOwnTurnOnly?: boolean;
}

export interface ActiveAbilityRule {
  type: "active";
  id: string;
  materials: {
    zones: TargetZone[];
    minimum: number;
    maximum: number | "all";
    color?: "red" | "black";
    suits?: CardSuit[];
    cardCategories?: CardDefinition["category"][];
    definitionTags?: string[];
    definitionIds?: CardDefinitionId[];
    equipmentSlots?: Array<
      NonNullable<CardDefinition["equipment"]>["slot"]
    >;
  };
  target: TargetSpec;
  maximumUsesPerTurn?: number;
  ownerHpAbove?: number;
  ownerMark?: {
    mark: string;
    equals: number | boolean;
  };
  grantedToKingdom?: HeroDefinition["kingdom"];
  constraints?: Array<
    | "material-count-equals-target-hand-difference"
    | "equipped-weapon-means-distance-one"
  >;
  program: AbilityProgram;
}

export interface ResponseCountAbilityRule {
  type: "modify-response-count";
  responseKind: "slash" | "jink" | "peach";
  sourceCardTag?: string;
  sourceIsOwner?: boolean;
  opponentIsOwner?: boolean;
  sourceGender?: HeroDefinition["gender"];
  opponentGender?: HeroDefinition["gender"];
  count: number;
}

export interface CardPropertyAbilityRule {
  type: "modify-card-property";
  property: "suit";
  from: CardSuit;
  to: CardSuit;
}

export type LegalActionAbilityRule =
  | {
      type: "forbid-targeting-owner";
      cardTags: string[];
      ownerHandEmpty?: boolean;
      cardColor?: "red" | "black";
      excludedCardTags?: string[];
    }
  | {
      type: "allow-end-turn";
      phase: "discard";
      usageKey: string;
      usageEquals: number;
    }
  | {
      type: "forbid-card-use";
      definitionIds?: CardDefinitionId[];
      cardTags?: string[];
      ownerMark?: {
        mark: string;
        equals: number | boolean;
      };
    }
  | {
      type: "restrict-rescue-during-owner-turn";
    };

export interface HandLimitAbilityRule {
  type: "modify-hand-limit";
  bonusPerOtherKingdom?: HeroDefinition["kingdom"];
}

export type AbilityRule =
  | TargetingAbilityRule
  | TimingAbilityRule
  | TriggerAbilityRule
  | UsageAbilityRule
  | ViewAsAbilityRule
  | ActiveAbilityRule
  | ResponseCountAbilityRule
  | CardPropertyAbilityRule
  | HandLimitAbilityRule
  | LegalActionAbilityRule;

export interface SkillDefinition {
  id: string;
  name: string;
  implementation?: "complete" | "partial";
  lordOnly?: boolean;
  abilities?: AbilityRule[];
}

export class ContentRegistry {
  readonly #cards = new Map<CardDefinitionId, CardDefinition>();
  readonly #skills = new Map<string, SkillDefinition>();
  readonly #heroes = new Map<string, HeroDefinition>();
  readonly #workflows = new Map<string, WorkflowDefinition>();
  readonly #packs = new Map<string, ContentPack>();
  readonly #ruleBus: RuleBus;

  constructor() {
    this.#ruleBus = new RuleBus(this);
  }

  registerCard(definition: CardDefinition): void {
    if (this.#cards.has(definition.id)) {
      throw new Error(`duplicate card definition: ${definition.id}`);
    }
    this.#cards.set(definition.id, definition);
  }

  card(id: CardDefinitionId): CardDefinition {
    const definition = this.#cards.get(id);
    if (!definition) {
      throw new Error(`unknown card definition: ${id}`);
    }
    return definition;
  }

  hasCard(id: CardDefinitionId): boolean {
    return this.#cards.has(id);
  }

  cardDefinitionIdsWithTag(tag: string): CardDefinitionId[] {
    return [...this.#cards.values()]
      .filter((definition) => definition.tags?.includes(tag))
      .map((definition) => definition.id);
  }

  #sourceAbilityRules(
    state: GameState,
    sourceId: PlayerId
  ): AbilityRule[] {
    const rules: AbilityRule[] = [];
    for (const skillId of state.players[sourceId]?.skillIds ?? []) {
      rules.push(...(this.skill(skillId).abilities ?? []));
    }
    for (const cardId of state.zones[equipmentZone(sourceId)] ?? []) {
      const definitionId = state.cards[cardId]?.definitionId;
      if (definitionId) {
        rules.push(...(this.card(definitionId).abilities ?? []));
      }
    }
    return rules;
  }

  canUseDefinition(
    state: GameState,
    sourceId: PlayerId,
    definitionId: CardDefinitionId
  ): boolean {
    const definition = this.card(definitionId);
    const unlimited = this.#sourceAbilityRules(state, sourceId).some((rule) =>
      rule.type === "modify-usage" &&
      (
        rule.definitionId === undefined ||
        rule.definitionId === definitionId
      ) &&
      (
        rule.cardTag === undefined ||
        definition.tags?.includes(rule.cardTag)
      ) &&
      (
        rule.ownerMark === undefined ||
        (state.players[sourceId]?.marks[rule.ownerMark.mark] ?? false) ===
          rule.ownerMark.equals
      ) &&
      rule.unlimited
    );
    if (unlimited || definition.maxUsesPerTurn === undefined) return true;
    const usageKey = definition.usageKey ?? definition.id;
    return (state.turnUsage[sourceId]?.[usageKey] ?? 0) <
      definition.maxUsesPerTurn;
  }

  responseCount(
    state: GameState,
    sourceId: PlayerId,
    opponentId: PlayerId | undefined,
    cardId: CardInstanceId,
    responseKind: "slash" | "jink" | "peach"
  ): number {
    const card = state.cards[cardId];
    const cardDefinition = card && this.hasCard(card.definitionId)
      ? this.card(card.definitionId)
      : undefined;
    let count = 1;
    for (const ownerId of state.turnOrder) {
      if (!state.players[ownerId]?.alive) continue;
      const rules = [
        ...(state.players[ownerId]?.skillIds ?? []).flatMap(
          (skillId) => this.skill(skillId).abilities ?? []
        ),
        ...(state.zones[equipmentZone(ownerId)] ?? []).flatMap((equippedId) => {
          const definitionId = state.cards[equippedId]?.definitionId;
          return definitionId
            ? this.card(definitionId).abilities ?? []
            : [];
        })
      ];
      for (const rule of rules) {
        if (
          rule.type !== "modify-response-count" ||
          rule.responseKind !== responseKind ||
          (rule.sourceIsOwner && sourceId !== ownerId) ||
          (rule.opponentIsOwner && opponentId !== ownerId) ||
          (
            rule.sourceGender !== undefined &&
            this.#heroGender(state, sourceId) !== rule.sourceGender
          ) ||
          (
            rule.opponentGender !== undefined &&
            (
              opponentId === undefined ||
              this.#heroGender(state, opponentId) !== rule.opponentGender
            )
          ) ||
          (
            rule.sourceCardTag !== undefined &&
            !cardDefinition?.tags?.includes(rule.sourceCardTag)
          )
        ) {
          continue;
        }
        count = Math.max(count, rule.count);
      }
    }
    return count;
  }

  #heroGender(
    state: Readonly<GameState>,
    playerId: PlayerId
  ): HeroDefinition["gender"] | undefined {
    const heroId = state.players[playerId]?.heroDefinitionId;
    if (!heroId) return undefined;
    try {
      return this.hero(heroId).gender;
    } catch {
      return undefined;
    }
  }

  handLimit(state: Readonly<GameState>, playerId: PlayerId): number {
    const player = state.players[playerId];
    if (!player) return 0;
    let limit = Math.max(0, player.hp);
    for (const skillId of player.skillIds) {
      for (const rule of this.skill(skillId).abilities ?? []) {
        if (rule.type !== "modify-hand-limit") continue;
        if (rule.bonusPerOtherKingdom) {
          limit += state.turnOrder.filter((otherId) => {
            if (otherId === playerId || !state.players[otherId]?.alive) {
              return false;
            }
            const heroId = state.players[otherId]?.heroDefinitionId;
            if (!heroId) return false;
            try {
              return this.hero(heroId).kingdom === rule.bonusPerOtherKingdom;
            } catch {
              return false;
            }
          }).length * 2;
        }
      }
    }
    return limit;
  }

  #equipmentDefinition(
    state: GameState,
    playerId: PlayerId,
    slot: NonNullable<CardDefinition["equipment"]>["slot"]
  ): CardDefinition | undefined {
    for (const cardId of state.zones[equipmentZone(playerId)] ?? []) {
      const definitionId = state.cards[cardId]?.definitionId;
      if (!definitionId) continue;
      const definition = this.card(definitionId);
      if (definition.equipment?.slot === slot) return definition;
    }
    return undefined;
  }

  #seatDistance(
    state: GameState,
    sourceId: PlayerId,
    targetId: PlayerId,
    modifiers: TargetingModifiers
  ): number {
    if (modifiers.ignoreDistance) return 1;
    const alive = state.turnOrder.filter((id) => state.players[id]?.alive);
    const sourceIndex = alive.indexOf(sourceId);
    const targetIndex = alive.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return Number.POSITIVE_INFINITY;
    }
    const clockwise =
      (targetIndex - sourceIndex + alive.length) % alive.length;
    const base = Math.min(clockwise, alive.length - clockwise);
    const offensive = this.#equipmentDefinition(
      state,
      sourceId,
      "offensive-horse"
    ) ? 1 : 0;
    const defensive = this.#equipmentDefinition(
      state,
      targetId,
      "defensive-horse"
    ) ? 1 : 0;
    return Math.max(
      1,
      base - offensive + defensive - modifiers.distanceBonus
    );
  }

  attackRange(
    state: Readonly<GameState>,
    playerId: PlayerId
  ): number {
    return this.#equipmentDefinition(
      state as GameState,
      playerId,
      "weapon"
    )?.equipment?.attackRange ?? 1;
  }

  effectiveCardSuit(
    state: Readonly<GameState>,
    cardId: CardInstanceId,
    explicitOwnerId?: PlayerId
  ): CardSuit | undefined {
    const card = state.cards[cardId];
    let suit = card?.suit;
    if (!card || suit === undefined) return suit;
    const zoneOwnerId = Object.entries(state.zones).find(
      ([zoneId, cardIds]) =>
        cardIds.includes(cardId) &&
        (
          zoneId.startsWith("zone:hand:") ||
          zoneId.startsWith("zone:equipment:") ||
          zoneId.startsWith("zone:judgment:")
        )
    )?.[0].split(":").at(-1);
    const ownerId =
      explicitOwnerId ?? card.sourcePlayerId ?? zoneOwnerId;
    if (!ownerId) return suit;
    for (const skillId of state.players[ownerId]?.skillIds ?? []) {
      const skill = this.skill(skillId);
      for (const rule of skill.abilities ?? []) {
        if (
          rule.type === "modify-card-property" &&
          rule.property === "suit" &&
          rule.from === suit
        ) {
          suit = rule.to;
        }
      }
    }
    return suit;
  }

  distanceBetween(
    state: Readonly<GameState>,
    sourceId: PlayerId,
    targetId: PlayerId
  ): number {
    let distanceBonus = 0;
    let ignoreDistance = false;
    const source = state.players[sourceId];
    for (const skillId of source?.skillIds ?? []) {
      const skill = this.skill(skillId);
      for (const rule of skill.abilities ?? []) {
        if (
          rule.type !== "modify-targeting" ||
          rule.cardCategory !== undefined ||
          rule.cardTag !== undefined
        ) {
          continue;
        }
        distanceBonus += rule.distanceBonus ?? 0;
        ignoreDistance ||= rule.ignoreDistance ?? false;
      }
    }
    return this.#seatDistance(
      state as GameState,
      sourceId,
      targetId,
      {
        distanceBonus,
        ignoreDistance,
        maximumTargetsBonus: 0
      }
    );
  }

  #combinations<T>(items: readonly T[], count: number): T[][] {
    if (count === 0) return [[]];
    if (count > items.length) return [];
    const result: T[][] = [];
    const visit = (start: number, selected: T[]): void => {
      if (selected.length === count) {
        result.push([...selected]);
        return;
      }
      for (let index = start; index < items.length; index += 1) {
        selected.push(items[index]!);
        visit(index + 1, selected);
        selected.pop();
      }
    };
    visit(0, []);
    return result;
  }

  targetSetsFromSpec(
    state: GameState,
    sourceId: PlayerId,
    spec: TargetSpec,
    modifiers: TargetingModifiers
  ): PlayerId[][] {
    if (spec.type === "none") return [[]];

    const candidatesFor = (
      slot: TargetSlotSpec,
      selected: PlayerId[]
    ): PlayerId[] => state.turnOrder.filter((playerId) => {
      if (slot.candidates === "self" && playerId !== sourceId) return false;
      if (slot.candidates === "others" && playerId === sourceId) return false;
      if (slot.excludeSelected && selected.includes(playerId)) return false;
      return slot.filters.every((filter) => {
        const player = state.players[playerId];
        if (filter.type === "alive") return player?.alive === true;
        if (filter.type === "wounded") {
          return player !== undefined && player.hp < player.maxHp;
        }
        if (filter.type === "has-cards") {
          return filter.zones.some((zone) =>
            (state.zones[`zone:${zone}:${playerId}`]?.length ?? 0) > 0
          );
        }
        if (filter.type === "lacks-card-definition") {
          return !(state.zones[`zone:${filter.zone}:${playerId}`] ?? [])
            .some(
              (cardId) =>
                state.cards[cardId]?.definitionId === filter.definitionId
            );
        }
        if (filter.type === "equipped") {
          return this.#equipmentDefinition(
            state,
            playerId,
            filter.slot
          ) !== undefined;
        }
        if (filter.type === "hero-gender") {
          const heroId = player?.heroDefinitionId;
          if (!heroId) return false;
          try {
            return this.hero(heroId).gender === filter.gender;
          } catch {
            return false;
          }
        }
        if (filter.type === "hero-kingdom") {
          const heroId = player?.heroDefinitionId;
          if (!heroId) return false;
          try {
            return this.hero(heroId).kingdom === filter.kingdom;
          } catch {
            return false;
          }
        }
        if (filter.type === "has-skill") {
          return player?.skillIds.includes(filter.skillId) === true;
        }
        if (filter.type === "hp-greater-than-source") {
          const source = state.players[sourceId];
          return player !== undefined &&
            source !== undefined &&
            player.hp > source.hp;
        }
        if (filter.type === "hand-count-at-most") {
          return (state.zones[`zone:hand:${playerId}`]?.length ?? 0) <=
            filter.count;
        }
        const fromId = filter.from === "previous"
          ? selected[selected.length - 1]
          : sourceId;
        if (!fromId) return false;
        const maximum = filter.value === "attack-range"
          ? this.#equipmentDefinition(state, fromId, "weapon")
            ?.equipment?.attackRange ?? 1
          : filter.value;
        return this.#seatDistance(
          state,
          fromId,
          playerId,
          fromId === sourceId
            ? modifiers
            : {
                distanceBonus: 0,
                ignoreDistance: false,
                maximumTargetsBonus: 0
              }
        ) <= maximum;
      });
    });

    if (spec.type === "ordered") {
      let targetSets: PlayerId[][] = [[]];
      for (const slot of spec.slots) {
        targetSets = targetSets.flatMap((selected) =>
          candidatesFor(slot, selected).map((playerId) => [
            ...selected,
            playerId
          ])
        );
      }
      return targetSets;
    }

    const candidates = candidatesFor(spec, []);
    const targetSets: PlayerId[][] = [];
    for (
      let count = spec.minimum;
      count <= spec.maximum + modifiers.maximumTargetsBonus;
      count += 1
    ) {
      targetSets.push(...this.#combinations(candidates, count));
    }
    return targetSets;
  }

  targetSets(
    state: GameState,
    sourceId: PlayerId,
    definitionId: CardDefinitionId
  ): PlayerId[][] {
    const snapshot = cloneGameState(state);
    const definition = this.card(definitionId);
    let modifiers: TargetingModifiers = {
      distanceBonus: 0,
      ignoreDistance: false,
      maximumTargetsBonus: 0
    };
    const source = state.players[sourceId];
    for (const skillId of source?.skillIds ?? []) {
      const skill = this.skill(skillId);
      for (const rule of skill.abilities ?? []) {
        if (
          rule.type !== "modify-targeting" ||
          (
            rule.cardCategory !== undefined &&
            rule.cardCategory !== definition.category
          ) ||
          (
            rule.cardTag !== undefined &&
            !definition.tags?.includes(rule.cardTag)
          ) ||
          (
            rule.ownerHandCountEquals !== undefined &&
            (state.zones[`zone:hand:${sourceId}`]?.length ?? 0) !==
              rule.ownerHandCountEquals
          ) ||
          (
            rule.ownerMark !== undefined &&
            (source?.marks[rule.ownerMark.mark] ?? false) !==
              rule.ownerMark.equals
          )
        ) {
          continue;
        }
        modifiers = {
          distanceBonus:
            modifiers.distanceBonus + (rule.distanceBonus ?? 0),
          ignoreDistance:
            modifiers.ignoreDistance || (rule.ignoreDistance ?? false),
          maximumTargetsBonus:
            modifiers.maximumTargetsBonus +
            (rule.maximumTargetsBonus ?? 0)
        };
      }
    }
    for (const cardId of state.zones[equipmentZone(sourceId)] ?? []) {
      const equippedDefinitionId = state.cards[cardId]?.definitionId;
      if (!equippedDefinitionId) continue;
      const equipped = this.card(equippedDefinitionId);
      for (const rule of equipped.abilities ?? []) {
        if (
          rule.type !== "modify-targeting" ||
          (
            rule.cardCategory !== undefined &&
            rule.cardCategory !== definition.category
          ) ||
          (
            rule.cardTag !== undefined &&
            !definition.tags?.includes(rule.cardTag)
          ) ||
          (
            rule.ownerHandCountEquals !== undefined &&
            (state.zones[`zone:hand:${sourceId}`]?.length ?? 0) !==
              rule.ownerHandCountEquals
          )
        ) {
          continue;
        }
        modifiers = {
          distanceBonus:
            modifiers.distanceBonus + (rule.distanceBonus ?? 0),
          ignoreDistance:
            modifiers.ignoreDistance || (rule.ignoreDistance ?? false),
          maximumTargetsBonus:
            modifiers.maximumTargetsBonus +
            (rule.maximumTargetsBonus ?? 0)
        };
      }
    }
    return this.targetSetsFromSpec(
      snapshot,
      sourceId,
      definition.target,
      modifiers
    );
  }

  #abilityQueries() {
    return {
      equipmentSlot: (definitionId: string) =>
        this.card(definitionId).equipment?.slot
    };
  }

  cardEffects(context: AbilityExecutionContext): EffectDraft[] {
    const definitionId = context.state.cards[context.cardId]?.definitionId;
    if (!definitionId) {
      throw new Error(`unknown card instance: ${context.cardId}`);
    }
    const definition = this.card(definitionId);
    const snapshot = cloneGameState(context.state);
    const effects = compileAbilityProgram(
      snapshot,
      context.sourceId,
      context.cardId,
      context.targetIds,
      definition.program,
      this.#abilityQueries(),
      [],
      undefined,
      true
    );
    return this.#ruleBus.publish("card-declared", {
      state: snapshot,
      context,
      definition,
      effects
    });
  }

  targetEffects(
    context: AbilityExecutionContext,
    target: Extract<EffectDraft, { type: "resolve-target" }>
  ): EffectDraft[] {
    const definitionId = context.state.cards[context.cardId]?.definitionId;
    if (!definitionId) {
      throw new Error(`unknown card instance: ${context.cardId}`);
    }
    const definition = this.card(definitionId);
    return this.#ruleBus.publish("target-confirmed", {
      state: cloneGameState(context.state),
      context,
      definition,
      target
    });
  }

  beginDelayedResolution(
    state: GameState,
    playerId: PlayerId,
    cardId: CardInstanceId
  ): EffectDraft[] {
    const card = state.cards[cardId];
    if (!card) throw new Error(`unknown card instance: ${cardId}`);
    const definition = this.card(card.definitionId);
    if (!definition.delayed) {
      throw new Error(`card is not delayed: ${definition.id}`);
    }
    const sourceId = card.sourcePlayerId ?? playerId;
    const context: AbilityExecutionContext = {
      state,
      sourceId,
      cardId,
      targetIds: [playerId]
    };
    return this.#ruleBus.publish("delayed-card-resolving", {
      state: cloneGameState(state),
      context,
      definition,
      effects: [{
        type: "perform-judgment",
        playerId,
        delayedCardId: cardId
      }],
      cancelledEffects: [{
        type: "move-card",
        cardId,
        toZoneId: DISCARD_PILE,
        reason: "resolve"
      }]
    });
  }

  judgmentMatches(
    definitionId: CardDefinitionId,
    suit: CardSuit,
    rank: number
  ): boolean {
    const judgment = this.card(definitionId).delayed?.judgment;
    if (!judgment) {
      throw new Error(`card has no delayed judgment: ${definitionId}`);
    }
    return (
      (
        judgment.includedSuits === undefined ||
        judgment.includedSuits.includes(suit)
      ) &&
      !judgment.excludedSuits?.includes(suit) &&
      (
        judgment.minimumRank === undefined ||
        rank >= judgment.minimumRank
      ) &&
      (
        judgment.maximumRank === undefined ||
        rank <= judgment.maximumRank
      )
    );
  }

  delayedEffects(context: AbilityExecutionContext): EffectDraft[] {
    const definitionId = context.state.cards[context.cardId]?.definitionId;
    if (!definitionId) {
      throw new Error(`unknown delayed card instance: ${context.cardId}`);
    }
    const program = this.card(definitionId).delayed?.onMatch;
    if (!program) {
      throw new Error(`card has no delayed outcome: ${definitionId}`);
    }
    return compileAbilityProgram(
      cloneGameState(context.state),
      context.sourceId,
      context.cardId,
      context.targetIds,
      program,
      this.#abilityQueries()
    );
  }

  skillActivationEffects(
    context: AbilityExecutionContext & {
      skillId: string;
      materialCardIds: CardInstanceId[];
    }
  ): EffectDraft[] {
    const skill = this.skill(context.skillId);
    const rule = (skill.abilities ?? []).find(
      (candidate): candidate is ActiveAbilityRule =>
        candidate.type === "active" &&
        candidate.id === context.skillId
    );
    if (!rule) {
      throw new Error(`skill is not declaratively active: ${context.skillId}`);
    }
    return compileAbilityProgram(
      cloneGameState(context.state),
      context.sourceId,
      context.cardId,
      context.targetIds,
      rule.program,
      this.#abilityQueries(),
      context.materialCardIds
    );
  }

  registerSkill(definition: SkillDefinition): void {
    if (this.#skills.has(definition.id)) {
      throw new Error(`duplicate skill definition: ${definition.id}`);
    }
    this.#skills.set(definition.id, definition);
  }

  skill(id: string): SkillDefinition {
    const definition = this.#skills.get(id);
    if (!definition) throw new Error(`unknown skill definition: ${id}`);
    return definition;
  }

  registerHero(definition: HeroDefinition): void {
    if (this.#heroes.has(definition.id)) {
      throw new Error(`duplicate hero definition: ${definition.id}`);
    }
    for (const skillId of definition.skillIds) {
      if (!this.#skills.has(skillId)) {
        throw new Error(`hero ${definition.id} requires unknown skill: ${skillId}`);
      }
    }
    this.#heroes.set(definition.id, definition);
  }

  hero(id: string): HeroDefinition {
    const definition = this.#heroes.get(id);
    if (!definition) throw new Error(`unknown hero definition: ${id}`);
    return definition;
  }

  heroes(): HeroDefinition[] {
    return [...this.#heroes.values()].map((hero) => structuredClone(hero));
  }

  registerWorkflow(definition: WorkflowDefinition): void {
    if (this.#workflows.has(definition.id)) {
      throw new Error(`duplicate workflow definition: ${definition.id}`);
    }
    this.#workflows.set(definition.id, definition);
  }

  workflow(id: string): WorkflowDefinition {
    const definition = this.#workflows.get(id);
    if (!definition) throw new Error(`unknown workflow definition: ${id}`);
    return definition;
  }

  registerPack(pack: ContentPack): void {
    const qualifiedId = `${pack.id}@${pack.version}`;
    if (this.#packs.has(qualifiedId)) {
      throw new Error(`duplicate content pack: ${qualifiedId}`);
    }
    for (const required of pack.requires) {
      if (!this.#packs.has(required)) {
        throw new Error(`missing content pack dependency: ${required}`);
      }
    }
    const incomingIds = new Set<CardDefinitionId>();
    for (const definition of pack.cards) {
      if (incomingIds.has(definition.id) || this.#cards.has(definition.id)) {
        throw new Error(`duplicate card definition: ${definition.id}`);
      }
      incomingIds.add(definition.id);
    }
    for (const print of pack.prints ?? []) {
      if (
        !incomingIds.has(print.definitionId) &&
        !this.#cards.has(print.definitionId)
      ) {
        throw new Error(
          `pack ${qualifiedId} prints unknown card: ${print.definitionId}`
        );
      }
    }
    const incomingSkillIds = new Set<string>();
    for (const definition of pack.skills) {
      if (
        incomingSkillIds.has(definition.id) ||
        this.#skills.has(definition.id)
      ) {
        throw new Error(`duplicate skill definition: ${definition.id}`);
      }
      incomingSkillIds.add(definition.id);
    }
    const incomingHeroIds = new Set<string>();
    for (const definition of pack.heroes) {
      if (
        incomingHeroIds.has(definition.id) ||
        this.#heroes.has(definition.id)
      ) {
        throw new Error(`duplicate hero definition: ${definition.id}`);
      }
      for (const skillId of definition.skillIds) {
        if (
          !incomingSkillIds.has(skillId) &&
          !this.#skills.has(skillId)
        ) {
          throw new Error(
            `hero ${definition.id} requires unknown skill: ${skillId}`
          );
        }
      }
      incomingHeroIds.add(definition.id);
    }
    const incomingWorkflowIds = new Set<string>();
    for (const definition of pack.workflows ?? []) {
      if (
        incomingWorkflowIds.has(definition.id) ||
        this.#workflows.has(definition.id)
      ) {
        throw new Error(`duplicate workflow definition: ${definition.id}`);
      }
      incomingWorkflowIds.add(definition.id);
    }
    const incomingResolutionRuleIds = new Set<string>();
    for (const definition of pack.resolutionRules ?? []) {
      if (
        incomingResolutionRuleIds.has(definition.id) ||
        this.#ruleBus.hasCardResolutionRule(definition.id)
      ) {
        throw new Error(`duplicate card resolution rule: ${definition.id}`);
      }
      incomingResolutionRuleIds.add(definition.id);
    }
    for (const definition of pack.cards) this.registerCard(definition);
    for (const definition of pack.skills) this.registerSkill(definition);
    for (const definition of pack.heroes) this.registerHero(definition);
    for (const definition of pack.workflows ?? []) {
      this.registerWorkflow(definition);
    }
    for (const definition of pack.resolutionRules ?? []) {
      this.#ruleBus.registerCardResolutionRule(definition);
    }
    this.#packs.set(qualifiedId, pack);
  }

  triggeredEffects(state: GameState, event: DomainEvent): EffectDraft[] {
    return this.#ruleBus.publish("after-event", { state, event });
  }

  modifyLegalActions(
    state: GameState,
    actorId: PlayerId,
    initialActions: LegalAction[]
  ): LegalAction[] {
    return this.#ruleBus.publish("legal-actions", {
      state,
      actorId,
      actions: initialActions
    });
  }

  resolveTiming(
    state: GameState,
    timing: BeforeEffectTiming
  ): TimingResolution {
    return this.#ruleBus.publish("before-effect", { state, timing });
  }

  packs(): Array<Pick<ContentPack, "id" | "version" | "name" | "requires">> {
    return [...this.#packs.values()].map(({ id, version, name, requires }) => ({
      id,
      version,
      name,
      requires: [...requires]
    }));
  }

  installedContentPacks(): GameState["contentPacks"] {
    return [...this.#packs.values()].map((pack) => ({
      id: pack.id,
      version: pack.version,
      ...(pack.provenance?.rulesSource?.revision
        ? { sourceRevision: pack.provenance.rulesSource.revision }
        : {}),
      assetManifest: [...(pack.assetManifest ?? [])]
    }));
  }

  cardPrints(): CardPrint[] {
    return [...this.#packs.values()].flatMap((pack) =>
      (pack.prints ?? []).map((print) => structuredClone(print))
    );
  }
}
