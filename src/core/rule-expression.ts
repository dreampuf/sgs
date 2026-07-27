import type {
  DomainEvent,
  Effect,
  GameState,
  PlayerId
} from "./types";

export type RulePlayerExpression =
  | { type: "owner" }
  | {
      type: "event-player";
      field: "playerId" | "sourceId" | "targetId";
    }
  | {
      type: "effect-player";
      field: "playerId" | "sourceId" | "targetId";
    }
  | {
      type: "effect-responder";
      index: number;
    };

export type RuleValueExpression =
  | { type: "literal"; value: string | number | boolean | null }
  | { type: "player-id"; player: RulePlayerExpression }
  | {
      type: "state-field";
      field: "currentPlayerId" | "phase" | "turnNumber";
    }
  | {
      type: "event-field";
      field: string;
    }
  | {
      type: "effect-field";
      field: string;
    }
  | {
      type: "player-number";
      player: RulePlayerExpression;
      property: "hp" | "max-hp" | "hand-count" | "attack-range";
    }
  | {
      type: "distance";
      from: RulePlayerExpression;
      to: RulePlayerExpression;
    };

export type RulePredicate =
  | {
      type: "compare";
      left: RuleValueExpression;
      operator: "eq" | "not-eq" | "lt" | "lte" | "gt" | "gte";
      right: RuleValueExpression;
    }
  | {
      type: "all";
      predicates: RulePredicate[];
    }
  | {
      type: "any";
      predicates: RulePredicate[];
    }
  | {
      type: "not";
      predicate: RulePredicate;
    };

export interface RuleExpressionQueries {
  attackRange(
    state: Readonly<GameState>,
    playerId: PlayerId
  ): number;
  distanceBetween(
    state: Readonly<GameState>,
    sourceId: PlayerId,
    targetId: PlayerId
  ): number;
}

export interface RuleExpressionContext {
  state: Readonly<GameState>;
  ownerId: PlayerId;
  event?: DomainEvent;
  effect?: Effect;
  queries: RuleExpressionQueries;
}

function recordField(value: unknown, field: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[field];
}

function playerId(
  context: RuleExpressionContext,
  expression: RulePlayerExpression
): PlayerId | undefined {
  if (expression.type === "owner") return context.ownerId;
  if (expression.type === "event-player") {
    const value = recordField(context.event, expression.field);
    return typeof value === "string" ? value : undefined;
  }
  if (expression.type === "effect-player") {
    const value = recordField(context.effect, expression.field);
    return typeof value === "string" ? value : undefined;
  }
  const responders = recordField(context.effect, "responderIds");
  const value = Array.isArray(responders)
    ? responders[expression.index]
    : undefined;
  return typeof value === "string" ? value : undefined;
}

function value(
  context: RuleExpressionContext,
  expression: RuleValueExpression
): unknown {
  if (expression.type === "literal") return expression.value;
  if (expression.type === "state-field") {
    return context.state[expression.field];
  }
  if (expression.type === "event-field") {
    return recordField(context.event, expression.field);
  }
  if (expression.type === "effect-field") {
    return recordField(context.effect, expression.field);
  }
  if (expression.type === "player-id") {
    return playerId(context, expression.player);
  }
  if (expression.type === "distance") {
    const fromId = playerId(context, expression.from);
    const toId = playerId(context, expression.to);
    return fromId && toId
      ? context.queries.distanceBetween(context.state, fromId, toId)
      : undefined;
  }
  const subjectId = playerId(context, expression.player);
  const player = subjectId
    ? context.state.players[subjectId]
    : undefined;
  if (!subjectId || !player) return undefined;
  if (expression.property === "hp") return player.hp;
  if (expression.property === "max-hp") return player.maxHp;
  if (expression.property === "hand-count") {
    return context.state.zones[`zone:hand:${subjectId}`]?.length ?? 0;
  }
  return context.queries.attackRange(context.state, subjectId);
}

function orderedComparison(
  left: unknown,
  right: unknown,
  compare: (leftValue: number, rightValue: number) => boolean
): boolean {
  return typeof left === "number" &&
    typeof right === "number" &&
    compare(left, right);
}

/**
 * Evaluates the serializable condition language shared by timing and event
 * rules. Packs describe facts; they do not receive callbacks into the engine.
 */
export function evaluateRulePredicate(
  predicate: RulePredicate,
  context: RuleExpressionContext
): boolean {
  if (predicate.type === "all") {
    return predicate.predicates.every((item) =>
      evaluateRulePredicate(item, context)
    );
  }
  if (predicate.type === "any") {
    return predicate.predicates.some((item) =>
      evaluateRulePredicate(item, context)
    );
  }
  if (predicate.type === "not") {
    return !evaluateRulePredicate(predicate.predicate, context);
  }
  const left = value(context, predicate.left);
  const right = value(context, predicate.right);
  if (predicate.operator === "eq") return left === right;
  if (predicate.operator === "not-eq") return left !== right;
  if (predicate.operator === "lt") {
    return orderedComparison(left, right, (a, b) => a < b);
  }
  if (predicate.operator === "lte") {
    return orderedComparison(left, right, (a, b) => a <= b);
  }
  if (predicate.operator === "gt") {
    return orderedComparison(left, right, (a, b) => a > b);
  }
  return orderedComparison(left, right, (a, b) => a >= b);
}
