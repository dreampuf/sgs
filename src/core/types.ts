export type PlayerId = string;
export type CardInstanceId = string;
export type CardDefinitionId = string;
export type ZoneId = string;
export type EffectPlanId = string;
export type CardSuit = "diamond" | "heart" | "club" | "spade";
export type CardMoveReason =
  | "use"
  | "respond"
  | "resolve"
  | "draw"
  | "discard"
  | "death"
  | "snatch"
  | "judge"
  | "delayed"
  | "reveal"
  | "give";

export type CardMoveCause =
  | {
      type: "judgment";
      playerId: PlayerId;
      delayedCardId?: CardInstanceId;
      reasonCardId?: CardInstanceId;
    };

export type Phase = "judgment" | "draw" | "action" | "discard" | "finished";

export interface PlayerState {
  id: PlayerId;
  heroDefinitionId: string;
  hp: number;
  maxHp: number;
  alive: boolean;
  dying: boolean;
  skillIds: string[];
  marks: Record<string, number | boolean>;
}

export interface CardInstance {
  id: CardInstanceId;
  definitionId: CardDefinitionId;
  virtual?: true;
  materialCardIds?: CardInstanceId[];
  suit?: CardSuit;
  rank?: number;
  sourcePlayerId?: PlayerId;
}

export interface DamageEffect {
  type: "damage";
  sourceId: PlayerId;
  targetId: PlayerId;
  amount: number;
  cardId: CardInstanceId;
  nature?: "normal" | "fire" | "thunder";
  propagated?: boolean;
  tags?: string[];
}

export interface RecoverEffect {
  type: "recover";
  playerId: PlayerId;
  amount: number;
  cardId: CardInstanceId;
  sourceId?: PlayerId;
}

export interface DrawEffect {
  type: "draw";
  playerId: PlayerId;
  count: number;
  cardId: CardInstanceId;
  tags?: string[];
}

export interface LoseHpEffect {
  type: "lose-hp";
  playerId: PlayerId;
  amount: number;
  cardId: CardInstanceId;
}

export interface IncrementTurnUsageEffect {
  type: "increment-turn-usage";
  playerId: PlayerId;
  key: string;
  amount: number;
}

export interface CancelEffect {
  type: "cancel";
  cardId: CardInstanceId;
  reason: "jink" | "nullification";
  sourceId?: PlayerId;
  targetId?: PlayerId;
}

export interface FinishCardEffect {
  type: "finish-card";
  cardId: CardInstanceId;
}

export interface SetMarkEffect {
  type: "set-mark";
  playerId: PlayerId;
  mark: string;
  value: number | boolean;
  cardId: CardInstanceId;
}

export interface ToggleChainEffect {
  type: "toggle-chain";
  playerId: PlayerId;
  cardId: CardInstanceId;
}

export interface EquipEffect {
  type: "equip";
  playerId: PlayerId;
  cardId: CardInstanceId;
  slot: "weapon" | "armor" | "defensive-horse" | "offensive-horse";
}

export interface RequestCardSelectionEffect {
  type: "request-card-selection";
  chooserId: PlayerId;
  cardId: CardInstanceId;
  selectableCardIds: CardInstanceId[];
  minimum: number;
  maximum: number;
  destination:
    | { type: "discard" }
    | { type: "hand"; playerId: PlayerId };
  reason: string;
  moveReason: CardMoveReason;
}

export interface MoveCardEffect {
  type: "move-card";
  cardId: CardInstanceId;
  toZoneId: ZoneId;
  reason: CardMoveReason;
  cause?: CardMoveCause;
}

export interface PlaceDelayedEffect {
  type: "place-delayed";
  playerId: PlayerId;
  cardId: CardInstanceId;
}

export interface ResolveDelayedEffect {
  type: "resolve-delayed";
  playerId: PlayerId;
  cardId: CardInstanceId;
}

