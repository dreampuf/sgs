import {
  DISCARD_PILE,
  DRAW_PILE,
  equipmentZone,
  handZone,
  judgmentZone
} from "../core/state";
import type {
  SkillDefinition,
  WorkflowDefinition,
  WorkflowRunContext
} from "../core/registry";
import type {
  CardInstanceId,
  EffectDraft,
  PlayerId,
  WorkflowData,
  WorkflowValue
} from "../core/types";
import type { CardResolutionRule } from "../core/card-resolution";
import { STANDARD_CARD } from "./standard/cards";

export const EARLY_WORKFLOW = {
  shensu: "wind:workflow:shensu",
  jushou: "wind:workflow:jushou",
  tianxiang: "wind:workflow:tianxiang",
  buquDying: "wind:workflow:buqu-dying",
  buquDeath: "wind:workflow:buqu-death",
  buquRecover: "wind:workflow:buqu-recover",
  guhuo: "wind:workflow:guhuo",
  qiangxi: "fire:workflow:qiangxi",
  quhu: "fire:workflow:quhu",
  jieming: "fire:workflow:jieming",
  niepan: "fire:workflow:niepan",
  shuangxiong: "fire:workflow:shuangxiong",
  tianyi: "fire:workflow:tianyi",
  mengjin: "fire:workflow:mengjin",
  xingshang: "forest:workflow:xingshang",
  fangzhu: "forest:workflow:fangzhu",
  songwei: "forest:workflow:songwei",
  zaiqi: "forest:workflow:zaiqi",
  lieren: "forest:workflow:lieren",
  yinghun: "forest:workflow:yinghun",
  haoshi: "forest:workflow:haoshi",
  dimeng: "forest:workflow:dimeng",
  luanwu: "forest:workflow:luanwu",
  benghuai: "forest:workflow:benghuai",
  baonue: "forest:workflow:baonue"
} as const;

const skillId = (pack: "wind" | "fire" | "forest", name: string): string =>
  `${pack}:skill:${name}`;

function text(data: Readonly<WorkflowData>, key: string): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

function number(
  data: Readonly<WorkflowData>,
  key: string
): number | undefined {
  const value = data[key];
  return typeof value === "number" ? value : undefined;
}

function strings(
  data: Readonly<WorkflowData>,
  key: string
): string[] {
  const value = data[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function cardIdsIn(
  state: WorkflowRunContext["state"],
  playerId: PlayerId,
  zones: Array<"hand" | "equipment" | "judgment">
): CardInstanceId[] {
  return zones.flatMap((zone) =>
    state.zones[`zone:${zone}:${playerId}`] ?? []
  );
}

function aliveOthers(
  state: WorkflowRunContext["state"],
  playerId: PlayerId
): PlayerId[] {
  return state.turnOrder.filter(
    (candidate) =>
      candidate !== playerId && state.players[candidate]?.alive === true
  );
}

function moveCards(
  cardIds: readonly CardInstanceId[],
  toZoneId: string,
  reason: "discard" | "give" | "skill" | "pindian" = "skill"
): EffectDraft[] {
  return cardIds.map((cardId) => ({
    type: "move-card" as const,
    cardId,
    toZoneId,
    reason
  }));
}

function optional(
  context: WorkflowRunContext,
  reason: string,
  onActivate: () => ReturnType<WorkflowDefinition["run"]>
): ReturnType<WorkflowDefinition["run"]> {
  if (context.input?.type === "option-selected") {
    return context.input.option === "activate" ? onActivate() : {};
  }
  return {
    decision: {
      type: "choose-option",
      playerId: context.context.sourceId,
      cardId: context.context.cardId,
      options: ["skip", "activate"],
      reason
    }
  };
}

const shensu: WorkflowDefinition = {
  id: EARLY_WORKFLOW.shensu,
  run(runtime) {
    const { state, context, data, input } = runtime;
    const mode = number(data, "mode") ?? 1;
    const selectedCards = strings(data, "selectedCards");
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      if (mode === 2) {
        const equipment = state.zones[equipmentZone(context.sourceId)] ?? [];
        if (equipment.length === 0) return {};
        return {
          decision: {
            type: "select-cards",
            playerId: context.sourceId,
            cardId: context.cardId,
            selectableCardIds: equipment,
            minimum: 1,
            maximum: 1,
            reason: "shensu-cost"
          },
          resumeData: { mode }
        };
      }
      return {
        decision: {
          type: "select-players",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectablePlayerIds: aliveOthers(state, context.sourceId),
          minimum: 1,
          maximum: 1,
          reason: "shensu-target"
        },
        resumeData: { mode }
      };
    }
    if (input?.type === "selected") {
      return {
        decision: {
          type: "select-players",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectablePlayerIds: aliveOthers(state, context.sourceId),
          minimum: 1,
          maximum: 1,
          reason: "shensu-target"
        },
        resumeData: { mode, selectedCards: input.cardIds }
      };
    }
    if (input?.type === "players-selected") {
      const targetId = input.playerIds[0];
      if (!targetId) return {};
      const effects: EffectDraft[] = [
        ...moveCards(selectedCards, DISCARD_PILE, "discard"),
        {
          type: "use-card-definition",
          sourceId: context.sourceId,
          definitionId: STANDARD_CARD.slash,
          targetIds: [targetId],
          skillId: skillId("wind", "神速")
        }
      ];
      if (mode === 1) {
        effects.push(
          {
            type: "set-mark",
            playerId: context.sourceId,
            mark: "skipDraw",
            value: true,
            cardId: context.cardId
          },
          {
            type: "change-phase",
            playerId: context.sourceId,
            to: "draw"
          }
        );
      } else {
        effects.push({
          type: "change-phase",
          playerId: context.sourceId,
          to: "discard"
        });
      }
      return { effects };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: `shensu-${mode}`
      },
      resumeData: { mode }
    };
  }
};

const jushou: WorkflowDefinition = {
  id: EARLY_WORKFLOW.jushou,
  run(runtime) {
    return optional(runtime, "jushou", () => ({
      effects: [
        {
          type: "draw",
          playerId: runtime.context.sourceId,
          count: 3,
          cardId: runtime.context.cardId
        },
        {
          type: "set-player-state",
          playerId: runtime.context.sourceId,
          cardId: runtime.context.cardId,
          faceUp: false
        }
      ]
    }));
  }
};

const tianxiang: WorkflowDefinition = {
  id: EARLY_WORKFLOW.tianxiang,
  run({ state, context, data, input, effectiveCardSuit }) {
    const phase = text(data, "phase") ?? "cost";
    const selectedCardId = text(data, "selectedCardId");
    if (phase === "after-damage") {
      const targetId = text(data, "targetId");
      if (!targetId) return {};
      const player = state.players[targetId];
      return player?.alive
        ? {
            effects: [{
              type: "draw",
              playerId: targetId,
              count: Math.max(0, player.maxHp - player.hp),
              cardId: context.cardId
            }]
          }
        : {};
    }
    if (input?.type === "selected") {
      const cardId = input.cardIds[0];
      if (!cardId) return {};
      return {
        decision: {
          type: "select-players",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectablePlayerIds: aliveOthers(state, context.sourceId),
          minimum: 1,
          maximum: 1,
          reason: "tianxiang-target"
        },
        resumeData: {
          ...data,
          phase: "target",
          selectedCardId: cardId
        }
      };
    }
    if (input?.type === "players-selected") {
      const targetId = input.playerIds[0];
      const raw = data.effect;
      if (
        !targetId ||
        !selectedCardId ||
        !raw ||
        typeof raw !== "object" ||
        Array.isArray(raw)
      ) {
        return {};
      }
      const effect = raw as Record<string, WorkflowValue>;
      const amount = typeof effect.amount === "number" ? effect.amount : 1;
      const sourceId = typeof effect.sourceId === "string"
        ? effect.sourceId
        : context.sourceId;
      const nature = effect.nature === "fire" || effect.nature === "thunder"
        ? effect.nature
        : "normal";
      return {
        effects: [
          {
            type: "move-card",
            cardId: selectedCardId,
            toZoneId: DISCARD_PILE,
            reason: "discard"
          },
          {
            type: "damage",
            sourceId,
            targetId,
            amount,
            cardId: context.cardId,
            nature,
            propagated: true
          },
          {
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.tianxiang,
            context,
            data: { phase: "after-damage", targetId }
          }
        ]
      };
    }
    const hearts = (state.zones[handZone(context.sourceId)] ?? []).filter(
      (cardId) => effectiveCardSuit(cardId, context.sourceId) === "heart"
    );
    if (hearts.length === 0) {
      const raw = data.effect;
      return raw && typeof raw === "object" && !Array.isArray(raw)
        ? { effects: [raw as unknown as EffectDraft] }
        : {};
    }
    return {
      decision: {
        type: "select-cards",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectableCardIds: hearts,
        minimum: 1,
        maximum: 1,
        reason: "tianxiang-cost"
      },
      resumeData: { ...data, phase: "cost" }
    };
  }
};

