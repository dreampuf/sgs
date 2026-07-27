import {
  composeCardResolution,
  composeDelayedCardResolution,
  composeTargetResolution,
  type CardResolutionRule
} from "./card-resolution";
import type {
  AbilityExecutionContext,
  CardDefinition,
  ContentRegistry
} from "./registry";
import { EventRuleResolver } from "./event-rule-resolver";
import { LegalActionResolver } from "./legal-action-resolver";
import { RuleResolver } from "./rule-resolver";
import type {
  BeforeEffectTiming,
  TimingResolution
} from "./timing";
import type {
  DomainEvent,
  EffectDraft,
  GameState,
  LegalAction,
  PlayerId
} from "./types";

export interface RulePointInputMap {
  "card-declared": {
    state: Readonly<GameState>;
    context: AbilityExecutionContext;
    definition: CardDefinition;
    effects: readonly EffectDraft[];
  };
  "target-confirmed": {
    state: Readonly<GameState>;
    context: AbilityExecutionContext;
    definition: CardDefinition;
    target: Extract<EffectDraft, { type: "resolve-target" }>;
  };
  "delayed-card-resolving": {
    state: Readonly<GameState>;
    context: AbilityExecutionContext;
    definition: CardDefinition;
    effects: readonly EffectDraft[];
    cancelledEffects: readonly EffectDraft[];
  };
  "before-effect": {
    state: GameState;
    timing: BeforeEffectTiming;
  };
  "after-event": {
    state: GameState;
    event: DomainEvent;
  };
  "legal-actions": {
    state: GameState;
    actorId: PlayerId;
    actions: readonly LegalAction[];
  };
}

export interface RulePointResultMap {
  "card-declared": EffectDraft[];
  "target-confirmed": EffectDraft[];
  "delayed-card-resolving": EffectDraft[];
  "before-effect": TimingResolution;
  "after-event": EffectDraft[];
  "legal-actions": LegalAction[];
}

export type RulePoint = keyof RulePointInputMap;

/**
 * The single entry point for contextual rule participation.
 *
 * Producers publish semantic card/target/effect intents here. The bus discovers
 * rules from packs and the live board, then returns composed effects. Content
 * does not call another card, skill, equipment, AI, or UI implementation.
 */
export class RuleBus {
  readonly #catalog: ContentRegistry;
  readonly #effectResolver: RuleResolver;
  readonly #eventResolver: EventRuleResolver;
  readonly #legalActionResolver: LegalActionResolver;
  readonly #cardResolutionRules = new Map<string, CardResolutionRule>();

  constructor(catalog: ContentRegistry) {
    this.#catalog = catalog;
    this.#effectResolver = new RuleResolver(catalog);
    this.#eventResolver = new EventRuleResolver(catalog);
    this.#legalActionResolver = new LegalActionResolver(catalog);
  }

  hasCardResolutionRule(id: string): boolean {
    return this.#cardResolutionRules.has(id);
  }

  registerCardResolutionRule(rule: CardResolutionRule): void {
    if (this.#cardResolutionRules.has(rule.id)) {
      throw new Error(`duplicate card resolution rule: ${rule.id}`);
    }
    this.#cardResolutionRules.set(rule.id, structuredClone(rule));
  }

  publish<Point extends RulePoint>(
    point: Point,
    input: RulePointInputMap[Point]
  ): RulePointResultMap[Point] {
    const rules = [...this.#cardResolutionRules.values()];
    switch (point) {
      case "card-declared": {
        const current = input as RulePointInputMap["card-declared"];
        return composeCardResolution(
          current.state,
          current.context,
          current.definition,
          current.effects,
          rules
        ) as RulePointResultMap[Point];
      }
      case "target-confirmed": {
        const current = input as RulePointInputMap["target-confirmed"];
        return composeTargetResolution(
          current.state,
          current.context,
          current.definition,
          current.target,
          rules
        ) as RulePointResultMap[Point];
      }
      case "delayed-card-resolving": {
        const current =
          input as RulePointInputMap["delayed-card-resolving"];
        return composeDelayedCardResolution(
          current.state,
          current.context,
          current.definition,
          current.effects,
          current.cancelledEffects,
          rules
        ) as RulePointResultMap[Point];
      }
      case "before-effect": {
        const current = input as RulePointInputMap["before-effect"];
        return this.#effectResolver.resolve(
          current.state,
          current.timing
        ) as RulePointResultMap[Point];
      }
      case "after-event": {
        const current = input as RulePointInputMap["after-event"];
        return this.#eventResolver.resolve(
          current.state,
          current.event
        ) as RulePointResultMap[Point];
      }
      case "legal-actions": {
        const current = input as RulePointInputMap["legal-actions"];
        return this.#legalActionResolver.resolve(
          current.state,
          current.actorId,
          current.actions
        ) as RulePointResultMap[Point];
      }
    }
  }
}