export interface PerformJudgmentEffect {
  type: "perform-judgment";
  playerId: PlayerId;
  delayedCardId: CardInstanceId;
}

export interface JudgmentPattern {
  includedSuits?: CardSuit[];
  excludedSuits?: CardSuit[];
  minimumRank?: number;
  maximumRank?: number;
}

export interface RequestJudgmentEffect {
  type: "request-judgment";
  playerId: PlayerId;
  cardId: CardInstanceId;
  reason: string;
  delayedCardId?: CardInstanceId;
  pattern: JudgmentPattern;
  matchedCardDestination?: {
    toZoneId: ZoneId;
    reason: CardMoveReason;
  };
  matchedPlanId: EffectPlanId;
  missedPlanId: EffectPlanId;
}

export interface ResolveJudgmentResultEffect {
  type: "resolve-judgment-result";
  judgmentId: string;
  playerId: PlayerId;
  cardId: CardInstanceId;
  judgmentCardId: CardInstanceId;
  reason: string;
  delayedCardId?: CardInstanceId;
  pattern: JudgmentPattern;
  matchedCardDestination?: {
    toZoneId: ZoneId;
    reason: CardMoveReason;
  };
  matchedPlanId: EffectPlanId;
  missedPlanId: EffectPlanId;
}

export interface ReplaceJudgmentCardEffect {
  type: "replace-judgment-card";
  judgmentId: string;
  replacementCardId: CardInstanceId;
  playerId: PlayerId;
  oldCardDestination?: {
    toZoneId: ZoneId;
    reason: CardMoveReason;
  };
}

export interface ChangePhaseEffect {
  type: "change-phase";
  playerId: PlayerId;
  to: Phase;
}

export type WorkflowValue =
  | null
  | boolean
  | number
  | string
  | WorkflowValue[]
  | { [key: string]: WorkflowValue };

export type WorkflowData = Record<string, WorkflowValue>;

export interface WorkflowContext {
  sourceId: PlayerId;
  cardId: CardInstanceId;
  targetIds: PlayerId[];
}

export type WorkflowInput =
  | {
      type: "responded";
      playerId: PlayerId;
      cardId: CardInstanceId;
    }
  | {
      type: "passed";
      playerId: PlayerId;
    }
  | {
      type: "selected";
      playerId: PlayerId;
      cardIds: CardInstanceId[];
    }
  | {
      type: "players-selected";
      playerId: PlayerId;
      playerIds: PlayerId[];
    }
  | {
      type: "cards-taken";
      cardIds: CardInstanceId[];
    }
  | {
      type: "option-selected";
      playerId: PlayerId;
      option: string;
    };

export interface WorkflowResume {
  workflowId: string;
  context: WorkflowContext;
  data: WorkflowData;
}

export interface RunWorkflowEffect extends WorkflowResume {
  type: "run-workflow";
  input?: WorkflowInput;
}

export interface ApplyCardEffect {
  type: "apply-card";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  targetIds: PlayerId[];
}

export interface ResolveTargetEffect {
  type: "resolve-target";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  targetId: PlayerId;
  planId: EffectPlanId;
}

export interface EnqueuePlanEffect {
  type: "enqueue-plan";
  planId: EffectPlanId;
  discardPlanIds?: EffectPlanId[];
}

export interface DiscardPlanEffect {
  type: "discard-plan";
  planId: EffectPlanId;
}

export interface RedirectTargetEffect {
  type: "redirect-target";
  cardId: CardInstanceId;
  sourceId: PlayerId;
  fromId: PlayerId;
  toId: PlayerId;
}

export interface UseCardDefinitionEffect {
  type: "use-card-definition";
  sourceId: PlayerId;
  definitionId: CardDefinitionId;
  targetIds: PlayerId[];
  skillId?: string;
}

export interface UseCardInstanceEffect {
  type: "use-card-instance";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  targetIds: PlayerId[];
  skillId?: string;
}