const buquDying: WorkflowDefinition = {
  id: EARLY_WORKFLOW.buquDying,
  run({ state, context, input }) {
    if (input?.type === "cards-taken") return {};
    const player = state.players[context.sourceId];
    if (!player) return {};
    const zone = `zone:special:buqu:${context.sourceId}`;
    const current = state.zones[zone]?.length ?? 0;
    const needed = Math.max(0, 1 - player.hp - current);
    return needed === 0
      ? {}
      : {
          effects: [{
            type: "take-top-cards",
            cardId: context.cardId,
            count: needed,
            toZoneId: zone,
            reason: "buqu",
            resume: {
              workflowId: EARLY_WORKFLOW.buquDying,
              context,
              data: {}
            }
          }]
        };
  }
};

const buquDeath: WorkflowDefinition = {
  id: EARLY_WORKFLOW.buquDeath,
  run({ state, context, data }) {
    const cards = state.zones[`zone:special:buqu:${context.sourceId}`] ?? [];
    const ranks = cards.map((cardId) => state.cards[cardId]?.rank);
    if (
      cards.length > 0 &&
      ranks.every((rank) => rank !== undefined) &&
      new Set(ranks).size === ranks.length
    ) {
      return {
        effects: [{
          type: "set-player-state",
          playerId: context.sourceId,
          cardId: context.cardId,
          dying: false
        }]
      };
    }
    const raw = data.effect;
    return raw && typeof raw === "object" && !Array.isArray(raw)
      ? { effects: [raw as unknown as EffectDraft] }
      : {};
  }
};

const buquRecover: WorkflowDefinition = {
  id: EARLY_WORKFLOW.buquRecover,
  run({ state, context, input }) {
    const player = state.players[context.sourceId];
    const zone = `zone:special:buqu:${context.sourceId}`;
    const cards = state.zones[zone] ?? [];
    if (!player || cards.length === 0) return {};
    const keep = Math.max(0, 1 - player.hp);
    if (input?.type === "selected") {
      return {
        effects: moveCards(input.cardIds, DISCARD_PILE, "skill")
      };
    }
    const remove = Math.max(0, cards.length - keep);
    if (remove === 0) return {};
    if (keep === 0) {
      return {
        effects: moveCards(cards, DISCARD_PILE, "skill")
      };
    }
    return {
      decision: {
        type: "select-cards",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectableCardIds: cards,
        minimum: remove,
        maximum: remove,
        reason: "buqu-remove"
      }
    };
  }
};

const guhuo: WorkflowDefinition = {
  id: EARLY_WORKFLOW.guhuo,
  run({ state, context, data, input }) {
    const response = data.mode === "response";
    const challengers = strings(data, "challengers").length > 0
      ? strings(data, "challengers")
      : aliveOthers(state, context.sourceId).filter(
          (playerId) => (state.players[playerId]?.hp ?? 0) > 0
        );
    const questioned = strings(data, "questioned");
    const index = number(data, "index") ?? 0;
    if (input?.type === "option-selected") {
      const challengerId = challengers[index];
      const nextQuestioned =
        input.option === "question" && challengerId
          ? [...questioned, challengerId]
          : questioned;
      const nextIndex = index + 1;
      if (nextIndex < challengers.length) {
        return {
          decision: {
            type: "choose-option",
            playerId: challengers[nextIndex]!,
            cardId: context.cardId,
            options: ["trust", "question"],
            reason: "guhuo-question"
          },
          resumeData: {
            challengers,
            questioned: nextQuestioned,
            index: nextIndex,
            mode: response ? "response" : "use"
          }
        };
      }
      if (nextQuestioned.length === 0) return {};
      const virtual = state.cards[context.cardId];
      const materialId = virtual?.materialCardIds?.[0];
      const material = materialId ? state.cards[materialId] : undefined;
      if (!virtual || !material || !materialId) return {};
      const truthful = virtual.definitionId === material.definitionId;
      const heart = material.suit === "heart";
      return {
        effects: [
          {
            type: "reveal-card",
            playerId: context.sourceId,
            cardId: materialId,
            reason: "guhuo"
          },
          ...(truthful
            ? nextQuestioned.map((playerId) => ({
                type: "lose-hp" as const,
                playerId,
                amount: 1,
                cardId: context.cardId
              }))
            : nextQuestioned.map((playerId) => ({
                type: "draw" as const,
                playerId,
                count: 1,
                cardId: context.cardId
              }))),
          ...(!truthful || !heart
            ? [response
                ? {
                    type: "set-mark" as const,
                    playerId: context.sourceId,
                    mark: `guhuo-invalid:${context.cardId}`,
                    value: true,
                    cardId: context.cardId
                  }
                : {
                    type: "cancel-card-resolution" as const,
                    cardId: context.cardId,
                    sourceId: context.sourceId
                  }]
            : [])
        ]
      };
    }
    if (challengers.length === 0) return {};
    return {
      decision: {
        type: "choose-option",
        playerId: challengers[0]!,
        cardId: context.cardId,
        options: ["trust", "question"],
        reason: "guhuo-question"
      },
      resumeData: {
        challengers,
        questioned: [],
        index: 0,
        mode: response ? "response" : "use"
      }
    };
  }
};

const qiangxi: WorkflowDefinition = {
  id: EARLY_WORKFLOW.qiangxi,
  run({ state, context, data }) {
    const materials = strings(data, "materials").length > 0
      ? strings(data, "materials")
      : state.cards[context.cardId]?.materialCardIds ?? [];
    return {
      effects: [
        ...moveCards(materials, DISCARD_PILE, "discard"),
        ...(materials.length === 0
          ? [{
              type: "lose-hp" as const,
              playerId: context.sourceId,
              amount: 1,
              cardId: context.cardId
            }]
          : []),
        ...context.targetIds.slice(0, 1).map((targetId) => ({
          type: "damage" as const,
          sourceId: context.sourceId,
          targetId,
          amount: 1,
          cardId: context.cardId,
          nature: "normal" as const
        }))
      ]
    };
  }
};

