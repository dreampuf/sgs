import type {
  GameAgent,
  PlayerObservation
} from "./observation";
import type {
  CardDefinitionId,
  LegalAction
} from "../core/types";

export interface ActionEvaluator {
  evaluate(
    observation: Readonly<PlayerObservation>,
    action: Readonly<LegalAction>
  ): number;
}

function actionKey(action: LegalAction): string {
  return JSON.stringify(action);
}

function cardDefinitionForAction(
  observation: PlayerObservation,
  action: LegalAction
): CardDefinitionId | undefined {
  if (
    action.type === "use-virtual-card" ||
    action.type === "respond-virtual-card"
  ) {
    return action.definitionId;
  }
  if (
    action.type === "use-card" ||
    action.type === "respond-card"
  ) {
    return observation.ownHand.find((card) => card.id === action.cardId)
      ?.definitionId;
  }
  return undefined;
}

function cardValue(definitionId: CardDefinitionId | undefined): number {
  if (!definitionId) return 0;
  if (definitionId === "standard:peach") return 90;
  if (definitionId === "standard:nullification") return 80;
  if (definitionId === "standard:jink") return 70;
  if (
    definitionId === "standard:ex-nihilo" ||
    definitionId === "standard:amazing-grace"
  ) {
    return 75;
  }
  if (definitionId.includes("slash")) return 55;
  if (
    definitionId.includes("sword") ||
    definitionId.includes("blade") ||
    definitionId.includes("shield") ||
    definitionId.includes("diagram") ||
    definitionId.includes("crossbow")
  ) {
    return 45;
  }
  return 40;
}

export const STANDARD_HEURISTIC: ActionEvaluator = {
  evaluate(observation, action): number {
    const own = observation.players.find(
      (player) => player.id === observation.selfId
    );
    if (
      action.type === "respond-card" ||
      action.type === "respond-virtual-card"
    ) {
      const definitionId = cardDefinitionForAction(observation, action);
      const rescueBonus =
        observation.pendingDecision?.type === "respond-card" &&
        observation.pendingDecision.responseKind === "peach"
          ? 100
          : 0;
      return 400 + rescueBonus + cardValue(definitionId);
    }
    if (action.type === "pass") return 0;
    if (
      action.type === "advance-phase" ||
      action.type === "end-turn"
    ) {
      return 10;
    }
    if (action.type === "end-action-phase") return -100;
    if (action.type === "choose-option") {
      return action.option === "activate"
        ? 80
        : action.option === "skip"
          ? 0
          : 20;
    }
    if (action.type === "choose-players") {
      return action.playerIds.length * 30;
    }
    if (action.type === "choose-cards") {
      return 30 - action.cardIds.length;
    }
    if (action.type === "discard-cards") {
      const discardedValue = action.cardIds.reduce((total, cardId) =>
        total + cardValue(
          observation.ownHand.find((card) => card.id === cardId)
            ?.definitionId
        ), 0);
      return -discardedValue;
    }
    if (action.type === "activate-skill") {
      return 60 + action.targetIds.length * 5 -
        action.materialCardIds.length;
    }

    const definitionId = cardDefinitionForAction(observation, action);
    let score = cardValue(definitionId) + action.targetIds.length * 5;
    if (
      definitionId === "standard:peach" &&
      own &&
      own.hp < own.maxHp
    ) {
      score += (own.maxHp - own.hp) * 80;
    }
    if (definitionId === "standard:ex-nihilo") score += 80;
    for (const targetId of action.targetIds) {
      const target = observation.players.find(
        (player) => player.id === targetId
      );
      if (target && target.id !== observation.selfId) {
        score += Math.max(0, target.maxHp - target.hp) * 4;
        score += Math.max(0, 5 - target.hp) * 2;
      }
    }
    return score;
  }
};

/**
 * Searches the current legal action frontier with pluggable value estimators.
 * Estimators only receive the information-safe observation.
 */
export class PolicySearchAgent implements GameAgent {
  readonly #evaluators: readonly ActionEvaluator[];

  constructor(
    evaluators: readonly ActionEvaluator[] = [STANDARD_HEURISTIC]
  ) {
    this.#evaluators = [...evaluators];
  }

  chooseAction(observation: PlayerObservation): LegalAction {
    if (observation.legalActions.length === 0) {
      throw new Error(`agent ${observation.selfId} has no legal action`);
    }
    return [...observation.legalActions].sort((left, right) => {
      const score = (action: LegalAction): number =>
        this.#evaluators.reduce(
          (total, evaluator) =>
            total + evaluator.evaluate(observation, action),
          0
        );
      return score(right) - score(left) ||
        actionKey(left).localeCompare(actionKey(right));
    })[0]!;
  }
}