export interface RevealCardEffect {
  type: "reveal-card";
  playerId: PlayerId;
  cardId: CardInstanceId;
  reason: string;
}

export interface TakeTopCardsEffect {
  type: "take-top-cards";
  cardId: CardInstanceId;
  count: number;
  toZoneId: ZoneId;
  reason: string;
  resume: WorkflowResume;
}

export interface ReorderDrawPileEffect {
  type: "reorder-draw-pile";
  playerId: PlayerId;
  cardId: CardInstanceId;
  topCardIds: CardInstanceId[];
  bottomCardIds: CardInstanceId[];
  reason: string;
}

export interface DyingCheckEffect {
  type: "dying-check";
  playerId: PlayerId;
  sourceId: PlayerId | null;
  cardId: CardInstanceId;
}

export interface DeathEffect {
  type: "death";
  playerId: PlayerId;
  sourceId: PlayerId | null;
  cardId: CardInstanceId;
}

export interface NegatableEffect {
  type: "negatable";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  responderIds: PlayerId[];
  negated: boolean;
  resolvedPlanId: EffectPlanId;
  negatedPlanId: EffectPlanId;
}

export interface RequestResponseEffect {
  type: "request-response";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  responderIds: PlayerId[];
  acceptedDefinitionIds?: CardDefinitionId[];
  acceptedTags?: string[];
  responseKind: "slash" | "jink" | "peach";
  tags?: string[];
  acceptedPlanId: EffectPlanId;
  passedPlanId: EffectPlanId;
}

export interface OfferJudgmentResponseEffect {
  type: "offer-judgment-response";
  playerId: PlayerId;
  cardId: CardInstanceId;
  reason: string;
  pattern: JudgmentPattern;
  response: RequestResponseEffect;
}

export interface OfferDiscardEffectReplacementEffect {
  type: "offer-discard-effect-replacement";
  playerId: PlayerId;
  targetId: PlayerId;
  cardId: CardInstanceId;
  selectableCardIds: CardInstanceId[];
  count: number;
  reason: string;
  replacedEffect: Effect;
}

export interface OfferDelegatedResponseEffect {
  type: "offer-delegated-response";
  playerId: PlayerId;
  cardId: CardInstanceId;
  reason: string;
  kingdom: "wei" | "shu" | "wu" | "qun";
  response: RequestResponseEffect;
}

export interface OfferTargetRedirectionEffect {
  type: "offer-target-redirection";
  stage: "offer" | "target";
  playerId: PlayerId;
  sourceId: PlayerId;
  cardId: CardInstanceId;
  selectableCardIds: CardInstanceId[];
  selectablePlayerIds: PlayerId[];
  reason: string;
  response: RequestResponseEffect;
  selectedCardId?: CardInstanceId;
}

export interface OfferOptionalEffect {
  type: "offer-optional-effect";
  playerId: PlayerId;
  cardId: CardInstanceId;
  reason: string;
  activatedPlanId: EffectPlanId;
  skippedPlanId: EffectPlanId;
}

export type Effect =
  | DamageEffect
  | RecoverEffect
  | DrawEffect
  | LoseHpEffect
  | IncrementTurnUsageEffect
  | CancelEffect
  | FinishCardEffect
  | SetMarkEffect
  | ToggleChainEffect
  | EquipEffect
  | RequestCardSelectionEffect
  | MoveCardEffect
  | PlaceDelayedEffect
  | ResolveDelayedEffect
  | PerformJudgmentEffect
  | RequestJudgmentEffect
  | ResolveJudgmentResultEffect
  | ReplaceJudgmentCardEffect
  | ChangePhaseEffect
  | RunWorkflowEffect
  | EnqueuePlanEffect
  | DiscardPlanEffect
  | RedirectTargetEffect
  | ApplyCardEffect
  | ResolveTargetEffect
  | UseCardDefinitionEffect
  | UseCardInstanceEffect
  | RevealCardEffect
  | TakeTopCardsEffect
  | ReorderDrawPileEffect
  | DyingCheckEffect
  | DeathEffect
  | NegatableEffect
  | RequestResponseEffect
  | OfferJudgmentResponseEffect
  | OfferDiscardEffectReplacementEffect
  | OfferDelegatedResponseEffect
  | OfferTargetRedirectionEffect
  | OfferOptionalEffect;

