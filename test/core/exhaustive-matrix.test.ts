import { describe, expect, test } from "vitest";
import {
  PROCESSING_ZONE,
  STANDARD_CARD,
  createEarlyExpansionRegistry,
  createGameState,
  deserializeGameState,
  equipmentZone,
  getLegalActions,
  handZone,
  judgmentZone,
  observeForPlayer,
  serializeGameState
} from "../../src/core";
import type {
  CardPrint,
  DispatchResult,
  GameCommand,
  GameState,
  LegalAction
} from "../../src/core";
import { GameSession } from "../../src/core";

const registry = createEarlyExpansionRegistry([
  "wind",
  "military",
  "fire",
  "forest"
]);
const heroes = registry.heroes();
const prints = registry.cardPrints();
const definitions = new Map(
  prints.map((print) => [print.definitionId, registry.card(print.definitionId)])
);

function physical(definitionId: string): CardPrint {
  const print = prints.find((candidate) =>
    candidate.definitionId === definitionId
  );
  if (!print) throw new Error(`missing physical print: ${definitionId}`);
  return structuredClone(print);
}

function createRichFixture(
  heroIndex: number,
  print: CardPrint,
  seed: number
): GameState {
  const hero = heroes[heroIndex]!;
  const opponents = [1, 2, 3].map(
    (offset) => heroes[(heroIndex + offset) % heroes.length]!
  );
  const state = createGameState({
    seed,
    phase: "action",
    players: [
      {
        id: "p1",
        heroDefinitionId: hero.id,
        maxHp: hero.maxHp,
        hp: Math.max(1, hero.maxHp - 1),
        skillIds: [...hero.skillIds],
        hand: [
          print,
          physical(STANDARD_CARD.slash),
          physical(STANDARD_CARD.jink),
          physical(STANDARD_CARD.peach),
          physical(STANDARD_CARD.nullification)
        ]
      },
      {
        id: "p2",
        heroDefinitionId: opponents[0]!.id,
        maxHp: opponents[0]!.maxHp,
        skillIds: [...opponents[0]!.skillIds],
        hand: [
          physical(STANDARD_CARD.crossbow),
          physical(STANDARD_CARD.slash),
          physical(STANDARD_CARD.jink),
          physical(STANDARD_CARD.nullification)
        ]
      },
      {
        id: "p3",
        heroDefinitionId: opponents[1]!.id,
        maxHp: opponents[1]!.maxHp,
        skillIds: [...opponents[1]!.skillIds],
        hand: [
          physical(STANDARD_CARD.slash),
          physical(STANDARD_CARD.jink),
          physical(STANDARD_CARD.peach),
          physical(STANDARD_CARD.nullification)
        ]
      },
      {
        id: "p4",
        heroDefinitionId: opponents[2]!.id,
        maxHp: opponents[2]!.maxHp,
        skillIds: [...opponents[2]!.skillIds],
        hand: [
          physical(STANDARD_CARD.slash),
          physical(STANDARD_CARD.jink),
          physical(STANDARD_CARD.peach),
          physical(STANDARD_CARD.nullification)
        ]
      }
    ],
    drawPile: prints.slice(0, 24)
  });
  const weaponId = state.zones[handZone("p2")]!.find(
    (cardId) =>
      state.cards[cardId]?.definitionId === STANDARD_CARD.crossbow
  )!;
  state.zones[handZone("p2")] = state.zones[handZone("p2")]!.filter(
    (cardId) => cardId !== weaponId
  );
  state.zones[equipmentZone("p2")]!.push(weaponId);
  return state;
}

function actionKey(action: GameCommand): string {
  return JSON.stringify(action);
}

function settleDecision(session: GameSession, activate = false): number {
  let decisions = 0;
  while (session.state().pendingDecision) {
    if (decisions >= 128) {
      throw new Error("decision chain exceeded 128 steps");
    }
    const actions = session.legalActions();
    expect(actions.length).toBeGreaterThan(0);
    const action = (
      activate
        ? actions.find((candidate) =>
            candidate.type === "choose-option" &&
            candidate.option === "activate"
          )
        : undefined
    ) ??
      actions.find((candidate) =>
        candidate.type === "choose-option" && candidate.option === "skip"
      ) ??
      actions.find((candidate) => candidate.type === "pass") ??
      actions[0]!;
    session.dispatch(action);
    decisions += 1;
  }
  return decisions;
}

function assertStableState(state: GameState): void {
  const serialized = serializeGameState(state);
  expect(deserializeGameState(serialized)).toEqual(state);
  const sequences = state.eventLog.map((event) => event.sequence);
  expect(sequences).toEqual([...sequences].sort((left, right) => left - right));
  expect(new Set(sequences).size).toBe(sequences.length);
  expect(state.eventLog.every(
    (event) => event.revision <= state.revision
  )).toBe(true);
  for (const playerId of state.turnOrder) {
    const observation = observeForPlayer(state, playerId, registry);
    expect(observation.selfId).toBe(playerId);
    const opponentHandIds = state.turnOrder
      .filter((id) => id !== playerId)
      .flatMap((id) => state.zones[handZone(id)] ?? []);
    expect(observation.ownHand.some(
      (card) => opponentHandIds.includes(card.id)
    )).toBe(false);
  }
}

