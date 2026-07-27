import type { ContentRegistry } from "./registry";
import { shuffle } from "./rng";
import {
  DISCARD_PILE,
  DRAW_PILE,
  PROCESSING_ZONE,
  cloneGameState,
  equipmentZone,
  handZone,
  judgmentZone
} from "./state";
import type {
  CardMoveReason,
  CardMoveCause,
  CardInstanceId,
  DecisionContinuation,
  DecisionRequest,
  DispatchResult,
  DomainEvent,
  Effect,
  EffectDraft,
  EffectPlanId,
  GameCommand,
  GameState,
  LegalAction,
  Phase,
  PlayerId,
  WorkflowInput,
  WorkflowResume,
  ZoneId
} from "./types";

type EventInput<T> = T extends unknown
  ? Omit<T, "sequence" | "revision">
  : never;

function commandKey(command: GameCommand): string {
  return JSON.stringify(command);
}

function combinations<T>(items: readonly T[], count: number): T[][] {
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

export function getLegalActions(
  state: GameState,
  registry: ContentRegistry
): LegalAction[] {
  const modified = (
    actorId: PlayerId,
    actions: LegalAction[]
  ): LegalAction[] => registry.modifyLegalActions(state, actorId, actions);

  if (state.pendingDecision) {
    const { request } = state.pendingDecision;
    const actions: LegalAction[] = [];
    if (request.type === "select-cards") {
      for (
        let count = request.minimum;
        count <= request.maximum;
        count += 1
      ) {
        for (const cardIds of combinations(request.selectableCardIds, count)) {
          actions.push({
            type: "choose-cards",
            playerId: request.playerId,
            decisionId: request.id,
            cardIds
          });
        }
      }
      return modified(request.playerId, actions);
    }
    if (request.type === "select-players") {
      for (
        let count = request.minimum;
        count <= request.maximum;
        count += 1
      ) {
        for (
          const playerIds of combinations(
            request.selectablePlayerIds,
            count
          )
        ) {
          actions.push({
            type: "choose-players",
            playerId: request.playerId,
            decisionId: request.id,
            playerIds
          });
        }
      }
      return modified(request.playerId, actions);
    }
    if (request.type === "choose-option") {
      return modified(
        request.playerId,
        request.options.map((option) => ({
          type: "choose-option" as const,
          playerId: request.playerId,
          decisionId: request.id,
          option
        }))
      );
    }
    for (const cardId of state.zones[handZone(request.playerId)] ?? []) {
      const card = state.cards[cardId];
      if (card && request.acceptedDefinitionIds.includes(card.definitionId)) {
        actions.push({
          type: "respond-card",
          playerId: request.playerId,
          decisionId: request.id,
          cardId
        });
      }
    }
    actions.push({
      type: "pass",
      playerId: request.playerId,
      decisionId: request.id
    });
    return modified(request.playerId, actions);
  }

  if (
    state.stack.length > 0 ||
    state.triggerQueue.length > 0 ||
    state.phase === "finished"
  ) return [];
  const playerId = state.currentPlayerId;
  const player = state.players[playerId];
  if (!player?.alive) return [];

  if (state.phase === "judgment" || state.phase === "draw") {
    return modified(playerId, [{ type: "advance-phase", playerId }]);
  }

  if (state.phase === "discard") {
    const hand = state.zones[handZone(playerId)] ?? [];
    const excess = Math.max(0, hand.length - Math.max(0, player.hp));
    if (excess === 0) {
      return modified(playerId, [{ type: "end-turn", playerId }]);
    }
    return modified(playerId, combinations(hand, excess).map((cardIds) => ({
      type: "discard-cards",
      playerId,
      cardIds
    })));
  }

  const actions: LegalAction[] = [];
  for (const cardId of state.zones[handZone(playerId)] ?? []) {
    const card = state.cards[cardId];
    if (!card) continue;
    const definition = registry.card(card.definitionId);
    if (!definition.active) continue;
    if (!registry.canUseDefinition(state, playerId, definition.id)) {
      continue;
    }
    for (const targetIds of registry.targetSets(
      state,
      playerId,
      definition.id
    )) {
      actions.push({ type: "use-card", playerId, cardId, targetIds });
    }
  }
  actions.push({ type: "end-action-phase", playerId });
  return modified(playerId, actions);
}

export function dispatch(
  current: GameState,
  command: GameCommand,
  registry: ContentRegistry
): DispatchResult {
  const legal = getLegalActions(current, registry);
  if (!legal.some((candidate) => commandKey(candidate) === commandKey(command))) {
    throw new Error(`illegal command: ${commandKey(command)}`);
  }

  const state = cloneGameState(current);
  state.revision += 1;
  const events: DomainEvent[] = [];
  const internalId = (prefix: string): string =>
    `${prefix}-${state.nextSequence++}`;

  const materializeEffect = (
    input: Effect | EffectDraft
  ): Effect => {
    if (input.type === "resolve-target" && "effects" in input) {
      return {
        type: "enqueue-plan",
        planId: createPlan(registry.targetEffects(
          {
            state,
            sourceId: input.sourceId,
            cardId: input.cardId,
            targetIds: [input.targetId]
          },
          input
        ))
      };
    }
    if (input.type === "enqueue-effects") {
      return {
        type: "enqueue-plan",
        planId: createPlan(input.effects)
      };
    }
    if (input.type === "request-response" && "onAccepted" in input) {
      return {
        type: "request-response",
        sourceId: input.sourceId,
        cardId: input.cardId,
        responderIds: [...input.responderIds],
        ...(input.acceptedDefinitionIds
          ? {
              acceptedDefinitionIds: [
                ...input.acceptedDefinitionIds
              ]
            }
          : {}),
        ...(input.acceptedTags
          ? { acceptedTags: [...input.acceptedTags] }
          : {}),
        responseKind: input.responseKind,
        ...(input.tags ? { tags: [...input.tags] } : {}),
        acceptedPlanId: createPlan(input.onAccepted),
        passedPlanId: createPlan(input.onAllPassed)
      };
    }
    if (input.type === "negatable" && "onResolved" in input) {
      return {
        type: "negatable",
        sourceId: input.sourceId,
        cardId: input.cardId,
        responderIds: [...input.responderIds],
        negated: input.negated,
        resolvedPlanId: createPlan(input.onResolved),
        negatedPlanId: createPlan(input.onNegated ?? [])
      };
    }
    if (input.type === "request-judgment" && "onMatch" in input) {
      return {
        type: "request-judgment",
        playerId: input.playerId,
        cardId: input.cardId,
        reason: input.reason,
        ...(input.delayedCardId
          ? { delayedCardId: input.delayedCardId }
          : {}),
        pattern: structuredClone(input.pattern),
        ...(input.matchedCardDestination
          ? {
              matchedCardDestination:
                structuredClone(input.matchedCardDestination)
            }
          : {}),
        matchedPlanId: createPlan(input.onMatch),
        missedPlanId: createPlan(input.onMiss)
      };
    }
    if (
      input.type === "resolve-judgment-result" &&
      "onMatch" in input
    ) {
      return {
        type: "resolve-judgment-result",
        judgmentId: input.judgmentId,
        playerId: input.playerId,
        cardId: input.cardId,
        judgmentCardId: input.judgmentCardId,
        reason: input.reason,
        ...(input.delayedCardId
          ? { delayedCardId: input.delayedCardId }
          : {}),
        pattern: structuredClone(input.pattern),
        ...(input.matchedCardDestination
          ? {
              matchedCardDestination:
                structuredClone(input.matchedCardDestination)
            }
          : {}),
        matchedPlanId: createPlan(input.onMatch),
        missedPlanId: createPlan(input.onMiss)
      };
    }
    if (
      input.type === "offer-optional-effect" &&
      "onActivate" in input
    ) {
      return {
        type: "offer-optional-effect",
        playerId: input.playerId,
        cardId: input.cardId,
        reason: input.reason,
        activatedPlanId: createPlan(input.onActivate),
        skippedPlanId: createPlan(input.onSkip)
      };
    }
    return structuredClone(input) as Effect;
  };

  function createPlan(
    inputs: readonly (Effect | EffectDraft)[]
  ): EffectPlanId {
    const id = internalId("plan");
    state.effectPlans[id] = {
      id,
      effects: inputs.map((input) => materializeEffect(input))
    };
    return id;
  }

  const referencedPlanIds = (effect: Effect): EffectPlanId[] => {
    if (effect.type === "request-response") {
      return [effect.acceptedPlanId, effect.passedPlanId];
    }
    if (effect.type === "negatable") {
      return [effect.resolvedPlanId, effect.negatedPlanId];
    }
    if (
      effect.type === "request-judgment" ||
      effect.type === "resolve-judgment-result"
    ) {
      return [effect.matchedPlanId, effect.missedPlanId];
    }
    if (effect.type === "resolve-target") return [effect.planId];
    if (effect.type === "enqueue-plan") {
      return [effect.planId, ...(effect.discardPlanIds ?? [])];
    }
    if (effect.type === "discard-plan") return [effect.planId];
    if (effect.type === "offer-optional-effect") {
      return [effect.activatedPlanId, effect.skippedPlanId];
    }
    if (
      effect.type === "offer-judgment-response" ||
      effect.type === "offer-delegated-response" ||
      effect.type === "offer-target-redirection"
    ) {
      return [
        effect.response.acceptedPlanId,
        effect.response.passedPlanId
      ];
    }
    return [];
  };

  const collectPlanGraph = (
    planId: EffectPlanId,
    collected = new Set<EffectPlanId>()
  ): Set<EffectPlanId> => {
    if (collected.has(planId)) return collected;
    collected.add(planId);
    for (const effect of state.effectPlans[planId]?.effects ?? []) {
      for (const childId of referencedPlanIds(effect)) {
        collectPlanGraph(childId, collected);
      }
    }
    return collected;
  };

  const discardPlan = (
    planId: EffectPlanId,
    preserve = new Set<EffectPlanId>()
  ): void => {
    if (preserve.has(planId)) return;
    const plan = state.effectPlans[planId];
    if (!plan) return;
    delete state.effectPlans[planId];
    for (const effect of plan.effects) {
      for (const childId of referencedPlanIds(effect)) {
        discardPlan(childId, preserve);
      }
    }
  };

  const discardOwnedPlans = (effect: Effect): void => {
    if (effect.type === "request-response") {
      discardPlan(effect.acceptedPlanId);
      discardPlan(effect.passedPlanId);
    } else if (effect.type === "negatable") {
      discardPlan(effect.resolvedPlanId);
      discardPlan(effect.negatedPlanId);
    } else if (
      effect.type === "request-judgment" ||
      effect.type === "resolve-judgment-result"
    ) {
      discardPlan(effect.matchedPlanId);
      discardPlan(effect.missedPlanId);
    } else if (effect.type === "resolve-target") {
      discardPlan(effect.planId);
    } else if (effect.type === "offer-optional-effect") {
      discardPlan(effect.activatedPlanId);
      discardPlan(effect.skippedPlanId);
    }
  };

  const semanticTags = (tags: readonly string[] | undefined): string[] =>
    (tags ?? []).filter(
      (tag) =>
        !tag.startsWith("timing:") &&
        !tag.startsWith("engine:")
    );

  const tagPlan = (
    planId: EffectPlanId,
    tags: readonly string[]
  ): void => {
    if (tags.length === 0) return;
    const plan = state.effectPlans[planId];
    if (!plan) return;
    plan.effects = plan.effects.map((effect) => {
      if (effect.type === "resolve-target") {
        tagPlan(effect.planId, tags);
      }
      if (
        effect.type !== "damage" &&
        effect.type !== "draw" &&
        effect.type !== "request-response"
      ) {
        return effect;
      }
      return {
        ...effect,
        tags: [...new Set([...(effect.tags ?? []), ...tags])]
      };
    });
  };

  const emit = (event: EventInput<DomainEvent>): void => {
    const complete = {
      ...event,
      sequence: state.nextSequence++,
      revision: state.revision
    } as DomainEvent;
    events.push(complete);
    state.eventLog.push(complete);
    for (const draft of registry.triggeredEffects(state, complete)) {
      state.triggerQueue.push({
        id: `trigger-${state.nextSequence++}`,
        effect: materializeEffect(draft)
      });
    }
  };

  const findCardZone = (cardId: CardInstanceId): ZoneId => {
    for (const [zoneId, cards] of Object.entries(state.zones)) {
      if (cards.includes(cardId)) return zoneId;
    }
    throw new Error(`card has no zone: ${cardId}`);
  };

  const moveCard = (
    cardId: CardInstanceId,
    to: ZoneId,
    reason: CardMoveReason,
    cause?: CardMoveCause
  ): void => {
    const from = findCardZone(cardId);
    if (from === to) return;
    const source = state.zones[from]!;
    source.splice(source.indexOf(cardId), 1);
    (state.zones[to] ?? (state.zones[to] = [])).push(cardId);
    emit({
      type: "CardMoved",
      cardId,
      from,
      to,
      reason,
      ...(cause ? { cause } : {})
    });
  };

  const pushEffects = (
    effects: readonly (Effect | EffectDraft)[]
  ): void => {
    const materialized = effects.map((effect) =>
      materializeEffect(effect)
    );
    for (let index = materialized.length - 1; index >= 0; index -= 1) {
      state.stack.push({
        id: internalId("frame"),
        effect: materialized[index]!
      });
    }
  };

  const pushPlan = (
    planId: EffectPlanId,
    discardPlanIds: readonly EffectPlanId[] = [],
    inheritedTags: readonly string[] = []
  ): void => {
    tagPlan(planId, inheritedTags);
    const plan = state.effectPlans[planId];
    if (!plan) throw new Error(`unknown effect plan: ${planId}`);
    const preserve = collectPlanGraph(planId);
    delete state.effectPlans[planId];
    for (const discarded of discardPlanIds) {
      discardPlan(discarded, preserve);
    }
    pushEffects(plan.effects);
  };

  const aliveInOrderFrom = (playerId: PlayerId): PlayerId[] => {
    const start = state.turnOrder.indexOf(playerId);
    const ordered =
      start < 0
        ? [...state.turnOrder]
        : [...state.turnOrder.slice(start), ...state.turnOrder.slice(0, start)];
    return ordered.filter((id) => state.players[id]?.alive);
  };

  const rotateAfter = (ids: PlayerId[], playerId: PlayerId): PlayerId[] => {
    const index = ids.indexOf(playerId);
    if (index < 0) return [...ids];
    return [...ids.slice(index + 1), ...ids.slice(0, index + 1)];
  };

  const nextAlivePlayer = (playerId: PlayerId): PlayerId | undefined => {
    const currentIndex = state.turnOrder.indexOf(playerId);
    for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
      const candidate =
        state.turnOrder[(currentIndex + offset) % state.turnOrder.length]!;
      if (state.players[candidate]?.alive) return candidate;
    }
    return undefined;
  };

  const ensureDrawPile = (): void => {
    if ((state.zones[DRAW_PILE]?.length ?? 0) > 0) return;
    const discard = state.zones[DISCARD_PILE] ?? [];
    if (discard.length === 0) return;
    const shuffled = shuffle(discard, state.rngState);
    state.zones[DISCARD_PILE] = [];
    state.zones[DRAW_PILE] = shuffled.items;
    state.rngState = shuffled.state;
    emit({
      type: "DeckReshuffled",
      count: shuffled.items.length,
      rngState: state.rngState
    });
  };

  const endGameIfDecided = (): boolean => {
    const winnerIds = state.turnOrder.filter((id) => state.players[id]?.alive);
    if (winnerIds.length > 1) return false;
    state.phase = "finished";
    if (!state.eventLog.some((event) => event.type === "GameEnded")) {
      emit({ type: "GameEnded", winnerIds });
    }
    return true;
  };

  const finishTurn = (): void => {
    const endedPlayerId = state.currentPlayerId;
    emit({
      type: "TurnEnded",
      playerId: endedPlayerId,
      turnNumber: state.turnNumber
    });
    if (endGameIfDecided()) return;
    const currentIndex = state.turnOrder.indexOf(endedPlayerId);
    let nextPlayerId: PlayerId | undefined;
    for (let offset = 1; offset <= state.turnOrder.length; offset += 1) {
      const candidate =
        state.turnOrder[(currentIndex + offset) % state.turnOrder.length]!;
      if (state.players[candidate]?.alive) {
        nextPlayerId = candidate;
        break;
      }
    }
    if (!nextPlayerId) {
      state.phase = "finished";
      return;
    }
    state.currentPlayerId = nextPlayerId;
    state.turnNumber += 1;
    state.turnUsage[nextPlayerId] = {};
    state.phase = "judgment";
    emit({
      type: "TurnStarted",
      playerId: nextPlayerId,
      turnNumber: state.turnNumber
    });
  };

  const resolveContinuation = (continuation: DecisionContinuation): void => {
    if (continuation.type === "effects") {
      pushPlan(
        continuation.passedPlanId,
        [continuation.acceptedPlanId],
        semanticTags(continuation.tags)
      );
    } else if (continuation.type === "selected-cards") {
      throw new Error("card selection cannot resolve without a selection");
    } else if (continuation.type === "rescue") {
      pushEffects([{
        type: "death",
        playerId: continuation.playerId,
        sourceId: continuation.sourceId,
        cardId: continuation.cardId
      }]);
    } else if (continuation.type === "workflow") {
      throw new Error("workflow decision cannot resolve without an input");
    } else if (continuation.type === "judgment-response") {
      throw new Error("judgment response cannot resolve without an option");
    } else if (continuation.type === "discard-effect-replacement") {
      throw new Error("effect replacement cannot resolve without a decision");
    } else if (continuation.type === "delegated-response") {
      pushEffects([structuredClone(continuation.response)]);
    } else if (continuation.type === "target-redirection") {
      throw new Error("target redirection cannot resolve without a decision");
    } else if (continuation.type === "optional-effect") {
      throw new Error("optional effect cannot resolve without a decision");
    } else if (continuation.negated) {
      pushPlan(
        continuation.negatedPlanId,
        [continuation.resolvedPlanId]
      );
      pushEffects([{
        type: "cancel",
        cardId: continuation.cardId,
        reason: "nullification"
      }]);
    } else {
      pushPlan(
        continuation.resolvedPlanId,
        [continuation.negatedPlanId]
      );
    }
  };

  const resumeWorkflow = (
    resume: WorkflowResume,
    input: WorkflowInput
  ): void => {
    pushEffects([{
      type: "run-workflow",
      workflowId: resume.workflowId,
      context: resume.context,
      data: resume.data,
      input
    }]);
  };

  const requestNextResponder = (
    sourceCardId: CardInstanceId,
    responderIds: PlayerId[],
    acceptedDefinitionIds: string[],
    responseKind: "slash" | "jink" | "nullification" | "peach",
    continuation: DecisionContinuation
  ): void => {
    const eligible = responderIds.filter((id) => state.players[id]?.alive);
    const [playerId, ...remainingResponderIds] = eligible;
    if (!playerId) {
      resolveContinuation(continuation);
      return;
    }
    const request: DecisionRequest = {
      id: internalId("decision"),
      playerId,
      type: "respond-card",
      cardId: sourceCardId,
      acceptedDefinitionIds,
      passAllowed: true,
      responseKind
    };
    state.pendingDecision = {
      request,
      remainingResponderIds,
      continuation
    };
    emit({ type: "DecisionRequested", request });
  };

  const requestNextRescuer = (
    responderIds: PlayerId[],
    continuation: Extract<DecisionContinuation, { type: "rescue" }>
  ): void => {
    const eligible = responderIds.filter((id) => state.players[id]?.alive);
    const [playerId, ...remainingResponderIds] = eligible;
    if (!playerId) {
      resolveContinuation(continuation);
      return;
    }
    const acceptedDefinitionIds = [
      ...registry.cardDefinitionIdsWithTag("response:peach"),
      ...(playerId === continuation.playerId
        ? registry.cardDefinitionIdsWithTag("response:self-rescue")
        : [])
    ];
    const request: DecisionRequest = {
      id: internalId("decision"),
      playerId,
      type: "respond-card",
      cardId: continuation.cardId,
      acceptedDefinitionIds: [...new Set(acceptedDefinitionIds)],
      passAllowed: true,
      responseKind: "peach"
    };
    state.pendingDecision = {
      request,
      remainingResponderIds,
      continuation
    };
    emit({ type: "DecisionRequested", request });
  };

  const resolveUntilDecision = (): void => {
    while (
      !state.pendingDecision &&
      (state.triggerQueue.length > 0 || state.stack.length > 0)
    ) {
      const fromTriggerQueue = state.triggerQueue.length > 0;
      const frame = fromTriggerQueue
        ? state.triggerQueue.shift()!
        : state.stack.pop()!;
      if (frame.timing?.point !== "before-effect") {
        const resolution = registry.resolveTiming(state, {
          point: "before-effect",
          intent: {
            type: "effect",
            effect: frame.effect
          }
        });
        if (resolution.effects.length === 0) {
          discardOwnedPlans(frame.effect);
          continue;
        }
        if (resolution.effects.length > 1) {
          const frames = resolution.effects.map((effect) => ({
            id: internalId("frame"),
            effect: materializeEffect(effect),
            timing: {
              point: "before-effect" as const,
              appliedRuleIds: [...resolution.appliedRuleIds]
            }
          }));
          if (fromTriggerQueue) {
            state.triggerQueue.unshift(...frames);
          } else {
            for (let index = frames.length - 1; index >= 0; index -= 1) {
              state.stack.push(frames[index]!);
            }
          }
          continue;
        }
        frame.effect = materializeEffect(resolution.effects[0]!);
        frame.timing = {
          point: "before-effect",
          appliedRuleIds: [...resolution.appliedRuleIds]
        };
      }
      const effect = frame.effect;
      switch (effect.type) {
        case "offer-optional-effect": {
          const request: DecisionRequest = {
            id: internalId("decision"),
            type: "choose-option",
            playerId: effect.playerId,
            cardId: effect.cardId,
            options: ["skip", "activate"],
            reason: effect.reason
          };
          state.pendingDecision = {
            request,
            remainingResponderIds: [],
            continuation: {
              type: "optional-effect",
              playerId: effect.playerId,
              cardId: effect.cardId,
              reason: effect.reason,
              activatedPlanId: effect.activatedPlanId,
              skippedPlanId: effect.skippedPlanId
            }
          };
          emit({ type: "DecisionRequested", request });
          break;
        }
        case "offer-target-redirection": {
          if (
            !state.players[effect.playerId]?.alive ||
            effect.selectableCardIds.length === 0 ||
            effect.selectablePlayerIds.length === 0
          ) {
            pushEffects([effect.response]);
            break;
          }
          if (effect.stage === "target") {
            const request: DecisionRequest = {
              id: internalId("decision"),
              type: "select-players",
              playerId: effect.playerId,
              cardId: effect.cardId,
              selectablePlayerIds: [...effect.selectablePlayerIds],
              minimum: 1,
              maximum: 1,
              reason: `${effect.reason}-target`
            };
            state.pendingDecision = {
              request,
              remainingResponderIds: [],
              continuation: {
                type: "target-redirection",
                stage: "target",
                playerId: effect.playerId,
                sourceId: effect.sourceId,
                cardId: effect.cardId,
                selectableCardIds: [...effect.selectableCardIds],
                selectablePlayerIds: [...effect.selectablePlayerIds],
                reason: effect.reason,
                response: structuredClone(effect.response),
                ...(effect.selectedCardId
                  ? { selectedCardId: effect.selectedCardId }
                  : {})
              }
            };
            emit({ type: "DecisionRequested", request });
            break;
          }
          const request: DecisionRequest = {
            id: internalId("decision"),
            type: "choose-option",
            playerId: effect.playerId,
            cardId: effect.cardId,
            options: ["skip", "activate"],
            reason: effect.reason
          };
          state.pendingDecision = {
            request,
            remainingResponderIds: [],
            continuation: {
              type: "target-redirection",
              stage: "offer",
              playerId: effect.playerId,
              sourceId: effect.sourceId,
              cardId: effect.cardId,
              selectableCardIds: [...effect.selectableCardIds],
              selectablePlayerIds: [...effect.selectablePlayerIds],
              reason: effect.reason,
              response: structuredClone(effect.response)
            }
          };
          emit({ type: "DecisionRequested", request });
          break;
        }
        case "offer-delegated-response": {
          const allyIds = state.turnOrder.filter((playerId) => {
            if (
              playerId === effect.playerId ||
              !state.players[playerId]?.alive
            ) {
              return false;
            }
            const heroId = state.players[playerId]?.heroDefinitionId;
            if (!heroId) return false;
            try {
              return registry.hero(heroId).kingdom === effect.kingdom;
            } catch {
              return false;
            }
          });
          if (
            !state.players[effect.playerId]?.alive ||
            allyIds.length === 0
          ) {
            pushEffects([effect.response]);
            break;
          }
          const request: DecisionRequest = {
            id: internalId("decision"),
            type: "choose-option",
            playerId: effect.playerId,
            cardId: effect.cardId,
            options: ["skip", "activate"],
            reason: effect.reason
          };
          state.pendingDecision = {
            request,
            remainingResponderIds: [],
            continuation: {
              type: "delegated-response",
              stage: "offer",
              playerId: effect.playerId,
              allyIds,
              reason: effect.reason,
              response: structuredClone(effect.response)
            }
          };
          emit({ type: "DecisionRequested", request });
          break;
        }
        case "offer-discard-effect-replacement": {
          if (!state.players[effect.playerId]?.alive) {
            pushEffects([effect.replacedEffect]);
            break;
          }
          const request: DecisionRequest = {
            id: internalId("decision"),
            type: "choose-option",
            playerId: effect.playerId,
            cardId: effect.cardId,
            options: ["skip", "activate"],
            reason: effect.reason
          };
          state.pendingDecision = {
            request,
            remainingResponderIds: [],
            continuation: {
              type: "discard-effect-replacement",
              stage: "offer",
              playerId: effect.playerId,
              cardId: effect.cardId,
              selectableCardIds: [...effect.selectableCardIds],
              count: effect.count,
              reason: effect.reason,
              replacedEffect: structuredClone(effect.replacedEffect)
            }
          };
          emit({ type: "DecisionRequested", request });
          break;
        }
        case "offer-judgment-response": {
          if (!state.players[effect.playerId]?.alive) {
            pushEffects([effect.response]);
            break;
          }
          const request: DecisionRequest = {
            id: internalId("decision"),
            type: "choose-option",
            playerId: effect.playerId,
            cardId: effect.cardId,
            options: ["skip", "activate"],
            reason: effect.reason
          };
          state.pendingDecision = {
            request,
            remainingResponderIds: [],
            continuation: {
              type: "judgment-response",
              playerId: effect.playerId,
              cardId: effect.cardId,
              reason: effect.reason,
              pattern: structuredClone(effect.pattern),
              response: structuredClone(effect.response)
            }
          };
          emit({ type: "DecisionRequested", request });
          break;
        }
        case "request-response":
          {
            const firstResponderId = effect.responderIds.find(
              (id) => state.players[id]?.alive
            );
          requestNextResponder(
            effect.cardId,
            effect.responderIds,
            [...new Set([
              ...(effect.acceptedDefinitionIds ?? []),
              ...(effect.acceptedTags ?? []).flatMap((tag) =>
                registry.cardDefinitionIdsWithTag(tag)
              )
            ])],
            effect.responseKind,
            {
              type: "effects",
              acceptedPlanId: effect.acceptedPlanId,
              passedPlanId: effect.passedPlanId,
              ...(effect.tags ? { tags: [...effect.tags] } : {}),
              ...(firstResponderId
                ? {
                    remainingResponses: registry.responseCount(
                      state,
                      effect.sourceId,
                      firstResponderId,
                      effect.cardId,
                      effect.responseKind
                    )
                  }
                : {})
            }
          );
          }
          break;
        case "negatable":
          requestNextResponder(
            effect.cardId,
            effect.responderIds,
            registry.cardDefinitionIdsWithTag("response:nullification"),
            "nullification",
            {
              type: "nullification",
              sourceId: effect.sourceId,
              cardId: effect.cardId,
              responderIds: effect.responderIds,
              negated: effect.negated,
              resolvedPlanId: effect.resolvedPlanId,
              negatedPlanId: effect.negatedPlanId
            }
          );
          break;
        case "damage": {
          const target = state.players[effect.targetId];
          if (!target?.alive) break;
          target.hp -= effect.amount;
          emit({
            type: "DamageApplied",
            sourceId: effect.sourceId,
            targetId: effect.targetId,
            amount: effect.amount,
            cardId: effect.cardId,
            nature: effect.nature ?? "normal"
          });
          if (target.hp <= 0) {
            pushEffects([{
              type: "dying-check",
              playerId: effect.targetId,
              sourceId: effect.sourceId,
              cardId: effect.cardId
            }]);
          }
          if (
            effect.nature !== undefined &&
            effect.nature !== "normal" &&
            !effect.propagated &&
            target.marks.chained === true
          ) {
            const nature = effect.nature;
            const chainedPlayerIds = state.turnOrder.filter(
              (playerId) =>
                state.players[playerId]?.alive &&
                state.players[playerId]?.marks.chained === true
            );
            for (const playerId of chainedPlayerIds) {
              state.players[playerId]!.marks.chained = false;
              emit({
                type: "ChainChanged",
                playerId,
                chained: false,
                cardId: effect.cardId
              });
            }
            pushEffects(
              chainedPlayerIds
                .filter((playerId) => playerId !== effect.targetId)
                .map((playerId) => ({
                  type: "damage",
                  sourceId: effect.sourceId,
                  targetId: playerId,
                  amount: effect.amount,
                  cardId: effect.cardId,
                  nature,
                  propagated: true
                }))
            );
          }
          break;
        }
        case "recover": {
          const player = state.players[effect.playerId];
          if (!player?.alive) break;
          const amount = Math.min(effect.amount, player.maxHp - player.hp);
          if (amount > 0) {
            player.hp += amount;
            emit({
              type: "HpRecovered",
              playerId: effect.playerId,
              amount,
              cardId: effect.cardId,
              ...(effect.sourceId === undefined
                ? {}
                : { sourceId: effect.sourceId })
            });
          }
          break;
        }
        case "lose-hp": {
          const player = state.players[effect.playerId];
          if (!player?.alive) break;
          player.hp -= effect.amount;
          emit({
            type: "HpLost",
            playerId: effect.playerId,
            amount: effect.amount,
            cardId: effect.cardId
          });
          if (player.hp <= 0) {
            pushEffects([{
              type: "dying-check",
              playerId: effect.playerId,
              sourceId: null,
              cardId: effect.cardId
            }]);
          }
          break;
        }
        case "increment-turn-usage": {
          const usage = state.turnUsage[effect.playerId] ??
            (state.turnUsage[effect.playerId] = {});
          usage[effect.key] = (usage[effect.key] ?? 0) + effect.amount;
          break;
        }
        case "draw": {
          let count = 0;
          for (let index = 0; index < effect.count; index += 1) {
            ensureDrawPile();
            const next = state.zones[DRAW_PILE]?.[0];
            if (!next) break;
            moveCard(next, handZone(effect.playerId), "draw");
            count += 1;
          }
          emit({
            type: "CardsDrawn",
            playerId: effect.playerId,
            count,
            cardId: effect.cardId
          });
          break;
        }
        case "move-card":
          if (state.cards[effect.cardId]) {
            moveCard(
              effect.cardId,
              effect.toZoneId,
              effect.reason,
              effect.cause
            );
          }
          break;
        case "place-delayed": {
          const card = state.cards[effect.cardId];
          if (!card) break;
          card.sourcePlayerId ??= state.currentPlayerId;
          moveCard(effect.cardId, judgmentZone(effect.playerId), "delayed");
          emit({
            type: "DelayedCardPlaced",
            playerId: effect.playerId,
            cardId: effect.cardId
          });
          break;
        }
        case "resolve-delayed": {
          if (!state.cards[effect.cardId]) break;
          pushEffects(registry.beginDelayedResolution(
            state,
            effect.playerId,
            effect.cardId
          ));
          break;
        }
        case "perform-judgment": {
          const delayedCard = state.cards[effect.delayedCardId];
          const definition = delayedCard
            ? registry.card(delayedCard.definitionId)
            : undefined;
          if (!delayedCard || !definition?.delayed) break;
          const onMatch: EffectDraft[] = [{
            type: "move-card",
            cardId: effect.delayedCardId,
            toZoneId: DISCARD_PILE,
            reason: "resolve"
          }, ...registry.delayedEffects({
            state,
            sourceId: delayedCard.sourcePlayerId ?? effect.playerId,
            cardId: effect.delayedCardId,
            targetIds: [effect.playerId]
          })];
          const onMiss: EffectDraft[] = [];
          if (definition.delayed.onMiss === "pass-to-next") {
            const nextPlayerId = nextAlivePlayer(effect.playerId);
            if (nextPlayerId) {
              onMiss.push({
                type: "place-delayed",
                playerId: nextPlayerId,
                cardId: effect.delayedCardId
              });
            }
          } else {
            onMiss.push({
              type: "move-card",
              cardId: effect.delayedCardId,
              toZoneId: DISCARD_PILE,
              reason: "resolve"
            });
          }
          pushEffects([{
            type: "request-judgment",
            playerId: effect.playerId,
            cardId: effect.delayedCardId,
            delayedCardId: effect.delayedCardId,
            reason: definition.id,
            pattern: structuredClone(definition.delayed.judgment),
            onMatch,
            onMiss
          }]);
          break;
        }
        case "request-judgment": {
          ensureDrawPile();
          const judgmentCardId = state.zones[DRAW_PILE]?.[0];
          if (!judgmentCardId) {
            throw new Error("cannot perform judgment with an empty deck");
          }
          const judgmentCard = state.cards[judgmentCardId]!;
          if (
            judgmentCard.suit === undefined ||
            judgmentCard.rank === undefined
          ) {
            throw new Error(
              `judgment card lacks suit or rank: ${judgmentCardId}`
            );
          }
          const judgmentId = internalId("judgment");
          moveCard(judgmentCardId, PROCESSING_ZONE, "judge");
          pushEffects([{
            type: "resolve-judgment-result",
            judgmentId,
            playerId: effect.playerId,
            cardId: effect.cardId,
            judgmentCardId,
            reason: effect.reason,
            ...(effect.delayedCardId
              ? { delayedCardId: effect.delayedCardId }
              : {}),
            pattern: structuredClone(effect.pattern),
            ...(effect.matchedCardDestination
              ? {
                  matchedCardDestination:
                    structuredClone(effect.matchedCardDestination)
                }
              : {}),
            matchedPlanId: effect.matchedPlanId,
            missedPlanId: effect.missedPlanId
          }]);
          emit({
            type: "JudgmentRevealed",
            judgmentId,
            playerId: effect.playerId,
            reasonCardId: effect.cardId,
            ...(effect.delayedCardId
              ? { delayedCardId: effect.delayedCardId }
              : {}),
            judgmentCardId,
            suit: registry.effectiveCardSuit(
              state,
              judgmentCardId,
              effect.playerId
            ) ?? judgmentCard.suit,
            rank: judgmentCard.rank
          });
          break;
        }
        case "resolve-judgment-result": {
          const judgmentCard = state.cards[effect.judgmentCardId];
          if (
            !judgmentCard ||
            judgmentCard.suit === undefined ||
            judgmentCard.rank === undefined
          ) {
            throw new Error(
              `judgment card lacks suit or rank: ${effect.judgmentCardId}`
            );
          }
          const pattern = effect.pattern;
          const effectiveSuit = registry.effectiveCardSuit(
            state,
            effect.judgmentCardId,
            effect.playerId
          ) ?? judgmentCard.suit;
          const matched = (
            (
              pattern.includedSuits === undefined ||
              pattern.includedSuits.includes(effectiveSuit)
            ) &&
            !pattern.excludedSuits?.includes(effectiveSuit) &&
            (
              pattern.minimumRank === undefined ||
              judgmentCard.rank >= pattern.minimumRank
            ) &&
            (
              pattern.maximumRank === undefined ||
              judgmentCard.rank <= pattern.maximumRank
            )
          );
          emit({
            type: "JudgmentResolved",
            judgmentId: effect.judgmentId,
            playerId: effect.playerId,
            reasonCardId: effect.cardId,
            ...(effect.delayedCardId
              ? { delayedCardId: effect.delayedCardId }
              : {}),
            judgmentCardId: effect.judgmentCardId,
            matched
          });
          const selectedPlanId = matched
            ? effect.matchedPlanId
            : effect.missedPlanId;
          const discardedPlanId = matched
            ? effect.missedPlanId
            : effect.matchedPlanId;
          pushPlan(selectedPlanId, [discardedPlanId]);
          pushEffects([{
            type: "move-card",
            cardId: effect.judgmentCardId,
            toZoneId:
              matched && effect.matchedCardDestination
                ? effect.matchedCardDestination.toZoneId
                : DISCARD_PILE,
            reason:
              matched && effect.matchedCardDestination
                ? effect.matchedCardDestination.reason
                : "resolve",
            cause: {
              type: "judgment",
              playerId: effect.playerId,
              reasonCardId: effect.cardId,
              ...(effect.delayedCardId
                ? { delayedCardId: effect.delayedCardId }
                : {})
            }
          }]);
          break;
        }
        case "replace-judgment-card": {
          const frame = [...state.stack].reverse().find(
            (candidate) =>
              candidate.effect.type === "resolve-judgment-result" &&
              candidate.effect.judgmentId === effect.judgmentId
          );
          if (!frame || frame.effect.type !== "resolve-judgment-result") {
            throw new Error(`judgment is no longer pending: ${effect.judgmentId}`);
          }
          const oldCardId = frame.effect.judgmentCardId;
          moveCard(
            oldCardId,
            effect.oldCardDestination?.toZoneId ?? DISCARD_PILE,
            effect.oldCardDestination?.reason ?? "resolve"
          );
          moveCard(effect.replacementCardId, PROCESSING_ZONE, "judge");
          frame.effect.judgmentCardId = effect.replacementCardId;
          emit({
            type: "JudgmentCardReplaced",
            judgmentId: effect.judgmentId,
            playerId: effect.playerId,
            oldCardId,
            newCardId: effect.replacementCardId
          });
          break;
        }
        case "change-phase": {
          const from = state.phase;
          state.phase = effect.to;
          emit({
            type: "PhaseChanged",
            playerId: effect.playerId,
            from,
            to: effect.to
          });
          break;
        }
        case "take-top-cards": {
          state.zones[effect.toZoneId] ??= [];
          const revealedCardIds: CardInstanceId[] = [];
          for (let index = 0; index < effect.count; index += 1) {
            ensureDrawPile();
            const nextCardId = state.zones[DRAW_PILE]?.[0];
            if (!nextCardId) break;
            moveCard(nextCardId, effect.toZoneId, "reveal");
            revealedCardIds.push(nextCardId);
          }
          emit({
            type: "CardsRevealed",
            cardId: effect.cardId,
            revealedCardIds,
            reason: effect.reason
          });
          pushEffects([{
            type: "run-workflow",
            workflowId: effect.resume.workflowId,
            context: effect.resume.context,
            data: effect.resume.data,
            input: {
              type: "cards-taken",
              cardIds: revealedCardIds
            }
          }]);
          break;
        }
        case "reorder-draw-pile": {
          const arrangedCardIds = [
            ...effect.topCardIds,
            ...effect.bottomCardIds
          ];
          for (const cardId of arrangedCardIds) {
            moveCard(cardId, DRAW_PILE, "resolve");
          }
          const arranged = new Set(arrangedCardIds);
          const middle = (state.zones[DRAW_PILE] ?? []).filter(
            (cardId) => !arranged.has(cardId)
          );
          state.zones[DRAW_PILE] = [
            ...effect.topCardIds,
            ...middle,
            ...effect.bottomCardIds
          ];
          emit({
            type: "CardsArranged",
            playerId: effect.playerId,
            cardId: effect.cardId,
            count: arrangedCardIds.length,
            reason: effect.reason
          });
          break;
        }
        case "reveal-card":
          emit({
            type: "CardRevealed",
            playerId: effect.playerId,
            cardId: effect.cardId,
            reason: effect.reason
          });
          break;
        case "apply-card": {
          const card = state.cards[effect.cardId];
          if (!card) break;
          pushEffects(registry.cardEffects({
            state,
            sourceId: effect.sourceId,
            cardId: effect.cardId,
            targetIds: effect.targetIds
          }));
          break;
        }
        case "enqueue-plan":
          pushPlan(effect.planId, effect.discardPlanIds ?? []);
          break;
        case "discard-plan":
          discardPlan(effect.planId);
          break;
        case "resolve-target":
          pushPlan(effect.planId);
          break;
        case "redirect-target":
          emit({
            type: "TargetRedirected",
            playerId: effect.sourceId,
            cardId: effect.cardId,
            fromId: effect.fromId,
            toId: effect.toId
          });
          pushEffects([
            {
              type: "apply-card",
              sourceId: effect.sourceId,
              cardId: effect.cardId,
              targetIds: [effect.toId]
            }
          ]);
          break;
        case "use-card-definition": {
          const cardId = internalId("virtual-card");
          state.cards[cardId] = {
            id: cardId,
            definitionId: effect.definitionId,
            virtual: true,
            materialCardIds: [],
            sourcePlayerId: effect.sourceId
          };
          state.zones[PROCESSING_ZONE]!.push(cardId);
          const definition = registry.card(effect.definitionId);
          const usageKey = definition.usageKey ?? definition.id;
          const usage = state.turnUsage[effect.sourceId] ??
            (state.turnUsage[effect.sourceId] = {});
          usage[usageKey] = (usage[usageKey] ?? 0) + 1;
          emit({
            type: "CardUsed",
            playerId: effect.sourceId,
            cardId,
            targetIds: effect.targetIds,
            ...(effect.skillId ? { skillId: effect.skillId } : {})
          });
          emit({
            type: "TargetsConfirmed",
            playerId: effect.sourceId,
            cardId,
            targetIds: effect.targetIds
          });
          pushEffects([{ type: "finish-card", cardId }]);
          pushEffects(registry.cardEffects({
            state,
            sourceId: effect.sourceId,
            cardId,
            targetIds: effect.targetIds
          }));
          break;
        }
        case "use-card-instance": {
          const card = state.cards[effect.cardId];
          if (!card) break;
          card.sourcePlayerId = effect.sourceId;
          moveCard(effect.cardId, PROCESSING_ZONE, "use");
          const definition = registry.card(card.definitionId);
          const usageKey = definition.usageKey ?? definition.id;
          const usage = state.turnUsage[effect.sourceId] ??
            (state.turnUsage[effect.sourceId] = {});
          usage[usageKey] = (usage[usageKey] ?? 0) + 1;
          emit({
            type: "CardUsed",
            playerId: effect.sourceId,
            cardId: effect.cardId,
            targetIds: effect.targetIds,
            ...(effect.skillId ? { skillId: effect.skillId } : {})
          });
          emit({
            type: "TargetsConfirmed",
            playerId: effect.sourceId,
            cardId: effect.cardId,
            targetIds: effect.targetIds
          });
          pushEffects([{ type: "finish-card", cardId: effect.cardId }]);
          pushEffects(registry.cardEffects({
            state,
            sourceId: effect.sourceId,
            cardId: effect.cardId,
            targetIds: effect.targetIds
          }));
          break;
        }
        case "run-workflow": {
          const workflow = registry.workflow(effect.workflowId);
          const result = workflow.run({
            state: cloneGameState(state),
            context: structuredClone(effect.context),
            data: structuredClone(effect.data),
            ...(effect.input === undefined
              ? {}
              : { input: structuredClone(effect.input) }),
            cardDefinition: (id) => registry.card(id),
            heroDefinition: (id) => registry.hero(id),
            cardDefinitionIdsWithTag: (tag) =>
              registry.cardDefinitionIdsWithTag(tag),
            effectiveCardSuit: (cardId, ownerId) =>
              registry.effectiveCardSuit(state, cardId, ownerId),
            canTargetDefinition: (sourceId, definitionId, targetId) =>
              registry.targetSets(state, sourceId, definitionId).some(
                (targetIds) =>
                  targetIds.length === 1 && targetIds[0] === targetId
              )
          });
          if (result.effects && result.decision) {
            throw new Error(
              `workflow ${effect.workflowId} returned effects and a decision`
            );
          }
          if (result.decision) {
            const responseDecision = result.decision.type === "respond-card"
              ? result.decision
              : undefined;
            const request: DecisionRequest = responseDecision
              ? {
                  type: "respond-card",
                  id: internalId("decision"),
                  playerId: responseDecision.playerId,
                  cardId: responseDecision.cardId,
                  acceptedDefinitionIds:
                    responseDecision.acceptedDefinitionIds,
                  passAllowed: true,
                  responseKind: responseDecision.responseKind
                }
              : {
                  ...result.decision,
                  id: internalId("decision")
                };
            const remainingResponses = responseDecision
              ? registry.responseCount(
                  state,
                  effect.context.sourceId,
                  responseDecision.opponentId,
                  responseDecision.cardId,
                  responseDecision.responseKind === "nullification"
                    ? "jink"
                    : responseDecision.responseKind
                )
              : 1;
            state.pendingDecision = {
              request,
              remainingResponderIds: [],
              continuation: {
                type: "workflow",
                resume: {
                  workflowId: effect.workflowId,
                  context: effect.context,
                  data: result.resumeData ?? effect.data
                },
                ...(remainingResponses > 1
                  ? { remainingResponses }
                  : {})
              }
            };
            emit({ type: "DecisionRequested", request });
          } else {
            pushEffects(result.effects ?? []);
          }
          break;
        }
        case "set-mark": {
          const player = state.players[effect.playerId];
          if (!player?.alive) break;
          player.marks[effect.mark] = effect.value;
          emit({
            type: "PlayerMarkChanged",
            playerId: effect.playerId,
            mark: effect.mark,
            value: effect.value,
            cardId: effect.cardId
          });
          break;
        }
        case "toggle-chain": {
          const player = state.players[effect.playerId];
          if (!player?.alive) break;
          const chained = player.marks.chained !== true;
          player.marks.chained = chained;
          emit({
            type: "ChainChanged",
            playerId: effect.playerId,
            chained,
            cardId: effect.cardId
          });
          break;
        }
        case "equip": {
          const equipment = state.zones[equipmentZone(effect.playerId)] ?? [];
          const replacedCardId = equipment.find((equippedCardId) => {
            const definitionId = state.cards[equippedCardId]?.definitionId;
            return definitionId
              ? registry.card(definitionId).equipment?.slot === effect.slot
              : false;
          }) ?? null;
          if (replacedCardId) {
            moveCard(replacedCardId, DISCARD_PILE, "resolve");
          }
          moveCard(effect.cardId, equipmentZone(effect.playerId), "resolve");
          emit({
            type: "EquipmentChanged",
            playerId: effect.playerId,
            slot: effect.slot,
            equippedCardId: effect.cardId,
            replacedCardId
          });
          break;
        }
        case "request-card-selection": {
          const request: DecisionRequest = {
            id: internalId("decision"),
            playerId: effect.chooserId,
            type: "select-cards",
            cardId: effect.cardId,
            selectableCardIds: [...effect.selectableCardIds],
            minimum: effect.minimum,
            maximum: effect.maximum,
            reason: effect.reason
          };
          state.pendingDecision = {
            request,
            remainingResponderIds: [],
            continuation: {
              type: "selected-cards",
              destination: effect.destination,
              reason: effect.reason,
              moveReason: effect.moveReason
            }
          };
          emit({ type: "DecisionRequested", request });
          break;
        }
        case "dying-check": {
          const player = state.players[effect.playerId];
          if (!player?.alive) break;
          if (player.hp > 0) {
            if (player.dying) {
              player.dying = false;
              emit({
                type: "PlayerRescued",
                playerId: effect.playerId,
                hp: player.hp
              });
            }
            break;
          }
          if (!player.dying) {
            player.dying = true;
            emit({
              type: "DyingStarted",
              playerId: effect.playerId,
              sourceId: effect.sourceId
            });
          }
          requestNextRescuer(aliveInOrderFrom(effect.playerId), {
            type: "rescue",
            playerId: effect.playerId,
            sourceId: effect.sourceId,
            cardId: effect.cardId
          });
          break;
        }
        case "death": {
          const player = state.players[effect.playerId];
          if (!player?.alive || player.hp > 0) break;
          player.alive = false;
          player.dying = false;
          emit({
            type: "PlayerDied",
            playerId: effect.playerId,
            sourceId: effect.sourceId
          });
          const ownedCards = [
            ...(state.zones[handZone(effect.playerId)] ?? []),
            ...(state.zones[equipmentZone(effect.playerId)] ?? []),
            ...(state.zones[judgmentZone(effect.playerId)] ?? [])
          ];
          for (const cardId of ownedCards) moveCard(cardId, DISCARD_PILE, "death");
          if (!endGameIfDecided() && effect.playerId === state.currentPlayerId) {
            finishTurn();
          }
          break;
        }
        case "cancel":
          emit({
            type: "CardCancelled",
            cardId: effect.cardId,
            reason: effect.reason,
            ...(effect.sourceId ? { sourceId: effect.sourceId } : {}),
            ...(effect.targetId ? { targetId: effect.targetId } : {})
          });
          break;
        case "finish-card":
          if (state.cards[effect.cardId]?.virtual) {
            const virtual = state.cards[effect.cardId]!;
            for (const materialCardId of virtual.materialCardIds ?? []) {
              if ((state.zones[PROCESSING_ZONE] ?? []).includes(materialCardId)) {
                moveCard(materialCardId, DISCARD_PILE, "resolve");
              }
            }
            const processing = state.zones[PROCESSING_ZONE] ?? [];
            processing.splice(processing.indexOf(effect.cardId), 1);
            delete state.cards[effect.cardId];
          } else if ((state.zones[PROCESSING_ZONE] ?? []).includes(effect.cardId)) {
            moveCard(effect.cardId, DISCARD_PILE, "resolve");
          }
          break;
      }
    }
  };

  const changePhase = (to: Phase): void => {
    const from = state.phase;
    state.phase = to;
    emit({
      type: "PhaseChanged",
      playerId: state.currentPlayerId,
      from,
      to
    });
  };

  const resolveAcceptedResponse = (
    pending: NonNullable<GameState["pendingDecision"]>,
    responseCardId: CardInstanceId,
    playerId: PlayerId
  ): void => {
    if (pending.continuation.type === "effects") {
      const remaining = pending.continuation.remainingResponses ?? 1;
      if (remaining > 1) {
        requestNextResponder(
          pending.request.cardId,
          [playerId],
          pending.request.type === "respond-card"
            ? pending.request.acceptedDefinitionIds
            : [],
          pending.request.type === "respond-card"
            ? pending.request.responseKind
            : "jink",
          {
            ...pending.continuation,
            remainingResponses: remaining - 1
          }
        );
      } else {
        pushPlan(
          pending.continuation.acceptedPlanId,
          [pending.continuation.passedPlanId],
          semanticTags(pending.continuation.tags)
        );
      }
    } else if (pending.continuation.type === "rescue") {
      pushEffects([
        {
          type: "recover",
          playerId: pending.continuation.playerId,
          amount: 1,
          cardId: responseCardId,
          sourceId: playerId
        },
        {
          type: "dying-check",
          playerId: pending.continuation.playerId,
          sourceId: pending.continuation.sourceId,
          cardId: pending.continuation.cardId
        }
      ]);
    } else if (pending.continuation.type === "workflow") {
      const remaining = pending.continuation.remainingResponses ?? 1;
      if (remaining > 1) {
        requestNextResponder(
          pending.request.cardId,
          [playerId],
          pending.request.type === "respond-card"
            ? pending.request.acceptedDefinitionIds
            : [],
          pending.request.type === "respond-card"
            ? pending.request.responseKind
            : "slash",
          {
            ...pending.continuation,
            remainingResponses: remaining - 1
          }
        );
      } else {
        resumeWorkflow(pending.continuation.resume, {
          type: "responded",
          playerId,
          cardId: responseCardId
        });
      }
    } else if (pending.continuation.type === "delegated-response") {
      pushPlan(
        pending.continuation.response.acceptedPlanId,
        [pending.continuation.response.passedPlanId],
        semanticTags(pending.continuation.response.tags)
      );
    } else if (pending.continuation.type === "nullification") {
      pushEffects([{
        type: "negatable",
        sourceId: pending.continuation.sourceId,
        cardId: pending.continuation.cardId,
        responderIds: rotateAfter(
          pending.continuation.responderIds,
          playerId
        ),
        negated: !pending.continuation.negated,
        resolvedPlanId: pending.continuation.resolvedPlanId,
        negatedPlanId: pending.continuation.negatedPlanId
      }]);
    } else {
      throw new Error("response decision has a selection continuation");
    }
  };

  if (command.type === "use-card" || command.type === "use-virtual-card") {
    let cardId: CardInstanceId;
    let definitionId: string;
    let skillId: string | undefined;
    let materialCardIds: CardInstanceId[] | undefined;
    if (command.type === "use-card") {
      cardId = command.cardId;
      definitionId = state.cards[cardId]!.definitionId;
      state.cards[cardId]!.sourcePlayerId = command.playerId;
      moveCard(cardId, PROCESSING_ZONE, "use");
    } else {
      cardId = internalId("virtual-card");
      definitionId = command.definitionId;
      skillId = command.skillId;
      materialCardIds = [...command.materialCardIds];
      for (const materialCardId of materialCardIds) {
        moveCard(materialCardId, PROCESSING_ZONE, "use");
      }
      state.cards[cardId] = {
        id: cardId,
        definitionId,
        virtual: true,
        materialCardIds,
        sourcePlayerId: command.playerId,
        ...(materialCardIds.length === 1 &&
        state.cards[materialCardIds[0]!]?.suit !== undefined
          ? { suit: state.cards[materialCardIds[0]!]!.suit }
          : {}),
        ...(materialCardIds.length === 1 &&
        state.cards[materialCardIds[0]!]?.rank !== undefined
          ? { rank: state.cards[materialCardIds[0]!]!.rank }
          : {})
      };
      state.zones[PROCESSING_ZONE]!.push(cardId);
    }
    const definition = registry.card(definitionId);
    const usageKey = definition.usageKey ?? definition.id;
    const usage = state.turnUsage[command.playerId] ??
      (state.turnUsage[command.playerId] = {});
    usage[usageKey] = (usage[usageKey] ?? 0) + 1;
    emit({
      type: "CardUsed",
      playerId: command.playerId,
      cardId,
      targetIds: command.targetIds,
      ...(skillId === undefined ? {} : { skillId }),
      ...(materialCardIds === undefined ? {} : { materialCardIds })
    });
    emit({
      type: "TargetsConfirmed",
      playerId: command.playerId,
      cardId,
      targetIds: command.targetIds
    });
    pushEffects([{ type: "finish-card", cardId }]);
    pushEffects(registry.cardEffects({
      state,
      sourceId: command.playerId,
      cardId,
      targetIds: command.targetIds
    }));
    resolveUntilDecision();
  } else if (command.type === "activate-skill") {
    registry.skill(command.skillId);
    const activationId = internalId("skill-activation");
    const materialCardIds = [...command.materialCardIds];
    for (const materialCardId of materialCardIds) {
      moveCard(materialCardId, PROCESSING_ZONE, "use");
    }
    state.cards[activationId] = {
      id: activationId,
      definitionId: `skill:${command.skillId}`,
      virtual: true,
      materialCardIds,
      sourcePlayerId: command.playerId
    };
    state.zones[PROCESSING_ZONE]!.push(activationId);
    const usage = state.turnUsage[command.playerId] ??
      (state.turnUsage[command.playerId] = {});
    usage[command.skillId] = (usage[command.skillId] ?? 0) + 1;
    emit({
      type: "SkillActivated",
      playerId: command.playerId,
      skillId: command.skillId,
      activationId,
      materialCardIds,
      targetIds: command.targetIds
    });
    pushEffects([{ type: "finish-card", cardId: activationId }]);
    pushEffects(registry.skillActivationEffects({
      state,
      sourceId: command.playerId,
      cardId: activationId,
      targetIds: command.targetIds,
      skillId: command.skillId,
      materialCardIds
    }));
    resolveUntilDecision();
  } else if (command.type === "respond-card") {
    const pending = state.pendingDecision!;
    if (pending.request.type !== "respond-card") {
      throw new Error("response command used for a selection decision");
    }
    state.cards[command.cardId]!.sourcePlayerId = command.playerId;
    moveCard(command.cardId, DISCARD_PILE, "respond");
    emit({
      type: "CardResponded",
      playerId: command.playerId,
      cardId: command.cardId,
      responseKind: pending.request.responseKind
    });
    emit({
      type: "DecisionResolved",
      decisionId: command.decisionId,
      playerId: command.playerId,
      result: "responded"
    });
    state.pendingDecision = null;
    resolveAcceptedResponse(pending, command.cardId, command.playerId);
    resolveUntilDecision();
  } else if (command.type === "respond-virtual-card") {
    const pending = state.pendingDecision!;
    if (pending.request.type !== "respond-card") {
      throw new Error("virtual response used for a selection decision");
    }
    const cardId = internalId("virtual-card");
    const materialCardIds = [...command.materialCardIds];
    for (const materialCardId of materialCardIds) {
      moveCard(materialCardId, PROCESSING_ZONE, "respond");
    }
    state.cards[cardId] = {
      id: cardId,
      definitionId: command.definitionId,
      virtual: true,
      materialCardIds,
      sourcePlayerId: command.playerId,
      ...(materialCardIds.length === 1 &&
      state.cards[materialCardIds[0]!]?.suit !== undefined
        ? { suit: state.cards[materialCardIds[0]!]!.suit }
        : {}),
      ...(materialCardIds.length === 1 &&
      state.cards[materialCardIds[0]!]?.rank !== undefined
        ? { rank: state.cards[materialCardIds[0]!]!.rank }
        : {})
    };
    state.zones[PROCESSING_ZONE]!.push(cardId);
    emit({
      type: "CardResponded",
      playerId: command.playerId,
      cardId,
      responseKind: pending.request.responseKind,
      skillId: command.skillId,
      materialCardIds
    });
    emit({
      type: "DecisionResolved",
      decisionId: command.decisionId,
      playerId: command.playerId,
      result: "responded"
    });
    state.pendingDecision = null;
    pushEffects([{ type: "finish-card", cardId }]);
    resolveAcceptedResponse(pending, cardId, command.playerId);
    resolveUntilDecision();
  } else if (command.type === "pass") {
    const pending = state.pendingDecision!;
    if (pending.request.type !== "respond-card") {
      throw new Error("pass command used for a selection decision");
    }
    emit({
      type: "DecisionResolved",
      decisionId: command.decisionId,
      playerId: command.playerId,
      result: "passed"
    });
    state.pendingDecision = null;
    if (pending.continuation.type === "workflow") {
      resumeWorkflow(pending.continuation.resume, {
        type: "passed",
        playerId: command.playerId
      });
    } else if (pending.continuation.type === "rescue") {
      requestNextRescuer(
        pending.remainingResponderIds,
        pending.continuation
      );
    } else {
      requestNextResponder(
        pending.request.cardId,
        pending.remainingResponderIds,
        pending.request.acceptedDefinitionIds,
        pending.request.responseKind,
        pending.continuation
      );
    }
    resolveUntilDecision();
  } else if (command.type === "choose-cards") {
    const pending = state.pendingDecision!;
    if (pending.request.type !== "select-cards") {
      throw new Error("selection command used for a response decision");
    }
    if (pending.continuation.type === "selected-cards") {
      const destination = pending.continuation.destination.type === "discard"
        ? DISCARD_PILE
        : handZone(pending.continuation.destination.playerId);
      for (const selectedCardId of command.cardIds) {
        moveCard(
          selectedCardId,
          destination,
          pending.continuation.moveReason
        );
      }
    } else if (pending.continuation.type === "workflow") {
      resumeWorkflow(pending.continuation.resume, {
        type: "selected",
        playerId: command.playerId,
        cardIds: [...command.cardIds]
      });
    } else if (
      pending.continuation.type === "discard-effect-replacement" &&
      pending.continuation.stage === "payment"
    ) {
      for (const selectedCardId of command.cardIds) {
        moveCard(selectedCardId, DISCARD_PILE, "discard");
      }
    } else if (
      pending.continuation.type === "target-redirection" &&
      pending.continuation.stage === "cost"
    ) {
      const selectedCardId = command.cardIds[0];
      if (!selectedCardId) {
        throw new Error("target redirection requires one discarded card");
      }
      pushEffects([{
        type: "offer-target-redirection",
        stage: "target",
        playerId: pending.continuation.playerId,
        sourceId: pending.continuation.sourceId,
        cardId: pending.continuation.cardId,
        selectableCardIds: [
          ...pending.continuation.selectableCardIds
        ],
        selectablePlayerIds: [
          ...pending.continuation.selectablePlayerIds
        ],
        reason: pending.continuation.reason,
        response: structuredClone(pending.continuation.response),
        selectedCardId
      }]);
    } else {
      throw new Error("selection decision has an invalid continuation");
    }
    emit({
      type: "DecisionResolved",
      decisionId: command.decisionId,
      playerId: command.playerId,
      result: "selected",
      selectedCardIds: [...command.cardIds]
    });
    state.pendingDecision = null;
    resolveUntilDecision();
  } else if (command.type === "choose-option") {
    const pending = state.pendingDecision!;
    if (pending.request.type !== "choose-option") {
      throw new Error("option command used for a non-option decision");
    }
    if (
      pending.continuation.type !== "workflow" &&
      pending.continuation.type !== "judgment-response" &&
      !(
        pending.continuation.type === "delegated-response" &&
        pending.continuation.stage === "offer"
      ) &&
      !(
        pending.continuation.type === "target-redirection" &&
        pending.continuation.stage === "offer"
      ) &&
      !(
        pending.continuation.type === "discard-effect-replacement" &&
        pending.continuation.stage === "offer"
      ) &&
      pending.continuation.type !== "optional-effect"
    ) {
      throw new Error("option decision has an invalid continuation");
    }
    emit({
      type: "DecisionResolved",
      decisionId: command.decisionId,
      playerId: command.playerId,
      result: "selected",
      selectedOption: command.option
    });
    state.pendingDecision = null;
    if (pending.continuation.type === "workflow") {
      resumeWorkflow(pending.continuation.resume, {
        type: "option-selected",
        playerId: command.playerId,
        option: command.option
      });
    } else if (pending.continuation.type === "optional-effect") {
      const activated = command.option === "activate";
      pushPlan(
        activated
          ? pending.continuation.activatedPlanId
          : pending.continuation.skippedPlanId,
        [
          activated
            ? pending.continuation.skippedPlanId
            : pending.continuation.activatedPlanId
        ]
      );
    } else if (pending.continuation.type === "judgment-response") {
      if (command.option !== "activate") {
        pushEffects([structuredClone(pending.continuation.response)]);
      } else {
        const response = pending.continuation.response;
        pushEffects([{
          type: "request-judgment",
          playerId: pending.continuation.playerId,
          cardId: pending.continuation.cardId,
          reason: pending.continuation.reason,
          pattern: structuredClone(pending.continuation.pattern),
          matchedPlanId: createPlan([{
            type: "enqueue-plan",
            planId: response.acceptedPlanId,
            discardPlanIds: [response.passedPlanId]
          }]),
          missedPlanId: createPlan([
            structuredClone(response)
          ])
        }]);
      }
    } else if (pending.continuation.type === "delegated-response") {
      if (command.option !== "activate") {
        pushEffects([structuredClone(pending.continuation.response)]);
      } else {
        const response = pending.continuation.response;
        requestNextResponder(
          response.cardId,
          pending.continuation.allyIds,
          [...new Set([
            ...(response.acceptedDefinitionIds ?? []),
            ...(response.acceptedTags ?? []).flatMap((tag) =>
              registry.cardDefinitionIdsWithTag(tag)
            )
          ])],
          response.responseKind,
          {
            ...pending.continuation,
            stage: "ask"
          }
        );
      }
    } else if (pending.continuation.type === "target-redirection") {
      if (command.option !== "activate") {
        pushEffects([structuredClone(pending.continuation.response)]);
      } else {
        const request: DecisionRequest = {
          id: internalId("decision"),
          type: "select-cards",
          playerId: pending.continuation.playerId,
          cardId: pending.continuation.cardId,
          selectableCardIds: [
            ...pending.continuation.selectableCardIds
          ],
          minimum: 1,
          maximum: 1,
          reason: `${pending.continuation.reason}-discard`
        };
        state.pendingDecision = {
          request,
          remainingResponderIds: [],
          continuation: {
            ...pending.continuation,
            stage: "cost"
          }
        };
        emit({ type: "DecisionRequested", request });
      }
    } else if (command.option === "activate") {
      const request: DecisionRequest = {
        id: internalId("decision"),
        type: "select-cards",
        playerId: pending.continuation.playerId,
        cardId: pending.continuation.cardId,
        selectableCardIds: [
          ...pending.continuation.selectableCardIds
        ],
        minimum: pending.continuation.count,
        maximum: pending.continuation.count,
        reason: pending.continuation.reason
      };
      state.pendingDecision = {
        request,
        remainingResponderIds: [],
        continuation: {
          ...pending.continuation,
          stage: "payment"
        }
      };
      emit({ type: "DecisionRequested", request });
    } else {
      pushEffects([
        structuredClone(pending.continuation.replacedEffect)
      ]);
    }
    resolveUntilDecision();
  } else if (command.type === "choose-players") {
    const pending = state.pendingDecision!;
    if (pending.request.type !== "select-players") {
      throw new Error("player selection used for a different decision");
    }
    if (
      pending.continuation.type !== "workflow" &&
      !(
        pending.continuation.type === "target-redirection" &&
        pending.continuation.stage === "target"
      )
    ) {
      throw new Error("player selection has an invalid continuation");
    }
    emit({
      type: "DecisionResolved",
      decisionId: command.decisionId,
      playerId: command.playerId,
      result: "selected",
      selectedPlayerIds: [...command.playerIds]
    });
    state.pendingDecision = null;
    if (pending.continuation.type === "workflow") {
      resumeWorkflow(pending.continuation.resume, {
        type: "players-selected",
        playerId: command.playerId,
        playerIds: [...command.playerIds]
      });
    } else {
      const targetId = command.playerIds[0];
      const selectedCardId = pending.continuation.selectedCardId;
      if (!targetId || !selectedCardId) {
        throw new Error("target redirection is missing its target or cost");
      }
      moveCard(selectedCardId, DISCARD_PILE, "discard");
      discardPlan(pending.continuation.response.acceptedPlanId);
      discardPlan(pending.continuation.response.passedPlanId);
      pushEffects([{
        type: "redirect-target",
        cardId: pending.continuation.cardId,
        sourceId: pending.continuation.sourceId,
        fromId: pending.continuation.playerId,
        toId: targetId
      }]);
    }
    resolveUntilDecision();
  } else if (command.type === "end-action-phase") {
    emit({ type: "ActionPhaseEnded", playerId: command.playerId });
    changePhase("discard");
  } else if (command.type === "advance-phase") {
    if (state.phase === "judgment") {
      const delayedCards = [
        ...(state.zones[judgmentZone(command.playerId)] ?? [])
      ];
      pushEffects([
        ...delayedCards.map((cardId): Effect => ({
          type: "resolve-delayed",
          playerId: command.playerId,
          cardId
        })),
        {
          type: "change-phase",
          playerId: command.playerId,
          to: "draw"
        }
      ]);
      resolveUntilDecision();
    } else {
      const phaseEffects: Effect[] = [];
      if (state.players[command.playerId]?.marks.skipDraw === true) {
        phaseEffects.push({
          type: "set-mark",
          playerId: command.playerId,
          mark: "skipDraw",
          value: false,
          cardId: "system:draw-phase"
        });
      } else {
        phaseEffects.push({
          type: "draw",
          playerId: command.playerId,
          count: 2,
          cardId: "system:draw-phase",
          tags: ["phase:draw"]
        });
      }
      if (state.players[command.playerId]?.marks.skipAction === true) {
        phaseEffects.push({
          type: "set-mark",
          playerId: command.playerId,
          mark: "skipAction",
          value: false,
          cardId: "system:action-phase"
        });
        phaseEffects.push({
          type: "change-phase",
          playerId: command.playerId,
          to: "discard"
        });
      } else {
        phaseEffects.push({
          type: "change-phase",
          playerId: command.playerId,
          to: "action"
        });
      }
      pushEffects(phaseEffects);
      resolveUntilDecision();
    }
  } else if (command.type === "discard-cards") {
    for (const cardId of command.cardIds) {
      moveCard(cardId, DISCARD_PILE, "discard");
    }
    finishTurn();
    resolveUntilDecision();
  } else {
    finishTurn();
    resolveUntilDecision();
  }

  return {
    state,
    events,
    pendingDecision: state.pendingDecision?.request ?? null
  };
}
