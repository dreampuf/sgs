import type {
  CardMoveReason,
  CardInstanceId,
  EffectDraft,
  GameState,
  PlayerId,
  WorkflowData,
  WorkflowValue
} from "./types";

export type ProgramPlayerRef =
  | "source"
  | "target"
  | { type: "target-at"; index: number };
export type ProgramPlayerSet = "targets" | "all-alive" | "all-other-alive";
export type ProgramZone = "hand" | "equipment" | "judgment";

export type ProgramNumber =
  | number
  | { type: "material-count" }
  | { type: "event-number"; field: string }
  | {
      type: "boolean-mark";
      player: ProgramPlayerRef;
      mark: string;
      whenTrue: number;
      whenFalse: number;
    };

export type ProgramString =
  | string
  | { type: "card-id-prefixed"; prefix: string };

export type ProgramWorkflowData = Record<
  string,
  WorkflowValue | { type: "event-field"; field: string }
>;

export type AbilityStep =
  | {
      type: "for-each-player";
      players: ProgramPlayerSet;
      steps: AbilityStep[];
    }
  | {
      type: "if-target-count";
      equals: number;
      then: AbilityStep[];
      otherwise?: AbilityStep[];
    }
  | {
      type: "if-turn-usage-crosses";
      player: ProgramPlayerRef;
      key: string;
      threshold: number;
      added: ProgramNumber;
      then: AbilityStep[];
    }
  | {
      type: "request-card-selection";
      chooser: ProgramPlayerRef;
      owner: ProgramPlayerRef;
      zones: ProgramZone[];
      cardFilter?: {
        equipmentSlots?: Array<
          "weapon" | "armor" | "defensive-horse" | "offensive-horse"
        >;
      };
      minimum: number;
      maximum: number;
      destination:
        | { type: "discard" }
        | { type: "hand"; player: ProgramPlayerRef };
      reason: string;
      moveReason: CardMoveReason;
    }
  | {
      type: "damage";
      source: ProgramPlayerRef;
      target: ProgramPlayerRef;
      amount: ProgramNumber;
      nature: "normal" | "fire" | "thunder";
      tags?: string[];
    }
  | {
      type: "equip";
      player: ProgramPlayerRef;
      slot: "weapon" | "armor" | "defensive-horse" | "offensive-horse";
    }
  | {
      type: "place-delayed";
      player: ProgramPlayerRef;
    }
  | {
      type: "move-card";
      to:
        | { type: "discard" }
        | { type: "zone"; zone: ProgramZone; player: ProgramPlayerRef };
      reason: CardMoveReason;
    }
  | {
      type: "move-materials";
      to:
        | { type: "discard" }
        | { type: "zone"; zone: ProgramZone; player: ProgramPlayerRef };
      reason: CardMoveReason;
    }
  | {
      type: "obtain-cause-card";
      player: ProgramPlayerRef;
      reason: CardMoveReason;
    }
  | {
      type: "recover";
      player: ProgramPlayerRef;
      amount: ProgramNumber;
      source?: ProgramPlayerRef;
    }
  | {
      type: "lose-hp";
      player: ProgramPlayerRef;
      amount: ProgramNumber;
    }
  | {
      type: "draw";
      player: ProgramPlayerRef;
      count: ProgramNumber;
      tags?: string[];
    }
  | {
      type: "increment-turn-usage";
      player: ProgramPlayerRef;
      key: string;
      amount: ProgramNumber;
    }
  | {
      type: "set-mark";
      player: ProgramPlayerRef;
      mark: ProgramString;
      value: number | boolean;
    }
  | {
      type: "toggle-chain";
      player: ProgramPlayerRef;
    }
  | {
      type: "cancel";
      reason: "jink" | "nullification";
    }
  | {
      type: "run-workflow";
      workflowId: string;
      data?: ProgramWorkflowData;
    }
  | {
      type: "use-card-definition";
      definitionId: string;
      source: ProgramPlayerRef;
      targets: ProgramPlayerRef[];
      skillId?: string;
    }
  | {
      type: "request-judgment";
      player: ProgramPlayerRef;
      reason: string;
      pattern: {
        includedSuits?: Array<"diamond" | "heart" | "club" | "spade">;
        excludedSuits?: Array<"diamond" | "heart" | "club" | "spade">;
        minimumRank?: number;
        maximumRank?: number;
      };
      onMatch: AbilityStep[];
      onMiss?: AbilityStep[];
    };

export interface AbilityProgram {
  steps: AbilityStep[];
}

export interface AbilityProgramQueries {
  equipmentSlot(
    definitionId: string
  ): "weapon" | "armor" | "defensive-horse" | "offensive-horse" | undefined;
}

interface CompileContext {
  state: Readonly<GameState>;
  sourceId: PlayerId;
  cardId: CardInstanceId;
  targetIds: PlayerId[];
  materialCardIds: CardInstanceId[];
  queries: AbilityProgramQueries;
  preserveTargetScopes: boolean;
  targetId?: PlayerId;
  triggerEvent?: GameState["eventLog"][number];
}

