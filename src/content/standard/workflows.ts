import type {
  WorkflowDefinition,
  WorkflowRunContext,
  WorkflowResult
} from "../../core/registry";
import {
  DISCARD_PILE,
  equipmentZone,
  handZone
} from "../../core/state";
import type {
  RunWorkflowEffect,
  WorkflowData
} from "../../core/types";

export const STANDARD_WORKFLOW = {
  duel: "standard:workflow:duel",
  amazingGrace: "standard:workflow:amazing-grace",
  fireAttack: "standard:workflow:fire-attack",
  collateral: "standard:workflow:collateral",
  doubleSword: "standard:workflow:double-sword",
  tuxi: "standard:workflow:tuxi",
  luoyi: "standard:workflow:luoyi",
  fanjian: "standard:workflow:fanjian",
  blade: "standard:workflow:blade",
  axe: "standard:workflow:axe",
  judgmentReplacement: "standard:workflow:judgment-replacement",
  ganglie: "standard:workflow:ganglie",
  jijiangUse: "standard:workflow:jijiang-use",
  yiji: "standard:workflow:yiji",
  luoshen: "standard:workflow:luoshen",
  guanxing: "standard:workflow:guanxing",
} as const;

function text(
  data: Readonly<WorkflowData>,
  key: string
): string | undefined {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

function strings(
  data: Readonly<WorkflowData>,
  key: string
): string[] {
  const value = data[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return [];
  }
  return [...value] as string[];
}

function runWorkflow(
  workflowId: string,
  context: WorkflowRunContext["context"],
  data: WorkflowData
): RunWorkflowEffect {
  return {
    type: "run-workflow",
    workflowId,
    context: {
      sourceId: context.sourceId,
      cardId: context.cardId,
      targetIds: [...context.targetIds],
    },
    data
  };
}

const duel: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.duel,
  run({ context, data, input, cardDefinitionIdsWithTag }): WorkflowResult {
    const responderId =
      text(data, "responderId") ?? context.targetIds[0];
    const opponentId = text(data, "opponentId") ?? context.sourceId;
    if (!responderId || !opponentId) {
      throw new Error("duel workflow requires two players");
    }
    if (input?.type === "responded") {
      return {
        effects: [runWorkflow(STANDARD_WORKFLOW.duel, context, {
          responderId: opponentId,
          opponentId: responderId
        })]
      };
    }
    if (input?.type === "passed") {
      return {
        effects: [{
          type: "damage",
          sourceId: opponentId,
          targetId: responderId,
          amount: 1,
          cardId: context.cardId,
          nature: "normal"
        }]
      };
    }
    return {
      decision: {
        type: "respond-card",
        playerId: responderId,
        cardId: context.cardId,
        acceptedDefinitionIds: cardDefinitionIdsWithTag("response:slash"),
        passAllowed: true,
        responseKind: "slash",
        opponentId
      },
      resumeData: { responderId, opponentId }
    };
  }
};

