import type {
  Effect,
  EffectDraft,
  GameState,
  JudgmentPattern,
  PlayerId
} from "./types";
import {
  evaluateRulePredicate,
  type RuleExpressionQueries,
  type RulePredicate
} from "./rule-expression";

export type TimingPoint = "before-effect";

export interface EffectTimingMatch {
  effectType: Effect["type"];
  sourceIsOwner?: boolean;
  targetIsOwner?: boolean;
  playerIsOwner?: boolean;
  responderIncludesOwner?: boolean;
  responseKind?: "slash" | "jink" | "peach";
  responderMarkByCard?: {
    prefix: string;
    equals: number | boolean;
  };
  requiredEffectTags?: string[];
  excludedEffectTags?: string[];
  sourceCardTag?: string;
  sourceCardColor?: "red" | "black" | "colorless";
  targetHand?: "empty" | "nonempty";
  ownerMark?: {
    mark: string;
    equals: number | boolean;
  };
  propagated?: boolean;
  nature?: "normal" | "fire" | "thunder";
  amountGreaterThan?: number;
}

export type AtomicEffectTimingOperation =
  | { type: "remove" }
  | { type: "add-amount"; amount: number }
  | { type: "add-count"; count: number }
  | { type: "cap-amount"; maximum: number }
  | {
      type: "resolve-response";
      outcome: "accepted" | "passed";
    }
  | {
      type: "offer-judgment-response";
      reason: string;
      pattern: JudgmentPattern;
    }
  | {
      type: "offer-discard-effect-replacement";
      reason: string;
      targetZones: Array<"hand" | "equipment">;
      maximum: number;
    }
  | {
      type: "offer-delegated-response";
      reason: string;
      kingdom: "wei" | "shu" | "wu" | "qun";
    }
  | {
      type: "offer-target-redirection";
      reason: string;
      costZones: Array<"hand" | "equipment">;
    }
  | {
      type: "add-tags";
      tags: string[];
    };

export type EffectTimingOperation =
  | AtomicEffectTimingOperation
  | {
      type: "offer-optional";
      reason: string;
      onActivate: AtomicEffectTimingOperation;
    };

/**
 * A data-only subscription to a semantic timing point.
 *
 * Content declares what it observes and how it changes the proposed intent.
 * It never receives an engine callback and does not need to be called by a
 * card definition.
 */
export interface TimingAbilityRule {
  type: "timing";
  timing: "before-effect";
  priority?: number;
  match: EffectTimingMatch;
  when?: RulePredicate;
  operation: EffectTimingOperation;
}

export interface BeforeEffectIntent {
  type: "effect";
  effect: Effect;
}

export interface BeforeEffectTiming {
  point: "before-effect";
  intent: BeforeEffectIntent;
}

export interface TimingRuleCandidate {
  id: string;
  ownerId: PlayerId;
  order: number;
  rule: TimingAbilityRule;
}

export interface TimingResolution {
  effects: Array<Effect | EffectDraft>;
  appliedRuleIds: string[];
}

export interface TimingQueries extends RuleExpressionQueries {
  cardHasTag(cardId: string, tag: string): boolean;
  effectiveCardSuit(
    state: Readonly<GameState>,
    cardId: string,
    ownerId?: PlayerId
  ): "diamond" | "heart" | "club" | "spade" | undefined;
  canTargetCard(
    sourceId: PlayerId,
    cardId: string,
    targetId: PlayerId
  ): boolean;
}

function effectTags(effect: Effect): string[] {
  return "tags" in effect ? effect.tags ?? [] : [];
}

function addEffectTags(effect: Effect, tags: string[]): Effect {
  if (
    effect.type !== "request-response" &&
    effect.type !== "damage" &&
    effect.type !== "draw"
  ) {
    return effect;
  }
  return {
    ...effect,
    tags: [...new Set([...(effect.tags ?? []), ...tags])]
  };
}

function sourceCardColor(
  state: Readonly<GameState>,
  effect: Effect,
  queries: TimingQueries
): "red" | "black" | "colorless" {
  const suit = "cardId" in effect
    ? queries.effectiveCardSuit(
        state,
        effect.cardId,
        "sourceId" in effect && typeof effect.sourceId === "string"
          ? effect.sourceId
          : undefined
      )
    : undefined;
  if (suit === "diamond" || suit === "heart") return "red";
  if (suit === "club" || suit === "spade") return "black";
  return "colorless";
}