function pindianWorkflow(
  id: string,
  onResult: (
    runtime: WorkflowRunContext,
    won: boolean,
    opponentId: PlayerId
  ) => EffectDraft[] | ReturnType<WorkflowDefinition["run"]>
): WorkflowDefinition {
  return {
    id,
    run(runtime) {
      const { state, context, data, input } = runtime;
      if (
        id === EARLY_WORKFLOW.quhu &&
        input?.type === "players-selected"
      ) {
        const targetId = input.playerIds[0];
        const tigerId = text(data, "tigerId");
        return targetId && tigerId
          ? {
              effects: [{
                type: "damage",
                sourceId: tigerId,
                targetId,
                amount: 1,
                cardId: context.cardId,
                nature: "normal"
              }]
            }
          : {};
      }
      if (
        id === EARLY_WORKFLOW.lieren &&
        input?.type === "selected" &&
        text(data, "phase") === "obtain"
      ) {
        return {
          effects: moveCards(
            input.cardIds,
            handZone(context.sourceId),
            "skill"
          )
        };
      }
      const sourceCardId =
        text(data, "sourceCardId") ??
        state.cards[context.cardId]?.materialCardIds?.[0];
      const opponentId = context.targetIds[0];
      if (!opponentId) return {};
      if (!sourceCardId) {
        const sourceHand = state.zones[handZone(context.sourceId)] ?? [];
        if (
          input?.type === "selected" &&
          text(data, "phase") === "source-selection"
        ) {
          const selectedSourceCardId = input.cardIds[0];
          const opponentHand = state.zones[handZone(opponentId)] ?? [];
          if (!selectedSourceCardId || opponentHand.length === 0) return {};
          return {
            decision: {
              type: "select-cards",
              playerId: opponentId,
              cardId: context.cardId,
              selectableCardIds: opponentHand,
              minimum: 1,
              maximum: 1,
              reason: `${id}-pindian`
            },
            resumeData: { sourceCardId: selectedSourceCardId }
          };
        }
        return sourceHand.length === 0
          ? {}
          : {
              decision: {
                type: "select-cards",
                playerId: context.sourceId,
                cardId: context.cardId,
                selectableCardIds: sourceHand,
                minimum: 1,
                maximum: 1,
                reason: `${id}-source-card`
              },
              resumeData: { phase: "source-selection" }
            };
      }
      if (input?.type === "selected") {
        const opponentCardId = input.cardIds[0];
        if (!opponentCardId) return {};
        const sourceRank = state.cards[sourceCardId]?.rank ?? 0;
        const opponentRank = state.cards[opponentCardId]?.rank ?? 0;
        const continuation = onResult(
          runtime,
          sourceRank > opponentRank,
          opponentId
        );
        const result = Array.isArray(continuation)
          ? { effects: continuation }
          : continuation;
        return {
          ...result,
          effects: [
            ...moveCards(
              [sourceCardId, opponentCardId],
              DISCARD_PILE,
              "pindian"
            ),
            ...(result.effects ?? [])
          ]
        };
      }
      const opponentHand = state.zones[handZone(opponentId)] ?? [];
      if (opponentHand.length === 0) return {};
      return {
        decision: {
          type: "select-cards",
          playerId: opponentId,
          cardId: context.cardId,
          selectableCardIds: opponentHand,
          minimum: 1,
          maximum: 1,
          reason: `${id}-pindian`
        },
        resumeData: { sourceCardId }
      };
    }
  };
}

const quhu = pindianWorkflow(EARLY_WORKFLOW.quhu, (runtime, won, tigerId) => {
  if (!won) {
    return [{
      type: "damage",
      sourceId: tigerId,
      targetId: runtime.context.sourceId,
      amount: 1,
      cardId: runtime.context.cardId,
      nature: "normal"
    }];
  }
  const targets = runtime.state.turnOrder.filter(
    (playerId) =>
      playerId !== tigerId &&
      runtime.state.players[playerId]?.alive &&
      runtime.distanceBetween(tigerId, playerId) <=
        runtime.attackRange(tigerId)
  );
  return targets.length === 0
    ? []
    : {
        decision: {
          type: "select-players",
          playerId: runtime.context.sourceId,
          cardId: runtime.context.cardId,
          selectablePlayerIds: targets,
          minimum: 1,
          maximum: 1,
          reason: "quhu-damage"
        },
        resumeData: { phase: "quhu-damage", tigerId }
      };
});

const niepan: WorkflowDefinition = {
  id: EARLY_WORKFLOW.niepan,
  run({ state, context, data }) {
    if (state.players[context.sourceId]?.marks["niepan-used"] === true) {
      const raw = data.effect;
      return raw && typeof raw === "object" && !Array.isArray(raw)
        ? { effects: [raw as unknown as EffectDraft] }
        : {};
    }
    const owned = cardIdsIn(
      state,
      context.sourceId,
      ["hand", "equipment", "judgment"]
    );
    return {
      effects: [
        {
          type: "set-mark",
          playerId: context.sourceId,
          mark: "niepan-used",
          value: true,
          cardId: context.cardId
        },
        ...moveCards(owned, DISCARD_PILE, "skill"),
        {
          type: "set-player-state",
          playerId: context.sourceId,
          cardId: context.cardId,
          hp: 3,
          faceUp: true,
          chained: false,
          dying: false
        },
        {
          type: "draw",
          playerId: context.sourceId,
          count: 3,
          cardId: context.cardId
        }
      ]
    };
  }
};

const jieming: WorkflowDefinition = {
  id: EARLY_WORKFLOW.jieming,
  run({ state, context, data, input }) {
    const remaining = number(data, "remaining") ?? 1;
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      const eligible = state.turnOrder.filter((playerId) => {
        const player = state.players[playerId];
        return player?.alive &&
          (state.zones[handZone(playerId)]?.length ?? 0) <
            Math.min(5, player.maxHp);
      });
      if (eligible.length === 0) return {};
      return {
        decision: {
          type: "select-players",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectablePlayerIds: eligible,
          minimum: 1,
          maximum: 1,
          reason: "jieming-target"
        },
        resumeData: { remaining }
      };
    }
    if (input?.type === "players-selected") {
      const targetId = input.playerIds[0];
      const player = targetId ? state.players[targetId] : undefined;
      if (!targetId || !player) return {};
      const count = Math.max(
        0,
        Math.min(5, player.maxHp) -
          (state.zones[handZone(targetId)]?.length ?? 0)
      );
      return {
        effects: [
          ...(count > 0
            ? [{
                type: "draw" as const,
                playerId: targetId,
                count,
                cardId: context.cardId
              }]
            : []),
          ...(remaining > 1
            ? [{
                type: "run-workflow" as const,
                workflowId: EARLY_WORKFLOW.jieming,
                context,
                data: { remaining: remaining - 1 }
              }]
            : [])
        ]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "jieming"
      },
      resumeData: { remaining }
    };
  }
};

const shuangxiong: WorkflowDefinition = {
  id: EARLY_WORKFLOW.shuangxiong,
  run({ state, context, data, input, effectiveCardSuit }) {
    if (text(data, "mode") === "result") {
      const judgmentCardId = text(data, "judgmentCardId");
      const reasonCardId = text(data, "reasonCardId");
      const reasonCard = reasonCardId ? state.cards[reasonCardId] : undefined;
      if (
        !judgmentCardId ||
        reasonCard?.definitionId !== `skill:${skillId("fire", "双雄")}` ||
        reasonCard.sourcePlayerId !== context.sourceId
      ) {
        return {};
      }
      const suit = effectiveCardSuit(judgmentCardId, context.sourceId);
      return {
        effects: [{
          type: "set-mark",
          playerId: context.sourceId,
          mark: "shuangxiong-color",
          value: suit === "heart" || suit === "diamond" ? 1 : 2,
          cardId: context.cardId
        }]
      };
    }
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      return {
        effects: [
          {
            type: "set-mark",
            playerId: context.sourceId,
            mark: "skipDraw",
            value: true,
            cardId: context.cardId
          },
          {
            type: "request-judgment",
            playerId: context.sourceId,
            cardId: context.cardId,
            reason: "shuangxiong",
            pattern: {},
            matchedCardDestination: {
              toZoneId: handZone(context.sourceId),
              reason: "skill"
            },
            onMatch: [],
            onMiss: []
          }
        ]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "shuangxiong"
      }
    };
  }
};