const amazingGrace: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.amazingGrace,
  run({ state, context, data, input }): WorkflowResult {
    const phase = text(data, "phase") ?? "prepare";
    const storedPlayerIds = strings(data, "playerIds");
    const playerIds = storedPlayerIds.length > 0
      ? storedPlayerIds
      : state.turnOrder.filter((playerId) => state.players[playerId]?.alive);
    if (phase === "prepare") {
      const tableZoneId = `zone:table:${context.cardId}`;
      return {
        effects: [{
          type: "take-top-cards",
          cardId: context.cardId,
          count: playerIds.length,
          toZoneId: tableZoneId,
          reason: "amazing-grace",
          resume: {
            workflowId: STANDARD_WORKFLOW.amazingGrace,
            context: {
              sourceId: context.sourceId,
              cardId: context.cardId,
              targetIds: [...context.targetIds]
            },
            data: { phase: "after-take", playerIds, tableZoneId }
          }
        }]
      };
    }
    if (phase === "after-take") {
      if (input?.type !== "cards-taken") {
        throw new Error("amazing grace expected revealed cards");
      }
      return {
        effects: [runWorkflow(STANDARD_WORKFLOW.amazingGrace, context, {
          phase: "step",
          playerIds,
          availableCardIds: [...input.cardIds],
          tableZoneId: text(data, "tableZoneId") ?? ""
        })]
      };
    }

    const availableCardIds = strings(data, "availableCardIds").filter(
      (cardId) => state.cards[cardId] !== undefined
    );
    if (phase === "step") {
      const alivePlayerIds = playerIds.filter(
        (playerId) => state.players[playerId]?.alive
      );
      const [playerId, ...remainingPlayerIds] = alivePlayerIds;
      if (!playerId || availableCardIds.length === 0) {
        return {
          effects: availableCardIds.map((cardId) => ({
            type: "move-card",
            cardId,
            toZoneId: DISCARD_PILE,
            reason: "resolve"
          }))
        };
      }
      return {
        effects: [{
          type: "resolve-target",
          sourceId: context.sourceId,
          cardId: context.cardId,
          targetId: playerId,
          effects: [runWorkflow(
            STANDARD_WORKFLOW.amazingGrace,
            context,
            {
              phase: "choose",
              playerId,
              playerIds: remainingPlayerIds,
              availableCardIds
            }
          )],
          onCancelled: [runWorkflow(
            STANDARD_WORKFLOW.amazingGrace,
            context,
            {
              phase: "step",
              playerIds: remainingPlayerIds,
              availableCardIds
            }
          )]
        }]
      };
    }
    if (phase !== "choose") {
      throw new Error(`unknown amazing grace phase: ${phase}`);
    }
    const playerId = text(data, "playerId");
    if (!playerId) throw new Error("amazing grace choice requires a player");
    if (input?.type === "selected") {
      const selectedCardIds = input.cardIds.filter(
        (cardId) => availableCardIds.includes(cardId)
      );
      return {
        effects: [
          ...selectedCardIds.map((cardId) => ({
            type: "move-card" as const,
            cardId,
            toZoneId: handZone(playerId),
            reason: "resolve" as const
          })),
          runWorkflow(STANDARD_WORKFLOW.amazingGrace, context, {
            phase: "step",
            playerIds,
            availableCardIds: availableCardIds.filter(
              (cardId) => !selectedCardIds.includes(cardId)
            )
          })
        ]
      };
    }
    return {
      decision: {
        type: "select-cards",
        playerId,
        cardId: context.cardId,
        selectableCardIds: availableCardIds,
        minimum: 1,
        maximum: 1,
        reason: "amazing-grace"
      },
      resumeData: {
        phase: "choose",
        playerId,
        playerIds,
        availableCardIds
      }
    };
  }
};

const fireAttack: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.fireAttack,
  run({
    state,
    context,
    data,
    input,
    effectiveCardSuit
  }): WorkflowResult {
    const phase = text(data, "phase") ?? "reveal";
    const targetId = text(data, "targetId") ?? context.targetIds[0];
    if (!targetId) throw new Error("fire attack requires a target");
    if (phase === "reveal") {
      if (input?.type === "selected") {
        const revealedCardId = input.cardIds[0];
        const suit = revealedCardId
          ? effectiveCardSuit(revealedCardId, targetId)
          : undefined;
        if (!revealedCardId || !suit) {
          throw new Error("fire attack requires a suited revealed card");
        }
        const selectableCardIds = (
          state.zones[handZone(context.sourceId)] ?? []
        ).filter(
          (cardId) =>
            effectiveCardSuit(cardId, context.sourceId) === suit
        );
        return {
          effects: [
            {
              type: "reveal-card",
              playerId: targetId,
              cardId: revealedCardId,
              reason: "fire-attack"
            },
            ...(selectableCardIds.length === 0
              ? []
              : [runWorkflow(STANDARD_WORKFLOW.fireAttack, context, {
                  phase: "discard",
                  targetId,
                  selectableCardIds
                })])
          ]
        };
      }
      const selectableCardIds = [
        ...(state.zones[handZone(targetId)] ?? [])
      ];
      if (selectableCardIds.length === 0) return {};
      return {
        decision: {
          type: "select-cards",
          playerId: targetId,
          cardId: context.cardId,
          selectableCardIds,
          minimum: 1,
          maximum: 1,
          reason: "fire-attack-reveal"
        },
        resumeData: { phase: "reveal", targetId }
      };
    }
    if (phase !== "discard") {
      throw new Error(`unknown fire attack phase: ${phase}`);
    }
    const selectableCardIds = strings(data, "selectableCardIds").filter(
      (cardId) => (state.zones[handZone(context.sourceId)] ?? []).includes(cardId)
    );
    if (input?.type === "selected") {
      return {
        effects: [
          ...input.cardIds.map((cardId) => ({
            type: "move-card" as const,
            cardId,
            toZoneId: DISCARD_PILE,
            reason: "discard" as const
          })),
          {
            type: "damage",
            sourceId: context.sourceId,
            targetId,
            amount: 1,
            cardId: context.cardId,
            nature: "fire"
          }
        ]
      };
    }
    if (selectableCardIds.length === 0) return {};
    return {
      decision: {
        type: "select-cards",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectableCardIds,
        minimum: 1,
        maximum: 1,
        reason: "fire-attack-discard"
      },
      resumeData: { phase: "discard", targetId, selectableCardIds }
    };
  }
};