type NonPlanningEffect = Exclude<
  Effect,
  | ResolveTargetEffect
  | EnqueuePlanEffect
  | NegatableEffect
  | RequestResponseEffect
  | RequestJudgmentEffect
  | ResolveJudgmentResultEffect
  | OfferOptionalEffect
>;

export interface ResolveTargetEffectDraft {
  type: "resolve-target";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  targetId: PlayerId;
  effects: EffectDraft[];
  onCancelled?: EffectDraft[];
}

export interface EnqueueEffectsEffectDraft {
  type: "enqueue-effects";
  effects: EffectDraft[];
}

export interface NegatableEffectDraft {
  type: "negatable";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  responderIds: PlayerId[];
  negated: boolean;
  onResolved: EffectDraft[];
  onNegated?: EffectDraft[];
}

export interface RequestResponseEffectDraft {
  type: "request-response";
  sourceId: PlayerId;
  cardId: CardInstanceId;
  responderIds: PlayerId[];
  acceptedDefinitionIds?: CardDefinitionId[];
  acceptedTags?: string[];
  responseKind: "slash" | "jink" | "peach";
  tags?: string[];
  onAccepted: EffectDraft[];
  onAllPassed: EffectDraft[];
}

export interface RequestJudgmentEffectDraft {
  type: "request-judgment";
  playerId: PlayerId;
  cardId: CardInstanceId;
  reason: string;
  delayedCardId?: CardInstanceId;
  pattern: JudgmentPattern;
  matchedCardDestination?: {
    toZoneId: ZoneId;
    reason: CardMoveReason;
  };
  onMatch: EffectDraft[];
  onMiss: EffectDraft[];
}

export interface ResolveJudgmentResultEffectDraft {
  type: "resolve-judgment-result";
  judgmentId: string;
  playerId: PlayerId;
  cardId: CardInstanceId;
  judgmentCardId: CardInstanceId;
  reason: string;
  delayedCardId?: CardInstanceId;
  pattern: JudgmentPattern;
  matchedCardDestination?: {
    toZoneId: ZoneId;
    reason: CardMoveReason;
  };
  onMatch: EffectDraft[];
  onMiss: EffectDraft[];
}

export interface OfferOptionalEffectDraft {
  type: "offer-optional-effect";
  playerId: PlayerId;
  cardId: CardInstanceId;
  reason: string;
  onActivate: EffectInput[];
  onSkip: EffectInput[];
}

export type EffectDraft =
  | NonPlanningEffect
  | ResolveTargetEffectDraft
  | EnqueueEffectsEffectDraft
  | NegatableEffectDraft
  | RequestResponseEffectDraft
  | RequestJudgmentEffectDraft
  | ResolveJudgmentResultEffectDraft
  | OfferOptionalEffectDraft;

export type EffectInput = Effect | EffectDraft;

export interface EffectPlan {
  id: EffectPlanId;
  effects: Effect[];
}

export interface ResolutionFrame {
  id: string;
  effect: Effect;
  timing?: {
    point: "before-effect";
    appliedRuleIds: string[];
  };
}

export interface RespondCardDecisionRequest {
  id: string;
  playerId: PlayerId;
  type: "respond-card";
  cardId: CardInstanceId;
  acceptedDefinitionIds: CardDefinitionId[];
  passAllowed: true;
  responseKind: "slash" | "jink" | "nullification" | "peach";
}