function player(context: CompileContext, ref: ProgramPlayerRef): PlayerId {
  if (ref === "source") return context.sourceId;
  if (typeof ref !== "string") {
    const playerId = context.targetIds[ref.index];
    if (!playerId) {
      throw new Error(`card program target index is missing: ${ref.index}`);
    }
    return playerId;
  }
  if (!context.targetId) {
    throw new Error("card program referenced target outside a target scope");
  }
  return context.targetId;
}

function players(
  context: CompileContext,
  ref: ProgramPlayerSet
): PlayerId[] {
  if (ref === "targets") return [...context.targetIds];
  const alive = context.state.turnOrder.filter(
    (playerId) => context.state.players[playerId]?.alive
  );
  return ref === "all-other-alive"
    ? alive.filter((playerId) => playerId !== context.sourceId)
    : alive;
}

function number(context: CompileContext, value: ProgramNumber): number {
  if (typeof value === "number") return value;
  if (value.type === "material-count") {
    return context.materialCardIds.length;
  }
  if (value.type === "event-number") {
    if (!context.triggerEvent) {
      throw new Error(
        `event number ${value.field} requires a trigger event`
      );
    }
    const fieldValue = (
      context.triggerEvent as unknown as Record<string, unknown>
    )[value.field];
    if (typeof fieldValue !== "number") {
      throw new Error(
        `trigger event field ${value.field} is not a number`
      );
    }
    return fieldValue;
  }
  return context.state.players[player(context, value.player)]
    ?.marks[value.mark] === true
    ? value.whenTrue
    : value.whenFalse;
}

function string(context: CompileContext, value: ProgramString): string {
  return typeof value === "string"
    ? value
    : `${value.prefix}:${context.cardId}`;
}

function workflowData(
  context: CompileContext,
  data: ProgramWorkflowData | undefined
): WorkflowData {
  return Object.fromEntries(
    Object.entries(data ?? {}).map(([key, value]) => {
      if (
        value !== null &&
        !Array.isArray(value) &&
        typeof value === "object" &&
        value.type === "event-field" &&
        typeof value.field === "string"
      ) {
        if (!context.triggerEvent) {
          throw new Error(
            `workflow data ${key} requires a trigger event`
          );
        }
        const eventValue = (
          context.triggerEvent as unknown as Record<string, WorkflowValue>
        )[value.field];
        if (eventValue === undefined) {
          throw new Error(
            `trigger event ${context.triggerEvent.type} has no field ${value.field}`
          );
        }
        return [key, structuredClone(eventValue)];
      }
      return [key, structuredClone(value)];
    })
  );
}

function zoneId(zone: ProgramZone, playerId: PlayerId): string {
  return `zone:${zone}:${playerId}`;
}

