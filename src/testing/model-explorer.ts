import type { ContentRegistry, SkillDefinition } from "../core/registry";
import {
  PROCESSING_ZONE,
  deserializeGameState,
  serializeGameState
} from "../core/state";
import type {
  DomainEvent,
  GameCommand,
  GameState,
  LegalAction
} from "../core/types";
import { GameSession } from "../session/game-session";
import {
  canonicalJson,
  JsonlReplayRecorder,
  ReplayIdNormalizer
} from "../replay/jsonl";

export interface ModelInvariantContext {
  initialState: Readonly<GameState>;
  state: Readonly<GameState>;
  command: Readonly<GameCommand>;
  events: readonly DomainEvent[];
  depth: number;
}

export type ModelInvariant = (context: ModelInvariantContext) =>
  void | string | false;

export interface ModelExplorerOptions {
  scenario?: string;
  maxDepth: number;
  maxStates: number;
  maxTransitions?: number;
  maxTurns?: number;
  maxActionsPerState?: number;
  reduceEquivalentActions?: boolean;
  invariant?: ModelInvariant;
}

export interface ModelCoverage {
  actionTypes: string[];
  eventTypes: string[];
  decisionReasons: string[];
  skillIds: string[];
}

export interface ModelFailure {
  stage: "dispatch" | "invariant";
  message: string;
  depth: number;
  command: GameCommand;
  commands: GameCommand[];
  jsonl: string;
}

export interface ModelExplorationResult {
  visitedStates: number;
  expandedStates: number;
  transitions: number;
  duplicateStates: number;
  reducedActions: number;
  maxDepthReached: number;
  maxTurnReached: number;
  truncated: boolean;
  coverage: ModelCoverage;
  failures: ModelFailure[];
}

export interface CoverageGuidedOptions {
  scenario?: string;
  maxSteps: number;
  maxTurns: number;
  maxActionsPerState?: number;
}

export interface CoverageGuidedResult {
  state: GameState;
  steps: number;
  maxTurnReached: number;
  terminated: boolean;
  reason: "finished" | "turn-limit" | "step-limit" | "failure";
  coverage: ModelCoverage;
  replayJsonl: string;
  failure?: ModelFailure;
}

interface FrontierNode {
  state: GameState;
  commands: GameCommand[];
  depth: number;
}

function normalizeForFingerprint(state: GameState): unknown {
  const normalized = structuredClone(state);
  normalized.gameId = "game:$";
  normalized.revision = 0;
  normalized.nextSequence = 0;
  normalized.eventLog = normalized.eventLog.map((event) => ({
    ...event,
    sequence: 0,
    revision: 0
  }));
  const sorted = JSON.parse(canonicalJson(normalized)) as GameState;
  return new ReplayIdNormalizer().normalize(sorted);
}

/**
 * A semantic transposition key. It preserves gameplay history because skills
 * may inspect eventLog, while removing counters and opaque runtime ids that do
 * not alter legal choices.
 */
export function modelStateFingerprint(state: GameState): string {
  return canonicalJson(normalizeForFingerprint(state));
}

function cardKey(state: GameState, cardId: string): string {
  const card = state.cards[cardId];
  if (!card) return cardId.replace(
    /^(decision|frame|judgment|trigger|virtual-card)-\d+$/,
    "$1:$"
  );
  return canonicalJson({
    definitionId: card.definitionId,
    materialCardIds: card.materialCardIds?.map((id) => cardKey(state, id)),
    rank: card.rank ?? null,
    sourcePlayerId: card.sourcePlayerId ?? null,
    suit: card.suit ?? null,
    virtual: card.virtual ?? false,
    zoneId: Object.entries(state.zones).find(([, cardIds]) =>
      cardIds.includes(cardId)
    )?.[0] ?? null
  });
}

/**
 * Collapses choices that differ only by interchangeable physical copies.
 * Target order remains intact because ordered-target cards can observe it.
 */
export function modelActionKey(
  state: GameState,
  action: LegalAction
): string {
  const normalized: Record<string, unknown> = { ...action };
  if ("decisionId" in action) normalized.decisionId = "decision:$";
  if ("cardId" in action) normalized.cardId = cardKey(state, action.cardId);
  if ("cardIds" in action) {
    normalized.cardIds = action.cardIds.map((id) => cardKey(state, id)).sort();
  }
  if ("materialCardIds" in action) {
    normalized.materialCardIds = action.materialCardIds
      .map((id) => cardKey(state, id))
      .sort();
  }
  return canonicalJson(normalized);
}