export interface SelectCardsDecisionRequest {
  id: string;
  playerId: PlayerId;
  type: "select-cards";
  cardId: CardInstanceId;
  selectableCardIds: CardInstanceId[];
  minimum: number;
  maximum: number;
  reason: string;
}

export interface ChooseOptionDecisionRequest {
  id: string;
  playerId: PlayerId;
  type: "choose-option";
  cardId: CardInstanceId;
  options: string[];
  reason: string;
}

export interface SelectPlayersDecisionRequest {
  id: string;
  playerId: PlayerId;
  type: "select-players";
  cardId: CardInstanceId;
  selectablePlayerIds: PlayerId[];
  minimum: number;
  maximum: number;
  reason: string;
}

export type DecisionRequest =
  | RespondCardDecisionRequest
  | SelectCardsDecisionRequest
  | SelectPlayersDecisionRequest
  | ChooseOptionDecisionRequest;

export type DecisionContinuation =
  | {
      type: "effects";
      acceptedPlanId: EffectPlanId;
      passedPlanId: EffectPlanId;
      tags?: string[];
      remainingResponses?: number;
    }
  | {
      type: "nullification";
      sourceId: PlayerId;
      cardId: CardInstanceId;
      responderIds: PlayerId[];
      negated: boolean;
      resolvedPlanId: EffectPlanId;
      negatedPlanId: EffectPlanId;
    }
  | {
      type: "selected-cards";
      destination:
        | { type: "discard" }
        | { type: "hand"; playerId: PlayerId };
      reason: string;
      moveReason: CardMoveReason;
    }
  | {
      type: "rescue";
      playerId: PlayerId;
      sourceId: PlayerId | null;
      cardId: CardInstanceId;
    }
  | {
      type: "workflow";
      resume: WorkflowResume;
      remainingResponses?: number;
    }
  | {
      type: "judgment-response";
      playerId: PlayerId;
      cardId: CardInstanceId;
      reason: string;
      pattern: JudgmentPattern;
      response: RequestResponseEffect;
    }
  | {
      type: "discard-effect-replacement";
      stage: "offer" | "payment";
      playerId: PlayerId;
      cardId: CardInstanceId;
      selectableCardIds: CardInstanceId[];
      count: number;
      reason: string;
      replacedEffect: Effect;
    }
  | {
      type: "delegated-response";
      stage: "offer" | "ask";
      playerId: PlayerId;
      allyIds: PlayerId[];
      reason: string;
      response: RequestResponseEffect;
    }
  | {
      type: "target-redirection";
      stage: "offer" | "cost" | "target";
      playerId: PlayerId;
      sourceId: PlayerId;
      cardId: CardInstanceId;
      selectableCardIds: CardInstanceId[];
      selectablePlayerIds: PlayerId[];
      reason: string;
      response: RequestResponseEffect;
      selectedCardId?: CardInstanceId;
    }
  | {
      type: "optional-effect";
      playerId: PlayerId;
      cardId: CardInstanceId;
      reason: string;
      activatedPlanId: EffectPlanId;
      skippedPlanId: EffectPlanId;
    };

export interface PendingDecision {
  request: DecisionRequest;
  remainingResponderIds: PlayerId[];
  continuation: DecisionContinuation;
}

export interface GameState {
  schemaVersion: 2;
  gameId: string;
  rulesetId: string;
  seed: number;
  rngState: number;
  revision: number;
  nextSequence: number;
  turnNumber: number;
  turnUsage: Record<PlayerId, Record<string, number>>;
  players: Record<PlayerId, PlayerState>;
  turnOrder: PlayerId[];
  currentPlayerId: PlayerId;
  phase: Phase;
  cards: Record<CardInstanceId, CardInstance>;
  zones: Record<ZoneId, CardInstanceId[]>;
  stack: ResolutionFrame[];
  triggerQueue: ResolutionFrame[];
  effectPlans: Record<EffectPlanId, EffectPlan>;
  pendingDecision: PendingDecision | null;
  eventLog: DomainEvent[];
}

