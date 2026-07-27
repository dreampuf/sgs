import { compileAbilityProgram } from "./ability-program";
import type {
  CardDefinition,
  ContentRegistry,
  TriggerAbilityRule,
  TriggerCondition,
  TriggerPlayerBinding
} from "./registry";
import { cloneGameState, equipmentZone } from "./state";
import { evaluateRulePredicate } from "./rule-expression";
import type {
  DomainEvent,
  EffectDraft,
  GameState,
  PlayerId
} from "./types";

/**
 * Resolves after-event subscriptions from skills, equipment, and the card that
 * produced the event. Event producers only publish domain facts.
 */
export class EventRuleResolver {
  readonly #catalog: ContentRegistry;

  constructor(catalog: ContentRegistry) {
    this.#catalog = catalog;
  }

  #eventField(event: DomainEvent, field: string): unknown {
    return (event as unknown as Record<string, unknown>)[field];
  }

  #equipmentDefinition(
    state: Readonly<GameState>,
    playerId: PlayerId,
    slot: NonNullable<CardDefinition["equipment"]>["slot"]
  ): CardDefinition | undefined {
    for (const cardId of state.zones[equipmentZone(playerId)] ?? []) {
      const definitionId = state.cards[cardId]?.definitionId;
      if (!definitionId) continue;
      const definition = this.#catalog.card(definitionId);
      if (definition.equipment?.slot === slot) return definition;
    }
    return undefined;
  }

  #conditionMatches(
    state: Readonly<GameState>,
    ownerId: PlayerId,
    event: DomainEvent,
    condition: TriggerCondition
  ): boolean {
    if (condition.type === "event-player-is-owner") {
      return this.#eventField(event, condition.field) === ownerId;
    }
    if (condition.type === "event-player-is-not-owner") {
      const playerId = this.#eventField(event, condition.field);
      return typeof playerId === "string" && playerId !== ownerId;
    }
    if (condition.type === "event-field-equals") {
      return this.#eventField(event, condition.field) === condition.value;
    }
    if (condition.type === "event-zone-is-owner") {
      return this.#eventField(event, condition.field) ===
        `zone:${condition.zone}:${ownerId}`;
    }
    if (condition.type === "event-move-cause-player-is-owner") {
      return event.type === "CardMoved" &&
        event.cause?.type === condition.cause &&
        event.cause.playerId === ownerId;
    }
    if (condition.type === "owner-zone-count") {
      return (
        state.zones[`zone:${condition.zone}:${ownerId}`]?.length ?? 0
      ) === condition.equals;
    }
    if (condition.type === "owner-state") {
      const owner = state.players[ownerId];
      if (!owner) return false;
      if (condition.state === "alive") return owner.alive;
      if (condition.state === "dying") return owner.dying;
      return owner.alive && owner.hp < owner.maxHp;
    }
    if (condition.type === "event-player-state") {
      const value = this.#eventField(event, condition.field);
      if (typeof value !== "string") return false;
      const player = state.players[value];
      if (!player) return false;
      if (condition.state === "alive") return player.alive;
      if (condition.state === "dying") return player.dying;
      return player.alive && player.hp < player.maxHp;
    }
    if (condition.type === "event-player-has-cards") {
      const value = this.#eventField(event, condition.field);
      return typeof value === "string" && condition.zones.some((zone) =>
        (state.zones[`zone:${zone}:${value}`]?.length ?? 0) > 0
      );
    }
    if (condition.type === "event-player-hero-kingdom") {
      const value = this.#eventField(event, condition.field);
      if (typeof value !== "string") return false;
      const heroId = state.players[value]?.heroDefinitionId;
      if (!heroId) return false;
      try {
        return this.#catalog.hero(heroId).kingdom === condition.kingdom;
      } catch {
        return false;
      }
    }
    if (condition.type === "event-player-has-equipment-slot") {
      const value = this.#eventField(event, condition.field);
      return typeof value === "string" &&
        condition.slots.some((slot) =>
          this.#equipmentDefinition(state, value, slot) !== undefined
        );
    }
    const cardId = this.#eventField(event, "cardId");
    if (typeof cardId !== "string") return false;
    const card = state.cards[cardId];
    if (!card || !this.#catalog.hasCard(card.definitionId)) return false;
    const definition = this.#catalog.card(card.definitionId);
    return (
      (
        condition.category === undefined ||
        definition.category === condition.category
      ) &&
      (
        condition.tag === undefined ||
        definition.tags?.includes(condition.tag) === true
      )
    );
  }

  #boundPlayer(
    ownerId: PlayerId,
    event: DomainEvent,
    binding: TriggerPlayerBinding | undefined
  ): PlayerId | undefined {
    if (binding === undefined || binding === "owner") return ownerId;
    const value = this.#eventField(event, binding.eventField);
    return typeof value === "string" ? value : undefined;
  }

  #effectsForRule(
    state: Readonly<GameState>,
    ownerId: PlayerId,
    event: DomainEvent,
    rule: TriggerAbilityRule
  ): EffectDraft[] {
    if (
      rule.eventType !== event.type ||
      rule.when?.some((condition) =>
        !this.#conditionMatches(state, ownerId, event, condition)
      ) ||
      (
        rule.predicate !== undefined &&
        !evaluateRulePredicate(rule.predicate, {
          state,
          ownerId,
          event,
          queries: {
            attackRange: (snapshot, playerId) =>
              this.#catalog.attackRange(snapshot, playerId),
            distanceBetween: (snapshot, sourceId, targetId) =>
              this.#catalog.distanceBetween(snapshot, sourceId, targetId)
          }
        })
      )
    ) {
      return [];
    }
    const sourceId = this.#boundPlayer(ownerId, event, rule.context?.source);
    const eventTargetIds = rule.context?.targetsFromEvent
      ? this.#eventField(event, rule.context.targetsFromEvent)
      : undefined;
    const targetIds = Array.isArray(eventTargetIds) &&
      eventTargetIds.every((value) => typeof value === "string")
      ? [...eventTargetIds] as PlayerId[]
      : (rule.context?.targets ?? ["owner"])
          .map((binding) => this.#boundPlayer(ownerId, event, binding))
          .filter((playerId): playerId is PlayerId =>
            playerId !== undefined
          );
    const eventCardId = this.#eventField(event, "cardId");
    const cardId = rule.context?.card === "event-card" ||
      rule.context?.card === undefined
      ? typeof eventCardId === "string"
        ? eventCardId
        : `system:ability:${rule.eventType}`
      : rule.context.card.literal;
    if (!sourceId) return [];
    return compileAbilityProgram(
      state,
      sourceId,
      cardId,
      targetIds,
      rule.program,
      {
        equipmentSlot: (definitionId) =>
          this.#catalog.card(definitionId).equipment?.slot
      },
      [],
      event
    );
  }

  resolve(state: GameState, event: DomainEvent): EffectDraft[] {
    const effects: EffectDraft[] = [];
    const snapshot = cloneGameState(state);
    for (const ownerId of state.turnOrder) {
      const owner = state.players[ownerId];
      if (!owner?.alive) continue;
      for (const skillId of owner.skillIds) {
        const skill = this.#catalog.skill(skillId);
        for (const rule of skill.abilities ?? []) {
          if (rule.type === "trigger") {
            effects.push(
              ...this.#effectsForRule(snapshot, ownerId, event, rule)
            );
          }
        }
      }
      for (const cardId of state.zones[equipmentZone(ownerId)] ?? []) {
        const definitionId = state.cards[cardId]?.definitionId;
        if (!definitionId) continue;
        const definition = this.#catalog.card(definitionId);
        for (const rule of definition.abilities ?? []) {
          if (rule.type === "trigger") {
            effects.push(
              ...this.#effectsForRule(snapshot, ownerId, event, rule)
            );
          }
        }
      }
    }
    if ("cardId" in event) {
      const card = state.cards[event.cardId];
      const definition = card && this.#catalog.hasCard(card.definitionId)
        ? this.#catalog.card(card.definitionId)
        : undefined;
      if (definition && (definition.selfAbilities?.length ?? 0) > 0) {
        const zoneOwner = event.type === "CardMoved"
          ? [
              "zone:hand:",
              "zone:equipment:",
              "zone:judgment:"
            ].map((prefix) =>
              event.from.startsWith(prefix)
                ? event.from.slice(prefix.length)
                : undefined
            ).find((id) => id !== undefined)
          : undefined;
        const ownerId = zoneOwner ??
          card?.sourcePlayerId ??
          state.currentPlayerId;
        for (const rule of definition.selfAbilities ?? []) {
          if (rule.type === "trigger") {
            effects.push(
              ...this.#effectsForRule(snapshot, ownerId, event, rule)
            );
          }
        }
      }
    }
    return effects;
  }
}