function isProgressAction(action: LegalAction): boolean {
  return action.type === "end-action-phase" ||
    action.type === "advance-phase" ||
    action.type === "end-turn" ||
    action.type === "pass";
}

export function reduceModelActions(
  state: GameState,
  actions: readonly LegalAction[],
  maximum = Number.POSITIVE_INFINITY
): { actions: LegalAction[]; reduced: number } {
  if (maximum < 1) {
    throw new Error("maximum model actions must be at least 1");
  }
  const representatives = new Map<string, LegalAction>();
  for (const action of actions) {
    const key = modelActionKey(state, action);
    const current = representatives.get(key);
    if (
      !current ||
      canonicalJson(action).localeCompare(canonicalJson(current)) < 0
    ) {
      representatives.set(key, action);
    }
  }
  const unique = [...representatives.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, action]) => action);
  if (unique.length <= maximum) {
    return { actions: unique, reduced: actions.length - unique.length };
  }
  const selected = unique.slice(0, maximum);
  const progress = unique.find(isProgressAction);
  if (progress && !selected.includes(progress)) {
    selected[selected.length - 1] = progress;
  }
  return {
    actions: selected,
    reduced: actions.length - selected.length
  };
}

function decisionReason(state: GameState): string | undefined {
  const request = state.pendingDecision?.request;
  if (!request) return undefined;
  return "reason" in request
    ? request.reason
    : `response:${request.responseKind}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function assertBuiltInInvariants(state: GameState, registry: ContentRegistry): void {
  const roundTrip = deserializeGameState(serializeGameState(state));
  if (canonicalJson(roundTrip) !== canonicalJson(state)) {
    throw new Error("state serialization round-trip changed the state");
  }
  const sequences = state.eventLog.map((event) => event.sequence);
  for (let index = 1; index < sequences.length; index += 1) {
    if (sequences[index]! <= sequences[index - 1]!) {
      throw new Error("event sequences are not strictly increasing");
    }
  }
  if (new Set(sequences).size !== sequences.length) {
    throw new Error("event sequences are not unique");
  }
  if (
    state.eventLog.some((event) => event.revision > state.revision)
  ) {
    throw new Error("event revision exceeds state revision");
  }
  if (
    state.pendingDecision === null &&
    (state.stack.length > 0 || state.triggerQueue.length > 0)
  ) {
    throw new Error("public dispatch left an unresolved effect queue");
  }
  if (
    state.pendingDecision === null &&
    Object.keys(state.effectPlans).length > 0
  ) {
    throw new Error("settled state retained effect plans");
  }
  if (
    state.pendingDecision === null &&
    (state.zones[PROCESSING_ZONE]?.length ?? 0) > 0
  ) {
    throw new Error("settled state retained cards in processing");
  }
  if (
    state.phase !== "finished" &&
    new GameSession(state, registry).legalActions().length === 0
  ) {
    throw new Error("non-terminal state has no legal actions");
  }
}

async function failureTrace(
  initialState: GameState,
  registry: ContentRegistry,
  scenario: string,
  commands: readonly GameCommand[],
  failure: {
    stage: "dispatch" | "invariant";
    message: string;
    command: GameCommand;
  }
): Promise<string> {
  const recorder = new JsonlReplayRecorder(
    new GameSession(initialState, registry),
    registry,
    scenario
  );
  const replayCount = failure.stage === "dispatch"
    ? Math.max(0, commands.length - 1)
    : commands.length;
  for (const command of commands.slice(0, replayCount)) {
    await recorder.dispatch(command);
  }
  recorder.recordFailure({
    index: commands.length - 1,
    stage: failure.stage,
    message: failure.message,
    ...(failure.stage === "dispatch"
      ? { command: failure.command }
      : {})
  });
  return recorder.jsonl();
}

/**
 * Breadth-first bounded model exploration over Core legal actions.
 *
 * The explorer never invents commands: every edge comes from legalActions().
 * It deduplicates semantic states, reduces interchangeable card copies, and
 * emits a JSONL replay prefix for every dispatch or invariant failure.
 */
export async function exploreGameModel(
  initialState: GameState,
  registry: ContentRegistry,
  options: ModelExplorerOptions
): Promise<ModelExplorationResult> {
  if (options.maxDepth < 0) {
    throw new Error("maxDepth must not be negative");
  }
  if (options.maxStates < 1) {
    throw new Error("maxStates must be at least 1");
  }
  if ((options.maxTransitions ?? 0) < 0) {
    throw new Error("maxTransitions must not be negative");
  }
  if ((options.maxTurns ?? 0) < 0) {
    throw new Error("maxTurns must not be negative");
  }
  const scenario = options.scenario ?? "bounded-model-exploration";
  const maxTransitions = options.maxTransitions ?? Number.POSITIVE_INFINITY;
  const maxTurns = options.maxTurns ?? Number.POSITIVE_INFINITY;
  const maxActions = options.maxActionsPerState ?? Number.POSITIVE_INFINITY;
  if (maxActions < 1) {
    throw new Error("maxActionsPerState must be at least 1");
  }
  const initialTurn = initialState.turnNumber;
  const actionTypes = new Set<string>();
  const eventTypes = new Set<string>();
  const decisionReasons = new Set<string>();
  const skillIds = new Set<string>();
  const failures: ModelFailure[] = [];
  const seen = new Set([modelStateFingerprint(initialState)]);
  const queue: FrontierNode[] = [{
    state: structuredClone(initialState),
    commands: [],
    depth: 0
  }];
  let cursor = 0;
  let expandedStates = 0;
  let transitions = 0;
  let duplicateStates = 0;
  let reducedActions = 0;
  let maxDepthReached = 0;
  let maxTurnReached = initialState.turnNumber;
  let truncated = false;

  while (cursor < queue.length) {
    if (seen.size >= options.maxStates || transitions >= maxTransitions) {
      truncated = cursor < queue.length;
      break;
    }
    const node = queue[cursor++]!;
    maxDepthReached = Math.max(maxDepthReached, node.depth);
    maxTurnReached = Math.max(maxTurnReached, node.state.turnNumber);
    if (
      node.depth >= options.maxDepth ||
      node.state.turnNumber - initialTurn >= maxTurns ||
      node.state.phase === "finished"
    ) {
      continue;
    }
    const session = new GameSession(node.state, registry);
    const rawActions = session.legalActions();
    const selection = options.reduceEquivalentActions === false
      ? {
          actions: rawActions.slice(0, maxActions),
          reduced: Math.max(0, rawActions.length - maxActions)
        }
      : reduceModelActions(node.state, rawActions, maxActions);
    reducedActions += selection.reduced;
    expandedStates += 1;

    for (const action of selection.actions) {
      if (
        transitions >= maxTransitions ||
        seen.size >= options.maxStates
      ) {
        truncated = true;
        break;
      }
      actionTypes.add(action.type);
      if ("skillId" in action) skillIds.add(action.skillId);
      const branch = new GameSession(node.state, registry);
      const commands = [...node.commands, structuredClone(action)];
      let events: DomainEvent[];
      let nextState: GameState;
      try {
        const result = branch.dispatch(action);
        events = result.events;
        nextState = result.state;
      } catch (error) {
        const message = errorMessage(error);
        failures.push({
          stage: "dispatch",
          message,
          depth: node.depth + 1,
          command: structuredClone(action),
          commands,
          jsonl: await failureTrace(
            initialState,
            registry,
            scenario,
            commands,
            { stage: "dispatch", message, command: action }
          )
        });
        continue;
      }
      transitions += 1;
      for (const event of events) eventTypes.add(event.type);
      const reason = decisionReason(nextState);
      if (reason) decisionReasons.add(reason);

      try {
        assertBuiltInInvariants(nextState, registry);
        const custom = options.invariant?.({
          initialState,
          state: nextState,
          command: action,
          events,
          depth: node.depth + 1
        });
        if (custom === false) throw new Error("custom invariant returned false");
        if (typeof custom === "string") throw new Error(custom);
      } catch (error) {
        const message = errorMessage(error);
        failures.push({
          stage: "invariant",
          message,
          depth: node.depth + 1,
          command: structuredClone(action),
          commands,
          jsonl: await failureTrace(
            initialState,
            registry,
            scenario,
            commands,
            { stage: "invariant", message, command: action }
          )
        });
        continue;
      }

      const fingerprint = modelStateFingerprint(nextState);
      if (seen.has(fingerprint)) {
        duplicateStates += 1;
        continue;
      }
      seen.add(fingerprint);
      queue.push({
        state: nextState,
        commands,
        depth: node.depth + 1
      });
    }
  }

  return {
    visitedStates: seen.size,
    expandedStates,
    transitions,
    duplicateStates,
    reducedActions,
    maxDepthReached,
    maxTurnReached,
    truncated,
    coverage: {
      actionTypes: [...actionTypes].sort(),
      eventTypes: [...eventTypes].sort(),
      decisionReasons: [...decisionReasons].sort(),
      skillIds: [...skillIds].sort()
    },
    failures
  };
}

interface ProbedAction {
  action: LegalAction;
  state: GameState;
  events: DomainEvent[];
  reason?: string;
  score: number;
}

/**
 * Runs one deterministic game path, probing the legal frontier at every step
 * and preferring transitions that add unseen action, event, decision, or skill
 * features. Different seeded fixtures provide the fuzz dimension while every
 * selected path remains exactly replayable.
 */
export async function runCoverageGuidedGame(
  initialState: GameState,
  registry: ContentRegistry,
  options: CoverageGuidedOptions
): Promise<CoverageGuidedResult> {
  if (options.maxSteps < 1 || options.maxTurns < 1) {
    throw new Error("coverage-guided budgets must be at least 1");
  }
  const scenario = options.scenario ?? "coverage-guided-game";
  const recorder = new JsonlReplayRecorder(
    new GameSession(initialState, registry),
    registry,
    scenario
  );
  const actionTypes = new Set<string>();
  const eventTypes = new Set<string>();
  const decisionReasons = new Set<string>();
  const skillIds = new Set<string>();
  const commands: GameCommand[] = [];
  const initialTurn = initialState.turnNumber;
  let maxTurnReached = initialTurn;

  const coverage = (): ModelCoverage => ({
    actionTypes: [...actionTypes].sort(),
    eventTypes: [...eventTypes].sort(),
    decisionReasons: [...decisionReasons].sort(),
    skillIds: [...skillIds].sort()
  });

  for (let step = 0; step < options.maxSteps; step += 1) {
    const current = recorder.session().state();
    maxTurnReached = Math.max(maxTurnReached, current.turnNumber);
    if (current.phase === "finished") {
      return {
        state: current,
        steps: step,
        maxTurnReached,
        terminated: true,
        reason: "finished",
        coverage: coverage(),
        replayJsonl: recorder.jsonl()
      };
    }
    if (current.turnNumber - initialTurn >= options.maxTurns) {
      return {
        state: current,
        steps: step,
        maxTurnReached,
        terminated: true,
        reason: "turn-limit",
        coverage: coverage(),
        replayJsonl: recorder.jsonl()
      };
    }
    const frontier = reduceModelActions(
      current,
      recorder.session().legalActions(),
      options.maxActionsPerState ?? 16
    ).actions;
    const probes: ProbedAction[] = [];
    for (const action of frontier) {
      const branch = new GameSession(current, registry);
      let nextState: GameState;
      let events: DomainEvent[];
      try {
        const result = branch.dispatch(action);
        nextState = result.state;
        events = result.events;
      } catch (error) {
        const message = errorMessage(error);
        const stage = "dispatch" as const;
        const failureCommands = [...commands, structuredClone(action)];
        const failure: ModelFailure = {
          stage,
          message,
          depth: failureCommands.length,
          command: structuredClone(action),
          commands: failureCommands,
          jsonl: await failureTrace(
            initialState,
            registry,
            scenario,
            failureCommands,
            { stage, message, command: action }
          )
        };
        return {
          state: current,
          steps: step,
          maxTurnReached,
          terminated: false,
          reason: "failure",
          coverage: coverage(),
          replayJsonl: failure.jsonl,
          failure
        };
      }
      try {
        assertBuiltInInvariants(nextState, registry);
      } catch (error) {
        const message = errorMessage(error);
        const stage = "invariant" as const;
        const failureCommands = [...commands, structuredClone(action)];
        const failure: ModelFailure = {
          stage,
          message,
          depth: failureCommands.length,
          command: structuredClone(action),
          commands: failureCommands,
          jsonl: await failureTrace(
            initialState,
            registry,
            scenario,
            failureCommands,
            { stage, message, command: action }
          )
        };
        return {
          state: current,
          steps: step,
          maxTurnReached,
          terminated: false,
          reason: "failure",
          coverage: coverage(),
          replayJsonl: failure.jsonl,
          failure
        };
      }
      const reason = decisionReason(nextState);
      const actionSkillId = "skillId" in action ? action.skillId : undefined;
      const eventSkillIds = events.flatMap((event) =>
        event.type === "SkillActivated" && "skillId" in event
          ? [event.skillId]
          : []
      );
      const score =
        (actionTypes.has(action.type) ? 0 : 30) +
        events.filter((event) => !eventTypes.has(event.type)).length * 20 +
        (reason && !decisionReasons.has(reason) ? 15 : 0) +
        (actionSkillId && !skillIds.has(actionSkillId) ? 25 : 0) +
        eventSkillIds.filter((id) => !skillIds.has(id)).length * 25 +
        Math.max(0, nextState.turnNumber - current.turnNumber) * 2;
      probes.push({
        action,
        state: nextState,
        events,
        ...(reason ? { reason } : {}),
        score
      });
    }
    const selected = probes.sort((left, right) =>
      right.score - left.score ||
      modelActionKey(current, left.action).localeCompare(
        modelActionKey(current, right.action)
      )
    )[0];
    if (!selected) {
      const message = "non-terminal state has no model actions";
      const action = {
        type: "end-turn",
        playerId: current.currentPlayerId
      } as GameCommand;
      const failure: ModelFailure = {
        stage: "invariant",
        message,
        depth: commands.length,
        command: action,
        commands: [...commands],
        jsonl: recorder.jsonl()
      };
      recorder.recordFailure({
        index: commands.length,
        stage: "invariant",
        message
      });
      failure.jsonl = recorder.jsonl();
      return {
        state: current,
        steps: step,
        maxTurnReached,
        terminated: false,
        reason: "failure",
        coverage: coverage(),
        replayJsonl: failure.jsonl,
        failure
      };
    }
    await recorder.dispatch(selected.action);
    commands.push(structuredClone(selected.action));
    actionTypes.add(selected.action.type);
    if ("skillId" in selected.action) skillIds.add(selected.action.skillId);
    for (const event of selected.events) {
      eventTypes.add(event.type);
      if (event.type === "SkillActivated") skillIds.add(event.skillId);
    }
    if (selected.reason) decisionReasons.add(selected.reason);
  }

  const state = recorder.session().state();
  return {
    state,
    steps: options.maxSteps,
    maxTurnReached: Math.max(maxTurnReached, state.turnNumber),
    terminated: false,
    reason: "step-limit",
    coverage: coverage(),
    replayJsonl: recorder.jsonl()
  };
}

export interface SkillPairCase {
  firstSkillId: string;
  secondSkillId: string;
  firstDomains: string[];
  secondDomains: string[];
  sharedDomains: string[];
}

export function skillInteractionDomains(skill: SkillDefinition): string[] {
  const domains = new Set<string>();
  for (const ability of skill.abilities ?? []) {
    domains.add(`ability:${ability.type}`);
    if (ability.type === "trigger") {
      domains.add(`event:${ability.eventType}`);
    } else if (ability.type === "timing") {
      domains.add(`effect:${ability.match.effectType}`);
      domains.add(`timing:${ability.timing}`);
      domains.add(`timing-operation:${ability.operation.type}`);
      if (ability.match.responseKind) {
        domains.add(`decision:response:${ability.match.responseKind}`);
      }
    } else if (ability.type === "view-as") {
      if (ability.definitionId) {
        domains.add(`card:${ability.definitionId}`);
      }
      for (const definitionId of ability.definitionIds ?? []) {
        domains.add(`card:${definitionId}`);
      }
      if (ability.action) domains.add("phase:action");
      if (ability.response) domains.add("decision:response");
    } else if (ability.type === "active") {
      domains.add("phase:action");
    } else if (ability.type === "modify-response-count") {
      domains.add(`decision:response:${ability.responseKind}`);
    } else if (ability.type === "modify-card-property") {
      domains.add(`card-property:${ability.property}`);
    } else if (ability.type === "modify-hand-limit") {
      domains.add("phase:discard");
    } else if (ability.type === "allow-end-turn") {
      domains.add(`phase:${ability.phase}`);
    } else if (ability.type === "modify-usage") {
      domains.add("phase:action");
    } else if (ability.type === "forbid-card-use") {
      domains.add("phase:action");
    } else if (ability.type === "forbid-targeting-owner") {
      domains.add("targeting");
    } else if (ability.type === "modify-targeting") {
      domains.add("targeting");
    } else if (ability.type === "restrict-rescue-during-owner-turn") {
      domains.add("decision:response:peach");
    }
  }
  return [...domains].sort();
}

export function enumerateSkillPairs(
  registry: ContentRegistry
): SkillPairCase[] {
  const skillIds = [...new Set(
    registry.heroes().flatMap((hero) => hero.skillIds)
  )].sort();
  const domains = new Map(skillIds.map((skillId) => [
    skillId,
    skillInteractionDomains(registry.skill(skillId))
  ]));
  const result: SkillPairCase[] = [];
  for (let first = 0; first < skillIds.length; first += 1) {
    for (let second = first + 1; second < skillIds.length; second += 1) {
      const firstSkillId = skillIds[first]!;
      const secondSkillId = skillIds[second]!;
      const firstDomains = domains.get(firstSkillId)!;
      const secondDomains = domains.get(secondSkillId)!;
      const secondSet = new Set(secondDomains);
      result.push({
        firstSkillId,
        secondSkillId,
        firstDomains,
        secondDomains,
        sharedDomains: firstDomains.filter((domain) => secondSet.has(domain))
      });
    }
  }
  return result;
}

export interface SkillTripleCase {
  skillIds: [string, string, string];
  sharedDomains: string[];
  pairwiseSharedDomainCount: number;
  riskScore: number;
}

const HIGH_RISK_DOMAIN_WEIGHTS: Record<string, number> = {
  "ability:timing": 5,
  "decision:response": 4,
  "decision:response:jink": 4,
  "decision:response:peach": 5,
  "decision:response:slash": 4,
  "event:CardMoved": 5,
  "event:DamageApplied": 6,
  "event:JudgmentResolved": 6,
  "event:PhaseChanged": 4,
  "phase:action": 3,
  "phase:discard": 4,
  targeting: 5
};

/**
 * Ranks the full C(n, 3) space and returns only triples with a concrete
 * interaction edge. This is the targeted alternative to executing every
 * ordering of every skill.
 */
export function selectHighRiskSkillTriples(
  registry: ContentRegistry,
  maximum = 256
): SkillTripleCase[] {
  const skillIds = [...new Set(
    registry.heroes().flatMap((hero) => hero.skillIds)
  )].sort();
  const domains = new Map(skillIds.map((skillId) => [
    skillId,
    skillInteractionDomains(registry.skill(skillId))
  ]));
  const candidates: SkillTripleCase[] = [];
  for (let first = 0; first < skillIds.length; first += 1) {
    for (let second = first + 1; second < skillIds.length; second += 1) {
      for (let third = second + 1; third < skillIds.length; third += 1) {
        const ids: [string, string, string] = [
          skillIds[first]!,
          skillIds[second]!,
          skillIds[third]!
        ];
        const sets = ids.map((id) => new Set(domains.get(id)!));
        const sharedDomains = [...sets[0]!].filter(
          (domain) => sets[1]!.has(domain) && sets[2]!.has(domain)
        );
        const pairwiseSharedDomainCount =
          [...sets[0]!].filter((domain) => sets[1]!.has(domain)).length +
          [...sets[0]!].filter((domain) => sets[2]!.has(domain)).length +
          [...sets[1]!].filter((domain) => sets[2]!.has(domain)).length;
        if (pairwiseSharedDomainCount === 0) continue;
        const riskScore =
          pairwiseSharedDomainCount +
          sharedDomains.length * 10 +
          [...new Set(sets.flatMap((set) => [...set]))].reduce(
            (total, domain) =>
              total + (HIGH_RISK_DOMAIN_WEIGHTS[domain] ?? 0),
            0
          );
        candidates.push({
          skillIds: ids,
          sharedDomains: sharedDomains.sort(),
          pairwiseSharedDomainCount,
          riskScore
        });
      }
    }
  }
  return candidates
    .sort((left, right) =>
      right.riskScore - left.riskScore ||
      canonicalJson(left.skillIds).localeCompare(canonicalJson(right.skillIds))
    )
    .slice(0, maximum);
}