const tianyi = pindianWorkflow(
  EARLY_WORKFLOW.tianyi,
  (runtime, won) => [{
    type: "set-mark",
    playerId: runtime.context.sourceId,
    mark: won ? "tianyi-success" : "tianyi-failed",
    value: true,
    cardId: runtime.context.cardId
  }]
);

const mengjin: WorkflowDefinition = {
  id: EARLY_WORKFLOW.mengjin,
  run({ state, context, input }) {
    const targetId = context.targetIds[0];
    if (!targetId) return {};
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      const cards = cardIdsIn(state, targetId, ["hand", "equipment"]);
      return cards.length === 0
        ? {}
        : {
            decision: {
              type: "select-cards",
              playerId: context.sourceId,
              cardId: context.cardId,
              selectableCardIds: cards,
              minimum: 1,
              maximum: 1,
              reason: "mengjin-card"
            }
          };
    }
    if (input?.type === "selected") {
      return {
        effects: moveCards(input.cardIds, DISCARD_PILE, "discard")
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "mengjin"
      }
    };
  }
};

const xingshang: WorkflowDefinition = {
  id: EARLY_WORKFLOW.xingshang,
  run({ state, context, data, input }) {
    const deadId = text(data, "deadId") ?? context.targetIds[0];
    if (!deadId) return {};
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      const deathCards = state.eventLog
        .filter(
          (event) =>
            event.type === "CardMoved" &&
            event.reason === "death" &&
            (
              event.from === handZone(deadId) ||
              event.from === equipmentZone(deadId)
            )
        )
        .map((event) => "cardId" in event ? event.cardId : "")
        .filter((cardId) =>
          (state.zones[DISCARD_PILE] ?? []).includes(cardId)
        );
      return {
        effects: moveCards(
          deathCards,
          handZone(context.sourceId),
          "skill"
        )
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "xingshang"
      },
      resumeData: { deadId }
    };
  }
};

const fangzhu: WorkflowDefinition = {
  id: EARLY_WORKFLOW.fangzhu,
  run({ state, context, input }) {
    if (input?.type === "players-selected") {
      const targetId = input.playerIds[0];
      if (!targetId) return {};
      const owner = state.players[context.sourceId];
      return {
        effects: [
          {
            type: "draw",
            playerId: targetId,
            count: Math.max(0, (owner?.maxHp ?? 0) - (owner?.hp ?? 0)),
            cardId: context.cardId
          },
          {
            type: "set-player-state",
            playerId: targetId,
            cardId: context.cardId,
            faceUp: !(state.players[targetId]?.faceUp ?? true)
          }
        ]
      };
    }
    return {
      decision: {
        type: "select-players",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectablePlayerIds: aliveOthers(state, context.sourceId),
        minimum: 0,
        maximum: 1,
        reason: "fangzhu-target"
      }
    };
  }
};

const songwei: WorkflowDefinition = {
  id: EARLY_WORKFLOW.songwei,
  run({ state, context, data, input, effectiveCardSuit, heroDefinition }) {
    const judgedId = context.targetIds[0];
    const judgmentCardId = text(data, "judgmentCardId");
    if (
      !judgedId ||
      judgedId === context.sourceId ||
      !judgmentCardId ||
      effectiveCardSuit(judgmentCardId, judgedId) !== "spade" &&
        effectiveCardSuit(judgmentCardId, judgedId) !== "club"
    ) {
      return {};
    }
    const heroId = state.players[judgedId]?.heroDefinitionId;
    if (!heroId || heroDefinition(heroId).kingdom !== "wei") return {};
    if (input?.type === "option-selected") {
      return input.option === "activate"
        ? {
            effects: [{
              type: "draw",
              playerId: context.sourceId,
              count: 1,
              cardId: context.cardId
            }]
          }
        : {};
    }
    return {
      decision: {
        type: "choose-option",
        playerId: judgedId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "songwei"
      }
    };
  }
};

const zaiqi: WorkflowDefinition = {
  id: EARLY_WORKFLOW.zaiqi,
  run({ state, context, input }) {
    const player = state.players[context.sourceId];
    if (!player) return {};
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      return {
        effects: [{
          type: "take-top-cards",
          cardId: context.cardId,
          count: Math.max(0, player.maxHp - player.hp),
          toZoneId: `zone:special:zaiqi:${context.sourceId}`,
          reason: "zaiqi",
          resume: {
            workflowId: EARLY_WORKFLOW.zaiqi,
            context,
            data: { phase: "resolve" }
          }
        }]
      };
    }
    if (input?.type === "cards-taken") {
      const hearts = input.cardIds.filter(
        (cardId) => state.cards[cardId]?.suit === "heart"
      );
      const others = input.cardIds.filter(
        (cardId) => state.cards[cardId]?.suit !== "heart"
      );
      return {
        effects: [
          ...hearts.map((cardId) => ({
            type: "recover" as const,
            playerId: context.sourceId,
            amount: 1,
            cardId,
            sourceId: context.sourceId
          })),
          ...moveCards(hearts, DISCARD_PILE, "skill"),
          ...moveCards(others, handZone(context.sourceId), "skill"),
          {
            type: "set-mark",
            playerId: context.sourceId,
            mark: "skipDraw",
            value: true,
            cardId: context.cardId
          }
        ]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "zaiqi"
      }
    };
  }
};

const lieren = pindianWorkflow(
  EARLY_WORKFLOW.lieren,
  (runtime, won, opponentId) => {
    if (!won) return [];
    const cards = cardIdsIn(
      runtime.state,
      opponentId,
      ["hand", "equipment"]
    );
    return cards.length === 0
      ? []
      : {
          decision: {
            type: "select-cards",
            playerId: runtime.context.sourceId,
            cardId: runtime.context.cardId,
            selectableCardIds: cards,
            minimum: 1,
            maximum: 1,
            reason: "lieren-obtain"
          },
          resumeData: { phase: "obtain", opponentId }
        };
  }
);

const yinghun: WorkflowDefinition = {
  id: EARLY_WORKFLOW.yinghun,
  run({ state, context, data, input }) {
    const lostHp = Math.max(
      0,
      (state.players[context.sourceId]?.maxHp ?? 0) -
        (state.players[context.sourceId]?.hp ?? 0)
    );
    const targetId = text(data, "targetId");
    if (input?.type === "players-selected") {
      const selected = input.playerIds[0];
      if (!selected) return {};
      if (lostHp <= 1) {
        return {
          effects: [
            {
              type: "draw",
              playerId: selected,
              count: 1,
              cardId: context.cardId
            },
            {
              type: "run-workflow",
              workflowId: EARLY_WORKFLOW.yinghun,
              context,
              data: {
                phase: "discard",
                targetId: selected,
                discardCount: 1
              }
            }
          ]
        };
      }
      return {
        decision: {
          type: "choose-option",
          playerId: context.sourceId,
          cardId: context.cardId,
          options: ["draw-one-discard-x", "draw-x-discard-one"],
          reason: "yinghun-mode"
        },
        resumeData: { targetId: selected, lostHp }
      };
    }
    if (input?.type === "option-selected" && targetId) {
      const drawCount = input.option === "draw-one-discard-x" ? 1 : lostHp;
      const discardCount = input.option === "draw-one-discard-x" ? lostHp : 1;
      return {
        effects: [
          {
            type: "draw",
            playerId: targetId,
            count: drawCount,
            cardId: context.cardId
          },
          {
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.yinghun,
            context,
            data: {
              phase: "discard",
              targetId,
              discardCount
            }
          }
        ]
      };
    }
    if (text(data, "phase") === "discard" && targetId) {
      const cards = cardIdsIn(state, targetId, ["hand", "equipment"]);
      const count = Math.min(number(data, "discardCount") ?? 0, cards.length);
      return count === 0
        ? {}
        : {
            decision: {
              type: "select-cards",
              playerId: targetId,
              cardId: context.cardId,
              selectableCardIds: cards,
              minimum: count,
              maximum: count,
              reason: "yinghun-discard"
            },
            resumeData: { phase: "discard-selected" }
          };
    }
    if (input?.type === "selected") {
      return { effects: moveCards(input.cardIds, DISCARD_PILE, "discard") };
    }
    return {
      decision: {
        type: "select-players",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectablePlayerIds: aliveOthers(state, context.sourceId),
        minimum: 0,
        maximum: 1,
        reason: "yinghun-target"
      }
    };
  }
};