const collateral: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.collateral,
  run({
    state,
    context,
    data,
    input,
    cardDefinition,
    cardDefinitionIdsWithTag
  }): WorkflowResult {
    const weaponHolderId =
      text(data, "weaponHolderId") ?? context.targetIds[0];
    const slashTargetId =
      text(data, "slashTargetId") ?? context.targetIds[1];
    if (!weaponHolderId || !slashTargetId) {
      throw new Error("collateral requires two targets");
    }
    const weaponCardId =
      text(data, "weaponCardId") ??
      (state.zones[equipmentZone(weaponHolderId)] ?? []).find((cardId) => {
        const definitionId = state.cards[cardId]?.definitionId;
        return definitionId
          ? cardDefinition(definitionId).equipment?.slot === "weapon"
          : false;
      });
    if (!weaponCardId) return {};
    if (input?.type === "responded") {
      return {
        effects: [{
          type: "apply-card",
          sourceId: weaponHolderId,
          cardId: input.cardId,
          targetIds: [slashTargetId]
        }]
      };
    }
    if (input?.type === "passed") {
      const stillEquipped = (
        state.zones[equipmentZone(weaponHolderId)] ?? []
      ).includes(weaponCardId);
      return {
        effects: stillEquipped
          ? [{
              type: "move-card",
              cardId: weaponCardId,
              toZoneId: handZone(context.sourceId),
              reason: "snatch"
            }]
          : []
      };
    }
    return {
      decision: {
        type: "respond-card",
        playerId: weaponHolderId,
        cardId: context.cardId,
        acceptedDefinitionIds: cardDefinitionIdsWithTag("response:slash"),
        passAllowed: true,
        responseKind: "slash"
      },
      resumeData: {
        weaponHolderId,
        slashTargetId,
        weaponCardId
      }
    };
  }
};

const doubleSword: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.doubleSword,
  run({
    state,
    context,
    data,
    input,
    heroDefinition
  }): WorkflowResult {
    const targetId = text(data, "targetId") ?? context.targetIds[0];
    if (!targetId) return {};
    const sourceHeroId = state.players[context.sourceId]?.heroDefinitionId;
    const targetHeroId = state.players[targetId]?.heroDefinitionId;
    if (!sourceHeroId || !targetHeroId) return {};
    try {
      if (
        heroDefinition(sourceHeroId).gender ===
        heroDefinition(targetHeroId).gender
      ) {
        return {};
      }
    } catch {
      return {};
    }
    const targetHand = [...(state.zones[handZone(targetId)] ?? [])];
    if (input?.type === "selected") {
      return {
        effects: input.cardIds.map((cardId) => ({
          type: "move-card",
          cardId,
          toZoneId: DISCARD_PILE,
          reason: "discard"
        }))
      };
    }
    if (input?.type === "option-selected") {
      if (input.option === "draw" || targetHand.length === 0) {
        return {
          effects: [{
            type: "draw",
            playerId: context.sourceId,
            count: 1,
            cardId: context.cardId
          }]
        };
      }
      return {
        decision: {
          type: "select-cards",
          playerId: targetId,
          cardId: context.cardId,
          selectableCardIds: targetHand,
          minimum: 1,
          maximum: 1,
          reason: "double-sword-discard"
        },
        resumeData: { targetId }
      };
    }
    if (targetHand.length === 0) {
      return {
        effects: [{
          type: "draw",
          playerId: context.sourceId,
          count: 1,
          cardId: context.cardId
        }]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: targetId,
        cardId: context.cardId,
        options: ["discard", "draw"],
        reason: "double-sword"
      },
      resumeData: { targetId }
    };
  }
};