function compileSteps(
  context: CompileContext,
  steps: readonly AbilityStep[]
): EffectDraft[] {
  return steps.flatMap((step): EffectDraft[] => {
    switch (step.type) {
      case "for-each-player":
        return players(context, step.players).flatMap((targetId) => {
          const effects = compileSteps(
            { ...context, targetId },
            step.steps
          );
          return context.preserveTargetScopes
            ? [{
                type: "resolve-target" as const,
                sourceId: context.sourceId,
                cardId: context.cardId,
                targetId,
                effects
              }]
            : effects;
        });
      case "if-target-count":
        return compileSteps(
          context,
          context.targetIds.length === step.equals
            ? step.then
            : step.otherwise ?? []
        );
      case "if-turn-usage-crosses": {
        const playerId = player(context, step.player);
        const previous =
          context.state.turnUsage[playerId]?.[step.key] ?? 0;
        const added = number(context, step.added);
        return previous < step.threshold &&
          previous + added >= step.threshold
          ? compileSteps(context, step.then)
          : [];
      }
      case "request-card-selection": {
        const ownerId = player(context, step.owner);
        return [{
          type: "request-card-selection",
          chooserId: player(context, step.chooser),
          cardId: context.cardId,
          selectableCardIds: step.zones.flatMap((zone) =>
            context.state.zones[zoneId(zone, ownerId)] ?? []
          ).filter((cardId) => {
            if (!step.cardFilter?.equipmentSlots) return true;
            const definitionId = context.state.cards[cardId]?.definitionId;
            if (!definitionId) return false;
            const slot = context.queries.equipmentSlot(definitionId);
            return slot !== undefined &&
              step.cardFilter.equipmentSlots.includes(slot);
          }),
          minimum: step.minimum,
          maximum: step.maximum,
          destination: step.destination.type === "discard"
            ? { type: "discard" }
            : {
                type: "hand",
                playerId: player(context, step.destination.player)
              },
          reason: step.reason,
          moveReason: step.moveReason
        }];
      }
      case "damage":
        return [{
          type: "damage",
          sourceId: player(context, step.source),
          targetId: player(context, step.target),
          amount: number(context, step.amount),
          cardId: context.cardId,
          nature: step.nature,
          ...(step.tags ? { tags: [...step.tags] } : {})
        }];
      case "recover":
        return [{
          type: "recover",
          playerId: player(context, step.player),
          amount: number(context, step.amount),
          cardId: context.cardId,
          ...(step.source
            ? { sourceId: player(context, step.source) }
            : {})
        }];
      case "lose-hp":
        return [{
          type: "lose-hp",
          playerId: player(context, step.player),
          amount: number(context, step.amount),
          cardId: context.cardId
        }];
      case "draw":
        return [{
          type: "draw",
          playerId: player(context, step.player),
          count: number(context, step.count),
          cardId: context.cardId,
          ...(step.tags ? { tags: [...step.tags] } : {})
        }];
      case "equip":
        return [{
          type: "equip",
          playerId: player(context, step.player),
          cardId: context.cardId,
          slot: step.slot
        }];
      case "place-delayed":
        return [{
          type: "place-delayed",
          playerId: player(context, step.player),
          cardId: context.cardId
        }];
      case "move-card":
        return [{
          type: "move-card",
          cardId: context.cardId,
          toZoneId: step.to.type === "discard"
            ? "zone:discard"
            : zoneId(step.to.zone, player(context, step.to.player)),
          reason: step.reason
        }];
      case "move-materials":
        return context.materialCardIds.map((cardId) => ({
          type: "move-card",
          cardId,
          toZoneId: step.to.type === "discard"
            ? "zone:discard"
            : zoneId(step.to.zone, player(context, step.to.player)),
          reason: step.reason
        }));
      case "obtain-cause-card": {
        const cause = context.state.cards[context.cardId];
        const cardIds = cause?.virtual
          ? cause.materialCardIds ?? []
          : cause
            ? [context.cardId]
            : [];
        return cardIds
          .filter((cardId) =>
            (context.state.zones["zone:processing"] ?? []).includes(cardId)
          )
          .map((cardId) => ({
            type: "move-card",
            cardId,
            toZoneId: zoneId("hand", player(context, step.player)),
            reason: step.reason
          }));
      }
      case "increment-turn-usage":
        return [{
          type: "increment-turn-usage",
          playerId: player(context, step.player),
          key: step.key,
          amount: number(context, step.amount)
        }];
      case "set-mark":
        return [{
          type: "set-mark",
          playerId: player(context, step.player),
          mark: string(context, step.mark),
          value: step.value,
          cardId: context.cardId
        }];
      case "toggle-chain":
        return [{
          type: "toggle-chain",
          playerId: player(context, step.player),
          cardId: context.cardId
        }];
      case "cancel":
        return [{
          type: "cancel",
          cardId: context.cardId,
          reason: step.reason,
          sourceId: context.sourceId,
          ...(context.targetId ? { targetId: context.targetId } : {})
        }];
      case "run-workflow":
        return [{
          type: "run-workflow",
          workflowId: step.workflowId,
          context: {
            sourceId: context.sourceId,
            cardId: context.cardId,
            targetIds: context.targetId
              ? [context.targetId]
              : [...context.targetIds],
          },
          data: workflowData(context, step.data)
        }];
      case "use-card-definition":
        return [{
          type: "use-card-definition",
          sourceId: player(context, step.source),
          definitionId: step.definitionId,
          targetIds: step.targets.map((target) => player(context, target)),
          ...(step.skillId ? { skillId: step.skillId } : {})
        }];
      case "request-judgment":
        return [{
          type: "request-judgment",
          playerId: player(context, step.player),
          cardId: context.cardId,
          reason: step.reason,
          pattern: structuredClone(step.pattern),
          onMatch: compileSteps(context, step.onMatch),
          onMiss: compileSteps(context, step.onMiss ?? [])
        }];
    }
  });
}

export function compileAbilityProgram(
  state: Readonly<GameState>,
  sourceId: PlayerId,
  cardId: CardInstanceId,
  targetIds: PlayerId[],
  program: Readonly<AbilityProgram>,
  queries: AbilityProgramQueries,
  materialCardIds: CardInstanceId[] = [],
  triggerEvent?: GameState["eventLog"][number],
  preserveTargetScopes = false,
  scopedTargetId?: PlayerId
): EffectDraft[] {
  return compileSteps(
    {
      state,
      sourceId,
      cardId,
      targetIds: [...targetIds],
      materialCardIds: [...materialCardIds],
      queries,
      preserveTargetScopes,
      ...(scopedTargetId ? { targetId: scopedTargetId } : {}),
      ...(triggerEvent ? { triggerEvent: structuredClone(triggerEvent) } : {})
    },
    program.steps
  );
}