function matches(
  state: Readonly<GameState>,
  effect: Effect,
  candidate: TimingRuleCandidate,
  queries: TimingQueries
): boolean {
  const { ownerId, rule } = candidate;
  const match = rule.match;
  if (effect.type !== match.effectType) return false;
  if (
    effectTags(effect).includes("engine:modifiers-finalized") ||
    effectTags(effect).includes(`timing:handled:${candidate.id}`)
  ) {
    return false;
  }
  if (
    match.sourceIsOwner &&
    (!("sourceId" in effect) || effect.sourceId !== ownerId)
  ) {
    return false;
  }
  if (
    match.targetIsOwner &&
    (!("targetId" in effect) || effect.targetId !== ownerId)
  ) {
    return false;
  }
  if (
    match.playerIsOwner &&
    (!("playerId" in effect) || effect.playerId !== ownerId)
  ) {
    return false;
  }
  if (
    match.responderIncludesOwner &&
    (
      effect.type !== "request-response" ||
      !effect.responderIds.includes(ownerId)
    )
  ) {
    return false;
  }
  if (
    match.responseKind !== undefined &&
    (
      effect.type !== "request-response" ||
      effect.responseKind !== match.responseKind
    )
  ) {
    return false;
  }
  if (match.responderMarkByCard !== undefined) {
    if (effect.type !== "request-response") return false;
    const mark = `${match.responderMarkByCard.prefix}:${effect.cardId}`;
    if (
      !effect.responderIds.some(
        (playerId) =>
          state.players[playerId]?.marks[mark] ===
            match.responderMarkByCard!.equals
      )
    ) {
      return false;
    }
  }
  const tags = effectTags(effect);
  if (match.requiredEffectTags?.some((tag) => !tags.includes(tag))) {
    return false;
  }
  if (match.excludedEffectTags?.some((tag) => tags.includes(tag))) {
    return false;
  }
  if (match.sourceCardTag !== undefined) {
    if (
      !("cardId" in effect) ||
      !queries.cardHasTag(effect.cardId, match.sourceCardTag)
    ) {
      return false;
    }
  }
  if (
    match.sourceCardColor !== undefined &&
    sourceCardColor(state, effect, queries) !== match.sourceCardColor
  ) {
    return false;
  }
  if (match.targetHand !== undefined) {
    if (!("targetId" in effect)) return false;
    const empty =
      (state.zones[`zone:hand:${effect.targetId}`]?.length ?? 0) === 0;
    if (
      (match.targetHand === "empty" && !empty) ||
      (match.targetHand === "nonempty" && empty)
    ) {
      return false;
    }
  }
  if (
    match.ownerMark !== undefined &&
    state.players[ownerId]?.marks[match.ownerMark.mark] !==
      match.ownerMark.equals
  ) {
    return false;
  }
  if (
    match.propagated !== undefined &&
    (
      effect.type !== "damage" ||
      (effect.propagated ?? false) !== match.propagated
    )
  ) {
    return false;
  }
  if (
    match.nature !== undefined &&
    (
      effect.type !== "damage" ||
      (effect.nature ?? "normal") !== match.nature
    )
  ) {
    return false;
  }
  if (
    match.amountGreaterThan !== undefined &&
    (
      !("amount" in effect) ||
      effect.amount <= match.amountGreaterThan
    )
  ) {
    return false;
  }
  if (
    rule.when !== undefined &&
    !evaluateRulePredicate(rule.when, {
      state,
      ownerId,
      effect,
      queries
    })
  ) {
    return false;
  }
  return true;
}

