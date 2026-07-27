import type { ContentRegistry } from "./registry";
import { equipmentZone } from "./state";
import {
  resolveTiming,
  type BeforeEffectTiming,
  type TimingResolution,
  type TimingRuleCandidate
} from "./timing";
import type { GameState } from "./types";

/**
 * Discovers contextual rules from the current board and resolves their
 * priority. ContentRegistry remains the catalog; this service owns runtime
 * rule participation.
 */
export class RuleResolver {
  readonly #catalog: ContentRegistry;

  constructor(catalog: ContentRegistry) {
    this.#catalog = catalog;
  }

  #candidates(
    state: GameState,
    point: BeforeEffectTiming["point"]
  ): TimingRuleCandidate[] {
    const candidates: TimingRuleCandidate[] = [];
    let order = 0;
    for (const ownerId of state.turnOrder) {
      const owner = state.players[ownerId];
      if (!owner?.alive) continue;

      for (const skillId of owner.skillIds) {
        const skill = this.#catalog.skill(skillId);
        for (const [index, rule] of (skill.abilities ?? []).entries()) {
          if (rule.type !== "timing" || rule.timing !== point) continue;
          candidates.push({
            id: `${ownerId}:skill:${skillId}:timing:${index}`,
            ownerId,
            order: order++,
            rule
          });
        }
      }

      for (const cardId of state.zones[equipmentZone(ownerId)] ?? []) {
        const definitionId = state.cards[cardId]?.definitionId;
        if (!definitionId) continue;
        const definition = this.#catalog.card(definitionId);
        for (
          const [index, rule] of (definition.abilities ?? []).entries()
        ) {
          if (rule.type !== "timing" || rule.timing !== point) continue;
          candidates.push({
            id: `${ownerId}:equipment:${cardId}:timing:${index}`,
            ownerId,
            order: order++,
            rule
          });
        }
      }
    }
    return candidates;
  }

  resolve(
    state: GameState,
    timing: BeforeEffectTiming
  ): TimingResolution {
    return resolveTiming(
      state,
      timing,
      this.#candidates(state, timing.point),
      {
        cardHasTag: (cardId, tag) => {
          const definitionId = state.cards[cardId]?.definitionId;
          return definitionId !== undefined &&
            this.#catalog.hasCard(definitionId) &&
            this.#catalog.card(definitionId).tags?.includes(tag) === true;
        },
        effectiveCardSuit: (snapshot, cardId, ownerId) =>
          this.#catalog.effectiveCardSuit(snapshot, cardId, ownerId),
        canTargetCard: (sourceId, cardId, targetId) => {
          const definitionId = state.cards[cardId]?.definitionId;
          return definitionId !== undefined &&
            this.#catalog.hasCard(definitionId) &&
            this.#catalog.targetSets(state, sourceId, definitionId).some(
              (targetIds) =>
                targetIds.length === 1 &&
                targetIds[0] === targetId
            );
        },
        attackRange: (snapshot, playerId) =>
          this.#catalog.attackRange(snapshot, playerId),
        distanceBetween: (snapshot, sourceId, targetId) =>
          this.#catalog.distanceBetween(snapshot, sourceId, targetId)
      }
    );
  }
}
