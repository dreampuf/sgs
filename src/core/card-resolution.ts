import type {
  CardDefinition,
  AbilityExecutionContext
} from "./registry";
import type {
  EffectDraft,
  GameState,
  ResolveTargetEffectDraft
} from "./types";

export interface CardResolutionMatch {
  category?: CardDefinition["category"];
  definitionIds?: string[];
  tags?: string[];
}

export type CardResolutionRule =
  | {
      id: string;
      priority?: number;
      match: CardResolutionMatch;
      scope: "each-target";
      operation: {
        type: "require-response";
        acceptedTags: string[];
        responseKind: "slash" | "jink" | "peach";
        acceptedOutcome:
          | { type: "prevent" }
          | {
              type: "cancel";
              reason: "jink";
            };
      };
    }
  | {
      id: string;
      priority?: number;
      match: CardResolutionMatch;
      scope: "target-or-card";
      operation: {
        type: "allow-nullification";
      };
    };

function matches(
  definition: CardDefinition,
  rule: CardResolutionRule
): boolean {
  const match = rule.match;
  return (
    (match.category === undefined || match.category === definition.category) &&
    (
      match.definitionIds === undefined ||
      match.definitionIds.includes(definition.id)
    ) &&
    (
      match.tags === undefined ||
      match.tags.every((tag) => definition.tags?.includes(tag) === true)
    )
  );
}

function isTargetScope(
  effect: EffectDraft
): effect is ResolveTargetEffectDraft {
  return effect.type === "resolve-target" && "effects" in effect;
}

export function composeTargetResolution(
  state: Readonly<GameState>,
  context: AbilityExecutionContext,
  definition: CardDefinition,
  target: ResolveTargetEffectDraft,
  allRules: readonly CardResolutionRule[]
): EffectDraft[] {
  const rules = allRules
    .filter(
      (rule) =>
        matches(definition, rule) &&
        (
          rule.scope === "each-target" ||
          (
            rule.scope === "target-or-card" &&
            definition.delayed === undefined
          )
        )
    )
    .sort(
      (left, right) =>
        (left.priority ?? 0) - (right.priority ?? 0) ||
        left.id.localeCompare(right.id)
    );
  let current = target.effects.map((effect) => structuredClone(effect));
  for (const rule of rules) {
    if (rule.scope === "each-target") {
      current = [{
        type: "request-response",
        sourceId: context.sourceId,
        cardId: context.cardId,
        responderIds: [target.targetId],
        acceptedTags: [...rule.operation.acceptedTags],
        responseKind: rule.operation.responseKind,
        onAccepted: rule.operation.acceptedOutcome.type === "cancel"
          ? [{
              type: "cancel",
              sourceId: context.sourceId,
              cardId: context.cardId,
              targetId: target.targetId,
              reason: rule.operation.acceptedOutcome.reason
            }]
          : [],
        onAllPassed: current
      }];
      continue;
    }
    current = [{
      type: "negatable",
      sourceId: context.sourceId,
      cardId: context.cardId,
      responderIds: state.turnOrder.filter(
        (playerId) => state.players[playerId]?.alive
      ),
      negated: false,
      onResolved: current,
      ...(target.onCancelled
        ? {
            onNegated: target.onCancelled.map((effect) =>
              structuredClone(effect)
            )
          }
        : {})
    }];
  }
  return current;
}

function isZeroTargetAlternative(
  definition: CardDefinition,
  targetIds: readonly string[]
): boolean {
  return (
    targetIds.length === 0 &&
    definition.target.type === "players" &&
    definition.target.minimum === 0
  );
}

/**
 * Composes contextual rules around a card's intrinsic effect program.
 *
 * Card definitions produce only their own target scopes and primitive effects.
 * Response and counter windows are supplied by rules owned by the content pack,
 * so a card never calls a responder, equipment, skill, or UI context directly.
 */
export function composeCardResolution(
  state: Readonly<GameState>,
  context: AbilityExecutionContext,
  definition: CardDefinition,
  baseEffects: readonly EffectDraft[],
  allRules: readonly CardResolutionRule[]
): EffectDraft[] {
  const rules = allRules
    .filter(
      (rule) =>
        matches(definition, rule) &&
        !(
          definition.delayed !== undefined &&
          rule.operation.type === "allow-nullification"
        )
    )
    .sort(
      (left, right) =>
        (left.priority ?? 0) - (right.priority ?? 0) ||
        left.id.localeCompare(right.id)
    );
  if (rules.length === 0) {
    return baseEffects.map((effect) => structuredClone(effect));
  }

  const hasTargetScopes = baseEffects.some(isTargetScope);
  let effects = baseEffects.map((effect) => structuredClone(effect));

  const cardRules = rules.filter(
    (rule) =>
      rule.scope === "target-or-card" &&
      !hasTargetScopes &&
      !isZeroTargetAlternative(definition, context.targetIds)
  );
  const responderIds = state.turnOrder.filter(
    (playerId) => state.players[playerId]?.alive
  );
  for (const rule of cardRules) {
    effects = [{
      type: "negatable",
      sourceId: context.sourceId,
      cardId: context.cardId,
      responderIds,
      negated: false,
      onResolved: effects
    }];
  }
  return effects;
}

export function composeDelayedCardResolution(
  state: Readonly<GameState>,
  context: AbilityExecutionContext,
  definition: CardDefinition,
  baseEffects: readonly EffectDraft[],
  cancelledEffects: readonly EffectDraft[],
  allRules: readonly CardResolutionRule[]
): EffectDraft[] {
  let effects = baseEffects.map((effect) => structuredClone(effect));
  const responderIds = state.turnOrder.filter(
    (playerId) => state.players[playerId]?.alive
  );
  const rules = allRules
    .filter(
      (rule) =>
        matches(definition, rule) &&
        rule.scope === "target-or-card" &&
        rule.operation.type === "allow-nullification"
    )
    .sort(
      (left, right) =>
        (left.priority ?? 0) - (right.priority ?? 0) ||
        left.id.localeCompare(right.id)
    );
  for (const _rule of rules) {
    effects = [{
      type: "negatable",
      sourceId: context.sourceId,
      cardId: context.cardId,
      responderIds,
      negated: false,
      onResolved: effects,
      onNegated: cancelledEffects.map((effect) => structuredClone(effect))
    }];
  }
  return effects;
}