export type GameCommand =
  | {
      type: "use-card";
      playerId: PlayerId;
      cardId: CardInstanceId;
      targetIds: PlayerId[];
    }
  | {
      type: "use-virtual-card";
      playerId: PlayerId;
      skillId: string;
      definitionId: CardDefinitionId;
      materialCardIds: CardInstanceId[];
      targetIds: PlayerId[];
    }
  | {
      type: "respond-card";
      playerId: PlayerId;
      decisionId: string;
      cardId: CardInstanceId;
    }
  | {
      type: "respond-virtual-card";
      playerId: PlayerId;
      decisionId: string;
      skillId: string;
      definitionId: CardDefinitionId;
      materialCardIds: CardInstanceId[];
    }
  | {
      type: "activate-skill";
      playerId: PlayerId;
      skillId: string;
      materialCardIds: CardInstanceId[];
      targetIds: PlayerId[];
    }
  | {
      type: "pass";
      playerId: PlayerId;
      decisionId: string;
    }
  | {
      type: "end-action-phase";
      playerId: PlayerId;
    }
  | {
      type: "advance-phase";
      playerId: PlayerId;
    }
  | {
      type: "discard-cards";
      playerId: PlayerId;
      cardIds: CardInstanceId[];
    }
  | {
      type: "end-turn";
      playerId: PlayerId;
    }
  | {
      type: "choose-cards";
      playerId: PlayerId;
      decisionId: string;
      cardIds: CardInstanceId[];
    }
  | {
      type: "choose-option";
      playerId: PlayerId;
      decisionId: string;
      option: string;
    }
  | {
      type: "choose-players";
      playerId: PlayerId;
      decisionId: string;
      playerIds: PlayerId[];
    };

export type LegalAction = GameCommand;

interface EventBase {
  sequence: number;
  revision: number;
}