const tuxi: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.tuxi,
  run({ state, context, data, input }): WorkflowResult {
    const phase = text(data, "phase") ?? "targets";
    if (phase === "targets") {
      if (input?.type === "players-selected") {
        if (input.playerIds.length === 0) return {};
        return {
          effects: [
            {
              type: "set-mark",
              playerId: context.sourceId,
              mark: "skipDraw",
              value: true,
              cardId: context.cardId
            },
            runWorkflow(STANDARD_WORKFLOW.tuxi, context, {
              phase: "steal",
              playerIds: input.playerIds,
              index: 0
            })
          ]
        };
      }
      const selectablePlayerIds = state.turnOrder.filter(
        (playerId) =>
          playerId !== context.sourceId &&
          state.players[playerId]?.alive === true &&
          (state.zones[handZone(playerId)]?.length ?? 0) > 0
      );
      if (selectablePlayerIds.length === 0) return {};
      return {
        decision: {
          type: "select-players",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectablePlayerIds,
          minimum: 0,
          maximum: Math.min(2, selectablePlayerIds.length),
          reason: "tuxi-targets"
        },
        resumeData: { phase: "targets" }
      };
    }
    if (phase !== "steal") {
      throw new Error(`unknown tuxi phase: ${phase}`);
    }
    const playerIds = strings(data, "playerIds");
    const rawIndex = data.index;
    const index = typeof rawIndex === "number" ? rawIndex : 0;
    if (input?.type === "selected") {
      return {
        effects: [
          ...input.cardIds.map((cardId) => ({
            type: "move-card" as const,
            cardId,
            toZoneId: handZone(context.sourceId),
            reason: "snatch" as const
          })),
          runWorkflow(STANDARD_WORKFLOW.tuxi, context, {
            phase: "steal",
            playerIds,
            index: index + 1
          })
        ]
      };
    }
    const targetId = playerIds[index];
    if (!targetId) return {};
    const selectableCardIds = [
      ...(state.zones[handZone(targetId)] ?? [])
    ];
    if (selectableCardIds.length === 0) {
      return {
        effects: [runWorkflow(STANDARD_WORKFLOW.tuxi, context, {
          phase: "steal",
          playerIds,
          index: index + 1
        })]
      };
    }
    return {
      decision: {
        type: "select-cards",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectableCardIds,
        minimum: 1,
        maximum: 1,
        reason: "tuxi-card"
      },
      resumeData: { phase: "steal", playerIds, index }
    };
  }
};

const luoyi: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.luoyi,
  run({ context, input }): WorkflowResult {
    if (input?.type === "option-selected") {
      return input.option === "activate"
        ? {
            effects: [{
              type: "set-mark",
              playerId: context.sourceId,
              mark: "luoyi",
              value: true,
              cardId: context.cardId
            }]
          }
        : {};
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "luoyi"
      },
      resumeData: {}
    };
  }
};

const fanjian: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.fanjian,
  run({ state, context, input }): WorkflowResult {
    const targetId = context.targetIds[0];
    const materialCardId =
      state.cards[context.cardId]?.materialCardIds?.[0];
    if (!targetId || !materialCardId) return {};
    if (input?.type === "option-selected") {
      const materialSuit = state.cards[materialCardId]?.suit;
      return {
        effects: [
          {
            type: "move-card",
            cardId: materialCardId,
            toZoneId: handZone(targetId),
            reason: "give"
          },
          {
            type: "reveal-card",
            playerId: targetId,
            cardId: materialCardId,
            reason: "fanjian"
          },
          ...(materialSuit !== input.option
            ? [{
                type: "damage" as const,
                sourceId: context.sourceId,
                targetId,
                amount: 1,
                cardId: context.cardId,
                nature: "normal" as const
              }]
            : [])
        ]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: targetId,
        cardId: context.cardId,
        options: ["diamond", "heart", "club", "spade"],
        reason: "fanjian-suit"
      },
      resumeData: {}
    };
  }
};

const blade: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.blade,
  run({
    state,
    context,
    data,
    input,
    cardDefinition
  }): WorkflowResult {
    const targetId = text(data, "targetId") ?? context.targetIds[0];
    if (!targetId) return {};
    const slashCardIds = (state.zones[handZone(context.sourceId)] ?? [])
      .filter((cardId) => {
        const definitionId = state.cards[cardId]?.definitionId;
        return definitionId !== undefined &&
          cardDefinition(definitionId).tags?.includes("response:slash");
      });
    if (input?.type === "selected") {
      const cardId = input.cardIds[0];
      return cardId
        ? {
            effects: [{
              type: "use-card-instance",
              sourceId: context.sourceId,
              cardId,
              targetIds: [targetId],
              skillId: "standard:blade"
            }]
          }
        : {};
    }
    if (input?.type === "option-selected") {
      if (input.option !== "activate" || slashCardIds.length === 0) return {};
      return {
        decision: {
          type: "select-cards",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectableCardIds: slashCardIds,
          minimum: 1,
          maximum: 1,
          reason: "blade-slash"
        },
        resumeData: { targetId }
      };
    }
    if (slashCardIds.length === 0) return {};
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "blade"
      },
      resumeData: { targetId }
    };
  }
};