function apply(
  state: Readonly<GameState>,
  effect: Effect,
  candidate: TimingRuleCandidate,
  queries: TimingQueries
): Array<Effect | EffectDraft> {
  const { ownerId, rule } = candidate;
  const operation = rule.operation;
  if (operation.type === "offer-optional") {
    const activated = apply(
      state,
      effect,
      {
        ...candidate,
        rule: {
          ...rule,
          operation: operation.onActivate
        }
      },
      queries
    );
    if (
      activated.length === 1 &&
      activated[0] === effect
    ) {
      return [effect];
    }
    const handledTag = `timing:handled:${candidate.id}`;
    const markHandled = (
      item: Effect | EffectDraft
    ): Effect | EffectDraft =>
      item.type === "offer-optional-effect" && "onActivate" in item
        ? item
        : addEffectTags(item as Effect, [handledTag]);
    return [{
      type: "offer-optional-effect",
      playerId: ownerId,
      cardId: "cardId" in effect
        ? effect.cardId
        : `system:timing:${candidate.id}`,
      reason: operation.reason,
      onActivate: activated.map(markHandled),
      onSkip: [markHandled(effect)]
    }];
  }
  if (operation.type === "remove") return [];
  if (operation.type === "add-amount") {
    return "amount" in effect
      ? [{ ...effect, amount: effect.amount + operation.amount }]
      : [effect];
  }
  if (operation.type === "add-count") {
    return "count" in effect
      ? [{ ...effect, count: effect.count + operation.count }]
      : [effect];
  }
  if (operation.type === "cap-amount") {
    return "amount" in effect
      ? [{ ...effect, amount: Math.min(effect.amount, operation.maximum) }]
      : [effect];
  }
  if (operation.type === "resolve-response") {
    if (effect.type !== "request-response") return [effect];
    return [{
      type: "enqueue-plan",
      planId: operation.outcome === "accepted"
        ? effect.acceptedPlanId
        : effect.passedPlanId,
      discardPlanIds: [
        operation.outcome === "accepted"
          ? effect.passedPlanId
          : effect.acceptedPlanId
      ]
    }];
  }
  if (operation.type === "offer-judgment-response") {
    if (effect.type !== "request-response") return [effect];
    return [{
      type: "offer-judgment-response",
      playerId: ownerId,
      cardId: effect.cardId,
      reason: operation.reason,
      pattern: structuredClone(operation.pattern),
      response: addEffectTags(
        effect,
        [`timing:handled:${candidate.id}`]
      ) as typeof effect
    }];
  }
  if (operation.type === "offer-discard-effect-replacement") {
    if (!("targetId" in effect) || typeof effect.targetId !== "string") {
      return [effect];
    }
    const selectableCardIds = operation.targetZones.flatMap(
      (zone) => state.zones[`zone:${zone}:${effect.targetId}`] ?? []
    );
    if (selectableCardIds.length === 0) return [effect];
    return [{
      type: "offer-discard-effect-replacement",
      playerId: ownerId,
      targetId: effect.targetId,
      cardId: effect.cardId,
      selectableCardIds,
      count: Math.min(operation.maximum, selectableCardIds.length),
      reason: operation.reason,
      replacedEffect: addEffectTags(
        effect,
        [`timing:handled:${candidate.id}`]
      )
    }];
  }
  if (operation.type === "offer-delegated-response") {
    if (effect.type !== "request-response") return [effect];
    return [{
      type: "offer-delegated-response",
      playerId: ownerId,
      cardId: effect.cardId,
      reason: operation.reason,
      kingdom: operation.kingdom,
      response: addEffectTags(
        effect,
        [`timing:handled:${candidate.id}`]
      ) as typeof effect
    }];
  }
  if (operation.type === "offer-target-redirection") {
    if (effect.type !== "request-response") return [effect];
    const selectableCardIds = operation.costZones.flatMap(
      (zone) => state.zones[`zone:${zone}:${ownerId}`] ?? []
    );
    const selectablePlayerIds = state.turnOrder.filter(
      (playerId) =>
        playerId !== ownerId &&
        playerId !== effect.sourceId &&
        state.players[playerId]?.alive === true &&
        queries.canTargetCard(ownerId, effect.cardId, playerId)
    );
    if (
      selectableCardIds.length === 0 ||
      selectablePlayerIds.length === 0
    ) {
      return [effect];
    }
    return [{
      type: "offer-target-redirection",
      stage: "offer",
      playerId: ownerId,
      sourceId: effect.sourceId,
      cardId: effect.cardId,
      selectableCardIds,
      selectablePlayerIds,
      reason: operation.reason,
      response: addEffectTags(
        effect,
        [`timing:handled:${candidate.id}`]
      ) as typeof effect
    }];
  }
  const tagged = addEffectTags(effect, operation.tags);
  return [tagged];
}

/**
 * Resolves all subscriptions for a timing point without mutating game state.
 * Candidate ids and the resolution are serializable, so the engine can persist
 * which rules were considered when a frame is suspended.
 */
export function resolveTiming(
  state: Readonly<GameState>,
  timing: BeforeEffectTiming,
  candidates: readonly TimingRuleCandidate[],
  queries: TimingQueries
): TimingResolution {
  let effects: Array<Effect | EffectDraft> = [
    structuredClone(timing.intent.effect)
  ];
  const appliedRuleIds: string[] = [];
  const ordered = [...candidates].sort(
    (left, right) =>
      (left.rule.priority ?? 0) - (right.rule.priority ?? 0) ||
      left.order - right.order ||
      left.id.localeCompare(right.id)
  );
  for (const candidate of ordered) {
    let applied = false;
    const next: Array<Effect | EffectDraft> = [];
    for (const proposed of effects) {
      if (
        proposed.type === "offer-optional-effect" &&
        "onActivate" in proposed
      ) {
        next.push(proposed);
        continue;
      }
      const effect = proposed as Effect;
      if (!matches(state, effect, candidate, queries)) {
        next.push(effect);
        continue;
      }
      applied = true;
      next.push(
        ...apply(state, effect, candidate, queries).map((item) =>
          item.type === "offer-optional-effect" && "onActivate" in item
            ? item
            : addEffectTags(
                item as Effect,
                [`timing:handled:${candidate.id}`]
              )
        )
      );
    }
    effects = next;
    if (applied) appliedRuleIds.push(candidate.id);
  }
  return { effects, appliedRuleIds };
}