const haoshi: WorkflowDefinition = {
  id: EARLY_WORKFLOW.haoshi,
  run({ state, context, data, input }) {
    const phase = text(data, "phase") ?? "replace-draw";
    if (phase === "replace-draw") {
      const raw = data.effect;
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
      const effect = raw as Record<string, WorkflowValue>;
      const count = typeof effect.count === "number" ? effect.count : 2;
      return {
        effects: [
          {
            type: "draw",
            playerId: context.sourceId,
            count: count + 2,
            cardId: context.cardId,
            tags: ["skill:haoshi"]
          },
          {
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.haoshi,
            context,
            data: { phase: "give" }
          }
        ]
      };
    }
    if (phase === "give") {
      const hand = state.zones[handZone(context.sourceId)] ?? [];
      if (hand.length <= 5) return {};
      const others = aliveOthers(state, context.sourceId);
      const least = Math.min(
        ...others.map(
          (playerId) => state.zones[handZone(playerId)]?.length ?? 0
        )
      );
      const recipients = others.filter(
        (playerId) =>
          (state.zones[handZone(playerId)]?.length ?? 0) === least
      );
      return {
        decision: {
          type: "select-cards",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectableCardIds: hand,
          minimum: Math.floor(hand.length / 2),
          maximum: Math.floor(hand.length / 2),
          reason: "haoshi-cards"
        },
        resumeData: { phase: "recipient", recipients }
      };
    }
    if (phase === "recipient" && input?.type === "selected") {
      return {
        decision: {
          type: "select-players",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectablePlayerIds: strings(data, "recipients"),
          minimum: 1,
          maximum: 1,
          reason: "haoshi-recipient"
        },
        resumeData: {
          phase: "transfer",
          selectedCards: input.cardIds
        }
      };
    }
    if (phase === "transfer" && input?.type === "players-selected") {
      const recipientId = input.playerIds[0];
      return recipientId
        ? {
            effects: moveCards(
              strings(data, "selectedCards"),
              handZone(recipientId),
              "give"
            )
          }
        : {};
    }
    return {};
  }
};

const dimeng: WorkflowDefinition = {
  id: EARLY_WORKFLOW.dimeng,
  run({ state, context, data }) {
    const [firstPlayerId, secondPlayerId] = context.targetIds;
    if (!firstPlayerId || !secondPlayerId) return {};
    return {
      effects: [
        ...moveCards(
          strings(data, "materials").length > 0
            ? strings(data, "materials")
            : state.cards[context.cardId]?.materialCardIds ?? [],
          DISCARD_PILE,
          "discard"
        ),
        {
          type: "swap-hands",
          firstPlayerId,
          secondPlayerId,
          cardId: context.cardId
        }
      ]
    };
  }
};

const luanwu: WorkflowDefinition = {
  id: EARLY_WORKFLOW.luanwu,
  run({
    state,
    context,
    data,
    input,
    canTargetDefinition,
    distanceBetween
  }) {
    const players = strings(data, "players").length > 0
      ? strings(data, "players")
      : aliveOthers(state, context.sourceId);
    const index = number(data, "index") ?? 0;
    const actorId = players[index];
    if (!actorId) {
      return {
        effects: [{
          type: "set-mark",
          playerId: context.sourceId,
          mark: "luanwu-used",
          value: true,
          cardId: context.cardId
        }]
      };
    }
    const distances = aliveOthers(state, actorId).map((playerId) => ({
      playerId,
      distance: distanceBetween(actorId, playerId)
    }));
    const nearest = Math.min(...distances.map((item) => item.distance));
    const targets = distances
      .filter(
        (item) =>
          item.distance === nearest &&
          canTargetDefinition(actorId, STANDARD_CARD.slash, item.playerId)
      )
      .map((item) => item.playerId);
    if (input?.type === "responded") {
      if (targets.length === 1) {
        return {
          effects: [
            {
              type: "use-card-instance",
              sourceId: actorId,
              cardId: input.cardId,
              targetIds: [targets[0]!],
              skillId: skillId("forest", "乱武")
            },
            {
              type: "run-workflow",
              workflowId: EARLY_WORKFLOW.luanwu,
              context,
              data: { players, index: index + 1 }
            }
          ]
        };
      }
      return {
        decision: {
          type: "select-players",
          playerId: actorId,
          cardId: context.cardId,
          selectablePlayerIds: targets,
          minimum: 1,
          maximum: 1,
          reason: "luanwu-target"
        },
        resumeData: {
          players,
          index,
          slashCardId: input.cardId
        }
      };
    }
    if (input?.type === "players-selected") {
      const targetId = input.playerIds[0];
      const slashCardId = text(data, "slashCardId");
      return targetId && slashCardId
        ? {
            effects: [
              {
                type: "use-card-instance",
                sourceId: actorId,
                cardId: slashCardId,
                targetIds: [targetId],
                skillId: skillId("forest", "乱武")
              },
              {
                type: "run-workflow",
                workflowId: EARLY_WORKFLOW.luanwu,
                context,
                data: { players, index: index + 1 }
              }
            ]
          }
        : {};
    }
    if (input?.type === "passed" || targets.length === 0) {
      return {
        effects: [
          {
            type: "lose-hp",
            playerId: actorId,
            amount: 1,
            cardId: context.cardId
          },
          {
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.luanwu,
            context,
            data: { players, index: index + 1 }
          }
        ]
      };
    }
    return {
      decision: {
        type: "respond-card",
        playerId: actorId,
        cardId: context.cardId,
        acceptedDefinitionIds: [STANDARD_CARD.slash],
        passAllowed: true,
        responseKind: "slash",
        ...(targets[0] ? { opponentId: targets[0] } : {})
      },
      resumeData: { players, index }
    };
  }
};

const benghuai: WorkflowDefinition = {
  id: EARLY_WORKFLOW.benghuai,
  run({ state, context, input }) {
    const owner = state.players[context.sourceId];
    if (
      !owner ||
      !aliveOthers(state, context.sourceId).some(
        (playerId) => owner.hp > (state.players[playerId]?.hp ?? owner.hp)
      )
    ) {
      return {};
    }
    if (input?.type === "option-selected") {
      return input.option === "lose-hp"
        ? {
            effects: [{
              type: "lose-hp",
              playerId: context.sourceId,
              amount: 1,
              cardId: context.cardId
            }]
          }
        : {
            effects: [{
              type: "set-player-state",
              playerId: context.sourceId,
              cardId: context.cardId,
              maxHp: owner.maxHp - 1
            }]
          };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["lose-hp", "lose-max-hp"],
        reason: "benghuai"
      }
    };
  }
};

const baonue: WorkflowDefinition = {
  id: EARLY_WORKFLOW.baonue,
  run({ context, input }) {
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      const damageSourceId = context.targetIds[0] ?? context.sourceId;
      return {
        effects: [{
          type: "request-judgment",
          playerId: damageSourceId,
          cardId: context.cardId,
          reason: "baonue",
          pattern: { includedSuits: ["spade"] },
          onMatch: [{
            type: "recover",
            playerId: context.sourceId,
            amount: 1,
            cardId: context.cardId,
            sourceId: damageSourceId
          }],
          onMiss: []
        }]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.targetIds[0] ?? context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "baonue"
      }
    };
  }
};