const axe: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.axe,
  run({
    state,
    context,
    data,
    input,
    cardDefinition
  }): WorkflowResult {
    const targetId = text(data, "targetId") ?? context.targetIds[0];
    if (!targetId) return {};
    const availableCardIds = [
      ...(state.zones[handZone(context.sourceId)] ?? []),
      ...(state.zones[equipmentZone(context.sourceId)] ?? [])
    ];
    if (input?.type === "selected") {
      if (input.cardIds.length !== 2) return {};
      const sourceDefinitionId =
        state.cards[context.cardId]?.definitionId;
      const tags = sourceDefinitionId
        ? cardDefinition(sourceDefinitionId).tags ?? []
        : [];
      const nature = tags.includes("damage:fire")
        ? "fire"
        : tags.includes("damage:thunder")
          ? "thunder"
          : "normal";
      return {
        effects: [
          ...input.cardIds.map((cardId) => ({
            type: "move-card" as const,
            cardId,
            toZoneId: DISCARD_PILE,
            reason: "discard" as const
          })),
          {
            type: "damage",
            sourceId: context.sourceId,
            targetId,
            amount:
              state.players[context.sourceId]?.marks.wineDamage === true
                ? 2
                : 1,
            cardId: context.cardId,
            nature,
            tags: ["armor:vine-blockable"]
          }
        ]
      };
    }
    if (input?.type === "option-selected") {
      if (input.option !== "activate" || availableCardIds.length < 2) {
        return {};
      }
      return {
        decision: {
          type: "select-cards",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectableCardIds: availableCardIds,
          minimum: 2,
          maximum: 2,
          reason: "axe-discard"
        },
        resumeData: { targetId }
      };
    }
    if (availableCardIds.length < 2) return {};
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "axe"
      },
      resumeData: { targetId }
    };
  }
};

const judgmentReplacement: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.judgmentReplacement,
  run({
    state,
    context,
    data,
    input,
    effectiveCardSuit
  }): WorkflowResult {
    const judgmentId = text(data, "judgmentId");
    if (!judgmentId) return {};
    const configuredZones = strings(data, "zones");
    const zones = configuredZones.length > 0
      ? configuredZones.filter(
          (zone): zone is "hand" | "equipment" =>
            zone === "hand" || zone === "equipment"
        )
      : ["hand"] as const;
    const color = text(data, "color");
    const reason = text(data, "reason") ?? "judgment-replacement";
    const obtainOldCard = data.obtainOldCard === true;
    const selectableCardIds = zones.flatMap((zone) =>
      state.zones[
        zone === "hand"
          ? handZone(context.sourceId)
          : equipmentZone(context.sourceId)
      ] ?? []
    ).filter((cardId) => {
      if (color !== "red" && color !== "black") return true;
      const suit = effectiveCardSuit(cardId, context.sourceId);
      const actualColor =
        suit === "diamond" || suit === "heart" ? "red" :
        suit === "club" || suit === "spade" ? "black" :
        "colorless";
      return actualColor === color;
    });
    const resumeData: WorkflowData = {
      judgmentId,
      zones: [...zones],
      ...(color ? { color } : {}),
      reason,
      obtainOldCard
    };
    if (input?.type === "selected") {
      const replacementCardId = input.cardIds[0];
      return replacementCardId
        ? {
            effects: [{
              type: "replace-judgment-card",
              judgmentId,
              replacementCardId,
              playerId: context.sourceId,
              ...(obtainOldCard
                ? {
                    oldCardDestination: {
                      toZoneId: handZone(context.sourceId),
                      reason: "snatch" as const
                    }
                  }
                : {})
            }]
          }
        : {};
    }
    if (input?.type === "option-selected") {
      if (input.option !== "activate" || selectableCardIds.length === 0) {
        return {};
      }
      return {
        decision: {
          type: "select-cards",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectableCardIds,
          minimum: 1,
          maximum: 1,
          reason: `${reason}-card`
        },
        resumeData
      };
    }
    if (selectableCardIds.length === 0) return {};
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason
      },
      resumeData
    };
  }
};