export type DomainEvent =
  | (EventBase & {
      type: "CardMoved";
      cardId: CardInstanceId;
      from: ZoneId;
      to: ZoneId;
      reason: CardMoveReason;
      cause?: CardMoveCause;
    })
  | (EventBase & {
      type: "CardUsed";
      playerId: PlayerId;
      cardId: CardInstanceId;
      targetIds: PlayerId[];
      skillId?: string;
      materialCardIds?: CardInstanceId[];
    })
  | (EventBase & {
      type: "CardResponded";
      playerId: PlayerId;
      cardId: CardInstanceId;
      responseKind: "slash" | "jink" | "nullification" | "peach";
      skillId?: string;
      materialCardIds?: CardInstanceId[];
    })
  | (EventBase & {
      type: "SkillActivated";
      playerId: PlayerId;
      skillId: string;
      activationId: CardInstanceId;
      materialCardIds: CardInstanceId[];
      targetIds: PlayerId[];
    })
  | (EventBase & {
      type: "TargetsConfirmed";
      playerId: PlayerId;
      cardId: CardInstanceId;
      targetIds: PlayerId[];
    })
  | (EventBase & {
      type: "TargetRedirected";
      playerId: PlayerId;
      cardId: CardInstanceId;
      fromId: PlayerId;
      toId: PlayerId;
    })
  | (EventBase & {
      type: "DamageApplied";
      sourceId: PlayerId;
      targetId: PlayerId;
      amount: number;
      cardId: CardInstanceId;
      nature: "normal" | "fire" | "thunder";
    })
  | (EventBase & {
      type: "HpRecovered";
      playerId: PlayerId;
      amount: number;
      cardId: CardInstanceId;
      sourceId?: PlayerId;
    })
  | (EventBase & {
      type: "HpLost";
      playerId: PlayerId;
      amount: number;
      cardId: CardInstanceId;
    })
  | (EventBase & {
      type: "CardsDrawn";
      playerId: PlayerId;
      count: number;
      cardId: CardInstanceId;
    })
  | (EventBase & {
      type: "CardCancelled";
      cardId: CardInstanceId;
      reason: "jink" | "nullification";
      sourceId?: PlayerId;
      targetId?: PlayerId;
    })
  | (EventBase & { type: "DecisionRequested"; request: DecisionRequest })
  | (EventBase & {
      type: "DecisionResolved";
      decisionId: string;
      playerId: PlayerId;
      result: "responded" | "passed" | "selected";
      selectedCardIds?: CardInstanceId[];
      selectedPlayerIds?: PlayerId[];
      selectedOption?: string;
    })
  | (EventBase & { type: "ActionPhaseEnded"; playerId: PlayerId })
  | (EventBase & {
      type: "PhaseChanged";
      playerId: PlayerId;
      from: Phase;
      to: Phase;
    })
  | (EventBase & {
      type: "TurnEnded";
      playerId: PlayerId;
      turnNumber: number;
    })
  | (EventBase & {
      type: "TurnStarted";
      playerId: PlayerId;
      turnNumber: number;
    })
  | (EventBase & {
      type: "DyingStarted";
      playerId: PlayerId;
      sourceId: PlayerId | null;
    })
  | (EventBase & {
      type: "PlayerRescued";
      playerId: PlayerId;
      hp: number;
    })
  | (EventBase & {
      type: "PlayerDied";
      playerId: PlayerId;
      sourceId: PlayerId | null;
    })
  | (EventBase & {
      type: "DeckReshuffled";
      count: number;
      rngState: number;
    })
  | (EventBase & {
      type: "GameEnded";
      winnerIds: PlayerId[];
    })
  | (EventBase & {
      type: "PlayerMarkChanged";
      playerId: PlayerId;
      mark: string;
      value: number | boolean;
      cardId: CardInstanceId;
    })
  | (EventBase & {
      type: "ChainChanged";
      playerId: PlayerId;
      chained: boolean;
      cardId: CardInstanceId;
    })
  | (EventBase & {
      type: "EquipmentChanged";
      playerId: PlayerId;
      slot: "weapon" | "armor" | "defensive-horse" | "offensive-horse";
      equippedCardId: CardInstanceId;
      replacedCardId: CardInstanceId | null;
    })
  | (EventBase & {
      type: "DelayedCardPlaced";
      playerId: PlayerId;
      cardId: CardInstanceId;
    })
  | (EventBase & {
      type: "JudgmentRevealed";
      judgmentId?: string;
      playerId: PlayerId;
      delayedCardId?: CardInstanceId;
      reasonCardId?: CardInstanceId;
      judgmentCardId: CardInstanceId;
      suit: CardSuit;
      rank: number;
    })
  | (EventBase & {
      type: "JudgmentResolved";
      judgmentId?: string;
      playerId: PlayerId;
      delayedCardId?: CardInstanceId;
      reasonCardId?: CardInstanceId;
      judgmentCardId: CardInstanceId;
      matched: boolean;
    })
  | (EventBase & {
      type: "JudgmentCardReplaced";
      judgmentId: string;
      playerId: PlayerId;
      oldCardId: CardInstanceId;
      newCardId: CardInstanceId;
    })
  | (EventBase & {
      type: "CardsRevealed";
      cardId: CardInstanceId;
      revealedCardIds: CardInstanceId[];
      reason: string;
    })
  | (EventBase & {
      type: "CardsArranged";
      playerId: PlayerId;
      cardId: CardInstanceId;
      count: number;
      reason: string;
    })
  | (EventBase & {
      type: "CardRevealed";
      playerId: PlayerId;
      cardId: CardInstanceId;
      reason: string;
    });

export interface DispatchResult {
  state: GameState;
  events: DomainEvent[];
  pendingDecision: DecisionRequest | null;
}