describe("production Core exhaustive content matrix", () => {
  test("all selected production content is complete and uniquely registered", () => {
    expect(heroes).toHaveLength(49);
    expect(prints).toHaveLength(160);
    expect(definitions.size).toBe(43);
    expect(heroes.every((hero) => hero.implementation === "complete")).toBe(true);
    expect([...definitions.values()].every(
      (definition) => definition.implementation === "complete"
    )).toBe(true);
    expect(new Set(heroes.map((hero) => hero.id)).size).toBe(heroes.length);
    expect(prints.every(
      (print) =>
        print.suit !== undefined &&
        Number.isInteger(print.rank) &&
        print.rank >= 1 &&
        print.rank <= 13
    )).toBe(true);
  });

  test("49 heroes × 160 physical prints dispatch through Core without state leaks", () => {
    let cases = 0;
    let dispatched = 0;
    let decisions = 0;
    for (const [heroIndex, hero] of heroes.entries()) {
      for (const [printIndex, print] of prints.entries()) {
        const state = createRichFixture(
          heroIndex,
          print,
          10_000 + heroIndex * prints.length + printIndex
        );
        const session = new GameSession(state, registry);
        const testedCardId = state.zones[handZone("p1")]![0]!;
        const definition = registry.card(print.definitionId);
        const legal = session.legalActions();
        const cardActions = legal.filter((
          action
        ): action is Extract<LegalAction, { type: "use-card" }> =>
          action.type === "use-card" && action.cardId === testedCardId
        );
        if (definition.active) {
          expect(
            cardActions.length,
            `${hero.name} cannot use ${definition.name} in the rich fixture`
          ).toBeGreaterThan(0);
          for (const action of cardActions) {
            const branch = new GameSession(state, registry);
            const before = branch.snapshot();
            const result: DispatchResult = branch.dispatch(action);
            expect(
              result.events.length,
              `${hero.name}/${definition.name}/${actionKey(action)} emitted nothing`
            ).toBeGreaterThan(0);
            expect(branch.snapshot()).not.toBe(before);
            decisions += settleDecision(branch);
            const settled = branch.state();
            expect(settled.pendingDecision).toBeNull();
            expect(settled.stack).toEqual([]);
            expect(settled.triggerQueue).toEqual([]);
            expect(settled.effectPlans).toEqual({});
            expect(settled.zones[PROCESSING_ZONE]).toEqual([]);
            assertStableState(settled);
            dispatched += 1;
          }
        } else {
          expect(
            cardActions,
            `${hero.name} actively exposed response-only ${definition.name}`
          ).toEqual([]);
        }
        assertStableState(session.state());
        cases += 1;
      }
    }
    expect(cases).toBe(49 * 160);
    expect(dispatched).toBeGreaterThan(cases);
    expect(decisions).toBeGreaterThan(0);
  }, 120_000);

  test("49 heroes × 52 judgments settle all three delayed tricks with both decision branches", () => {
    const judgmentPrints = [...new Map(prints.map((print) => [
      `${print.suit}:${print.rank}`,
      print
    ])).values()];
    expect(judgmentPrints).toHaveLength(52);
    let cases = 0;
    let judgments = 0;
    for (const [heroIndex, hero] of heroes.entries()) {
      for (const judgment of judgmentPrints) {
        for (const activate of [false, true]) {
          const state = createGameState({
            seed: 50_000 + cases,
            currentPlayerId: "p1",
            phase: "judgment",
            players: [
              {
                id: "p1",
                heroDefinitionId: hero.id,
                maxHp: 8,
                hp: 8,
                skillIds: [...hero.skillIds],
                hand: [
                  physical(STANDARD_CARD.lightning),
                  physical(STANDARD_CARD.indulgence),
                  physical(STANDARD_CARD.supplyShortage),
                  physical(STANDARD_CARD.slash),
                  physical(STANDARD_CARD.peach)
                ]
              },
              {
                id: "p2",
                heroDefinitionId: heroes[
                  (heroIndex + 1) % heroes.length
                ]!.id,
                maxHp: 4,
                hand: []
              }
            ],
            drawPile: [
              structuredClone(judgment),
              structuredClone(judgment),
              structuredClone(judgment),
              ...prints.slice(0, 12)
            ]
          });
          const delayedIds = state.zones[handZone("p1")]!.slice(0, 3);
          state.zones[handZone("p1")] =
            state.zones[handZone("p1")]!.slice(3);
          state.zones[judgmentZone("p1")] = delayedIds;
          for (const cardId of delayedIds) {
            state.cards[cardId]!.sourcePlayerId = "p2";
          }
          const session = new GameSession(state, registry);
          session.dispatch({ type: "advance-phase", playerId: "p1" });
          settleDecision(session, activate);
          const settled = session.state();
          expect(settled.phase).toBe("draw");
          expect(settled.zones[PROCESSING_ZONE]).toEqual([]);
          expect(settled.stack).toEqual([]);
          expect(settled.triggerQueue).toEqual([]);
          expect(settled.effectPlans).toEqual({});
          expect(() => serializeGameState(settled)).not.toThrow();
          judgments += settled.eventLog.filter(
            (event) =>
              event.type === "JudgmentResolved" &&
              event.delayedCardId !== undefined
          ).length;
          cases += 1;
        }
      }
    }
    expect(cases).toBe(49 * 52 * 2);
    expect(judgments).toBe(cases * 3);
  }, 120_000);
});