const ganglie: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.ganglie,
  run({ state, context, data, input }): WorkflowResult {
    const phase = text(data, "phase") ?? "activate";
    const targetId = text(data, "targetId") ?? context.targetIds[0];
    if (!targetId || !state.players[targetId]?.alive) return {};
    if (phase === "activate") {
      if (input?.type === "option-selected") {
        if (input.option !== "activate") return {};
        return {
          effects: [{
            type: "request-judgment",
            playerId: context.sourceId,
            cardId: context.cardId,
            reason: "ganglie",
            pattern: { excludedSuits: ["heart"] },
            onMatch: [runWorkflow(STANDARD_WORKFLOW.ganglie, context, {
              phase: "penalty",
              targetId
            })],
            onMiss: []
          }]
        };
      }
      return {
        decision: {
          type: "choose-option",
          playerId: context.sourceId,
          cardId: context.cardId,
          options: ["skip", "activate"],
          reason: "ganglie"
        },
        resumeData: { phase, targetId }
      };
    }
    if (phase !== "penalty") {
      throw new Error(`unknown ganglie phase: ${phase}`);
    }
    const targetHand = [...(state.zones[handZone(targetId)] ?? [])];
    if (input?.type === "selected") {
      return {
        effects: input.cardIds.map((cardId) => ({
          type: "move-card",
          cardId,
          toZoneId: DISCARD_PILE,
          reason: "discard"
        }))
      };
    }
    if (input?.type === "option-selected") {
      if (input.option !== "discard" || targetHand.length < 2) {
        return {
          effects: [{
            type: "damage",
            sourceId: context.sourceId,
            targetId,
            amount: 1,
            cardId: context.cardId,
            nature: "normal"
          }]
        };
      }
      return {
        decision: {
          type: "select-cards",
          playerId: targetId,
          cardId: context.cardId,
          selectableCardIds: targetHand,
          minimum: 2,
          maximum: 2,
          reason: "ganglie-discard"
        },
        resumeData: { phase, targetId }
      };
    }
    if (targetHand.length < 2) {
      return {
        effects: [{
          type: "damage",
          sourceId: context.sourceId,
          targetId,
          amount: 1,
          cardId: context.cardId,
          nature: "normal"
        }]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: targetId,
        cardId: context.cardId,
        options: ["damage", "discard"],
        reason: "ganglie-penalty"
      },
      resumeData: { phase, targetId }
    };
  }
};

const jijiangUse: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.jijiangUse,
  run({
    state,
    context,
    data,
    input,
    heroDefinition,
    cardDefinitionIdsWithTag
  }): WorkflowResult {
    const allyIds = strings(data, "allyIds");
    const eligibleAllyIds = allyIds.length > 0
      ? allyIds
      : state.turnOrder.filter((playerId) => {
          if (
            playerId === context.sourceId ||
            !state.players[playerId]?.alive
          ) {
            return false;
          }
          const heroId = state.players[playerId]?.heroDefinitionId;
          if (!heroId) return false;
          try {
            return heroDefinition(heroId).kingdom === "shu";
          } catch {
            return false;
          }
        });
    const rawIndex = data.index;
    const index = typeof rawIndex === "number" ? rawIndex : 0;
    if (input?.type === "responded") {
      return {
        effects: [{
          type: "use-card-instance",
          sourceId: context.sourceId,
          cardId: input.cardId,
          targetIds: [...context.targetIds],
          skillId: "standard:skill:激将"
        }]
      };
    }
    if (input?.type === "passed") {
      return {
        effects: [runWorkflow(STANDARD_WORKFLOW.jijiangUse, context, {
          allyIds: eligibleAllyIds,
          index: index + 1
        })]
      };
    }
    const allyId = eligibleAllyIds[index];
    if (!allyId) return {};
    return {
      decision: {
        type: "respond-card",
        playerId: allyId,
        cardId: context.cardId,
        acceptedDefinitionIds:
          cardDefinitionIdsWithTag("response:slash"),
        passAllowed: true,
        responseKind: "slash"
      },
      resumeData: { allyIds: eligibleAllyIds, index }
    };
  }
};

