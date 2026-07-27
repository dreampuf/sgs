import { describe, expect, test } from "vitest";
import {
  STANDARD_CARD,
  createGameState,
  createStandardRegistry,
  deserializeGameState,
  dispatch,
  handZone,
  serializeGameState
} from "../../src/core";
import type {
  ContentPack,
  DispatchResult,
  GameState,
  WorkflowDefinition
} from "../../src/core";

const CUSTOM_CARD = "test:inspect-and-strike";
const CUSTOM_WORKFLOW = "test:workflow:inspect-and-strike";

const workflow: WorkflowDefinition = {
  id: CUSTOM_WORKFLOW,
  run({ state, context, input }) {
    const targetId = context.targetIds[0]!;
    if (input?.type === "selected") {
      return {
        effects: [
          {
            type: "move-card",
            cardId: input.cardIds[0]!,
            toZoneId: handZone(context.sourceId),
            reason: "snatch"
          },
          {
            type: "damage",
            sourceId: context.sourceId,
            targetId,
            amount: 1,
            cardId: context.cardId,
            nature: "normal"
          }
        ]
      };
    }
    return {
      decision: {
        type: "select-cards",
        playerId: context.sourceId,
        cardId: context.cardId,
        selectableCardIds: [...(state.zones[handZone(targetId)] ?? [])],
        minimum: 1,
        maximum: 1,
        reason: "test-inspect"
      },
      resumeData: {}
    };
  }
};

const pack: ContentPack = {
  id: "test-extension",
  version: "1.0.0",
  name: "Workflow extension fixture",
  requires: ["standard@0.3.0"],
  workflows: [workflow],
  skills: [],
  heroes: [],
  cards: [{
    id: CUSTOM_CARD,
    name: "Inspect and strike",
    category: "trick",
    active: true,
    implementation: "complete",
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
    program: {
      steps: [{
        type: "run-workflow",
        workflowId: CUSTOM_WORKFLOW,
        data: {}
      }]
    }
  }]
};

function game() {
  return createGameState({
    seed: 42,
    players: [
      {
        id: "p1",
        heroDefinitionId: "hero:p1",
        maxHp: 4,
        hand: [CUSTOM_CARD]
      },
      {
        id: "p2",
        heroDefinitionId: "hero:p2",
        maxHp: 4,
        hand: ["standard:slash"]
      }
    ]
  });
}

function passNullification(
  result: DispatchResult,
  registry: ReturnType<typeof createStandardRegistry>
): DispatchResult {
  let current = result;
  while (
    current.pendingDecision?.type === "respond-card" &&
    current.pendingDecision.responseKind === "nullification"
  ) {
    current = dispatch(current.state, {
      type: "pass",
      playerId: current.pendingDecision.playerId,
      decisionId: current.pendingDecision.id
    }, registry);
  }
  return current;
}

describe("generic workflow runtime", () => {
  test("an extension adds a resumable card without changing Core", () => {
    const registry = createStandardRegistry();
    registry.registerPack(pack);
    const initial = game();
    const customCardId = initial.zones[handZone("p1")]![0]!;
    const waiting = passNullification(dispatch(
      initial,
      {
        type: "use-card",
        playerId: "p1",
        cardId: customCardId,
        targetIds: ["p2"]
      },
      registry
    ), registry);
    expect(waiting.pendingDecision).toMatchObject({
      type: "select-cards",
      playerId: "p1",
      reason: "test-inspect"
    });
    expect(waiting.state.pendingDecision?.continuation).toMatchObject({
      type: "workflow",
      resume: { workflowId: CUSTOM_WORKFLOW }
    });

    const restored = deserializeGameState(serializeGameState(waiting.state));
    const selectedCardId = restored.zones[handZone("p2")]![0]!;
    const resolved = dispatch(
      restored,
      {
        type: "choose-cards",
        playerId: "p1",
        decisionId: restored.pendingDecision!.request.id,
        cardIds: [selectedCardId]
      },
      registry
    );
    expect(resolved.state.zones[handZone("p1")]).toContain(selectedCardId);
    expect(resolved.state.players.p2?.hp).toBe(3);
  });

  test("workflow inspection receives a detached state snapshot", () => {
    const registry = createStandardRegistry();
    registry.registerPack({
      ...pack,
      id: "test-isolation",
      workflows: [{
        id: "test:workflow:isolation",
        run({ state }) {
          (state as GameState).players.p1!.hp = 1;
          return {};
        }
      }],
      cards: [{
        ...pack.cards[0]!,
        id: "test:isolation",
        target: { type: "none" },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: "test:workflow:isolation",
            data: {}
          }]
        }
      }]
    });
    const initial = createGameState({
      seed: 43,
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: ["test:isolation"]
        },
        {
          id: "p2",
          heroDefinitionId: "hero:p2",
          maxHp: 4
        }
      ]
    });
    const result = passNullification(dispatch(
      initial,
      {
        type: "use-card",
        playerId: "p1",
        cardId: initial.zones[handZone("p1")]![0]!,
        targetIds: []
      },
      registry
    ), registry);
    expect(result.state.players.p1?.hp).toBe(4);
  });

  test("option decisions serialize and resume through the same workflow channel", () => {
    const registry = createStandardRegistry();
    registry.registerPack({
      id: "test-option-workflow",
      version: "1.0.0",
      name: "Option workflow fixture",
      requires: ["standard@0.3.0"],
      skills: [],
      heroes: [],
      workflows: [{
        id: "test:workflow:option",
        run({ context, input }) {
          if (input?.type === "option-selected") {
            return {
              effects: [{
                type: "draw",
                playerId: context.sourceId,
                count: input.option === "two" ? 2 : 1,
                cardId: context.cardId
              }]
            };
          }
          return {
            decision: {
              type: "choose-option",
              playerId: context.sourceId,
              cardId: context.cardId,
              options: ["one", "two"],
              reason: "test-option"
            },
            resumeData: {}
          };
        }
      }],
      cards: [{
        id: "test:option-card",
        name: "Option card",
        category: "trick",
        active: true,
        implementation: "complete",
        target: { type: "none" },
        program: {
          steps: [{
            type: "run-workflow",
            workflowId: "test:workflow:option"
          }]
        }
      }]
    });
    const initial = createGameState({
      seed: 44,
      drawPile: [STANDARD_CARD.slash, STANDARD_CARD.jink],
      players: [
        {
          id: "p1",
          heroDefinitionId: "hero:p1",
          maxHp: 4,
          hand: ["test:option-card"]
        },
        { id: "p2", heroDefinitionId: "hero:p2", maxHp: 4 }
      ]
    });
    const waiting = passNullification(dispatch(initial, {
      type: "use-card",
      playerId: "p1",
      cardId: initial.zones[handZone("p1")]![0]!,
      targetIds: []
    }, registry), registry);
    expect(waiting.pendingDecision).toMatchObject({
      type: "choose-option",
      options: ["one", "two"],
      reason: "test-option"
    });
    const restored = deserializeGameState(serializeGameState(waiting.state));
    const resolved = dispatch(restored, {
      type: "choose-option",
      playerId: "p1",
      decisionId: restored.pendingDecision!.request.id,
      option: "two"
    }, registry);
    expect(resolved.state.zones[handZone("p1")]).toHaveLength(2);
  });
});
