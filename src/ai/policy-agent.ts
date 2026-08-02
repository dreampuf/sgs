import type {
  GameAgent,
  PlayerObservation
} from "./observation";
import type {
  CardDefinitionId,
  LegalAction
} from "../core/types";
import {
  isClearRebelTarget,
  strategicIdentityTargetScore
} from "./identity-inference";

export interface ActionEvaluator {
  evaluate(
    observation: Readonly<PlayerObservation>,
    action: Readonly<LegalAction>
  ): number;
}

export type AiTargetIntent = "beneficial" | "harmful" | "redistribute-hands";

/**
 * Every targeted active skill must declare how its targets should be scored.
 * Keeping this matrix explicit prevents a newly added skill from silently
 * falling back to player-id ordering.
 */
export const ACTIVE_SKILL_TARGET_INTENTS: Readonly<
  Record<string, AiTargetIntent>
> = {
  "standard:skill:激将": "harmful",
  "standard:skill:仁德": "beneficial",
  "standard:skill:反间": "harmful",
  "standard:skill:结姻": "beneficial",
  "standard:skill:青囊": "beneficial",
  "standard:skill:离间": "harmful",
  "wind:skill:黄天": "beneficial",
  "fire:skill:强袭": "harmful",
  "fire:skill:驱虎": "harmful",
  "fire:skill:天义": "harmful",
  "forest:skill:缔盟": "redistribute-hands"
};

const DECISION_TARGET_INTENTS: Readonly<Record<string, AiTargetIntent>> = {
  "tuxi-targets": "harmful",
  "yiji-recipient": "beneficial",
  "shensu-target": "harmful",
  "tianxiang-target": "harmful",
  "quhu-damage": "harmful",
  "jieming-target": "beneficial",
  "fangzhu-target": "harmful",
  "yinghun-target": "harmful",
  "haoshi-recipient": "beneficial",
  "luanwu-target": "harmful"
};

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