const yiji: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.yiji,
  run({ state, context, data, input }): WorkflowResult {
    const phase = text(data, "phase") ?? "point";
    const storedRemaining = data.remaining;
    const remaining = typeof storedRemaining === "number"
      ? storedRemaining
      : 1;
    if (remaining <= 0) return {};
    if (phase === "point") {
      if (input?.type === "option-selected") {
        if (input.option !== "activate") {
          return remaining > 1
            ? {
                effects: [runWorkflow(STANDARD_WORKFLOW.yiji, context, {
                  phase,
                  remaining: remaining - 1
                })]
              }
            : {};
        }
        const tableZoneId =
          `zone:table:yiji:${context.cardId}:${remaining}`;
        return {
          effects: [{
            type: "take-top-cards",
            cardId: context.cardId,
            count: 2,
            toZoneId: tableZoneId,
            reason: "yiji",
            resume: {
              workflowId: STANDARD_WORKFLOW.yiji,
              context: structuredClone(context),
              data: {
                phase: "after-take",
                remaining,
                tableZoneId
              }
            }
          }]
        };
      }
      return {
        decision: {
          type: "choose-option",
          playerId: context.sourceId,
          cardId: context.cardId,
          options: ["skip", "activate"],
          reason: "yiji"
        },
        resumeData: { phase, remaining }
      };
    }
    if (phase === "after-take") {
      if (input?.type !== "cards-taken") {
        throw new Error("yiji expected cards from the draw pile");
      }
      return {
        effects: [runWorkflow(STANDARD_WORKFLOW.yiji, context, {
          phase: "assign",
          remaining,
          cardIds: input.cardIds,
          index: 0
        })]
      };
    }
    if (phase !== "assign") {
      throw new Error(`unknown yiji phase: ${phase}`);
    }
    const cardIds = strings(data, "cardIds");
    const rawIndex = data.index;
    const index = typeof rawIndex === "number" ? rawIndex : 0;
    const cardId = cardIds[index];
    if (input?.type === "players-selected") {
      const recipientId = input.playerIds[0] ?? context.sourceId;
      return {
        effects: [
          ...(cardId
            ? [{
                type: "move-card" as const,
                cardId,
                toZoneId: handZone(recipientId),
                reason: "give" as const
              }]
            : []),
          runWorkflow(STANDARD_WORKFLOW.yiji, context, {
            phase,
            remaining,
            cardIds,
            index: index + 1
          })
        ]
      };
    }
    if (!cardId) {
      return remaining > 1
        ? {
            effects: [runWorkflow(STANDARD_WORKFLOW.yiji, context, {
              phase: "point",
              remaining: remaining - 1
            })]
          }
        : {};
    }
    return {
      decision: {
        type: "select-players",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectablePlayerIds: state.turnOrder.filter(
          (playerId) => state.players[playerId]?.alive
        ),
        minimum: 1,
        maximum: 1,
        reason: "yiji-recipient"
      },
      resumeData: { phase, remaining, cardIds, index }
    };
  }
};

const luoshen: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.luoshen,
  run({ context, input }): WorkflowResult {
    if (input?.type === "option-selected") {
      if (input.option !== "activate") return {};
      return {
        effects: [{
          type: "request-judgment",
          playerId: context.sourceId,
          cardId: context.cardId,
          reason: "luoshen",
          pattern: { includedSuits: ["club", "spade"] },
          matchedCardDestination: {
            toZoneId: handZone(context.sourceId),
            reason: "snatch"
          },
          onMatch: [runWorkflow(STANDARD_WORKFLOW.luoshen, context, {})],
          onMiss: []
        }]
      };
    }
    return {
      decision: {
        type: "choose-option",
        playerId: context.sourceId,
        cardId: context.cardId,
        options: ["skip", "activate"],
        reason: "luoshen"
      },
      resumeData: {}
    };
  }
};