const BASIC_OR_TRICK = [
  STANDARD_CARD.slash,
  STANDARD_CARD.fireSlash,
  STANDARD_CARD.thunderSlash,
  STANDARD_CARD.jink,
  STANDARD_CARD.peach,
  STANDARD_CARD.wine,
  STANDARD_CARD.amazingGrace,
  STANDARD_CARD.godSalvation,
  STANDARD_CARD.savageAssault,
  STANDARD_CARD.archeryAttack,
  STANDARD_CARD.duel,
  STANDARD_CARD.exNihilo,
  STANDARD_CARD.snatch,
  STANDARD_CARD.dismantlement,
  STANDARD_CARD.collateral,
  STANDARD_CARD.nullification,
  STANDARD_CARD.ironChain,
  STANDARD_CARD.fireAttack
];

const windSkills: Record<string, SkillDefinition> = {
  "神速": {
    id: skillId("wind", "神速"),
    name: "神速",
    implementation: "complete",
    abilities: [
      {
        type: "trigger",
        eventType: "TurnStarted",
        when: [{ type: "event-player-is-owner", field: "playerId" }],
        context: { card: { literal: "system:skill:shensu-1" } },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.shensu,
            data: { mode: 1 }
          }]
        }
      },
      {
        type: "trigger",
        eventType: "PhaseChanged",
        when: [
          { type: "event-player-is-owner", field: "playerId" },
          { type: "event-field-equals", field: "to", value: "action" }
        ],
        context: { card: { literal: "system:skill:shensu-2" } },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.shensu,
            data: { mode: 2 }
          }]
        }
      }
    ]
  },
  "据守": {
    id: skillId("wind", "据守"),
    name: "据守",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "TurnEnded",
      when: [{ type: "event-player-is-owner", field: "playerId" }],
      context: { card: { literal: "system:skill:jushou" } },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.jushou
        }]
      }
    }]
  },
  "天香": {
    id: skillId("wind", "天香"),
    name: "天香",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      priority: -10000,
      match: { effectType: "damage", targetIsOwner: true },
      operation: {
        type: "offer-optional",
        reason: "tianxiang",
        onActivate: {
          type: "replace-with-workflow",
          workflowId: EARLY_WORKFLOW.tianxiang
        }
      }
    }]
  },
  "不屈": {
    id: skillId("wind", "不屈"),
    name: "不屈",
    implementation: "complete",
    abilities: [
      {
        type: "trigger",
        eventType: "DyingStarted",
        when: [{ type: "event-player-is-owner", field: "playerId" }],
        context: { card: { literal: "system:skill:buqu" } },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.buquDying
          }]
        }
      },
      {
        type: "trigger",
        eventType: "HpRecovered",
        when: [{ type: "event-player-is-owner", field: "playerId" }],
        context: { card: "event-card" },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.buquRecover
          }]
        }
      },
      {
        type: "timing",
        timing: "before-effect",
        priority: -20000,
        match: { effectType: "death", playerIsOwner: true },
        operation: {
          type: "replace-with-workflow",
          workflowId: EARLY_WORKFLOW.buquDeath
        }
      }
    ]
  },
  "黄天": {
    id: skillId("wind", "黄天"),
    name: "黄天",
    implementation: "complete",
    lordOnly: true,
    abilities: [{
      type: "active",
      id: skillId("wind", "黄天"),
      grantedToKingdom: "qun",
      materials: {
        zones: ["hand"],
        minimum: 1,
        maximum: 1,
        definitionIds: [STANDARD_CARD.jink, STANDARD_CARD.lightning]
      },
      target: {
        type: "players",
        candidates: "others",
        minimum: 1,
        maximum: 1,
        filters: [
          { type: "alive" },
          { type: "has-skill", skillId: skillId("wind", "黄天") }
        ]
      },
      maximumUsesPerTurn: 1,
      program: {
        steps: [{
          type: "move-materials",
          to: { type: "zone", zone: "hand", player: "target" },
          reason: "give"
        }]
      }
    }]
  },
  "蛊惑": {
    id: skillId("wind", "蛊惑"),
    name: "蛊惑",
    implementation: "complete",
    abilities: [
      {
        type: "view-as",
        id: skillId("wind", "蛊惑"),
        definitionIds: BASIC_OR_TRICK,
        materials: { zones: ["hand"], count: 1 },
        action: true,
        response: true
      },
      {
        type: "trigger",
        eventType: "CardUsed",
        when: [
          { type: "event-player-is-owner", field: "playerId" },
          {
            type: "event-field-equals",
            field: "skillId",
            value: skillId("wind", "蛊惑")
          }
        ],
        context: { card: "event-card" },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.guhuo,
            data: { mode: "use" }
          }]
        }
      },
      {
        type: "trigger",
        eventType: "CardResponded",
        when: [
          { type: "event-player-is-owner", field: "playerId" },
          {
            type: "event-field-equals",
            field: "skillId",
            value: skillId("wind", "蛊惑")
          }
        ],
        context: { card: "event-card" },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.guhuo,
            data: { mode: "response" }
          }]
        }
      }
    ]
  }
};

