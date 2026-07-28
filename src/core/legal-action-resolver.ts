import type {
  ActiveAbilityRule,
  ContentRegistry,
  LegalActionAbilityRule,
  ViewAsAbilityRule
} from "./registry";
import { equipmentZone } from "./state";
import type {
  CardInstanceId,
  GameState,
  LegalAction,
  PlayerId
} from "./types";

/**
 * Projects contextual ability rules into the complete legal-action set.
 * Consumers (UI and AI) receive the same result and never reimplement rules.
 */
export class LegalActionResolver {
  readonly #catalog: ContentRegistry;

  constructor(catalog: ContentRegistry) {
    this.#catalog = catalog;
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

  #viewAsActions(
    state: GameState,
    ownerId: PlayerId,
    rule: ViewAsAbilityRule
  ): LegalAction[] {
    if (
      rule.outsideOwnTurnOnly &&
      state.currentPlayerId === ownerId
    ) {
      return [];
    }
    const materialIds = rule.materials.zones.flatMap((zone) =>
      state.zones[`zone:${zone}:${ownerId}`] ?? []
    ).filter((cardId) => {
      const card = state.cards[cardId];
      if (!card) return false;
      const suit = this.#catalog.effectiveCardSuit(
        state,
        cardId,
        ownerId
      );
      const color = suit === "diamond" || suit === "heart"
        ? "red"
        : suit === "club" || suit === "spade"
          ? "black"
          : "colorless";
      return (
        (
          rule.materials.color === undefined ||
          rule.materials.color === color
        ) &&
        (
          rule.materials.suit === undefined ||
          rule.materials.suit === suit
        ) &&
        (
          rule.materials.colorByMark === undefined ||
          rule.materials.colorByMark.values[
            String(
              state.players[ownerId]?.marks[
                rule.materials.colorByMark.mark
              ]
            )
          ] === color
        ) &&
        (
          rule.materials.definitionId === undefined ||
          rule.materials.definitionId === card.definitionId
        ) &&
        (
          rule.materials.definitionTag === undefined ||
          this.#catalog.card(card.definitionId).tags?.includes(
            rule.materials.definitionTag
          ) === true
        ) &&
        (
          rule.materials.cardCategories === undefined ||
          rule.materials.cardCategories.includes(
            this.#catalog.card(card.definitionId).category
          )
        ) &&
        (
          rule.materials.equipmentSlots === undefined ||
          (
            this.#catalog.card(card.definitionId).equipment !== undefined &&
            rule.materials.equipmentSlots.includes(
              this.#catalog.card(card.definitionId).equipment!.slot
            )
          )
        )
      );
    });
    const materials = this.#combinations(
      materialIds,
      rule.materials.count
    ).filter((selected) =>
      !rule.materials.sameSuit ||
      new Set(selected.map((cardId) =>
        this.#catalog.effectiveCardSuit(state, cardId, ownerId)
      )).size <= 1
    );
    const actions: LegalAction[] = [];
    const request = state.pendingDecision?.request;
    const definitionIds = rule.definitionIds ??
      (rule.definitionId ? [rule.definitionId] : []);
    for (const definitionId of definitionIds) {
      if (!this.#catalog.hasCard(definitionId)) continue;
      if (
        rule.response &&
        request?.type === "respond-card" &&
        request.playerId === ownerId &&
        request.acceptedDefinitionIds.includes(definitionId)
      ) {
        actions.push(...materials.map((materialCardIds) => ({
          type: "respond-virtual-card" as const,
          playerId: ownerId,
          decisionId: request.id,
          skillId: rule.id,
          definitionId,
          materialCardIds
        })));
      }
      if (
        rule.action &&
        !state.pendingDecision &&
        state.phase === "action" &&
        state.currentPlayerId === ownerId &&
        this.#catalog.card(definitionId).active &&
        this.#catalog.canUseDefinition(state, ownerId, definitionId)
      ) {
        const targetSets = this.#catalog.targetSets(
          state,
          ownerId,
          definitionId
        );
        actions.push(...materials.flatMap((materialCardIds) =>
          targetSets.map((targetIds) => ({
            type: "use-virtual-card" as const,
            playerId: ownerId,
            skillId: rule.id,
            definitionId,
            materialCardIds,
            targetIds
          }))
        ));
      }
    }
    return actions;
  }

  #activeActions(
    state: GameState,
    actorId: PlayerId,
    ownerId: PlayerId,
    rule: ActiveAbilityRule
  ): LegalAction[] {
    const actorHeroId = state.players[actorId]?.heroDefinitionId;
    let actorKingdom: ReturnType<ContentRegistry["hero"]>["kingdom"] | undefined;
    if (rule.grantedToKingdom !== undefined && actorHeroId) {
      try {
        actorKingdom = this.#catalog.hero(actorHeroId).kingdom;
      } catch {
        actorKingdom = undefined;
      }
    }
    if (
      state.pendingDecision ||
      state.phase !== "action" ||
      state.currentPlayerId !== actorId ||
      (
        actorId !== ownerId &&
        (
          rule.grantedToKingdom === undefined ||
          rule.grantedToKingdom !== actorKingdom
        )
      ) ||
      (
        actorId === ownerId &&
        rule.grantedToKingdom !== undefined
      ) ||
      (
        rule.ownerHpAbove !== undefined &&
        state.players[actorId]!.hp <= rule.ownerHpAbove
      ) ||
      (
        rule.ownerMark !== undefined &&
        (state.players[ownerId]?.marks[rule.ownerMark.mark] ?? false) !==
          rule.ownerMark.equals
      ) ||
      (
        rule.maximumUsesPerTurn !== undefined &&
        (state.turnUsage[actorId]?.[rule.id] ?? 0) >=
          rule.maximumUsesPerTurn
      )
    ) {
      return [];
    }
    const materialIds = rule.materials.zones.flatMap((zone) =>
      state.zones[`zone:${zone}:${actorId}`] ?? []
    ).filter((cardId) => {
      const card = state.cards[cardId];
      if (!card) return false;
      const definition = this.#catalog.card(card.definitionId);
      const suit = this.#catalog.effectiveCardSuit(state, cardId, actorId);
      const color = suit === "heart" || suit === "diamond"
        ? "red"
        : "black";
      return (
        (rule.materials.color === undefined ||
          rule.materials.color === color) &&
        (rule.materials.suits === undefined ||
          (suit !== undefined && rule.materials.suits.includes(suit))) &&
        (rule.materials.cardCategories === undefined ||
          rule.materials.cardCategories.includes(definition.category)) &&
        (rule.materials.definitionTags === undefined ||
          rule.materials.definitionTags.some((tag) =>
            definition.tags?.includes(tag)
          )) &&
        (rule.materials.definitionIds === undefined ||
          rule.materials.definitionIds.includes(definition.id)) &&
        (rule.materials.equipmentSlots === undefined ||
          (
            definition.equipment !== undefined &&
            rule.materials.equipmentSlots.includes(definition.equipment.slot)
          ))
      );
    });
    const maximum = rule.materials.maximum === "all"
      ? materialIds.length
      : Math.min(rule.materials.maximum, materialIds.length);
    const materialSets: CardInstanceId[][] = [];
    for (
      let count = rule.materials.minimum;
      count <= maximum;
      count += 1
    ) {
      materialSets.push(...this.#combinations(materialIds, count));
    }
    const targetSets = this.#catalog.targetSetsFromSpec(
      state,
      actorId,
      rule.target,
      {
        distanceBonus: 0,
        ignoreDistance: false,
        maximumTargetsBonus: 0
      }
    );
    return materialSets.flatMap((materialCardIds) =>
      targetSets.filter((targetIds) => {
        if (
          rule.constraints?.includes(
            "material-count-equals-target-hand-difference"
          )
        ) {
          if (targetIds.length !== 2) return false;
          const difference = Math.abs(
            (state.zones[`zone:hand:${targetIds[0]}`]?.length ?? 0) -
            (state.zones[`zone:hand:${targetIds[1]}`]?.length ?? 0)
          );
          if (materialCardIds.length !== difference) return false;
        }
        if (
          rule.constraints?.includes("equipped-weapon-means-distance-one") &&
          materialCardIds.length === 1 &&
          (state.zones[equipmentZone(actorId)] ?? []).includes(
            materialCardIds[0]!
          ) &&
          (
            targetIds.length !== 1 ||
            this.#catalog.distanceBetween(
              state,
              actorId,
              targetIds[0]!
            ) > 1
          )
        ) {
          return false;
        }
        return true;
      }).map((targetIds) => ({
        type: "activate-skill" as const,
        playerId: actorId,
        skillId: rule.id,
        materialCardIds,
        targetIds
      }))
    );
  }

  #applyRestriction(
    state: GameState,
    ownerId: PlayerId,
    actorId: PlayerId,
    actions: LegalAction[],
    rule: LegalActionAbilityRule
  ): LegalAction[] {
    if (rule.type === "restrict-rescue-during-owner-turn") {
      const pending = state.pendingDecision;
      if (
        state.currentPlayerId !== ownerId ||
        pending?.request.type !== "respond-card" ||
        pending.request.responseKind !== "peach" ||
        pending.continuation.type !== "rescue" ||
        actorId === pending.continuation.playerId
      ) {
        return actions;
      }
      return actions.filter((action) => action.type === "pass");
    }
    if (rule.type === "allow-end-turn") {
      if (
        ownerId !== actorId ||
        state.phase !== rule.phase ||
        (state.turnUsage[ownerId]?.[rule.usageKey] ?? 0) !==
          rule.usageEquals ||
        actions.some((action) => action.type === "end-turn")
      ) {
        return actions;
      }
      return [...actions, { type: "end-turn", playerId: ownerId }];
    }
    if (rule.type === "forbid-card-use") {
      if (ownerId !== actorId) return actions;
      if (
        rule.ownerMark !== undefined &&
        (state.players[ownerId]?.marks[rule.ownerMark.mark] ?? false) !==
          rule.ownerMark.equals
      ) {
        return actions;
      }
      return actions.filter((action) => {
        if (
          action.type !== "use-card" &&
          action.type !== "use-virtual-card"
        ) {
          return true;
        }
        const definitionId = action.type === "use-card"
          ? state.cards[action.cardId]?.definitionId
          : action.definitionId;
        if (!definitionId) return true;
        const definition = this.#catalog.card(definitionId);
        return (
          !rule.definitionIds?.includes(definitionId) &&
          !rule.cardTags?.some((tag) => definition.tags?.includes(tag))
        );
      });
    }
    if (
      rule.ownerHandEmpty &&
      (state.zones[`zone:hand:${ownerId}`]?.length ?? 0) > 0
    ) {
      return actions;
    }
    return actions.filter((action) => {
      if (
        action.type !== "use-card" &&
        action.type !== "use-virtual-card"
      ) {
        return true;
      }
      if (!action.targetIds.includes(ownerId)) return true;
      const definitionId = action.type === "use-card"
        ? state.cards[action.cardId]?.definitionId
        : action.definitionId;
      if (!definitionId) return true;
      const tags = this.#catalog.card(definitionId).tags ?? [];
      const suit = action.type === "use-card"
        ? this.#catalog.effectiveCardSuit(
            state,
            action.cardId,
            action.playerId
          )
        : action.materialCardIds.length === 1
          ? this.#catalog.effectiveCardSuit(
              state,
              action.materialCardIds[0]!,
              action.playerId
            )
          : undefined;
      const color = suit === "heart" || suit === "diamond"
        ? "red"
        : suit === "club" || suit === "spade"
          ? "black"
          : undefined;
      return (
        !rule.cardTags.some((tag) => tags.includes(tag)) ||
        (
          rule.cardColor !== undefined &&
          rule.cardColor !== color
        ) ||
        rule.excludedCardTags?.some((tag) => tags.includes(tag)) === true
      );
    });
  }

  resolve(
    state: GameState,
    actorId: PlayerId,
    initialActions: readonly LegalAction[]
  ): LegalAction[] {
    let actions = [...initialActions];
    const actor = state.players[actorId];
    if (actor?.alive) {
      for (const skillId of actor.skillIds) {
        const skill = this.#catalog.skill(skillId);
        for (const rule of skill.abilities ?? []) {
          if (rule.type === "view-as") {
            actions.push(...this.#viewAsActions(state, actorId, rule));
          } else if (rule.type === "active") {
              actions.push(
                ...this.#activeActions(state, actorId, actorId, rule)
              );
          }
        }
      }
      for (const cardId of state.zones[equipmentZone(actorId)] ?? []) {
        const definitionId = state.cards[cardId]?.definitionId;
        if (!definitionId) continue;
        const definition = this.#catalog.card(definitionId);
        for (const rule of definition.abilities ?? []) {
          if (rule.type === "view-as") {
            actions.push(...this.#viewAsActions(state, actorId, rule));
          }
        }
      }
    }
    for (const ownerId of state.turnOrder) {
      const owner = state.players[ownerId];
      if (!owner?.alive) continue;
      for (const skillId of owner.skillIds) {
        const skill = this.#catalog.skill(skillId);
        for (const rule of skill.abilities ?? []) {
          if (
            rule.type === "active" &&
            rule.grantedToKingdom !== undefined
          ) {
            actions.push(
              ...this.#activeActions(state, actorId, ownerId, rule)
            );
          }
          if (
            rule.type === "forbid-targeting-owner" ||
            rule.type === "allow-end-turn" ||
            rule.type === "forbid-card-use" ||
            rule.type === "restrict-rescue-during-owner-turn"
          ) {
            actions = this.#applyRestriction(
              state,
              ownerId,
              actorId,
              actions,
              rule
            );
          }
        }
      }
      for (const cardId of state.zones[equipmentZone(ownerId)] ?? []) {
        const definitionId = state.cards[cardId]?.definitionId;
        if (!definitionId) continue;
        const definition = this.#catalog.card(definitionId);
        for (const rule of definition.abilities ?? []) {
          if (
            rule.type === "forbid-targeting-owner" ||
            rule.type === "allow-end-turn" ||
            rule.type === "forbid-card-use"
          ) {
            actions = this.#applyRestriction(
              state,
              ownerId,
              actorId,
              actions,
              rule
            );
          }
        }
      }
    }
    return [...new Map(actions.map((action) => [
      JSON.stringify(action),
      action
    ])).values()];
  }
}