const guanxing: WorkflowDefinition = {
  id: STANDARD_WORKFLOW.guanxing,
  run({ state, context, data, input }): WorkflowResult {
    const phase = text(data, "phase") ?? "activate";
    if (phase === "activate") {
      if (input?.type === "option-selected") {
        if (input.option !== "activate") return {};
        const count = Math.min(
          5,
          state.turnOrder.filter(
            (playerId) => state.players[playerId]?.alive
          ).length
        );
        const tableZoneId = `zone:table:guanxing:${context.cardId}`;
        return {
          effects: [{
            type: "take-top-cards",
            cardId: context.cardId,
            count,
            toZoneId: tableZoneId,
            reason: "guanxing",
            resume: {
              workflowId: STANDARD_WORKFLOW.guanxing,
              context: structuredClone(context),
              data: { phase: "after-take" }
            }
          }]
        };
      }
      return {
        decision: {
          type: "choose-option",
          playerId: context.sourceId,
          cardId: context.cardId,
          options: ["skip", "activate"],
          reason: "guanxing"
        },
        resumeData: { phase }
      };
    }
    if (phase === "after-take") {
      if (input?.type !== "cards-taken") {
        throw new Error("guanxing expected cards from the draw pile");
      }
      return {
        effects: [runWorkflow(STANDARD_WORKFLOW.guanxing, context, {
          phase: "top-choice",
          availableCardIds: input.cardIds,
          topCardIds: [],
          bottomCardIds: []
        })]
      };
    }
    const availableCardIds = strings(data, "availableCardIds");
    const topCardIds = strings(data, "topCardIds");
    const bottomCardIds = strings(data, "bottomCardIds");
    if (phase === "top-choice") {
      if (availableCardIds.length === 0) {
        return {
          effects: [{
            type: "reorder-draw-pile",
            playerId: context.sourceId,
            cardId: context.cardId,
            topCardIds,
            bottomCardIds,
            reason: "guanxing"
          }]
        };
      }
      if (input?.type === "option-selected") {
        return input.option === "select"
          ? {
              effects: [runWorkflow(STANDARD_WORKFLOW.guanxing, context, {
                phase: "top-card",
                availableCardIds,
                topCardIds,
                bottomCardIds
              })]
            }
          : {
              effects: [runWorkflow(STANDARD_WORKFLOW.guanxing, context, {
                phase: "bottom-card",
                availableCardIds,
                topCardIds,
                bottomCardIds
              })]
            };
      }
      return {
        decision: {
          type: "choose-option",
          playerId: context.sourceId,
          cardId: context.cardId,
          options: ["finish", "select"],
          reason: "guanxing-top"
        },
        resumeData: {
          phase,
          availableCardIds,
          topCardIds,
          bottomCardIds
        }
      };
    }
    if (phase === "top-card") {
      if (input?.type === "selected") {
        const selectedId = input.cardIds[0];
        return {
          effects: [runWorkflow(STANDARD_WORKFLOW.guanxing, context, {
            phase: "top-choice",
            availableCardIds: availableCardIds.filter(
              (cardId) => cardId !== selectedId
            ),
            topCardIds: selectedId
              ? [...topCardIds, selectedId]
              : topCardIds,
            bottomCardIds
          })]
        };
      }
      return {
        decision: {
          type: "select-cards",
          playerId: context.sourceId,
          cardId: context.cardId,
          selectableCardIds: availableCardIds,
          minimum: 1,
          maximum: 1,
          reason: "guanxing-top-card"
        },
        resumeData: {
          phase,
          availableCardIds,
          topCardIds,
          bottomCardIds
        }
      };
    }
    if (phase !== "bottom-card") {
      throw new Error(`unknown guanxing phase: ${phase}`);
    }
    if (input?.type === "selected") {
      const selectedId = input.cardIds[0];
      return {
        effects: [runWorkflow(STANDARD_WORKFLOW.guanxing, context, {
          phase,
          availableCardIds: availableCardIds.filter(
            (cardId) => cardId !== selectedId
          ),
          topCardIds,
          bottomCardIds: selectedId
            ? [...bottomCardIds, selectedId]
            : bottomCardIds
        })]
      };
    }
    if (availableCardIds.length <= 1) {
      return {
        effects: [{
          type: "reorder-draw-pile",
          playerId: context.sourceId,
          cardId: context.cardId,
          topCardIds,
          bottomCardIds: [...bottomCardIds, ...availableCardIds],
          reason: "guanxing"
        }]
      };
    }
    return {
      decision: {
        type: "select-cards",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectableCardIds: availableCardIds,
        minimum: 1,
        maximum: 1,
        reason: "guanxing-bottom-card"
      },
      resumeData: {
        phase,
        availableCardIds,
        topCardIds,
        bottomCardIds
      }
    };
  }
};

export function createStandardWorkflows(): WorkflowDefinition[] {
  return [
    duel,
    amazingGrace,
    fireAttack,
    collateral,
    doubleSword,
    tuxi,
    luoyi,
    fanjian,
    blade,
    axe,
    judgmentReplacement,
    ganglie,
    jijiangUse,
    yiji,
    luoshen,
    guanxing,
  ];
}