const fireSkills: Record<string, SkillDefinition> = {
  "强袭": {
    id: skillId("fire", "强袭"),
    name: "强袭",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: skillId("fire", "强袭"),
      materials: {
        zones: ["hand", "equipment"],
        minimum: 0,
        maximum: 1,
        equipmentSlots: ["weapon"]
      },
      target: {
        type: "players",
        candidates: "others",
        minimum: 1,
        maximum: 1,
        filters: [
          { type: "alive" },
          { type: "distance-at-most", value: "attack-range" }
        ]
      },
      maximumUsesPerTurn: 1,
      constraints: ["equipped-weapon-means-distance-one"],
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.qiangxi
        }]
      }
    }]
  },
  "驱虎": {
    id: skillId("fire", "驱虎"),
    name: "驱虎",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: skillId("fire", "驱虎"),
      materials: { zones: ["hand"], minimum: 1, maximum: 1 },
      target: {
        type: "players",
        candidates: "others",
        minimum: 1,
        maximum: 1,
        filters: [
          { type: "alive" },
          { type: "has-cards", zones: ["hand"] },
          { type: "hp-greater-than-source" }
        ]
      },
      maximumUsesPerTurn: 1,
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.quhu
        }]
      }
    }]
  },
  "节命": {
    id: skillId("fire", "节命"),
    name: "节命",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [{ type: "event-player-is-owner", field: "targetId" }],
      context: { card: "event-card" },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.jieming,
          data: {
            remaining: { type: "event-field", field: "amount" }
          }
        }]
      }
    }]
  },
  "连环": {
    id: skillId("fire", "连环"),
    name: "连环",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: skillId("fire", "连环"),
      definitionId: STANDARD_CARD.ironChain,
      materials: { zones: ["hand"], count: 1, suit: "club" },
      action: true
    }]
  },
  "涅槃": {
    id: skillId("fire", "涅槃"),
    name: "涅槃",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      priority: -30000,
      match: {
        effectType: "death",
        playerIsOwner: true,
        ownerMark: { mark: "niepan-used", equals: false }
      },
      operation: {
        type: "offer-optional",
        reason: "niepan",
        onActivate: {
          type: "replace-with-workflow",
          workflowId: EARLY_WORKFLOW.niepan
        }
      }
    }]
  },
  "八阵": {
    id: skillId("fire", "八阵"),
    name: "八阵",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      priority: 10000,
      match: {
        effectType: "request-response",
        responderIncludesOwner: true,
        sourceCardTag: "response:slash",
        excludedEffectTags: ["ignore-armor"],
        ownerEquipmentSlotAbsent: "armor"
      },
      operation: {
        type: "offer-judgment-response",
        reason: "bazhen",
        pattern: { includedSuits: ["diamond", "heart"] }
      }
    }]
  },
  "火计": {
    id: skillId("fire", "火计"),
    name: "火计",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: skillId("fire", "火计"),
      definitionId: STANDARD_CARD.fireAttack,
      materials: { zones: ["hand"], count: 1, color: "red" },
      action: true
    }]
  },
  "看破": {
    id: skillId("fire", "看破"),
    name: "看破",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: skillId("fire", "看破"),
      definitionId: STANDARD_CARD.nullification,
      materials: { zones: ["hand"], count: 1, color: "black" },
      response: true
    }]
  },
  "天义": {
    id: skillId("fire", "天义"),
    name: "天义",
    implementation: "complete",
    abilities: [
      {
        type: "active",
        id: skillId("fire", "天义"),
        materials: { zones: ["hand"], minimum: 1, maximum: 1 },
        target: {
          type: "players",
          candidates: "others",
          minimum: 1,
          maximum: 1,
          filters: [
            { type: "alive" },
            { type: "has-cards", zones: ["hand"] }
          ]
        },
        maximumUsesPerTurn: 1,
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.tianyi
          }]
        }
      },
      {
        type: "modify-usage",
        definitionId: STANDARD_CARD.slash,
        unlimited: true,
        ownerMark: { mark: "tianyi-success", equals: true }
      },
      {
        type: "modify-targeting",
        cardTag: "response:slash",
        ignoreDistance: true,
        maximumTargetsBonus: 1,
        ownerMark: { mark: "tianyi-success", equals: true }
      },
      {
        type: "forbid-card-use",
        definitionIds: [STANDARD_CARD.slash],
        ownerMark: { mark: "tianyi-failed", equals: true }
      },
      {
        type: "trigger",
        eventType: "TurnEnded",
        when: [{ type: "event-player-is-owner", field: "playerId" }],
        context: { card: { literal: "system:skill:tianyi-reset" } },
        program: {
          steps: [
            {
              type: "set-mark",
              player: "source",
              mark: "tianyi-success",
              value: false
            },
            {
              type: "set-mark",
              player: "source",
              mark: "tianyi-failed",
              value: false
            }
          ]
        }
      }
    ]
  },
  "乱击": {
    id: skillId("fire", "乱击"),
    name: "乱击",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: skillId("fire", "乱击"),
      definitionId: STANDARD_CARD.archeryAttack,
      materials: { zones: ["hand"], count: 2, sameSuit: true },
      action: true
    }]
  },
  "血裔": {
    id: skillId("fire", "血裔"),
    name: "血裔",
    implementation: "complete",
    lordOnly: true,
    abilities: [{
      type: "modify-hand-limit",
      bonusPerOtherKingdom: "qun"
    }]
  },
  "双雄": {
    id: skillId("fire", "双雄"),
    name: "双雄",
    implementation: "complete",
    abilities: [
      {
        type: "trigger",
        eventType: "TurnStarted",
        when: [{ type: "event-player-is-owner", field: "playerId" }],
        context: { card: { literal: "system:skill:shuangxiong-reset" } },
        program: {
          steps: [{
            type: "set-mark",
            player: "source",
            mark: "shuangxiong-color",
            value: 0
          }]
        }
      },
      {
        type: "trigger",
        eventType: "PhaseChanged",
        when: [
          { type: "event-player-is-owner", field: "playerId" },
          { type: "event-field-equals", field: "to", value: "draw" }
        ],
        context: { card: { literal: "system:skill:shuangxiong" } },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.shuangxiong
          }]
        }
      },
      {
        type: "trigger",
        eventType: "JudgmentResolved",
        context: { card: { literal: "system:skill:shuangxiong-result" } },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: EARLY_WORKFLOW.shuangxiong,
            data: {
              mode: "result",
              judgmentCardId: {
                type: "event-field",
                field: "judgmentCardId"
              },
              reasonCardId: {
                type: "event-field",
                field: "reasonCardId"
              }
            }
          }]
        }
      },
      {
        type: "view-as",
        id: skillId("fire", "双雄"),
        definitionId: STANDARD_CARD.duel,
        materials: {
          zones: ["hand"],
          count: 1,
          colorByMark: {
            mark: "shuangxiong-color",
            values: { "1": "black", "2": "red" }
          }
        },
        action: true
      }
    ]
  },
  "猛进": {
    id: skillId("fire", "猛进"),
    name: "猛进",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "CardCancelled",
      when: [
        { type: "event-player-is-owner", field: "sourceId" },
        { type: "event-field-equals", field: "reason", value: "jink" },
        {
          type: "event-player-has-cards",
          field: "targetId",
          zones: ["hand", "equipment"]
        }
      ],
      context: {
        targets: [{ eventField: "targetId" }],
        card: "event-card"
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.mengjin
        }]
      }
    }]
  }
};