function guhuoRiskAdjustment(
  observation: PlayerObservation,
  action: Extract<
    LegalAction,
    { type: "use-virtual-card" | "respond-virtual-card" }
  >
): number {
  if (action.skillId !== "wind:skill:蛊惑") return 0;
  const material = action.materialCardIds.length === 1
    ? observation.ownHand.find(
        (card) => card.id === action.materialCardIds[0]
      )
    : undefined;
  if (!material) return -1_000;

  const truthful = material.definitionId === action.definitionId;
  if (truthful) {
    // A direct use/response of the same card is safer and is always generated
    // alongside Guhuo. Prefer it without making a truthful declaration illegal.
    return material.suit === "heart" ? -1 : -25;
  }

  const exposed = (observation.guhuoHistory ?? []).filter(
    (entry) => entry.sourceId === observation.selfId
  );
  const lies = exposed.filter((entry) => !entry.truthful).length;
  const truths = exposed.length - lies;
  const potentialChallengers = observation.players.filter(
    (player) => player.alive && player.id !== observation.selfId
  ).length;
  const challengeRisk = Math.max(
    40,
    120 + potentialChallengers * 80 + lies * 260 - truths * 45
  );
  return -challengeRisk - cardValue(material.definitionId);
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

function isHarmful(definitionId: CardDefinitionId | undefined): boolean {
  return definitionId !== undefined && (
    definitionId.includes("slash") ||
    [
      "standard:duel",
      "standard:snatch",
      "standard:dismantlement",
      "standard:collateral",
      "standard:indulgence",
      "standard:lightning",
      "standard:supply-shortage",
      "standard:fire-attack",
      "standard:savage-assault",
      "standard:archery-attack"
    ].includes(definitionId)
  );
}

function canDealImmediateDamage(
  definitionId: CardDefinitionId | undefined
): boolean {
  return definitionId !== undefined && (
    isSlashDefinition(definitionId) ||
    [
      "standard:duel",
      "standard:fire-attack",
      "standard:savage-assault",
      "standard:archery-attack"
    ].includes(definitionId)
  );
}

function lordUncertainAggressionPenalty(
  observation: PlayerObservation,
  targetIds: readonly string[]
): number {
  if (observation.selfIdentity !== "lord") return 0;
  return targetIds.reduce((penalty, targetId) => {
    const target = observedPlayer(observation, targetId);
    if (
      !target?.alive ||
      isClearRebelTarget(observation, targetId)
    ) {
      return penalty;
    }
    // Direct damage against an unknown seat should lose to waiting or to
    // non-damaging disruption, even when using a card relieves hand overflow.
    // At critical health, the additional restraint dominates all ordinary
    // tempo incentives so the lord will not gamble on killing a loyalist.
    return penalty - 45 - (target.hp <= 1 ? 600 : 0);
  }, 0);
}

function strategicHostility(
  observation: PlayerObservation,
  targetId: string
): number {
  if (targetId === observation.selfId) return -320;
  // Identity-less fixtures are duel games. Treat the other player as an
  // opponent instead of waiting forever for identity evidence that cannot
  // exist in that mode.
  if (observation.selfIdentity === null) return 80;
  return strategicIdentityTargetScore(observation, targetId);
}

function observedPlayer(
  observation: PlayerObservation,
  targetId: string
): PlayerObservation["players"][number] | undefined {
  return observation.players.find((player) => player.id === targetId);
}

function hasPublicEquipment(
  observation: PlayerObservation,
  targetId: string,
  definitionId: string
): boolean {
  return observedPlayer(observation, targetId)?.equipment?.some(
    (card) => card.definitionId === definitionId
  ) === true;
}

function elementalPressure(observation: PlayerObservation): number {
  const elementalCards = observation.ownHand.filter((card) =>
    card.definitionId === "standard:fire-slash" ||
    card.definitionId === "standard:thunder-slash" ||
    card.definitionId === "standard:fire-attack"
  ).length;
  const exposedElementalCards = [
    ...observation.discardPile,
    ...observation.processing
  ].filter((card) =>
    card.definitionId === "standard:fire-slash" ||
    card.definitionId === "standard:thunder-slash" ||
    card.definitionId === "standard:fire-attack"
  ).length;
  return 0.45 + elementalCards * 0.3 +
    Math.min(0.35, exposedElementalCards * 0.015);
}

/** Value, to the observer, of toggling one player's chained state. */
function chainToggleValue(
  observation: PlayerObservation,
  targetId: string
): number {
  const target = observedPlayer(observation, targetId);
  if (!target) return -1_000;
  const direction = target.chained ? -1 : 1;
  const vineRisk = hasPublicEquipment(
    observation,
    targetId,
    "standard:vine"
  ) ? 0.65 : 0;
  const lowHealthRisk = Math.max(0, 3 - target.hp) * 0.2;
  const risk = elementalPressure(observation) + vineRisk + lowHealthRisk;
  return direction * strategicHostility(observation, targetId) * risk;
}

function harmfulTargetValue(
  observation: PlayerObservation,
  targetId: string,
  severity = 1
): number {
  const target = observedPlayer(observation, targetId);
  if (!target?.alive) return -1_000;
  if (severity === 0) return 0;
  const hostility = strategicHostility(observation, targetId);
  const finishPressure = hostility > 20
    ? Math.max(0, 3 - target.hp) * 22
    : 0;
  return hostility * severity + finishPressure;
}

function beneficialTargetValue(
  observation: PlayerObservation,
  targetId: string,
  severity = 1
): number {
  const target = observedPlayer(observation, targetId);
  if (!target?.alive) return -1_000;
  const missingHp = Math.max(0, target.maxHp - target.hp);
  return -strategicHostility(observation, targetId) * severity +
    missingHp * 35;
}

function effectValueForTarget(
  observation: PlayerObservation,
  definitionId: CardDefinitionId | undefined,
  targetId: string
): number {
  if (definitionId === "standard:iron-chain") {
    return chainToggleValue(observation, targetId);
  }
  if (isHarmful(definitionId)) {
    const severity = definitionId === "standard:indulgence" ||
        definitionId === "standard:supply-shortage"
      ? 1.25
      : definitionId === "standard:snatch" ||
          definitionId === "standard:dismantlement"
        ? 0.8
        : 1;
    return harmfulTargetValue(observation, targetId, severity);
  }
  return beneficialTargetValue(observation, targetId, 0.8);
}

function nullificationIntentScore(
  observation: PlayerObservation
): number {
  const context = observation.pendingResponseContext;
  if (!context) return -600;
  const effectValue = effectValueForTarget(
    observation,
    context.cardDefinitionId,
    context.targetId
  );
  // A fresh Nullification removes the original effect; a counter-
  // Nullification restores it. Spending a scarce card is justified only when
  // that state change has material strategic value.
  const stateChangeValue = context.negated ? effectValue : -effectValue;
  const threshold = context.cardDefinitionId === "standard:iron-chain"
    ? 140
    : 75;
  return stateChangeValue > threshold
    ? 340 + stateChangeValue - cardValue("standard:nullification")
    : -600;
}

function rescueIntentScore(observation: PlayerObservation): number {
  const targetId = observation.pendingRescueTargetId;
  if (!targetId) return -600;
  if (targetId === observation.selfId) return 600;
  const alliance = -strategicIdentityTargetScore(observation, targetId);
  return alliance > 20 ? 500 + alliance : -600;
}

function guhuoOptionScore(
  observation: PlayerObservation,
  option: string
): number {
  if (option === "trust") return 60;
  if (option !== "question") return 20;
  const own = observation.players.find(
    (player) => player.id === observation.selfId
  );
  if (!own || own.hp <= 1) return -1_000;
  const sourceId = observation.pendingGuhuoSourceId;
  const hostility = sourceId
    ? strategicIdentityTargetScore(observation, sourceId)
    : 0;
  const history = (observation.guhuoHistory ?? []).filter(
    (entry) => entry.sourceId === sourceId
  );
  const lies = history.filter((entry) => !entry.truthful).length;
  const truths = history.length - lies;
  const healthConfidence = own.hp >= 4 ? 15 : own.hp === 2 ? -45 : 0;
  return 15 + hostility * 0.55 + lies * 90 - truths * 55 +
    healthConfidence;
}

function isSlashDefinition(
  definitionId: CardDefinitionId | undefined
): boolean {
  return definitionId?.includes("slash") === true;
}

function kurouKillPlan(
  observation: PlayerObservation
): { targetHp: number; slashCount: number } | null {
  const hasCrossbow = (observation.ownEquipment ?? []).some(
    (card) => card.definitionId === "standard:crossbow"
  );
  if (!hasCrossbow) return null;
  const slashCount = observation.ownHand.filter(
    (card) => isSlashDefinition(card.definitionId)
  ).length;
  if (slashCount === 0) return null;
  const reachableTargetIds = new Set(observation.legalActions.flatMap((action) =>
    action.type === "use-card" || action.type === "use-virtual-card"
      ? isSlashDefinition(cardDefinitionForAction(observation, action))
        ? action.targetIds
        : []
      : []
  ));
  const target = observation.players
    .filter(
      (player) =>
        player.alive &&
        reachableTargetIds.has(player.id) &&
        strategicIdentityTargetScore(observation, player.id) > 20
    )
    .sort((left, right) => left.hp - right.hp)[0];
  return target ? { targetHp: target.hp, slashCount } : null;
}

function kurouIntentScore(
  observation: PlayerObservation,
  own: PlayerObservation["players"][number] | undefined
): number {
  if (!own) return -1_000;
  const skillId = "standard:skill:苦肉";
  const usesThisTurn = observation.ownTurnUsage?.[skillId] ?? 0;
  const killPlan = kurouKillPlan(observation);
  const maximumPotentialSlashes = killPlan
    ? killPlan.slashCount + Math.max(0, own.hp - 1) * 2
    : 0;
  if (
    killPlan &&
    killPlan.slashCount < killPlan.targetHp &&
    maximumPotentialSlashes >= killPlan.targetHp
  ) {
    return own.hp > 1
      ? 320 + (killPlan.targetHp - killPlan.slashCount) * 20 -
        usesThisTurn * 10
      : -1_000;
  }
  if (usesThisTurn > 0) return -1_000;

  const recoveryCards = observation.ownHand.filter(
    (card) => card.definitionId === "standard:peach"
  ).length;
  const hostilePlayers = observation.players.filter(
    (player) =>
      player.alive &&
      player.id !== observation.selfId &&
      strategicIdentityTargetScore(observation, player.id) > 20
  ).length;
  const hpAfterUse = own.hp - 1;
  const safeHpFloor = hostilePlayers >= 2 && recoveryCards === 0 ? 3 : 2;
  if (hpAfterUse < safeHpFloor) return -1_000;

  const handAfterUse = observation.ownHand.length + 2;
  const overflowAfterUse = Math.max(0, handAfterUse - hpAfterUse);
  if (overflowAfterUse >= 4) return -600;

  return 100 - overflowAfterUse * 20 + recoveryCards * 15;
}

function relationshipScore(
  observation: PlayerObservation,
  targetId: string,
  intent: Exclude<AiTargetIntent, "redistribute-hands">
): number {
  if (targetId === observation.selfId) {
    const self = observation.players.find(
      (player) => player.id === observation.selfId
    );
    return intent === "beneficial"
      ? 180 + Math.max(0, (self?.maxHp ?? 0) - (self?.hp ?? 0)) * 60
      : -800;
  }
  const hostility = strategicIdentityTargetScore(observation, targetId);
  return intent === "harmful" ? hostility : -hostility;
}

function targetIntentScore(
  observation: PlayerObservation,
  targetIds: string[],
  intent: AiTargetIntent,
  requireFriendly = false
): number {
  if (targetIds.length === 0) return 0;
  if (intent === "redistribute-hands") {
    if (targetIds.length !== 2) return -800;
    const targets = targetIds
      .map((id) => observation.players.find((player) => player.id === id))
      .filter((player) => player !== undefined);
    if (targets.length !== 2) return -800;
    const [low, high] = [...targets].sort(
      (left, right) => left.handSize - right.handSize
    );
    const difference = high!.handSize - low!.handSize;
    if (difference === 0) return -500;
    const beneficiaryAlliance = relationshipScore(
      observation,
      low!.id,
      "beneficial"
    );
    const donorHostility = relationshipScore(
      observation,
      high!.id,
      "harmful"
    );
    return difference * 45 +
      beneficiaryAlliance * 2 +
      donorHostility * 2;
  }
  const scores = targetIds.map((targetId) =>
    relationshipScore(observation, targetId, intent)
  );
  if (
    requireFriendly &&
    intent === "beneficial" &&
    scores.some((score) => score < 25)
  ) {
    return -800;
  }
  return scores.reduce((sum, score) => sum + score * 4, 0);
}

function cardFromOwnZones(
  observation: PlayerObservation,
  cardId: string
) {
  return observation.ownHand.find((card) => card.id === cardId) ??
    observation.ownEquipment?.find((card) => card.id === cardId);
}

function materialCost(
  observation: PlayerObservation,
  cardIds: readonly string[]
): number {
  return cardIds.reduce((total, cardId) =>
    total + cardValue(cardFromOwnZones(observation, cardId)?.definitionId), 0);
}

function cardsConsumedByAction(action: LegalAction): number {
  if (action.type === "use-card") return 1;
  if (action.type === "use-virtual-card") {
    return Math.max(1, action.materialCardIds.length);
  }
  if (action.type === "activate-skill") return action.materialCardIds.length;
  return 0;
}

function overflowValue(
  observation: PlayerObservation,
  action: LegalAction
): number {
  const handLimit = observation.ownHandLimit ??
    observedPlayer(observation, observation.selfId)?.hp ?? 0;
  const overflow = Math.max(0, observation.ownHand.length - handLimit);
  return Math.min(overflow, cardsConsumedByAction(action)) * 38;
}

function globalHarmValue(observation: PlayerObservation): number {
  return observation.players
    .filter((player) => player.alive && player.id !== observation.selfId)
    .reduce((total, player) =>
      total + harmfulTargetValue(observation, player.id, 0.55), 0);
}

function ironChainActionValue(
  observation: PlayerObservation,
  targetIds: readonly string[]
): number {
  // Recasting replaces itself and preserves options, so it should beat a
  // speculative toggle but not a concrete attack or rescue.
  if (targetIds.length === 0) return 92;
  return targetIds.reduce(
    (total, targetId) => total + chainToggleValue(observation, targetId),
    0
  );
}

function slashActionValue(
  observation: PlayerObservation,
  definitionId: CardDefinitionId,
  targetIds: readonly string[]
): number {
  return targetIds.reduce((total, targetId) => {
    const target = observedPlayer(observation, targetId);
    let value = harmfulTargetValue(observation, targetId);
    if (target) {
      // Large hands are more likely to contain Jink. This is deliberately a
      // mild discount: public hand size is evidence, not hidden-card access.
      value -= Math.min(35, target.handSize * 5);
      if (
        target.chained &&
        (
          definitionId === "standard:fire-slash" ||
          definitionId === "standard:thunder-slash"
        )
      ) {
        value += observation.players
          .filter((player) => player.alive && player.chained)
          .reduce((chainTotal, player) =>
            chainTotal + harmfulTargetValue(
              observation,
              player.id,
              player.id === targetId ? 0 : 0.55
            ), 0);
      }
      if (
        definitionId === "standard:fire-slash" &&
        hasPublicEquipment(observation, targetId, "standard:vine")
      ) {
        value += Math.max(0, strategicHostility(observation, targetId)) * 0.7;
      }
    }
    return total + value;
  }, 0);
}

function cardActionValue(
  observation: PlayerObservation,
  action: Extract<LegalAction, { type: "use-card" | "use-virtual-card" }>,
  definitionId: CardDefinitionId | undefined
): number {
  if (!definitionId) return -1_000;
  const own = observedPlayer(observation, observation.selfId);
  const targets = action.targetIds;
  let value = 0;

  if (isSlashDefinition(definitionId)) {
    value = slashActionValue(observation, definitionId, targets);
  } else if (definitionId === "standard:peach") {
    value = own ? Math.max(0, own.maxHp - own.hp) * 135 : -1_000;
  } else if (definitionId === "standard:wine") {
    const killableSlash = observation.legalActions.some((candidate) =>
      (candidate.type === "use-card" || candidate.type === "use-virtual-card") &&
      isSlashDefinition(cardDefinitionForAction(observation, candidate)) &&
      candidate.targetIds.some((targetId) => {
        const target = observedPlayer(observation, targetId);
        return target !== undefined && target.hp <= 2 &&
          strategicHostility(observation, targetId) > 40;
      })
    );
    value = killableSlash ? 125 : -120;
  } else if (definitionId === "standard:ex-nihilo") {
    value = 175;
  } else if (definitionId === "standard:iron-chain") {
    value = ironChainActionValue(observation, targets);
  } else if (
    definitionId === "standard:savage-assault" ||
    definitionId === "standard:archery-attack"
  ) {
    value = globalHarmValue(observation);
  } else if (definitionId === "standard:god-salvation") {
    value = observation.players
      .filter((player) => player.alive && player.hp < player.maxHp)
      .reduce((total, player) =>
        total + beneficialTargetValue(observation, player.id, 0.7), 0);
  } else if (definitionId === "standard:amazing-grace") {
    value = 48 + observation.players
      .filter((player) => player.alive && player.id !== observation.selfId)
      .reduce((total, player) =>
        total - strategicHostility(observation, player.id) * 0.12, 0);
  } else if (definitionId === "standard:fire-attack") {
    value = targets.reduce((total, targetId) =>
      total + harmfulTargetValue(observation, targetId, 0.9), 0);
    const ownSuits = new Set(observation.ownHand.map((card) => card.suit));
    value += Math.max(0, ownSuits.size - 1) * 8;
  } else if (
    definitionId === "standard:snatch" ||
    definitionId === "standard:dismantlement"
  ) {
    value = targets.reduce((total, targetId) => {
      const target = observedPlayer(observation, targetId);
      const publicAssets = (target?.equipment?.length ?? 0) +
        (target?.judgment?.length ?? 0);
      return total + harmfulTargetValue(observation, targetId, 0.75) +
        Math.min(35, (target?.handSize ?? 0) * 3 + publicAssets * 10);
    }, 0);
  } else if (
    definitionId === "standard:duel" ||
    definitionId === "standard:indulgence" ||
    definitionId === "standard:supply-shortage"
  ) {
    const severity = definitionId === "standard:duel" ? 1 : 1.2;
    value = targets.reduce((total, targetId) =>
      total + harmfulTargetValue(observation, targetId, severity), 0);
  } else if (definitionId === "standard:collateral") {
    value = targets.reduce((total, targetId, index) =>
      total + harmfulTargetValue(
        observation,
        targetId,
        index === 0 ? 0.65 : 0.85
      ), 0);
  } else if (definitionId === "standard:lightning") {
    value = -80;
  } else if (targets.length === 1 && targets[0] === observation.selfId) {
    // Remaining self-targeting active cards are equipment. Replacing the exact
    // same public equipment is wasteful; otherwise developing the table is
    // preferable to hoarding indefinitely.
    value = (observation.ownEquipment ?? []).some(
      (card) => card.definitionId === definitionId
    ) ? -45 : 52;
  } else if (isHarmful(definitionId)) {
    value = targets.reduce((total, targetId) =>
      total + harmfulTargetValue(observation, targetId), 0);
  }

  if (definitionId === "standard:crossbow") {
    const slashes = observation.ownHand.filter((card) =>
      isSlashDefinition(card.definitionId)
    ).length;
    value += slashes >= 2 ? 150 : slashes * 35;
  }
  if (action.type === "use-virtual-card") {
    value -= materialCost(observation, action.materialCardIds) * 0.35;
  }
  return value + overflowValue(observation, action);
}

function luanwuValue(observation: PlayerObservation): number {
  return observation.players
    .filter((player) => player.alive && player.id !== observation.selfId)
    .reduce((total, player) => {
      const vulnerability = player.handSize === 0 ? 1.5 : 1;
      return total + harmfulTargetValue(
        observation,
        player.id,
        vulnerability * 0.6
      );
    }, 0);
}

function zhihengValue(
  observation: PlayerObservation,
  materialCardIds: readonly string[]
): number {
  const replacementValue = 48;
  const exchange = materialCardIds.reduce((total, cardId) => {
    const value = cardValue(cardFromOwnZones(observation, cardId)?.definitionId);
    return total + replacementValue - value;
  }, 0);
  return exchange + materialCardIds.length * 6;
}

function knownCardForSelection(
  observation: PlayerObservation,
  cardId: string
) {
  return cardFromOwnZones(observation, cardId) ??
    observation.processing.find((card) => card.id === cardId) ??
    observation.discardPile.find((card) => card.id === cardId) ??
    observation.players.flatMap((player) => [
      ...(player.equipment ?? []),
      ...(player.judgment ?? [])
    ]).find((card) => card.id === cardId);
}

function cardSelectionScore(
  observation: PlayerObservation,
  cardIds: readonly string[]
): number {
  const reason = observation.pendingDecision?.type === "select-cards"
    ? observation.pendingDecision.reason
    : "";
  const cards = cardIds.map((cardId) =>
    knownCardForSelection(observation, cardId)
  );
  const totalValue = cards.reduce((total, card) =>
    total + cardValue(card?.definitionId), 0);

  if (reason.endsWith("-pindian") || reason.endsWith("-source-card")) {
    return cards.reduce((total, card) =>
      total + (card?.rank ?? 0) * 25 - cardValue(card?.definitionId) * 0.2,
    0);
  }
  if (
    reason === "amazing-grace" ||
    reason === "guanxing-top-card" ||
    reason === "lieren-obtain" ||
    reason === "tuxi-card" ||
    reason === "mengjin-card"
  ) {
    return totalValue;
  }
  if (
    reason.includes("discard") ||
    reason.includes("cost") ||
    reason === "haoshi-cards" ||
    reason === "buqu-remove"
  ) {
    return -totalValue;
  }
  if (reason === "guanxing-bottom-card") return -totalValue;
  return 30 - cardIds.length;
}

function optionalActivationScore(observation: PlayerObservation): number {
  const reason = observation.pendingDecision?.type === "choose-option"
    ? observation.pendingDecision.reason
    : "";
  const own = observedPlayer(observation, observation.selfId);
  const hostilePlayers = observation.players.filter((player) =>
    player.alive && player.id !== observation.selfId &&
    strategicHostility(observation, player.id) > 35
  );
  if (reason === "niepan" || reason === "buqu") return 220;
  if (reason === "eight-diagram" || reason === "bazhen") return 120;
  if (reason === "axe") {
    const handLimit = observation.ownHandLimit ?? own?.hp ?? 0;
    return observation.ownHand.length - handLimit >= 2 ? 45 : -80;
  }
  if (reason === "ice-sword") return -25;
  if (reason === "blade") {
    return observation.ownHand.some((card) =>
      isSlashDefinition(card.definitionId)
    ) && hostilePlayers.length > 0 ? 65 : -70;
  }
  if (reason === "luoyi") {
    const hasDamageCard = observation.ownHand.some((card) =>
      isSlashDefinition(card.definitionId) ||
      card.definitionId === "standard:duel"
    );
    return hasDamageCard && hostilePlayers.length > 0 ? 75 : -50;
  }
  if (reason === "tianxiang") {
    const hasHeart = observation.ownHand.some((card) => card.suit === "heart");
    return hasHeart && (own?.hp ?? 0) <= 2 ? 110 : hasHeart ? 35 : -100;
  }
  if (reason === "haoshi") {
    const hasRecipient = observation.players.some((player) =>
      player.alive && player.id !== observation.selfId &&
      strategicHostility(observation, player.id) < -25
    );
    return hasRecipient ? 65 : -40;
  }
  if (reason === "shensu") return hostilePlayers.length > 0 ? 60 : -40;
  if (reason === "jushou") return (own?.hp ?? 0) > 1 ? 70 : 15;
  if (reason === "zaiqi") {
    return own && own.maxHp - own.hp >= 2 ? 70 : -20;
  }
  if ([
    "double-sword",
    "fankui",
    "ganglie",
    "yiji",
    "jieming",
    "luoshen",
    "tieqi",
    "mengjin",
    "lieren",
    "xingshang",
    "songwei",
    "baonue",
    "shuangxiong"
  ].includes(reason)) {
    return 55;
  }
  return 12;
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
      const guhuoAdjustment = action.type === "respond-virtual-card"
        ? guhuoRiskAdjustment(observation, action)
        : 0;
      if (definitionId === "standard:nullification") {
        return nullificationIntentScore(observation) + guhuoAdjustment;
      }
      if (
        observation.pendingDecision?.type === "respond-card" &&
        observation.pendingDecision.responseKind === "peach"
      ) {
        return rescueIntentScore(observation) + guhuoAdjustment;
      }
      return 400 + cardValue(definitionId) + guhuoAdjustment;
    }
    if (action.type === "pass") return 0;
    if (
      action.type === "advance-phase" ||
      action.type === "end-turn"
    ) {
      return 25;
    }
    // Ending the action phase is a real strategic option. Giving it a modest
    // positive value prevents every barely-legal card or skill from beating it
    // solely because it exists.
    if (action.type === "end-action-phase") return 30;
    if (action.type === "choose-option") {
      if (
        observation.pendingDecision?.type === "choose-option" &&
        observation.pendingDecision.reason === "guhuo-question"
      ) {
        return guhuoOptionScore(observation, action.option);
      }
      return action.option === "activate"
        ? optionalActivationScore(observation)
        : action.option === "skip"
          ? 0
          : 20;
    }
    if (action.type === "choose-players") {
      const reason = observation.pendingDecision?.type === "select-players"
        ? observation.pendingDecision.reason
        : undefined;
      const intent = reason
        ? DECISION_TARGET_INTENTS[reason]
        : undefined;
      return action.playerIds.length * 30 +
        (intent
          ? targetIntentScore(observation, action.playerIds, intent)
          : 0);
    }
    if (action.type === "choose-cards") {
      return cardSelectionScore(observation, action.cardIds);
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
      if (action.skillId === "standard:skill:苦肉") {
        return kurouIntentScore(observation, own);
      }
      if (action.skillId === "standard:skill:制衡") {
        return zhihengValue(observation, action.materialCardIds) +
          overflowValue(observation, action);
      }
      if (action.skillId === "forest:skill:乱武") {
        const value = luanwuValue(observation);
        return value > 120 ? value : -600;
      }
      const intent = ACTIVE_SKILL_TARGET_INTENTS[action.skillId];
      let score = intent ? 18 : -20;
      if (intent) {
        score += targetIntentScore(
          observation,
          action.targetIds,
          intent,
          intent === "beneficial"
        );
        if (intent === "harmful") {
          score += lordUncertainAggressionPenalty(
            observation,
            action.targetIds
          );
        }
      }
      score -= materialCost(observation, action.materialCardIds) * 0.55;
      score += overflowValue(observation, action);
      if (action.skillId === "fire:skill:强袭") {
        const paysHp = action.materialCardIds.length === 0;
        if (paysHp && (own?.hp ?? 0) <= 2) return -1_000;
        if (paysHp) score -= 95;
      }
      if (action.skillId === "standard:skill:仁德") {
        const reserve = Math.max(2, own?.hp ?? 2);
        const giftCapacity = observation.ownHand.length - reserve;
        if (giftCapacity <= 0) return -1_000;
        const preferredCount = Math.min(2, giftCapacity);
        if (action.materialCardIds.length !== preferredCount) score -= 500;
        // The generic material cost above already preserves high-value cards;
        // Rende additionally avoids gifting below the useful two-card heal
        // threshold when it has a choice.
      }
      return score;
    }

    const definitionId = cardDefinitionForAction(observation, action);
    let score = cardActionValue(observation, action, definitionId);
    if (canDealImmediateDamage(definitionId)) {
      score += lordUncertainAggressionPenalty(observation, action.targetIds);
    }
    if (action.type === "use-virtual-card") {
      score += guhuoRiskAdjustment(observation, action);
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
    const score = (action: LegalAction): number =>
      this.#evaluators.reduce(
        (total, evaluator) =>
          total + evaluator.evaluate(observation, action),
        0
      );
    let best = observation.legalActions[0]!;
    let bestScore = score(best);
    let bestKey = actionKey(best);
    for (const action of observation.legalActions.slice(1)) {
      const candidateScore = score(action);
      const candidateKey = actionKey(action);
      if (
        candidateScore > bestScore ||
        (candidateScore === bestScore && candidateKey.localeCompare(bestKey) < 0)
      ) {
        best = action;
        bestScore = candidateScore;
        bestKey = candidateKey;
      }
    }
    return best;
  }
}