const forestSkills: Record<string, SkillDefinition> = {
  "断粮": {
    id: skillId("forest", "断粮"),
    name: "断粮",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: skillId("forest", "断粮"),
      definitionId: STANDARD_CARD.supplyShortage,
      materials: {
        zones: ["hand", "equipment"],
        count: 1,
        color: "black",
        cardCategories: ["basic", "equipment"]
      },
      action: true
    }]
  },
  "行殇": {
    id: skillId("forest", "行殇"),
    name: "行殇",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "PlayerDied",
      when: [{ type: "event-player-is-not-owner", field: "playerId" }],
      context: {
        targets: [{ eventField: "playerId" }],
        card: { literal: "system:skill:xingshang" }
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.xingshang,
          data: {
            deadId: { type: "event-field", field: "playerId" }
          }
        }]
      }
    }]
  },
  "放逐": {
    id: skillId("forest", "放逐"),
    name: "放逐",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [{ type: "event-player-is-owner", field: "targetId" }],
      context: { card: "event-card" },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.fangzhu
        }]
      }
    }]
  },
  "颂威": {
    id: skillId("forest", "颂威"),
    name: "颂威",
    implementation: "complete",
    lordOnly: true,
    abilities: [{
      type: "trigger",
      eventType: "JudgmentResolved",
      context: {
        targets: [{ eventField: "playerId" }],
        card: { literal: "system:skill:songwei" }
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.songwei,
          data: {
            judgmentCardId: {
              type: "event-field",
              field: "judgmentCardId"
            }
          }
        }]
      }
    }]
  },
  "祸首": {
    id: skillId("forest", "祸首"),
    name: "祸首",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      match: {
        effectType: "damage",
        sourceCardTag: "targeting:savage-assault"
      },
      operation: { type: "replace-source-with-owner" }
    }]
  },
  "再起": {
    id: skillId("forest", "再起"),
    name: "再起",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "PhaseChanged",
      when: [
        { type: "event-player-is-owner", field: "playerId" },
        { type: "event-field-equals", field: "to", value: "draw" },
        { type: "owner-state", state: "wounded" }
      ],
      context: { card: { literal: "system:skill:zaiqi" } },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.zaiqi
        }]
      }
    }]
  },
  "巨象": {
    id: skillId("forest", "巨象"),
    name: "巨象",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "CardMoved",
      when: [
        { type: "event-field-equals", field: "to", value: DISCARD_PILE },
        { type: "event-field-equals", field: "reason", value: "resolve" },
        { type: "event-card-source-is-not-owner" },
        { type: "event-card", tag: "targeting:savage-assault" }
      ],
      context: { card: "event-card" },
      program: {
        steps: [{
          type: "move-card",
          to: { type: "zone", zone: "hand", player: "source" },
          reason: "skill"
        }]
      }
    }]
  },
  "烈刃": {
    id: skillId("forest", "烈刃"),
    name: "烈刃",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [
        { type: "event-player-is-owner", field: "sourceId" },
        { type: "event-player-state", field: "targetId", state: "alive" },
        {
          type: "event-player-has-cards",
          field: "sourceId",
          zones: ["hand"]
        },
        {
          type: "event-player-has-cards",
          field: "targetId",
          zones: ["hand"]
        },
        { type: "event-card", tag: "response:slash" }
      ],
      context: {
        targets: [{ eventField: "targetId" }],
        card: "event-card"
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.lieren
        }]
      }
    }]
  },
  "英魂": {
    id: skillId("forest", "英魂"),
    name: "英魂",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "TurnStarted",
      when: [
        { type: "event-player-is-owner", field: "playerId" },
        { type: "owner-state", state: "wounded" }
      ],
      context: { card: { literal: "system:skill:yinghun" } },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.yinghun
        }]
      }
    }]
  },
  "好施": {
    id: skillId("forest", "好施"),
    name: "好施",
    implementation: "complete",
    abilities: [{
      type: "timing",
      timing: "before-effect",
      match: {
        effectType: "draw",
        playerIsOwner: true,
        requiredEffectTags: ["phase:draw"]
      },
      operation: {
        type: "offer-optional",
        reason: "haoshi",
        onActivate: {
          type: "replace-with-workflow",
          workflowId: EARLY_WORKFLOW.haoshi
        }
      }
    }]
  },
  "缔盟": {
    id: skillId("forest", "缔盟"),
    name: "缔盟",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: skillId("forest", "缔盟"),
      materials: { zones: ["hand", "equipment"], minimum: 0, maximum: "all" },
      target: {
        type: "players",
        candidates: "others",
        minimum: 2,
        maximum: 2,
        filters: [{ type: "alive" }]
      },
      constraints: ["material-count-equals-target-hand-difference"],
      maximumUsesPerTurn: 1,
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.dimeng
        }]
      }
    }]
  },
  "酒池": {
    id: skillId("forest", "酒池"),
    name: "酒池",
    implementation: "complete",
    abilities: [{
      type: "view-as",
      id: skillId("forest", "酒池"),
      definitionId: STANDARD_CARD.wine,
      materials: { zones: ["hand"], count: 1, suit: "spade" },
      action: true,
      response: true
    }]
  },
  "肉林": {
    id: skillId("forest", "肉林"),
    name: "肉林",
    implementation: "complete",
    abilities: [
      {
        type: "modify-response-count",
        responseKind: "jink",
        sourceCardTag: "response:slash",
        sourceIsOwner: true,
        opponentGender: "female",
        count: 2
      },
      {
        type: "modify-response-count",
        responseKind: "jink",
        sourceCardTag: "response:slash",
        opponentIsOwner: true,
        sourceGender: "female",
        count: 2
      }
    ]
  },
  "崩坏": {
    id: skillId("forest", "崩坏"),
    name: "崩坏",
    implementation: "complete",
    abilities: [{
      type: "trigger",
      eventType: "TurnEnded",
      when: [{ type: "event-player-is-owner", field: "playerId" }],
      context: { card: { literal: "system:skill:benghuai" } },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.benghuai
        }]
      }
    }]
  },
  "暴虐": {
    id: skillId("forest", "暴虐"),
    name: "暴虐",
    implementation: "complete",
    lordOnly: true,
    abilities: [{
      type: "trigger",
      eventType: "DamageApplied",
      when: [
        { type: "event-player-is-not-owner", field: "sourceId" },
        {
          type: "event-player-hero-kingdom",
          field: "sourceId",
          kingdom: "qun"
        }
      ],
      context: {
        targets: [{ eventField: "sourceId" }],
        card: "event-card"
      },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.baonue
        }]
      }
    }]
  },
  "完杀": {
    id: skillId("forest", "完杀"),
    name: "完杀",
    implementation: "complete",
    abilities: [{ type: "restrict-rescue-during-owner-turn" }]
  },
  "乱武": {
    id: skillId("forest", "乱武"),
    name: "乱武",
    implementation: "complete",
    abilities: [{
      type: "active",
      id: skillId("forest", "乱武"),
      materials: { zones: [], minimum: 0, maximum: 0 },
      target: { type: "none" },
      ownerMark: { mark: "luanwu-used", equals: false },
      program: {
        steps: [{
          type: "run-workflow",
          workflowId: EARLY_WORKFLOW.luanwu
        }]
      }
    }]
  },
  "帷幕": {
    id: skillId("forest", "帷幕"),
    name: "帷幕",
    implementation: "complete",
    abilities: [{
      type: "forbid-targeting-owner",
      cardTags: ["targeting:trick"],
      cardColor: "black",
      excludedCardTags: ["targeting:collateral"]
    }]
  }
};

export const EARLY_SKILLS_BY_PACK = {
  wind: windSkills,
  fire: fireSkills,
  forest: forestSkills
} as const;

export function createEarlyExpansionWorkflows(
  pack: "wind" | "fire" | "forest"
): WorkflowDefinition[] {
  const ids: Set<string> = pack === "wind"
    ? new Set<string>([
        EARLY_WORKFLOW.shensu,
        EARLY_WORKFLOW.jushou,
        EARLY_WORKFLOW.tianxiang,
        EARLY_WORKFLOW.buquDying,
        EARLY_WORKFLOW.buquDeath,
        EARLY_WORKFLOW.buquRecover,
        EARLY_WORKFLOW.guhuo
      ])
    : pack === "fire"
      ? new Set<string>([
          EARLY_WORKFLOW.qiangxi,
          EARLY_WORKFLOW.quhu,
          EARLY_WORKFLOW.jieming,
          EARLY_WORKFLOW.niepan,
          EARLY_WORKFLOW.shuangxiong,
          EARLY_WORKFLOW.tianyi,
          EARLY_WORKFLOW.mengjin
        ])
      : new Set<string>([
          EARLY_WORKFLOW.xingshang,
          EARLY_WORKFLOW.fangzhu,
          EARLY_WORKFLOW.songwei,
          EARLY_WORKFLOW.zaiqi,
          EARLY_WORKFLOW.lieren,
          EARLY_WORKFLOW.yinghun,
          EARLY_WORKFLOW.haoshi,
          EARLY_WORKFLOW.dimeng,
          EARLY_WORKFLOW.luanwu,
          EARLY_WORKFLOW.benghuai,
          EARLY_WORKFLOW.baonue
        ]);
  return [
    shensu,
    jushou,
    tianxiang,
    buquDying,
    buquDeath,
    buquRecover,
    guhuo,
    qiangxi,
    quhu,
    jieming,
    niepan,
    shuangxiong,
    tianyi,
    mengjin,
    xingshang,
    fangzhu,
    songwei,
    zaiqi,
    lieren,
    yinghun,
    haoshi,
    dimeng,
    luanwu,
    benghuai,
    baonue
  ].filter((workflow) => ids.has(workflow.id));
}

export function earlySkillDefinitions(
  pack: "wind" | "fire" | "forest"
): Readonly<Record<string, SkillDefinition>> {
  return EARLY_SKILLS_BY_PACK[pack];
}

export function earlyResolutionRules(
  pack: "wind" | "fire" | "forest"
): CardResolutionRule[] {
  if (pack !== "forest") return [];
  return [
    {
      id: "forest:resolution:savage-immunity",
      match: { definitionIds: [STANDARD_CARD.savageAssault] },
      scope: "each-target",
      operation: {
        type: "exclude-target-with-skills",
        skillIds: [
          skillId("forest", "祸首"),
          skillId("forest", "巨象")
        ]
      }
    },
    {
      id: "forest:resolution:weimu",
      match: { category: "trick" },
      scope: "each-target",
      operation: {
        type: "exclude-target-with-skills",
        skillIds: [skillId("forest", "帷幕")],
        cardColor: "black",
        excludedDefinitionIds: [STANDARD_CARD.collateral]
      }
    }
  ];
}
